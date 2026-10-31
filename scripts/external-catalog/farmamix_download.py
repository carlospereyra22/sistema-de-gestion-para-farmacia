"""Resume the public Tiendanube sitemap without retaining thousands of HTML files.

The journal contains only product facts, URL, acquisition time and original hash.
Related-product JSON-LD is never mistaken for the requested product.
"""
import argparse
import hashlib
import html
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
import httpx
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

from retail_download import Snapshot, save


def parse_product(document, url):
    target = url.rstrip('/')
    product = None
    category = ''
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', document, re.S):
        try:
            # Some genuine pages include literal line breaks in description
            # strings. Accept those characters without altering product facts.
            data = json.loads(block, strict=False)
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        entity = data.get('mainEntity', data)
        if not isinstance(entity, dict) or entity.get('@type') != 'Product':
            continue
        ref = entity.get('@id') or entity.get('mainEntityOfPage', {}).get('@id') or entity.get('offers', {}).get('url', '')
        if ref.rstrip('/') != target:
            continue
        product = entity
        crumbs = data.get('breadcrumb', {}).get('itemListElement', [])
        category = ' / '.join(html.unescape(c['name']) for c in crumbs[1:-1])
        break
    if product is None:
        raise ValueError('No exact product JSON-LD for requested URL')
    match = re.search(r'LS\.variants\s*=\s*', document)
    variants = json.JSONDecoder().raw_decode(document[match.end():])[0] if match else []
    if not isinstance(variants, list) or not variants:
        raise ValueError('Variant list unavailable; cannot prove complete product')
    result = []
    brand = product.get('brand', {})
    for variant in variants:
        options = [str(variant[key]) for key in ('option0', 'option1', 'option2') if variant.get(key)]
        image_url = variant.get('image_url', '')
        if image_url.startswith('//'):
            image_url = 'https:' + image_url
        if not image_url and len(variants) == 1:
            image_url = product.get('image', '')
        result.append({'code': str(variant.get('sku') or '').strip(),
                       'name': html.unescape(product['name']) + (' · ' + ' · '.join(options) if options else ''),
                       'brand': html.unescape(brand.get('name', '') if isinstance(brand, dict) else str(brand)),
                       'category': category, 'source_ref': url, 'source_id': str(variant['id']),
                       'image_url': image_url, 'image_label': ''})
    return result


def run(root, workers=8):
    root.mkdir(parents=True, exist_ok=True)
    raw, _ = Snapshot(root / 'sitemap').get('https://www.farmamix.com.ar/sitemap.xml')
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    urls = sorted({node.text for node in ET.fromstring(raw).findall('s:url/s:loc', ns)
                   if urlsplit(node.text).hostname == 'www.farmamix.com.ar'
                   and re.fullmatch(r'/productos/[^/]+/?', urlsplit(node.text).path)})
    journal = root / 'records.jsonl'
    records = {}
    if journal.exists():
        for line in journal.read_text(encoding='utf-8').splitlines():
            try:
                record = json.loads(line)
                records[record['url']] = record
            except ValueError:
                raise ValueError('Incomplete journal line; preserve and repair before resuming')
    pending = [url for url in urls if url not in records or records[url].get('error')]
    client = httpx.Client(timeout=40, follow_redirects=True, limits=httpx.Limits(max_connections=workers),
                         headers={'User-Agent': 'CatalogoJuncos/1.0 (public catalogue reference)'})

    def fetch(url):
        record = {'url': url, 'downloaded_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        try:
            time.sleep(.35)
            with client.stream('GET', url) as response:
                response.raise_for_status()
                final_url = str(response.url)
                record['final_url'] = final_url
                if response.history and urlsplit(final_url).hostname == 'www.farmamix.com.ar' and not re.fullmatch(r'/productos/[^/]+/?', urlsplit(final_url).path):
                    record.update(unavailable_reason='redirects_to_non_product_page', variants=[],
                                  redirects=[{'status': step.status_code, 'location': step.headers.get('location')} for step in response.history])
                    return record
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > 30_000_000:
                        raise ValueError('Product document exceeds size limit')
                    chunks.append(chunk)
                body = b''.join(chunks)
            record.update(sha256=hashlib.sha256(body).hexdigest(), variants=parse_product(body.decode('utf-8'), final_url))
        except Exception as error:
            record['error'] = type(error).__name__ + ': ' + str(error)
        return record

    def checkpoint():
        current = [records[url] for url in urls if url in records]
        save(root / 'catalogue.json', [dict(row, source_observed_at=record.get('downloaded_at', ''))
                                      for record in current for row in record.get('variants', [])])
        save(root / 'coverage.json', {'sitemap_urls': len(urls), 'attempted': len(current),
             'products': sum(bool(r.get('variants')) for r in current),
             'unavailable_sitemap_urls': [{'url': r['url'], 'reason': r['unavailable_reason'], 'final_url': r['final_url']} for r in current if r.get('unavailable_reason')],
             'unresolved_sitemap_urls': [u for u in urls if u not in records or records[u].get('error')],
             'failed_requests': [{'url': r['url'], 'error': r['error']} for r in current if r.get('error')]})

    with journal.open('a', encoding='utf-8') as stream, ThreadPoolExecutor(max_workers=workers) as executor:
        for index, record in enumerate(executor.map(fetch, pending), 1):
            records[record['url']] = record
            stream.write(json.dumps(record, ensure_ascii=False) + '\n')
            stream.flush()
            if index % 100 == 0:
                checkpoint()
                print('farmamix', len(records), '/', len(urls), flush=True)
    checkpoint()
    client.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.output / 'farmamix')
