import unittest
from rules import gtin_error, classify

class RulesTest(unittest.TestCase):
    def test_actual_attached_code(self):
        self.assertIsNone(gtin_error("7500435211895"))
        self.assertIsNone(gtin_error("07500435211895"))
    def test_invalid(self):
        for code in ["", "00000000", "7500435211894", "7.500435211895e12", "７５００４３５２１１８９５", "2000000000008"]:
            self.assertIsNotNone(gtin_error(code), code)
    def test_scope(self):
        self.assertEqual(classify("Pantene Shampoo 750 ml")[0], "Cabello")
        for name in ["Desodorante de ambientes", "Jabon para ropa", "Shampoo ketoconazol", "Ibuprofeno comprimidos", "Fideos", "Sin descripcion", "ACEITUNAS VERDES", "DULCE COLONIAL", "ALMOHADON DE ALGODON", "ESMALTE SINTETICO", "HG CAMPERA BEBE"]:
            self.assertIsNotNone(classify(name)[1], name)

if __name__ == "__main__": unittest.main()
