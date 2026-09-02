import { UserPublicView } from '../../users/users.service';

/** Estado resultante de seguir / dejar de seguir / marcar favorito. */
export class FollowStateDto {
  following: boolean;
  /** Solo cuando se sigue: quien no sigue a alguien no puede tenerlo como favorito. */
  isFavorite?: boolean;
}

export class FollowingItemDto {
  user: UserPublicView;
  isFavorite: boolean;
  since: Date;
}

/** En los seguidores no hay `isFavorite`: esa marca es de quien sigue, no de quien es seguido. */
export class FollowerItemDto {
  user: UserPublicView;
  since: Date;
}
