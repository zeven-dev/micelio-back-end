import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FoldersService } from './folders.service';

describe('FoldersService', () => {
  let foldersService: FoldersService;
  let prisma: {
    folder: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      folder: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    foldersService = new FoldersService(prisma as unknown as PrismaService);
  });

  it('lists folders scoped to the requesting user', async () => {
    prisma.folder.findMany.mockResolvedValue([]);
    await foldersService.findAllForUser('user-1');
    expect(prisma.folder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('throws NotFoundException when the folder does not exist', async () => {
    prisma.folder.findUnique.mockResolvedValue(null);
    await expect(foldersService.findOneOrFail('missing', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when the folder belongs to another user', async () => {
    prisma.folder.findUnique.mockResolvedValue({ id: 'f1', userId: 'other-user' });
    await expect(foldersService.findOneOrFail('f1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws ConflictException when creating a duplicate folder name', async () => {
    prisma.folder.findUnique.mockResolvedValue({ id: 'f1', userId: 'user-1', name: 'Fotos' });
    await expect(foldersService.create('user-1', { name: 'Fotos' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a folder when the name is not taken', async () => {
    prisma.folder.findUnique.mockResolvedValue(null);
    prisma.folder.create.mockResolvedValue({ id: 'f1', userId: 'user-1', name: 'Fotos' });

    const result = await foldersService.create('user-1', { name: 'Fotos' });

    expect(prisma.folder.create).toHaveBeenCalledWith({
      data: { name: 'Fotos', userId: 'user-1' },
    });
    expect(result.name).toBe('Fotos');
  });
});
