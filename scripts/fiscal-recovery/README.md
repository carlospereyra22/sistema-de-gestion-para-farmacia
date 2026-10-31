# Recuperación operada de homologación

Herramientas puntuales para recuperar el certificado original de localhost en
Oracle. No son endpoints ni se publican en el frontend. No habilitan producción.

El 27/09/2026 se recuperó la credencial de pruebas de Farmacia Juncos:

- Se comprobó localmente que el certificado almacenado correspondía a la clave
  DPAPI original y que seguía vigente.
- La credencial de destino sólo tenía una solicitud, sin certificado. Se
  comprobaron CUIT, versión y ausencia de emisiones pendientes/inciertas.
- Se ejecutó el respaldo del servidor y su comprobación de restauración antes
  de escribir. La solicitud anterior puede recuperarse desde ese respaldo.
- El traslado fue por stdin de SSH con verificación de host; no se escribieron
  archivos privados planos ni se imprimieron claves. Oracle volvió a cifrar la
  clave con su custodio AES y contexto de organización/ambiente de destino.
- Se actualizó únicamente HOMOLOGATION, versión 1 a 2, con auditoría
  `RECOVERED_FROM_LOCAL`. Se invalidaron accesos cacheados y la solicitud anterior.
  No se transfirieron tokens de acceso, ventas ni configuración productiva.
- Una comprobación posterior abrió la clave persistida en Oracle y validó de
  nuevo su correspondencia con el certificado y su huella original. API activa.
- No se consultó ARCA ni se emitieron comprobantes: el usuario debe ejecutar
  «Probar conexión con ARCA» desde la web para verificar la autorización externa.

Los scripts están limitados a la instalación y release indicadas en el código;
requieren revisión antes de reutilizarlos. `check` hace validación sin escritura;
`transfer` exige versión 1 y ningún certificado preexistente. No sobrescriben
una credencial ya recuperada. Ejecutar el emisor desde `apps/api` con
`node --env-file=.env -r ts-node/register` y los argumentos organización origen,
organización destino y modo. Nunca pasar claves como argumentos.

Verificado: sintaxis Node, comprobación previa sin escritura, traslado y lectura
posterior de la credencial cifrada. No hubo cambios en la aplicación ni se
repitió la suite completa para estas herramientas operativas.
