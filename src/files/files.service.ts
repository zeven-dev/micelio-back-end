import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { FoldersService } from '../folders/folders.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { ConfirmFileDto } from './dto/confirm-file.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { PresignResponseDto } from './dto/presign-response.dto';
import { BYTES_PER_MB, MAX_FILE_SIZE_BYTES, resolveFileType } from './utils/file-type.util';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foldersService: FoldersService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) { }

  /** Peso máximo del tipo, leído de la configuración (`UPLOAD_MAX_*_MB`) en cada subida. */
  // private maxBytesFor(type: FileType): number {
  //   return this.configService.get<number>(MAX_FILE_SIZE_BYTES[type])! * BYTES_PER_MB;
  // }

  async findAllForFolder(folderId: string, userId: string): Promise<FileResponseDto[]> {
    await this.foldersService.findOneOrFail(folderId, userId);
    const files = await this.prisma.fileAsset.findMany({
      where: { folderId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(files.map((file) => this.toResponseDto(file)));
  }

  async presign(
    folderId: string,
    userId: string,
    dto: PresignFileDto,
  ): Promise<PresignResponseDto> {
    await this.foldersService.findOneOrFail(folderId, userId);

    const type = resolveFileType(dto.mimeType);
    if (dto.size > MAX_FILE_SIZE_BYTES[type]) {
      throw new PayloadTooLargeException(
        `El archivo supera el tamaño máximo permitido para ${type.toLowerCase()} ` +
        `(${Math.floor(MAX_FILE_SIZE_BYTES[type] / BYTES_PER_MB)} MB)`,
      );
    }

    const key = `users/${userId}/folders/${folderId}/${randomUUID()}${extname(dto.originalName)}`;
    const expiresIn = this.configService.get<number>('s3.signedUrlExpiresIn') ?? 300;
    const uploadUrl = await this.storageService.getSignedUploadUrl(key, dto.mimeType, expiresIn);

    return { key, uploadUrl, expiresIn };
  }

  async confirm(folderId: string, userId: string, dto: ConfirmFileDto): Promise<FileResponseDto> {
    await this.foldersService.findOneOrFail(folderId, userId);

    const expectedPrefix = `users/${userId}/folders/${folderId}/`;
    if (!dto.key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('La key subida no corresponde a esta carpeta');
    }

    const type = resolveFileType(dto.mimeType);
    if (dto.size > MAX_FILE_SIZE_BYTES[type]) {
      throw new PayloadTooLargeException(
        `El archivo supera el tamaño máximo permitido para ${type.toLowerCase()}`,
      );
    }

    const uploaded = await this.storageService.headObject(dto.key);
    if (!uploaded) {
      throw new NotFoundException(
        'El archivo todavía no llegó a S3; sube el binario antes de confirmar',
      );
    }

    const created = await this.prisma.fileAsset.create({
      data: {
        folderId,
        originalName: dto.originalName,
        key: dto.key,
        mimeType: dto.mimeType,
        type,
        size: dto.size,
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
