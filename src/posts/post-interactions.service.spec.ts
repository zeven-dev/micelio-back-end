import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DOMAIN_EVENTS } from '../events/domain-events';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PostInteractionsService } from './post-interactions.service';

const ADA = { id: 'ada-1', username: 'ada', isPublic: false };
const VIEWER = 'viewer-1';
const POST_ID = 'post-1';
const POST_REF = { id: POST_ID, authorId: ADA.id, tags: ['arte'] };

describe('PostInteractionsService', () => {
  let service: PostInteractionsService;
  let prisma: {
    post: { findUnique: jest.Mock };
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
    getPublicViewsByIds: jest.Mock;
    canViewContentOf: jest.Mock;
  };
  let events: { emit: jest.Mock };

  beforeEach(() => {
    prisma = {
      post: {
        findUnique: jest.fn().mockResolvedValue(POST_REF),
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
      getPublicViewsByIds: jest.fn(
        async (ids: string[]) => new Map(ids.map((id) => [id, { id, username: id }])),
      ),
      canViewContentOf: jest.fn().mockResolvedValue(true),
    };
    events = { emit: jest.fn() };

    service = new PostInteractionsService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      events as unknown as EventEmitter2,
    );
  });

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
      prisma.post.findUnique.mockResolvedValue(null);
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
