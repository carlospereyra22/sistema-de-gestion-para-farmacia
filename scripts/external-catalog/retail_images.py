"""Cache one factual product photograph per canonical reference, for local preview.

No arbitrary URLs at lookup time. Original image URL/hash retained; no open licence
is implied. Images remain subject to source/rights-holder conditions.
"""
import argparse
import base64
import hashlib
import io
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Semaphore
from urllib.parse import urlsplit
from PIL import Image, ImageOps

HOSTS = {'farmalife.vteximg.com.br', 'farmalife.vtexassets.com', 'farmarstorage.blob.core.windows.net', 'cdn.shopify.com',
         'pedidosfarma.vtexassets.com', 'pedidosfarma.vteximg.com.br', 'acdn-us.mitiendanube.com'}
Image.MAX_IMAGE_PIXELS = 20_000_000


def permitted(url):
    parsed = urlsplit(url)
    return parsed.scheme == 'https' and parsed.hostname in HOSTS and not parsed.username and not parsed.password and parsed.port in (None, 443)


def download_url(url):
    parsed = urlsplit(url)
    if permitted(url) and parsed.hostname.endswith(('.vtexassets.com', '.vteximg.com.br')):
        path = re.sub(r'(/arquivos/ids/\d+)(?:-\d+-\d+)?(?=/|$)', r'\1-800-800', parsed.path)
        return parsed._replace(path=path).geturl()
    return url


def compress(raw):
    with Image.open(io.BytesIO(raw)) as image:
        if image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError('Image exceeds 20 million pixels')
        if image.format not in ('JPEG', 'PNG', 'WEBP', 'GIF'):
            raise ValueError('Unsupported image format')
        if image.format == 'GIF' and getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Animated product image requires review')
        image = ImageOps.exif_transpose(image)
        image.thumbnail((800, 800))
        if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
            rgba = image.convert('RGBA')
            image = Image.new('RGB', rgba.size, 'white')
            image.paste(rgba, mask=rgba.getchannel('A'))
        else:
            image = image.convert('RGB')
        for size in (800, 640, 480, 320):
            image.thumbnail((size, size))
            for quality in (85, 70, 55):
                out = io.BytesIO()
                image.save(out, format='JPEG', quality=quality, optimize=True)
                data = out.getvalue()
                if len(data) <= 60 * 1024:
                    return data
    raise ValueError('Cannot fit image within product image limit')


def select_image(record):
    if record['beauty']:
        return None
    chosen = record['payload']
    if chosen.get('image_url'):
        return chosen
    # Cross-source photo only when all evidence is compatible; do not erase warnings.
    if chosen.get('review_reason'):
        return None
    candidates = [r for r in record['evidence'] if r.get('image_url') and not r.get('image_review_reason')]
    return max(candidates, key=lambda r: (r['source'] in ('public_farmalife', 'public_farmar'), r['source'])) if candidates else None


def alternate_images(record, failed_url):
    if record['beauty'] or record['payload'].get('review_reason'):
        return []
    return [row for row in record['evidence'] if row.get('gtin14') == record['gtin14']
            and row['source'] != 'openbeauty' and row.get('image_url') and row['image_url'] != failed_url
            and not row.get('image_review_reason')]


def run(prepared, cache_dir=None):
    import httpx
    records = json.loads((prepared / 'canonical.json').read_text(encoding='utf-8'))
    cache = cache_dir or prepared / 'images'
    cache.mkdir(exist_ok=True)
    selected = [(r, select_image(r)) for r in records]
    selected = [(r, row) for r, row in selected if row]
    previous_report = prepared / 'image-report.json'
    previous_data = json.loads(previous_report.read_text(encoding='utf-8')) if previous_report.exists() else {}
    previous_failures = {row['url']: row for row in previous_data.get('failed_requests', []) + previous_data.get('failures', [])}
    host_limits = {host: Semaphore(4) for host in HOSTS}
    client = httpx.Client(timeout=25, limits=httpx.Limits(max_connections=12, max_keepalive_connections=12), headers={'User-Agent': 'CatalogoJuncos/1.0 (product photo reference)'})
    def download(pair):
        record, row = pair
        url = row['image_url']
        key = hashlib.sha256(url.encode()).hexdigest()
        path = cache / (key + '.json')
        try:
            if not permitted(url):
                raise ValueError('Image host outside allowlist')
            if path.exists():
                result = json.loads(path.read_text(encoding='utf-8'))
            else:
                prior = previous_failures.get(url)
                if prior and any(status in prior['error'] for status in ("'404 ", "'403 ", "'401 ", "'429 ")):
                    return dict(prior, gtin14=record['gtin14'])
                with host_limits[urlsplit(url).hostname]:
                    time.sleep(.3)
                    destination = download_url(url)
                    requested_url = destination
                    for redirect in range(4):
                        with client.stream('GET', destination) as response:
                            if response.is_redirect:
                                from urllib.parse import urljoin
                                destination = urljoin(destination, response.headers['location'])
                                if not permitted(destination):
                                    raise ValueError('Image redirect outside source allowlist')
                                continue
                            response.raise_for_status()
                            chunks = []
                            count = 0
                            for chunk in response.iter_bytes():
                                count += len(chunk)
                                if count > 10 * 1024 * 1024:
                                    raise ValueError('Image exceeds 10 MB')
                                chunks.append(chunk)
                            raw = b''.join(chunks)
                            break
                    else:
                        raise ValueError('Too many image redirects')
                if len(raw) > 10 * 1024 * 1024:
                    raise ValueError('Image exceeds 10 MB')
                image = compress(raw)
                result = {'data_url': 'data:image/jpeg;base64,' + base64.b64encode(image).decode(),
                          'original_sha256': hashlib.sha256(raw).hexdigest(), 'sha256': hashlib.sha256(image).hexdigest(),
                          'url': url, 'download_url': requested_url}
                path.write_text(json.dumps(result), encoding='utf-8')
            return dict(result, gtin14=record['gtin14'], canonical_fingerprint=record['payload']['fingerprint'],
                        source=row['source'], source_ref=row['source_ref'], source_fingerprint=row['fingerprint'],
                        license='SOURCE_IMAGE_NO_OPEN_LICENSE_GRANTED')
        except Exception as error:
            return {'gtin14': record['gtin14'], 'url': url, 'error': type(error).__name__ + ': ' + str(error)}
    def with_fallback(pair):
        record, row = pair
        result = download(pair)
        attempts = []
        tried = {row['image_url']}
        if 'error' in result:
            attempts.append(result)
            for alternative in alternate_images(record, row['image_url']):
                if alternative['image_url'] in tried:
                    continue
                tried.add(alternative['image_url'])
                result = download((record, alternative))
                if 'error' not in result:
                    break
                attempts.append(result)
        return result, attempts

    good, failed, failed_requests, recovered = [], [], [], []
    with ThreadPoolExecutor(max_workers=12) as executor:
        for index, (result, attempts) in enumerate(executor.map(with_fallback, selected), 1):
            (failed if 'error' in result else good).append(result)
            failed_requests.extend(attempts)
            if attempts and 'error' not in result:
                recovered.append({'gtin14': result['gtin14'], 'source': result['source'], 'url': result['url']})
            if index % 100 == 0:
                print('images', index, '/', len(selected), 'failed', len(failed), flush=True)
    client.close()
    with (prepared / 'images.jsonl').open('w', encoding='utf-8') as stream:
        for row in good:
            stream.write(json.dumps(row) + '\n')
    (prepared / 'image-report.json').write_text(json.dumps({'attempted': len(selected), 'downloaded': len(good), 'failures': failed,
                                                          'failed_requests': failed_requests, 'recovered_alternatives': recovered}, indent=2), encoding='utf-8')
    print('Images downloaded', len(good), 'failed', len(failed))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('prepared', type=Path)
    parser.add_argument('--cache', type=Path)
    args = parser.parse_args()
    run(args.prepared, args.cache)
