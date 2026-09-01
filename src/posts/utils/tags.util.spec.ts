import { BadRequestException } from '@nestjs/common';
import { buildTags, extractHashtags, normalizeTag } from './tags.util';

describe('tags.util', () => {
  describe('normalizeTag', () => {
    it('baja a minúsculas, quita el # y recorta espacios', () => {
      expect(normalizeTag('  #Proceso ')).toBe('proceso');
    });

    it('conserva las tildes y la ñ, y descarta el resto de caracteres', () => {
      expect(normalizeTag('Ilustración!!')).toBe('ilustración');
      expect(normalizeTag('diseño/gráfico')).toBe('diseñográfico');
    });

    it('corta a 30 caracteres', () => {
      expect(normalizeTag('a'.repeat(40))).toHaveLength(30);
    });

    it('devuelve null cuando no queda nada utilizable', () => {
      expect(normalizeTag('###')).toBeNull();
      expect(normalizeTag('   ')).toBeNull();
    });
  });

  describe('extractHashtags', () => {
    it('toma los tokens #palabra de la descripción', () => {
      expect(extractHashtags('Mural en proceso #arte #mural-urbano')).toEqual([
        '#arte',
        '#mural-urbano',
      ]);
    });

    it('sin descripción no extrae nada', () => {
      expect(extractHashtags(null)).toEqual([]);
      expect(extractHashtags(undefined)).toEqual([]);
    });
  });

  describe('buildTags', () => {
    it('fusiona las explícitas con los hashtags de la descripción, sin duplicar', () => {
      expect(buildTags(['Arte', 'proceso'], 'Boceto #arte #tinta')).toEqual([
        'arte',
        'proceso',
        'tinta',
      ]);
    });

    it('respeta el orden: primero las explícitas, luego las de la descripción', () => {
      expect(buildTags(['b'], '#a')).toEqual(['b', 'a']);
    });

    it('rechaza con 400 cuando quedan más de 10 tras normalizar', () => {
      const eleven = Array.from({ length: 11 }, (_, index) => `tag${index}`);
      expect(() => buildTags(eleven, null)).toThrow(BadRequestException);
    });

    it('acepta exactamente 10', () => {
      const ten = Array.from({ length: 10 }, (_, index) => `tag${index}`);
      expect(buildTags(ten, null)).toHaveLength(10);
    });

    it('sin etiquetas ni hashtags devuelve una lista vacía', () => {
      expect(buildTags(undefined, 'Sin etiquetas')).toEqual([]);
    });
  });
});
