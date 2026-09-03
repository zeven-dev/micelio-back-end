import { forwardRef, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

// `social` y `users` se necesitan mutuamente (el perfil muestra conteos del grafo; el grafo
// resuelve usernames y arma vistas de usuario): `forwardRef` en ambos lados. El cruce sigue
// siendo por servicio público — ninguno consulta las tablas del otro con Prisma.
// Desde el refactor que deshizo el ciclo de tres módulos de la Fase 4 (like/save/comment
// volvieron a `posts`), `social` ya no depende de `posts` en absoluto.
@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
