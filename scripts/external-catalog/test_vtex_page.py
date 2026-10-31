import json
import unittest
from vtex_page import page_product


class VtexPageTests(unittest.TestCase):
    def test_exact_embedded_product_keeps_variant_ean_image_and_categories(self):
        state = {
            'Product:fixture': dict(productId='42', linkText='fixture', productName='Product', brand='Brand',
                                   categories={'type': 'json', 'json': ['/Cuidado Personal/Cabello/']},
                                   items=[{'type': 'id', 'id': 'sku'}]),
            'sku': dict(itemId='7', name='Product 30 cápsulas', ean='7798008191792', images=[{'type': 'id', 'id': 'photo'}]),
            'photo': dict(imageUrl='https://example.test/photo.jpg'),
        }
        document = '<template data-varname="__STATE__"><script>' + json.dumps(state) + '</script></template>'
        result = page_product(document, 'https://example.test/fixture/p')
        self.assertEqual(result['items'][0]['ean'], '7798008191792')
        self.assertEqual(result['items'][0]['images'][0]['imageUrl'], 'https://example.test/photo.jpg')
        self.assertEqual(result['categories'], ['/Cuidado Personal/Cabello/'])
        self.assertIsNone(page_product(document, 'https://example.test/different/p'))
        del state['sku']
        document = '<template data-varname="__STATE__"><script>' + json.dumps(state) + '</script></template>'
        with self.assertRaises(ValueError):
            page_product(document, 'https://example.test/fixture/p')
