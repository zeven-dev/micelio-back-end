import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DOMAIN_EVENTS, FolderDeletedEvent } from '../events/domain-events';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { libraryFolderPrefix } from './utils/library-key.util';

/**
 * Limpieza de binarios huérfanos cuando se borra una carpeta (hueco abierto desde la Fase 1).
 *
 * La cascada de la base borra las filas `file_assets` del subárbol, pero los objetos siguen en
 * S3. `folders` no puede consultar `file_assets` (regla 7) y `files` ya importa a `folders`, así
 * que el cruce va **por evento**: `folder.deleted` trae los ids del subárbol y aquí se borra por
 * **prefijo**, que es el único rastro que queda una vez que las filas desaparecieron. El
 * esquema de keys lo conoce este módulo, que es quien las genera al prefirmar.
 *
 * Un fallo de S3 se registra y no se propaga: la carpeta ya se borró y el usuario recibió su
 * `204`; reventar aquí no la traería de vuelta.
 */
@Injectable()
export class FilesCleanupListener {
  private readonly logger = new Logger(FilesCleanupListener.name);

  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: StorageService) {}

  @OnEvent(DOMAIN_EVENTS.FOLDER_DELETED)
  async onFolderDeleted(event: FolderDeletedEvent): Promise<void> {
    for (const folderId of event.folderIds) {
      const prefix = libraryFolderPrefix(event.userId, folderId);
      try {
        const deleted = await this.storageService.deleteByPrefix(prefix);
        if (deleted > 0) {
          this.logger.log(`Limpiados ${deleted} objetos de S3 bajo ${prefix}`);
        }
      } catch (error) {
        this.logger.error(`No se pudieron limpiar los objetos bajo ${prefix}: ${String(error)}`);
      }
    }
  }
}
