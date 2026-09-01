import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_MEDIA_PER_POST,
  MAX_RAW_TAGS,
  PostMediaInputDto,
} from './create-post.dto';

/**
 * Edición parcial: la clave ausente no se toca. `media` presente **reemplaza la lista
 * completa** (no hay deltas), igual que `orderedIds` en el reordenamiento.
 */
export class UpdatePostDto {
  @ApiPropertyOptional({ example: 'Versión final del mural #proceso' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({ example: ['mural', 'proceso'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RAW_TAGS)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [PostMediaInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MEDIA_PER_POST)
  @ValidateNested({ each: true })
  @Type(() => PostMediaInputDto)
  media?: PostMediaInputDto[];
}
