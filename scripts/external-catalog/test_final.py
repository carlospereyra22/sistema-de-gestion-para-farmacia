import unittest
from directory_rules import classify_product


class FinalAuditRulesTest(unittest.TestCase):
    def test_observed_personal_abbreviations(self):
        for name, brand in [
            ("BARRO VEGETAL ALGABO X200", "ALGABO"),
            ("BARRO NATURAL ALGABO X200GRS", "ALGABO"),
            ("JB LIQ C/VALV FLORAL RAIN", "ALGABO"),
            ("BIBERON 250 ML TOMASOLITO T2", "BABELITO"),
            ("VAITA MAM OPP BA 330ML", "VAITA"),
            ("PROTECTORES MAMARIOS DONCELLA 24un", "LENTERDIT S.A."),
            ("CERA DEPIMIEL NATURAL P/MICRONDAS 200gr.", "DEPIMIEL"),
            ("KIT COLOR CASTAÑO OSCU 3", "317"),
            ("maquina desechable BIC comfort 3 4u", "BIC"),
            ("TOAL TENA DISCREET NIGHT", "TENA"),
            ("QUITAESMALTES FORTALECEDOR CARREFOUR SOFT X 100 CC", "CARREFOUR SOFT"),
        ]:
            self.assertEqual(classify_product(name, brand)[0], "candidate", name)

    def test_environmental_abbreviations_are_not_personal(self):
        for name in ["DESOD.AMB.GLADE AUTOM.REP.LAVAN/VAI", "DESOD.GLADE X380CM ALGODON", "PERFUME REVIGAL MARINE X 100 CC", "tabletas FUYI repelente mosquitos 12un", "DESOD.LYSOL X360ML PUREZA DE ALGODON", "alcohol boricado FARMACITY 100 ML"]:
            self.assertEqual(classify_product(name)[0], "discard", name)
        self.assertEqual(classify_product("repelente insectos FUYI aero 170ml")[0], "candidate")
        self.assertEqual(classify_product("MANOPLA DE BAÑO INFANTIL PATO BASICCARE")[0], "candidate")

    def test_brand_does_not_approve_unspecified_products(self):
        for name, brand in [("MINERAL 89", "VICHY"), ("YARA ELIXIR", "LATTAFA"), ("DISCOS PACK 20%", "ALGABO")]:
            self.assertEqual(classify_product(name, brand)[0], "review")
        for name, brand in [("MARCADOR PERMANENTE", "BIC"), ("PINTURA COLOR NEGRO", "317"), ("AROMATIZANTE DE TELAS", "ALGABO"), ("LIMA PARA METALES", "FERRETERIA")]:
            self.assertNotEqual(classify_product(name, brand)[0], "candidate")


if __name__ == "__main__":
    unittest.main()
