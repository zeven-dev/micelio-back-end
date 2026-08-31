# Módulo `prisma`

**Responsabilidad:** expone `PrismaService` como módulo global (conexión y ciclo de vida).

## Reglas del módulo
- Aquí no vive lógica de negocio: solo el cliente.
- Cada dominio consulta **sus** tablas desde su propio servicio; el cruce de dominios pasa por
  los servicios públicos de cada módulo.
- Migraciones: `npm run prisma:migrate` con nombre corto y descriptivo; nunca editar migraciones
  aplicadas; todo cambio de esquema se refleja en `docs/DATA-MODEL.md` en la misma tarea.
