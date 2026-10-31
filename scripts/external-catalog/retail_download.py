"""Resumable snapshots of anonymous public retailer catalogues (no commercial writes).

Run with uv --with playwright. Raw snapshots are evidence, never import claims.
Farmar's anonymous visitor token stays in memory and is never written to disk.
"""
import argparse
import gzip
import io
import hashlib
import json
import re
import time
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from vtex_page import page_product


class Snapshot:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def get(self, url):
        key = hashlib.sha256(url.encode()).hexdigest()
        path = self.root / (key + '.json')
        body = self.root / (key + '.body')
        if path.exists() and body.exists():
            meta = json.loads(path.read_text(encoding='utf-8'))
            raw = body.read_bytes()
            if hashlib.sha256(raw).hexdigest() == meta['sha256']:
                return raw, meta
        time.sleep(.35)
        request = urllib.request.Request(url, headers={'User-Agent': 'CatalogoJuncos/1.0 (public catalogue reference)'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    raw = response.read(30_000_001)
                    if len(raw) > 30_000_000:
                        raise ValueError('Response exceeds 30 MB')
                    meta = {'url': url, 'status': response.status, 'resources': response.headers.get('resources'),
                            'sha256': hashlib.sha256(raw).hexdigest(), 'downloaded_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                break
            except urllib.error.HTTPError as error:
                if error.code not in (500, 502, 503, 504) or attempt == 2:
                    raise
                time.sleep(3 * (attempt + 1))
        body.write_bytes(raw)
        path.write_text(json.dumps(meta), encoding='utf-8')
        return raw, meta

    def json(self, url):
        raw, meta = self.get(url)
        return json.loads(raw), meta


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def farmacorp(root):
    snapshot = Snapshot(root / 'raw')
    products = {}
    for page in range(1, 1001):
        data, _ = snapshot.json(f'https://farmacorp.com/products.json?limit=250&page={page}')
        rows = data['products']
        if not rows:
            save(root / 'catalogue.json', list(products.values()))
            save(root / 'coverage.json', {'products': len(products), 'pages': page, 'terminal_empty_page': True})
            return
        fresh = [row for row in rows if str(row['id']) not in products]
        if not fresh:
            raise ValueError('Pagination repeated; catalogue is incomplete')
        products.update({str(row['id']): row for row in rows})
        print('farmacorp', page, len(products), flush=True)
    raise ValueError('Pagination safety limit reached')


def vtex(root, origin):
    snapshot = Snapshot(root / 'raw')
    tree, _ = snapshot.json(origin + '/api/catalog_system/pub/category/tree/5')
    save(root / 'categories.json', tree)
    products = {}
    partitions = []
    failures = []
    # Root categories partition the public search window; oversized roots recurse.
    def category(node, parents=''):
        count = 0
        total = None
        category_path = parents + str(node['id']) + '/'
        for start in range(0, 2500, 50):
            url = f'{origin}/api/catalog_system/pub/products/search?fq=C:/{category_path}&_from={start}&_to={start+49}'
            try:
                rows, meta = snapshot.json(url)
            except (urllib.error.HTTPError, TimeoutError) as error:
                failures.append({'url': url, 'error': str(error)})
                print('farmalife partition failure', node['id'], start, flush=True)
                continue
            products.update({str(row['productId']): row for row in rows})
            count += len(rows)
            total = int(meta['resources'].split('/')[-1]) if meta.get('resources') else None
            if not rows or (total is not None and start + len(rows) >= total):
                break
        partitions.append({'category': node['id'], 'reported': total, 'downloaded': count})
        print('farmalife', node['name'], count, total, len(products), flush=True)
        if total and total > 2500:
            for child in node.get('children', []):
                category(child, category_path)
    for node in tree:
        category(node)
    raw, _ = snapshot.get(origin + '/sitemap.xml')
    maps = [element.text for element in ET.fromstring(raw).iter() if element.tag.endswith('loc') and '/product-' in element.text]
    links = set()
    for url in maps:
        xml, _ = snapshot.get(url)
        links.update(element.text for element in ET.fromstring(xml).iter() if element.tag.endswith('loc'))
    known = {row['link'].rstrip('/') for row in products.values()}
    missing = sorted(link for link in links if link.rstrip('/') not in known)
    unresolved = []
    unavailable = []
    page_recovered = []
    for index, link in enumerate(missing):
        slug = urllib.parse.urlparse(link).path.removesuffix('/p').strip('/')
        try:
            rows, _ = snapshot.json(origin + '/api/catalog_system/pub/products/search/' + urllib.parse.quote(slug, safe='') + '/p')
        except (urllib.error.HTTPError, TimeoutError) as error:
            unresolved.append(link)
            failures.append({'url': link, 'error': str(error)})
            continue
        exact = [row for row in rows if row.get('link', '').rstrip('/') == link.rstrip('/')]
        products.update({str(row['productId']): row for row in exact})
        if not exact:
            # VTEX can retain retired product URLs in its sitemap. A successful
            # empty search alone is insufficient; verify the public page too.
            try:
                page, meta = snapshot.get(link)
                if page.startswith(b'\x1f\x8b'):
                    with gzip.GzipFile(fileobj=io.BytesIO(page)) as compressed:
                        page = compressed.read(30_000_001)
                    if len(page) > 30_000_000:
                        raise ValueError('Decompressed product page exceeds size limit')
                document = page.decode('utf-8')
                embedded = page_product(document, link)
                if embedded:
                    products[str(embedded['productId'])] = embedded
                    page_recovered.append({'url': link, 'product_id': embedded['productId'], 'page_sha256': meta['sha256']})
                    continue
                blocks = re.findall(r'<template[^>]+data-field="queryData"[^>]*>\s*<script>(.*?)</script>', document, re.S)
                null_product = False
                for block in blocks:
                    state = json.loads(block)
                    null_product = any(item.get('data') == 'null' and item.get('variables', {}).get('slug') == slug
                                       and re.search(r'\bproduct\s*\(', item.get('query', '')) for item in state) if isinstance(state, list) else False
                if null_product:
                    unavailable.append({'url': link, 'reason': 'public_product_query_returns_null', 'page_sha256': meta['sha256']})
                else:
                    unresolved.append(link)
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    unavailable.append({'url': link, 'reason': 'public_page_http_404'})
                else:
                    unresolved.append(link)
        if index % 25 == 0:
            print('farmalife sitemap reconciliation', index, len(missing), flush=True)
    save(root / 'catalogue.json', list(products.values()))
    save(root / 'coverage.json', {'products': len(products), 'sitemap_urls': len(links), 'sitemaps': maps,
                                'partitions': partitions, 'unresolved_sitemap_urls': unresolved,
                                'unavailable_sitemap_urls': unavailable, 'failed_requests': failures,
                                'page_recovered_products': page_recovered})


def farmalife(root):
    vtex(root, 'https://www.farmalife.com.ar')


def farmaplus(root):
    vtex(root, 'https://www.farmaplus.com.ar')


def farmar(root):
    from playwright.sync_api import sync_playwright
    cache = root / 'raw'
    cache.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page()
        visitor_headers = {}
        def capture(request):
            if request.url == 'https://api.farmar.com.ar/api/product/search':
                visitor_headers.update({k: v for k, v in request.all_headers().items() if k in ('authorization', 'content-type')})
        page.on('request', capture)
        page.goto('https://www.farmar.com.ar/productos?buscar=a', wait_until='domcontentloaded', timeout=60000)
        props = json.loads(page.locator('#__NEXT_DATA__').text_content())['props']['pageProps']
        save(root / 'categories.json', props['categories'])
        for _ in range(12):
            page.evaluate('window.scrollTo(0,document.body.scrollHeight)')
            page.wait_for_timeout(1000)
            if visitor_headers:
                break
        if not visitor_headers:
            raise ValueError('Anonymous public listing request unavailable')
        products = {}
        partitions = []
        categories = [None] + props['categories']
        memberships = {}
        def fetch_category(category):
            category_id = category['categoryId'] if category else None
            ids = set()
            collected = {}
            for index in range(1, 1001):
                body = {'textToSearch': '', 'productActionTypeIds': [], 'isSpecialPromotion': None,
                        'promotionId': None, 'brandIds': [], 'categories': [category_id] if category_id else [],
                        'location': {'latitude': None, 'longitude': None}, 'columnToSort': '',
                        'pageIndex': index, 'pageSize': 100, 'sucursalId': props['sucursalID']}
                path = cache / (f'category-v2-{category_id}-page-{index}.json' if category else f'category-None-page-{index}.json')
                if path.exists():
                    data = json.loads(path.read_text(encoding='utf-8'))
                else:
                    time.sleep(.5)
                    endpoint = 'category' if category else 'search'
                    request = urllib.request.Request('https://api.farmar.com.ar/api/product/' + endpoint, headers=visitor_headers, data=json.dumps(body).encode())
                    with urllib.request.urlopen(request, timeout=60) as response:
                        data = json.load(response)
                    save(path, data)
                if not data.get('isSuccess'):
                    raise ValueError('Public listing reports failure')
                rows = data['rows']
                fresh = {str(row['productId']) for row in rows} - ids
                collected.update({str(row['productId']): row for row in rows})
                ids.update(fresh)
                if not rows or index >= data['totalPages']:
                    break
                if not fresh:
                    raise ValueError('Repeated public listing page')
                if index % 10 == 0:
                    print('farmar', category_id, index, len(collected), flush=True)
            print('farmar category', category_id, len(ids), data['totalCount'], flush=True)
            return category, collected, {'category': category_id, 'reported': data['totalCount'], 'downloaded_unique': len(ids)}
        with ThreadPoolExecutor(max_workers=3) as executor:
            for category, collected, partition in executor.map(fetch_category, categories):
                products.update(collected)
                partitions.append(partition)
                if category:
                    for product_id in collected:
                        memberships.setdefault(product_id, []).append({'id': category['categoryId'], 'name': category['description'], 'level': category['level']})
        save(root / 'catalogue.json', list(products.values()))
        save(root / 'memberships.json', memberships)
        save(root / 'coverage.json', {'products': len(products), 'partitions': partitions, 'branch': props['sucursalID']})
        browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', choices=['farmacorp', 'farmalife', 'farmar', 'farmaplus'])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = args.output / args.source
    root.mkdir(parents=True, exist_ok=True)
    try:
        globals()[args.source](root)
    except Exception as error:
        save(root / 'failure.json', {'type': type(error).__name__, 'message': str(error), 'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
        raise
