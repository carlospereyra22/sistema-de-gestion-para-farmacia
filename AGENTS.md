# Project

Sistema de gestion comercial multi-organizacion y multi-sucursal.

## Working rules

- Leer `docs/BUSINESS_RULES.md` antes de modificar logica de negocio.
- Leer `docs/ARCHITECTURE.md` antes de introducir infraestructura.
- No cambiar tecnologias fundamentales sin autorizacion.
- No introducir Firebase, bases NoSQL ni microservicios.
- Mantener TypeScript estricto y evitar `any`.
- No guardar secretos ni editar migraciones ya ejecutadas.
- No eliminar registros comerciales historicos.
- Mantener modulos separados y no colocar reglas criticas solo en React.
- Toda operacion futura de base compleja debe considerar transacciones.
- Todo codigo nuevo debe compilar, tener tests cuando agregue comportamiento y actualizar documentacion si cambia una decision.

## Before finishing a task

Ejecutar, cuando corresponda: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`.
Informar siempre lo que no haya podido verificarse.
