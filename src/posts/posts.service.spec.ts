import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileType } from '@prisma/client';
import { DOMAIN_EVENTS } from '../events/domain-events';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UserPublicView, UsersService } from '../users/users.service';
import { PostsService } from './posts.service';

const AUTHOR_ID = 'author-1';
const VIEWER_ID = 'viewer-1';

const authorView: UserPublicView = {
  id: AUTHOR_ID,
  username: 'ada',
  name: 'Ada',
  avatarUrl: null,
  isPublic: true,
  followersCount: 0,
  followingCount: 0,
  viewerFollows: false,
  followsViewer: false,
};

function postRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    authorId: AUTHOR_ID,
    description: null,
    tags: [],
    position: 0,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    media: [
      { id: 'media-1', postId: 'post-1', fileAssetId: 'file-1', order: 0, width: 800, height: 600 },
    ],
    ...overrides,
  };
}

describe('PostsService', () => {
  let service: PostsService;
  let prisma: {
    post: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    postMedia: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let users: {
    findByUsername: jest.Mock;
    canViewContentOf: jest.Mock;
    getPublicViewsByIds: jest.Mock;
  };
  let files: { findOwnedByUser: jest.Mock; findManyByIds: jest.Mock };
  let storage: jest.Mocked<StorageService>;
  let events: { emit: jest.Mock };

  beforeEach(() => {
    prisma = {
      post: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(async () => postRow()),
        update: jest.fn().mockImplementation(async () => postRow()),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      postMedia: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      // Soporta las dos formas que usa el servicio: callback (crear/editar) y arreglo (reorder).
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    users = {
      findByUsername: jest.fn().mockResolvedValue({ id: AUTHOR_ID, username: 'ada' }),
      canViewContentOf: jest.fn().mockResolvedValue(true),
      getPublicViewsByIds: jest.fn().mockResolvedValue(new Map([[AUTHOR_ID, authorView]])),
    };
    files = {
      findOwnedByUser: jest
        .fn()
        .mockResolvedValue([{ id: 'file-1', type: FileType.IMAGE, key: 'users/a/f/1.png' }]),
      findManyByIds: jest
        .fn()
        .mockResolvedValue([{ id: 'file-1', type: FileType.IMAGE, key: 'users/a/f/1.png' }]),
    };
    storage = {
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/download'),
      getSignedUploadUrl: jest.fn(),
      headObject: jest.fn(),
      delete: jest.fn(),
    };
    events = { emit: jest.fn() };

    service = new PostsService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      files as unknown as FilesService,
      { get: jest.fn(() => 300) } as unknown as ConfigService,
      storage,
      events as unknown as EventEmitter2,
    );
  });

  describe('create', () => {
    it('normaliza las etiquetas explícitas junto con los hashtags de la descripción', async () => {
      await service.create(AUTHOR_ID, {
        description: 'Mural #Proceso',
        tags: ['Arte'],
        media: [{ fileAssetId: 'file-1' }],
      });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tags: ['arte', 'proceso'] }) }),
      );
    });

    it('entra en la primera posición y empuja las demás', async () => {
      await service.create(AUTHOR_ID, { media: [{ fileAssetId: 'file-1' }] });

      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: { authorId: AUTHOR_ID },
        data: { position: { increment: 1 } },
      });
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 0 }) }),
      );
    });

    it('guarda el orden de los medios según el arreglo recibido', async () => {
      files.findOwnedByUser.mockResolvedValue([
        { id: 'file-2', type: FileType.IMAGE, key: 'k2' },
        { id: 'file-1', type: FileType.IMAGE, key: 'k1' },
      ]);

      await service.create(AUTHOR_ID, {
        media: [{ fileAssetId: 'file-2', width: 100, height: 200 }, { fileAssetId: 'file-1' }],
      });

      const { data } = prisma.post.create.mock.calls[0][0];
      expect(data.media.create).toEqual([
        { fileAssetId: 'file-2', order: 0, width: 100, height: 200 },
        { fileAssetId: 'file-1', order: 1, width: null, height: null },
      ]);
    });

    it('rechaza el mismo archivo repetido en la publicación', async () => {
      await expect(
        service.create(AUTHOR_ID, {
          media: [{ fileAssetId: 'file-1' }, { fileAssetId: 'file-1' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('emite post.created con las etiquetas ya normalizadas', async () => {
      await service.create(AUTHOR_ID, {
        description: '#Tinta',
        media: [{ fileAssetId: 'file-1' }],
      });

      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.POST_CREATED, {
        postId: 'post-1',
        authorId: AUTHOR_ID,
        tags: ['tinta'],
      });
    });
  });

  describe('lectura', () => {
    it('incluye likeCount solo cuando el viewer es el autor', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow());

      const own = await service.findOne('post-1', AUTHOR_ID);
      expect(own.likeCount).toBe(0);

      users.getPublicViewsByIds.mockResolvedValue(new Map([[AUTHOR_ID, authorView]]));
      const other = await service.findOne('post-1', VIEWER_ID);
      expect(other).not.toHaveProperty('likeCount');
    });

    it('firma la URL de cada medio y anuncia su vencimiento', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow());

      const post = await service.findOne('post-1', AUTHOR_ID);

      expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith('users/a/f/1.png', 300);
      expect(post.media[0]).toEqual(
        expect.objectContaining({
          type: FileType.IMAGE,
          url: 'https://signed.example/download',
          width: 800,
          height: 600,
        }),
      );
      expect(post.media[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('404 si la publicación no existe', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.findOne('post-x', VIEWER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 si el perfil del autor es privado para el viewer', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow());
      users.canViewContentOf.mockResolvedValue(false);
      await expect(service.findOne('post-1', VIEWER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findByUsername', () => {
    it('devuelve la página en el orden curado y sin cursor cuando no hay más', async () => {
      prisma.post.findMany.mockResolvedValue([postRow()]);

      const page = await service.findByUsername('ada', VIEWER_ID, { limit: 2 });

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ position: 'asc' }, { id: 'asc' }], take: 3 }),
      );
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('devuelve nextCursor cuando hay una página más y reanuda después de esa marca', async () => {
      prisma.post.findMany.mockResolvedValue([
        postRow({ id: 'post-1', position: 0 }),
        postRow({ id: 'post-2', position: 1 }),
      ]);

      const page = await service.findByUsername('ada', VIEWER_ID, { limit: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();

      await service.findByUsername('ada', VIEWER_ID, { cursor: page.nextCursor!, limit: 1 });
      expect(prisma.post.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ position: { gt: 0 } }, { position: 0, id: { gt: 'post-1' } }],
          }),
        }),
      );
    });

    it('400 si el cursor es basura', async () => {
      await expect(
        service.findByUsername('ada', VIEWER_ID, { cursor: 'no-es-base64-json' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('403 si el perfil es privado para el viewer', async () => {
      users.canViewContentOf.mockResolvedValue(false);
      await expect(service.findByUsername('ada', VIEWER_ID, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('reorder', () => {
    it('persiste el índice del arreglo como position', async () => {
      prisma.post.findMany.mockResolvedValue([{ id: 'post-1' }, { id: 'post-2' }]);

      const result = await service.reorder(AUTHOR_ID, { orderedIds: ['post-2', 'post-1'] });

      expect(result).toEqual({ reordered: true });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-2' },
        data: { position: 0 },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { position: 1 },
      });
    });

    it('400 si la lista no es exactamente el conjunto de posts del usuario', async () => {
      prisma.post.findMany.mockResolvedValue([{ id: 'post-1' }, { id: 'post-2' }]);

      await expect(service.reorder(AUTHOR_ID, { orderedIds: ['post-1'] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.reorder(AUTHOR_ID, { orderedIds: ['post-1', 'post-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update y remove', () => {
    it('reemplaza la lista completa de medios cuando viene `media`', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow());

      await service.update('post-1', AUTHOR_ID, { media: [{ fileAssetId: 'file-1' }] });

      expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post-1' } });
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            media: { create: [{ fileAssetId: 'file-1', order: 0, width: null, height: null }] },
          }),
        }),
      );
    });

    it('no toca los medios si el body no los trae', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow());

      await service.update('post-1', AUTHOR_ID, { description: 'Nueva #tinta' });

      expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tags: ['tinta'] }) }),
      );
    });

    it('403 al editar o borrar una publicación ajena', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow({ authorId: 'otro' }));

      await expect(service.update('post-1', AUTHOR_ID, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.remove('post-1', AUTHOR_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('borra la publicación propia', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow());
      await service.remove('post-1', AUTHOR_ID);
      expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } });
    });
  });
});
