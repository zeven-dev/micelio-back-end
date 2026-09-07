import { BadRequestException } from '@nestjs/common';
import { PostBlockType } from '@prisma/client';
import { NoteBlockInputDto } from '../dto/create-note.dto';
import {
  assertBlocksAreValid,
  deriveExcerpt,
  MAX_HEADING_LENGTH,
  noteTextForTags,
} from './note-blocks.util';

function block(overrides: Partial<NoteBlockInputDto> = {}): NoteBlockInputDto {
  return { type: PostBlockType.PARAGRAPH, text: 'Hola mundo', ...overrides } as NoteBlockInputDto;
}

describe('assertBlocksAreValid', () => {
  it('acepta PARAGRAPH/QUOTE/HEADING con texto y sin fileAssetId', () => {
    expect(() =>
      assertBlocksAreValid([
        block({ type: PostBlockType.PARAGRAPH }),
        block({ type: PostBlockType.QUOTE }),
        block({ type: PostBlockType.HEADING, text: 'Título' }),
      ]),
    ).not.toThrow();
  });

  it('acepta IMAGE con fileAssetId y sin texto', () => {
    expect(() =>
      assertBlocksAreValid([
        block({ type: PostBlockType.IMAGE, text: undefined, fileAssetId: 'file-1' }),
      ]),
    ).not.toThrow();
  });

  it('rechaza un bloque IMAGE sin fileAssetId', () => {
    expect(() =>
      assertBlocksAreValid([block({ type: PostBlockType.IMAGE, text: undefined })]),
    ).toThrow(BadRequestException);
  });

  it('rechaza un bloque IMAGE con texto', () => {
    expect(() =>
      assertBlocksAreValid([
        block({ type: PostBlockType.IMAGE, text: 'no debería ir', fileAssetId: 'file-1' }),
      ]),
    ).toThrow(BadRequestException);
  });

  it('rechaza fileAssetId en un bloque que no es IMAGE', () => {
    expect(() =>
      assertBlocksAreValid([block({ type: PostBlockType.PARAGRAPH, fileAssetId: 'file-1' })]),
    ).toThrow(BadRequestException);
  });

  it('rechaza PARAGRAPH/QUOTE/HEADING sin texto', () => {
    expect(() => assertBlocksAreValid([block({ text: undefined })])).toThrow(BadRequestException);
  });

  it('rechaza un HEADING que excede su tope, más corto que el de PARAGRAPH', () => {
    const tooLong = 'a'.repeat(MAX_HEADING_LENGTH + 1);
    expect(() =>
      assertBlocksAreValid([block({ type: PostBlockType.HEADING, text: tooLong })]),
    ).toThrow(BadRequestException);
    // El mismo largo es válido en PARAGRAPH: el tope de HEADING es propio, no el general.
    expect(() =>
      assertBlocksAreValid([block({ type: PostBlockType.PARAGRAPH, text: tooLong })]),
    ).not.toThrow();
  });
});

describe('deriveExcerpt', () => {
  it('devuelve el texto completo si cabe en 200 caracteres', () => {
    const blocks = [{ type: PostBlockType.PARAGRAPH, text: 'Un texto corto.' }];
    expect(deriveExcerpt(blocks)).toBe('Un texto corto.');
  });

  it('corta en la última palabra completa antes de 200 caracteres', () => {
    const word = 'palabra ';
    const text = word.repeat(30); // 240 caracteres, con espacios exactos entre palabras
    const excerpt = deriveExcerpt([{ type: PostBlockType.PARAGRAPH, text }]);
    expect(excerpt.length).toBeLessThanOrEqual(200);
    expect(excerpt.endsWith('palabra')).toBe(true);
    expect(text.startsWith(excerpt)).toBe(true);
  });

  it('usa el primer bloque PARAGRAPH e ignora HEADING/QUOTE/IMAGE antes de él', () => {
    const blocks = [
      { type: PostBlockType.HEADING, text: 'Título' },
      { type: PostBlockType.IMAGE, text: null },
      { type: PostBlockType.PARAGRAPH, text: 'El primer párrafo real.' },
      { type: PostBlockType.PARAGRAPH, text: 'Un segundo párrafo que no debería aparecer.' },
    ];
    expect(deriveExcerpt(blocks)).toBe('El primer párrafo real.');
  });

  it('es la cadena vacía si la nota no tiene ningún bloque PARAGRAPH', () => {
    const blocks = [{ type: PostBlockType.HEADING, text: 'Solo un título' }];
    expect(deriveExcerpt(blocks)).toBe('');
  });
});

describe('noteTextForTags', () => {
  it('combina el título con el texto de todos los bloques, ignorando IMAGE', () => {
    const text = noteTextForTags('Título #uno', [
      { text: 'Cuerpo #dos' },
      { text: null },
      { text: 'Final #tres' },
    ]);
    expect(text).toBe('Título #uno Cuerpo #dos Final #tres');
  });
});
