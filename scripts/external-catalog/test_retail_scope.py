import unittest

from retail_prepare import retail_scope


class RetailScopeTest(unittest.TestCase):
    def test_feminine_fragrance_is_not_intimate_hygiene(self):
        status, group, subcategory, reason = retail_scope(
            'Benetton Colors Unlimited For Her Edt 80Ml',
            'BENETTON',
            '/Fragancias/Semiselectivas/Femeninas/',
            full_catalog=True,
        )
        self.assertEqual((status, group, subcategory, reason),
                         ('candidate', 'Perfumería', 'Fragancias', ''))


if __name__ == '__main__':
    unittest.main()
