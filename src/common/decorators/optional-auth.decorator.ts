import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * Autenticación opcional: la ruta responde con o sin sesión.
 *
 * - **Sin** cabecera `Authorization`: pasa como anónimo (`request.user` queda `undefined`) y el
 *   servicio decide qué mostrar.
 * - **Con** cabecera `Authorization`: el token debe ser válido; si no, `401`, para que el
 *   cliente dispare su refresco en vez de recibir en silencio la vista de anónimo.
 *
 * Distinto de `@Public()`, que ignora el token aunque venga. Úsalo solo donde la respuesta
 * dependa de si hay viewer (p. ej. el perfil público).
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
