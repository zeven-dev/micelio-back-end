import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import {
  ApiCursorPaginatedResponse,
  CursorPaginationDto,
} from '../common/dto/cursor-pagination.dto';
import { CommentDto } from './dto/comment.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateFollowDto } from './dto/update-follow.dto';
import { FollowerItemDto, FollowingItemDto, FollowStateDto } from './dto/follow-response.dto';
import { LikeListResponseDto, LikeStateDto } from './dto/like-response.dto';
import { SavedPostItemDto, SaveStateDto } from './dto/save-response.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
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

  @Post('posts/:id/like')
  @ApiCreatedResponse({ type: LikeStateDto })
  like(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.socialService.like(id, user.id);
  }

  @Delete('posts/:id/like')
  @ApiOkResponse({ type: LikeStateDto })
  unlike(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.socialService.unlike(id, user.id);
  }

  /** Solo el autor del post puede ver quién le dio like (`403` para cualquier otro viewer). */
  @Get('posts/:id/likes')
  @ApiOkResponse({ type: LikeListResponseDto })
  likes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: CursorPaginationDto,
  ) {
    return this.socialService.listLikes(id, user.id, query);
  }

  @Post('posts/:id/save')
  @ApiCreatedResponse({ type: SaveStateDto })
  save(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.socialService.save(id, user.id);
  }

  @Delete('posts/:id/save')
  @ApiOkResponse({ type: SaveStateDto })
  unsave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.socialService.unsave(id, user.id);
  }

  @Get('me/saved')
  @ApiCursorPaginatedResponse(SavedPostItemDto)
  saved(@CurrentUser() user: AuthenticatedUser, @Query() query: CursorPaginationDto) {
    return this.socialService.listSaved(user.id, query);
  }

  @Post('posts/:id/comments')
  @ApiCreatedResponse({ type: CommentDto })
  createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.socialService.createComment(id, user.id, dto);
  }

  /** Comentarios raíz del post (`parentId: null`), paginados, más viejos primero. */
  @Get('posts/:id/comments')
  @ApiCursorPaginatedResponse(CommentDto)
  comments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: CursorPaginationDto,
  ) {
    return this.socialService.listRootComments(id, user.id, query);
  }

  @Get('comments/:id/replies')
  @ApiCursorPaginatedResponse(CommentDto)
  replies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: CursorPaginationDto,
  ) {
    return this.socialService.listReplies(id, user.id, query);
  }

  @Patch('comments/:id')
  @ApiOkResponse({ type: CommentDto })
  updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.socialService.updateComment(id, user.id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeComment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.socialService.removeComment(id, user.id);
  }
}
