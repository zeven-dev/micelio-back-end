import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ALL_ROLES, Roles } from '../common/decorators/roles.decorator';
import { FilesService } from './files.service';

const MAX_UPLOAD_SIZE_BYTES = 250 * 1024 * 1024; // ceiling; per-type limits enforced in the service

@ApiTags('files')
@ApiBearerAuth()
@Roles(...ALL_ROLES)
@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('folders/:folderId/files')
  findAll(@Param('folderId') folderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.filesService.findAllForFolder(folderId, user.id);
  }

  @Post('folders/:folderId/files')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    // No `storage`/`dest` option: Multer keeps the file in memory (as a Buffer)
    // instead of writing it to local disk, since it goes straight to S3.
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  upload(
    @Param('folderId') folderId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.filesService.upload(folderId, user.id, file);
  }

  @Delete('files/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.filesService.remove(id, user.id);
  }
}
