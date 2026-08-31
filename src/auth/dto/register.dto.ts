import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cure-Password!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'ada.lovelace' })
  @IsString()
  @Matches(/^[a-z0-9_.]{3,30}$/, {
    message: 'username debe tener 3-30 caracteres: minúsculas, dígitos, "_" o "."',
  })
  username: string;

  @ApiProperty({ example: '1020304050', description: 'Cédula colombiana (solo dígitos)' })
  @IsString()
  @Matches(/^[0-9]{6,10}$/, { message: 'cedula debe tener entre 6 y 10 dígitos' })
  cedula: string;
}
