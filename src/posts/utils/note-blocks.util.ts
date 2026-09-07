import { BadRequestException } from '@nestjs/common';
import { PostBlockType } from '@prisma/client';
import { NoteBlockInputDto } from '../dto/create-note.dto';

/** Tope de bloques por nota (`docs/API-CONTRACTS.md`, "Notas — Fase 4.6"). */
export const MAX_BLOCKS_PER_NOTE = 100;

/** Largo máximo de `text` en PARAGRAPH/QUOTE. */
export const MAX_BLOCK_TEXT_LENGTH = 5000;

/** Largo máximo de `text` en HEADING (más corto: es un título de sección). */
export const MAX_HEADING_LENGTH = 140;

/** Largo máximo del `caption` de un bloque IMAGE. */
export const MAX_CAPTION_LENGTH = 280;

/** Caracteres que arma el `excerpt` a partir del primer bloque `PARAGRAPH`. */
const EXCERPT_LENGTH = 200;

/**
 * Reglas por tipo de bloque, exactas de `docs/API-CONTRACTS.md`: PARAGRAPH/QUOTE y HEADING
 * exigen `text` (y prohíben `fileAssetId`); IMAGE exige `fileAssetId` y prohíbe `text`. Se valida
 * aquí (no con decoradores condicionales en el DTO) por el mismo motivo que `buildTags`: la regla
 * depende de un campo hermano, y un `BadRequestException` explícito es más claro que encadenar
 * `@ValidateIf`.
 */
export function assertBlocksAreValid(blocks: NoteBlockInputDto[]): void {
  blocks.forEach((block, index) => {
    const where = `bloque ${index + 1}`;
    if (block.type === PostBlockType.IMAGE) {
      if (!block.fileAssetId) {
        throw new BadRequestException(`${where}: un bloque IMAGE necesita fileAssetId`);
      }
      if (block.text) {
        throw new BadRequestException(`${where}: un bloque IMAGE no admite texto`);
      }
      return;
    }
    if (block.fileAssetId) {
      throw new BadRequestException(`${where}: fileAssetId solo aplica a bloques IMAGE`);
    }
    if (!block.text || block.text.trim().length === 0) {
      throw new BadRequestException(`${where}: falta texto`);
    }
    const maxLength =
      block.type === PostBlockType.HEADING ? MAX_HEADING_LENGTH : MAX_BLOCK_TEXT_LENGTH;
    if (block.text.length > maxLength) {
      throw new BadRequestException(`${where}: el texto admite máximo ${maxLength} caracteres`);
    }
  });
}

/**
 * Los primeros 200 caracteres del primer bloque `PARAGRAPH`, cortados en palabra completa
 * (nunca a mitad de una palabra). `''` si la nota no tiene ningún bloque `PARAGRAPH`.
 */
export function deriveExcerpt(blocks: { type: PostBlockType; text: string | null }[]): string {
  const paragraph = blocks.find((block) => block.type === PostBlockType.PARAGRAPH);
  const text = paragraph?.text ?? '';
  if (text.length <= EXCERPT_LENGTH) {
    return text;
  }
  const cut = text.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

/** Texto combinado de una nota (título + bloques de texto) para extraer sus `#hashtags`. */
export function noteTextForTags(title: string, blocks: { text?: string | null }[]): string {
  return [
    title,
    ...blocks.map((block) => block.text).filter((text): text is string => !!text),
  ].join(' ');
}
