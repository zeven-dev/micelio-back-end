import {
  BadRequestException,
  forwardRef,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Comment } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CursorPage,
  CursorPaginationDto,
  DEFAULT_PAGE_LIMIT,
} from '../common/dto/cursor-pagination.dto';
import { decodeCursor, encodeCursor } from '../common/pagination/cursor.util';
import {
  CommentCreatedEvent,
  DOMAIN_EVENTS,
  PostLikedEvent,
  PostSavedEvent,
  PostUnlikedEvent,
  PostUnsavedEvent,
  UserFollowedEvent,
} from '../events/domain-events';
import { PostRef, PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserPublicView, UsersService } from '../users/users.service';
import { CommentDto } from './dto/comment.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { FollowStateDto, FollowerItemDto, FollowingItemDto } from './dto/follow-response.dto';
import { LikeListItemDto, LikeListResponseDto, LikeStateDto } from './dto/like-response.dto';
import { SaveStateDto, SavedPostItemDto } from './dto/save-response.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

/** Lo que el grafo social aporta a `UserPublic`. `users` lo pide para cada perfil que arma. */
export interface SocialGraphInfo {
  followersCount: number;
  followingCount: number;
  viewerFollows: boolean;
  followsViewer: boolean;
}

const EMPTY_GRAPH: SocialGraphInfo = {
  followersCount: 0,
  followingCount: 0,
  viewerFollows: false,
  followsViewer: false,
};

/** Lo que `posts` necesita de `social` para armar `viewerHasLiked/viewerHasSaved/likeCount/commentCount`. */
export interface PostInteractionInfo {
  viewerHasLiked: boolean;
  viewerHasSaved: boolean;
  likeCount: number;
  commentCount: number;
}

export const EMPTY_POST_INTERACTION: PostInteractionInfo = {
  viewerHasLiked: false,
  viewerHasSaved: false,
  likeCount: 0,
  commentCount: 0,
};

/** Marca del cursor de los listados del grafo: última fecha e id consumidos. */
interface FollowCursor {
  c: string;
  id: string;
}

function isFollowCursor(value: unknown): value is FollowCursor {
  const cursor = value as FollowCursor | null;
  return typeof cursor?.c === 'string' && typeof cursor?.id === 'string';
}

// Likes, guardados y comentarios paginan igual que el grafo social: `(createdAt, id)`
// codificado en el mismo cursor opaco. `FollowCursor`/`isFollowCursor` se reutilizan tal cual
// (el nombre quedó corto para lo que ya cubre, pero renombrarlo no cambia nada más).

/**
 * Grafo social: seguir, dejar de seguir, favoritos y la **regla de visibilidad** del proyecto.
 *
 * `social` y `users` se necesitan mutuamente por definición (el perfil muestra conteos del
 * grafo; el grafo resuelve usernames y arma vistas de usuario), así que se inyectan con
 * `forwardRef`. El cruce sigue siendo por servicio público, como exige `ARCHITECTURE.md`; lo
 * que no se hace nunca es consultar las tablas del otro dominio con Prisma.
 */
@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
    // Like/save/comment necesitan el post (autor, etiquetas, visibilidad): ciclo real con
    // `posts`, mismo criterio que el de `users` arriba. Ver la nota en `PostsModule`.
    @Inject(forwardRef(() => PostsService)) private readonly postsService: PostsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * **Regla de visibilidad, única en todo el proyecto** (decisión de producto #6): el contenido
   * de un perfil se ve si es el propio, si el perfil es público, o si hay **follow mutuo**.
   * Esta variante recibe la relación ya cargada para no repetir consultas cuando quien llama
   * ya la tiene (p. ej. al armar varios `UserPublic` de un golpe).
   */
  canViewWithGraph(
    owner: { id: string; isPublic: boolean },
    viewerId: string | undefined,
    graph: Pick<SocialGraphInfo, 'viewerFollows' | 'followsViewer'>,
  ): boolean {
    if (viewerId !== undefined && viewerId === owner.id) return true;
    if (owner.isPublic) return true;
    return graph.viewerFollows && graph.followsViewer;
  }

  /** La misma regla cuando quien llama no tiene la relación cargada. */
  async canView(owner: { id: string; isPublic: boolean }, viewerId?: string): Promise<boolean> {
    if (viewerId !== undefined && viewerId === owner.id) return true;
    if (owner.isPublic) return true;
    if (viewerId === undefined) return false;
    return this.areMutual(viewerId, owner.id);
  }

  async areMutual(a: string, b: string): Promise<boolean> {
    const edges = await this.prisma.follow.count({
      where: {
        OR: [
          { followerId: a, followedId: b },
          { followerId: b, followedId: a },
        ],
      },
    });
    return edges === 2;
  }

  /**
   * Conteos y relación con el viewer de varios usuarios de una sola vez: cuatro consultas
   * agregadas en total, no cuatro por usuario.
   */
  async getGraphInfoFor(
    userIds: string[],
    viewerId?: string,
  ): Promise<Map<string, SocialGraphInfo>> {
    const ids = [...new Set(userIds)];
    const info = new Map<string, SocialGraphInfo>(ids.map((id) => [id, { ...EMPTY_GRAPH }]));
    if (ids.length === 0) return info;

    const [followers, following, viewerFollows, followsViewer] = await Promise.all([
      this.prisma.follow.groupBy({
        by: ['followedId'],
        where: { followedId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.follow.groupBy({
        by: ['followerId'],
        where: { followerId: { in: ids } },
        _count: { _all: true },
      }),
      viewerId === undefined
        ? []
        : this.prisma.follow.findMany({
            where: { followerId: viewerId, followedId: { in: ids } },
            select: { followedId: true },
          }),
      viewerId === undefined
        ? []
        : this.prisma.follow.findMany({
            where: { followedId: viewerId, followerId: { in: ids } },
            select: { followerId: true },
          }),
    ]);

    for (const row of followers) {
      const entry = info.get(row.followedId);
      if (entry) entry.followersCount = row._count._all;
    }
    for (const row of following) {
      const entry = info.get(row.followerId);
      if (entry) entry.followingCount = row._count._all;
    }
    for (const row of viewerFollows) {
      const entry = info.get(row.followedId);
      if (entry) entry.viewerFollows = true;
    }
    for (const row of followsViewer) {
      const entry = info.get(row.followerId);
      if (entry) entry.followsViewer = true;
    }
    return info;
  }

  /** Ids que `userId` sigue. Lo usa el home feed para armar su stream de seguidos. */
  async getFollowedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followedId: true },
    });
    return rows.map((row) => row.followedId);
  }

  /** Ids que `userId` marcó como favoritos (subconjunto de los seguidos). */
  async getFavoriteIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId, isFavorite: true },
      select: { followedId: true },
    });
    return rows.map((row) => row.followedId);
  }

  /** Ids con follow mutuo: los únicos perfiles privados cuyo contenido ve `userId`. */
  async getMutualIds(userId: string): Promise<string[]> {
    const [followed, followers] = await Promise.all([
      this.getFollowedIds(userId),
      this.prisma.follow.findMany({
        where: { followedId: userId },
        select: { followerId: true },
      }),
    ]);
    const followerIds = new Set(followers.map((row) => row.followerId));
    return followed.filter((id) => followerIds.has(id));
  }

  async follow(followerId: string, username: string): Promise<FollowStateDto> {
    const target = await this.requireTarget(followerId, username);

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followedId: { followerId, followedId: target.id } },
    });
    if (existing) {
      // Idempotente: volver a seguir no duplica la arista ni vuelve a notificar.
      return { following: true, isFavorite: existing.isFavorite };
    }

    const created = await this.prisma.follow.create({
      data: { followerId, followedId: target.id },
    });
    this.eventEmitter.emit(DOMAIN_EVENTS.USER_FOLLOWED, {
      followerId,
      followedId: target.id,
    } satisfies UserFollowedEvent);

    return { following: true, isFavorite: created.isFavorite };
  }

  async unfollow(followerId: string, username: string): Promise<FollowStateDto> {
    const target = await this.requireTarget(followerId, username);
    // `deleteMany` y no `delete`: dejar de seguir a quien no sigues no es un error.
    await this.prisma.follow.deleteMany({ where: { followerId, followedId: target.id } });
    return { following: false };
  }

  async setFavorite(
    followerId: string,
    username: string,
    isFavorite: boolean,
  ): Promise<FollowStateDto> {
    const target = await this.requireTarget(followerId, username);
    const updated = await this.prisma.follow.updateMany({
      where: { followerId, followedId: target.id },
      data: { isFavorite },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Solo puedes marcar como favorito a alguien que sigues');
    }
    return { following: true, isFavorite };
  }

  /** A quién sigue el usuario, con su marca de favorito. Más recientes primero. */
  async listFollowing(
    userId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<FollowingItemDto>> {
    const { rows, nextCursor } = await this.pageOfFollows({ followerId: userId }, query);
    const views = await this.usersService.getPublicViewsByIds(
      rows.map((row) => row.followedId),
      userId,
    );
    return {
      items: rows.flatMap((row) => {
        const user = views.get(row.followedId);
        return user ? [{ user, isFavorite: row.isFavorite, since: row.createdAt }] : [];
      }),
      nextCursor,
    };
  }

  /** Quiénes lo siguen. Sin `isFavorite`: esa marca es de quien sigue, no de quien es seguido. */
  async listFollowers(
    userId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<FollowerItemDto>> {
    const { rows, nextCursor } = await this.pageOfFollows({ followedId: userId }, query);
    const views = await this.usersService.getPublicViewsByIds(
      rows.map((row) => row.followerId),
      userId,
    );
    return {
      items: rows.flatMap((row) => {
        const user = views.get(row.followerId);
        return user ? [{ user, since: row.createdAt }] : [];
      }),
      nextCursor,
    };
  }

  private async pageOfFollows(
    where: { followerId?: string; followedId?: string },
    query: CursorPaginationDto,
  ) {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor, isFollowCursor) : null;
    const rows = await this.prisma.follow.findMany({
      where: {
        ...where,
        // `createdAt` no es único: el desempate por `id` es lo que hace que la página
        // siguiente reanude exactamente donde terminó la anterior.
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
    return {
      rows: page,
      nextCursor:
        hasMore && last ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  private async requireTarget(followerId: string, username: string) {
    const target = await this.usersService.findByUsername(username);
    if (!target) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (target.id === followerId) {
      throw new BadRequestException('No puedes seguirte a ti mismo');
    }
    return target;
  }

  // ---------------------------------------------------------------------------------------
  // Likes, guardados y comentarios (Fase 4). El post en sí no es de este dominio: `requirePost`
  // / `requireVisiblePost` lo piden a `PostsService.getPostRef` (nunca a Prisma directo, regla
  // 7) y aplican la misma regla de visibilidad que `GET /api/posts/:id` vía
  // `UsersService.canViewContentOf`.
  // ---------------------------------------------------------------------------------------

  private async requirePost(postId: string): Promise<PostRef> {
    const post = await this.postsService.getPostRef(postId);
    if (!post) {
      throw new NotFoundException('Publicación no encontrada');
    }
    return post;
  }

  private async requireVisiblePost(postId: string, viewerId: string): Promise<PostRef> {
    const post = await this.requirePost(postId);
    if (!(await this.usersService.canViewContentOf(post.authorId, viewerId))) {
      throw new ForbiddenException('Este perfil es privado');
    }
    return post;
  }

  /**
   * `viewerHasLiked/viewerHasSaved/likeCount/commentCount` de varios posts a la vez —
   * `posts` la llama para armar `PostResponseDto`, en una sola pasada agregada por página
   * (mismo criterio que `getGraphInfoFor`), nunca consultando `likes`/`saved_posts`/`comments`
   * por su cuenta (regla 7).
   */
  async getInteractionInfoFor(
    postIds: string[],
    viewerId: string,
  ): Promise<Map<string, PostInteractionInfo>> {
    const ids = [...new Set(postIds)];
    const info = new Map<string, PostInteractionInfo>(
      ids.map((id) => [id, { ...EMPTY_POST_INTERACTION }]),
    );
    if (ids.length === 0) return info;

    const [likeCounts, commentCounts, viewerLikes, viewerSaves] = await Promise.all([
      this.prisma.like.groupBy({
        by: ['postId'],
        where: { postId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.comment.groupBy({
        by: ['postId'],
        where: { postId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.like.findMany({
        where: { postId: { in: ids }, userId: viewerId },
        select: { postId: true },
      }),
      this.prisma.savedPost.findMany({
        where: { postId: { in: ids }, userId: viewerId },
        select: { postId: true },
      }),
    ]);

    for (const row of likeCounts) {
      const entry = info.get(row.postId);
      if (entry) entry.likeCount = row._count._all;
    }
    for (const row of commentCounts) {
      const entry = info.get(row.postId);
      if (entry) entry.commentCount = row._count._all;
    }
    for (const row of viewerLikes) {
      const entry = info.get(row.postId);
      if (entry) entry.viewerHasLiked = true;
    }
    for (const row of viewerSaves) {
      const entry = info.get(row.postId);
      if (entry) entry.viewerHasSaved = true;
    }
    return info;
  }

  /** Da like. Idempotente: repetir no duplica la fila ni vuelve a emitir `post.liked`. */
  async like(postId: string, userId: string): Promise<LikeStateDto> {
    const post = await this.requireVisiblePost(postId, userId);
    const existing = await this.prisma.like.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      return { liked: true };
    }
    await this.prisma.like.create({ data: { postId, userId } });
    this.eventEmitter.emit(DOMAIN_EVENTS.POST_LIKED, {
      postId,
      postAuthorId: post.authorId,
      userId,
      tags: post.tags,
    } satisfies PostLikedEvent);
    return { liked: true };
  }

  /** Quita el like. Idempotente: quitarlo si no existía no es un error ni reemite el evento. */
  async unlike(postId: string, userId: string): Promise<LikeStateDto> {
    const post = await this.requireVisiblePost(postId, userId);
    const deleted = await this.prisma.like.deleteMany({ where: { postId, userId } });
    if (deleted.count > 0) {
      this.eventEmitter.emit(DOMAIN_EVENTS.POST_UNLIKED, {
        postId,
        postAuthorId: post.authorId,
        userId,
        tags: post.tags,
      } satisfies PostUnlikedEvent);
    }
    return { liked: false };
  }

  /** Quiénes dieron like a un post — **solo** el autor puede verlo. */
  async listLikes(
    postId: string,
    viewerId: string,
    query: CursorPaginationDto,
  ): Promise<LikeListResponseDto> {
    const post = await this.requirePost(postId);
    if (post.authorId !== viewerId) {
      throw new ForbiddenException('Solo el autor puede ver quién dio like');
    }

    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor, isFollowCursor) : null;
    const [total, rows] = await Promise.all([
      this.prisma.like.count({ where: { postId } }),
      this.prisma.like.findMany({
        where: {
          postId,
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
      }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const views = await this.usersService.getPublicViewsByIds(
      page.map((row) => row.userId),
      viewerId,
    );

    return {
      total,
      items: page.flatMap((row): LikeListItemDto[] => {
        const user = views.get(row.userId);
        return user ? [{ user, likedAt: row.createdAt }] : [];
      }),
      nextCursor:
        hasMore && last ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  /** Guarda el post. Idempotente: repetir no duplica ni vuelve a emitir `post.saved`. */
  async save(postId: string, userId: string): Promise<SaveStateDto> {
    const post = await this.requireVisiblePost(postId, userId);
    const existing = await this.prisma.savedPost.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      return { saved: true };
    }
    await this.prisma.savedPost.create({ data: { postId, userId } });
    this.eventEmitter.emit(DOMAIN_EVENTS.POST_SAVED, {
      postId,
      postAuthorId: post.authorId,
      userId,
      tags: post.tags,
    } satisfies PostSavedEvent);
    return { saved: true };
  }

  /** Quita de guardados. Idempotente: emite `post.unsaved` solo si la fila existía. */
  async unsave(postId: string, userId: string): Promise<SaveStateDto> {
    const post = await this.requireVisiblePost(postId, userId);
    const deleted = await this.prisma.savedPost.deleteMany({ where: { postId, userId } });
    if (deleted.count > 0) {
      this.eventEmitter.emit(DOMAIN_EVENTS.POST_UNSAVED, {
        postId,
        postAuthorId: post.authorId,
        userId,
        tags: post.tags,
      } satisfies PostUnsavedEvent);
    }
    return { saved: false };
  }

  /** Guardados del usuario, más recientes primero, con el `Post` completo embebido. */
  async listSaved(
    userId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<SavedPostItemDto>> {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor, isFollowCursor) : null;
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
    // El `Post` completo (medios firmados, contadores…) solo lo sabe armar `posts` (regla 7).
    const posts = await this.postsService.findManyByIdsForViewer(
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
   * Comenta. Si `parentId` apunta a una respuesta (no a un raíz), el comentario nuevo cuelga
   * del `parentId` de esa respuesta — el mismo raíz — para que la profundidad nunca pase de un
   * nivel (decisión #12 de `PRODUCT.md`).
   */
  async createComment(
    postId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentDto> {
    const post = await this.requireVisiblePost(postId, authorId);

    let parentId: string | null = null;
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.postId !== postId) {
        throw new NotFoundException('Comentario padre no encontrado');
      }
      parentId = parent.parentId ?? parent.id;
    }

    const comment = await this.prisma.comment.create({
      data: { postId, authorId, body: dto.body, parentId },
    });

    this.eventEmitter.emit(DOMAIN_EVENTS.COMMENT_CREATED, {
      commentId: comment.id,
      postId,
      postAuthorId: post.authorId,
      authorId,
    } satisfies CommentCreatedEvent);

    const authors = await this.usersService.getPublicViewsByIds([authorId], authorId);
    return this.buildCommentView(comment, authors, new Map());
  }

  /** Comentarios raíz de un post (`parentId: null`), los más viejos primero. */
  async listRootComments(
    postId: string,
    viewerId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<CommentDto>> {
    await this.requireVisiblePost(postId, viewerId);
    const { page, nextCursor } = await this.pageOfComments({ postId, parentId: null }, query);

    const [authors, replyCounts] = await Promise.all([
      this.usersService.getPublicViewsByIds(
        page.map((comment) => comment.authorId),
        viewerId,
      ),
      this.replyCountsFor(page.map((comment) => comment.id)),
    ]);

    return {
      items: page.map((comment) => this.buildCommentView(comment, authors, replyCounts)),
      nextCursor,
    };
  }

  /** Respuestas de un comentario raíz. `404` si `:id` no existe o no es un raíz. */
  async listReplies(
    rootId: string,
    viewerId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPage<CommentDto>> {
    const root = await this.prisma.comment.findUnique({ where: { id: rootId } });
    if (!root) {
      throw new NotFoundException('Comentario no encontrado');
    }
    await this.requireVisiblePost(root.postId, viewerId);
    if (root.parentId !== null) {
      throw new NotFoundException('Comentario no encontrado');
    }

    const { page, nextCursor } = await this.pageOfComments({ parentId: rootId }, query);
    const authors = await this.usersService.getPublicViewsByIds(
      page.map((comment) => comment.authorId),
      viewerId,
    );
    // Las respuestas nunca llevan `replyCount` (solo se incluye en los raíz).
    return {
      items: page.map((comment) => this.buildCommentView(comment, authors, new Map())),
      nextCursor,
    };
  }

  /** Edita el cuerpo de un comentario propio. */
  async updateComment(
    commentId: string,
    authorId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentDto> {
    await this.requireOwnedComment(commentId, authorId, 'editar');
    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body: dto.body },
    });

    const authors = await this.usersService.getPublicViewsByIds([authorId], authorId);
    const replyCounts =
      updated.parentId === null
        ? await this.replyCountsFor([updated.id])
        : new Map<string, number>();
    return this.buildCommentView(updated, authors, replyCounts);
  }

  /** Borra un comentario propio. Si es raíz, sus respuestas caen en cascada (`onDelete: Cascade`). */
  async removeComment(commentId: string, authorId: string): Promise<void> {
    await this.requireOwnedComment(commentId, authorId, 'borrar');
    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  /** Carga el comentario, valida que el post siga siendo visible y que el viewer sea el autor. */
  private async requireOwnedComment(
    commentId: string,
    authorId: string,
    action: 'editar' | 'borrar',
  ): Promise<Comment> {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException('Comentario no encontrado');
    }
    await this.requireVisiblePost(comment.postId, authorId);
    if (comment.authorId !== authorId) {
      throw new ForbiddenException(`Solo puedes ${action} tus propios comentarios`);
    }
    return comment;
  }

  private async pageOfComments(
    where: { postId: string; parentId: null } | { parentId: string },
    query: CursorPaginationDto,
  ): Promise<{ page: Comment[]; nextCursor: string | null }> {
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = query.cursor ? decodeCursor(query.cursor, isFollowCursor) : null;
    const rows = await this.prisma.comment.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.c) } },
                { createdAt: new Date(cursor.c), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      // Comentarios: los más viejos primero (conversación en orden de llegada), a diferencia
      // de likes/guardados/follows, que muestran lo más reciente arriba.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      page,
      nextCursor:
        hasMore && last ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  /** Cuántas respuestas tiene cada raíz de `rootIds`, en una sola consulta agregada. */
  private async replyCountsFor(rootIds: string[]): Promise<Map<string, number>> {
    if (rootIds.length === 0) return new Map();
    const rows = await this.prisma.comment.groupBy({
      by: ['parentId'],
      where: { parentId: { in: rootIds } },
      _count: { _all: true },
    });
    return new Map(
      rows.flatMap((row) => (row.parentId ? [[row.parentId, row._count._all] as const] : [])),
    );
  }

  private buildCommentView(
    comment: Comment,
    authors: Map<string, UserPublicView>,
    replyCounts: Map<string, number>,
  ): CommentDto {
    const author = authors.get(comment.authorId);
    if (!author) {
      throw new NotFoundException('Autor no encontrado');
    }
    const isRoot = comment.parentId === null;
    return {
      id: comment.id,
      author,
      body: comment.body,
      parentId: comment.parentId,
      createdAt: comment.createdAt,
      ...(isRoot ? { replyCount: replyCounts.get(comment.id) ?? 0 } : {}),
    };
  }
}

export type { UserPublicView };
