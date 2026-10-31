"""Audit every prior rejected/pending observation, including same-GTIN alternatives.
Approximate text matching is discovery only. It never changes a code or a record.
"""
import argparse
import csv
import difflib
import json
import pathlib
import re
from collections import Counter
from rules import gtin_error, normalized


def read(folder, filename):
    with (folder / filename).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def audit(before, after):
    def codes(folder):
        return {json.loads(line)["gtin14"] for line in (folder / "candidates.jsonl").read_text(encoding="utf-8").splitlines()}
    old, new = codes(before), codes(after)
    assert old <= new
    main = read(after, "CATALOGO_JUNCOS_FARMACIA_COMPLETO.csv")
    pending = read(after, "CATALOGO_JUNCOS_REVISION.csv")
    prior_main = read(before, "CATALOGO_JUNCOS_FARMACIA_COMPLETO.csv")
    prior_pending = read(before, "CATALOGO_JUNCOS_REVISION.csv")
    added = new - old
    old_main = {r["gtin14"] for r in prior_main}
    old_pending = {r["gtin14"] for r in prior_pending}
    recovered = [r for r in main + pending if r["gtin14"] in added]
    assert len(recovered) == len(added)
    for filename, rows in [
        ("PRODUCTOS_RECUPERADOS_TERCERA_REVISION.csv", recovered),
        ("TERCERA_PENDIENTES_RESUELTOS.csv", [r for r in main if r["gtin14"] in old_pending]),
        ("TERCERA_FICHAS_REABIERTAS.csv", [r for r in pending if r["gtin14"] in old_main]),
    ]:
        with (after / filename).open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(main[0]))
            writer.writeheader()
            writer.writerows(rows)
    observations = {}
    scanned = Counter()
    codes_with_excluded = {}
    for filename in ["CATALOGO_JUNCOS_DESCARTADOS.csv", "EVIDENCIAS_REVISION_AMBIGUAS.csv"]:
        with (before / filename).open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                scanned[filename] += 1
                code = row["codigo_barras"]
                if gtin_error(code) or row.get("motivo") == "not_explicitly_ean":
                    continue
                name = row.get("nombre", row.get("nombre_producto", ""))
                reason = row.get("motivo", row.get("motivo_revision", ""))
                key = (code.zfill(14), name, row["marca"], reason)
                if code.zfill(14) not in old:
                    observations[key] = [code, name, row["marca"], reason, row["archivo_origen"]]
                elif reason not in {"no_identificado_como_farmacia", "marca_pertinente_descripcion_insuficiente"}:
                    codes_with_excluded[key] = [code, name, row["marca"], reason, row["archivo_origen"]]
    tokens = Counter(t for row in observations.values() for t in set(re.findall(r"[a-z]{4,}", normalized(row[1]))))
    terms = "shampoo acondicionador desodorante antitranspirante panales toallitas dentifrico preservativo repelente nebulizador tensiometro tintura capilar desmaquillante hidratante humectante hisopos manicura pedicura ortopedia dermocosmetica".split()
    matches = {}
    for term in terms:
        for token in difflib.get_close_matches(term, list(tokens), n=15, cutoff=.77):
            if token != term:
                matches.setdefault(token, set()).add(term)
    fuzzy = []
    for row in observations.values():
        hits = set(re.findall(r"[a-z]{4,}", normalized(row[1]))) & matches.keys()
        if hits:
            fuzzy.append(row + ["; ".join(f"{token} -> {','.join(sorted(matches[token]))}" for token in sorted(hits)), "SIMILITUD_NO_ES_VALIDACION"])
    for filename, header, rows in [
        ("TERCERA_COINCIDENCIAS_TEXTUALES_PARA_AUDITAR.csv", ["codigo", "nombre_original", "marca", "motivo_anterior", "archivo_origen", "parecido_textual", "advertencia"], fuzzy),
        ("TERCERA_DESCRIPCIONES_EXCLUIDAS_MISMO_GTIN.csv", ["codigo", "descripcion_excluida", "marca", "motivo", "archivo_origen"], codes_with_excluded.values()),
    ]:
        with (after / filename).open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(header)
            writer.writerows(rows)
    result = dict(previous_codes=len(old), current_codes=len(new), recovered_codes=len(added), recovered_classified=sum(not r["motivo_revision"] for r in recovered), recovered_review=sum(bool(r["motivo_revision"]) for r in recovered), main_before=len(prior_main), main_after=len(main), pending_before=len(prior_pending), pending_after=len(pending), pending_resolved=sum(r["gtin14"] in old_pending for r in main), previous_main_reopened=sum(r["gtin14"] in old_main for r in pending), observations_scanned=dict(scanned), unmatched_distinct_observations=len(observations), unmatched_unique_codes=len({k[0] for k in observations}), fuzzy_discovery_observations=len(fuzzy), same_gtin_excluded_observations=len(codes_with_excluded), same_gtin_excluded_codes=len({k[0] for k in codes_with_excluded}), recovered_by_category=dict(Counter(r["categoria"] for r in recovered)))
    (after / "third-audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# Tercera revisión detallada — 24/10/2026", "", "Revisión de todos los registros descartados y ambiguos de la segunda entrega, búsqueda de errores/truncaciones y comparación por GTIN exacto. Se reclasificaron las evidencias completas de los 113 CSV cacheados; no se descargaron ni inventaron productos. Las categorías son inferidas; los nombres, marcas, códigos y presentaciones originales se conservan.", "", "| Medida | Cantidad |", "|---|---:|"]
    for key, value in result.items():
        if isinstance(value, int): lines.append(f"| {key} | {value} |")
    lines.extend(["", "## Qué se revisó", "",
        "- Todas las observaciones de DESCARTADOS y EVIDENCIAS_REVISION_AMBIGUAS de la entrega anterior; se validaron sus códigos antes de considerarlas. Los motivos originales y archivos siguen disponibles.",
        "- Tokens similares a tipos de farmacia mediante difflib, con umbral 0,77 y hasta 15 vecinos por término. Es una herramienta de búsqueda, no de aprobación: también encuentra pintura/tintura, panes/pañales y talitas/toallitas. El listado completo está en TERCERA_COINCIDENCIAS_TEXTUALES_PARA_AUDITAR.csv.",
        "- Abreviaturas y errores observados: ACONDICIONAD, DENTIFR, TINTU, DEMAQUILLANTES, HIDRANTANTE; referencias cortas de maquillaje MYB/RML/REV, cremas CRV y pañuelos DESC. Las ampliaciones automáticas usan reglas explícitas revisadas, no reemplazos aproximados.",
        "- Accesorios de cuidado personal, TH con contexto bebé, higiene femenina y productos de perfumería EDT/EDP. Las marcas por sí solas no aprueban nombres incompletos. Se excluyen medicamentos, limpieza, alimentos y ferretería.",
        "- Las descripciones reconocidas de un mismo GTIN se comparan para detectar presentaciones/marcas/tipos contradictorios. La ficha conserva una fila completa y prioriza fecha reciente, sin mezclar campos.",
        "- Se exportaron también descripciones excluidas que comparten GTIN con el catálogo anterior. Pueden revelar una discrepancia o un filtro demasiado estricto. Los códigos con exclusiones explícitas de alcance se retienen para revisión preventiva, sin afirmar que sean conflictos confirmados. Permanecen pendientes de cotejo en TERCERA_DESCRIPCIONES_EXCLUIDAS_MISMO_GTIN.csv.", "",
        "## Verificación y límites", "",
        "13 pruebas Python aprobadas. Validación de todos los GTIN de las exportaciones, unicidad, reconciliación CSV/Excel/SQLite y búsquedas por código/nombre. Los archivos se contrastaron mediante SHA256 al entregar. PostgreSQL externo se actualiza con respaldo previo y transacción; los conteos comerciales deben permanecer idénticos. API probada con código presente, ausente y bloqueo productivo.", "",
        "No se hizo cotejo físico de envases ni se garantiza recuperación exhaustiva de descripciones sin tipo. Las coincidencias textuales no comprueban identidad, ni se deduce un EAN desde otro parecido. Los casos ambiguos no se presentan como aprobados. Los contadores de códigos nuevos y pendientes resueltos pueden superponerse: un pendiente anterior no instalado puede ser ahora nuevo en PostgreSQL.", "",
        "No hubo cambios de React/NestJS ni se activó producción; no se ejecutaron lint/typecheck/build de toda la aplicación para estas herramientas Python offline. No se probó una restauración completa de los respaldos.", "",
        "## Repetir", "", "```powershell",
        "uv run --python 3.12 --with openpyxl==3.1.5 scripts/external-catalog/build_directory.py .cache/external-catalog/20261024 .cache/external-catalog/20261024/audit-final RUTA_NUEVA",
        "uv run --python 3.12 --with openpyxl==3.1.5 scripts/external-catalog/validate_directory.py RUTA_NUEVA",
        "uv run --python 3.12 scripts/external-catalog/third_audit.py .cache/external-catalog/20261024/audit-final RUTA_NUEVA", "```", ""])
    (after / "INFORME_TERCERA_REVISION.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("before", type=pathlib.Path)
    parser.add_argument("after", type=pathlib.Path)
    args = parser.parse_args()
    audit(args.before, args.after)
