# Módulo `folders`

**Responsabilidad:** CRUD de carpetas ("proyectos") de la biblioteca de cada usuario.

## Contrato actual
- `GET/POST /api/folders`, `GET/PATCH/DELETE /api/folders/:id`.
- Toda operación filtra por el `userId` del token: un usuario jamás ve carpetas ajenas.
- Nombre único por usuario; borrar una carpeta cascadea a sus archivos (incluidos los objetos
  en S3, vía `files`).

## Pendiente (ver `docs/ROADMAP.md` Fase 1)
- Sub-carpetas: `parentId` autorreferente, validación de ciclos, unicidad por
  (userId, parentId, name).
- Carpetas de grupo/curso vivirán en el módulo futuro `groups`, NO aquí — este módulo es solo
  biblioteca personal.

## Reglas del módulo
- La autorización por dueño se hace en el servicio (no confiar en el controlador).
- Cambios de estructura → actualizar `docs/DATA-MODEL.md`.
