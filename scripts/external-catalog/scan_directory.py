"""Read every supplied CSV; cache distinct source records without prices or stock.
Caches are content-addressed; identical files are accounted for but parsed only once.
"""
import argparse
import codecs
import csv
import hashlib
import json
import pathlib
import re
from collections import Counter

FIELDS = ["id_producto", "productos_descripcion", "productos_marca", "productos_cantidad_presentacion", "productos_unidad_medida_presentacion", "productos_ean"]

def inspect(path):
    digest = hashlib.sha256()
    with path.open("rb") as raw:
        sample = raw.read(65536)
        digest.update(sample)
        while chunk := raw.read(4 * 1024 * 1024): digest.update(chunk)
    try:
        codecs.getincrementaldecoder("utf-8-sig")().decode(sample, final=False)
        encoding = "utf-8-sig"
    except UnicodeDecodeError:
        encoding = "cp1252"
    header = sample.decode(encoding, errors="replace").splitlines()[0] if sample else ""
    delimiter = max(["|", ";", ",", "\t"], key=header.count)
    return digest.hexdigest(), encoding, delimiter

def read_file(path, encoding, delimiter):
    records = Counter()
    stats = Counter()
    malformed = []
    with path.open(encoding=encoding, newline="") as raw:
        reader = csv.reader(raw, delimiter=delimiter)
        header = [c.strip().lower() for c in next(reader, [])]
        if not set(FIELDS).issubset(header):
            if path.name.lower() == "productos.csv":
                raise ValueError("Missing required product columns: " + ", ".join(sorted(set(FIELDS) - set(header))))
            return None, {"status": "support_csv", "headers": header}
        indexes = [header.index(k) for k in FIELDS]
        size = len(header)
        for number, row in enumerate(reader, 2):
            if not row or not any(row):
                stats["blank_lines"] += 1
                continue
            if len(row) == 1 and re.match(r"^\d{4}-\d{2}-\d{2}[ T]", row[0]):
                stats["timestamp_trailers"] += 1
                continue
            stats["rows"] += 1
            if len(row) != size:
                stats["malformed_rows"] += 1
                if len(malformed) < 100: malformed.append({"line": number, "fields": len(row)})
                continue
            key = tuple(row[index].strip() for index in indexes)
            records[key] += 1
            if key[-1] == "1": stats["ean_flag_rows"] += 1
        stats["distinct_source_records"] = len(records)
    return records, {"status": "processed", "encoding": encoding, "delimiter": delimiter, "headers": header, "counts": dict(stats), "malformed_examples": malformed}

def scan(root, out):
    out.mkdir(parents=True, exist_ok=True)
    cache = out / "cache"
    cache.mkdir(exist_ok=True)
    inventory = []
    paths = sorted(root.rglob("*.csv"))
    for index, path in enumerate(paths, 1):
        relative = path.relative_to(root).as_posix()
        date_match = re.search(r"(20\d\d-\d\d-\d\d)", relative)
        item = {"file": relative, "bytes": path.stat().st_size, "date": date_match.group(1) if date_match else ""}
        try:
            checksum, encoding, delimiter = inspect(path)
            item["sha256"] = checksum
            meta_path, data_path = cache / (checksum + ".json"), cache / (checksum + ".jsonl")
            if meta_path.exists():
                item.update(json.loads(meta_path.read_text(encoding="utf-8")))
                item["reused_content_cache"] = True
            else:
                try:
                    records, meta = read_file(path, encoding, delimiter)
                except UnicodeDecodeError:
                    records, meta = read_file(path, "cp1252", delimiter)
                    meta["encoding_note"] = "Full-file UTF-8 failed; restarted as Windows-1252"
                if records is not None:
                    with data_path.open("w", encoding="utf-8") as target:
                        for fields, count in records.items(): target.write(json.dumps([*fields, count], ensure_ascii=False) + "\n")
                meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
                item.update(meta)
                item["reused_content_cache"] = False
        except Exception as error:
            item.update(status="failed", error=str(error))
        inventory.append(item)
        (out / "inventory.json").write_text(json.dumps({"root": str(root), "detected_csv": len(paths), "files": inventory, "complete": index == len(paths)}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{index}/{len(paths)} {item['status']} {relative}: {item.get('counts', {}).get('rows', 0)} rows", flush=True)
    return inventory

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=pathlib.Path)
    parser.add_argument("out", type=pathlib.Path)
    args = parser.parse_args()
    scan(args.root.resolve(), args.out.resolve())
