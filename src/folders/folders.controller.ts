import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateFolderDto } from './dto/create-folder.dto';
import { FolderDetailResponseDto, FolderResponseDto } from './dto/folder-response.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { FoldersService } from './folders.service';

@ApiTags('folders')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller('folders')
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  /** Sin `parentId` devuelve la raíz de la biblioteca; con él, las hijas directas. */
  @Get()
  @ApiQuery({
    name: 'parentId',
    required: false,
    description: 'Carpeta madre. Omitirlo lista las carpetas raíz.',
  })
  @ApiOkResponse({ type: [FolderResponseDto] })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('parentId') parentId?: string) {
    return this.foldersService.findAllForUser(user.id, parentId ?? null);
  }

  /** Incluye `path`: el breadcrumb desde la raíz hasta esta carpeta. */
  @Get(':id')
  @ApiOkResponse({ type: FolderDetailResponseDto })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.foldersService.findOneWithPath(id, user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: FolderResponseDto })
  create(@Body() dto: CreateFolderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.foldersService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: FolderResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFolderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.foldersService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.foldersService.remove(id, user.id);
  }
}
