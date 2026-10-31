# Alta inicial de produccion

Despues de `prisma migrate deploy`, usar `apps/api/prisma/bootstrap-production.sh`
en Ubuntu con nombre de organizacion, sucursal y correo como argumentos.
El wrapper apunta exclusivamente a `gestion_prod` en `127.0.0.1:5432` como
`gestion_app`. Solicita la clave de PostgreSQL y una nueva clave del administrador
(16 a 256 caracteres, confirmada), sin mostrarlas ni guardarlas en archivos.
No ejecutar con trazado de shell ni compartir las claves.

El script TypeScript es generico: recibe BOOTSTRAP_ORGANIZATION,
BOOTSTRAP_BRANCH, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD y DATABASE_URL del entorno.
No usa el seed de desarrollo, IDs demo ni credenciales predeterminadas.

Crea una organizacion, una sucursal (codigo interno PRINCIPAL), un usuario con
Argon2 y rol OWNER, sus membresias, los roles OWNER/ADMIN/USER, los permisos
existentes del sistema y una auditoria sin secretos. No crea productos, listas de
precios, clientes, cajas ni operaciones comerciales.

Todo se realiza en una transaccion. Un bloqueo asesor serializa ejecuciones de
este script. Se rechaza la ejecucion si existen organizaciones, sucursales o
usuarios, incluso despues de un alta exitosa: no duplica datos, no cambia claves
ni concede acceso a usuarios preexistentes. Es una herramienta de alta unica,
no una herramienta de recuperacion de contrasenas. Ejecutar antes de iniciar la
API; no ejecutar `prisma/seed.ts` en produccion.

Las credenciales de conexion usadas aqui son temporales para este proceso.
La configuracion persistente de la API, HTTPS y el servicio de inicio automatico
son pasos separados; completar el alta no significa que el sitio este publicado.
