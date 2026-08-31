import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard global de roles. Es **fail-closed**: toda ruta que no sea `@Public()`
 * debe declarar `@Roles(...)`. Si no lo hace es un error de programación, no una
 * ruta abierta — así la regla 8 de `AGENTS.md` ("todo endpoint declara
 * explícitamente qué roles pueden usarlo") se hace cumplir sola en vez de
 * depender de que el siguiente agente se acuerde.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new InternalServerErrorException(
        `La ruta ${context.getClass().name}.${context.getHandler().name} no declara @Roles(...) ni @Public()`,
      );
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('No tienes el rol requerido para esta acción');
    }
    return true;
  }
}
