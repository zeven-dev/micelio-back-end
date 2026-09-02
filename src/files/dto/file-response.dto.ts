import { ApiProperty } from '@nestjs/swagger';
import { FileType } from '@prisma/client';

export class FileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  folderId: string;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty({ enum: FileType })
  type: FileType;

  @ApiProperty()
  size: number;

  /** Dimensiones declaradas al subir; nulas en audio, texto y archivos anteriores a la Fase 2. */
  @ApiProperty({ nullable: true, type: Number })
  width: number | null;

  @ApiProperty({ nullable: true, type: Number })
  height: number | null;

  @ApiProperty()
  url: string;

  @ApiProperty()
  createdAt: Date;
}
