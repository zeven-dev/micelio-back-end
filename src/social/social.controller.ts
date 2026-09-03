import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import {
  ApiCursorPaginatedResponse,
  CursorPaginationDto,
} from '../common/dto/cursor-pagination.dto';
import { UpdateFollowDto } from './dto/update-follow.dto';
import { FollowerItemDto, FollowingItemDto, FollowStateDto } from './dto/follow-response.dto';
import { SocialService } from './social.service';

@ApiTags('social')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller()
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('users/:username/follow')
  @ApiCreatedResponse({ type: FollowStateDto })
  follow(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.socialService.follow(user.id, username);
  }

  @Delete('users/:username/follow')
  @ApiOkResponse({ type: FollowStateDto })
  unfollow(@CurrentUser() user: AuthenticatedUser, @Param('username') username: string) {
    return this.socialService.unfollow(user.id, username);
  }

  @Patch('users/:username/follow')
  @ApiOkResponse({ type: FollowStateDto })
  setFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('username') username: string,
    @Body() dto: UpdateFollowDto,
  ) {
    return this.socialService.setFavorite(user.id, username, dto.isFavorite);
  }

  @Get('me/following')
  @ApiCursorPaginatedResponse(FollowingItemDto)
  following(@CurrentUser() user: AuthenticatedUser, @Query() query: CursorPaginationDto) {
    return this.socialService.listFollowing(user.id, query);
  }

  @Get('me/followers')
  @ApiCursorPaginatedResponse(FollowerItemDto)
  followers(@CurrentUser() user: AuthenticatedUser, @Query() query: CursorPaginationDto) {
    return this.socialService.listFollowers(user.id, query);
  }
}
