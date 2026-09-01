import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * Renombrar y/o mover. No hereda de `CreateFolderDto` con `PartialType` porque `parentId`
 * necesita aceptar `null` explícito ("mover a la raíz") y distinguirlo de "no lo toques".
 */
export class UpdateFolderDto {
  @ApiPropertyOptional({ example: 'Vacaciones 2026' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'Nueva carpeta madre. `null` mueve la carpeta a la raíz; omitirlo no la mueve.',
    example: '3f4d1e6a-0b2c-4d8e-9f10-1a2b3c4d5e6f',
    nullable: true,
  })
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
