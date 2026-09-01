import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({ example: 'Vacaciones 2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: 'Carpeta madre. Ausente o null = carpeta raíz.',
    example: '3f4d1e6a-0b2c-4d8e-9f10-1a2b3c4d5e6f',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
