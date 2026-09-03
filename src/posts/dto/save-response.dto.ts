import { ApiProperty } from '@nestjs/swagger';
import { PostResponseDto } from './post-response.dto';

/** Estado resultante de guardar / quitar de guardados. */
export class SaveStateDto {
  @ApiProperty()
  saved: boolean;
}

/** Item de `GET /api/me/saved`. */
export class SavedPostItemDto {
  @ApiProperty({ type: () => PostResponseDto })
  post: PostResponseDto;

  @ApiProperty()
  savedAt: Date;
}
