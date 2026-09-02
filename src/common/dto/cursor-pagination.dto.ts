import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Página por defecto y tope de la paginación por cursor (`docs/API-CONTRACTS.md`). */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

/** Query estándar de toda lista potencialmente larga: `?cursor=<opaco>&limit=<n>`. */
export class CursorPaginationDto {
  @ApiPropertyOptional({ description: 'Cursor opaco devuelto por la página anterior.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_LIMIT, minimum: 1, maximum: MAX_PAGE_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;
}

/** Respuesta estándar: `nextCursor: null` significa que no hay más páginas. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Documenta en Swagger un endpoint que devuelve `CursorPage<T>` (genérico, no anotable directo). */
export function ApiCursorPaginatedResponse<TModel extends Type<unknown>>(model: TModel) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        allOf: [
          {
            properties: {
              items: { type: 'array', items: { $ref: getSchemaPath(model) } },
              nextCursor: { type: 'string', nullable: true },
            },
          },
        ],
      },
    }),
  );
}
