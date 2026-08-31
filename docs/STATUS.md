# Micelio — Bitácora de estado (back-end)

**Descarga de conocimiento obligatoria.** Al terminar **cada tarea** y al cerrar **cada fase**
del `ROADMAP.md`, el agente agrega una entrada **al inicio** de la sección "Entradas" con este
formato. El objetivo: que cualquiera (humano o agente) entienda en qué punto va el proyecto sin
leer el historial de git.

```
### AAAA-MM-DD — <tarea o fase> (tarea | cierre de fase)
- **Listo:** qué quedó funcionando y dónde (módulos, endpoints, migraciones).
- **Falta:** qué quedó pendiente de esta tarea/fase y por qué.
- **Necesito:** bloqueos, decisiones pendientes del dueño, dependencias de otros repos.
- **Sigue:** cuál es el siguiente paso concreto y dónde empezar.
```

Reglas: no borrar ni editar entradas anteriores (solo agregar); escribir concreto y con rutas
de archivos; si una fase se cierra, la entrada de cierre resume la fase completa.

---

## Entradas

### 2026-08-31 — Documentación y decisiones de producto (cierre de preparación)
- **Listo:** `AGENTS.md` raíz y por módulo; `docs/PRODUCT.md` (canónico, con decisiones del
  dueño), `docs/DATA-MODEL.md` (modelo actual + objetivo por fases), `docs/PROCESSES.md`
  (flujos existentes), `docs/ARCHITECTURE.md` (monolito modular + eventos + notificaciones
  extraíbles), `docs/ROADMAP.md` (Fases 0–11 detalladas).
- **Falta:** todo el desarrollo desde la Fase 0; no hay código nuevo, solo documentación.
- **Necesito:** respuestas a las "Preguntas abiertas" de `PRODUCT.md` (límites de video/audio,
  comentarios anidados, chats grupales, alcance admin/soporte) — no bloquean las Fases 0–2.
- **Sigue:** Fase 0 del `ROADMAP.md`: ampliar `User` (cédula, username, rol, isPublic) en
  `prisma/schema.prisma` + DTO de registro, guard de roles y `src/events/`.
