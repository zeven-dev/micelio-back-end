import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { StorageModule } from '../storage/storage.module';
import { BYTES_PER_MB, UPLOAD_CEILING_HEADROOM_BYTES } from '../files/utils/file-type.util';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    StorageModule,
    // Tope de Multer para el avatar, derivado de `UPLOAD_MAX_AVATAR_MB`. El mismo valor lo
    // vuelve a validar `UsersService` con un mensaje claro (Multer solo trunca).
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        limits: {
          fileSize:
            configService.get<number>('uploads.maxAvatarMb')! * BYTES_PER_MB +
            UPLOAD_CEILING_HEADROOM_BYTES,
        },
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
