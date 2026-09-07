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

## Qué modelo usa cada cosa (decisión del dueño del producto, 2026-09-07)

**La regla base es Sonnet 5.** No es un modelo "de respaldo": es el modelo con el que se escribe
la mayor parte de este proyecto. Opus 5 se reserva para una **lista cerrada** de disparadores, y
fuera de ellos usarlo no compra nada — solo gasta.

### Cuándo Opus 5, sí o sí

Solo si la tarea cumple **al menos uno** de estos seis disparadores:

1. **Se decide una forma de datos o de contrato** que van a consumir los tres repos: entidad
   nueva, endpoint nuevo, un campo que se agrega a `UserPublic`/`Post`. Equivocarse aquí no es un
   bug de un repo, es retrabajo en tres.
2. **Se escribe o se cambia un algoritmo con matemática exacta**: el orden del home feed, los
   pesos y el decaimiento de afinidad, el orden de resultados de búsqueda. Son deterministas por
   diseño; un error de fórmula no lo atrapa ningún `type-check`.
3. **Se toca la frontera de permisos o privacidad**: la regla de visibilidad, los roles, quién ve
   qué. Una fuga aquí es un incidente, no un ticket.
4. **Se decide o se rompe algo de `ARCHITECTURE.md`**: módulo nuevo, ciclo entre módulos, el
   módulo extraíble de notificaciones.
5. **Falla un gate o aparece una ambigüedad real** sin una opción "más simple" defendible (los
   dos primeros casos de "Cuándo el jefe SÍ debe parar y preguntar").
6. **Revisión final de una fase que tocó back-end** (`/code-review` en high/max). En una fase de
   solo clientes, esa revisión también es Sonnet 5.

### Todo lo demás es Sonnet 5

Y "todo lo demás" es la mayoría del trabajo real, incluyendo cosas que parecen grandes:

- **Implementar un contrato ya cerrado**: endpoints, DTOs, validaciones, migraciones a partir de
  un esquema ya acordado. Si la forma ya está escrita en `API-CONTRACTS.md` y `DATA-MODEL.md`, lo
  que queda es transcribirla bien, no decidirla.
- **Todo el trabajo de cliente**, sin excepción práctica: pantallas, componentes, estados de
  carga/vacío/error, animaciones ya especificadas, tokens, `sync:api`, `sync:design`.
- **Pruebas** de comportamiento ya especificado.
- **Documentación que transcribe decisiones ya tomadas** (`STATUS.md`, `PROCESSES.md`, los
  `AGENTS.md` de módulo).
- **Exploración y búsqueda** en el repo.
- **Verificación mecánica**: `lint`/`build`/`test`/`type-check`, revisar el `openapi.json`. Eso no
  lo hace un modelo grande — lo hace el comando, y cualquier modelo lee su salida.

### Cómo se agrupa (esto es lo que de verdad ahorra)

Alternar modelos dentro de una fase es lo caro: cada cambio obliga a recargar el contexto del
repo desde cero. Por eso **una fase se ejecuta en dos bloques como máximo, en este orden y con un
solo handoff**:

- **Bloque D — diseño (Opus 5, corto).** Solo si la fase dispara alguno de los seis puntos de
  arriba. **No escribe código de producto**: escribe la forma exacta en `API-CONTRACTS.md`,
  `DATA-MODEL.md` y, si aplica, la desviación en `ARCHITECTURE.md`. Termina cuando un agente que
  no participó en la decisión puede implementarla sin volver a decidir nada. Ese es el criterio
  de salida, y es también lo que hace barato el bloque siguiente.
- **Bloque I — implementación (Sonnet 5).** Todo el resto de la fase, back-end y clientes:
  esquema, endpoints, pruebas, UI, documentación de cierre. **No decide formas de datos**; si
  necesita decidir una, es que el bloque D no terminó.

Reglas del handoff:

- **No se cambia de modelo en caliente.** Si a mitad del bloque I aparece un disparador, no se
  escala en el momento: se anota en `docs/STATUS.md` y se junta con los demás para un bloque D
  corto —al final de esta fase o al principio de la siguiente—. La excepción es el disparador 3
  (permisos y privacidad): eso **sí** para la implementación en el acto, porque seguir
  construyendo sobre una frontera mal puesta es peor que perder el agrupamiento.
- **Fases de solo clientes no tienen bloque D.** Entran directo en Sonnet 5, incluida su revisión
  final. La única forma de que una fase de cliente necesite Opus 5 es que descubra un hueco en el
  contrato — y eso, por el principio de "back-end primero", ya no es trabajo de cliente: se
  detiene, se anota y se resuelve como bloque D en back-end.
- **Cada fase del `ROADMAP.md` de los tres repos dice qué bloque le toca** en su línea
  "**Modelo**". Si una fase no la tiene, es Sonnet 5.

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
