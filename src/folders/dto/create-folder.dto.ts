import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({ example: 'Vacaciones 2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}
