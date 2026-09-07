import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Post, PostBlock, PostBlockType, PostKind, PostMedia } from '@prisma/client';
import {
  CursorPage,
  CursorPaginationDto,
  DEFAULT_PAGE_LIMIT,
} from '../common/dto/cursor-pagination.dto';
import { decodeCursor, encodeCursor } from '../common/pagination/cursor.util';
import { DOMAIN_EVENTS, PostCreatedEvent } from '../events/domain-events';
import { FilesService, LibraryAssetRef } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { CreateNoteDto, NoteBlockInputDto } from './dto/create-note.dto';
import { CreatePostDto, PostMediaInputDto } from './dto/create-post.dto';
import {
  PostBlockResponseDto,
  PostImageResponseDto,
  PostMediaResponseDto,
  PostResponseDto,
  ReorderResponseDto,
} from './dto/post-response.dto';
import { ReorderPostsDto } from './dto/reorder-posts.dto';
import { SavedPostItemDto } from './dto/save-response.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import {
  EMPTY_POST_INTERACTION,
  PostInteractionInfo,
  PostInteractionsService,
} from './post-interactions.service';
import { UserPublicView, UsersService } from '../users/users.service';
import { assertBlocksAreValid, deriveExcerpt, noteTextForTags } from './utils/note-blocks.util';
import { buildTags } from './utils/tags.util';

type PostWithRelations = Post & { media: PostMedia[]; blocks: PostBlock[] };

/** `include` compartido por toda consulta que arma un `Post`: siempre trae medios y bloques, ya
 * que una fila puede ser `MEDIA` (solo usa `media`) o `NOTE` (solo usa `blocks`) — nunca las dos.
 */
const POST_INCLUDE = {
  media: { orderBy: { order: 'asc' as const } },
  blocks: { orderBy: { position: 'asc' as const } },
};

/** Un candidato del home con su clave de orden ya calculada para este viewer. */
interface RankedPost {
  post: PostWithRelations;
  rankAt: Date;
}

/** Boost de 12 h a los favoritos en el stream de seguidos (v1 del algoritmo). */
const FAVORITE_BOOST_MS = 12 * 60 * 60 * 1000;

/** Una de cada 5 posiciones del home viene del stream de descubrimiento. */
const DISCOVERY_EVERY = 5;

/**
 * Cursor del home: la última entrada consumida de cada stream, `[rankAtISO, id]`.
 * `null` = ese stream aún no ha entregado nada y arranca desde el principio.
 */
interface HomeCursor {
  s: [string, string] | null;
  d: [string, string] | null;
}

function isHomeMark(value: unknown): value is [string, string] | null {
  return (
    value === null ||
    (Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string')
  );
}

function isHomeCursor(value: unknown): value is HomeCursor {
  const cursor = value as HomeCursor | null;
  return (
    cursor !== null && typeof cursor === 'object' && isHomeMark(cursor.s) && isHomeMark(cursor.d)
  );
}

/** Marca del cursor del feed propio: última posición e id consumidos. */
interface FeedCursor {
  p: number;
  id: string;
}

function isFeedCursor(value: unknown): value is FeedCursor {
  const cursor = value as FeedCursor | null;
  return typeof cursor?.p === 'number' && typeof cursor?.id === 'string';
}

/** Marca del cursor de `GET /api/me/saved`: última fecha e id consumidos. */
interface SavedCursor {
  c: string;
  id: string;
}

function isSavedCursor(value: unknown): value is SavedCursor {
  const cursor = value as SavedCursor | null;
  return typeof cursor?.c === 'string' && typeof cursor?.id === 'string';
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    // Ciclo real con `users` desde la Fase 4.5 (el perfil cuenta publicaciones, los posts
    // embeben a su autor): ver la nota de `PostsModule` y la desviación 5 de `ARCHITECTURE.md`.
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
    // Grafo del home (seguidos, favoritos, mutuos): dependencia de una sola dirección desde el
    // refactor que deshizo el ciclo de tres módulos de la Fase 4 — `social` ya no depende de
    // `posts` en absoluto, así que este borde no necesita `forwardRef`.
    private readonly socialService: SocialService,
    // Likes, guardados y comentarios de un post: mismo módulo, sin ciclo (`PostInteractionsService`
    // no depende de `PostsService`).
    private readonly postInteractions: PostInteractionsService,
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Publica. La publicación nueva entra **primera** (`position: 0`) y las demás bajan un
   * puesto: es el orden que el autor espera ver, y sigue siendo suyo — puede reordenarlo
   * cuando quiera con `PATCH /api/posts/reorder`.
   */
  async create(authorId: string, dto: CreatePostDto): Promise<PostResponseDto> {
    const tags = buildTags(dto.tags, dto.description);
    await this.assertMediaIsUsable(dto.media, authorId);

    const post = await this.prisma.$transaction(async (tx) => {
      // El contador de posición es propio de `MEDIA`: las notas no reordenan este feed (ver
      // "Notas — Fase 4.6" en `docs/API-CONTRACTS.md`), así que no deben desplazarse entre sí.
      await tx.post.updateMany({
        where: { authorId, kind: PostKind.MEDIA },
        data: { position: { increment: 1 } },
      });
      return tx.post.create({
        data: {
          authorId,
          kind: PostKind.MEDIA,
          description: dto.description ?? null,
          tags,
          position: 0,
          media: { create: toMediaRows(dto.media) },
        },
        include: POST_INCLUDE,
      });
    });

    this.eventEmitter.emit(DOMAIN_EVENTS.POST_CREATED, {
      postId: post.id,
      authorId,
      tags,
    } satisfies PostCreatedEvent);

    return this.toResponse(post, authorId);
  }

  /**
   * Crea una nota (Fase 4.6): un `Post` con `kind: NOTE`. No participa del contador de
   * `position` de `MEDIA` — se lista por `createdAt` (ver `findNotesByUsername`).
   */
  async createNote(authorId: string, dto: CreateNoteDto): Promise<PostResponseDto> {
    assertBlocksAreValid(dto.blocks);
    await this.assertNoteAssetsAreUsable(dto.coverFileAssetId, dto.blocks, authorId);
    const tags = buildTags(dto.tags, noteTextForTags(dto.title, dto.blocks));

    const post = await this.prisma.post.create({
      data: {
        authorId,
        kind: PostKind.NOTE,
        title: dto.title,
        tags,
        position: 0,
        coverFileAssetId: dto.coverFileAssetId ?? null,
        blocks: { create: toBlockRows(dto.blocks) },
      },
      include: POST_INCLUDE,
    });

    this.eventEmitter.emit(DOMAIN_EVENTS.POST_CREATED, {
      postId: post.id,
      authorId,
      tags,
    } satisfies PostCreatedEvent);

    return this.toResponse(post, authorId);
  }

  async findOne(id: string, viewerId: string): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!post) {
      throw new NotFoundException('Publicación no encontrada');
    }
    if (!(await this.usersService.canViewContentOf(post.authorId, viewerId))) {
      throw new ForbiddenException('Este perfil es privado');
    }
    return this.toResponse(post, viewerId);
  }

  /**
   * Feed propio de un usuario: sus publicaciones en el orden que él curó (`position` asc).
   * Filtra `kind: MEDIA` para que el tab Publicaciones no muestre notas — las notas tienen su
   * propio listado (`findNotesByUsername`).
   */
  async findByUsername(
    username: string,
    viewerId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<PostResponseDto>> {
    const author = await this.usersService.findByUsername(username);
    if (!author) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (!(await this.usersService.canViewContentOf(author.id, viewerId))) {
      throw new ForbiddenException('Este perfil es privado');
    }

    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor, isFeedCursor) : null;
    const posts = await this.prisma.post.findMany({
      where: {
        authorId: author.id,
        kind: PostKind.MEDIA,
        // `position` no es único: el desempate por `id` es lo que hace que la página siguiente
        // reanude exactamente donde terminó la anterior.
        ...(cursor
          ? { OR: [{ position: { gt: cursor.p } }, { position: cursor.p, id: { gt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: POST_INCLUDE,
    });

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    const last = page[page.length - 1];
    return {
      items: await this.toResponseList(page, viewerId),
      nextCursor: hasMore && last ? encodeCursor({ p: last.position, id: last.id }) : null,
    };
  }

  /**
   * Notas de un usuario (Fase 4.6), más recientes primero (`createdAt` desc, desempate `id`
   * desc) — a diferencia del feed propio, las notas no tienen orden curado. Misma regla de
   * visibilidad que `findByUsername`.
   */
  async findNotesByUsername(
    username: string,
    viewerId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<PostResponseDto>> {
    const author = await this.usersService.findByUsername(username);
    if (!author) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (!(await this.usersService.canViewContentOf(author.id, viewerId))) {
      throw new ForbiddenException('Este perfil es privado');
    }

    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor, isSavedCursor) : null;
    const notes = await this.prisma.post.findMany({
      where: {
        authorId: author.id,
        kind: PostKind.NOTE,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.c) } },
                { createdAt: new Date(cursor.c), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: POST_INCLUDE,
    });

    const hasMore = notes.length > limit;
    const page = hasMore ? notes.slice(0, limit) : notes;
    const last = page[page.length - 1];
    return {
      items: await this.toResponseList(page, viewerId),
      nextCursor:
        hasMore && last ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  async update(id: string, authorId: string, dto: UpdatePostDto): Promise<PostResponseDto> {
    const current = await this.findOwnedOrFail(id, authorId);
    // El cuerpo de una nota es otro (`blocks`, no `media`): `PATCH /api/posts/notes/:id` es su
    // endpoint propio. Este solo rechaza el caso mixto explícito en `docs/API-CONTRACTS.md`.
    if (dto.media !== undefined && current.kind !== PostKind.MEDIA) {
      throw new BadRequestException('Esta publicación no acepta medios: es una nota');
    }

    const description = dto.description !== undefined ? dto.description : current.description;
    // Si cambia la descripción, sus `#hashtags` se vuelven a fusionar aunque el cliente no
    // mande `tags`: las etiquetas son el resultado de ambas cosas, no un campo suelto.
    const tags =
      dto.tags !== undefined || dto.description !== undefined
        ? buildTags(dto.tags ?? current.tags, description)
        : current.tags;

    if (dto.media !== undefined) {
      await this.assertMediaIsUsable(dto.media, authorId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.media !== undefined) {
        // `media` reemplaza la lista completa: borrar y recrear mantiene `order` alineado con
        // el arreglo que mandó el cliente sin diffs frágiles.
        await tx.postMedia.deleteMany({ where: { postId: id } });
      }
      return tx.post.update({
        where: { id },
        data: {
          description: description ?? null,
          tags,
          ...(dto.media !== undefined ? { media: { create: toMediaRows(dto.media) } } : {}),
        },
        include: POST_INCLUDE,
      });
    });

    return this.toResponse(updated, authorId);
  }

  /**
   * Edita una nota. `blocks` presente reemplaza la lista completa (no hay deltas), igual que
   * `media` en publicaciones. Si cambia `title` o `blocks`, las etiquetas se recalculan aunque
   * el cliente no mande `tags` — mismo criterio que `update()`.
   */
  async updateNote(id: string, authorId: string, dto: UpdateNoteDto): Promise<PostResponseDto> {
    const current = await this.findOwnedOrFail(id, authorId);
    if (current.kind !== PostKind.NOTE) {
      throw new BadRequestException('Esta publicación no es una nota');
    }
    if (dto.blocks !== undefined) {
      assertBlocksAreValid(dto.blocks);
    }
    await this.assertNoteAssetsAreUsable(
      dto.coverFileAssetId ?? undefined,
      dto.blocks ?? [],
      authorId,
    );

    const title = dto.title ?? current.title!;
    const blocksForTags: { text?: string | null }[] = dto.blocks ?? current.blocks;
    const tags =
      dto.tags !== undefined || dto.title !== undefined || dto.blocks !== undefined
        ? buildTags(dto.tags ?? current.tags, noteTextForTags(title, blocksForTags))
        : current.tags;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.blocks !== undefined) {
        // `blocks` reemplaza la lista completa: borrar y recrear mantiene `position` alineado
        // con el arreglo del cliente sin diffs frágiles, igual que `media` en publicaciones.
        await tx.postBlock.deleteMany({ where: { postId: id } });
      }
      return tx.post.update({
        where: { id },
        data: {
          title,
          tags,
          coverFileAssetId:
            dto.coverFileAssetId !== undefined ? dto.coverFileAssetId : current.coverFileAssetId,
          ...(dto.blocks !== undefined ? { blocks: { create: toBlockRows(dto.blocks) } } : {}),
        },
        include: POST_INCLUDE,
      });
    });

    return this.toResponse(updated, authorId);
  }

  /**
   * Borra la publicación (sus `post_media` caen por cascada; los archivos siguen en la
   * biblioteca). Las posiciones restantes conservan su orden relativo aunque quede un hueco
   * en la numeración: el orden es lo que importa, no que los índices sean consecutivos.
   */
  async remove(id: string, authorId: string): Promise<void> {
    await this.findOwnedOrFail(id, authorId);
    await this.prisma.post.delete({ where: { id } });
  }

  /**
   * Reordena el feed propio con la lista **completa** de ids. El conjunto debe coincidir
   * exactamente con las publicaciones del usuario; si no, `400` (ver `API-CONTRACTS.md`).
   */
  async reorder(authorId: string, dto: ReorderPostsDto): Promise<ReorderResponseDto> {
    // Solo `MEDIA`: si `orderedIds` trae el id de una nota, no aparece en `ownedIds` y la
    // comprobación de abajo falla con el mismo 400 — es justo el rechazo que pide el contrato.
    const owned = await this.prisma.post.findMany({
      where: { authorId, kind: PostKind.MEDIA },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((post) => post.id));
    const requestedIds = new Set(dto.orderedIds);

    const matchesExactly =
      requestedIds.size === dto.orderedIds.length &&
      requestedIds.size === ownedIds.size &&
      [...requestedIds].every((id) => ownedIds.has(id));
    if (!matchesExactly) {
      throw new BadRequestException(
        'orderedIds debe contener exactamente una vez cada publicación tuya',
      );
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.post.update({ where: { id }, data: { position: index } }),
      ),
    );
    return { reordered: true };
  }

  /**
   * Home feed **v1** (Fase 3), exactamente como lo especifica `docs/API-CONTRACTS.md`:
   * dos streams de candidatos —seguidos (S) y descubrimiento (D)—, `rankAt` = `createdAt` con
   * **+12 h a los favoritos** en S, orden `rankAt` desc con desempate `id` desc, y una mezcla
   * 4:1 (cada posición múltiplo de 5 viene de D). Determinista: mismo viewer y mismo cursor
   * dan la misma página. La afinidad (v2) llega en la Fase 5 y no cambia ni la respuesta ni el
   * cursor.
   */
  async getHomeFeed(
    viewerId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<PostResponseDto>> {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor, isHomeCursor) : null;

    const [followedIds, favoriteIds, mutualIds] = await Promise.all([
      this.socialService.getFollowedIds(viewerId),
      this.socialService.getFavoriteIds(viewerId),
      this.socialService.getMutualIds(viewerId),
    ]);

    // Visibilidad (regla de `social`): de los seguidos, se ven los públicos y los de follow
    // mutuo. Un seguido privado que no me sigue de vuelta no aporta nada al home.
    const publicFollowed = await this.usersService.filterPublicIds(followedIds);
    const visibleFollowed = new Set([...publicFollowed, ...mutualIds]);
    const favorites = favoriteIds.filter((id) => visibleFollowed.has(id));
    const plain = [...visibleFollowed].filter((id) => !favorites.includes(id));

    // Descubrimiento: perfiles públicos que el viewer no sigue (ni él mismo).
    const discoveryIds = await this.usersService.findPublicUserIds([viewerId, ...followedIds]);

    const [boosted, unboosted, discovery] = await Promise.all([
      this.fetchRanked(favorites, FAVORITE_BOOST_MS, cursor?.s ?? null, limit),
      this.fetchRanked(plain, 0, cursor?.s ?? null, limit),
      this.fetchRanked(discoveryIds, 0, cursor?.d ?? null, limit),
    ]);

    // S es la unión de favoritos (con boost) y no favoritos, reordenada por `rankAt`.
    const following = [...boosted, ...unboosted].sort(compareRanked).slice(0, limit + 1);

    const items: RankedPost[] = [];
    let sIndex = 0;
    let dIndex = 0;
    for (let position = 1; position <= limit; position += 1) {
      const preferDiscovery = position % DISCOVERY_EVERY === 0;
      const takeFrom = (fromDiscovery: boolean) =>
        fromDiscovery ? discovery[dIndex] : following[sIndex];

      let fromDiscovery = preferDiscovery;
      let next = takeFrom(fromDiscovery);
      if (!next) {
        // Si el stream que toca se agotó, la posición la llena el otro.
        fromDiscovery = !preferDiscovery;
        next = takeFrom(fromDiscovery);
      }
      if (!next) break;

      if (fromDiscovery) dIndex += 1;
      else sIndex += 1;
      items.push(next);
    }

    const lastS = sIndex > 0 ? following[sIndex - 1] : undefined;
    const lastD = dIndex > 0 ? discovery[dIndex - 1] : undefined;
    const hasMore = following.length > sIndex || discovery.length > dIndex;
    const nextCursor = hasMore
      ? encodeCursor({
          // Si un stream no aportó nada en esta página, conserva su marca anterior para no
          // reiniciarlo desde el principio en la siguiente.
          s: lastS ? markOf(lastS) : (cursor?.s ?? null),
          d: lastD ? markOf(lastD) : (cursor?.d ?? null),
        } satisfies HomeCursor)
      : null;

    return {
      items: await this.toResponseList(
        items.map((item) => item.post),
        viewerId,
      ),
      nextCursor,
    };
  }

  /**
   * Candidatos de un stream: posts de esos autores, más nuevos primero, reanudando después de
   * la marca del cursor. `boostMs` desplaza el `rankAt` (los favoritos flotan 12 h), y por eso
   * la marca se traduce a `createdAt` restándolo antes de comparar.
   */
  private async fetchRanked(
    authorIds: string[],
    boostMs: number,
    mark: [string, string] | null,
    limit: number,
  ): Promise<RankedPost[]> {
    if (authorIds.length === 0) return [];

    const after = mark ? new Date(new Date(mark[0]).getTime() - boostMs) : null;
    const posts = await this.prisma.post.findMany({
      where: {
        authorId: { in: authorIds },
        ...(after && mark
          ? { OR: [{ createdAt: { lt: after } }, { createdAt: after, id: { lt: mark[1] } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: POST_INCLUDE,
    });

    return posts.map((post) => ({
      post,
      rankAt: new Date(post.createdAt.getTime() + boostMs),
    }));
  }

  /** Guardados del usuario, más recientes primero, con el `Post` completo embebido. */
  async listSaved(
    userId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<SavedPostItemDto>> {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor, isSavedCursor) : null;
    const rows = await this.prisma.savedPost.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.c) } },
                { createdAt: new Date(cursor.c), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    // El `Post` completo (medios firmados, contadores…) se arma con `findManyByIdsForViewer`:
    // la fila de `saved_posts` solo tiene el `postId`.
    const posts = await this.findManyByIdsForViewer(
      page.map((row) => row.postId),
      userId,
    );

    return {
      items: page.flatMap((row): SavedPostItemDto[] => {
        const post = posts.get(row.postId);
        return post ? [{ post, savedAt: row.createdAt }] : [];
      }),
      nextCursor:
        hasMore && last ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  /**
   * Varios posts por id, ya armados como `PostResponseDto` para este viewer. La usa `listSaved`:
   * la fila de guardado solo tiene el `postId`, y este método es el que sabe construir la forma
   * completa de `Post` (medios firmados, contadores…).
   */
  async findManyByIdsForViewer(
    ids: string[],
    viewerId: string,
  ): Promise<Map<string, PostResponseDto>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const posts = await this.prisma.post.findMany({
      where: { id: { in: unique } },
      include: POST_INCLUDE,
    });
    const responses = await this.toResponseList(posts, viewerId);
    return new Map(responses.map((post) => [post.id, post]));
  }

  /**
   * Cuántas publicaciones de un `kind` tiene cada autor, en una sola consulta agrupada. Lo
   * consume `users` dos veces (`MEDIA` para `postsCount`, `NOTE` para `notesCount`) para la
   * cabecera de perfil: el conteo es un dato de **este** dominio, así que `users` lo pide por
   * servicio en vez de contar la tabla `posts` por su cuenta (regla 7 de `AGENTS.md`). Los
   * autores sin filas de ese `kind` no salen en el `groupBy`; quien llama resuelve la ausencia
   * como `0`.
   */
  async countByAuthorIds(authorIds: string[], kind: PostKind): Promise<Map<string, number>> {
    const unique = [...new Set(authorIds)];
    if (unique.length === 0) return new Map();
    const grouped = await this.prisma.post.groupBy({
      by: ['authorId'],
      where: { authorId: { in: unique }, kind },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.authorId, row._count._all]));
  }

  private async findOwnedOrFail(id: string, authorId: string): Promise<PostWithRelations> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!post) {
      throw new NotFoundException('Publicación no encontrada');
    }
    if (post.authorId !== authorId) {
      throw new ForbiddenException('Esta publicación no es tuya');
    }
    return post;
  }

  /**
   * Los medios deben ser archivos **de la biblioteca del autor** y no repetirse dentro de la
   * misma publicación (la base lo garantiza con un índice único; aquí se responde 400 claro).
   */
  private async assertMediaIsUsable(media: PostMediaInputDto[], authorId: string): Promise<void> {
    const ids = media.map((item) => item.fileAssetId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('No repitas el mismo archivo en una publicación');
    }
    await this.filesService.findOwnedByUser(ids, authorId);
  }

  /**
   * La portada y las imágenes de bloques `IMAGE` de una nota deben ser archivos **de tipo
   * IMAGE** de la biblioteca del autor (404/403 los resuelve `findOwnedByUser`; el tipo se
   * valida aquí porque es una regla propia de notas, no de la biblioteca en general).
   */
  private async assertNoteAssetsAreUsable(
    coverFileAssetId: string | null | undefined,
    blocks: NoteBlockInputDto[],
    authorId: string,
  ): Promise<void> {
    const imageBlockIds = blocks
      .filter((block) => block.type === PostBlockType.IMAGE)
      .map((block) => block.fileAssetId!);
    const ids = [...imageBlockIds, ...(coverFileAssetId ? [coverFileAssetId] : [])];
    if (ids.length === 0) return;

    const assets = await this.filesService.findOwnedByUser(ids, authorId);
    const nonImage = assets.some((asset) => asset.type !== 'IMAGE');
    if (nonImage) {
      throw new BadRequestException('La portada y las imágenes de bloques deben ser de tipo IMAGE');
    }
  }

  private async toResponse(post: PostWithRelations, viewerId: string): Promise<PostResponseDto> {
    const [response] = await this.toResponseList([post], viewerId);
    return response;
  }

  private async toResponseList(
    posts: PostWithRelations[],
    viewerId: string,
  ): Promise<PostResponseDto[]> {
    if (posts.length === 0) {
      return [];
    }
    const [authors, interactions] = await Promise.all([
      this.usersService.getPublicViewsByIds(
        posts.map((post) => post.authorId),
        viewerId,
      ),
      // Likes, guardados y comentarios en una sola pasada agregada para toda la página, no
      // consulta por consulta — mismo criterio que `UsersService.getPublicViewsByIds`.
      this.postInteractions.getInteractionInfoFor(
        posts.map((post) => post.id),
        viewerId,
      ),
    ]);
    const assetIds = [
      ...posts.flatMap((post) => post.media.map((item) => item.fileAssetId)),
      ...posts.flatMap((post) =>
        post.blocks.flatMap((block) => (block.fileAssetId ? [block.fileAssetId] : [])),
      ),
      ...posts.flatMap((post) => (post.coverFileAssetId ? [post.coverFileAssetId] : [])),
    ];
    const assets = new Map(
      (await this.filesService.findManyByIds(assetIds)).map((asset) => [asset.id, asset]),
    );

    return Promise.all(
      posts.map((post) => this.buildPostView(post, viewerId, authors, assets, interactions)),
    );
  }

  private async buildPostView(
    post: PostWithRelations,
    viewerId: string,
    authors: Map<string, UserPublicView>,
    assets: Map<string, LibraryAssetRef>,
    interactions: Map<string, PostInteractionInfo>,
  ): Promise<PostResponseDto> {
    const author = authors.get(post.authorId);
    if (!author) {
      throw new NotFoundException('Autor no encontrado');
    }

    const isAuthor = post.authorId === viewerId;
    const interaction = interactions.get(post.id) ?? EMPTY_POST_INTERACTION;
    const base = {
      id: post.id,
      kind: post.kind,
      author,
      description: post.description,
      tags: post.tags,
      createdAt: post.createdAt,
      viewerHasLiked: interaction.viewerHasLiked,
      viewerHasSaved: interaction.viewerHasSaved,
      ...(isAuthor ? { likeCount: interaction.likeCount } : {}),
      commentCount: interaction.commentCount,
    };

    if (post.kind === PostKind.NOTE) {
      const blocks = await Promise.all(
        post.blocks.map((block) => this.buildBlockView(block, assets)),
      );
      const cover = post.coverFileAssetId
        ? await this.buildAssetView(assets.get(post.coverFileAssetId))
        : null;
      return {
        ...base,
        title: post.title ?? '',
        excerpt: deriveExcerpt(post.blocks),
        cover,
        blocks,
      };
    }

    const media = await Promise.all(
      post.media
        .filter((item) => assets.has(item.fileAssetId))
        .map((item) => this.buildMediaView(item, assets.get(item.fileAssetId)!)),
    );
    return { ...base, position: post.position, media };
  }

  private async buildBlockView(
    block: PostBlock,
    assets: Map<string, LibraryAssetRef>,
  ): Promise<PostBlockResponseDto> {
    const image = block.fileAssetId
      ? await this.buildAssetView(assets.get(block.fileAssetId))
      : null;
    return {
      position: block.position,
      type: block.type,
      text: block.text,
      caption: block.caption,
      image,
    };
  }

  /** Firma una imagen suelta (portada de nota o imagen de un bloque) sin el `id`/`order` que sí
   * necesita `PostMediaResponseDto`. */
  private async buildAssetView(asset?: LibraryAssetRef): Promise<PostImageResponseDto | null> {
    if (!asset) return null;
    const expiresIn = this.configService.get<number>('s3.signedUrlExpiresIn') ?? 300;
    const url = await this.storageService.getSignedDownloadUrl(asset.key, expiresIn);
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      width: asset.width,
      height: asset.height,
    };
  }

  private async buildMediaView(
    media: PostMedia,
    asset: LibraryAssetRef,
  ): Promise<PostMediaResponseDto> {
    const expiresIn = this.configService.get<number>('s3.signedUrlExpiresIn') ?? 300;
    const url = await this.storageService.getSignedDownloadUrl(asset.key, expiresIn);
    return {
      id: media.id,
      order: media.order,
      type: asset.type,
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      // Las dimensiones son del archivo de biblioteca; lo que el cliente mande al publicar
      // manda por encima (útil si alguna vez recorta un medio al publicarlo).
      width: media.width ?? asset.width,
      height: media.height ?? asset.height,
    };
  }
}

/** Orden del home: `rankAt` desc, desempate por `id` desc. */
function compareRanked(a: RankedPost, b: RankedPost): number {
  const byRank = b.rankAt.getTime() - a.rankAt.getTime();
  return byRank !== 0 ? byRank : b.post.id.localeCompare(a.post.id);
}

function markOf(item: RankedPost): [string, string] {
  return [item.rankAt.toISOString(), item.post.id];
}

/** Filas de `post_media` a partir del arreglo del cliente: el índice **es** el orden. */
function toMediaRows(media: PostMediaInputDto[]) {
  return media.map((item, index) => ({
    fileAssetId: item.fileAssetId,
    order: index,
    width: item.width ?? null,
    height: item.height ?? null,
  }));
}

/** Filas de `post_blocks` a partir del arreglo del cliente: el índice **es** `position`. */
function toBlockRows(blocks: NoteBlockInputDto[]) {
  return blocks.map((block, index) => ({
    position: index,
    type: block.type,
    text: block.text ?? null,
    fileAssetId: block.fileAssetId ?? null,
    caption: block.caption ?? null,
  }));
}
