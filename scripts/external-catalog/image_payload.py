"""Attach only a cached photo tied to evidence for this exact canonical GTIN."""
import base64
import hashlib


def attach_image(record, image):
    if record['beauty'] or not image:
        return
    if image['gtin14'] != record['gtin14'] or image['canonical_fingerprint'] != record['payload']['fingerprint']:
        raise ValueError('Photo belongs to a different canonical record')
    matching = [row for row in record['evidence'] if row['source'] == image['source'] and row['fingerprint'] == image['source_fingerprint'] and row.get('image_url') == image['url']]
    if not matching:
        raise ValueError('Photo provenance missing from exact-code evidence')
    prefix = 'data:image/jpeg;base64,'
    if not image['data_url'].startswith(prefix):
        raise ValueError('Photo must be JPEG')
    raw = base64.b64decode(image['data_url'][len(prefix):], validate=True)
    if len(raw) > 60 * 1024 or not raw.startswith(b'\xff\xd8') or not raw.endswith(b'\xff\xd9') or hashlib.sha256(raw).hexdigest() != image['sha256']:
        raise ValueError('Invalid cached photograph')
    record['payload']['image'] = {key: image[key] for key in ['data_url', 'url', 'source', 'source_ref', 'license', 'sha256']}
