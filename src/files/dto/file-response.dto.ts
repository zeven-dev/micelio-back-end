import { FileType } from '@prisma/client';

export class FileResponseDto {
  id: string;
  folderId: string;
  originalName: string;
  mimeType: string;
  type: FileType;
  size: number;
  /** Dimensiones declaradas al subir; nulas en audio, texto y archivos anteriores a la Fase 2. */
  width: number | null;
  height: number | null;
  url: string;
  createdAt: Date;
}
