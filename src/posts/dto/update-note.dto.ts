import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_RAW_TAGS } from './create-post.dto';
import { MAX_NOTE_TITLE_LENGTH, NoteBlockInputDto } from './create-note.dto';
import { MAX_BLOCKS_PER_NOTE } from '../utils/note-blocks.util';

/**
 * Edición parcial: la clave ausente no se toca. `blocks` presente **reemplaza la lista
 * completa** (no hay deltas), igual que `media` en publicaciones. `coverFileAssetId: null` quita
 * la portada.
 */
export class UpdateNoteDto {
  @ApiPropertyOptional({ example: 'Versión final del proceso' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_TITLE_LENGTH)
  title?: string;

  @ApiPropertyOptional({ example: ['opinión', 'proceso'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RAW_TAGS)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  coverFileAssetId?: string | null;

  @ApiPropertyOptional({ type: [NoteBlockInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BLOCKS_PER_NOTE)
  @ValidateNested({ each: true })
  @Type(() => NoteBlockInputDto)
  blocks?: NoteBlockInputDto[];
}
