import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import { ConfirmAvatarDto } from './dto/confirm-avatar.dto';
import { PresignAvatarDto } from './dto/presign-avatar.dto';
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

  @Post('me/avatar/presign')
  presignAvatar(@CurrentUser() user: AuthenticatedUser, @Body() dto: PresignAvatarDto) {
    return this.usersService.presignAvatar(user.id, dto);
  }

  @Patch('me/avatar')
  updateAvatar(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmAvatarDto) {
    return this.usersService.updateAvatar(user.id, dto);
  }

  // Decisión del dueño del producto: los perfiles se comparten por link, así que esta ruta
  // responde con o sin sesión. Un perfil privado sigue mostrando solo la vista limitada.
  @OptionalAuth()
  @Get(':username')
  getByUsername(@Param('username') username: string, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.usersService.getPublicProfile(username, viewer?.id);
  }
}
