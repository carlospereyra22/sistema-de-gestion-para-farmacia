"""Download official snapshots without executing code from the supplied archive."""
import hashlib
import json
import pathlib
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(sys.argv[1])
ROOT.mkdir(parents=True, exist_ok=True)
CKAN = "https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios"
BEAUTY = "https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz"
manifest = {"retrieved_at": datetime.now(timezone.utc).isoformat(), "sources": {}}

def download(url, target, limit):
    req = urllib.request.Request(url, headers={"User-Agent": "FarmaciaJuncosCatalog/1.0 (catalog research)"})
    total = 0
    digest = hashlib.sha256()
    with urllib.request.urlopen(req, timeout=90) as response, target.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > limit:
                raise ValueError("Download exceeds safety limit")
            output.write(chunk)
            digest.update(chunk)
    return {"url": url, "bytes": total, "sha256": digest.hexdigest(), "file": str(target), "status": "downloaded"}

for source in ["sepa", "openbeauty"]:
    try:
        if source == "sepa":
            meta_path = ROOT / "sepa-metadata.json"
            download(CKAN, meta_path, 10_000_000)
            meta = json.loads(meta_path.read_text(encoding="utf-8"))["result"]
            resources = sorted([r for r in meta["resources"] if r["url"].endswith(".zip")], key=lambda r: r.get("last_modified", ""), reverse=True)
            resource = resources[0]
            print("Downloading", resource["name"], resource["url"], flush=True)
            info = download(resource["url"], ROOT / "sepa.zip", 1_500_000_000)
            info.update(license=meta.get("license_id"), resource_modified=resource.get("last_modified"))
        else:
            print("Downloading Open Beauty Facts", flush=True)
            info = download(BEAUTY, ROOT / "openbeauty.csv.gz", 300_000_000)
            info.update(license="ODbL-1.0", attribution="Open Beauty Facts contributors", license_url="https://opendatacommons.org/licenses/odbl/1-0/")
        manifest["sources"][source] = info
        print(source, info["bytes"], "bytes downloaded", flush=True)
    except Exception as error:
        manifest["sources"][source] = {"status": "failed", "error": str(error)}
        print(source, "FAILED", str(error), flush=True)
    (ROOT / "downloads.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
