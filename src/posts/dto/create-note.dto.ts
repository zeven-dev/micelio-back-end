import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostBlockType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_RAW_TAGS } from './create-post.dto';
import {
  MAX_BLOCKS_PER_NOTE,
  MAX_BLOCK_TEXT_LENGTH,
  MAX_CAPTION_LENGTH,
} from '../utils/note-blocks.util';

/** Largo máximo del título de una nota. */
export const MAX_NOTE_TITLE_LENGTH = 140;

/**
 * Un bloque del cuerpo de una nota. La validación de forma básica va aquí (tipo, tamaños
 * máximos genéricos); las reglas que dependen del `type` de un campo hermano (qué es obligatorio
 * o está prohibido en cada uno) las aplica `assertBlocksAreValid` en el servicio — ver
 * `docs/API-CONTRACTS.md` ("Notas — Fase 4.6").
 */
export class NoteBlockInputDto {
  @ApiProperty({ enum: PostBlockType })
  @IsEnum(PostBlockType)
  type: PostBlockType;

  @ApiPropertyOptional({
    description: 'Texto de PARAGRAPH/HEADING/QUOTE. Prohibido en IMAGE.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BLOCK_TEXT_LENGTH)
  text?: string;

  @ApiPropertyOptional({
    description: 'Imagen de la biblioteca del autor. Obligatorio en IMAGE, prohibido en el resto.',
  })
  @IsOptional()
  @IsUUID()
  fileAssetId?: string;

  @ApiPropertyOptional({ description: 'Pie de foto opcional de un bloque IMAGE.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CAPTION_LENGTH)
  caption?: string;
}

export class CreateNoteDto {
  @ApiProperty({ example: 'Sobre el proceso' })
  @IsString()
  @MaxLength(MAX_NOTE_TITLE_LENGTH)
  title: string;

  @ApiPropertyOptional({
    description:
      'Etiquetas explícitas. El servidor las normaliza y les suma los #hashtags del título y ' +
      'de los bloques de texto; si tras normalizar quedan más de 10, responde 400.',
    example: ['opinión', 'proceso'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RAW_TAGS)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description:
      'Imagen de portada de la biblioteca del autor. Si falta, la tarjeta usa la primera ' +
      'imagen de `blocks`.',
  })
  @IsOptional()
  @IsUUID()
  coverFileAssetId?: string;

  @ApiProperty({
    type: [NoteBlockInputDto],
    description: 'Cuerpo de la nota, en orden de lectura.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BLOCKS_PER_NOTE)
  @ValidateNested({ each: true })
  @Type(() => NoteBlockInputDto)
  blocks: NoteBlockInputDto[];
}
