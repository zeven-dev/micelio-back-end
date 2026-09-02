import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import { ConfirmFileDto } from './dto/confirm-file.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { PresignResponseDto } from './dto/presign-response.dto';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('folders/:folderId/files')
  @ApiOkResponse({ type: [FileResponseDto] })
  findAll(@Param('folderId') folderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.filesService.findAllForFolder(folderId, user.id);
  }

  @Post('folders/:folderId/files/presign')
  @ApiCreatedResponse({ type: PresignResponseDto })
  presign(
    @Param('folderId') folderId: string,
    @Body() dto: PresignFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filesService.presign(folderId, user.id, dto);
  }

  @Post('folders/:folderId/files/confirm')
  @ApiCreatedResponse({ type: FileResponseDto })
  confirm(
    @Param('folderId') folderId: string,
    @Body() dto: ConfirmFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filesService.confirm(folderId, user.id, dto);
  }

  @Delete('files/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.filesService.remove(id, user.id);
  }
}
