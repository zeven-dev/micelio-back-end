import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { FoldersModule } from '../folders/folders.module';
import { StorageModule } from '../storage/storage.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { BYTES_PER_MB, UPLOAD_CEILING_HEADROOM_BYTES } from './utils/file-type.util';

@Module({
  imports: [
    FoldersModule,
    StorageModule,
    // Tope de Multer (memoria) derivado de la configuración: es el mayor de los pesos
    // permitidos, para que subir `UPLOAD_MAX_*_MB` nunca choque contra un límite fijo
    // escondido en un decorador. El peso exacto por tipo lo valida `FilesService`.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const maxMb = Math.max(
          configService.get<number>('uploads.maxImageMb')!,
          configService.get<number>('uploads.maxVideoMb')!,
          configService.get<number>('uploads.maxTextMb')!,
        );
        return { limits: { fileSize: maxMb * BYTES_PER_MB + UPLOAD_CEILING_HEADROOM_BYTES } };
      },
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
