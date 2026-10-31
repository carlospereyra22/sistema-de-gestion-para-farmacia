import json
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import httpx
from farmamix_download import parse_product, run
from retail_prepare import variants
from rules import gtin_error
from retail_images import download_url


class SourceParsingTests(unittest.TestCase):
    def test_vtex_photo_size_preserves_asset_id_and_source_host(self):
        url = 'https://pedidosfarma.vtexassets.com/arquivos/ids/123456/name.jpg?v=2'
        self.assertEqual(download_url(url), 'https://pedidosfarma.vtexassets.com/arquivos/ids/123456-800-800/name.jpg?v=2')
        unrelated = 'https://example.test/arquivos/ids/123456/name.jpg'
        self.assertEqual(download_url(unrelated), unrelated)

    def document(self, variants, related=False):
        target = 'https://www.farmamix.com.ar/productos/example/'
        data = {'@type': 'WebPage', 'mainEntity': {'@type': 'Product', '@id': target,
                'name': 'Body &amp; Hair Mist 250 ml', 'brand': {'name': 'Go To Be'}, 'image': 'https://example.test/main.jpg'},
                'breadcrumb': {'itemListElement': [{'name': 'Inicio'}, {'name': 'Perfumes'}, {'name': 'Mist'}]}}
        wrong = {'@type': 'Product', '@id': target + 'related', 'name': 'Wrong', 'sku': '12345670'}
        text = '<script type="application/ld+json">' + json.dumps(wrong if related else data) + '</script>'
        if related:
            text += '<script type="application/ld+json">' + json.dumps(data) + '</script>'
        return text + 'LS.variants = ' + json.dumps(variants) + ';', target

    def test_exact_main_product_and_all_variants(self):
        document, url = self.document([
            {'id': 1, 'sku': '7791274201875', 'option0': 'Azul', 'image_url': '//acdn-us.mitiendanube.com/one.jpg'},
            {'id': 2, 'sku': 'INTERNAL-22', 'option0': 'Rojo'},
        ], related=True)
        rows = parse_product(document, url)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['name'], 'Body & Hair Mist 250 ml · Azul')
        self.assertEqual(rows[0]['category'], 'Perfumes')
        self.assertTrue(rows[0]['image_url'].startswith('https://'))
        self.assertEqual(rows[1]['image_url'], '')
        self.assertIsNotNone(gtin_error(rows[1]['code']))

    def test_missing_variant_list_fails_instead_of_claiming_complete(self):
        document, url = self.document([])
        with self.assertRaises(ValueError):
            parse_product(document, url)

    def test_related_product_cannot_replace_requested_page(self):
        document, _ = self.document([{'id': 1, 'sku': '7791274201875'}])
        with self.assertRaises(ValueError):
            parse_product(document, 'https://www.farmamix.com.ar/productos/other/')

    def test_literal_linebreak_in_source_json_description(self):
        document, url = self.document([{'id': 1, 'sku': '7791274201875'}])
        document = document.replace('"brand":', '"description": "First line\nSecond line", "brand":')
        self.assertEqual(parse_product(document, url)[0]['code'], '7791274201875')

    def test_retired_sitemap_url_is_accounted_for_without_invented_product(self):
        document, url = self.document([{'id': 1, 'sku': '7791274201875'}])
        gone = 'https://www.farmamix.com.ar/productos/gone/'
        sitemap = ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                   f'<url><loc>{url}</loc></url><url><loc>{gone}</loc></url></urlset>').encode()
        requests = []
        def handler(request):
            requests.append(str(request.url))
            if str(request.url) == gone:
                return httpx.Response(301, headers={'location': '/'})
            return httpx.Response(200, text=document if str(request.url) == url else '<html>Home</html>')
        real_client = httpx.Client
        def client(**kwargs):
            return real_client(transport=httpx.MockTransport(handler), **kwargs)
        with tempfile.TemporaryDirectory() as directory, patch('farmamix_download.Snapshot.get', return_value=(sitemap, {})), patch('farmamix_download.httpx.Client', side_effect=client):
            root = Path(directory)
            run(root, workers=1)
            coverage = json.loads((root / 'coverage.json').read_text())
            self.assertEqual(coverage['products'], 1)
            self.assertEqual(coverage['attempted'], 2)
            self.assertEqual(coverage['unresolved_sitemap_urls'], [])
            self.assertEqual(coverage['unavailable_sitemap_urls'][0]['url'], gone)
            before = len(requests)
            run(root, workers=1)
            self.assertEqual(len(requests), before)

    def test_farmaplus_uses_ean_not_internal_sku(self):
        product = {'productId': '24681', 'productName': 'Issue Shampoo 190 ml', 'brand': 'Issue',
                   'link': 'https://www.farmaplus.com.ar/example/p', 'categories': ['/Cabello/'],
                   'items': [{'itemId': '24681', 'ean': '7793008021193', 'images': []}]}
        row = next(variants('farmaplus', [product]))
        self.assertEqual(row['code'], '7793008021193')
        self.assertIsNone(gtin_error(row['code']))

    def test_single_variant_does_not_repeat_full_vtex_titles(self):
        product = {'productId': '1', 'productName': 'Shampoo Matizador Violeta Issue 190 ml',
                   'link': 'https://www.farmaplus.com.ar/example/p', 'brand': None,
                   'items': [{'itemId': '2', 'ean': '7793008021193',
                              'name': 'Shampoo Issue Matizador Violeta 190 ml',
                              'nameComplete': 'Shampoo Matizador Violeta Issue 190 ml Shampoo Issue Matizador Violeta 190 ml',
                              'images': [{'imageUrl': 'https://example.test/image.jpg', 'imageText': None}]}]}
        row = next(variants('farmaplus', [product]))
        self.assertEqual(row['name'], product['productName'])
        self.assertEqual(row['brand'], '')
        self.assertEqual(row['image_label'], '')

    def test_variant_presentation_is_not_discarded(self):
        product = {'productId': '1', 'productName': 'Shampoo 190 ml',
                   'link': 'https://www.farmaplus.com.ar/example/p',
                   'items': [{'itemId': '2', 'ean': '7793008021193', 'name': 'Pack 380 ml',
                              'nameComplete': 'Shampoo Pack 380 ml', 'images': []}]}
        self.assertEqual(next(variants('farmaplus', [product]))['name'], 'Shampoo Pack 380 ml')


if __name__ == '__main__':
    unittest.main()
