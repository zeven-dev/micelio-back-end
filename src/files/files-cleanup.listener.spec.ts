import { StorageService } from '../storage/storage.service';
import { FilesCleanupListener } from './files-cleanup.listener';

describe('FilesCleanupListener', () => {
  let storage: jest.Mocked<StorageService>;
  let listener: FilesCleanupListener;

  beforeEach(() => {
    storage = {
      getSignedDownloadUrl: jest.fn(),
      getSignedUploadUrl: jest.fn(),
      headObject: jest.fn(),
      delete: jest.fn(),
      deleteByPrefix: jest.fn().mockResolvedValue(2),
    };
    listener = new FilesCleanupListener(storage);
  });

  it('barre el prefijo de cada carpeta del subárbol borrado', async () => {
    await listener.onFolderDeleted({ userId: 'user-1', folderIds: ['root', 'child'] });

    expect(storage.deleteByPrefix).toHaveBeenCalledWith('users/user-1/folders/root/');
    expect(storage.deleteByPrefix).toHaveBeenCalledWith('users/user-1/folders/child/');
  });

  // La carpeta ya se borró y el usuario recibió su 204: reventar aquí no la traería de vuelta.
  it('no propaga un fallo de S3 y sigue con las demás carpetas', async () => {
    storage.deleteByPrefix.mockRejectedValueOnce(new Error('S3 caído')).mockResolvedValueOnce(1);

    await expect(
      listener.onFolderDeleted({ userId: 'user-1', folderIds: ['root', 'child'] }),
    ).resolves.toBeUndefined();

    expect(storage.deleteByPrefix).toHaveBeenCalledTimes(2);
  });
});
