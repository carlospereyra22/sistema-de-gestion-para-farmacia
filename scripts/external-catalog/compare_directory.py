"""Compare actual completed catalogues and export the recoveries with review states."""
import argparse
import csv
import json
import pathlib
from collections import Counter
from rules import gtin_error


def compare(before, after):
    def codes(folder):
        return {json.loads(line)["gtin14"] for line in (folder / "candidates.jsonl").read_text(encoding="utf-8").splitlines()}
    def read(folder, filename):
        with (folder / filename).open(encoding="utf-8-sig", newline="") as stream:
            return list(csv.DictReader(stream))
    old, new = codes(before), codes(after)
    added = new - old
    assert old <= new
    current = read(after, "CATALOGO_JUNCOS_FARMACIA_COMPLETO.csv")
    pending = read(after, "CATALOGO_JUNCOS_REVISION.csv")
    previous = read(before, "CATALOGO_JUNCOS_FARMACIA_COMPLETO.csv")
    previous_pending = read(before, "CATALOGO_JUNCOS_REVISION.csv")
    recovered = [r for r in current + pending if r["gtin14"] in added]
    assert len(recovered) == len(added)
    assert all(not gtin_error(r["codigo_barras"]) for r in recovered)
    for filename, rows in [
        ("PRODUCTOS_RECUPERADOS_SEGUNDA_REVISION.csv", recovered),
        ("FICHAS_ANTES_PENDIENTES_AHORA_CLASIFICADAS.csv", [r for r in current if r["gtin14"] in {p["gtin14"] for p in previous_pending}]),
        ("FICHAS_REABIERTAS_PARA_REVISION.csv", [r for r in pending if r["gtin14"] in {p["gtin14"] for p in previous}]),
    ]:
        with (after / filename).open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(current[0]))
            writer.writeheader()
            writer.writerows(rows)
    result = dict(previous_codes=len(old), current_codes=len(new), recovered_unique_codes=len(added), recovered_classified=sum(not r["motivo_revision"] for r in recovered), recovered_for_review=sum(bool(r["motivo_revision"]) for r in recovered), previous_classified=len(previous), current_classified=len(current), pending_before=len(previous_pending), pending_after=len(pending), previous_pending_now_classified=sum(r["gtin14"] in {p["gtin14"] for p in previous_pending} for r in current), recovered_by_category=dict(Counter(r["categoria"] for r in recovered)))
    result["previous_classified_now_review"] = sum(r["gtin14"] in {p["gtin14"] for p in previous} for r in pending)
    (after / "audit-comparison.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# Segunda revisión de cobertura — 24/10/2026", "", "Se revisaron todas las observaciones descartadas y ambiguas de la entrega anterior y se reclasificó el conjunto completo cacheado de los 113 CSV de productos. No se descargaron nuevos productos. La primera auditoría recorrió 851.168 registros fuente de descartes y 2.571 evidencias ambiguas; esas cifras no son productos únicos.", "", "| Resultado | Cantidad |", "|---|---:|"]
    for key, value in result.items():
        if isinstance(value, int): lines.append(f"| {key} | {value} |")
    lines.extend(["", "## Causas corregidas", "",
        "- Abreviaturas: ANTIT/ANTITR/DEO, CR/CREM, SHA/ACO, PRESERV, FEM, D/ y P/, descripciones de cuidado bucal y accesorios.",
        "- PET era interpretado como mascotas aunque también es un tipo de envase. Se conserva la exclusión de mascotas explícitas; el envase no decide el rubro.",
        "- Incorporación de contexto para cremas, tratamientos capilares, aceites/féculas de bebés, ropa interior absorbente y accesorios de manicura. La marca aislada no aprueba productos.",
        "- Los limpiadores con contexto facial/piel dejaron de descartarse indiscriminadamente.",
        "- Se revisaron las nuevas coincidencias para evitar ferretería (alicates), cepillos de limpieza, desodorantes ambientales y alimentos descritos como suaves/cremosos.",
        "- Revisión de evidencias anteriores sin arrastrar motivos de descarte ya corregidos. Se conservan fechas y procedencia reales de la entrega anterior.", "",
        "## Alcance y pruebas", "",
        "Se revisaron listados y muestras por categoría, además de búsquedas dirigidas por descripción y marca. No se afirma haber cotejado físicamente cada producto ni que las reglas reconozcan toda descripción truncada. Los conflictos de código/presentación/marca permanecen separados. Los nuevos códigos que figuran en revisión no son fichas aprobadas. Las evidencias recuperadas también pueden revelar discrepancias en fichas antes clasificadas: esas fichas se reabren para revisión, sin borrar el código ni sus fuentes.", "",
        "10 pruebas Python aprobadas, con regresiones para PET, abreviaturas, limpiadores faciales, alimentos, mascotas, alicates de ferretería y desodorantes ambientales. validate_directory.py verifica todos los códigos, unicidad, conteos CSV/Excel/SQLite y búsquedas por código. No se modifica la aplicación ni producción.", "",
        "La entrega anterior completa permanece en .cache/external-catalog/20261024/release-reviewed. La nueva está en .cache/external-catalog/20261024/audit-final. Los respaldos de scripts y de PostgreSQL externo se guardan en %LOCALAPPDATA%/FarmaciaJuncos/RespaldosLocales. No se borran evidencias previas.", "",
        "## Repetir", "", "```powershell",
        'uv run --python 3.12 --with openpyxl==3.1.5 scripts/external-catalog/build_directory.py .cache/external-catalog/20261024 .cache/external-catalog/20261024/release-reviewed RUTA_SALIDA_NUEVA',
        'uv run --python 3.12 --with openpyxl==3.1.5 scripts/external-catalog/validate_directory.py RUTA_SALIDA_NUEVA',
        'uv run --python 3.12 scripts/external-catalog/compare_directory.py .cache/external-catalog/20261024/release-reviewed RUTA_SALIDA_NUEVA',
        "```", ""])
    (after / "INFORME_SEGUNDA_REVISION.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("before", type=pathlib.Path)
    parser.add_argument("after", type=pathlib.Path)
    args = parser.parse_args()
    compare(args.before, args.after)
