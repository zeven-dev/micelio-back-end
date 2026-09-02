/**
 * Esquema de keys de la biblioteca en S3. Vive aquí porque es este módulo el que las genera al
 * prefirmar la subida; ningún otro dominio debe construirlas ni interpretarlas.
 */
export function libraryFolderPrefix(userId: string, folderId: string): string {
  return `users/${userId}/folders/${folderId}/`;
}
