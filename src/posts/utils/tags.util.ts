import { BadRequestException } from '@nestjs/common';

/** Tope de etiquetas por publicación tras normalizar (`docs/API-CONTRACTS.md`, "Etiquetas"). */
export const MAX_TAGS_PER_POST = 10;

/** Largo máximo de una etiqueta ya normalizada. */
export const MAX_TAG_LENGTH = 30;

/** Caracteres válidos de una etiqueta: todo lo demás se elimina al normalizar. */
const DISALLOWED_TAG_CHARS = /[^a-z0-9_áéíóúñü-]/g;

/** `#palabra` dentro de la descripción: hasta el primer espacio o `#`. */
const HASHTAG_PATTERN = /#[^\s#]+/g;

/**
 * Normalización del servidor: minúsculas, sin `#`, trim, solo caracteres permitidos y máximo
 * 30 caracteres. Devuelve `null` si no queda nada utilizable.
 */
export function normalizeTag(raw: string): string | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(DISALLOWED_TAG_CHARS, '')
    .slice(0, MAX_TAG_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

/** Los `#hashtags` escritos dentro de la descripción, todavía sin normalizar. */
export function extractHashtags(description?: string | null): string[] {
  return description?.match(HASHTAG_PATTERN) ?? [];
}

/**
 * Etiquetas finales de una publicación: las explícitas del cliente **más** los `#hashtags` de
 * la descripción, normalizadas, sin vacías ni duplicadas y en orden de aparición. Más de
 * `MAX_TAGS_PER_POST` es `400` (el cliente decide cuáles quita; el servidor no recorta por él).
 */
export function buildTags(explicit: string[] | undefined, description?: string | null): string[] {
  const tags: string[] = [];
  for (const raw of [...(explicit ?? []), ...extractHashtags(description)]) {
    const tag = normalizeTag(raw);
    if (tag !== null && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  if (tags.length > MAX_TAGS_PER_POST) {
    throw new BadRequestException(
      `Una publicación admite máximo ${MAX_TAGS_PER_POST} etiquetas (incluidos los hashtags de la descripción)`,
    );
  }
  return tags;
}
