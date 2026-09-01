import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class PresignFileDto {
  @ApiProperty({ example: 'boceto.png' })
  @IsString()
  @MinLength(1)
  originalName: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @MinLength(1)
  mimeType: string;

  @ApiProperty({ example: 245678 })
  @IsInt()
  @Min(1)
  size: number;
}
