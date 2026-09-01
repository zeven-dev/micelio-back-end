import {
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { FoldersService } from '../folders/folders.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FilesService } from './files.service';

const MB = 1024 * 1024;

describe('FilesService', () => {
  let filesService: FilesService;
  let prisma: {
    fileAsset: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
  };
  let folders: { findOneOrFail: jest.Mock };
  let storage: jest.Mocked<StorageService>;

  // Los mismos valores que `.env.example`: el video son 250 MB, no los 100 hardcodeados que
  // tenía el código antes; el audio (Fase 1) son 50.
  const uploadLimits: Record<string, number> = {
    'uploads.maxImageMb': 15,
    'uploads.maxVideoMb': 250,
    'uploads.maxAudioMb': 50,
    'uploads.maxTextMb': 5,
    's3.signedUrlExpiresIn': 300,
  };

  beforeEach(() => {
    prisma = {
      fileAsset: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn((args: { data: unknown }) => ({
          id: 'file-1',
          createdAt: new Date(),
          ...(args.data as object),
        })),
        delete: jest.fn(),
      },
    };
    folders = { findOneOrFail: jest.fn().mockResolvedValue({ id: 'folder-1', userId: 'user-1' }) };
    storage = {
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/download'),
      getSignedUploadUrl: jest.fn().mockResolvedValue('https://signed.example/upload'),
      headObject: jest.fn().mockResolvedValue({ size: 1024 }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    filesService = new FilesService(
      prisma as unknown as PrismaService,
      folders as unknown as FoldersService,
      { get: jest.fn((key: string) => uploadLimits[key]) } as unknown as ConfigService,
      storage,
    );
  });

  describe('presign', () => {
    it('rejects a mime type outside the allowed list', async () => {
      await expect(
        filesService.presign('folder-1', 'user-1', {
          originalName: 'x.exe',
          mimeType: 'application/x-msdownload',
          size: 10,
        }),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    });

    // El límite sale de la configuración, no de una constante: un video de 200 MB entra
    // porque `UPLOAD_MAX_VIDEO_MB` son 250.
    it('accepts a video within the configured limit', async () => {
      const result = await filesService.presign('folder-1', 'user-1', {
        originalName: 'clip.mp4',
        mimeType: 'video/mp4',
        size: 200 * MB,
      });

      expect(result.key.startsWith('users/user-1/folders/folder-1/')).toBe(true);
      expect(result.uploadUrl).toBe('https://signed.example/upload');
    });

    it('rejects a video above the configured limit', async () => {
      await expect(
        filesService.presign('folder-1', 'user-1', {
          originalName: 'clip.mp4',
          mimeType: 'video/mp4',
          size: 300 * MB,
        }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });

    it('accepts audio (Fase 1) within UPLOAD_MAX_AUDIO_MB', async () => {
      const result = await filesService.presign('folder-1', 'user-1', {
        originalName: 'take-01.mp3',
        mimeType: 'audio/mpeg',
        size: 30 * MB,
      });

      expect(result.key.endsWith('.mp3')).toBe(true);
    });

    it('rejects audio above UPLOAD_MAX_AUDIO_MB', async () => {
      await expect(
        filesService.presign('folder-1', 'user-1', {
          originalName: 'take-01.wav',
          mimeType: 'audio/wav',
          size: 80 * MB,
        }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
    });
  });

  describe('confirm', () => {
    const confirmDto = {
      key: 'users/user-1/folders/folder-1/abc.mp3',
      originalName: 'take-01.mp3',
      mimeType: 'audio/mpeg',
      size: 1024,
    };

    it('fails when the object never reached S3', async () => {
      storage.headObject.mockResolvedValueOnce(null);
      await expect(filesService.confirm('folder-1', 'user-1', confirmDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // La URL prefirmada no impone tamaño: el `size` del cliente es una promesa, el de S3 es
    // el hecho. Se persiste el real, no el declarado.
    it('stores the size reported by S3, not the one the client declared', async () => {
      storage.headObject.mockResolvedValueOnce({ size: 4 * MB });

      const result = await filesService.confirm('folder-1', 'user-1', confirmDto);

      expect(prisma.fileAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ size: 4 * MB, type: 'AUDIO' }) }),
      );
      expect(result.size).toBe(4 * MB);
    });

    it('rejects and deletes an object that exceeds the limit on S3', async () => {
      storage.headObject.mockResolvedValueOnce({ size: 80 * MB });

      await expect(filesService.confirm('folder-1', 'user-1', confirmDto)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );

      expect(storage.delete).toHaveBeenCalledWith(confirmDto.key);
      expect(prisma.fileAsset.create).not.toHaveBeenCalled();
    });
  });
  // Fase 2: `post_media` referencia `file_assets` con `Restrict`, así que un archivo publicado
  // no se puede borrar. La fila va primero justo para no dejar la publicación sin binario.
  describe('remove', () => {
    beforeEach(() => {
      prisma.fileAsset.findUnique.mockResolvedValue({
        id: 'file-1',
        folderId: 'folder-1',
        key: 'users/user-1/folders/folder-1/1.png',
      });
    });

    it('deletes the row first and then the object in S3', async () => {
      await filesService.remove('file-1', 'user-1');

      expect(prisma.fileAsset.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
      expect(storage.delete).toHaveBeenCalledWith('users/user-1/folders/folder-1/1.png');
    });

    it('responds 409 and keeps the binary when the file is used in a post', async () => {
      prisma.fileAsset.delete.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: '5' }),
      );

      await expect(filesService.remove('file-1', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });
});
