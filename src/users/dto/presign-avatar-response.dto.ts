import { ApiProperty } from '@nestjs/swagger';

export class PresignAvatarResponseDto {
  @ApiProperty()
  key: string;

  @ApiProperty({ description: 'URL firmada para un PUT directo del binario a S3.' })
  uploadUrl: string;

  @ApiProperty({ description: 'Segundos de validez de uploadUrl.' })
  expiresIn: number;
}
