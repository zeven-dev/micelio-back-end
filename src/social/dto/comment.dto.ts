import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserPublicView } from '../../users/users.service';

/** Forma exacta de "### Comment" en `docs/API-CONTRACTS.md`. */
export class CommentDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: () => UserPublicView })
  author: UserPublicView;

  @ApiProperty()
  body: string;

  /** `null` = comentario raíz; no-nulo = respuesta (cuelga siempre de un raíz, un solo nivel). */
  @ApiProperty({ nullable: true, type: String })
  parentId: string | null;

  /** Solo se incluye en los comentarios raíz. */
  @ApiPropertyOptional()
  replyCount?: number;

  @ApiProperty()
  createdAt: Date;
}
