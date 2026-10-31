# Oracle: API y HTTPS por IP

Configuracion para la instancia existente 163.176.241.51, usuario ubuntu,
repositorio /home/ubuntu/gestion-app y base gestion_prod. No es un instalador
generico: revisar esas rutas al trasladarlo a otra instancia.

Requisitos: migraciones y alta inicial completadas, Node 24, dependencias y
compilacion, PostgreSQL local, Nginx, Certbot >=5.4, certificado gestion-api-ip
ya emitido, puertos 80/443 permitidos y firewall persistente. No abrir 3000/5432.

Ejecutar desde el repositorio `sudo bash deploy/oracle/activate.sh`. La clave de
PostgreSQL se introduce sin eco; se genera un secreto JWT aleatorio. Ambos quedan
en /etc/gestion-api/environment, directorio 700 y archivo 600 propiedad de root.
systemd carga el entorno antes de ejecutar Node como ubuntu. Nunca compartir ese
archivo ni ejecutar el instalador con trazado. No guarda la clave del administrador.

El script conserva un environment existente y rechaza sobreescribir servicios o
sitios Nginx existentes. Si falla a mitad, inspeccionar el estado antes de repetir:
no hay rollback automatico. No ejecuta migraciones, seed ni cambios comerciales.
La API escucha en loopback y systemd la reinicia ante fallos o reinicios del host.
Nginx solo publica /api/v1/ sobre HTTPS; /api/docs no queda publicado. HTTP mantiene
la ruta de validacion ACME en /var/www/html para renovaciones sin detener Nginx.
El certificado y el deploy-hook de recarga fueron registrados previamente en
Certbot; el instalador verifica la renovacion en staging con --run-deploy-hooks.
El timer snap.certbot.renew.timer debe permanecer habilitado y monitoreado.

La prueba HTTPS local valida el certificado sin -k, pero no sustituye la prueba
desde Internet. Revisar tambien reinicio, login, renovacion y backups antes de
usar datos reales. La configuracion de Netlify es el siguiente paso: usar proxy
/api/v1 hacia Oracle sobre HTTPS y VITE_API_URL=/api/v1, para conservar las cookies
SameSite=Strict bajo el mismo origen del navegador. No conectar el frontend
directamente a la IP con cookies cross-site, ni cambiar a SameSite=None sin un
diseno de proteccion CSRF. CORS_ORIGIN esta inicialmente limitado a la IP HTTPS.

El certificado dura pocos dias: mantener el puerto 80 y la ruta ACME accesibles,
vigilar expiracion/fallos de renovacion. Si cambia la IP publica, actualizar el
certificado y las configuraciones de Nginx/Netlify. No hay garantia de servicio
24/7 ni de costos nulos solo por completar este instalador.
