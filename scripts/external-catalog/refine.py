"""Conservatively reclassify an audited candidate snapshot without repeating 14M price rows.
Never promotes previously rejected records. The initial raw inputs remain available for a full rebuild.
"""
import json
import pathlib
import shutil
import sys
from collections import Counter, defaultdict
from prepare import Importer
from rules import classify

original, target = map(pathlib.Path, sys.argv[1:3])
if target.exists(): raise ValueError("Output already exists")
report = json.loads((original / "report.json").read_text(encoding="utf-8"))
importer = Importer(target)
importer.stats = defaultdict(Counter, {source: Counter(stats) for source, stats in report["sources"].items()})
importer.failures = report["failures"]
with (original / "rejected.jsonl").open(encoding="utf-8") as rejected:
    shutil.copyfileobj(rejected, importer.rejected)
with (original / "candidates.jsonl").open(encoding="utf-8") as candidates:
    for line in candidates:
        row = json.loads(line)
        group, error = classify(row["name"], row["category"])
        if error:
            stats = importer.stats[row["source"]]
            count = row["occurrences"]
            stats["accepted_rows"] -= count
            stats["duplicate_rows"] -= count - 1
            stats["rejected"] += count
            stats[error] += count
            importer.rejected.write(json.dumps({"source": row["source"], "code": row["code"], "name": row["name"], "reason": error, "occurrences": count, "source_ref": row["source_ref"]}, ensure_ascii=False) + "\n")
        else:
            row["scope_group"] = group
            importer.entries[(row["source"], row["fingerprint"])] = row
importer.finish()
