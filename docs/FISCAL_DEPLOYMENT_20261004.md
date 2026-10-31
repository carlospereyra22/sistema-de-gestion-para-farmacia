# Estado operativo fiscal — 04/10/2026

Fecha de revisión según el contexto del usuario. Los nombres de releases y recibos conservan las fechas originales del host.

## Completado y verificado

- El titular autorizó respaldo cifrado en esta PC y eligió la contraseña en una ventana local. No se pidió, imprimió ni guardó la contraseña en el chat.
- Copia portable fuera del repositorio: `%LOCALAPPDATA%/FarmaciaJuncos/RespaldosCifrados/gestion-fiscal-2026-10-03T23-35-14-637Z-183f78d5.gbackup`. Incluye base y clave AES. SHA-256: `1c97aec1bf4373bb8d7f7d9074c7bdede64152ef7745578d330ba0e95cfb0e67`.
- Se leyó y descifró el archivo guardado, se restauró en una base temporal aislada de Oracle y se comprobó que la clave recuperada abre la credencial productiva y coincide con el certificado. Resultado: una organización y una credencial recuperadas. Se eliminó exclusivamente la base temporal; no se modificaron registros comerciales de producción.
- Recibo local `.verified.json`; copia administrativa en `/var/backups/gestion-secrets/recovery-20261003.json` con permisos restringidos.
- La tarea existente `FarmaciaJuncos-RespaldoOracle` conserva descargas diarias de base a esta PC; la última comprobada terminó con resultado 0. Esos dumps son privados por ACL, no cifrados a nivel de archivo. La copia portable cifrada es puntual, no replicación continua. Conservar la contraseña por separado.
- Ensayo con dos conexiones PostgreSQL independientes en esquema sintético aislado: no reenvía una solicitud en curso, bloquea otra del punto y continúa con numeración sucesiva después de confirmar la primera. Esquema de prueba retirado, sin borrar datos de usuario. SOAP simulado, sin emisión real.
- Suite local completa: 248 tests API, 216 web y 18 de impresión; dos tests adicionales de cifrado. Lint, tipos y builds pasaron también en la copia de publicación. Advertencia no bloqueante: bundle web mayor de 500 kB.
- Backend publicado y migraciones aplicadas mediante el procedimiento con respaldo/restauración previos. Release activo: `20261003-203658-4a189596`. Health y base responden correctamente, incluido el proxy del dominio Netlify.
- Drop-in `/etc/systemd/system/gestion-api.service.d/60-fiscal-production.conf`: `FISCAL_RECOVERY_VERIFIED=yes` y `FISCAL_PRODUCTION_ISSUANCE=enabled`. El proceso activo confirmó ambos valores. Esto permite activar sucursales; NO las activa automáticamente.
- Perfil MONOTAX completo, credencial productiva versión 2 vigente. No se sustituyó certificado ni clave. Cero FiscalDocument productivos al revisar.
- El titular confirmó que la sucursal activa **Farmacia Juncos**, id `6feac000-6d28-4889-81d7-7ed482b075ca`, es la Casa Central acordada y usará exclusivamente el punto 00003.

## Pendiente, sin declarar habilitación completa

- Netlify sigue sirviendo `index-CjC0c5d-.js`. La carpeta `SUBIR-A-NETLIFY` está preparada con `index-DDLL_wWb.js` y `index-HIPaEXK9.css`. Debe publicarse en el sitio existente `sistema-de-gestion22`; no subir repositorio, respaldos ni claves. No existe sesión CLI ni plugin Netlify disponible en esta sesión. No se extrajeron cookies ni se fabricaron credenciales.
- No hay FiscalProductionConfiguration activada. Después de publicar frontend: verificar producción desde la web, seleccionar Farmacia Juncos/punto 00003 y activar con la sesión autorizada. La activación pasa por el servicio y su auditoría, no por SQL directo.
- Verificar sesión y selector de Ventas desde la web publicada; impresión física y lectura óptica del QR pendientes. No se emitieron facturas ficticias para probar ni se convirtió historial de homologación.

La carpeta pública anterior se conservó en `.cache/production/20261003-203658-4a189596/netlify-anterior`. No se eliminaron archivos ni registros históricos.
