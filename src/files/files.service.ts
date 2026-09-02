import {
  ConflictException,
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
import { isForeignKeyViolation } from '../common/utils/prisma-errors.util';
import { FoldersService } from '../folders/folders.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { ConfirmFileDto } from './dto/confirm-file.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { PresignResponseDto } from './dto/presign-response.dto';
import {
  BYTES_PER_MB,
  FILE_TYPE_LABEL,
  MAX_SIZE_CONFIG_KEY,
  resolveFileType,
} from './utils/file-type.util';
import { libraryFolderPrefix } from './utils/library-key.util';

/**
 * Lo mínimo que otro módulo necesita de un archivo de biblioteca para construir su propia
 * respuesta (hoy: `posts`, que arma los medios de una publicación). Es la frontera de este
 * módulo: nadie más consulta `file_assets` con Prisma (regla 7 de `AGENTS.md`).
 */
export interface LibraryAssetRef {
  id: string;
  type: FileType;
  key: string;
  /** Dimensiones del archivo; las publicaciones las heredan para el masonry. */
  width: number | null;
  height: number | null;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foldersService: FoldersService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  /** Peso máximo del tipo, leído de la configuración (`UPLOAD_MAX_*_MB`) en cada subida. */
  private maxBytesFor(type: FileType): number {
    return this.configService.get<number>(MAX_SIZE_CONFIG_KEY[type])! * BYTES_PER_MB;
  }

  private assertWithinLimit(type: FileType, size: number): void {
    const maxBytes = this.maxBytesFor(type);
    if (size > maxBytes) {
      throw new PayloadTooLargeException(
        `El archivo supera el tamaño máximo permitido para ${FILE_TYPE_LABEL[type]} ` +
          `(${Math.floor(maxBytes / BYTES_PER_MB)} MB)`,
      );
    }
  }

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
    this.assertWithinLimit(type, dto.size);

    const key = `${libraryFolderPrefix(userId, folderId)}${randomUUID()}${extname(dto.originalName)}`;
    const expiresIn = this.configService.get<number>('s3.signedUrlExpiresIn') ?? 300;
    const uploadUrl = await this.storageService.getSignedUploadUrl(key, dto.mimeType, expiresIn);

    return { key, uploadUrl, expiresIn };
  }

  async confirm(folderId: string, userId: string, dto: ConfirmFileDto): Promise<FileResponseDto> {
    await this.foldersService.findOneOrFail(folderId, userId);

    const expectedPrefix = libraryFolderPrefix(userId, folderId);
    if (!dto.key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('La key subida no corresponde a esta carpeta');
    }

    const type = resolveFileType(dto.mimeType);
    this.assertWithinLimit(type, dto.size);

    const uploaded = await this.storageService.headObject(dto.key);
    if (!uploaded) {
      throw new NotFoundException(
        'El archivo todavía no llegó a S3; sube el binario antes de confirmar',
      );
    }

    // El `size` del DTO es lo que el cliente *dice* que subió; la URL prefirmada no impone
    // tamaño, así que el único dato confiable es el que devuelve S3. Se valida contra el
    // límite y se persiste ese, no el declarado. Si se pasó, el binario se borra: sin fila
    // en la base nadie lo volvería a encontrar para limpiarlo.
    try {
      this.assertWithinLimit(type, uploaded.size);
    } catch (error) {
      await this.storageService.delete(dto.key);
      throw error;
    }

    const created = await this.prisma.fileAsset.create({
      data: {
        folderId,
        originalName: dto.originalName,
        key: dto.key,
        mimeType: dto.mimeType,
        type,
        size: uploaded.size,
        // Las dimensiones sí las manda el cliente y se guardan tal cual: el binario no pasa por
        // aquí, así que no hay forma de medirlas en el servidor. Son opcionales a propósito —
        // que fallen al medirse no puede impedir una subida.
        width: dto.width ?? null,
        height: dto.height ?? null,
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

    // La fila va primero: la FK `Restrict` de `post_media` puede frenar el borrado (el archivo
    // está en una publicación) y borrar el binario antes dejaría la publicación apuntando a un
    // objeto que ya no existe en S3.
    try {
      await this.prisma.fileAsset.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'No puedes borrar un archivo que está en una publicación; borra primero la publicación',
        );
      }
      throw error;
    }
    await this.storageService.delete(file.key);
  }

  /**
   * Archivos de la biblioteca **del usuario**, para que otro módulo arme sus propios medios.
   * Falla si alguno no existe (`404`) o no es suyo (`403`, vía `FoldersService`).
   */
  async findOwnedByUser(ids: string[], userId: string): Promise<LibraryAssetRef[]> {
    const files = await this.prisma.fileAsset.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true, key: true, width: true, height: true, folderId: true },
    });
    if (files.length !== new Set(ids).size) {
      throw new NotFoundException('Alguno de los archivos no existe en tu biblioteca');
    }
    // La propiedad se comprueba por carpeta, que es de `folders`: una consulta por carpeta
    // distinta, no por archivo.
    const folderIds = [...new Set(files.map((file) => file.folderId))];
    await Promise.all(
      folderIds.map((folderId) => this.foldersService.findOneOrFail(folderId, userId)),
    );

    return files.map(({ id, type, key, width, height }) => ({ id, type, key, width, height }));
  }

  /**
   * Los mismos datos sin control de propiedad: sirve para pintar los medios de contenido ajeno
   * cuya visibilidad ya validó quien llama (p. ej. una publicación pública).
   */
  async findManyByIds(ids: string[]): Promise<LibraryAssetRef[]> {
    const files = await this.prisma.fileAsset.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true, key: true, width: true, height: true },
    });
    return files;
  }

  private async toResponseDto(file: {
    id: string;
    folderId: string;
    originalName: string;
    key: string;
    mimeType: string;
    type: import('@prisma/client').FileType;
    size: number;
    width: number | null;
    height: number | null;
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
      width: file.width,
      height: file.height,
      url,
      createdAt: file.createdAt,
    };
  }
}
