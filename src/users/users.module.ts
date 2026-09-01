import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Sin Multer: desde la Fase 0.5 el avatar también se sube directo a S3 (presign + confirm),
// así que la API no recibe binarios. `UsersService` valida el peso contra `UPLOAD_MAX_AVATAR_MB`
// y, al confirmar, contra el tamaño real que reporta S3.
@Module({
  imports: [StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
