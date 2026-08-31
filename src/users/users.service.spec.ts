import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let storage: jest.Mocked<StorageService>;

  const baseUser = {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: 'hash',
    name: 'Ada Lovelace',
    username: 'ada',
    cedula: '1020304050',
    role: 'USER',
    bio: null,
    avatarKey: null,
    isPublic: false,
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    storage = {
      upload: jest.fn().mockResolvedValue({ key: 'avatars/user-1/new.png' }),
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/avatar.png'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    usersService = new UsersService(prisma as unknown as PrismaService, storage);
  });

  describe('getPublicProfile', () => {
    it('throws NotFoundException when the username does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(usersService.getPublicProfile('missing', 'viewer-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('omits bio for a private profile viewed by a stranger', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isPublic: false });

      const result = await usersService.getPublicProfile('ada', 'other-user');

      expect(result.bio).toBeUndefined();
      expect(result.followersCount).toBe(0);
    });

    it('includes bio for a public profile', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isPublic: true, bio: 'Hola' });

      const result = await usersService.getPublicProfile('ada', 'other-user');

      expect(result.bio).toBe('Hola');
    });

    it('includes bio when the viewer is the owner, even if private', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isPublic: false, bio: 'Hola' });

      const result = await usersService.getPublicProfile('ada', 'user-1');

      expect(result.bio).toBe('Hola');
    });
  });

  describe('getMe', () => {
    it('includes email and role, never the cedula', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await usersService.getMe('user-1');

      expect(result.email).toBe('ada@example.com');
      expect(result.role).toBe('USER');
      expect(result).not.toHaveProperty('cedula');
    });
  });

  describe('updateAvatar', () => {
    it('throws BadRequestException when no file is provided', async () => {
      await expect(usersService.updateAvatar('user-1', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws UnsupportedMediaTypeException for a disallowed mime type', async () => {
      const file = { mimetype: 'application/pdf', size: 100 } as Express.Multer.File;
      await expect(usersService.updateAvatar('user-1', file)).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
    });

    it('throws PayloadTooLargeException when the file exceeds the limit', async () => {
      const file = {
        mimetype: 'image/png',
        size: 10 * 1024 * 1024,
      } as Express.Multer.File;
      await expect(usersService.updateAvatar('user-1', file)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
    });

    it('uploads the avatar and deletes the previous one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        avatarKey: 'avatars/user-1/old.png',
      });
      prisma.user.update.mockResolvedValue({ ...baseUser, avatarKey: 'avatars/user-1/new.png' });
      const file = {
        mimetype: 'image/png',
        size: 1024,
        originalname: 'avatar.png',
        buffer: Buffer.from('fake'),
      } as Express.Multer.File;

      await usersService.updateAvatar('user-1', file);

      expect(storage.upload).toHaveBeenCalled();
      expect(storage.delete).toHaveBeenCalledWith('avatars/user-1/old.png');
    });
  });
});
