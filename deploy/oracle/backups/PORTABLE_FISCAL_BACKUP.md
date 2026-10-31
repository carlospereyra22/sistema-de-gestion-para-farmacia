# Respaldo fiscal portable

Complementa la descarga diaria existente; no la reemplaza ni modifica certificados.
Destino autorizado: `%LOCALAPPDATA%/FarmaciaJuncos/RespaldosCifrados`, fuera del
repositorio y de Netlify, con ACL exclusiva del usuario Windows.

Ejecutar `prepare-portable-backup.ps1`. Una ventana pide dos veces una frase de
16 a 1024 caracteres. No es la clave fiscal. Guardarla por separado en un gestor
de contraseñas o medio seguro; no enviarla por chat. No se conserva la frase en
archivos, argumentos, variables de entorno ni registros. Perderla impide abrir
la copia. El cifrado no depende de DPAPI ni de esta cuenta Windows.

El cliente inicia el respaldo consistente existente en Oracle (que prueba su
restauración), obtiene dump y clave AES por SSH con host verificado, y cifra el
paquete **en memoria** mediante AES-256-GCM y scrypt (N=65536, r=8, p=1, sal
aleatoria de 32 bytes, nonce aleatorio de 12 bytes y tag de 16 bytes). Escribe
únicamente `.gbackup` cifrado, sin reemplazar copias anteriores. La implementación
limita el paquete a 192 MiB; si la base crece, requiere un formato con streaming.
Referencia: [crypto de Node](https://nodejs.org/api/crypto.html).

Lee de nuevo el archivo del PC, autentica completamente su contenido y lo
transfiere por stdin SSH al comprobador. Éste restaura en una base temporal
`gestion_fiscalcheck_UUID`, revoca CONNECT público y verifica que la clave
recuperada descifre las credenciales de producción y corresponda a sus
certificados. No consulta ARCA, emite comprobantes, modifica la base productiva
ni sustituye el custodio. Retira exclusivamente la base temporal del ensayo.
Sólo tras ese éxito escribe `.verified.json` con fecha, hash y resultados.

Instalar el comprobador con propietario root y modo 600 en
`/usr/local/lib/gestion-backup/verify-fiscal-recovery.cjs`. Requiere PostgreSQL 18
y el acceso SSH/sudo administrativo existente. No es un endpoint público.
Fallos muestran sólo la etapa; no imprimen dumps, claves ni datos de pacientes.

Para recuperación ante pérdida del VPS: conservar el `.gbackup`, su contraseña,
estos scripts, las fuentes de la aplicación y documentación de reconstrucción
fuera del VPS. En un servidor nuevo revisar rutas/identidad SSH, descifrar con
`fiscal-envelope.cjs` sin imprimir su contenido, restaurar el dump en una base
nueva e instalar la clave AES con permisos restringidos. Verificar credenciales
antes de conectar la API. No restaurar sobre una base comercial en uso. Nunca
subir respaldos, contraseña ni clave AES a Netlify o Git.

La copia portable es puntual, no una réplica continua. Repetir después de
cambios de certificado/custodia y periódicamente. La tarea Windows existente
continúa descargando dumps diarios con ACL privada (sin cifrado de archivo);
depende de que esta PC esté encendida, conectada y con sesión iniciada. Un
respaldo viejo no contiene ventas posteriores; proteger también esta PC y
mantener otra copia del archivo cifrado en un medio independiente.

No declarar `FISCAL_RECOVERY_VERIFIED=yes` por haber creado un archivo: se exige
la comprobación satisfactoria desde el archivo guardado y conservar su recibo.
