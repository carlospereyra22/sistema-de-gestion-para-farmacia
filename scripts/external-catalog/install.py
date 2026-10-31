"""Install prepared candidates into a LOCAL, independent PostgreSQL database only.
Never logs connection strings or changes the commercial database.
"""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
from datetime import datetime, timezone
from urllib.parse import urlsplit, unquote
import psycopg
from psycopg.types.json import Jsonb
from rules import gtin_error
from catalog_normalization import canonical_records
from image_payload import attach_image

DB = "catalogo_juncos_external"
ROOT = pathlib.Path(__file__).resolve().parents[2]

def local_credentials():
    line = next(line for line in (ROOT / "apps/api/.env").read_text(encoding="utf-8-sig").splitlines() if line.startswith("DATABASE_URL="))
    url = urlsplit(line.split("=", 1)[1].strip().strip('"'))
    if url.hostname not in {"localhost", "127.0.0.1"} or url.path != "/gestion_dev":
        raise ValueError("Only the local development installation is allowed")
    return dict(host=url.hostname, port=url.port or 5432, user=unquote(url.username), password=unquote(url.password))

def commercial_counts(credentials):
    with psycopg.connect(**credentials, dbname="gestion_dev", options="-c default_transaction_read_only=on") as conn:
        return {table: conn.execute(psycopg.sql.SQL("SELECT count(*) FROM {}").format(psycopg.sql.Identifier(table))).fetchone()[0] for table in ["Product", "ProductBarcode", "ProductPrice", "Purchase", "Sale", "InventoryMovement"]}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("prepared", type=pathlib.Path)
    p.add_argument("--manifest", type=pathlib.Path, required=True)
    p.add_argument("--attachments", type=pathlib.Path, nargs="*", default=[])
    a = p.parse_args()
    credentials = local_credentials()
    before = commercial_counts(credentials)
    with psycopg.connect(**credentials, dbname="postgres", autocommit=True) as admin:
        exists = admin.execute("SELECT 1 FROM pg_database WHERE datname=%s", (DB,)).fetchone()
        if not exists:
            admin.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(DB)))
    if exists:
        target = pathlib.Path(os.environ["LOCALAPPDATA"]) / "FarmaciaJuncos/RespaldosLocales" / ("catalogo-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".dump")
        env = dict(os.environ, PGPASSWORD=credentials["password"])
        subprocess.run([r"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe", "-h", credentials["host"], "-p", str(credentials["port"]), "-U", credentials["user"], "-d", DB, "-Fc", "-f", str(target)], env=env, check=True)
        subprocess.run([r"C:\Program Files\PostgreSQL\18\bin\pg_restore.exe", "--list", str(target)], stdout=subprocess.DEVNULL, check=True)
        print("Existing external database backed up:", target)
    path = a.prepared / "candidates.jsonl"
    prepared_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    image_path = a.prepared / 'images.jsonl'
    image_hash = hashlib.sha256(image_path.read_bytes()).hexdigest() if image_path.exists() else None
    inventory_path = a.prepared / 'inventory.jsonl'
    inventory_hash = hashlib.sha256(inventory_path.read_bytes()).hexdigest() if inventory_path.exists() else ''
    batch = hashlib.sha256((prepared_hash + ':' + (image_hash or '') + ':' + inventory_hash).encode()).hexdigest()
    report = json.loads((a.prepared / "report.json").read_text(encoding="utf-8"))
    manifest = json.loads(a.manifest.read_text(encoding="utf-8"))
    manifest["prepared_sha256"] = prepared_hash
    manifest['inventory_sha256'] = inventory_hash
    manifest["attachments"] = [{"filename": item.name, "bytes": item.stat().st_size, "sha256": hashlib.sha256(item.read_bytes()).hexdigest()} for item in a.attachments]
    rows = []
    images = {r['gtin14']: r for r in (json.loads(line) for line in image_path.read_text(encoding='utf-8').splitlines())} if image_path.exists() else {}
    if image_path.exists():
        manifest['images_sha256'] = image_hash
    for line in path.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        if gtin_error(r["code"]) or r["gtin14"] != r["code"].zfill(14) or not r["name"]:
            raise ValueError("Prepared candidate failed validation")
        if r["verification"] != "CHECKSUM_VALID_NOT_PHYSICALLY_VERIFIED":
            raise ValueError("Import cannot grant physical verification")
        if r["source"] == "openbeauty" and (r["license"] != "ODbL-1.0" or r["argentina_evidence"] != "en:argentina"):
            raise ValueError("Invalid Beauty provenance")
        rows.append(r)
    with psycopg.connect(**credentials, dbname=DB) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(74102903)")
        conn.execute((pathlib.Path(__file__).parent / "schema.sql").read_text(encoding="utf-8"))
        conn.execute("INSERT INTO reference_catalog.import_batch(id,manifest,report) VALUES (%s,%s,%s) ON CONFLICT(id) DO NOTHING", (batch, Jsonb(manifest), Jsonb(report)))
        conn.execute((pathlib.Path(__file__).parent / 'inventory-schema.sql').read_text(encoding='utf-8'))
        if inventory_path.exists():
            inventory = [json.loads(line) for line in inventory_path.read_text(encoding='utf-8').splitlines()]
            with conn.cursor() as cur:
                cur.executemany('INSERT INTO reference_catalog.source_record(source,source_id,fingerprint,payload,status,batch_id) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(source,source_id,fingerprint) DO UPDATE SET batch_id=EXCLUDED.batch_id,observed_at=now()',
                    [(r['source'], r['source_id'], hashlib.sha256(json.dumps(r, sort_keys=True, ensure_ascii=False).encode()).hexdigest(), Jsonb(r), r['status'], batch) for r in inventory])
        for schema, beauty in [("reference_catalog", False), ("beauty_odbl", True)]:
            own = [r for r in rows if (r["source"] == "openbeauty") == beauty]
            sources = [source for source in report["sources"] if (source == "openbeauty") == beauty]
            conn.execute(psycopg.sql.SQL("UPDATE {}.candidate SET eligible=false WHERE source = ANY(%s)").format(psycopg.sql.Identifier(schema)), (sources,))
            with conn.cursor() as cur:
                cur.executemany(psycopg.sql.SQL("INSERT INTO {}.candidate(source,fingerprint,gtin14,payload,batch_id) VALUES (%s,%s,%s,%s,%s) ON CONFLICT(source,fingerprint) DO UPDATE SET payload=EXCLUDED.payload,batch_id=EXCLUDED.batch_id,updated_at=now(),eligible=true").format(psycopg.sql.Identifier(schema)), [(r["source"], r["fingerprint"], r["gtin14"], Jsonb(r), batch) for r in own])
        conn.execute((pathlib.Path(__file__).parent / "normalized-schema.sql").read_text(encoding="utf-8"))
        normalized_rows = canonical_records(rows)
        for record in normalized_rows:
            if not record['beauty']:
                attach_image(record, images.get(record['gtin14']))
        for schema, beauty in [("reference_catalog", False), ("beauty_odbl", True)]:
            conn.execute(psycopg.sql.SQL("UPDATE {}.product SET eligible=false").format(psycopg.sql.Identifier(schema)))
            with conn.cursor() as cur:
                cur.executemany(psycopg.sql.SQL("INSERT INTO {}.product(gtin14,payload,evidence,batch_id) VALUES (%s,%s,%s,%s) ON CONFLICT(gtin14) DO UPDATE SET payload=EXCLUDED.payload,evidence=EXCLUDED.evidence,batch_id=EXCLUDED.batch_id,eligible=true").format(psycopg.sql.Identifier(schema)), [(r['gtin14'], Jsonb(r['payload']), Jsonb(r['evidence']), batch) for r in normalized_rows if r['beauty'] == beauty])
        total = conn.execute("SELECT count(DISTINCT gtin14) FROM (SELECT gtin14 FROM reference_catalog.candidate WHERE eligible UNION ALL SELECT gtin14 FROM beauty_odbl.candidate WHERE eligible) s").fetchone()[0]
        conn.execute('ANALYZE reference_catalog.product')
        conn.execute('ANALYZE beauty_odbl.product')
        conn.execute('ANALYZE reference_catalog.candidate')
        conn.execute('ANALYZE beauty_odbl.candidate')
        conn.execute('ANALYZE reference_catalog.source_record')
        stored = conn.execute("SELECT source,count(*),count(DISTINCT gtin14) FROM (SELECT source,gtin14 FROM reference_catalog.candidate WHERE eligible UNION ALL SELECT source,gtin14 FROM beauty_odbl.candidate WHERE eligible) s GROUP BY source ORDER BY source").fetchall()
    after = commercial_counts(credentials)
    result = {"status": "IMPORTED_TO_LOCAL_POSTGRES", "database": DB, "batch": batch, "imported_at": datetime.now(timezone.utc).isoformat(), "unique_codes_in_database": total, "by_source": stored, "commercial_counts_before": before, "commercial_counts_after": after, "commercial_counts_unchanged": before == after, "production_enabled": False}
    (a.prepared / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (a.prepared / "postgres-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))

if __name__ == "__main__": main()
