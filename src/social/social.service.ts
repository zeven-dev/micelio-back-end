import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CursorPage,
  CursorPaginationDto,
  DEFAULT_PAGE_LIMIT,
} from '../common/dto/cursor-pagination.dto';
import { decodeCursor, encodeCursor } from '../common/pagination/cursor.util';
import { DOMAIN_EVENTS, UserFollowedEvent } from '../events/domain-events';
import { PrismaService } from '../prisma/prisma.service';
import { UserPublicView, UsersService } from '../users/users.service';
import { FollowStateDto, FollowerItemDto, FollowingItemDto } from './dto/follow-response.dto';

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

/** Marca del cursor de los listados del grafo: última fecha e id consumidos. */
interface FollowCursor {
  c: string;
  id: string;
}

function isFollowCursor(value: unknown): value is FollowCursor {
  const cursor = value as FollowCursor | null;
  return typeof cursor?.c === 'string' && typeof cursor?.id === 'string';
}

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
}

export type { UserPublicView };
