import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DOMAIN_EVENTS } from '../events/domain-events';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SocialService } from './social.service';

const ADA = { id: 'ada-1', username: 'ada', isPublic: false };
const VIEWER = 'viewer-1';
const POST_ID = 'post-1';
const POST_REF = { id: POST_ID, authorId: ADA.id, tags: ['arte'] };

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
    like: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    savedPost: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    comment: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let users: {
    findByUsername: jest.Mock;
    getPublicViewsByIds: jest.Mock;
    canViewContentOf: jest.Mock;
  };
  let posts: { getPostRef: jest.Mock; findManyByIdsForViewer: jest.Mock };
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
      like: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'like-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      savedPost: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'save-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      comment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
          id: 'comment-1',
          createdAt: new Date('2026-09-03T10:00:00.000Z'),
          ...args.data,
        })),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    users = {
      findByUsername: jest.fn().mockResolvedValue(ADA),
      getPublicViewsByIds: jest.fn(
        async (ids: string[]) => new Map(ids.map((id) => [id, { id, username: id }])),
      ),
      canViewContentOf: jest.fn().mockResolvedValue(true),
    };
    posts = {
      getPostRef: jest.fn().mockResolvedValue(POST_REF),
      findManyByIdsForViewer: jest.fn().mockResolvedValue(new Map()),
    };
    events = { emit: jest.fn() };

    service = new SocialService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      posts as unknown as PostsService,
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

  // Fase 4: likes, guardados y comentarios.
  describe('likes', () => {
    it('da like y emite post.liked', async () => {
      const result = await service.like(POST_ID, VIEWER);

      expect(result).toEqual({ liked: true });
      expect(prisma.like.create).toHaveBeenCalledWith({
        data: { postId: POST_ID, userId: VIEWER },
      });
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.POST_LIKED, {
        postId: POST_ID,
        postAuthorId: ADA.id,
        userId: VIEWER,
        tags: POST_REF.tags,
      });
    });

    // Idempotente por contrato: repetir el POST no duplica la fila ni reemite el evento.
    it('no duplica ni reemite si ya le dio like', async () => {
      prisma.like.findUnique.mockResolvedValue({ id: 'like-1' });

      const result = await service.like(POST_ID, VIEWER);

      expect(result).toEqual({ liked: true });
      expect(prisma.like.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('quitar el like que no existía no reemite post.unliked', async () => {
      prisma.like.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.unlike(POST_ID, VIEWER);

      expect(result).toEqual({ liked: false });
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('quitar un like existente sí emite post.unliked', async () => {
      prisma.like.deleteMany.mockResolvedValue({ count: 1 });

      await service.unlike(POST_ID, VIEWER);

      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.POST_UNLIKED, {
        postId: POST_ID,
        postAuthorId: ADA.id,
        userId: VIEWER,
        tags: POST_REF.tags,
      });
    });

    it('404 si el post no existe', async () => {
      posts.getPostRef.mockResolvedValue(null);
      await expect(service.like(POST_ID, VIEWER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 si el post no es visible para el viewer', async () => {
      users.canViewContentOf.mockResolvedValue(false);
      await expect(service.like(POST_ID, VIEWER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('403 al listar likes si el viewer no es el autor', async () => {
      await expect(service.listLikes(POST_ID, VIEWER, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('el autor sí puede listar quién le dio like', async () => {
      prisma.like.count.mockResolvedValue(1);
      prisma.like.findMany.mockResolvedValue([
        { id: 'l1', userId: VIEWER, createdAt: new Date('2026-09-03') },
      ]);

      const page = await service.listLikes(POST_ID, ADA.id, {});

      expect(page.total).toBe(1);
      expect(page.items[0]).toEqual(
        expect.objectContaining({ user: { id: VIEWER, username: VIEWER } }),
      );
    });
  });

  describe('guardados', () => {
    it('guarda y emite post.saved', async () => {
      const result = await service.save(POST_ID, VIEWER);

      expect(result).toEqual({ saved: true });
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.POST_SAVED, {
        postId: POST_ID,
        postAuthorId: ADA.id,
        userId: VIEWER,
        tags: POST_REF.tags,
      });
    });

    it('no duplica ni reemite si ya lo había guardado', async () => {
      prisma.savedPost.findUnique.mockResolvedValue({ id: 'save-1' });

      const result = await service.save(POST_ID, VIEWER);

      expect(result).toEqual({ saved: true });
      expect(prisma.savedPost.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('quitarlo si no estaba guardado no reemite post.unsaved', async () => {
      prisma.savedPost.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.unsave(POST_ID, VIEWER);

      expect(result).toEqual({ saved: false });
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('403 si el post no es visible para el viewer', async () => {
      users.canViewContentOf.mockResolvedValue(false);
      await expect(service.save(POST_ID, VIEWER)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('comentarios', () => {
    it('crea un comentario raíz', async () => {
      const comment = await service.createComment(POST_ID, VIEWER, { body: 'Hola' });

      expect(comment.parentId).toBeNull();
      expect(comment.replyCount).toBe(0);
      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: { postId: POST_ID, authorId: VIEWER, body: 'Hola', parentId: null },
      });
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.COMMENT_CREATED, {
        commentId: 'comment-1',
        postId: POST_ID,
        postAuthorId: ADA.id,
        authorId: VIEWER,
      });
    });

    // Un solo nivel de profundidad (decisión #12 de PRODUCT.md): responder a una respuesta
    // cuelga del mismo raíz, no de la respuesta.
    it('responder a una respuesta cuelga del mismo raíz', async () => {
      const root = { id: 'root-1', postId: POST_ID, parentId: null };
      const reply = { id: 'reply-1', postId: POST_ID, parentId: root.id };
      prisma.comment.findUnique.mockResolvedValue(reply);

      await service.createComment(POST_ID, VIEWER, { body: 'Respuesta', parentId: reply.id });

      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: { postId: POST_ID, authorId: VIEWER, body: 'Respuesta', parentId: root.id },
      });
    });

    it('responder a un raíz cuelga de ese raíz', async () => {
      const root = { id: 'root-1', postId: POST_ID, parentId: null };
      prisma.comment.findUnique.mockResolvedValue(root);

      await service.createComment(POST_ID, VIEWER, { body: 'Respuesta', parentId: root.id });

      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: { postId: POST_ID, authorId: VIEWER, body: 'Respuesta', parentId: root.id },
      });
    });

    it('404 si el parentId no existe o es de otro post', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(
        service.createComment(POST_ID, VIEWER, { body: 'x', parentId: 'fantasma' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 si el post no es visible para el viewer', async () => {
      users.canViewContentOf.mockResolvedValue(false);
      await expect(service.createComment(POST_ID, VIEWER, { body: 'x' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('404 al pedir las respuestas de un comentario que no es raíz', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'reply-1',
        postId: POST_ID,
        parentId: 'root-1',
      });
      await expect(service.listReplies('reply-1', VIEWER, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404 al pedir las respuestas de un comentario inexistente', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(service.listReplies('fantasma', VIEWER, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('403 al editar el comentario de otro', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'comment-1',
        postId: POST_ID,
        authorId: 'otro',
        body: 'x',
        parentId: null,
      });
      await expect(
        service.updateComment('comment-1', VIEWER, { body: 'y' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // La cascada real (DB `onDelete: Cascade`, ver prisma/schema.prisma) borra las respuestas;
    // a nivel de servicio, borrar un raíz es una sola operación — no hay limpieza manual de hijos.
    it('borra un comentario raíz con una sola operación (la cascada la aplica la base)', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'root-1',
        postId: POST_ID,
        authorId: VIEWER,
        body: 'x',
        parentId: null,
      });

      await service.removeComment('root-1', VIEWER);

      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'root-1' } });
      expect(prisma.comment.delete).toHaveBeenCalledTimes(1);
    });

    it('404 al borrar un comentario ajeno inexistente', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(service.removeComment('fantasma', VIEWER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
