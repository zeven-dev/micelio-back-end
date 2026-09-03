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
import { LikeListResponseDto, LikeStateDto } from './dto/like-response.dto';
import { SaveStateDto } from './dto/save-response.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PostInteractionsService } from './post-interactions.service';

/** Rutas de likes, guardados y comentarios — separadas de `PostsController` solo por tamaño. */
@ApiTags('posts')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller()
export class PostInteractionsController {
  constructor(private readonly interactions: PostInteractionsService) {}

  @Post('posts/:id/like')
  @ApiCreatedResponse({ type: LikeStateDto })
  like(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.interactions.like(id, user.id);
  }

  @Delete('posts/:id/like')
  @ApiOkResponse({ type: LikeStateDto })
  unlike(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.interactions.unlike(id, user.id);
  }

  /** Solo el autor del post puede ver quién le dio like (`403` para cualquier otro viewer). */
  @Get('posts/:id/likes')
  @ApiOkResponse({ type: LikeListResponseDto })
  likes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: CursorPaginationDto,
  ) {
    return this.interactions.listLikes(id, user.id, query);
  }

  @Post('posts/:id/save')
  @ApiCreatedResponse({ type: SaveStateDto })
  save(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.interactions.save(id, user.id);
  }

  @Delete('posts/:id/save')
  @ApiOkResponse({ type: SaveStateDto })
  unsave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.interactions.unsave(id, user.id);
  }

  @Post('posts/:id/comments')
  @ApiCreatedResponse({ type: CommentDto })
  createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.interactions.createComment(id, user.id, dto);
  }

  /** Comentarios raíz del post (`parentId: null`), paginados, más viejos primero. */
  @Get('posts/:id/comments')
  @ApiCursorPaginatedResponse(CommentDto)
  comments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: CursorPaginationDto,
  ) {
    return this.interactions.listRootComments(id, user.id, query);
  }

  @Get('comments/:id/replies')
  @ApiCursorPaginatedResponse(CommentDto)
  replies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: CursorPaginationDto,
  ) {
    return this.interactions.listReplies(id, user.id, query);
  }

  @Patch('comments/:id')
  @ApiOkResponse({ type: CommentDto })
  updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.interactions.updateComment(id, user.id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeComment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.interactions.removeComment(id, user.id);
  }
}
