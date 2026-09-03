import { ApiProperty } from '@nestjs/swagger';
import { UserPublicView } from '../../users/users.service';

/** Estado resultante de dar / quitar like. */
export class LikeStateDto {
  @ApiProperty()
  liked: boolean;
}

/** Item de `GET /api/posts/:id/likes` — solo lo ve el autor del post. */
export class LikeListItemDto {
  @ApiProperty({ type: () => UserPublicView })
  user: UserPublicView;

  @ApiProperty()
  likedAt: Date;
}

/**
 * Forma propia de `GET /api/posts/:id/likes` (`docs/API-CONTRACTS.md`, "Likes — Fase 4"):
 * lleva `total` además de la paginación estándar, así que no usa `ApiCursorPaginatedResponse`.
 */
export class LikeListResponseDto {
  @ApiProperty()
  total: number;

  @ApiProperty({ type: () => [LikeListItemDto] })
  items: LikeListItemDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;
}
