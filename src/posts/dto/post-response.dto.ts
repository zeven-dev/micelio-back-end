import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileType, PostBlockType, PostKind } from '@prisma/client';
import { UserPublicView } from '../../users/users.service';

/** Un medio de la publicación, con URL firmada y su vencimiento (nunca una URL cruda de S3). */
export class PostMediaResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  order: number;

  @ApiProperty({ enum: FileType })
  type: FileType;

  @ApiProperty()
  url: string;

  @ApiProperty()
  expiresAt: Date;

  /** Declarados por el cliente al publicar; nulos en audio/texto. Alimentan el masonry. */
  @ApiProperty({ nullable: true, type: Number })
  width: number | null;

  @ApiProperty({ nullable: true, type: Number })
  height: number | null;
}

/** Una imagen firmada suelta: la portada de una nota o la imagen de uno de sus bloques. */
export class PostImageResponseDto {
  @ApiProperty()
  url: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ nullable: true, type: Number })
  width: number | null;

  @ApiProperty({ nullable: true, type: Number })
  height: number | null;
}

/** Un bloque del cuerpo de una nota (Fase 4.6), en orden de lectura. */
export class PostBlockResponseDto {
  @ApiProperty()
  position: number;

  @ApiProperty({ enum: PostBlockType })
  type: PostBlockType;

  @ApiProperty({ nullable: true, type: String })
  text: string | null;

  @ApiProperty({ nullable: true, type: String })
  caption: string | null;

  @ApiProperty({ nullable: true, type: () => PostImageResponseDto })
  image: PostImageResponseDto | null;
}

/**
 * Forma exacta de `Post` en `docs/API-CONTRACTS.md`. `kind: MEDIA` trae `position`/`media`;
 * `kind: NOTE` los omite y trae `title`/`excerpt`/`cover`/`blocks` en su lugar — un cliente que
 * no conozca las notas debe ignorar los campos que no reconoce en vez de romperse.
 */
export class PostResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: PostKind })
  kind: PostKind;

  @ApiProperty({ type: () => UserPublicView })
  author: UserPublicView;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  viewerHasLiked: boolean;

  @ApiProperty()
  viewerHasSaved: boolean;

  /** **Solo** cuando el viewer es el autor; para cualquier otro el campo se omite. */
  @ApiPropertyOptional()
  likeCount?: number;

  @ApiProperty()
  commentCount: number;

  /** Solo en `kind: MEDIA`. */
  @ApiPropertyOptional()
  position?: number;

  /** Solo en `kind: MEDIA`. */
  @ApiPropertyOptional({ type: () => [PostMediaResponseDto] })
  media?: PostMediaResponseDto[];

  /** Solo en `kind: NOTE`. */
  @ApiPropertyOptional()
  title?: string;

  /** Solo en `kind: NOTE`: los primeros 200 caracteres del primer bloque PARAGRAPH, derivados
   * por el servidor. */
  @ApiPropertyOptional()
  excerpt?: string;

  /** Solo en `kind: NOTE`. `null` si el autor no eligió portada. */
  @ApiPropertyOptional({ nullable: true, type: () => PostImageResponseDto })
  cover?: PostImageResponseDto | null;

  /** Solo en `kind: NOTE`. */
  @ApiPropertyOptional({ type: () => [PostBlockResponseDto] })
  blocks?: PostBlockResponseDto[];
}

/** Respuesta de `PATCH /api/posts/reorder`. */
export class ReorderResponseDto {
  @ApiProperty()
  reordered: boolean;
}
