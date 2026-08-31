import { ExecutionContext, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function createContext(user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => function handler() {},
      getClass: () => class SomeController {},
    } as unknown as ExecutionContext;
  }

  /** Reflector que responde según la clave consultada, como el real. */
  function createReflector(metadata: { isPublic?: boolean; roles?: Role[] }): Reflector {
    return {
      getAllAndOverride: jest.fn((key: string) =>
        key === IS_PUBLIC_KEY ? metadata.isPublic : key === ROLES_KEY ? metadata.roles : undefined,
      ),
    } as unknown as Reflector;
  }

  it('allows a @Public() route without checking roles', () => {
    const guard = new RolesGuard(createReflector({ isPublic: true }));

    expect(guard.canActivate(createContext(undefined))).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    const guard = new RolesGuard(createReflector({ roles: [Role.ADMIN] }));

    expect(guard.canActivate(createContext({ role: Role.ADMIN }))).toBe(true);
  });

  it('throws ForbiddenException when the user lacks the required role', () => {
    const guard = new RolesGuard(createReflector({ roles: [Role.ADMIN] }));

    expect(() => guard.canActivate(createContext({ role: Role.USER }))).toThrow(ForbiddenException);
  });

  // Fail-closed: una ruta sin declarar es un error de programación, no una ruta abierta.
  it('rejects a route that declares neither @Roles nor @Public', () => {
    const guard = new RolesGuard(createReflector({}));

    expect(() => guard.canActivate(createContext({ role: Role.ADMIN }))).toThrow(
      InternalServerErrorException,
    );
  });

  it('rejects a route whose @Roles list is empty', () => {
    const guard = new RolesGuard(createReflector({ roles: [] }));

    expect(() => guard.canActivate(createContext({ role: Role.ADMIN }))).toThrow(
      InternalServerErrorException,
    );
  });
});
