"""Reclassify every rejected/pending observation; export proposals for inspection."""
import argparse
import csv
import json
import pathlib
from collections import Counter
from directory_rules import classify_product
from rules import gtin_error


def audit(folder, output):
    known = {json.loads(line)["gtin14"] for line in (folder / "candidates.jsonl").read_text(encoding="utf-8").splitlines()}
    found = {}
    scanned = Counter()
    for filename in ["CATALOGO_JUNCOS_DESCARTADOS.csv", "EVIDENCIAS_REVISION_AMBIGUAS.csv"]:
        with (folder / filename).open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                scanned[filename] += 1
                code = row["codigo_barras"]
                name = row.get("nombre", row.get("nombre_producto", ""))
                if code.zfill(14) in known or gtin_error(code) or row.get("motivo") == "not_explicitly_ean":
                    continue
                status, category, subcategory, _ = classify_product(name, row["marca"])
                if status == "candidate":
                    found[(code.zfill(14), name, row["marca"])] = [code, name, row["marca"], category, subcategory, row.get("motivo", row.get("motivo_revision", "")), row["archivo_origen"]]
    with output.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["codigo", "nombre", "marca", "categoria", "subcategoria", "motivo_anterior", "archivo_origen"])
        writer.writerows(found.values())
    print(json.dumps({"observations_checked": dict(scanned), "proposed_unique_codes": len({key[0] for key in found}), "proposed_evidence": len(found)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    audit(args.folder, args.output)
