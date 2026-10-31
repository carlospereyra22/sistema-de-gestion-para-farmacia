# Verificación fiscal — 03/10/2026

## Resultado y alcance

Circuito local de factura C productiva, notas C parciales/totales, liquidación separada y HTML térmico con CAE/QR implementado. No se declaró listo para emitir ni se activó producción. No se emitieron comprobantes fiscales reales durante esta revisión.

Correcciones de la revisión: ambiente fiscal comprobado también al recuperar una venta ante conflicto de unicidad; control de identidad en respuestas autorizadas/rechazadas; validación de datos serializados y vencimiento CAE; dependencia circular eliminada en el interruptor de emisión; nombre genérico de factura en Historial, sin llamar prueba a una factura productiva. El nombre comercial encabeza el comprobante.

## Comprobaciones realizadas

- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: ejecutados. Se corrigieron la expectativa de un mensaje antiguo y el tipo de un fixture nuevo. Suites y compilación posteriores pasaron.
- Tests adicionales: requisitos de activación, receptor, fecha/CAE, factura y nota C impresa, conservación de módulos y zona blanca del QR. La matriz se compara con qrcode; no se ensayó un lector óptico independiente.
- Integración `test/production-sales.integration.spec.ts` con PostgreSQL local y SOAP simulado: factura, idempotencia, vuelto, conservación del ambiente, notas parciales, límites, liquidación única, cuenta corriente y respuesta perdida/conciliación. Usa rollback; no emite en ARCA ni elimina historial comercial.
- Instalación limpia con lockfile, generación Prisma, lint/types/tests y compilación en copia aislada: script `publicar-produccion.ps1 -PrepareOnly -NonInteractive` terminó correctamente. La copia no contiene secretos; excluye tests de integración con base, que se verificaron en el proyecto local.
- Oracle consultado sin mutaciones: servicio activo y health/database ok; todavía ejecuta `20260928-112039-7df5915c`. No se actualizaron Oracle, Netlify, flags ni certificados.

Paquete de preparación: `.cache/production/20261003-202024-83f7e552/`. No subir su frontend antes del despliegue coordinado del backend/migraciones. `SUBIR-A-NETLIFY` no fue reemplazado. Build advierte bundle JS mayor de 500 kB; no bloquea compilación.

## Pendiente antes de operar

1. Confirmar destino de respaldo externo de base y clave AES y comprobar restauración. La copia dentro del VPS no cubre su pérdida. Se pidió esa información al titular; no se presupone resuelta.
2. Completar ensayo concurrente de dos clientes/conexiones independientes, además de las pruebas idempotentes ya realizadas; revisar permisos y casos operativos con la instalación definitiva.
3. Publicar backend/migraciones y frontend juntos; verificar nuevamente conexión, configuración y versión servida. El punto 00003/Casa Central fue confirmado como exclusivo por el titular, pero esa confirmación no reemplaza la activación auditada.
4. Sólo tras cumplir requisitos, activar flags operativos y asociación de sucursal. No establecer `FISCAL_RECOVERY_VERIFIED=yes` sin evidencia real ni generar una factura ficticia como prueba.
5. Probar papel de 80 mm, QR escaneable, documentos largos y corte. Facturación usa diálogo del navegador, no RAW automático. Primer comprobante real únicamente sobre una operación comercial real confirmada.

Alcance soportado: C para MONOTAX/EXEMPT, bienes, PES. A/B, servicios, notas de débito, otras monedas y RAW fiscal permanecen fuera del alcance implementado; no habilitarlos mediante etiquetas.
