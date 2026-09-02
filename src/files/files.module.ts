import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { StorageModule } from '../storage/storage.module';
import { FilesCleanupListener } from './files-cleanup.listener';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

// Sin Multer: desde la Fase 0.5 ningún binario pasa por la API (presign + confirm contra S3),
// así que no hay tope de memoria que registrar aquí. El peso por tipo lo valida `FilesService`
// contra `UPLOAD_MAX_*_MB` y, en `confirm`, contra el tamaño real que reporta S3.
@Module({
  imports: [FoldersModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesService, FilesCleanupListener],
  // `posts` (Fase 2) arma sus medios con `findOwnedByUser`/`findManyByIds` en vez de consultar
  // `file_assets` por su cuenta: el cruce de dominios va por el servicio público (regla 7).
  exports: [FilesService],
})
export class FilesModule {}
