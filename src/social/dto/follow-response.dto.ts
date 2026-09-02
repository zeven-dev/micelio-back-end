import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserPublicView } from '../../users/users.service';

/** Estado resultante de seguir / dejar de seguir / marcar favorito. */
export class FollowStateDto {
  @ApiProperty()
  following: boolean;

  /** Solo cuando se sigue: quien no sigue a alguien no puede tenerlo como favorito. */
  @ApiPropertyOptional()
  isFavorite?: boolean;
}

export class FollowingItemDto {
  @ApiProperty({ type: () => UserPublicView })
  user: UserPublicView;

  @ApiProperty()
  isFavorite: boolean;

  @ApiProperty()
  since: Date;
}

/** En los seguidores no hay `isFavorite`: esa marca es de quien sigue, no de quien es seguido. */
export class FollowerItemDto {
  @ApiProperty({ type: () => UserPublicView })
  user: UserPublicView;

  @ApiProperty()
  since: Date;
}
