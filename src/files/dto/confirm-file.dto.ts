import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ConfirmFileDto {
  @ApiProperty({ example: 'users/uuid/folders/uuid/uuid.png' })
  @IsString()
  @MinLength(1)
  key: string;

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

  @ApiPropertyOptional({
    description:
      'Ancho en píxeles, medido por el cliente. El binario nunca pasa por el backend, así que ' +
      'nadie más puede conocerlo. Opcional: sin él, el medio se dibuja cuadrado en el masonry.',
    example: 1080,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional({ description: 'Alto en píxeles (ver `width`).', example: 1350 })
  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;
}
