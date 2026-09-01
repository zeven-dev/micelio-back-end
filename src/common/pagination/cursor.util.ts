import { BadRequestException } from '@nestjs/common';

/**
 * Cursor opaco de la paginación estándar (`docs/API-CONTRACTS.md`, "Convenciones generales"):
 * base64 de un JSON interno. El cliente solo lo reenvía tal cual; su contenido puede cambiar
 * entre versiones sin romper a nadie.
 */
export function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Decodifica un cursor recibido del cliente. Cualquier basura es `400`, nunca un `500`. */
export function decodeCursor<T>(cursor: string, isValid: (value: unknown) => value is T): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Cursor inválido');
  }
  if (!isValid(parsed)) {
    throw new BadRequestException('Cursor inválido');
  }
  return parsed;
}
