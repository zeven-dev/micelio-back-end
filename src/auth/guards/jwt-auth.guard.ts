import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { IS_OPTIONAL_AUTH_KEY } from '../../common/decorators/optional-auth.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * En rutas `@OptionalAuth()` una petición **sin** cabecera `Authorization` continúa como
   * anónima. Si la cabecera viene pero el token es inválido o expiró, se deja fallar (`401`)
   * para que el cliente refresque en vez de recibir en silencio la respuesta de anónimo.
   */
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown, context: ExecutionContext): TUser {
    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isOptional && !user) {
      const request = context.switchToHttp().getRequest<Request>();
      if (!request.headers?.authorization) {
        return undefined as TUser;
      }
    }
    return super.handleRequest(err, user, info, context);
  }
}
