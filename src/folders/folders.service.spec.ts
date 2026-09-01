import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FoldersService } from './folders.service';

describe('FoldersService', () => {
  let foldersService: FoldersService;
  let prisma: {
    folder: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const root = { id: 'root', userId: 'user-1', name: 'Fotos', parentId: null };

  beforeEach(() => {
    prisma = {
      folder: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    foldersService = new FoldersService(prisma as unknown as PrismaService);
  });

  describe('findAllForUser', () => {
    it('lists root folders scoped to the requesting user', async () => {
      prisma.folder.findMany.mockResolvedValue([]);
      await foldersService.findAllForUser('user-1');
      expect(prisma.folder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', parentId: null } }),
      );
    });

    it('lists the direct children of a folder', async () => {
      prisma.folder.findUnique.mockResolvedValue(root);
      prisma.folder.findMany.mockResolvedValue([]);

      await foldersService.findAllForUser('user-1', 'root');

      expect(prisma.folder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', parentId: 'root' } }),
      );
    });

    it('never lists the children of a folder owned by someone else', async () => {
      prisma.folder.findUnique.mockResolvedValue({ ...root, userId: 'other-user' });
      await expect(foldersService.findAllForUser('user-1', 'root')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.folder.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOneOrFail', () => {
    it('throws NotFoundException when the folder does not exist', async () => {
      prisma.folder.findUnique.mockResolvedValue(null);
      await expect(foldersService.findOneOrFail('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the folder belongs to another user', async () => {
      prisma.folder.findUnique.mockResolvedValue({ ...root, userId: 'other-user' });
      await expect(foldersService.findOneOrFail('root', 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('findOneWithPath', () => {
    it('returns the breadcrumb from the root down to the folder', async () => {
      const child = { id: 'child', userId: 'user-1', name: 'Bocetos', parentId: 'root' };
      prisma.folder.findUnique
        .mockResolvedValueOnce(child) // findOneOrFail
        .mockResolvedValueOnce({ _count: { files: 2, children: 0 } }) // _count
        .mockResolvedValueOnce({ id: 'root', name: 'Fotos', parentId: null }); // ancestro

      const result = await foldersService.findOneWithPath('child', 'user-1');

      expect(result.path).toEqual([
        { id: 'root', name: 'Fotos' },
        { id: 'child', name: 'Bocetos' },
      ]);
    });
  });

  describe('create', () => {
    it('throws ConflictException when a sibling already has that name', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(foldersService.create('user-1', { name: 'Fotos' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('creates a root folder when the name is free', async () => {
      prisma.folder.create.mockResolvedValue(root);

      const result = await foldersService.create('user-1', { name: 'Fotos' });

      expect(prisma.folder.create).toHaveBeenCalledWith({
        data: { name: 'Fotos', userId: 'user-1', parentId: null },
      });
      expect(result.name).toBe('Fotos');
    });

    it('creates a sub-folder under a parent the user owns', async () => {
      prisma.folder.findUnique.mockResolvedValue(root);
      prisma.folder.create.mockResolvedValue({ id: 'child', parentId: 'root' });

      await foldersService.create('user-1', { name: 'Bocetos', parentId: 'root' });

      expect(prisma.folder.create).toHaveBeenCalledWith({
        data: { name: 'Bocetos', userId: 'user-1', parentId: 'root' },
      });
    });

    it("rejects a sub-folder under another user's folder", async () => {
      prisma.folder.findUnique.mockResolvedValue({ ...root, userId: 'other-user' });
      await expect(
        foldersService.create('user-1', { name: 'Bocetos', parentId: 'root' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // La unicidad se valida por hermanos, no globalmente: el mismo nombre en dos ramas es válido.
    it('allows the same name under a different parent', async () => {
      prisma.folder.findUnique.mockResolvedValue(root);
      prisma.folder.create.mockResolvedValue({ id: 'child' });

      await foldersService.create('user-1', { name: 'Fotos', parentId: 'root' });

      expect(prisma.folder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parentId: 'root', name: 'Fotos' }),
        }),
      );
      expect(prisma.folder.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('renames without moving when parentId is absent', async () => {
      prisma.folder.findUnique.mockResolvedValue(root);
      prisma.folder.update.mockResolvedValue({ ...root, name: 'Obra' });

      await foldersService.update('root', 'user-1', { name: 'Obra' });

      expect(prisma.folder.update).toHaveBeenCalledWith({
        where: { id: 'root' },
        data: { name: 'Obra', parentId: null },
      });
    });

    it('throws ConflictException when renaming onto a sibling name', async () => {
      prisma.folder.findUnique.mockResolvedValue(root);
      prisma.folder.findFirst.mockResolvedValue({ id: 'other' });

      await expect(
        foldersService.update('root', 'user-1', { name: 'Obra' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.folder.update).not.toHaveBeenCalled();
    });

    it('moves a folder to the root when parentId is null', async () => {
      const child = { id: 'child', userId: 'user-1', name: 'Bocetos', parentId: 'root' };
      prisma.folder.findUnique.mockResolvedValue(child);
      prisma.folder.update.mockResolvedValue({ ...child, parentId: null });

      await foldersService.update('child', 'user-1', { parentId: null });

      expect(prisma.folder.update).toHaveBeenCalledWith({
        where: { id: 'child' },
        data: { name: 'Bocetos', parentId: null },
      });
    });

    it('rejects making a folder its own parent', async () => {
      prisma.folder.findUnique.mockResolvedValue(root);
      await expect(
        foldersService.update('root', 'user-1', { parentId: 'root' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // El ciclo es el riesgo real de las sub-carpetas: mover una carpeta dentro de su propia
    // descendencia deja un subárbol que ninguna consulta puede recorrer.
    it('rejects moving a folder into its own descendant', async () => {
      const grandChild = { id: 'grandchild', userId: 'user-1', name: 'Tinta', parentId: 'child' };
      prisma.folder.findUnique
        .mockResolvedValueOnce(root) // findOneOrFail de la carpeta movida
        .mockResolvedValueOnce(grandChild) // findOneOrFail del nuevo padre
        .mockResolvedValueOnce({ parentId: 'root' }); // ancestro: 'child' cuelga de 'root'

      await expect(
        foldersService.update('root', 'user-1', { parentId: 'grandchild' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.folder.update).not.toHaveBeenCalled();
    });
  });
  // Fase 2: la cascada de carpeta → archivos se detiene si alguno está en una publicación
  // (`post_media` referencia con `Restrict`); Postgres aborta el borrado completo.
  describe('remove', () => {
    it('translates the foreign key violation into a 409', async () => {
      prisma.folder.findUnique.mockResolvedValue(root);
      prisma.folder.delete.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: '5' }),
      );

      await expect(foldersService.remove('root', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('deletes the folder when nothing blocks the cascade', async () => {
      prisma.folder.findUnique.mockResolvedValue(root);

      await foldersService.remove('root', 'user-1');

      expect(prisma.folder.delete).toHaveBeenCalledWith({ where: { id: 'root' } });
    });
  });
});
