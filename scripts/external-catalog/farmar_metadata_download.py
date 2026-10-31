"""Refresh missing public Farmar facts. Resume one journal; stop on rate limits."""
import argparse
import hashlib
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import httpx
from bs4 import BeautifulSoup
from retail_metadata import clean


def capture(url, expected_id, expected_code, client):
    response = client.get(url)
    if response.status_code == 429:
        return {'status': 'rate_limited', 'http_status': 429}
    if response.status_code != 200:
        return {'status': 'unavailable', 'http_status': response.status_code}
    soup = BeautifulSoup(response.text, 'html.parser')
    tag = soup.find(id='__NEXT_DATA__')
    product = (json.loads(tag.string).get('props', {}).get('pageProps', {}).get('product') or {}) if tag else {}
    if str(product.get('productId')) != str(expected_id) or str(product.get('barcode','')).zfill(14) != str(expected_code).zfill(14):
        return {'status': 'identity_mismatch', 'http_status': 200}
    paths = []
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.get_text())
            if data.get('@type') == 'BreadcrumbList':
                path = [clean(item.get('name')) for item in data.get('itemListElement', [])[1:-1]]
                path = [part for part in path if part.lower() not in ('inicio', 'productos', 'categorías', 'categorias')]
                if path: paths.append(path)
        except (ValueError, AttributeError):
            continue
    return {'status': 'ok', 'http_status': 200, 'brand': clean(product.get('brandDescription')), 'category_paths': paths, 'sha256': hashlib.sha256(response.content).hexdigest()}


def run(root, inventory):
    out = root / 'farmar' / 'metadata.jsonl'
    done = {json.loads(line)['source_id'] for line in out.read_text(encoding='utf-8').splitlines()} if out.exists() else set()
    rows = [json.loads(line) for line in inventory.read_text(encoding='utf-8').splitlines()]
    rows = [row for row in rows if row['source'] == 'public_farmar' and row['status'] == 'candidate' and (not row.get('brand') or not row.get('category')) and row['source_id'] not in done]
    stop = threading.Event()
    with httpx.Client(timeout=30, follow_redirects=True) as client, out.open('a',encoding='utf-8') as stream:
        def download(row):
            if stop.is_set(): return None
            time.sleep(.35)
            try:
                facts = capture(row['source_ref'], row['source_id'], row['code'], client)
            except Exception as error:
                facts = {'status':'error','error':type(error).__name__}
            if facts['status']=='rate_limited': stop.set()
            return {**facts,'source_id':row['source_id'],'code':row['code'],'source_ref':row['source_ref']}
        with ThreadPoolExecutor(max_workers=3) as pool:
            for index, row in enumerate(pool.map(download, rows), 1):
                if row is not None:
                    stream.write(json.dumps(row,ensure_ascii=False)+'\n');stream.flush()
                if index % 100 == 0: print('Farmar metadata',index,'/',len(rows),flush=True)
    print('Finished; journal',out,flush=True)


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--sources',type=Path,required=True);parser.add_argument('--inventory',type=Path,required=True)
    args=parser.parse_args();run(args.sources,args.inventory)
