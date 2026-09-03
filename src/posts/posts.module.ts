import { forwardRef, Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SocialModule } from '../social/social.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

// Cruce de dominios solo por servicios públicos (regla 7 de `AGENTS.md`): `UsersService` para
// el autor y la visibilidad, `SocialService` para el grafo (seguidos y favoritos del home, y
// desde la Fase 4 likes/guardados/comentarios) y `FilesService` para los archivos de la
// biblioteca. `posts` no consulta `users`, `follows`, `folders`, `file_assets`, `likes`,
// `saved_posts` ni `comments` con Prisma.
// `social` también necesita `PostsService` (like/save/comment viven ahí, y necesitan el post) —
// es un ciclo real del dominio, como `users` ↔ `social`: `forwardRef` en ambos módulos.
// `UsersModule` también va envuelto aquí: aunque `posts` → `users` no es circular por sí solo,
// ahora comparte camino de carga con el ciclo `posts` ↔ `social` ↔ `users` (CommonJS resuelve
// los `require()` en el orden de los `import`, y ese orden mete a `users.module.ts` en medio
// del ciclo) — sin `forwardRef` aquí, Nest arranca con `UsersModule` en `undefined` según el
// orden en que `AppModule` cargue los módulos.
@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => SocialModule),
    FilesModule,
    StorageModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
