"""Audit every active external record and reconcile public inventory with PostgreSQL.

Read-only. No claim of physical product verification or production activation.
"""
import argparse
import base64
import hashlib
import io
import json
import random
import statistics
import time
from collections import Counter
from pathlib import Path
import psycopg
from PIL import Image
from install import local_credentials, DB
from rules import gtin_error
from catalog_normalization import canonical_brand


def run(prepared):
    expected = [json.loads(line) for line in (prepared / 'candidates.jsonl').read_text(encoding='utf-8').splitlines()]
    inventory = [json.loads(line) for line in (prepared / 'inventory.jsonl').read_text(encoding='utf-8').splitlines()]
    report = json.loads((prepared / 'report.json').read_text(encoding='utf-8'))
    errors, codes, image_count, empty_fields = [], set(), 0, Counter()
    type_reviews = []
    with psycopg.connect(**local_credentials(), dbname=DB, options='-c default_transaction_read_only=on') as conn:
        for schema in ['reference_catalog', 'beauty_odbl']:
            with conn.cursor(name=schema + '_audit') as cur:
                cur.execute(psycopg.sql.SQL('SELECT gtin14,payload,evidence FROM {}.product WHERE eligible').format(psycopg.sql.Identifier(schema)))
                for code, payload, evidence in cur:
                    code = code.strip()
                    codes.add(code)
                    if payload.get('type_review_reason'):
                        type_reviews.append({'code': payload['code'], 'name': payload['name'], 'reason': payload['type_review_reason']})
                        if payload.get('isMedication') is not None:
                            errors.append({'code': code, 'error': 'conflicting_type_automatically_classified'})
                    if gtin_error(payload['code']) or payload['code'].zfill(14) != code or payload['gtin14'] != code:
                        errors.append({'code': code, 'error': 'invalid_or_mismatched_gtin'})
                    if payload['verification'] != 'CHECKSUM_VALID_NOT_PHYSICALLY_VERIFIED':
                        errors.append({'code': code, 'error': 'unsupported_verification'})
                    if not any(row['fingerprint'] == payload['fingerprint'] and row['source'] == payload['source'] for row in evidence):
                        errors.append({'code': code, 'error': 'chosen_record_missing_evidence'})
                    if any((row['source'] == 'openbeauty') != (schema == 'beauty_odbl') for row in evidence):
                        errors.append({'code': code, 'error': 'license_collections_mixed'})
                    for field, origin in payload.get('attribute_sources', {}).items():
                        donors = [row for row in evidence if row.get('source') == origin.get('source') and row.get('source_ref','') == origin.get('source_ref','') and row.get('gtin14') == code]
                        valid = any(canonical_brand(row.get('brand','')) == payload.get('brand') if field == 'brand' else row.get('category_path') == payload.get('category_path') for row in donors)
                        if not valid:
                            errors.append({'code': code, 'error': 'attribute_without_matching_evidence', 'field': field})
                    for field in ['name', 'brand', 'presentation', 'scope_group', 'source_ref']:
                        if not payload.get(field):
                            empty_fields[field] += 1
                    if photo := payload.get('image'):
                        raw = base64.b64decode(photo['data_url'].split(',', 1)[1], validate=True)
                        with Image.open(io.BytesIO(raw)) as image:
                            if image.format != 'JPEG' or max(image.size) > 800 or len(raw) > 60 * 1024 or image.getexif():
                                errors.append({'code': code, 'error': 'invalid_photo_dimensions_or_metadata'})
                            image.verify()
                        if hashlib.sha256(raw).hexdigest() != photo['sha256']:
                            errors.append({'code': code, 'error': 'photo_checksum'})
                        image_count += 1
        installed = set(conn.execute('SELECT source,fingerprint FROM reference_catalog.candidate WHERE eligible UNION ALL SELECT source,fingerprint FROM beauty_odbl.candidate WHERE eligible').fetchall())
        expected_evidence = {(row['source'], row['fingerprint']) for row in expected}
        if installed != expected_evidence:
            errors.append({'error': 'database_evidence_differs_from_prepared', 'missing': len(expected_evidence-installed), 'extra': len(installed-expected_evidence)})
        for source in sorted({row['source'] for row in inventory}):
            admitted = {row['code'].zfill(14) for row in inventory if row['source'] == source and row['status'] == 'candidate'}
            if missing := admitted - codes:
                errors.append({'source': source, 'error': 'admitted_product_missing', 'codes': sorted(missing)})
        result_path = prepared / 'postgres-result.json'
        if result_path.exists():
            batch = json.loads(result_path.read_text(encoding='utf-8'))['batch']
            expected_inventory = {(r['source'], r['source_id'], hashlib.sha256(json.dumps(r, sort_keys=True, ensure_ascii=False).encode()).hexdigest()) for r in inventory}
            stored_inventory = set(conn.execute('SELECT source,source_id,fingerprint::text FROM reference_catalog.source_record WHERE batch_id=%s', (batch,)).fetchall())
            if expected_inventory != stored_inventory:
                errors.append({'error': 'public_inventory_not_fully_persisted', 'missing': len(expected_inventory-stored_inventory), 'extra': len(stored_inventory-expected_inventory)})
        indexes = conn.execute("SELECT indexrelid::regclass::text,indisvalid FROM pg_index WHERE indrelid IN ('reference_catalog.product'::regclass,'beauty_odbl.product'::regclass)").fetchall()
        if not indexes or not all(valid for _, valid in indexes):
            errors.append({'error': 'invalid_index'})
        durations = []
        sample = random.Random(20261025).sample(sorted(codes), min(500, len(codes)))
        for code in sample:
            start = time.perf_counter()
            conn.execute('SELECT payload FROM reference_catalog.product WHERE eligible AND gtin14=CAST(%s AS char(14))', (code,)).fetchone()
            durations.append((time.perf_counter()-start)*1000)
        durations.sort()
        table_stats = conn.execute("SELECT schemaname,relname,n_live_tup,n_dead_tup,last_analyze,last_autovacuum FROM pg_stat_user_tables WHERE relname IN ('candidate','product')").fetchall()
        history = {r[0].strip() for r in conn.execute('SELECT gtin14 FROM reference_catalog.candidate UNION SELECT gtin14 FROM beauty_odbl.candidate')}
        if not set(report.get('baseline_codes_removed_from_suggestions', [])) <= history:
            errors.append({'error': 'quarantined_history_not_preserved'})
    result = {'status': 'PASS' if not errors else 'FAIL', 'errors': errors, 'unique_codes': len(codes),
              'active_evidence': len(installed), 'verified_photos': image_count, 'missing_optional_fields': dict(empty_fields),
              'product_type_manual_review': type_reviews,
              'product_type_manual_review_count': len(type_reviews),
              'source_dispositions': {source: dict(Counter(row['status'] for row in inventory if row['source'] == source)) for source in sorted({row['source'] for row in inventory})},
              'all_admitted_retail_codes_installed': not any(e.get('error') == 'admitted_product_missing' for e in errors),
              'indexes': indexes, 'sampled_database_lookup_ms': {'count': len(sample), 'median': round(statistics.median(durations),3), 'p95': round(durations[int(len(durations)*.95)-1],3), 'max': round(max(durations),3)},
              'tables': table_stats, 'production_enabled': False, 'physical_verification': False}
    (prepared / 'readiness.json').write_text(json.dumps(result, ensure_ascii=False, default=str, indent=2), encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in {'tables', 'product_type_manual_review'}}, ensure_ascii=False, indent=2))
    if errors:
        raise ValueError('Readiness audit failed; inspect readiness.json')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('prepared', type=Path)
    run(parser.parse_args().prepared)
