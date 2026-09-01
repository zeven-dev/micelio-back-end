import { Prisma } from '@prisma/client';

/**
 * Violación de llave foránea (`P2003`). La usan los borrados que una FK `Restrict` puede
 * frenar — hoy, borrar un archivo (o una carpeta que lo contiene) que está en una publicación:
 * la base es la garantía real y su error se traduce a `409` en vez de un `500`.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
