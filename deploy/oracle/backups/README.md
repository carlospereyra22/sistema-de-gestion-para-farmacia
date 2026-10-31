# Respaldos de PostgreSQL en Oracle

Desde /home/ubuntu/gestion-app ejecutar `sudo bash deploy/oracle/backups/install.sh`.
No se requiere contrasena: root ejecuta pg_dump como usuario local postgres con
autenticacion peer. La tarea solo lee gestion_prod; no la restaura ni modifica.
No publica backups por HTTP ni copia secretos del entorno de la API.

Cada dia a las 03:00 Argentina (06:00 UTC, hasta 5 minutos de demora) genera un
dump custom comprimido consistente con PostgreSQL 18. Persistent=true recupera
una ejecucion omitida al encender el host; no recupera estados pasados de datos.
Se conserva una copia por fecha UTC (ultimas 7 fechas exitosas) y la primera copia
exitosa de cada semana ISO (ultimas 4 semanas exitosas). Se usan hardlinks para
no duplicar espacio entre diario/semanal. Repetir en el mismo dia reemplaza solo
el diario de ese dia; el semanal permanece intacto. Solo se podan dumps propios
con nombres exactos despues de crear y restaurar exitosamente la nueva copia.
Las copias vencidas se eliminan permanentemente, sin tocar datos comerciales.

Antes de publicar cada copia se restaura por completo en una base temporal
gestion_restorecheck_UUID, propiedad de postgres y sin CONNECT para PUBLIC.
Se comprueban tablas de organizaciones, usuarios y migraciones, y luego se
elimina exclusivamente esa base temporal. No se comparan conteos con la base
viva, que puede seguir recibiendo escrituras. No se ejecuta la API contra ella.
flock impide backups simultaneos. El script exige un margen libre de 2 veces el
tamano de la base mas 2 GiB; es un control conservador, no una cuota de disco.
Un corte brusco puede dejar una base temporal o archivo parcial: revisar antes
de retirar esos residuos. Nunca usar un comando generico para borrar bases.

Estado: `systemctl status gestion-backup.timer gestion-backup.service --no-pager`.
Ultimo resultado: `sudo journalctl -u gestion-backup.service -n 30 --no-pager`.
Manual: `sudo systemctl start gestion-backup.service`.
No hay alerta externa de fallos configurada; revisar resultados y espacio libre.

Ubicacion /var/backups/gestion, directorios root:ubuntu 750 y dumps 640. Ubuntu
puede descargarlos con scp, no modificarlos. latest.dump apunta al ultimo dump
probado. Son datos sensibles (incluyen hashes de usuarios y datos comerciales),
no estan cifrados a nivel de archivo. No subir a Git/Netlify ni compartirlos.
Guardar la copia externa en una carpeta privada y disco cifrado.

Una copia en el mismo servidor NO protege contra perdida de la instancia,
cuenta o disco. Descargar latest.dump a otra maquina con frecuencia; el objetivo
de copia externa automatica queda pendiente hasta configurar un destino.
No se contrata almacenamiento adicional ni se crean cuentas con este script.
El espacio consumido en el disco existente debe vigilarse.

En Windows, ejecutar download-backup.ps1 con PowerShell. Usa la clave existente
en .ssh/oracle-gestion.key, exige la huella SSH previamente verificada y descarga
a LOCALAPPDATA/FarmaciaJuncos/Backups con ACL exclusiva del usuario. Verifica la
cabecera custom PGDMP y no reemplaza ni elimina copias anteriores. La prueba real
de restauracion se realiza en Oracle, no en Windows. Conserva la fecha remota y
reporta fallo si la copia tiene mas de 48 horas, aunque conserva lo descargado.

Para automatizar, ejecutar install-windows-task.ps1 como el usuario real de
Windows. Registra FarmaciaJuncos-RespaldoOracle a las 19:00 locales y al iniciar
sesion, sin contrasena guardada ni privilegios elevados. Copia scripts a
LOCALAPPDATA/FarmaciaJuncos/Automatizacion con ACL privada. Requiere sesion iniciada,
equipo encendido y conectado; permite bateria, recupera ejecuciones omitidas y
reintenta 3 veces cada 15 minutos. No garantiza copias mientras el PC esta apagado.
No duplica tareas ni sobreescribe una instalacion existente. Conserva todas las
copias locales: vigilar el espacio. El backup refleja el ultimo snapshot nocturno,
no las operaciones posteriores; una perdida puede afectar hasta el intervalo
desde la ultima copia externa. No es replicacion continua.

Consultar Get-ScheduledTaskInfo -TaskName FarmaciaJuncos-RespaldoOracle y el archivo
Automatizacion/ultimo-respaldo.log. Resultado 0 indica exito; no hay alertas externas
ni notificaciones configuradas. El instalador lanza una primera descarga para
comprobar permisos y conectividad. No se requiere modificar la aplicacion en Oracle.

Recuperacion real: crear una base nueva vacia y el rol de aplicacion, usar
pg_restore --no-owner --no-acl --single-transaction conectado como ese rol,
validar y recien entonces cambiar la conexion de la API. No restaurar encima de
gestion_prod ni ejecutar seed. El backup no incluye roles globales PostgreSQL,
su contrasena, configuracion Linux, certificados ni codigo; conservar el codigo
por separado y regenerar los secretos/HTTPS si se reconstruye el servidor.

Referencias: https://www.postgresql.org/docs/18/app-pgdump.html y
https://www.postgresql.org/docs/18/app-pgrestore.html.
