import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [FoldersModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesService, StorageModule],
})
export class FilesModule {}
