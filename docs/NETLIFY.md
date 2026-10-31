# Web en Netlify, API en Oracle

Compilar con VITE_API_URL=/api/v1 en el entorno del proceso de build, por encima
del valor de desarrollo que pudiera existir en .env. Publicar exclusivamente
apps/web/dist mediante Netlify Drop, en el sitio existente sistema-de-gestion22. No subir el repositorio,
archivos .env, claves ni node_modules. Netlify Drop no ejecuta el build.

Para actualizaciones habituales usar Publicar Produccion.cmd, que prepara
SUBIR-A-NETLIFY después de actualizar y verificar el backend. Ver
PUBLICAR_PRODUCCION.md. No publicar una carpeta anterior si el lanzador falla.

apps/web/public/_redirects se copia al dist: primero reenvia /api/v1/* a
https://163.176.241.51/api/v1/:splat, luego resuelve rutas SPA con index.html.
Asi el navegador usa su mismo origen y las cookies HttpOnly/Secure/SameSite=Strict
existentes sin habilitar cookies de terceros. La conexion Netlify-Oracle tambien
usa HTTPS. Nginx devuelve Cache-Control: no-store para respuestas de la API.
Verificar esos encabezados y cookies en la publicacion real, no solo localmente.

Si cambia la IP de Oracle, actualizar _redirects y el certificado del servidor.
No se requiere dominio propio. Los limites del plan y el consumo compartido con
otros proyectos de Netlify siguen aplicando: no se garantiza costo cero ni servicio
ininterrumpido. El proxy tiene un limite de tiempo de respuesta de 26 segundos;
las tareas prolongadas deben revisarse antes de usarlas por este acceso.

Despues de publicar, verificar /api/v1/health desde el dominio netlify.app, login,
recarga de pagina, renovacion de sesion y logout; no dar el despliegue por cerrado
solo porque aparezca el formulario. No crear ventas ficticias en produccion.
Los backups y la recuperacion del cron pendiente siguen siendo tareas separadas.

Referencia: https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/
