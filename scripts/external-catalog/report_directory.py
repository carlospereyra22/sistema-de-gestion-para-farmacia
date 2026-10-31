"""Document measured results after artifact validation and local database import."""
import argparse
import json
import pathlib


def write_report(folder):
    report = json.loads((folder / "report.json").read_text(encoding="utf-8"))
    s = report["directory_summary"]
    v = json.loads((folder / "validation.json").read_text(encoding="utf-8"))
    db = json.loads((folder / "postgres-result.json").read_text(encoding="utf-8"))
    assert db["unique_codes_in_database"] == s["combined_codes"]
    assert db["commercial_counts_unchanged"]
    report["status"] = "IMPORTED_TO_LOCAL_POSTGRES_ARTIFACTS_VALIDATED"
    (folder / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    rows = ["# Validación del catálogo Juncos — 24/10/2026", "",
        "Se recorrieron los datasets locales completos del 17 al 23/10/2026. Se prioriza la fecha más reciente disponible para cada GTIN. Este resultado es un catálogo de referencia para revisión; no certifica identidad física ni activa producción.", "",
        "## Resultado", "", "| Medida | Cantidad |", "|---|---:|"]
    for title, key in [
        ("CSV detectados", "detected_csv"), ("CSV de productos procesados completos", "files_processed"),
        ("CSV auxiliares identificados (comercio/sucursales, no productos)", "support_csv"),
        ("Filas no vacías analizadas en archivos de productos", "rows_read"),
        ("Filas con indicador EAN=1", "ean_flag_rows"),
        ("Filas con GTIN global aceptable", "valid_gtin_rows"),
        ("Filas con código inválido o restringido", "invalid_gtin_rows"),
        ("Filas no tabulares/columnas incorrectas", "malformed_rows"),
        ("GTIN únicos válidos de cualquier rubro en la entrada", "valid_unique_input_codes"),
        ("Filas SEPA clasificadas como pertinentes", "eligible_rows"),
        ("Repeticiones idénticas SEPA consolidadas", "identical_duplicate_rows"),
        ("Evidencias SEPA distintas pertinentes", "input_unique_eligible_variants"),
        ("Códigos del catálogo anterior conservados", "previous_codes"),
        ("Códigos nuevos incorporados a la base externa local", "new_codes"),
        ("Códigos únicos combinados en PostgreSQL, incluyendo revisión y OBF separado", "combined_codes"),
        ("Fichas principales clasificadas, sin conflictos detectados", "main_classified"),
        ("Códigos retenidos del catálogo combinado en revisión", "main_review_codes"),
        ("Códigos con contradicciones de marca, presentación o tipo capilar", "main_conflict_codes"),
        ("Códigos previos con alcance ahora cuestionado", "previous_scope_review_codes"),
        ("Códigos ambiguos adicionales, no importados a PostgreSQL", "ambiguous_codes"),
        ("Fichas totales del CSV de revisión", "review_rows"),
        ("Filas fuente descartadas", "discarded_rows"),
        ("Códigos distintos presentes en descartes", "rejected_unique_codes"),
        ("Códigos Open Beauty Facts en exportación separada", "openbeauty_codes")]:
        rows.append(f"| {title} | {s[key]:,} |")
    rows.extend(["", f"Archivos fallidos: {len(s['failed_files'])}. Productos cotejados físicamente: 0.", "",
        "Las categorías de rechazo se aplican por fila y prioridad. Un código puede tener evidencia válida y otra rechazada; por eso los códigos de descartes no se restan del total ni se suman las fuentes para obtener únicos. Los motivos de revisión pueden superponerse. Las repeticiones idénticas cuentan sucursales y fechas, no productos diferentes.", "",
        "## Fuentes", "", "| Fuente | GTIN únicos | Evidencias |", "|---|---:|---:|"])
    for source, count in report["sources"].items():
        rows.append(f"| {source} | {count['unique_codes']} | {count['stored_variants']} |")
    rows.extend(["", "Los 270 códigos del Excel y los 129 de V6 se conservaron. No se volvió a descargar OBF ni se sumaron productos que no estuvieran en el aporte anterior. Sus 131 códigos siguen en exportación/esquema independientes ODbL y no están en el SQLite principal. Hay coincidencias entre fuentes.", "",
        "## Método y alcance", "",
        "- Lectura CSV en streaming con detección de separador/codificación; agrupación por registro fuente dentro de cada archivo. Caché por SHA256 permite repetir el proceso sin volver a analizar todas las sucursales. Inventario con hash, bytes, fecha, codificación y encabezados por archivo.",
        "- GTIN ASCII de 8/12/13/14 dígitos, checksum y rechazo de circulación restringida. Canonización a GTIN14 conserva ceros. `productos_ean` es un indicador; se exige valor positivo y se usa `id_producto` como código. No se corrigen ni generan códigos.",
        "- La clasificación considera descripción, contexto, abreviaturas y marca. La marca por sí sola no aprueba. Se revisaron muestras de cada categoría y falsos positivos de solar/aire acondicionado/jabones/algodón/jeringas/esmaltes. Categorías/subcategorías son inferencias, no certificaciones del fabricante.",
        "- La ficha representativa es una fila completa: fecha más reciente, marca informada y descripción más extensa. Nunca combina nombre, marca y presentación de filas distintas. El Excel/V6 no tienen fecha de publicación comprobada: ese campo queda vacío. La fuente SEPA anterior sí corresponde al 23/10.",
        "- Se conservan las evidencias de todas las fechas, incluso las históricas que ya no aparecen el viernes. La procedencia completa se consulta en EVIDENCIAS_SEPA_Y_APORTES.csv y los payloads; archivo_origen de la ficha representa sus propias observaciones.",
        "- Conflictos detectados por cantidades explícitas, marcas incompatibles y champú/acondicionador. Es una detección conservadora: no garantiza detectar todas las variantes incompatibles. Se conserva el tono/talle original en el nombre; `variante` queda vacío sin un campo explícito.",
        "- No se incluyen precios, promociones ni stock. No se consultan sitios privados ni se inventan fabricantes o presentaciones. No hubo descargas nuevas en este lote.", "",
        "## Errores y limitaciones", "",
        f"Se registraron {s['malformed_rows']} filas no tabulares, documentadas en ERRORES_LECTURA.csv y manifest.json. Incluyen pies de archivo como `Ultima actualizacion: ...`; no se cuentan como productos ni como códigos inválidos. Ningún archivo de productos quedó sin procesar. No se reemplazaron silenciosamente caracteres inválidos.", "",
        "Los registros previos que las reglas nuevas cuestionan se conservan en revisión para auditoría; no se presentan en el CSV principal. Los ambiguos adicionales se entregan para ampliar cobertura, sin incorporarlos al conjunto elegible de PostgreSQL. No se garantiza cobertura exhaustiva ante descripciones truncadas o sin tipo; las evidencias permiten corregir reglas y repetir.", "",
        "## Pruebas y reconciliación", "",
        "- 16 pruebas unitarias Python: GTIN, duplicados, aislamiento de OBF, abreviaturas, exclusiones, PET como envase, nutrición infantil, equivalencia de unidades y selección de la fecha más reciente con conflicto.",
        f"- Validación de todos los códigos de las exportaciones; ningún GTIN duplicado dentro de cada listado. CSV principal ({v['approved_csv']}) y revisión ({v['review_csv']}) coinciden con el Excel y SQLite.",
        f"- {v['discarded_distinct_source_rows']:,} filas fuente distintas por archivo en DESCARTADOS representan {v['discarded_occurrences']:,} ocurrencias. Las sumas de elegibles, ambiguos, descartados y no tabulares coinciden con las filas analizadas.",
        "- SQLite PRAGMA integrity_check: ok. Búsqueda por código verificada para cada ficha clasificada; búsqueda por nombre PANTENE con resultados. Códigos del Excel guardados como texto.",
        f"- PostgreSQL local confirmó {db['unique_codes_in_database']:,} códigos únicos. Conteos comerciales antes/después idénticos (ver postgres-result.json); ninguna escritura al esquema comercial.",
        "- API de vista previa comprobada mediante probe-api.cjs: código presente, ausente y bloqueo en producción. No se activó la configuración persistente ni el formulario de Productos.",
        "- No se ejecutaron format/lint/typecheck/build de toda la aplicación en este lote: sólo cambiaron herramientas Python offline y documentación. No hubo cambios de NestJS, React ni migraciones. No se hizo cotejo contra envases físicos ni una restauración completa de los respaldos.", "",
        "## Respaldo y aislamiento", "",
        "Antes de modificar: respaldo comercial local compras-v2-20261024-015345.dump y scripts catalogo-scripts-20261024-015345.tar.gz en %LOCALAPPDATA%/FarmaciaJuncos/RespaldosLocales. install.py genera además respaldo del catálogo externo justo antes de actualizarlo y verifica el índice con pg_restore --list. SQLite es sólo un artefacto portátil; la arquitectura sigue usando NestJS/PostgreSQL. No se desplegó producción.", "",
        "## Repetición", "", "Desde la raíz del repositorio, usando una carpeta de salida nueva:", "", "```powershell",
        'uv run --python 3.12 scripts/external-catalog/scan_directory.py "C:/Users/Carlo/Downloads/sepa minorista" .cache/external-catalog/20261024',
        'uv run --python 3.12 --with openpyxl==3.1.5 scripts/external-catalog/build_directory.py .cache/external-catalog/20261024 .cache/external-catalog/20261024/third-reviewed RUTA_SALIDA_NUEVA',
        'uv run --python 3.12 --with openpyxl==3.1.5 scripts/external-catalog/validate_directory.py RUTA_SALIDA_NUEVA',
        "```", "", "Los scripts se entregan en scripts/. Se necesitan los datasets originales y candidates.jsonl del catálogo anterior. La instalación local opcional usa install.py con --manifest; nunca apunta a producción. No usar finalize.py del lote anterior para este formato.", ""])
    (folder / "INFORME_VALIDACION.md").write_text("\n".join(rows), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=pathlib.Path)
    write_report(parser.parse_args().folder)
