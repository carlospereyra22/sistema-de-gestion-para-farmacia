"""Independent complete public brand partitions to detect category/sitemap gaps."""
import argparse
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import httpx
from retail_download import save


def run(root, source):
    origin = 'https://www.' + source + '.com.ar'
    cache = root / 'raw'
    cache.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(timeout=40, limits=httpx.Limits(max_connections=4),
                         headers={'User-Agent': 'CatalogoJuncos/1.0 (public catalogue reference)'})

    def get(url):
        key = hashlib.sha256(url.encode()).hexdigest()
        path, body = cache / (key + '.json'), cache / (key + '.body')
        if path.exists() and body.exists():
            meta = json.loads(path.read_text(encoding='utf-8'))
            raw = body.read_bytes()
            if hashlib.sha256(raw).hexdigest() == meta['sha256']:
                return json.loads(raw), meta
        time.sleep(.35)
        for attempt in range(3):
            response = client.get(url)
            if response.status_code not in (500, 502, 503, 504) or attempt == 2:
                response.raise_for_status()
                break
            time.sleep(2 * (attempt + 1))
        raw = response.content
        if len(raw) > 30_000_000:
            raise ValueError('Source response exceeds size limit')
        meta = {'url': url, 'status': response.status_code, 'resources': response.headers.get('resources'),
                'sha256': hashlib.sha256(raw).hexdigest(), 'downloaded_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        body.write_bytes(raw)
        save(path, meta)
        return response.json(), meta

    brands, _ = get(origin + '/api/catalog_system/pub/brand/list')

    def partition(brand):
        rows, error, total = {}, None, None
        positions = None
        range_failure = None
        try:
            for start in range(0, 2500, 50):
                try:
                    page, meta = get(origin + f'/api/catalog_system/pub/products/search?fq=B:{brand["id"]}&_from={start}&_to={start+49}')
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code not in (500, 502, 503, 504):
                        raise
                    range_failure = str(exc)
                    page, meta = get(origin + f'/api/catalog_system/pub/products/search?fq=B:{brand["id"]}&_from=0&_to=0')
                if any(str(row['brandId']) != str(brand['id']) for row in page):
                    raise ValueError('Public API ignored brand filter')
                total = int(meta['resources'].split('/')[-1])
                rows.update({str(row['productId']): row for row in page})
                if range_failure or start + len(page) >= total or not page:
                    break
            if len(rows) != total or range_failure:
                if total is None or total > 250:
                    raise ValueError('Brand IDs differ from public total: ' + str(total))
                # A retired indexed product can inflate VTEX's count. Check
                # every advertised position, preserving the inconsistency.
                positions = []
                for position in range(total):
                    page, _ = get(origin + f'/api/catalog_system/pub/products/search?fq=B:{brand["id"]}&_from={position}&_to={position}')
                    if any(str(row['brandId']) != str(brand['id']) for row in page):
                        raise ValueError('Public API ignored brand filter')
                    ids = [str(row['productId']) for row in page]
                    positions.append({'position': position, 'ids': ids})
                    rows.update({str(row['productId']): row for row in page})
        except Exception as exc:
            error = type(exc).__name__ + ': ' + str(exc)
        return rows, {'brand': brand['id'], 'reported': total, 'downloaded_unique': len(rows), 'error': error,
                      'position_audit': positions, 'recovered_range_error': range_failure if not error else None}

    original = json.loads((root / 'catalogue.json').read_text(encoding='utf-8'))
    products = {str(row['productId']): row for row in original}
    partitions = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for index, (rows, report) in enumerate(pool.map(partition, brands), 1):
            products.update(rows)
            partitions.append(report)
            if index % 100 == 0:
                print(source, 'brands', index, '/', len(brands), 'products', len(products), flush=True)
    _, general = get(origin + '/api/catalog_system/pub/products/search?_from=0&_to=49')
    general_total = int(general['resources'].split('/')[-1])
    coverage = json.loads((root / 'coverage.json').read_text(encoding='utf-8'))
    coverage.update(products=len(products), brand_partitions=partitions, general_reported=general_total,
                    brand_added_product_ids=sorted(set(products) - {str(row['productId']) for row in original}))
    save(root / 'catalogue.json', list(products.values()))
    save(root / 'coverage.json', coverage)
    client.close()
    print(source, 'products', len(products), 'general total', general_total, 'failed brands', sum(bool(p['error']) for p in partitions))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', choices=['farmalife', 'farmaplus'])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.output / args.source, args.source)
