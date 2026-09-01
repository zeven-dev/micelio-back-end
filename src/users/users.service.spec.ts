import {
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  let configService: ConfigService;

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
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/avatar.png'),
      getSignedUploadUrl: jest.fn().mockResolvedValue('https://signed.example/upload'),
      headObject: jest.fn().mockResolvedValue({ size: 1024 }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    // Mock por clave, no un valor único: el avatar tiene su propio tope
    // (`uploads.maxAvatarMb`) y confundirlo con otro valor es justo el error que estas
    // pruebas vigilan.
    configService = {
      get: jest.fn((key: string) => (key === 'uploads.maxAvatarMb' ? 5 : 300)),
    } as unknown as ConfigService;
    usersService = new UsersService(prisma as unknown as PrismaService, configService, storage);
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

    // La ruta es `@OptionalAuth()`: se comparte por link, así que puede no haber viewer.
    describe('viewed by an anonymous visitor (no session)', () => {
      it('includes bio for a public profile', async () => {
        prisma.user.findUnique.mockResolvedValue({ ...baseUser, isPublic: true, bio: 'Hola' });

        const result = await usersService.getPublicProfile('ada');

        expect(result.bio).toBe('Hola');
      });

      it('omits bio for a private profile', async () => {
        prisma.user.findUnique.mockResolvedValue({ ...baseUser, isPublic: false, bio: 'Hola' });

        const result = await usersService.getPublicProfile('ada');

        expect(result.bio).toBeUndefined();
        expect(result.username).toBe('ada');
      });

      // Sin viewer, `user.id === viewerId` no debe volverse cierto por comparar undefined
      // contra un id ausente: un perfil privado sin dueño nunca se abre.
      it('never treats the anonymous visitor as the owner', async () => {
        prisma.user.findUnique.mockResolvedValue({
          ...baseUser,
          id: undefined,
          isPublic: false,
          bio: 'Hola',
        });

        const result = await usersService.getPublicProfile('ada');

        expect(result.bio).toBeUndefined();
      });
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

  describe('presignAvatar', () => {
    it('throws UnsupportedMediaTypeException for a disallowed mime type', async () => {
      await expect(
        usersService.presignAvatar('user-1', { mimeType: 'application/pdf', size: 100 }),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    });

    it('throws PayloadTooLargeException when the declared size exceeds the limit', async () => {
      await expect(
        usersService.presignAvatar('user-1', {
          mimeType: 'image/png',
          size: 10 * 1024 * 1024,
        }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });

    it('returns a signed upload URL scoped to the user', async () => {
      const result = await usersService.presignAvatar('user-1', {
        mimeType: 'image/png',
        size: 1024,
      });

      expect(result.key.startsWith('avatars/user-1/')).toBe(true);
      expect(result.uploadUrl).toBe('https://signed.example/upload');
    });
  });

  describe('updateAvatar', () => {
    it('throws ForbiddenException when the key does not belong to the user', async () => {
      await expect(
        usersService.updateAvatar('user-1', { key: 'avatars/other-user/x.png' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when the object never reached S3', async () => {
      storage.headObject.mockResolvedValueOnce(null);
      await expect(
        usersService.updateAvatar('user-1', { key: 'avatars/user-1/new.png' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('confirms the avatar and deletes the previous one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        avatarKey: 'avatars/user-1/old.png',
      });
      prisma.user.update.mockResolvedValue({ ...baseUser, avatarKey: 'avatars/user-1/new.png' });

      await usersService.updateAvatar('user-1', { key: 'avatars/user-1/new.png' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { avatarKey: 'avatars/user-1/new.png' },
      });
      expect(storage.delete).toHaveBeenCalledWith('avatars/user-1/old.png');
    });

    // La URL prefirmada no impone tamaño: el `size` del presign era una promesa del cliente.
    // Solo el tamaño real de S3 decide, y el binario pasado de peso no puede quedar en el bucket.
    it('rejects and deletes an object that exceeds the limit on S3', async () => {
      storage.headObject.mockResolvedValueOnce({ size: 10 * 1024 * 1024 });

      await expect(
        usersService.updateAvatar('user-1', { key: 'avatars/user-1/big.png' }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);

      expect(storage.delete).toHaveBeenCalledWith('avatars/user-1/big.png');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
