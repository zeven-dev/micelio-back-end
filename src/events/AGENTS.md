# Módulo `events`

**Responsabilidad:** contratos de eventos de dominio — nombres y formas (tipos), **sin
lógica**. Ver `docs/ARCHITECTURE.md` ("Eventos de dominio como columna vertebral").

## Piezas
- `domain-events.ts` — `DOMAIN_EVENTS` (nombres: `post.created`, `post.liked`, `post.unliked`,
  `post.saved`, `post.unsaved`, `post.shared`, `comment.created`, `message.sent`,
  `user.followed`) y una interfaz de payload por evento.
- `EventEmitterModule.forRoot()` se registra en `src/app.module.ts` (global); este módulo no
  tiene un `.module.ts` propio porque no expone providers, solo tipos.

## Estado (Fase 0)
Solo scaffold: **nadie emite ni escucha estos eventos todavía**. Los productores llegan con
`posts`/`social`/`chat` (Fases 2, 3, 6) y los consumidores con `ranking`/`notifications`
(Fases 5 y 7).

## Reglas del módulo
- Aquí no vive lógica: ni listeners (`@OnEvent`), ni emisión (`EventEmitter2.emit`). Eso vive en
  el módulo productor o consumidor correspondiente.
- Todo evento nuevo (nombre + payload) se agrega aquí primero, antes de que cualquier módulo lo
  emita o lo escuche — es el contrato compartido, así que cambiarlo afecta a todos los
  consumidores a la vez.
- Los payloads llevan lo necesario para que `notifications` (módulo extraíble, sin FKs) no tenga
  que consultar otros dominios: preferir ids + datos denormalizados sobre relaciones.
