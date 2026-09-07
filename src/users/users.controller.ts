import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import { ConfirmAvatarDto } from './dto/confirm-avatar.dto';
import { PresignAvatarDto } from './dto/presign-avatar.dto';
import { PresignAvatarResponseDto } from './dto/presign-avatar-response.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { MeView, UserPublicView, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOkResponse({ type: MeView })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  @ApiOkResponse({ type: MeView })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Post('me/avatar/presign')
  @ApiCreatedResponse({ type: PresignAvatarResponseDto })
  presignAvatar(@CurrentUser() user: AuthenticatedUser, @Body() dto: PresignAvatarDto) {
    return this.usersService.presignAvatar(user.id, dto);
  }

  @Patch('me/avatar')
  @ApiOkResponse({ type: MeView })
  updateAvatar(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmAvatarDto) {
    return this.usersService.updateAvatar(user.id, dto);
  }

  // Portada de la cabecera de perfil (Fase 4.5): mismo camino que el avatar — presign, PUT
  // directo a S3, confirm — más el borrado, porque un perfil sin portada es un estado válido.
  @Post('me/banner/presign')
  @ApiCreatedResponse({ type: PresignAvatarResponseDto })
  presignBanner(@CurrentUser() user: AuthenticatedUser, @Body() dto: PresignAvatarDto) {
    return this.usersService.presignBanner(user.id, dto);
  }

  @Patch('me/banner')
  @ApiOkResponse({ type: MeView })
  updateBanner(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmAvatarDto) {
    return this.usersService.updateBanner(user.id, dto);
  }

  @Delete('me/banner')
  @ApiOkResponse({ type: MeView })
  removeBanner(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.removeBanner(user.id);
  }

  // Decisión del dueño del producto: los perfiles se comparten por link, así que esta ruta
  // responde con o sin sesión. Un perfil privado sigue mostrando solo la vista limitada.
  @OptionalAuth()
  @Get(':username')
  @ApiOkResponse({ type: UserPublicView })
  getByUsername(@Param('username') username: string, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.usersService.getPublicProfile(username, viewer?.id);
  }
}
