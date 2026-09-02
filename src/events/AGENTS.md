# Módulo `events`

**Responsabilidad:** contratos de eventos de dominio — nombres y formas (tipos), **sin
lógica**. Ver `docs/ARCHITECTURE.md` ("Eventos de dominio como columna vertebral").

## Piezas
- `domain-events.ts` — `DOMAIN_EVENTS` (nombres: `post.created`, `post.liked`, `post.unliked`,
  `post.saved`, `post.unsaved`, `post.shared`, `comment.created`, `message.sent`,
  `user.followed`, `folder.deleted`) y una interfaz de payload por evento.
- `EventEmitterModule.forRoot()` se registra en `src/app.module.ts` (global); este módulo no
  tiene un `.module.ts` propio porque no expone providers, solo tipos.

## Estado (Fase 3)
- **Productores:** `posts` emite `post.created` (`{ postId, authorId, tags }`) al publicar,
  `social` emite `user.followed` (`{ followerId, followedId }`) al crear una arista nueva —solo
  la primera vez, no en los reintentos— y `folders` emite `folder.deleted`
  (`{ userId, folderIds }`) al borrar una carpeta.
- **Consumidores:** `files` escucha `folder.deleted` para limpiar los binarios huérfanos de S3
  (primer consumidor real del proyecto). `post.created` y `user.followed` todavía no los escucha
  nadie: `ranking` (Fase 5) y `notifications` (Fase 7) son los que van a hacerlo, y que hoy no
  exista consumidor es exactamente lo que esta arquitectura busca (el productor no sabe quién
  escucha).
- `folder.deleted` no venía en la lista de `ARCHITECTURE.md`: se agregó el 2026-09-02, con
  acuerdo del dueño, porque era la forma de que `files` limpiara S3 sin que `folders` conociera
  sus tablas (la llamada directa habría sido circular).
- El resto de los eventos siguen siendo scaffold: sus productores llegan con `social`/`chat`
  (Fases 3, 4 y 6).

## Reglas del módulo
- Aquí no vive lógica: ni listeners (`@OnEvent`), ni emisión (`EventEmitter2.emit`). Eso vive en
  el módulo productor o consumidor correspondiente.
- Todo evento nuevo (nombre + payload) se agrega aquí primero, antes de que cualquier módulo lo
  emita o lo escuche — es el contrato compartido, así que cambiarlo afecta a todos los
  consumidores a la vez.
- Los payloads llevan lo necesario para que `notifications` (módulo extraíble, sin FKs) no tenga
  que consultar otros dominios: preferir ids + datos denormalizados sobre relaciones.
