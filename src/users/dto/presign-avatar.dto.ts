import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class PresignAvatarDto {
  @ApiProperty({ example: 'image/png' })
  @IsString()
  @MinLength(1)
  mimeType: string;

  @ApiProperty({ example: 245678 })
  @IsInt()
  @Min(1)
  size: number;
}
