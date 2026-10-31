"""Combine fully scanned local datasets with the prior catalogue, preserving provenance.
SQLite is a portable review artifact only; application storage remains PostgreSQL.
"""
import argparse
import csv
import hashlib
import json
import pathlib
import re
import sqlite3
from contextlib import closing
from collections import Counter, defaultdict
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from directory_rules import classify_product, quantity_signature
from rules import gtin_error, normalized
from catalog_normalization import canonical_brand, representative

OUTPUT_COLUMNS = ["codigo_barras", "nombre_producto", "marca", "categoria", "subcategoria", "variante", "presentacion", "cantidad", "unidad_medida", "fuente", "archivo_origen", "nivel_confianza", "gtin14", "fecha_fuente", "motivo_revision"]

def fingerprint(row):
    return hashlib.sha256(json.dumps([row["gtin14"], row["name"], row["brand"], row["category"], row["presentation"]], ensure_ascii=False).encode()).hexdigest()

def spreadsheet_row(values):
    return ["'" + v if isinstance(v, str) and v.startswith(("=", "+", "-", "@", "\t", "\r")) else v for v in values]

def coherent_brand(value):
    value = re.sub(r"[^a-z0-9]", "", normalized(canonical_brand(value)))
    if value in {"sm", "smarca", "sinmarca", "varios", "otras", "generico", "1", "", "proctergamble", "unilever"}: return ""
    return value

def conflicts(rows):
    reasons = []
    quantities = {quantity_signature(r["name"], r.get("quantity", ""), r.get("unit", "")) for r in rows} - {""}
    brands = {coherent_brand(r["brand"]) for r in rows} - {""}
    if len(quantities) > 1: reasons.append("presentaciones_contradictorias")
    if any(a not in b and b not in a for a in brands for b in brands): reasons.append("marcas_contradictorias")
    # Different functional types under one code are not silently merged.
    subs = {r.get("subcategory", "") for r in rows} - {"", "Sin subcategoría documentada"}
    if "Champús" in subs and "Acondicionadores" in subs: reasons.append("tipo_capilar_contradictorio")
    return "; ".join(reasons)

def output_row(row, reason=""):
    return [row["code"], row["name"], row["brand"], row["scope_group"], row.get("subcategory", ""), "", row["presentation"], row.get("quantity", ""), row.get("unit", ""), row["source"], " | ".join(sorted(row.get("origins", {row["source_ref"]}))), "REVISION_NO_COTEJADO" if reason else "CLASIFICADO_POR_REGLAS_NO_COTEJADO", row["gtin14"], row.get("source_date", ""), reason]

def build(scan_dir, baseline, out):
    if out.exists(): raise ValueError("Use a new output directory")
    inventory = json.loads((scan_dir / "inventory.json").read_text(encoding="utf-8"))
    if not inventory["complete"]: raise ValueError("Directory scan is not complete")
    out.mkdir(parents=True)
    entries, pending = {}, {}
    old = [json.loads(line) for line in (baseline / "candidates.jsonl").read_text(encoding="utf-8").splitlines()]
    old_codes = {r["gtin14"] for r in old}
    # Keep the previous catalogue. Do not attribute its rows to today's input files.
    for r in old:
        r = dict(r, origins=set(r.get("origins", [r["source_ref"]])), source_date=r.get("source_date", "2026-10-23" if r["source"] == "sepa" else ""), previous_catalog=True)
        r.pop("scope_review_reason", None)
        r.pop("review_reason", None)
        status, group, sub, scope_reason = classify_product(r["name"], r["brand"], r["category"])
        if group and status == "candidate": r.update(scope_group=group, subcategory=sub)
        if status != "candidate": r["scope_review_reason"] = "catalogo_previo_revisar_alcance:" + scope_reason
        entries[(r["source"], r["fingerprint"])] = r
    stats = Counter()
    rejected_codes = defaultdict(set)
    excluded_scope = defaultdict(set)
    seen_current = set()
    main_writer_file = (out / "CATALOGO_JUNCOS_DESCARTADOS.csv").open("w", encoding="utf-8-sig", newline="")
    rejected_writer = csv.writer(main_writer_file)
    rejected_writer.writerow(["codigo_barras", "nombre", "marca", "presentacion", "motivo", "ocurrencias", "archivo_origen"])
    valid_codes = set()
    for file in inventory["files"]:
        if file["status"] != "processed": continue
        stats["files_processed"] += 1
        stats["rows_read"] += file["counts"].get("rows", 0)
        stats["ean_flag_rows"] += file["counts"].get("ean_flag_rows", 0)
        stats["malformed_rows"] += file["counts"].get("malformed_rows", 0)
        path = scan_dir / "cache" / (file["sha256"] + ".jsonl")
        for line in path.read_text(encoding="utf-8").splitlines():
            code, name, brand, quantity, unit, flag, count = json.loads(line)
            error = gtin_error(code)
            if error:
                stats["invalid_gtin_rows"] += count
            else:
                stats["valid_gtin_rows"] += count
                valid_codes.add(code.zfill(14))
            error = error or ("not_explicitly_ean" if flag.lower() not in {"1", "true", "si", "sí"} else "") or ("missing_name" if not name else "")
            status, category, subcategory, reason = classify_product(name, brand)
            if not error and status == "discard" and reason in {"uso_no_personal", "fuera_de_alcance", "jabon_uso_personal_no_confirmado", "medicamento_o_ambiguo"}:
                excluded_scope[code.zfill(14)].add(reason)
            if not error and status == "discard": error = reason
            presentation = " ".join(filter(None, [quantity, unit]))
            if error:
                stats["discarded_rows"] += count
                stats["discard:" + error] += count
                if code: rejected_codes[error].add(code)
                rejected_writer.writerow(spreadsheet_row([code, name, brand, presentation, error, count, file["file"]]))
                continue
            row = dict(code=code, gtin14=code.zfill(14), name=name, brand=brand, category="", presentation=presentation, quantity=quantity, unit=unit, source="sepa", source_ref=file["file"], license="CC-BY-4.0", verification="CHECKSUM_VALID_NOT_PHYSICALLY_VERIFIED", scope_group=category, subcategory=subcategory, argentina_evidence="SEPA Argentina publication", source_date=file["date"], origins={file["file"]}, occurrences=count)
            row["fingerprint"] = fingerprint(row)
            key = ("sepa", row["fingerprint"])
            if status == "review":
                stats["ambiguous_rows"] += count
                row["review_reason"] = reason
                if key in pending:
                    pending[key]["occurrences"] += count
                    pending[key]["origins"].add(file["file"])
                    pending[key]["source_date"] = max(pending[key]["source_date"], file["date"])
                else: pending[key] = row
                continue
            stats["eligible_rows"] += count
            if key in seen_current:
                stats["identical_duplicate_rows"] += count
                entries[key]["occurrences"] += count
                entries[key]["origins"].add(file["file"])
                entries[key]["source_date"] = max(entries[key]["source_date"], file["date"])
            else:
                stats["identical_duplicate_rows"] += count - 1
                # Replace Friday's previous observation count, not double count it.
                if key in entries:
                    row["origins"].update(entries[key]["origins"])
                    row["previous_catalog"] = True
                entries[key] = row
                seen_current.add(key)
    main_writer_file.close()
    with (out / "ERRORES_LECTURA.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["archivo", "linea_csv", "campos", "motivo"])
        for item in inventory["files"]:
            for error in item.get("malformed_examples", []):
                writer.writerow([item["file"], error["line"], error["fields"], "fila_no_tabular_o_numero_de_columnas_incorrecto"])
    with (out / "EVIDENCIAS_REVISION_AMBIGUAS.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(OUTPUT_COLUMNS + ["ocurrencias"])
        for r in pending.values():
            writer.writerow(spreadsheet_row(output_row(r, r["review_reason"]) + [r["occurrences"]]))
    groups, beauty = defaultdict(list), []
    for r in entries.values():
        if r["source"] == "openbeauty": beauty.append(r)
        else: groups[r["gtin14"]].append(r)
    ambiguous = defaultdict(list)
    for r in pending.values():
        if r["gtin14"] not in groups: ambiguous[r["gtin14"]].append(r)
    approved, review, representatives = [], [], []
    conflict_rows = []
    actual_conflicts = 0
    scope_reviews = 0
    for code, rows in sorted(groups.items()):
        current = sorted(rows, key=lambda r: (r.get("source_date", ""), bool(r["brand"]), len(r["name"])), reverse=True)
        chosen = representative(current)
        conflict = conflicts(rows)
        scope = sorted({r.get("scope_review_reason", "") for r in rows} - {""})
        scope.extend(sorted({r.get("source_review_reason", "") for r in rows} - {""}))
        scope.extend("otra_descripcion_mismo_gtin_revisar:" + reason for reason in sorted(excluded_scope[code]))
        actual_conflicts += bool(conflict)
        scope_reviews += bool(scope)
        reason = "; ".join(filter(None, [conflict, *scope]))
        if reason: conflict_rows.append([code, reason, len(rows)])
        row = output_row(chosen, reason)
        (review if reason else approved).append(row)
        representatives.append((chosen, reason, "revision" if reason else "clasificado"))
        for r in rows: r["review_reason"] = reason
    for code, rows in sorted(ambiguous.items()):
        chosen = max(rows, key=lambda r: (r["source_date"], len(r["name"])))
        review.append(output_row(chosen, chosen["review_reason"]))
        representatives.append((chosen, chosen["review_reason"], "ambiguo_no_importado"))
    for filename, data in [("CATALOGO_JUNCOS_FARMACIA_COMPLETO.csv", approved), ("CATALOGO_JUNCOS_REVISION.csv", review)]:
        with (out / filename).open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(OUTPUT_COLUMNS)
            writer.writerows(spreadsheet_row(row) for row in data)
    with (out / "EVIDENCIAS_SEPA_Y_APORTES.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(OUTPUT_COLUMNS + ["ocurrencias"])
        for rows in groups.values():
            for r in rows: writer.writerow(spreadsheet_row(output_row(r, r.get("review_reason", "")) + [r["occurrences"]]))
    # ODbL remains a separate export, not a source of merged private fields.
    with (out / "OPEN_BEAUTY_FACTS_ODbL.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(OUTPUT_COLUMNS + ["licencia", "atribucion"])
        for r in beauty: writer.writerow(spreadsheet_row(output_row(r) + ["ODbL-1.0", "Open Beauty Facts contributors; https://opendatacommons.org/licenses/odbl/1-0/"]))
    codes = {r["gtin14"] for r in entries.values()}
    summary = dict(stats)
    summary.update(detected_csv=inventory["detected_csv"], support_csv=sum(f["status"] == "support_csv" for f in inventory["files"]), failed_files=[f for f in inventory["files"] if f["status"] == "failed"], valid_unique_input_codes=len(valid_codes), previous_codes=len(old_codes), combined_codes=len(codes), new_codes=len(codes - old_codes), old_codes_preserved=old_codes.issubset(codes), main_unique_codes=len(groups), main_classified=len(approved), main_conflict_codes=len(conflict_rows), ambiguous_codes=len(ambiguous), review_rows=len(review), openbeauty_codes=len({r["gtin14"] for r in beauty}), physically_verified=0, production_enabled=False)
    summary["rejected_codes_by_reason"] = {reason: len(values) for reason, values in rejected_codes.items()}
    summary["main_review_codes"] = len(conflict_rows)
    summary["main_conflict_codes"] = actual_conflicts
    summary["previous_scope_review_codes"] = scope_reviews
    summary["rejected_unique_codes"] = len(set().union(*rejected_codes.values()))
    summary["input_unique_eligible_variants"] = len(seen_current)
    assert stats["rows_read"] == stats["valid_gtin_rows"] + stats["invalid_gtin_rows"] + stats["malformed_rows"]
    assert stats["rows_read"] == stats["eligible_rows"] + stats["ambiguous_rows"] + stats["discarded_rows"] + stats["malformed_rows"]
    source_counts = {}
    for source in sorted({r["source"] for r in entries.values()}):
        own = [r for r in entries.values() if r["source"] == source]
        source_counts[source] = {"unique_codes": len({r["gtin14"] for r in own}), "stored_variants": len(own)}
    summary["by_category"] = dict(Counter(row[3] for row in approved))
    summary["by_subcategory"] = dict(Counter(row[4] for row in approved))
    summary["by_brand"] = dict(Counter(row[2] or "Sin informar" for row in approved))
    book = Workbook(write_only=True)
    def sheet(name, header, rows):
        tab = book.create_sheet(name)
        tab.freeze_panes = "A2"
        for values in [header]: tab.append(values)
        for values in rows:
            cells = []
            for value in values:
                cell = WriteOnlyCell(tab, value=value)
                if isinstance(value, str): cell.data_type = "s"
                cells.append(cell)
            tab.append(cells)
    sheet("Resumen", ["Metrica", "Cantidad"], [(k, v) for k, v in summary.items() if isinstance(v, (int, bool))])
    sheet("Productos clasificados", OUTPUT_COLUMNS, approved)
    sheet("Revision", OUTPUT_COLUMNS, review)
    for key, name in [("by_category", "Por categoria"), ("by_subcategory", "Por subcategoria"), ("by_brand", "Por marca")]: sheet(name, [name, "Codigos clasificados"], sorted(summary[key].items()))
    sheet("Conflictos", ["GTIN14", "Motivo", "Evidencias"], conflict_rows)
    sheet("Por fuente", ["Fuente", "Codigos unicos", "Evidencias", "Nota"], [[source, counts["unique_codes"], counts["stored_variants"], "Datos separados ODbL" if source == "openbeauty" else ""] for source, counts in source_counts.items()])
    sheet("Archivos", ["Archivo", "Fecha", "Estado", "Filas", "SHA256", "Codificacion", "Separador"], [[f["file"], f["date"], f["status"], f.get("counts", {}).get("rows", 0), f.get("sha256", ""), f.get("encoding", ""), f.get("delimiter", "")] for f in inventory["files"]])
    sheet("Duplicados", ["GTIN14", "Nombre", "Ocurrencias", "Archivos"], [[r["gtin14"], r["name"], r["occurrences"], len(r["origins"])] for rows in groups.values() for r in rows if r["occurrences"] > 1])
    sheet("Limitaciones", ["Nota"], [["Categoria y subcategoria son inferidas por reglas; no son datos certificados del fabricante."], ["Variante permanece vacia cuando no existe una columna explicita. Tono/talle se conservan en el nombre original."], ["Clasificado no significa cotejado fisicamente. No se activa produccion."], ["Open Beauty Facts se entrega separado bajo ODbL; no se mezclan sus campos."]])
    book.save(out / "CATALOGO_JUNCOS_RESUMEN.xlsx")
    with closing(sqlite3.connect(out / "CATALOGO_JUNCOS_FARMACIA.sqlite")) as db, db:
        db.executescript("CREATE TABLE productos(gtin14 TEXT PRIMARY KEY,codigo_barras TEXT,nombre TEXT,marca TEXT,categoria TEXT,subcategoria TEXT,presentacion TEXT,estado TEXT,motivo TEXT,fecha_fuente TEXT,fuentes TEXT); CREATE INDEX producto_ean ON productos(codigo_barras); CREATE INDEX producto_nombre ON productos(nombre COLLATE NOCASE); CREATE INDEX producto_marca ON productos(marca); CREATE INDEX producto_categoria ON productos(categoria); CREATE TABLE evidencias(source TEXT,fingerprint TEXT,payload TEXT,PRIMARY KEY(source,fingerprint)); CREATE TABLE metadatos(clave TEXT PRIMARY KEY,valor TEXT);")
        for row, reason, state in representatives:
            db.execute("INSERT INTO productos VALUES(?,?,?,?,?,?,?,?,?,?,?)", (row["gtin14"], row["code"], row["name"], row["brand"], row["scope_group"], row.get("subcategory", ""), row["presentation"], state, reason, row.get("source_date", ""), json.dumps(sorted(row["origins"]), ensure_ascii=False)))
        for rows in groups.values():
            for r in rows:
                r["origins"] = sorted(r["origins"])
                db.execute("INSERT INTO evidencias VALUES(?,?,?)", (r["source"], r["fingerprint"], json.dumps(r, ensure_ascii=False)))
        db.execute("INSERT INTO metadatos VALUES('licencias',?)", ("SEPA CC-BY-4.0; Excel/V6 user supplied, review rights. No ODbL data in this database.",))
    with (out / "candidates.jsonl").open("w", encoding="utf-8") as f:
        for r in entries.values():
            r["origins"] = sorted(r["origins"])
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    report = {"status": "PREPARED_NOT_YET_IMPORTED_TO_POSTGRES", "sources": {}, "directory_summary": summary, "failures": summary["failed_files"]}
    report["sources"] = source_counts
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=True, indent=2), flush=True)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("scan", type=pathlib.Path)
    p.add_argument("baseline", type=pathlib.Path)
    p.add_argument("out", type=pathlib.Path)
    a = p.parse_args()
    build(a.scan, a.baseline, a.out)
