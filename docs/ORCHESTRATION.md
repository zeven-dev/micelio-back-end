# Micelio — Orquestación de fases (jefe + hijos)

Protocolo para ejecutar una fase del `ROADMAP.md` en los tres repos (`micelio-back-end`,
`micelio-front-end`, `micelio-app`) con la menor supervisión posible del dueño del producto,
sin perder control de calidad ni consistencia entre repos. Lo sigue cualquier sesión de Claude
Code que actúe como orquestadora ("jefe") de una fase — no reemplaza el `AGENTS.md` de cada
repo, lo complementa: el `AGENTS.md` de cada repo manda dentro de ese repo, este documento manda
en el orden y la verificación **entre** repos.

**Por qué existe:** un desvío de contrato en back-end que nadie detecta antes de que front-end y
app lo implementen ya no es un repo con retrabajo, son tres. Este documento existe para que ese
desvío se detecte mecánicamente, en el punto exacto donde ocurre, sin que el dueño del producto
tenga que estar mirando cada paso.

## Principio: back-end primero, siempre

Ninguna fase empieza su parte de front-end/app hasta que back-end la cierre por completo:
endpoints, DTOs de respuesta decorados (`@ApiProperty` en todo lo nuevo — ver regla 12 de su
`AGENTS.md`), migraciones aplicadas, `docs/API-CONTRACTS.md` actualizado, `npm run api:export`
corrido con la fase incluida en `docs/openapi.json`, `npm run lint && build && test` en verde, y
su entrada de `docs/STATUS.md` con la fase marcada como lista.

Front-end y app **consumen** ese contrato ya cerrado — no toman decisiones de forma de datos,
solo de interacción, diseño y captura. Si durante su implementación descubren que el contrato no
cubre algo que necesitan, **no improvisan una forma ad-hoc**: es una señal de que back-end no
cerró bien la fase. Se detiene esa parte, se anota en `docs/STATUS.md` del repo que lo detectó,
y se resuelve en back-end antes de seguir.

## Secuencia de una fase

1. **Back-end implementa** la fase completa del `ROADMAP.md`.
2. **Gate mecánico** (el jefe verifica, no pregunta ni confía en el reporte del hijo — ver
   "Cómo verifica el jefe" abajo). Si falla, vuelve al paso 1.
3. **Front-end y app en paralelo** — no dependen entre sí, solo del contrato ya cerrado en el
   paso 1-2.
4. **Chequeo de consistencia front ↔ app** (ver esa sección abajo).
5. **Cierre**: entradas de `STATUS.md` en los tres repos, casillas del `ROADMAP.md` marcadas,
   resumen al dueño del producto.

## Antes de empezar cualquier fase: confirmar que las ramas están al día

No asumir que la rama de trabajo de cada repo refleja el `main` actual. En cada repo:

```bash
git fetch origin main
git merge-base HEAD origin/main   # ¿es igual al tip de origin/main? si no, la rama va atrás
git cherry origin/main HEAD       # ¿hay líneas? eso es trabajo sin fusionar que hay que conservar
```

Si `cherry` no imprime nada, la rama no tiene trabajo propio sin fusionar: se reinicia con
`git checkout -B <rama> origin/main`. Si imprime líneas, ese trabajo se conserva (rebase sobre
`origin/main`, no se descarta). Esto evita construir una fase entera sobre una foto vieja del
repo — pasó una vez (Fase 4, back-end estaba 3 commits detrás de `main`) y es barato de
prevenir, caro de descubrir a mitad de fase.

## Cómo verifica el jefe (no confiar, re-derivar)

El reporte de una sesión o subagente hijo es una afirmación, no una verificación. El jefe:

- Corre él mismo los comandos de calidad del repo (`lint`/`build`/`test`/`type-check`, los que
  liste el `AGENTS.md` de ese repo) sobre el resultado, antes de decidir que algo está listo.
- Revisa `git status --short` y `git diff --stat` de cada hijo: el alcance tocado debe coincidir
  con lo pedido. Un archivo fuera de la lista sin justificación es una señal de alarma, no un
  detalle menor.
- Para el gate entre back-end y clientes: confirma que `docs/openapi.json` incluye las rutas y
  schemas que la fase pedía (spot-check de `paths`/`components.schemas`, no releer toda la
  prosa de `API-CONTRACTS.md` esperando notar una discrepancia a ojo).

## Delegación a hijos (subagentes o sesiones)

- Cada hijo recibe una tarea **acotada y explícita**: lista exacta de archivos o módulos,
  comportamiento esperado, qué **no** tocar, y los comandos de verificación que debe correr él
  mismo antes de reportar. Nunca "implementa la fase X" a secas — eso delega también las
  decisiones de alcance que el jefe debe tomar.
- Si el hijo encuentra una decisión sin especificar (un DTO que no existe, una ruta ambigua), no
  la inventa: la deja anotada en su reporte. El jefe la traslada a `docs/STATUS.md` del repo
  correspondiente para que el dueño del producto la resuelva — misma regla de ambigüedad que ya
  tiene cada `AGENTS.md` (opción más simple compatible con la especificación, o si no hay una
  opción simple defendible, se pausa y se pregunta).
- Un hijo no hace commit ni push por su cuenta salvo instrucción explícita del jefe. El jefe
  revisa el resultado y decide cuándo commitear/pushear.

## Modelos por rol

| Rol | Modelo | Por qué |
| --- | --- | --- |
| Jefe (orquestación, gates, verificación) | Razonamiento alto | Pocas llamadas, pero cada decisión de gate afecta los tres repos — no es el lugar para ahorrar. |
| Hijo que implementa código de producto | Balanceado (el modelo por defecto de la sesión) | Es la mayoría del gasto de tokens; el punto óptimo costo/calidad para escribir código real. |
| Subagente de exploración/búsqueda | Ligero | Ubicar archivos o mapear dependencias no necesita razonamiento profundo. |
| Verificación de contrato/tokens de diseño | Ninguno — script determinístico (diff, build, typecheck) | Más barato y más confiable que pedirle a un modelo que "revise si coinciden". |
| Revisión de código antes de cerrar una fase | Esfuerzo alto (`/code-review` en high/max) | Un bug atrapado aquí cuesta una fracción de lo que cuesta atraparlo ya propagado a otro repo. |

## Consistencia front ↔ app

- Ambos generan sus tipos desde la misma fuente (`npm run sync:api` en cada uno, contra el
  mismo `micelio-back-end/docs/openapi.json`) — no hay copia manual de tipos entre ellos.
- Tokens de diseño: hoy siguen siendo prosa duplicada en el `DESIGN-SYSTEM.md` de cada repo
  (regla 5/6 de sus `AGENTS.md`). Al cerrar cualquier fase que toque diseño, el jefe compara
  ambos documentos antes de cerrar la fase. **Pendiente de este protocolo, no resuelto todavía:**
  unificar los tokens en un archivo fuente único verificable por diff en vez de prosa
  duplicada — ver `docs/STATUS.md` de front-end y app.
- Patrones de interacción (estados de carga/vacío/error, nombres de animaciones firma) deben
  verse iguales entre los dos clientes. Si un repo introduce un patrón nuevo que el otro no
  tiene, se anota en su `STATUS.md` para que el otro lo adopte en su propia tarea — no se
  replica automáticamente sin que alguien lo revise, porque "parecido" no es lo mismo que
  "el mismo patrón con la misma razón de ser".

## Qué dispara un ciclo del jefe

El dueño del producto pide ejecutar una fase (o una tarea puntual). El jefe:

1. Lee la sección de esa fase en el `ROADMAP.md` de los tres repos.
2. Confirma que las ramas de trabajo están al día (sección de arriba).
3. Ejecuta la secuencia de la fase.
4. Entrega un resumen: qué quedó listo en cada repo, qué comandos de verificación corrió y su
   resultado, qué decisiones de ambigüedad quedaron anotadas para que el dueño las revise.

## Cuándo el jefe SÍ debe parar y preguntar

- Antes de cualquier operación de rama/push que no sea el flujo ya autorizado (crear una rama
  distinta a la designada, `reset --hard`, force-push, saltarse hooks).
- Cuando una ambigüedad real no tiene una opción "más simple" defendible: afecta datos
  existentes, es irreversible, o cambia el alcance de la fase tal como está escrita.
- Cuando el gate de contrato (paso 2 de la secuencia) falla de una forma que no es un ajuste
  menor — es decir, back-end no cerró lo que el `ROADMAP.md` de la fase pedía.

Fuera de estos tres casos, el jefe ejecuta sin pausar: son exactamente las decisiones que este
documento y los `AGENTS.md` de cada repo ya tomaron por adelantado.

## Fuera de alcance de este documento

No reemplaza `ARCHITECTURE.md`, `DATA-MODEL.md`, `API-CONTRACTS.md` ni `PROCESSES.md` — es el
protocolo de **proceso entre repos**, no de producto ni de arquitectura interna de ninguno de
ellos. Cambios a este documento requieren acuerdo explícito del dueño del producto, igual que
`ARCHITECTURE.md`.
