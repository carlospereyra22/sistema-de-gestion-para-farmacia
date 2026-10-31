import unittest
from directory_rules import classify_product


class ThirdReviewTest(unittest.TestCase):
    def test_observed_typos_and_truncations(self):
        for name, brand in [("ACONDICIONAD. C/ROMERO Y MENTA", "OGX"), ("DENTIFR DOBLE FLUOR", "FRESH"), ("TINTU 5.0 CASTAÑ CLA", "BONTE"), ("EMULSION CORP HIDRANTANTE", "NATURAL HONEY"), ("DISCOS DEMAQUILLANTES", "DONCELLA"), ("MYB CORR SS 10 FAIR", "MAYBELLINE"), ("CRV FOAM CLANS 473ML", "CERAVE"), ("PANUELOS DESC FARMACITY CAJA", "FARMACITY")]:
            self.assertEqual(classify_product(name, brand)[0], "candidate", name)

    def test_shortening_requires_context(self):
        for name, brand in [("TH LIMPIEZA HOGAR MULTIUSO", "FTY"), ("TOALLA DETROIT 50x85cm", "ARCO IRIS"), ("BASE PARA TV", "SAMSUNG"), ("PINTURA CASTAÑO", "VENIER"), ("TALITAS CLASICAS", "DON SATUR"), ("ACONDICIONAD AIRE 3000W", "BGH"), ("ATUN CARACAS DESM.ACEITE/AGUA 170gr.", "CARACAS"), ("AGUA DESMINERALIZADA", "QUIMBAT"), ("MOLDE DESM 26CM CRE", "SIN MARCA")]:
            self.assertNotEqual(classify_product(name, brand)[0], "candidate", name)

    def test_infant_and_feminine_evidence(self):
        self.assertEqual(classify_product("TH FARMACITY BEBE CUIDADO DIARIO AVENA", "FARMACITY BEBE")[0], "candidate")
        self.assertEqual(classify_product("TOALLAS S.LIBRE NORMAL SUAVE X8")[0], "candidate")


if __name__ == "__main__":
    unittest.main()
