import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DOMAIN_EVENTS } from '../events/domain-events';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SocialService } from './social.service';

const ADA = { id: 'ada-1', username: 'ada', isPublic: false };
const VIEWER = 'viewer-1';

describe('SocialService', () => {
  let service: SocialService;
  let prisma: {
    follow: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let users: { findByUsername: jest.Mock; getPublicViewsByIds: jest.Mock };
  let events: { emit: jest.Mock };

  beforeEach(() => {
    prisma = {
      follow: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
          id: 'follow-1',
          isFavorite: false,
          createdAt: new Date(),
          ...args.data,
        })),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    users = {
      findByUsername: jest.fn().mockResolvedValue(ADA),
      getPublicViewsByIds: jest.fn(
        async (ids: string[]) => new Map(ids.map((id) => [id, { id, username: id }])),
      ),
    };
    events = { emit: jest.fn() };

    service = new SocialService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      events as unknown as EventEmitter2,
    );
  });

  describe('seguir', () => {
    it('crea la arista y emite user.followed', async () => {
      const result = await service.follow(VIEWER, 'ada');

      expect(result).toEqual({ following: true, isFavorite: false });
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.USER_FOLLOWED, {
        followerId: VIEWER,
        followedId: ADA.id,
      });
    });

    // Idempotente por contrato: repetir el POST no duplica ni vuelve a notificar.
    it('no duplica ni reemite si ya lo sigue', async () => {
      prisma.follow.findUnique.mockResolvedValue({ id: 'follow-1', isFavorite: true });

      const result = await service.follow(VIEWER, 'ada');

      expect(result).toEqual({ following: true, isFavorite: true });
      expect(prisma.follow.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('400 al seguirse a uno mismo', async () => {
      users.findByUsername.mockResolvedValue({ ...ADA, id: VIEWER });
      await expect(service.follow(VIEWER, 'ada')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 si el usuario no existe', async () => {
      users.findByUsername.mockResolvedValue(null);
      await expect(service.follow(VIEWER, 'fantasma')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('dejar de seguir a quien no sigues no es un error', async () => {
      prisma.follow.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unfollow(VIEWER, 'ada')).resolves.toEqual({ following: false });
    });

    it('404 al marcar favorito a alguien que no sigues', async () => {
      prisma.follow.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.setFavorite(VIEWER, 'ada', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // La regla de visibilidad del proyecto, en un único lugar (decisión #6 de PRODUCT.md).
  describe('regla de visibilidad', () => {
    it('el dueño y los perfiles públicos siempre se ven', async () => {
      await expect(service.canView({ id: VIEWER, isPublic: false }, VIEWER)).resolves.toBe(true);
      await expect(service.canView({ id: ADA.id, isPublic: true }, VIEWER)).resolves.toBe(true);
    });

    it('un perfil privado solo se abre con follow mutuo', async () => {
      prisma.follow.count.mockResolvedValue(1); // solo una de las dos aristas
      await expect(service.canView(ADA, VIEWER)).resolves.toBe(false);

      prisma.follow.count.mockResolvedValue(2);
      await expect(service.canView(ADA, VIEWER)).resolves.toBe(true);
    });

    it('sin sesión, un perfil privado nunca se abre', async () => {
      await expect(service.canView(ADA)).resolves.toBe(false);
      expect(prisma.follow.count).not.toHaveBeenCalled();
    });

    it('la variante con grafo ya cargado decide lo mismo sin consultar', () => {
      const mutual = { viewerFollows: true, followsViewer: true };
      const oneWay = { viewerFollows: true, followsViewer: false };

      expect(service.canViewWithGraph(ADA, VIEWER, mutual)).toBe(true);
      expect(service.canViewWithGraph(ADA, VIEWER, oneWay)).toBe(false);
      expect(service.canViewWithGraph({ ...ADA, isPublic: true }, VIEWER, oneWay)).toBe(true);
      // Sin viewer no hay dueño posible aunque los ids sean `undefined`.
      expect(service.canViewWithGraph(ADA, undefined, oneWay)).toBe(false);
    });
  });

  describe('grafo para UserPublic', () => {
    it('agrega conteos y relación con el viewer en una sola pasada', async () => {
      prisma.follow.groupBy
        .mockResolvedValueOnce([{ followedId: ADA.id, _count: { _all: 3 } }])
        .mockResolvedValueOnce([{ followerId: ADA.id, _count: { _all: 5 } }]);
      prisma.follow.findMany
        .mockResolvedValueOnce([{ followedId: ADA.id }]) // el viewer sigue a ada
        .mockResolvedValueOnce([]); // ada no sigue al viewer

      const info = await service.getGraphInfoFor([ADA.id], VIEWER);

      expect(info.get(ADA.id)).toEqual({
        followersCount: 3,
        followingCount: 5,
        viewerFollows: true,
        followsViewer: false,
      });
    });

    it('sin usuarios no consulta nada', async () => {
      const info = await service.getGraphInfoFor([], VIEWER);
      expect(info.size).toBe(0);
      expect(prisma.follow.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('listados', () => {
    it('devuelve seguidos con su marca de favorito y pagina por cursor', async () => {
      const rows = [
        { id: 'f2', followedId: 'b', isFavorite: true, createdAt: new Date('2026-09-02') },
        { id: 'f1', followedId: 'a', isFavorite: false, createdAt: new Date('2026-09-01') },
      ];
      prisma.follow.findMany.mockResolvedValue(rows);

      const page = await service.listFollowing(VIEWER, { limit: 1 });

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toEqual(
        expect.objectContaining({ isFavorite: true, since: rows[0]!.createdAt }),
      );
      expect(page.nextCursor).not.toBeNull();
    });

    it('los seguidores no llevan isFavorite', async () => {
      prisma.follow.findMany.mockResolvedValue([
        { id: 'f1', followerId: 'a', isFavorite: true, createdAt: new Date('2026-09-01') },
      ]);

      const page = await service.listFollowers(VIEWER, {});

      expect(page.items[0]).not.toHaveProperty('isFavorite');
    });
  });

  describe('mutuos', () => {
    it('son los seguidos que además me siguen', async () => {
      prisma.follow.findMany
        .mockResolvedValueOnce([{ followedId: 'a' }, { followedId: 'b' }])
        .mockResolvedValueOnce([{ followerId: 'b' }, { followerId: 'c' }]);

      await expect(service.getMutualIds(VIEWER)).resolves.toEqual(['b']);
    });
  });
});
