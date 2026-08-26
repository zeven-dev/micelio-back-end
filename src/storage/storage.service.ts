export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface UploadObjectParams {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageService {
  upload(params: UploadObjectParams): Promise<{ key: string }>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
