import { FileType } from '@prisma/client';
import { UserPublicView } from '../../users/users.service';

/** Un medio de la publicación, con URL firmada y su vencimiento (nunca una URL cruda de S3). */
export class PostMediaResponseDto {
  id: string;
  order: number;
  type: FileType;
  url: string;
  expiresAt: Date;
  /** Declarados por el cliente al publicar; nulos en audio/texto. Alimentan el masonry. */
  width: number | null;
  height: number | null;
}

/** Forma exacta de `Post` en `docs/API-CONTRACTS.md`. */
export class PostResponseDto {
  id: string;
  author: UserPublicView;
  description: string | null;
  tags: string[];
  position: number;
  createdAt: Date;
  media: PostMediaResponseDto[];
  viewerHasLiked: boolean;
  viewerHasSaved: boolean;
  /** **Solo** cuando el viewer es el autor; para cualquier otro el campo se omite. */
  likeCount?: number;
  commentCount: number;
}

/** Respuesta de `PATCH /api/posts/reorder`. */
export class ReorderResponseDto {
  reordered: boolean;
}
