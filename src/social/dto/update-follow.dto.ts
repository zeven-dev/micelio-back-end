import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** `PATCH /api/users/:username/follow`: marcar o desmarcar como favorito. */
export class UpdateFollowDto {
  @ApiProperty({ example: true, description: 'Favorito: prioridad de 12 h en el home.' })
  @IsBoolean()
  isFavorite: boolean;
}
