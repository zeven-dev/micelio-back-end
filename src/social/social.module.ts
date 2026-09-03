import { forwardRef, Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { UsersModule } from '../users/users.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

// `social` y `users` se necesitan mutuamente (el perfil muestra conteos del grafo; el grafo
// resuelve usernames y arma vistas de usuario): `forwardRef` en ambos lados. El cruce sigue
// siendo por servicio público — ninguno consulta las tablas del otro con Prisma.
// Desde la Fase 4, `social` también necesita `posts` (like/save/comment necesitan el post) y
// `posts` ya necesitaba `social` (grafo del home): mismo ciclo real, misma solución.
@Module({
  imports: [forwardRef(() => UsersModule), forwardRef(() => PostsModule)],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
