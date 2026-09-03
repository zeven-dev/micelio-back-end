import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileType } from '@prisma/client';
import { DOMAIN_EVENTS } from '../events/domain-events';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';
import { StorageService } from '../storage/storage.service';
import { UserPublicView, UsersService } from '../users/users.service';
import { PostInteractionsService } from './post-interactions.service';
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
    savedPost: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let users: {
    findByUsername: jest.Mock;
    canViewContentOf: jest.Mock;
    getPublicViewsByIds: jest.Mock;
    filterPublicIds: jest.Mock;
    findPublicUserIds: jest.Mock;
  };
  let social: {
    getFollowedIds: jest.Mock;
    getFavoriteIds: jest.Mock;
    getMutualIds: jest.Mock;
  };
  let interactions: { getInteractionInfoFor: jest.Mock };
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
      savedPost: { findMany: jest.fn().mockResolvedValue([]) },
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
      filterPublicIds: jest.fn().mockResolvedValue([]),
      findPublicUserIds: jest.fn().mockResolvedValue([]),
    };
    social = {
      getFollowedIds: jest.fn().mockResolvedValue([]),
      getFavoriteIds: jest.fn().mockResolvedValue([]),
      getMutualIds: jest.fn().mockResolvedValue([]),
    };
    interactions = {
      // Sin interacciones por defecto, igual que el valor vacío real de `PostInteractionsService`.
      getInteractionInfoFor: jest.fn(
        async (postIds: string[]) =>
          new Map(
            postIds.map((id) => [
              id,
              { viewerHasLiked: false, viewerHasSaved: false, likeCount: 0, commentCount: 0 },
            ]),
          ),
      ),
    };
    files = {
      findOwnedByUser: jest
        .fn()
        .mockResolvedValue([
          { id: 'file-1', type: FileType.IMAGE, key: 'users/a/f/1.png', width: 1600, height: 900 },
        ]),
      findManyByIds: jest
        .fn()
        .mockResolvedValue([
          { id: 'file-1', type: FileType.IMAGE, key: 'users/a/f/1.png', width: 1600, height: 900 },
        ]),
    };
    storage = {
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/download'),
      getSignedUploadUrl: jest.fn(),
      headObject: jest.fn(),
      delete: jest.fn(),
      deleteByPrefix: jest.fn(),
    };
    events = { emit: jest.fn() };

    service = new PostsService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      social as unknown as SocialService,
      interactions as unknown as PostInteractionsService,
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
        { id: 'file-2', type: FileType.IMAGE, key: 'k2', width: null, height: null },
        { id: 'file-1', type: FileType.IMAGE, key: 'k1', width: null, height: null },
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

    // Los contadores/flags sociales no son un valor fijo — vienen de `PostInteractionsService`.
    it('arma viewerHasLiked/viewerHasSaved/likeCount/commentCount con lo que aportan las interacciones', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow());
      interactions.getInteractionInfoFor.mockResolvedValue(
        new Map([
          ['post-1', { viewerHasLiked: true, viewerHasSaved: true, likeCount: 5, commentCount: 2 }],
        ]),
      );

      const post = await service.findOne('post-1', AUTHOR_ID);

      expect(post.viewerHasLiked).toBe(true);
      expect(post.viewerHasSaved).toBe(true);
      expect(post.likeCount).toBe(5);
      expect(post.commentCount).toBe(2);
      expect(interactions.getInteractionInfoFor).toHaveBeenCalledWith(['post-1'], AUTHOR_ID);
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

    // Las dimensiones son del archivo de biblioteca; el post solo las pisa si el cliente manda
    // las suyas (decisión del dueño: "archivo, con override del cliente").
    it('hereda las dimensiones del archivo cuando el medio no las trae', async () => {
      prisma.post.findUnique.mockResolvedValue(
        postRow({
          media: [
            {
              id: 'media-1',
              postId: 'post-1',
              fileAssetId: 'file-1',
              order: 0,
              width: null,
              height: null,
            },
          ],
        }),
      );

      const post = await service.findOne('post-1', AUTHOR_ID);

      expect(post.media[0]).toEqual(expect.objectContaining({ width: 1600, height: 900 }));
    });

    it('el override del medio gana sobre las del archivo', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow());

      const post = await service.findOne('post-1', AUTHOR_ID);

      expect(post.media[0]).toEqual(expect.objectContaining({ width: 800, height: 600 }));
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

  // El algoritmo del home está especificado al detalle en `docs/API-CONTRACTS.md`: estas
  // pruebas son la traducción literal de esa especificación.
  describe('home feed v1', () => {
    const HOUR = 60 * 60 * 1000;
    const base = new Date('2026-09-01T12:00:00.000Z');

    /** Un post de `authorId` creado `hoursAgo` horas antes de la marca base. */
    function feedPost(id: string, authorId: string, hoursAgo: number) {
      return postRow({ id, authorId, createdAt: new Date(base.getTime() - hoursAgo * HOUR) });
    }

    beforeEach(() => {
      users.getPublicViewsByIds.mockImplementation(
        async (ids: string[]) =>
          new Map(ids.map((id) => [id, { ...authorView, id, username: id }])),
      );
    });

    it('mezcla 4:1 — la quinta posición viene de descubrimiento', async () => {
      social.getFollowedIds.mockResolvedValue(['seguido']);
      users.filterPublicIds.mockResolvedValue(['seguido']);
      users.findPublicUserIds.mockResolvedValue(['ajeno']);
      prisma.post.findMany.mockImplementation(
        async (args: { where: { authorId: { in: string[] } } }) => {
          const authors = args.where.authorId.in;
          if (authors.includes('seguido')) {
            return [1, 2, 3, 4, 5, 6].map((n) => feedPost(`s${n}`, 'seguido', n));
          }
          if (authors.includes('ajeno')) {
            return [1, 2].map((n) => feedPost(`d${n}`, 'ajeno', n));
          }
          return [];
        },
      );

      const page = await service.getHomeFeed(VIEWER_ID, { limit: 5 });

      expect(page.items.map((item) => item.id)).toEqual(['s1', 's2', 's3', 's4', 'd1']);
    });

    it('un favorito flota como si fuera 12 h más nuevo', async () => {
      social.getFollowedIds.mockResolvedValue(['favorito', 'normal']);
      social.getFavoriteIds.mockResolvedValue(['favorito']);
      users.filterPublicIds.mockResolvedValue(['favorito', 'normal']);
      users.findPublicUserIds.mockResolvedValue([]);
      prisma.post.findMany.mockImplementation(
        async (args: { where: { authorId: { in: string[] } } }) => {
          if (args.where.authorId.in.includes('favorito')) return [feedPost('fav', 'favorito', 10)];
          if (args.where.authorId.in.includes('normal')) return [feedPost('nue', 'normal', 3)];
          return [];
        },
      );

      const page = await service.getHomeFeed(VIEWER_ID, { limit: 5 });

      // Sin boost ganaría `nue` (3 h) sobre `fav` (10 h); con las 12 h de favorito, no.
      expect(page.items.map((item) => item.id)).toEqual(['fav', 'nue']);
    });

    it('un seguido privado sin follow mutuo no entra al home', async () => {
      social.getFollowedIds.mockResolvedValue(['privado']);
      users.filterPublicIds.mockResolvedValue([]); // no es público
      social.getMutualIds.mockResolvedValue([]); // ni mutuo
      users.findPublicUserIds.mockResolvedValue([]);

      const page = await service.getHomeFeed(VIEWER_ID, { limit: 5 });

      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
      // Sin autores visibles no se consulta la base por ese stream.
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it('un seguido privado con follow mutuo sí entra', async () => {
      social.getFollowedIds.mockResolvedValue(['privado']);
      users.filterPublicIds.mockResolvedValue([]);
      social.getMutualIds.mockResolvedValue(['privado']);
      users.findPublicUserIds.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([feedPost('p1', 'privado', 1)]);

      const page = await service.getHomeFeed(VIEWER_ID, { limit: 5 });

      expect(page.items.map((item) => item.id)).toEqual(['p1']);
    });

    it('el descubrimiento excluye al viewer y a quienes ya sigue', async () => {
      social.getFollowedIds.mockResolvedValue(['seguido']);
      users.filterPublicIds.mockResolvedValue(['seguido']);
      users.findPublicUserIds.mockResolvedValue([]);

      await service.getHomeFeed(VIEWER_ID, { limit: 5 });

      expect(users.findPublicUserIds).toHaveBeenCalledWith([VIEWER_ID, 'seguido']);
    });

    it('el cursor reanuda cada stream después de su marca', async () => {
      social.getFollowedIds.mockResolvedValue(['seguido']);
      users.filterPublicIds.mockResolvedValue(['seguido']);
      users.findPublicUserIds.mockResolvedValue(['ajeno']);
      prisma.post.findMany.mockImplementation(
        async (args: { where: { authorId: { in: string[] } } }) =>
          args.where.authorId.in.includes('seguido')
            ? [feedPost('s1', 'seguido', 1), feedPost('s2', 'seguido', 2)]
            : [feedPost('d1', 'ajeno', 1), feedPost('d2', 'ajeno', 2)],
      );

      const first = await service.getHomeFeed(VIEWER_ID, { limit: 1 });
      expect(first.nextCursor).not.toBeNull();

      prisma.post.findMany.mockClear();
      await service.getHomeFeed(VIEWER_ID, { cursor: first.nextCursor!, limit: 1 });

      // El stream de seguidos reanuda tras `s1`; el de descubrimiento, que no aportó nada en la
      // primera página, sigue sin marca y arranca desde el principio.
      const followingCall = prisma.post.findMany.mock.calls.find((call) =>
        (call[0] as { where: { authorId: { in: string[] } } }).where.authorId.in.includes(
          'seguido',
        ),
      )![0] as { where: { OR?: unknown } };
      const discoveryCall = prisma.post.findMany.mock.calls.find((call) =>
        (call[0] as { where: { authorId: { in: string[] } } }).where.authorId.in.includes('ajeno'),
      )![0] as { where: { OR?: unknown } };

      expect(followingCall.where.OR).toBeDefined();
      expect(discoveryCall.where.OR).toBeUndefined();
    });

    it('sin más candidatos, la página sale corta y sin cursor', async () => {
      social.getFollowedIds.mockResolvedValue(['seguido']);
      users.filterPublicIds.mockResolvedValue(['seguido']);
      users.findPublicUserIds.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([feedPost('s1', 'seguido', 1)]);

      const page = await service.getHomeFeed(VIEWER_ID, { limit: 20 });

      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('400 si el cursor es basura', async () => {
      await expect(
        service.getHomeFeed(VIEWER_ID, { cursor: 'no-es-un-cursor' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
