# Módulo `events`

**Responsabilidad:** contratos de eventos de dominio — nombres y formas (tipos), **sin
lógica**. Ver `docs/ARCHITECTURE.md` ("Eventos de dominio como columna vertebral").

## Piezas
- `domain-events.ts` — `DOMAIN_EVENTS` (nombres: `post.created`, `post.liked`, `post.unliked`,
  `post.saved`, `post.unsaved`, `post.shared`, `comment.created`, `message.sent`,
  `user.followed`) y una interfaz de payload por evento.
- `EventEmitterModule.forRoot()` se registra en `src/app.module.ts` (global); este módulo no
  tiene un `.module.ts` propio porque no expone providers, solo tipos.

## Estado (Fase 2)
- **Productores:** `posts` emite `post.created` (`{ postId, authorId, tags }`) al publicar.
- **Consumidores:** ninguno todavía. `ranking` (Fase 5) y `notifications` (Fase 7) son los que
  van a escuchar; hasta entonces el evento se emite y nadie lo atiende, que es exactamente lo
  que esta arquitectura busca (el productor no sabe quién escucha).
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
