# Preproducción

Preproducción es un ambiente separado para validar una versión antes de publicar
producción. No es una réplica de datos comerciales ni un sitio para operar: sus
ventas, caja, stock, sesiones, usuarios y documentos son exclusivos de
`gestion_preprod` y pueden descartarse sin afectar `gestion_prod`.

## Aislamiento

- API propia: servicio `gestion-preprod-api`, sólo en `127.0.0.1:3001`.
- Base propia: PostgreSQL `gestion_preprod`, con rol `gestion_preprod_app`; no hay
  permisos hacia `gestion_prod`.
- Ruta HTTPS propia: `https://163.176.241.51/preprod/api/v1/`; Nginx sólo reenvía
  esa ruta al puerto 3001. Producción continúa bajo `/api/v1/`.
- Catálogo externo: rol de sólo lectura `gestion_preprod_catalog` limitado a
  `reference_catalog.product` y `beauty_odbl.product`. No puede escribir el
  catálogo ni consultar la base comercial.
- Fiscal: `FISCAL_LOCAL_TESTING=true` y emisión productiva explícitamente
  deshabilitada. No cargar certificados, claves ni puntos de venta reales.
- Web: se publica manualmente en **otro sitio de Netlify** y se usa la carpeta
  `SUBIR-A-NETLIFY-PREPROD`. Nunca subir esa carpeta sobre
  `sistema-de-gestion22`, que corresponde a producción.

La primera instalación crea una organización y un propietario nuevos. No usa seed
demo, no copia datos productivos ni reutiliza la clave JWT de producción. La clave
del propietario se pide de forma oculta y no queda en el repositorio, el historial
de PowerShell ni los logs de despliegue.

## Primera instalación

Elegir un correo y una clave nueva de al menos 16 caracteres para pruebas. Desde la
raíz, en una consola interactiva:

```powershell
.\Preproduccion.cmd -Provision -Email "tu-correo-de-pruebas@ejemplo.com"
```

Desde Git Bash (la terminal de la captura), usar el lanzador equivalente:

```bash
./Preproduccion.sh -Provision -Email "tu-correo-de-pruebas@ejemplo.com"
```

El proceso ejecuta los checks aislados, transfiere una release a
`/home/ubuntu/gestion-preprod-releases/`, crea credenciales exclusivas del servidor,
aplica migraciones en la base vacía y verifica salud local y HTTPS. Antes de tocar
la configuración de Nginx guarda una copia con sufijo `.preprod-before-...bak`.
No detiene `gestion-api` ni modifica `gestion_prod`.

Al terminar, arrastrar `SUBIR-A-NETLIFY-PREPROD` a un sitio Netlify separado, por
ejemplo `sistema-de-gestion-preprod`. Probar allí login, permisos, altas, ventas de
prueba, cierres y carga de productos. La carpeta usa el proxy de preproducción;
debe conservar `/api/v1` como ruta del navegador.

## Publicaciones posteriores

Con el ambiente ya creado:

```powershell
& '.\Publicar Preproduccion.cmd'
```

Desde Git Bash:

```bash
./Publicar\ Preproduccion.sh
```

El publicador vuelve a ejecutar los checks, sube otra release, respalda
`gestion_preprod` a `/var/backups/gestion-preprod/releases/<release>.dump` y prueba
que puede leerse con `pg_restore --list`. Sólo entonces detiene y actualiza
`gestion-preprod-api`; el backend productivo no se pausa. Después deja lista una
nueva `SUBIR-A-NETLIFY-PREPROD` para subir al sitio de Netlify de preproducción.

```powershell
& '.\Publicar Preproduccion.cmd' -PrepareOnly
```

prepara y verifica el paquete sin conectarse al VPS ni reemplazar la carpeta de
Netlify.

## Equipo

El publicador no incluye claves. Cada desarrollador usa su propia identidad SSH
autorizada en el VPS. Por compatibilidad toma
`%USERPROFILE%\.ssh\oracle-gestion.key`; si la identidad está en otra ubicación,
antes de publicar se configura una vez:

```powershell
$env:GESTION_PREPROD_SSH_KEY = "C:\ruta\segura\mi-clave-preprod.key"
```

Opcionalmente `GESTION_PREPROD_HOST` y `GESTION_PREPROD_SSH_USER` permiten cambiar
el destino sin editar scripts. La clave privada no se copia al repositorio, ni se
sube a GitHub. El administrador del VPS debe agregar primero la **clave pública**
del otro desarrollador al usuario autorizado. Después de traer la rama validada,
ambos pueden ejecutar el mismo `Publicar Preproduccion`.

No se hace rollback automático: volver código o restaurar una copia puede perder
pruebas posteriores. Ante un fallo, revisar el journal
`gestion-preprod-deploy-<release>` y el respaldo de esa release antes de recuperar.

## Paso a producción

Preproducción es evidencia de prueba, no autorización automática. Cuando una versión
esté validada, la publicación productiva sigue siendo el procedimiento independiente
de `Publicar Produccion.cmd`, con su propio respaldo y autorización explícita.
