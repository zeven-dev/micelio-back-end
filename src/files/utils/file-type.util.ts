import { UnsupportedMediaTypeException } from '@nestjs/common';
import { FileType } from '@prisma/client';

const ALLOWED_MIME_TYPES: Record<FileType, string[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
  VIDEO: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'],
  TEXT: ['text/plain', 'text/markdown', 'text/csv'],
};

export const BYTES_PER_MB = 1024 * 1024;

/**
 * Holgura del tope de Multer sobre el límite real. Multer solo sabe abortar con un
 * `File too large` genérico en inglés; con este margen, un archivo apenas pasado del límite
 * llega al servicio y recibe el mensaje exacto ("supera el tamaño máximo para imagen (15 MB)").
 * El tope de Multer sigue siendo la guarda dura de memoria para algo desproporcionado.
 */
export const UPLOAD_CEILING_HEADROOM_BYTES = BYTES_PER_MB;

/**
 * Clave de configuración (`uploads.*`) con el peso máximo de cada tipo. Los valores viven en
 * variables de entorno (`UPLOAD_MAX_*_MB`), no aquí: subir un límite es cambiar el `.env`.
 */
export const MAX_SIZE_CONFIG_KEY: Record<FileType, string> = {
  IMAGE: 'uploads.maxImageMb',
  VIDEO: 'uploads.maxVideoMb',
  TEXT: 'uploads.maxTextMb',
};

export const MAX_FILE_SIZE_BYTES: Record<FileType, number> = {
  IMAGE: 15 * BYTES_PER_MB,
  VIDEO: 100 * BYTES_PER_MB,
  TEXT: 5 * BYTES_PER_MB,
}

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
