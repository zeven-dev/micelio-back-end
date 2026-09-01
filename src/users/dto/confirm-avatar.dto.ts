import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ConfirmAvatarDto {
  @ApiProperty({ example: 'avatars/uuid/uuid.png' })
  @IsString()
  @MinLength(1)
  key: string;
}
