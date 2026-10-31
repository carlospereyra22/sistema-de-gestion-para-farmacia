# Pruebas primero, publicación después

## Comparación de código — 04/10/2026

Se consultó por SSH el WorkingDirectory del servicio activo de Oracle: release `20261003-203658-4a189596`. Comparación de hashes normalizados (CRLF/LF) de 187 archivos de fuente API, contratos, migraciones y manifiestos: ninguno faltaba localmente. Antes de los nuevos controles locales, sólo diferían los cuatro archivos de caja/inventario y el schema por el mantenimiento agregado localmente.

La web Netlify publicada coincide byte a byte (JS/CSS) con los artefactos de `.cache/production/20261003-203658-4a189596/source/apps/web/dist`. Los 140 archivos de fuente de esa copia están presentes localmente. Sólo diferían `lib/api.ts` y `workspace-shell.tsx` por el mantenimiento local. Los componentes nuevos no existían en la versión publicada. No hubo código exclusivo de producción que importar ni se reemplazaron cambios locales con versiones anteriores.

Se agregó `scripts/compare-production-source.cjs` para repetir esta revisión de sólo lectura. Requiere la conexión SSH existente y la copia local de publicación. No lee secretos, bases ni respaldos. Si cambia la publicación web, falla explícitamente al no coincidir con la copia conocida; no declara paridad con una publicación desconocida. La comparación revisa fuente, no configuración operativa ni datos.

## Uso seguro

1. Iniciar desde `Iniciar Gestion - Pruebas.cmd`. Si estaba abierto antes del cambio, detener e iniciar desde el panel para aplicar la nueva configuración.
2. Web `localhost:5173`, API `localhost:3000`, PostgreSQL local `gestion_dev`. Mantener credenciales, datos y numeración de prueba separados de producción.
3. El lanzador establece `FISCAL_LOCAL_TESTING=true`, deshabilita emisión productiva y no declara respaldo productivo verificado. El transporte fiscal bloquea toda conexión a ARCA producción con esa bandera, incluso autenticación y consultas. Homologación sigue disponible con sus propios certificados.
4. Probar los cambios con datos locales. Ejecutar formato, lint, tipos, tests y build antes de preparar una publicación de esa misma versión. Publicar API/migraciones antes del frontend cuando hay cambios de esquema.
5. No sincronizar ventas, stock de prueba ni documentos fiscales hacia producción. No restaurar respaldos reales sobre pruebas sin un procedimiento específico de aislamiento y exclusión de secretos.

## Alcance real del espejo

El código de facturación C productiva y notas de crédito parciales ya está localmente. Las pruebas automatizadas ejercitan esos servicios sobre PostgreSQL local con SOAP simulado. Esto **no equivale** a habilitar un simulador fiscal manual completo en la interfaz: homologación mantiene su circuito propio. Para probar manualmente el recorrido productivo completo sin ARCA real todavía hace falta ese adaptador y su preparación de datos; no se habilitó emitiendo documentos reales ni cambiando certificados.

No hay replicación automática de base ni equivalencia exacta de infraestructura (Windows/local frente a Linux/Oracle/Netlify), tiempos de red, impresoras o concurrencia de varias PCs. Estas diferencias deben validarse aparte. Esta tarea no publicó cambios ni modificó la instalación de producción.
