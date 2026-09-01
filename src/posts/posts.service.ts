import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Post, PostMedia } from '@prisma/client';
import {
  CursorPage,
  CursorPaginationDto,
  DEFAULT_PAGE_LIMIT,
} from '../common/dto/cursor-pagination.dto';
import { decodeCursor, encodeCursor } from '../common/pagination/cursor.util';
import { DOMAIN_EVENTS, PostCreatedEvent } from '../events/domain-events';
import { FilesService, LibraryAssetRef } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { CreatePostDto, PostMediaInputDto } from './dto/create-post.dto';
import { PostMediaResponseDto, PostResponseDto, ReorderResponseDto } from './dto/post-response.dto';
import { ReorderPostsDto } from './dto/reorder-posts.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { UserPublicView, UsersService } from '../users/users.service';
import { buildTags } from './utils/tags.util';

type PostWithMedia = Post & { media: PostMedia[] };

/** Marca del cursor del feed propio: última posición e id consumidos. */
interface FeedCursor {
  p: number;
  id: string;
}

function isFeedCursor(value: unknown): value is FeedCursor {
  const cursor = value as FeedCursor | null;
  return typeof cursor?.p === 'number' && typeof cursor?.id === 'string';
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
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
      await tx.post.updateMany({ where: { authorId }, data: { position: { increment: 1 } } });
      return tx.post.create({
        data: {
          authorId,
          description: dto.description ?? null,
          tags,
          position: 0,
          media: { create: toMediaRows(dto.media) },
        },
        include: { media: { orderBy: { order: 'asc' } } },
      });
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
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (!post) {
      throw new NotFoundException('Publicación no encontrada');
    }
    if (!(await this.usersService.canViewContentOf(post.authorId, viewerId))) {
      throw new ForbiddenException('Este perfil es privado');
    }
    return this.toResponse(post, viewerId);
  }

  /** Feed propio de un usuario: sus publicaciones en el orden que él curó (`position` asc). */
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
        // `position` no es único: el desempate por `id` es lo que hace que la página siguiente
        // reanude exactamente donde terminó la anterior.
        ...(cursor
          ? { OR: [{ position: { gt: cursor.p } }, { position: cursor.p, id: { gt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: { media: { orderBy: { order: 'asc' } } },
    });

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    const last = page[page.length - 1];
    return {
      items: await this.toResponseList(page, viewerId),
      nextCursor: hasMore && last ? encodeCursor({ p: last.position, id: last.id }) : null,
    };
  }

  async update(id: string, authorId: string, dto: UpdatePostDto): Promise<PostResponseDto> {
    const current = await this.findOwnedOrFail(id, authorId);

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
        include: { media: { orderBy: { order: 'asc' } } },
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
    const owned = await this.prisma.post.findMany({
      where: { authorId },
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

  private async findOwnedOrFail(id: string, authorId: string): Promise<PostWithMedia> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { media: { orderBy: { order: 'asc' } } },
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

  private async toResponse(post: PostWithMedia, viewerId: string): Promise<PostResponseDto> {
    const [response] = await this.toResponseList([post], viewerId);
    return response;
  }

  private async toResponseList(
    posts: PostWithMedia[],
    viewerId: string,
  ): Promise<PostResponseDto[]> {
    if (posts.length === 0) {
      return [];
    }
    const authors = await this.usersService.getPublicViewsByIds(
      posts.map((post) => post.authorId),
      viewerId,
    );
    const assetIds = posts.flatMap((post) => post.media.map((item) => item.fileAssetId));
    const assets = new Map(
      (await this.filesService.findManyByIds(assetIds)).map((asset) => [asset.id, asset]),
    );

    return Promise.all(posts.map((post) => this.buildPostView(post, viewerId, authors, assets)));
  }

  private async buildPostView(
    post: PostWithMedia,
    viewerId: string,
    authors: Map<string, UserPublicView>,
    assets: Map<string, LibraryAssetRef>,
  ): Promise<PostResponseDto> {
    const author = authors.get(post.authorId);
    if (!author) {
      throw new NotFoundException('Autor no encontrado');
    }

    const media = await Promise.all(
      post.media
        .filter((item) => assets.has(item.fileAssetId))
        .map((item) => this.buildMediaView(item, assets.get(item.fileAssetId)!)),
    );

    const isAuthor = post.authorId === viewerId;
    return {
      id: post.id,
      author,
      description: post.description,
      tags: post.tags,
      position: post.position,
      createdAt: post.createdAt,
      media,
      // Likes, guardados y comentarios llegan en la Fase 4: hoy el valor real es cero/falso
      // para todos, no un marcador de posición.
      viewerHasLiked: false,
      viewerHasSaved: false,
      ...(isAuthor ? { likeCount: 0 } : {}),
      commentCount: 0,
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
      width: media.width,
      height: media.height,
    };
  }
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
