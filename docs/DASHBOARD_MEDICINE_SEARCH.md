# Buscador de medicamentos en Inicio

AlfaBeta es la opción principal. Los resultados se muestran dentro del sistema, sin redirección, iframe, anuncios ni ejecución de HTML externo. El backend consulta el formulario público por nombre y lee únicamente nombres, laboratorios, presentaciones, precios y fechas. No crea productos ni cambia precios de venta, stock, deuda o cron.

- Buscar con Enter o el botón, con al menos dos caracteres. No consulta en cada pulsación.
- Búsqueda por palabras: se consulta una palabra del nombre en AlfaBeta y se filtra la respuesta por todos los términos ingresados, sin depender de espacios consecutivos, mayúsculas, tildes u orden. `actron 400` encuentra `ACTRON 400 RAPIDA ACCION NF` sin incluir 600 ni 4000. Se filtra antes de limitar a 30 resultados y se reutiliza la caché de la palabra base. Solo busca datos presentes en el nombre, no infiere equivalencias ni concentraciones ausentes.
- AlfaBeta devuelve hasta 30 nombres. Las primeras dos fichas se precargan en segundo plano tras 150 ms; las demás al apuntarlas con el mouse, enfocarlas con teclado o desplegarlas. No se retrasa la lista esperando precios. Una ficha cargada se conserva mientras siga montada; una búsqueda nueva descarta esas fichas.
- El backend reutiliza respuestas correctas por 60 segundos, con hasta 100 búsquedas y 100 fichas en memoria por proceso, sin guardar datos comerciales. Comparte solicitudes simultáneas y no guarda errores. Al vencer el plazo vuelve a consultar; no sirve respuestas vencidas ante fallos. No hay descargas masivas ni precarga de todo el catálogo.
- Endpoints autenticados `medicine-references/alfabeta?q=...` y `medicine-references/alfabeta/:id`, con permiso `CATALOG_READ` revalidado antes de acceder a la caché. Consulta de 2–120 caracteres, host fijo, identificadores restringidos y redirecciones deshabilitadas. Timeout de ocho segundos por petición. Un formato inesperado devuelve error, no un falso resultado vacío.
- No copia descripciones médicas ni realiza descargas masivas o sincronización de catálogo. La publicación web no equivale a una licencia de base de datos; para integrar un catálogo comercial o actualizaciones masivas debe acordarse acceso con el proveedor. El conector depende del formato público y puede requerir mantenimiento.
- Fuentes alternativas internas: Vademécum nacional y Precios de Remedios, mediante el endpoint existente (actualmente permiso `CATALOG_MANAGE`).
- Agrupa resultados por nombre, laboratorio y fuente; cada medicamento se despliega con sus presentaciones e importes de referencia en ARS.
- Las fuentes alternativas conservan el límite anterior de ocho coincidencias. Para precisar, agregar concentración o presentación.
- Muestra la fecha tal como la informa la fuente; no la confunde con la fecha de consulta. Los datos ausentes se identifican expresamente. Precios de Remedios actualmente no aporta fecha ni principio activo mediante este conector.
- El buscador no consulta, almacena ni muestra fotografías de medicamentos. Se retiraron los conectores de imágenes, los archivos locales y su caché para mantener la consulta centrada en presentaciones y precios.
- Cancelación de solicitudes al editar la consulta, cambiar fuente o desmontar; respuestas canceladas no reemplazan resultados más recientes.
- No ofrece indicaciones terapéuticas, equivalencias ni coberturas de obras sociales.

Implementado para probar en local; publicar requiere desplegar backend y frontend. No requiere migraciones.
