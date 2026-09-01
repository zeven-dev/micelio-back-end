import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

/**
 * Lista **completa** de ids del autor en el nuevo orden (no deltas): elimina toda ambigüedad
 * entre movimientos concurrentes y hace trivial el optimistic update de los clientes.
 * Ver `docs/API-CONTRACTS.md` ("Reordenar el feed propio").
 */
export class ReorderPostsDto {
  @ApiProperty({ description: 'Todos los posts del usuario, en el orden deseado.' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  orderedIds: string[];
}
