import { forwardRef, Module } from '@nestjs/common';
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
// este módulo importa `SocialModule` en una sola dirección, sin `forwardRef`.
// `UsersModule` **sí** vuelve a ser un ciclo desde la Fase 4.5: el perfil muestra `postsCount`,
// que es un dato de este dominio, mientras que los posts embeben el `UserPublic` de su autor.
// Es la misma forma de ciclo real que ya tenía `users` ↔ `social`, y se resuelve igual: el cruce
// sigue siendo por **servicio público** (`PostsService.countByAuthorIds`), nunca por las tablas
// del otro módulo; `forwardRef` es solo cómo NestJS resuelve el orden de carga.
// Ver la desviación 5 de `docs/ARCHITECTURE.md`.
@Module({
  imports: [forwardRef(() => UsersModule), SocialModule, FilesModule, StorageModule],
  controllers: [PostsController, PostInteractionsController],
  providers: [PostsService, PostInteractionsService],
  exports: [PostsService, PostInteractionsService],
})
export class PostsModule {}
