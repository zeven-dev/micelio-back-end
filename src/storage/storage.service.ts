export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StorageService {
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getSignedUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  /** `null` si el objeto no existe todavía en el bucket. */
  headObject(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
  /**
   * Borra todos los objetos que cuelgan de un prefijo. Lo usa `files` para limpiar el bucket
   * cuando una carpeta (y su subárbol) desaparecen de la base: sus filas ya no existen, así que
   * el prefijo es el único rastro que queda de esos binarios. Devuelve cuántos borró.
   */
  deleteByPrefix(prefix: string): Promise<number>;
}
