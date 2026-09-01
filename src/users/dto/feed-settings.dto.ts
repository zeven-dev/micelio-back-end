import { ApiPropertyOptional } from '@nestjs/swagger';
import { FeedLayout } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Cómo se ve el feed del dueño (y así lo ven los visitantes). Formas y rangos exactos en
 * `docs/API-CONTRACTS.md` ("Ajustes de feed"): `columns` 1–6 y `gap` 0–5, donde `gap` es el
 * **índice** de la escala de espaciado del design system, no píxeles.
 */
export class FeedSettingsDto {
  @ApiPropertyOptional({ enum: FeedLayout, example: FeedLayout.MASONRY })
  @IsOptional()
  @IsEnum(FeedLayout)
  layout?: FeedLayout;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  columns?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  gap?: number;
}
