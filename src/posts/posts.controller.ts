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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CursorPaginationDto } from '../common/dto/cursor-pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import { CreatePostDto } from './dto/create-post.dto';
import { ReorderPostsDto } from './dto/reorder-posts.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller()
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('posts')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostDto) {
    return this.postsService.create(user.id, dto);
  }

  /** Antes que `:id`: si no, Nest interpretaría "reorder" como un id de publicación. */
  @Patch('posts/reorder')
  reorder(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderPostsDto) {
    return this.postsService.reorder(user.id, dto);
  }

  @Get('posts/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.postsService.findOne(id, user.id);
  }

  @Patch('posts/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, user.id, dto);
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.postsService.remove(id, user.id);
  }

  /**
   * Feed propio de un perfil, en el orden que curó su dueño. Vive bajo `users/:username`
   * porque es el contenido de ese perfil, pero lo sirve este módulo: `users` no sabe de posts.
   */
  @Get('users/:username/posts')
  findByUsername(
    @Param('username') username: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationDto,
  ) {
    return this.postsService.findByUsername(username, user.id, query);
  }
}
