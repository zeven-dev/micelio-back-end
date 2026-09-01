export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StorageService {
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getSignedUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  /** `null` si el objeto no existe todavía en el bucket. */
  headObject(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}
