import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Máximo de medios por publicación (un carrusel, no una galería entera). */
export const MAX_MEDIA_PER_POST = 10;

/** Tope de etiquetas **sin normalizar** que acepta el body; el tope real (10) se valida después. */
export const MAX_RAW_TAGS = 30;

/** Largo máximo de la descripción. */
export const MAX_DESCRIPTION_LENGTH = 2200;

export class PostMediaInputDto {
  @ApiProperty({ description: 'Archivo de la biblioteca del autor.' })
  @IsUUID()
  fileAssetId: string;

  @ApiPropertyOptional({
    description:
      'Ancho en píxeles, medido por el cliente al publicar. El binario nunca pasa por el ' +
      'backend, así que nadie más lo conoce. Sin sentido para audio/texto.',
    example: 1080,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional({ description: 'Alto en píxeles (ver `width`).', example: 1350 })
  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;
}

export class CreatePostDto {
  @ApiPropertyOptional({ example: 'Bocetos del mural #proceso' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Etiquetas explícitas. El servidor las normaliza y les suma los #hashtags de la ' +
      'descripción; si tras normalizar quedan más de 10, responde 400.',
    example: ['ilustración', 'proceso'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RAW_TAGS)
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ type: [PostMediaInputDto], description: 'Medios en el orden del carrusel.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MEDIA_PER_POST)
  @ValidateNested({ each: true })
  @Type(() => PostMediaInputDto)
  media: PostMediaInputDto[];
}
