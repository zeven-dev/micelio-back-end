import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Límite de longitud de un comentario. `API-CONTRACTS.md` solo pide "razonable" (ambigüedad
 * real, sin opción única): se elige un tope bastante menor al de la descripción de un post
 * (2200) porque un comentario es una respuesta corta, no una pieza de contenido.
 */
export const MAX_COMMENT_LENGTH = 1000;

/** `POST /api/posts/:id/comments`. */
export class CreateCommentDto {
  @ApiProperty({ example: 'Qué buena paleta de color', maxLength: MAX_COMMENT_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_LENGTH)
  body: string;

  @ApiPropertyOptional({
    description:
      'Comentario al que responde. Si apunta a una respuesta (no a un raíz), el servidor lo ' +
      'cuelga del mismo raíz: la profundidad nunca pasa de un nivel.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
