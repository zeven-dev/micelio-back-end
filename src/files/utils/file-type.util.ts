import { UnsupportedMediaTypeException } from '@nestjs/common';
import { FileType } from '@prisma/client';

const ALLOWED_MIME_TYPES: Record<FileType, string[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
  VIDEO: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'],
  TEXT: ['text/plain', 'text/markdown', 'text/csv'],
};

export const MAX_FILE_SIZE_BYTES: Record<FileType, number> = {
  IMAGE: 15 * 1024 * 1024, // 15 MB
  VIDEO: 250 * 1024 * 1024, // 250 MB
  TEXT: 5 * 1024 * 1024, // 5 MB
};

export function resolveFileType(mimeType: string): FileType {
  for (const [type, mimeTypes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimeTypes.includes(mimeType)) {
      return type as FileType;
    }
  }
  throw new UnsupportedMediaTypeException(
    `Tipo de archivo no soportado: ${mimeType}. Solo se permiten imágenes, videos y archivos de texto.`,
  );
}
