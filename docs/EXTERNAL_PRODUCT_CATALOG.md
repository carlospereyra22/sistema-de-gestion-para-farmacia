# Catálogo externo de productos

## Alcance y almacenamiento

Las excepciones de fotografías con un GTIN diferente en el nombre del archivo se conservan en `reviewed_images.py`: requieren asociación exacta fuente/SKU/código/URL/etiqueta y revisión visual de presentación. Se conserva el motivo original y no se equiparan códigos ni se concede verificación física. Una imagen nueva o una asociación distinta vuelve a requerir revisión. La revisión de Nivea 4005808516674 recupera la foto publicada para ese SKU (FPS 60, 150 ml).

La adaptación de categorías no suma especificidad por nombres de raíces generales: una ruta concreta de protección solar prevalece sobre “Cuidado personal”, manteniendo la revisión manual entre alternativas específicas ambiguas.

Catálogo de referencia no medicinal, independiente de productos comerciales, ventas, precios y existencias. PostgreSQL `catalogo_juncos_external` conserva las fichas y evidencias; no tiene claves foráneas al maestro comercial. No se mueve el directorio físico de PostgreSQL al repositorio ni se introduce otro motor.

Las herramientas están en `scripts/external-catalog/`. Los datos de trabajo se mantienen exclusivamente en `data/external-catalog/`, ignorado por Git:

- `baseline/candidates.jsonl`: evidencias originales de SEPA, Excel, v6 y Open Beauty Facts.
- `sources/`: captura vigente de cada tienda, cobertura y datos necesarios para reanudar.
- `current/`: preparación instalada, inventario, manifiesto y verificaciones vigentes.
- `images/`: caché reutilizable de fotografías descargadas.
- `staging/`: preparación pendiente de validar; nunca equivale a una importación.

Se reutilizan esas ubicaciones. No se generan Excel ni copias fechadas de entregables automáticamente: `retail_export.py` se ejecuta sólo por pedido del usuario. Los respaldos previos se conservan fuera del proyecto, en `%LOCALAPPDATA%/FarmaciaJuncos/RespaldosLocales`. Los antiguos archivos de `Downloads/salida_catalogo_juncos` se retiraron a ese área después de verificar un archivo ZIP por SHA-256.

## Fuentes y cobertura

Actualización 28/10/2026: los suplementos con categoría explícita de la tienda se admiten como no medicinales; “cápsulas” o “comprimidos” no basta para descartarlos. El modo `--full-retail-catalog` amplía las tiendas a sus departamentos no medicinales explícitos, incluidos hogar/alimentos; mantiene separados los medicamentos y los registros sin GTIN válido. El filtro reducido de SEPA no se amplía. La cobertura de descarga y la admisión son cifras distintas: los registros descargados pero no consultables conservan su motivo en `inventory.jsonl`.

- **Farmalife y Farmaplus:** API pública VTEX por categorías, con rutas completas para subcategorías; conciliación contra todos los sitemaps de productos y particiones independientes por marca (`vtex_brand_audit.py`). Si un total incluye posiciones sin producto, se revisa cada posición y se documenta la discrepancia. Cada variante conserva su EAN e imagen. Un SKU interno no sustituye el EAN.
- **Farmar:** listado general y todas las categorías del catálogo público, cotejando identificadores con `totalCount`. La búsqueda general ignora categorías: se usa el endpoint público de categorías que utiliza la web. Su credencial de visitante anónimo permanece sólo en memoria. La captura corresponde a la sucursal que presenta públicamente la tienda.
- **Farmacorp:** feed público Shopify, todas las páginas hasta una respuesta vacía. Fuente boliviana: la presencia allí no demuestra comercialización argentina. GTIN exacto para deduplicar; Farmalife/Farmar tienen prioridad sobre esta fuente.
- **Farmamix:** todas las URL de productos del sitemap, producto principal JSON-LD y lista completa `LS.variants`. Nunca se toman productos relacionados como la ficha solicitada. Se conserva SKU validado, variante, categoría e imagen específica. Diario reanudable de hechos y huellas originales; no se acumulan miles de HTML completos.
- **SEPA:** datos reales con indicador EAN y validación de checksum. Se conserva cantidad/unidad informada; los errores y descripciones abreviadas no se corrigen inventando atributos.
- **Excel/v6:** aportes originales del usuario; sólo filas con códigos válidos. No se cuenta dos veces una hoja que repite productos.
- **Open Beauty Facts:** exclusivamente registros con etiqueta `en:argentina`, en `beauty_odbl` y con atribución ODbL-1.0. No se fusionan campos ni fotos con la colección de otras fuentes.
- **Distribuidores autorizados:** CSV UTF-8 `code,name,brand,category,presentation,source_ref`, mediante el importador con `--source` y `--authorization` real. Sin acceso a catálogos privados no autorizados.

“Cobertura completa” significa todos los identificadores públicos de una captura comprobada, no productos privados ni futuras altas. Todo registro recibe un estado; sólo los no medicinales admitidos y con GTIN válido se ofrecen al escanear. Las fichas sin código o fuera del alcance quedan en `reference_catalog.source_record` con su motivo. No se afirma que una descarga parcial está completa. Los fallos de fuente se conservan, aun cuando otra ruta permita recuperar la ficha.

## Normalización e imágenes

GTIN-8/12/13/14 ASCII, checksum módulo 10, rechazo de códigos vacíos, todo-cero, internos o restringidos. La comparación usa GTIN14 con ceros a izquierda; no se corrige el checksum ni se aproxima un código.

Una proyección canónica por GTIN conserva todas las evidencias originales. Selecciona una fila íntegra para nombre y presentación, priorizando Excel y fichas argentinas; las discrepancias de marca, contenido o tipo permanecen señaladas. Desde 27/10/2026 puede completar una marca faltante cuando las evidencias compatibles del mismo GTIN acuerdan una única marca, y una ruta de categorías faltante desde una fuente explícita, con procedencia por atributo. No enriquece entre conflictos ni mezcla ODbL. Ninguna importación concede verificación física. El usuario debe cotejar el envase.

`retail_metadata.py` conserva rutas completas VTEX, reconstruye Farmar por identificadores padre/hijo y conserva breadcrumbs de Farmamix. `farmar_metadata_download.py` revisa fichas incompletas, valida identificador y GTIN, registra hechos y huella en un diario reanudable y se detiene ante HTTP 429. Los tags de Farmacorp se conservan como etiquetas sin inventar una jerarquía; su campo vendor queda identificado en la procedencia de marca. `metadata_prepare.py` enriquece la captura en staging sin cambiar el conjunto de GTIN admitidos ni descargar imágenes nuevamente. `metadata-audit.json` documenta cobertura por fuente, faltantes por código y fallos remotos. Al confirmar una ficha, el servidor busca una raíz existente por la ruta explícita y equivalencias acotadas de las tiendas (por ejemplo Capilar → Cabello, Cuidado oral → Higiene bucal). Prioriza la raíz más específica; reutiliza o crea únicamente los descendientes explícitos faltantes, en una transacción con bloqueo organizacional y auditoría. No crea raíces ni reclasifica productos existentes. Ante conflicto de identidad/tipo o falta de coincidencia, deja elegir manualmente. Una discrepancia sólo de presentación mantiene su advertencia pero no bloquea la categoría explícita de la ficha confirmada. Equivalencias como Dermo/Dermocosmética y Protector solar/Protectores solares reutilizan categorías; grupos conocidos sin raíz propia se adaptan debajo de una raíz existente apropiada, sin crear raíces nuevas. Una categoría ya elegida en el borrador se conserva.

Las fotografías se descargan antes de consultar el código. Se permite sólo una lista explícita de dominios y redirecciones, con límites de 10 MB y 20 millones de píxeles. Se guardan JPEG sin EXIF de hasta 800 px y 60 KB, con URL y huellas. No se comparte una foto genérica entre variantes ambiguas. Puede completarse una foto faltante desde evidencia compatible del mismo GTIN. Una falla de imagen no impide usar los datos y queda documentada. La visibilidad pública no concede licencia abierta; se conservan fuente y condiciones.

## Adaptación a categorías comerciales

La resolución utiliza el nombre, subcategoría y ruta de la ficha confirmada del servidor, nunca una clasificación enviada libremente por el cliente. Familias concretas como repelentes, salud sexual, hisopos y tests se adaptan a raíces existentes; hogar se separa en higiene del hogar y accesorios cuando corresponde. No se asignan alimentos a Suplementos para evitar campos vacíos. Se priorizan raíces específicas existentes y se reutilizan los hijos equivalentes. Las discrepancias de identidad/tipo requieren selección manual. Las reglas sólo actúan al confirmar la ficha: no cambian productos guardados ni crean categorías masivamente.

Después de compilar la API, `node scripts/external-catalog/category-coverage.cjs data/external-catalog/current <categorias-activas.json>` audita todos los GTIN únicos con las mismas reglas y actualiza únicamente `current/classification-audit.json`, con cantidades, porcentaje y detalle de pendientes. Prefiere la ficha de referencia sobre la alternativa ODbL como hace la interfaz; no cuenta dos veces el mismo código.

## Importación y controles

`install.py` admite únicamente localhost/gestion_dev como origen de credenciales y escribe exclusivamente la base externa. Respalda la base previa con `pg_dump` y comprueba `pg_restore --list`. Usa una transacción y bloqueo de importación; conserva evidencias históricas, deshabilita proyecciones sustituidas y actualiza el inventario público. Compara cantidades comerciales antes/después. Nunca hace seed/reset comercial.

Desde la raíz (PowerShell):

```powershell
uv run --python 3.12 --with playwright python scripts/external-catalog/retail_download.py farmar --output data/external-catalog/sources
uv run --python 3.12 --with httpx python scripts/external-catalog/farmamix_download.py --output data/external-catalog/sources
uv run --python 3.12 --with openpyxl python scripts/external-catalog/retail_prepare.py --retail data/external-catalog/sources --baseline data/external-catalog/baseline/candidates.jsonl --previous data/external-catalog/current/candidates.jsonl --output data/external-catalog/staging/prepared --full-retail-catalog
uv run --python 3.12 --with pillow --with httpx python scripts/external-catalog/retail_images.py data/external-catalog/staging/prepared --cache data/external-catalog/images
uv run --python 3.12 --with openpyxl python scripts/external-catalog/coverage_audit.py data/external-catalog/sources data/external-catalog/staging/prepared
uv run --python 3.12 --with "psycopg[binary]" python scripts/external-catalog/install.py data/external-catalog/staging/prepared --manifest data/external-catalog/staging/prepared/manifest.json
uv run --python 3.12 --with "psycopg[binary]" --with pillow python scripts/external-catalog/catalog_readiness.py data/external-catalog/staging/prepared
uv run --python 3.12 --with openpyxl --with pillow --with httpx python -m unittest discover -s scripts/external-catalog -p "test_*.py"
```

`retail_download.py` también admite farmalife, farmaplus y farmacorp. Una captura existente se reanuda; una actualización nueva se prepara temporalmente en `staging` y sustituye la anterior sólo tras conciliar cobertura. Tras instalar y auditar se promueve la preparación a `current`. No se ejecuta exportación Excel en este flujo.

`--previous` conserva referencias válidas de capturas anteriores cuando el código ya no aparece en el nuevo listado, señalándolas como históricas. No rescata códigos que la captura actual excluye ni productos fuera del alcance. En la primera instalación se omite ese argumento. Las fotos VTEX nuevas se solicitan en la variante de 800 px del mismo identificador de imagen; se conservan URL de origen y de descarga.

## API y formulario

`GET /api/v1/organizations/:organizationId/catalog/external-products/barcode/:code` requiere JWT, CATALOG_MANAGE y la organización autorizada por `EXTERNAL_CATALOG_ORGANIZATION_ID`. La vista previa local requiere `EXTERNAL_CATALOG_PREVIEW=true`. Sin URL explícita, la conexión externa se deriva en memoria únicamente desde localhost/gestion_dev; una URL explícita inválida falla sin fallback. No se copian credenciales a documentación.

En producción se habilita únicamente con `EXTERNAL_CATALOG_ENABLED=true`, una organización explícita y `EXTERNAL_CATALOG_DATABASE_URL` apuntando a `catalogo_juncos_external` en `127.0.0.1`. La aplicación se conecta con un rol exclusivo de sólo lectura, con `CONNECT`, `USAGE` de los esquemas y `SELECT` sólo sobre las proyecciones `reference_catalog.product` y `beauty_odbl.product`. El catálogo se restaura independientemente de `gestion_prod`; no recibe claves foráneas, escrituras ni migraciones de la base comercial. La conexión mantiene consultas parametrizadas, transacciones `READ ONLY` y timeouts. La habilitación productiva fue autorizada el 01/11/2026 después de las comprobaciones locales de códigos reales.

La consulta es parametrizada, READ ONLY, con timeout; el parámetro se convierte a `char(14)` para usar el índice de la clave primaria. No hay descargas de tiendas durante el escaneo. En modo automático se prioriza el tipo guardado y después la coincidencia exacta del catálogo no medicinal; sin ella se consulta el padrón. Una selección o clasificación manual impide que una respuesta tardía la sobrescriba.

En Productos > Nuevo producto se escanea en el campo Código de barras. Para no medicamentos se abre una opción compacta; al elegirla se completan los datos disponibles y la foto sin copiar precio ni stock. Si no hay coincidencia, sigue disponible la carga manual. La presentación permanece en Detalles farmacéuticos y se muestra debajo del nombre en la tabla.

La imagen automática no reemplaza una foto elegida o eliminada por el usuario. Cambiar el código retira únicamente la foto autocompletada intacta. La fuente de la foto se conserva al utilizarla. El producto comercial se crea sólo al guardar; las subcategorías se crean al confirmar la ficha de referencia y quedan disponibles aunque se cancele el borrador. La creación manual desde el selector permite elegir una categoría superior; se comparan nombres dentro de esa rama y nunca se elige entre homónimos ambiguos. Marca se conserva en los datos internos y deja de mostrarse en el formulario, listado y filtros.

Una coincidencia oficial medicinal única, vigente y exacta puede completar y vincular el borrador según las reglas existentes. Las alternativas sin EAN requieren elección explícita de presentación. Se conserva el circuito medicinal y sus reglas de precio; un precio ausente nunca se inventa como cero.

## Estado comprobable

Reorganización autorizada del 28/10/2026: siete raíces generales (Medicamentos, Cuidado personal, Dermocosmética, Perfumería y maquillaje, Bebés y maternidad, Salud y bienestar, Hogar y alimentos). Las categorías anteriores se conservan como descendientes, con sus identificadores y asociaciones de productos. El clasificador reconoce también categorías trasladadas y reconstruye toda su ascendencia; no vuelve a crearlas como raíces. La presentación reconoce cantidades explícitas de cápsulas, comprimidos, sobres y otros envases; usa campos de presentación y etiquetas expresas de la ficha sin convertir dosis o concentraciones en tamaño de envase. No atribuye la descripción general a variantes múltiples.

Revisión del 28/10/2026: la preparación incorpora las rutas recuperadas antes de clasificar. Los tags de Shopify no se convierten en una jerarquía: el departamento Supermercado aporta alcance sólo si no coexiste con Salud y Medicamentos. `refresh/` contiene una actualización temporal de fuentes; una captura fallida no reemplaza la validada.

La raíz Hogar y alimentos fue autorizada por el usuario. Ante diferencias de identidad se puede usar únicamente la categoría compartida por todas las evidencias del GTIN y colección de licencia. Si difieren los hijos se usa el antepasado común; una raíz distinta o evidencia no clasificable deja la resolución manual. Las discrepancias de identidad se conservan: no se consideran resueltas por coincidir la categoría.

`product_type_review.py` contrasta códigos exactos válidos con categorías medicinales de las tiendas, sin decidir por marca o laboratorio. Las contradicciones conservan `isMedication: null` y `type_review_reason`: se muestra la ficha, pero requiere confirmar el tipo antes de completarla. No se autovincula un medicamento para resolver silenciosamente esa contradicción. Open Beauty Facts conserva su colección separada. `readiness.json` registra estos casos; no equivale a validación regulatoria ni física de cada artículo.

Las cifras vigentes se consultan en `current/postgres-result.json`, `current/readiness.json` y `current/coverage-audit.json`; no se duplican en informes históricos con cifras que quedan desactualizadas. `staging` contiene trabajo en curso y no cuenta como importado.
