"""Read-only audit of installed GTIN coverage, images and indexed lookup plan."""
import argparse
import json
from pathlib import Path
import psycopg
from install import local_credentials, DB


def audit(prepared, baseline):
    expected = json.loads((prepared / 'report.json').read_text(encoding='utf-8'))
    prior = {json.loads(line)['gtin14'] for line in baseline.read_text(encoding='utf-8').splitlines()}
    with psycopg.connect(**local_credentials(), dbname=DB, options='-c default_transaction_read_only=on') as conn:
        codes = {row[0].strip() for row in conn.execute('SELECT gtin14 FROM reference_catalog.product WHERE eligible UNION SELECT gtin14 FROM beauty_odbl.product WHERE eligible')}
        justified_removals = set(expected.get('baseline_codes_removed_from_suggestions', []))
        if len(codes) != expected['unique_codes'] or not prior <= codes | justified_removals:
            raise ValueError('Coverage differs from prepared catalogue or loses baseline codes')
        examples = []
        for code in ['7791293044705', '7793008001928', '7798336948785', '070330731806', '7791274201653',
                     '7791274201875', '7793008021193', '7891150097148']:
            rows = conn.execute("SELECT payload->>'name',payload->>'scope_group',payload ? 'image' FROM reference_catalog.product WHERE eligible AND gtin14=CAST(%s AS char(14))", (code.zfill(14),)).fetchall()
            if len(rows) != 1:
                raise ValueError('Example does not resolve to exactly one reference')
            examples.append({'code': code, 'name': rows[0][0], 'category': rows[0][1], 'image': rows[0][2]})
        plan = conn.execute('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT payload FROM reference_catalog.product WHERE eligible AND gtin14=CAST(%s AS char(14))', ('07791293044705',)).fetchone()[0][0]
        if plan['Plan']['Node Type'] != 'Index Scan':
            raise ValueError('Barcode lookup is no longer using its index')
        image_count = conn.execute("SELECT count(*) FROM reference_catalog.product WHERE eligible AND payload ? 'image'").fetchone()[0]
        expected_images = json.loads((prepared / 'image-report.json').read_text(encoding='utf-8'))['downloaded']
        if image_count != expected_images:
            raise ValueError('Installed photo count differs from downloaded photos')
    result = {'unique_codes': len(codes), 'all_previous_codes_accounted_for': True, 'quarantined_previous_codes': len(justified_removals), 'images': image_count, 'examples': examples, 'indexed_lookup': plan}
    (prepared / 'audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in result.items() if key != 'indexed_lookup'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('prepared', type=Path)
    parser.add_argument('baseline', type=Path)
    args = parser.parse_args()
    audit(args.prepared, args.baseline)
