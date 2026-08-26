import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { FoldersService } from '../folders/folders.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { FileResponseDto } from './dto/file-response.dto';
import { MAX_FILE_SIZE_BYTES, resolveFileType } from './utils/file-type.util';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foldersService: FoldersService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  async findAllForFolder(folderId: string, userId: string): Promise<FileResponseDto[]> {
    await this.foldersService.findOneOrFail(folderId, userId);
    const files = await this.prisma.fileAsset.findMany({
      where: { folderId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(files.map((file) => this.toResponseDto(file)));
  }

  async upload(
    folderId: string,
    userId: string,
    file: UploadedFile | undefined,
  ): Promise<FileResponseDto> {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    await this.foldersService.findOneOrFail(folderId, userId);

    const type = resolveFileType(file.mimetype);
    if (file.size > MAX_FILE_SIZE_BYTES[type]) {
      throw new PayloadTooLargeException(
        `El archivo supera el tamaño máximo permitido para ${type.toLowerCase()}`,
      );
    }

    const key = `users/${userId}/folders/${folderId}/${randomUUID()}${extname(file.originalname)}`;
    await this.storageService.upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    const created = await this.prisma.fileAsset.create({
      data: {
        folderId,
        originalName: file.originalname,
        key,
        mimeType: file.mimetype,
        type,
        size: file.size,
      },
    });

    return this.toResponseDto(created);
  }

  async remove(id: string, userId: string): Promise<void> {
    const file = await this.prisma.fileAsset.findUnique({
      where: { id },
      include: { folder: true },
    });
    if (!file) {
      throw new NotFoundException('Archivo no encontrado');
    }
    await this.foldersService.findOneOrFail(file.folderId, userId);

    await this.storageService.delete(file.key);
    await this.prisma.fileAsset.delete({ where: { id } });
  }

  private async toResponseDto(file: {
    id: string;
    folderId: string;
    originalName: string;
    key: string;
    mimeType: string;
    type: import('@prisma/client').FileType;
    size: number;
    createdAt: Date;
  }): Promise<FileResponseDto> {
    const url = await this.storageService.getSignedDownloadUrl(file.key);
    return {
      id: file.id,
      folderId: file.folderId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      type: file.type,
      size: file.size,
      url,
      createdAt: file.createdAt,
    };
  }
}
