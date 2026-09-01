import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

// Cruce de dominios solo por servicios públicos (regla 7 de `AGENTS.md`): `UsersService` para
// el autor y la visibilidad, `FilesService` para los archivos de la biblioteca. `posts` no
// consulta `users`, `folders` ni `file_assets` con Prisma.
@Module({
  imports: [UsersModule, FilesModule, StorageModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
