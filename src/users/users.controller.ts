import { Body, Controller, Get, Param, Patch, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Patch('me/avatar')
  @ApiConsumes('multipart/form-data')
  // El tope de tamaño viene de `MulterModule.registerAsync` en `users.module.ts`.
  @UseInterceptors(FileInterceptor('avatar'))
  updateAvatar(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.usersService.updateAvatar(user.id, file);
  }

  // Decisión del dueño del producto: los perfiles se comparten por link, así que esta ruta
  // responde con o sin sesión. Un perfil privado sigue mostrando solo la vista limitada.
  @OptionalAuth()
  @Get(':username')
  getByUsername(@Param('username') username: string, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.usersService.getPublicProfile(username, viewer?.id);
  }
}
