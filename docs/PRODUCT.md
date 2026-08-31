# Micelio — Visión del producto

> Copia canónica. Las copias en `micelio-front-end/docs/PRODUCT.md` y
> `micelio-app/docs/PRODUCT.md` deben mantenerse sincronizadas con esta.

## Qué es Micelio

Micelio es una red social enfocada en **arte y elementos audiovisuales**: cada usuario construye
un perfil tipo Instagram que funciona a la vez como **repositorio** de su obra y como
**comunidad digital** para compartir los procesos creativos de diferentes artistas.

El nombre importa: un micelio conecta todo bajo la superficie. La aplicación debe sentirse
**viva y conectada** — cada interacción tiene animaciones cuidadas (por ejemplo, dar "me gusta"
genera una onda expansiva por el fondo visual de la aplicación, como si el like se propagara por
la red). Ver `docs/DESIGN-SYSTEM.md` en los repos de front y app.

## Plataformas

| Repo | Qué es |
| --- | --- |
| `micelio-back-end` | API NestJS + PostgreSQL + S3 (única fuente de datos) |
| `micelio-front-end` | Web (Vue 3). Debe aprovechar mejor imágenes anchas y grandes |
| `micelio-app` | Móvil (Expo / React Native), Android e iOS |

Web y app **no comparten librerías** pero sí deben verse consistentes: mismos colores,
tipografías, estilo y sensación. La experiencia de usuario es siempre la prioridad; la app debe
estar muy bien optimizada para móvil.

## Tipos de usuario

1. **Usuario promedio** — crea y sube publicaciones, construye y reorganiza su feed, crea
   carpetas ("proyectos") con sub-carpetas, agrega descripciones a sus publicaciones.
2. **Usuario profesor** — todo lo anterior, y además: crea grupos (curso/clase) de usuarios,
   crea carpetas de grupo donde los alumnos cargan archivos (el alumno decide si ese archivo
   también va a su feed; siempre queda en su biblioteca), ve tablas de alumnos con los trabajos
   cargados y les asigna calificaciones. *(El detalle de la visualización está por delimitar.)*
3. **Usuario administrador** — permisos elevados sobre toda la aplicación: acceso a todos los
   recursos, carpetas, bibliotecas, chats y configuración. *(La forma de visualizar tanta
   información está por determinar.)*
4. **Usuario de soporte** — el administrador le delega permisos de visualización elevados para
   gestionar incidentes. *(Alcance por determinar.)*

## Registro e identidad

- Registro con: **cédula, nombre, username, contraseña y correo**.
- La cédula es de **formato colombiano**, **única por cuenta** y por ahora solo se almacena
  (sin validación). En el futuro se contrastará contra bases de datos de la **Universidad de
  Antioquia** (también servirá para otorgar automáticamente el rol profesor).
- El **username/nametag** es único y sirve para reconocer y buscar usuarios.

## Grafo social y privacidad

- Los usuarios pueden **seguir** a otros y **marcar seguidos como favoritos**. Existe el
  concepto de **seguidores y seguidos**.
- Perfiles **privados por defecto**; el dueño puede hacerlos públicos desde la configuración de
  su perfil.
- Si el perfil es privado, todo su contenido solo es visible para usuarios con **follow mutuo**
  (ambos se siguen).

## Funcionalidades

### Perfil y feed personal
- Perfil tipo Instagram: descripción (bio), foto de perfil, feed propio.
- El usuario **construye su feed a su gusto**: reordena sus publicaciones **arrastrándolas**
  (drag & drop) y las publicaciones pueden tener **tamaños diferentes**.
- El dueño elige el **layout de su feed**: **cuadrícula o masonry**, con **1 a 6 columnas** y
  **espaciado entre publicaciones configurable**.
- Imágenes de diferentes tamaños en feeds y home; visualización similar a Tumblr / Instagram / X.

### Biblioteca y carpetas (proyectos)
- Cada usuario tiene una biblioteca de archivos subidos (imágenes, videos, texto).
- Carpetas = "proyectos"; admiten **sub-carpetas**.
- La biblioteca alimenta publicaciones; es **independiente** de los archivos de chat.

### Publicaciones e interacciones
- Publicaciones con descripción, a partir de medios de la biblioteca.
- **Etiquetas** por publicación (máx 10): explícitas y/o `#hashtags` en la descripción.
  Alimentan la búsqueda y el ranking personalizado.
- **Likes**: se cuentan y almacenan; el **dueño de la publicación ve el número y quiénes**
  dieron like. Para el resto de usuarios no son visibles.
- **Comentarios** en publicaciones.
- **Guardar** publicaciones de otros usuarios para verlas después.
- **Compartir** publicaciones por chat.

### Home
- Espacio tipo Instagram/Tumblr con publicaciones de los usuarios: alimentado por los
  **seguidos** (con prioridad a los **favoritos**) + descubrimiento de perfiles públicos.
- **Ranking personalizado por interacciones:** si X da likes, comenta, guarda o comparte
  contenido de Y — lo siga o no —, Y gana relevancia en el home de X; igual con las etiquetas
  con las que X interactúa mucho o muy seguido. Sin ML: pesos fijos y decaimiento (vida media
  90 días). Especificación exacta en `micelio-back-end/docs/API-CONTRACTS.md`.

### Chat
- Mensajería entre usuarios: texto, imágenes, audios y videos (implica **sockets**).
- Los adjuntos de chat pertenecen al chat, **no** a la biblioteca de publicaciones: son cosas
  separadas.

### Notificaciones
- Para mensajes, comentarios, me gustas y publicaciones.
- **Decidido:** empieza como módulo dentro del monolito, pero **aislado y extraíble**
  (estructura separada, comunicación solo por eventos, tablas propias) para migrar a
  microservicio con mínimo esfuerzo cuando se decida. Ver
  `micelio-back-end/docs/ARCHITECTURE.md`; el repo nuevo lo creará el dueño del producto.

### Mercado (market)
- Espacio propio de cada usuario para poner en venta o promocionar **obras, creaciones,
  servicios o eventos**.
- Separado del feed, pero el usuario puede decidir compartir un ítem del market en su feed.
- **Pagos dentro de la aplicación:** decididos para una **segunda fase**; por ahora el market
  es solo publicación y promoción.
- Cada publicación de market lleva **categoría obligatoria**: `servicio`, `obra`, `evento`,
  `recurso`, etc., para permitir filtros en la búsqueda.

### Búsqueda
- Búsqueda de **usuarios** (por username/nombre) y de **palabras clave** en descripciones y
  etiquetas de publicaciones.
- La sección de búsqueda (como la de Instagram) también muestra los ítems del market, filtrables
  por categoría.
- **Explore:** antes de escribir, la sección muestra una cuadrícula de descubrimiento
  personalizada por la afinidad de cada usuario (autores y etiquetas con los que interactúa).
  El orden de los resultados de búsqueda también usa esa afinidad.

### Grupos de profesores
- El profesor crea grupos, agrega usuarios, crea carpetas de curso.
- Los alumnos cargan archivos a esas carpetas; el archivo queda en su biblioteca y ellos deciden
  si usarlo en su feed.
- El profesor ve tablas de alumnos y trabajos, y asigna calificaciones. *(Por delimitar más.)*

## Diseño (abierto y fácil de modificar)

El diseño debe quedar centralizado en tokens para que un ajuste grande sea trivial:

- **Color principal:** `#222222`
- **Color secundario:** `#ffbe09`
- **Complementarios:** `#FF2F2F`, `#2176FF`
- **Tipografías:** Poppins (principal), Montserrat (secundaria)
- **Estilo:** Modern Dark con Glassmorphism; color dinámico "vivo" — degradados en movimiento en
  bordes y elementos resaltados.
- Animaciones bonitas en cada interacción; la onda expansiva del like es la firma visual.

## Decisiones tomadas (2026-08-31, dueño del producto)

1. **Follows:** existe seguir usuarios y marcar seguidos como **favoritos**; hay seguidores y
   seguidos.
2. **Notificaciones:** módulo en el monolito, aislado y extraíble a microservicio (ver
   `ARCHITECTURE.md` del back-end).
3. **Likes:** el dueño ve **quién** dio like y el **número**.
4. **Cédula:** formato de Colombia, única; solo se guarda (sin validación por ahora); futura
   validación contra bases de datos de la Universidad de Antioquia.
5. **Market:** por ahora publicar/promocionar; **pagos en una segunda fase**.
6. **Privacidad:** perfiles **privados por defecto**, opción de hacerlos públicos en la
   configuración del perfil; contenido privado visible solo con follow mutuo.
7. **Feed:** reordenable arrastrando; tamaños distintos; layout **cuadrícula o masonry**, de
   **1 a 6 columnas**, **espaciado configurable**.
8. **Rol profesor:** lo otorga el administrador; en el futuro será automático al contrastar con
   la base de datos de la universidad.
9. **Ranking personalizado:** las interacciones (likes, comentarios, guardados, compartidos)
   aumentan la relevancia del autor y de las etiquetas para quien interactúa — en el home, el
   explore y la búsqueda. Contadores con pesos y decaimiento, sin ML; los posts llevan
   etiquetas para habilitarlo.

## Preguntas abiertas (pendientes del dueño del producto)

1. ¿Límites de tamaño/duración para videos y audios?
2. ¿Comentarios con respuestas anidadas o planos?
3. ¿Chats grupales o solo 1 a 1 en la primera versión?
4. Alcance de visualización de admin y soporte (pantallas concretas).
