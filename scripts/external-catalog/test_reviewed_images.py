import unittest
from reviewed_images import reviewed_image, REVIEWS


class ReviewedImagesTest(unittest.TestCase):
    def test_only_exact_reviewed_source_sku_code_url_and_label(self):
        key, review = next(iter(REVIEWS.items()))
        row = dict(zip(('source', 'source_id', 'code'), key), image_url=review['url'])
        for field, value in [('source', 'public_farmaplus'), ('source_id', 'other'), ('code', '4005808944385'), ('image_url', review['url'] + 'changed')]:
            changed = dict(row, **{field: value})
            self.assertFalse(reviewed_image(changed, review['label']))
        self.assertFalse(reviewed_image(dict(row), 'another-photo.jpg'))
        self.assertTrue(reviewed_image(row, review['label']))
        self.assertEqual(row['code'], '4005808516674')
        self.assertIn('original_reason', row['image_review'])


if __name__ == '__main__':
    unittest.main()
