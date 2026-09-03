import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_COMMENT_LENGTH } from './create-comment.dto';

/** `PATCH /api/comments/:id`. Solo el autor; el cuerpo completo, no un parche por caracteres. */
export class UpdateCommentDto {
  @ApiProperty({ maxLength: MAX_COMMENT_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_LENGTH)
  body: string;
}
