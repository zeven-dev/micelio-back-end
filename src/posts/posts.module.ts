import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SocialModule } from '../social/social.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { PostInteractionsController } from './post-interactions.controller';
import { PostInteractionsService } from './post-interactions.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

// Cruce de dominios solo por servicios públicos (regla 7 de `AGENTS.md`): `UsersService` para
// el autor y la visibilidad, `SocialService` para el grafo del home (seguidos y favoritos) y
// `FilesService` para los archivos de la biblioteca. `posts` no consulta `users`, `follows`,
// `folders` ni `file_assets` con Prisma.
// Likes, guardados y comentarios (Fase 4) volvieron a vivir aquí (antes en `social`) al
// deshacer el ciclo de tres módulos que generaban: `social` ya no depende de `posts`, así que
// este módulo importa `SocialModule` y `UsersModule` en una sola dirección, sin `forwardRef`
// (confirmado arrancando el `AppModule` real con `npm run api:export`). El ciclo real que queda
// en el proyecto es `users` ↔ `social`, independiente de este módulo — ver `docs/ARCHITECTURE.md`.
@Module({
  imports: [UsersModule, SocialModule, FilesModule, StorageModule],
  controllers: [PostsController, PostInteractionsController],
  providers: [PostsService, PostInteractionsService],
  exports: [PostsService, PostInteractionsService],
})
export class PostsModule {}
