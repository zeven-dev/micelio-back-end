import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileType } from '@prisma/client';
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

/** Forma exacta de `Post` en `docs/API-CONTRACTS.md`. */
export class PostResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: () => UserPublicView })
  author: UserPublicView;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty()
  position: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: () => [PostMediaResponseDto] })
  media: PostMediaResponseDto[];

  @ApiProperty()
  viewerHasLiked: boolean;

  @ApiProperty()
  viewerHasSaved: boolean;

  /** **Solo** cuando el viewer es el autor; para cualquier otro el campo se omite. */
  @ApiPropertyOptional()
  likeCount?: number;

  @ApiProperty()
  commentCount: number;
}

/** Respuesta de `PATCH /api/posts/reorder`. */
export class ReorderResponseDto {
  @ApiProperty()
  reordered: boolean;
}
