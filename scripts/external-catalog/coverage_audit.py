"""Reconcile full source identifiers and sitemap URLs, not just headline totals."""
import argparse
import hashlib
import json
import xml.etree.ElementTree as ET
import gzip
from pathlib import Path
from retail_prepare import variants


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def audit(retail, prepared):
    inventory = [json.loads(line) for line in (prepared / 'inventory.jsonl').read_text(encoding='utf-8').splitlines()]
    findings = {}
    for source in ['farmalife', 'farmar', 'farmacorp', 'farmaplus', 'farmamix']:
        root = retail / source
        if not root.exists():
            continue
        catalogue = read(root / 'catalogue.json')
        memberships = read(root / 'memberships.json') if source == 'farmar' else None
        expected = list(variants(source, catalogue, memberships))
        saved = [row for row in inventory if row['source'] == 'public_' + source]
        if len(expected) != len(saved) or {r['source_id'] for r in expected} != {r['source_id'] for r in saved}:
            raise ValueError('Inventory omits a source variant: ' + source)
        result = {'downloaded_products': len(catalogue), 'downloaded_variants': len(expected), 'all_variants_have_disposition': True,
                  'catalogue_sha256': hashlib.sha256((root / 'catalogue.json').read_bytes()).hexdigest()}
        if source in ('farmalife', 'farmaplus'):
            coverage = read(root / 'coverage.json')
            for recovered in coverage.get('page_recovered_products', []):
                from vtex_page import page_product
                page_path = root / 'raw' / (hashlib.sha256(recovered['url'].encode()).hexdigest() + '.body')
                body = page_path.read_bytes()
                if hashlib.sha256(body).hexdigest() != recovered['page_sha256']:
                    raise ValueError('Embedded page checksum mismatch')
                document = gzip.decompress(body) if body[:2] == b'\x1f\x8b' else body
                product = page_product(document.decode('utf8'), recovered['url'])
                if not product or str(product['productId']) != str(recovered['product_id']) or not any(str(row['productId']) == str(product['productId']) for row in catalogue):
                    raise ValueError('Embedded page product missing from catalogue')
            result['embedded_page_products'] = len(coverage.get('page_recovered_products', []))
            maps, urls = [], set()
            for path in (root / 'raw').glob('*.json'):
                meta = read(path)
                if '/sitemap/product-' not in meta['url']:
                    continue
                raw = path.with_suffix('.body').read_bytes()
                if hashlib.sha256(raw).hexdigest() != meta['sha256']:
                    raise ValueError('Sitemap snapshot checksum mismatch')
                maps.append(meta['url'])
                urls.update(e.text.rstrip('/') for e in ET.fromstring(raw).iter() if e.tag.endswith('loc'))
            downloaded = {row['link'].rstrip('/') for row in catalogue}
            unavailable = {row['url'].rstrip('/') for row in read(root / 'coverage.json').get('unavailable_sitemap_urls', [])}
            if not maps or urls - downloaded - unavailable:
                raise ValueError('Sitemap products are missing')
            result.update(sitemaps=len(maps), sitemap_urls=len(urls), missing_sitemap_urls=sorted(urls-downloaded-unavailable),
                          unavailable_sitemap_urls=sorted(unavailable), additional_urls=sorted(downloaded-urls))
            if 'brand_partitions' in coverage:
                from urllib.parse import parse_qs, urlsplit
                brand_ids = {}
                for path in (root / 'raw').glob('*.json'):
                    meta = read(path)
                    query = parse_qs(urlsplit(meta['url']).query)
                    brand_filter = next((value for value in query.get('fq', []) if value.startswith('B:')), None)
                    if not brand_filter:
                        continue
                    raw = path.with_suffix('.body').read_bytes()
                    if hashlib.sha256(raw).hexdigest() != meta['sha256']:
                        raise ValueError('Brand snapshot checksum mismatch')
                    brand_ids.setdefault(brand_filter[2:], set()).update(str(row['productId']) for row in json.loads(raw))
                for partition in coverage['brand_partitions']:
                    ids = brand_ids.get(str(partition['brand']), set())
                    positions = partition.get('position_audit')
                    positional_check = positions is not None and {p['position'] for p in positions} == set(range(partition['reported'])) and {i for p in positions for i in p['ids']} <= ids
                    if partition['error'] or (len(ids) != partition['reported'] and not positional_check) or not ids <= {str(row['productId']) for row in catalogue}:
                        raise ValueError('Unreconciled brand partition: ' + str(partition['brand']))
                result.update(brand_partitions_reconciled=len(coverage['brand_partitions']), general_reported=coverage['general_reported'])
                result['declared_count_discrepancies'] = [p for p in coverage['brand_partitions'] if p['downloaded_unique'] != p['reported']]
                if len(catalogue) < coverage['general_reported']:
                    raise ValueError('Catalogue smaller than declared public total: ' + source)
        elif source == 'farmar':
            partitions = read(root / 'coverage.json')['partitions']
            for partition in partitions:
                category = partition['category']
                prefix = 'category-None-page-' if category is None else f'category-v2-{category}-page-'
                first = read(root / 'raw' / (prefix + '1.json'))
                ids = set()
                for index in range(1, max(1, first['totalPages']) + 1):
                    page = read(root / 'raw' / (prefix + str(index) + '.json'))
                    if not page['isSuccess']:
                        raise ValueError('Failed listing page')
                    ids.update(row['productId'] for row in page['rows'])
                if len(ids) != first['totalCount'] or len(ids) != partition['downloaded_unique']:
                    raise ValueError('Listing IDs differ from declared total')
                if category is None and not ids <= {row['productId'] for row in catalogue}:
                    raise ValueError('General listing missing from catalogue')
            result.update(partitions_reconciled=len(partitions), categories=len(partitions)-1, uncategorized_products=len(catalogue)-len(memberships))
        elif source == 'farmacorp':
            coverage = read(root / 'coverage.json')
            if not coverage.get('terminal_empty_page'):
                raise ValueError('Shopify pagination has no terminal empty page')
            pages, ids = {}, set()
            from urllib.parse import parse_qs, urlsplit
            for path in (root / 'raw').glob('*.json'):
                meta = read(path)
                if '/products.json?' not in meta['url']:
                    continue
                raw = path.with_suffix('.body').read_bytes()
                if hashlib.sha256(raw).hexdigest() != meta['sha256']:
                    raise ValueError('Shopify snapshot checksum mismatch')
                rows = json.loads(raw)['products']
                page = int(parse_qs(urlsplit(meta['url']).query)['page'][0])
                pages[page] = len(rows)
                ids.update(str(row['id']) for row in rows)
            last = coverage['pages']
            if set(pages) != set(range(1, last + 1)) or pages[last] != 0 or ids != {str(row['id']) for row in catalogue}:
                raise ValueError('Shopify pages or product IDs incomplete')
            result.update(pages=last, terminal_empty_page=True)
        elif source == 'farmamix':
            coverage = read(root / 'coverage.json')
            records = {r['url']: r for r in (json.loads(line) for line in (root / 'records.jsonl').read_text(encoding='utf-8').splitlines())}
            observed_dates = sorted({r['downloaded_at'][:10] for r in records.values() if r.get('downloaded_at')})
            result['page_observation_dates'] = observed_dates
            urls = set()
            import re
            from urllib.parse import urlsplit
            for path in (root / 'sitemap').glob('*.body'):
                for node in ET.fromstring(path.read_bytes()).findall('{*}url/{*}loc'):
                    if urlsplit(node.text).hostname == 'www.farmamix.com.ar' and re.fullmatch(r'/productos/[^/]+/?', urlsplit(node.text).path):
                        urls.add(node.text)
            missing = {url for url in urls if url not in records or records[url].get('error')}
            if not urls or missing or coverage.get('unresolved_sitemap_urls'):
                raise ValueError('Farmamix product URLs incomplete: ' + str(len(missing)))
            expected_ids = {row['source_id'] for url in urls for row in records[url].get('variants', [])}
            if expected_ids != {row['source_id'] for row in catalogue}:
                raise ValueError('Farmamix variants missing from catalogue')
            unavailable = [url for url in urls if records[url].get('unavailable_reason')]
            result.update(sitemap_urls=len(urls), downloaded_products=len(urls)-len(unavailable), missing_sitemap_urls=[], unavailable_sitemap_urls=unavailable)
        findings[source] = result
    (prepared / 'coverage-audit.json').write_text(json.dumps(findings, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(findings, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('retail', type=Path)
    parser.add_argument('prepared', type=Path)
    args = parser.parse_args()
    audit(args.retail, args.prepared)
