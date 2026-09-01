import { UnsupportedMediaTypeException } from '@nestjs/common';
import { FileType } from '@prisma/client';

const ALLOWED_MIME_TYPES: Record<FileType, string[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'],
  VIDEO: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'],
  AUDIO: [
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/webm',
    'audio/flac',
  ],
  TEXT: ['text/plain', 'text/markdown', 'text/csv'],
};

export const BYTES_PER_MB = 1024 * 1024;

/**
 * Clave de configuración (`uploads.*`) con el peso máximo de cada tipo. Los valores viven en
 * variables de entorno (`UPLOAD_MAX_*_MB`), no aquí: subir un límite es cambiar el `.env`.
 * El audio se valida **solo por peso, nunca por duración** (decisión #11 de `PRODUCT.md`).
 */
export const MAX_SIZE_CONFIG_KEY: Record<FileType, string> = {
  IMAGE: 'uploads.maxImageMb',
  VIDEO: 'uploads.maxVideoMb',
  AUDIO: 'uploads.maxAudioMb',
  TEXT: 'uploads.maxTextMb',
};

/** Etiqueta en español de cada tipo, para los mensajes de error de tamaño. */
export const FILE_TYPE_LABEL: Record<FileType, string> = {
  IMAGE: 'imagen',
  VIDEO: 'video',
  AUDIO: 'audio',
  TEXT: 'texto',
};

export function resolveFileType(mimeType: string): FileType {
  for (const [type, mimeTypes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimeTypes.includes(mimeType)) {
      return type as FileType;
    }
  }
  throw new UnsupportedMediaTypeException(
    `Tipo de archivo no soportado: ${mimeType}. ` +
      'Solo se permiten imágenes, videos, audios y archivos de texto.',
  );
}
