import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FolderCountDto {
  @ApiProperty()
  files: number;

  @ApiProperty()
  children: number;
}

export class FolderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ nullable: true, type: String })
  parentId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  /**
   * Presente en `GET /api/folders` y `GET /api/folders/:id` (se piden con `include`/`select`
   * aparte). `POST /api/folders` y `PATCH /api/folders/:id` devuelven la fila cruda de Prisma
   * sin este agregado — de ahí que sea opcional en vez de garantizado en todas las rutas que
   * usan este DTO.
   */
  @ApiPropertyOptional({ type: () => FolderCountDto })
  _count?: FolderCountDto;
}

/** Un eslabón del breadcrumb — misma forma que `FolderPathItem` en `folders.service.ts`. */
export class FolderPathItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class FolderDetailResponseDto extends FolderResponseDto {
  /**
   * `findOneWithPath` siempre la puebla, a diferencia de la base heredada — `required: true`
   * explícito porque `@nestjs/swagger` fusiona la metadata del override con la de la clase
   * madre y, sin este flag, conserva el `required: false` de `FolderResponseDto._count`.
   */
  @ApiProperty({ type: () => FolderCountDto, required: true })
  declare _count: FolderCountDto;

  @ApiProperty({ type: () => FolderPathItemDto, isArray: true })
  path: FolderPathItemDto[];
}
