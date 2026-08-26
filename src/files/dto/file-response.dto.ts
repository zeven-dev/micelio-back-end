import { FileType } from '@prisma/client';

export class FileResponseDto {
  id: string;
  folderId: string;
  originalName: string;
  mimeType: string;
  type: FileType;
  size: number;
  url: string;
  createdAt: Date;
}
