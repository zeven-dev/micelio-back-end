import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Todos los roles autenticados. Se usa en endpoints abiertos a cualquier sesión
 * (perfil propio, biblioteca) para que la declaración sea siempre explícita:
 * `RolesGuard` rechaza cualquier ruta no pública que no declare sus roles.
 */
export const ALL_ROLES: Role[] = [Role.USER, Role.TEACHER, Role.ADMIN, Role.SUPPORT];

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
