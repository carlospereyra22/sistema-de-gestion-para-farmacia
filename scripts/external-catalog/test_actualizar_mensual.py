import json
import tempfile
import unittest
from pathlib import Path

import actualizar_mensual as mensual


def cobertura(carpeta: Path, tienda: str, cantidad: int):
    destino = carpeta / tienda
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "coverage.json").write_text(json.dumps({"products": cantidad}), encoding="utf-8")


class ActualizacionMensualTest(unittest.TestCase):
    def test_acepta_tiendas_que_crecen_o_bajan_poco(self):
        with tempfile.TemporaryDirectory() as raiz:
            datos, refresco = Path(raiz) / "datos", Path(raiz) / "refresco"
            for tienda in mensual.TIENDAS:
                cobertura(datos / "sources", tienda, 1000)
                cobertura(refresco, tienda, 950 if tienda == "farmamix" else 1100)
            detalle = mensual.controlar_cobertura(datos, refresco)
            self.assertEqual(detalle["farmamix"], {"antes": 1000, "ahora": 950})

    def test_frena_si_una_tienda_devuelve_mucho_menos(self):
        with tempfile.TemporaryDirectory() as raiz:
            datos, refresco = Path(raiz) / "datos", Path(raiz) / "refresco"
            for tienda in mensual.TIENDAS:
                cobertura(datos / "sources", tienda, 1000)
                cobertura(refresco, tienda, 400 if tienda == "farmar" else 1000)
            with self.assertRaisesRegex(mensual.Detener, "farmar"):
                mensual.controlar_cobertura(datos, refresco)

    def test_frena_si_una_tienda_no_dejo_cobertura(self):
        with tempfile.TemporaryDirectory() as raiz:
            datos, refresco = Path(raiz) / "datos", Path(raiz) / "refresco"
            for tienda in mensual.TIENDAS[:-1]:
                cobertura(refresco, tienda, 10)
            with self.assertRaises(mensual.Detener):
                mensual.controlar_cobertura(datos, refresco)

    def test_lee_codigos_de_candidatos(self):
        with tempfile.TemporaryDirectory() as raiz:
            archivo = Path(raiz) / "candidates.jsonl"
            archivo.write_text('{"gtin14": "07790000000010"}\n\n{"gtin14": "07790000000027"}\n', encoding="utf-8")
            self.assertEqual(mensual.gtins(archivo), {"07790000000010", "07790000000027"})
            self.assertEqual(mensual.gtins(Path(raiz) / "no-existe.jsonl"), set())

    def test_promover_conserva_solo_la_version_anterior(self):
        with tempfile.TemporaryDirectory() as raiz:
            raiz = Path(raiz)
            for nombre, texto in [("nuevo", "3"), ("actual", "2"), ("anterior", "1")]:
                (raiz / nombre).mkdir()
                (raiz / nombre / "dato.txt").write_text(texto, encoding="utf-8")
            mensual.promover(raiz / "nuevo", raiz / "actual", raiz / "anterior")
            self.assertEqual((raiz / "actual" / "dato.txt").read_text(encoding="utf-8"), "3")
            self.assertEqual((raiz / "anterior" / "dato.txt").read_text(encoding="utf-8"), "2")
            self.assertTrue((raiz / "nuevo" / "dato.txt").exists())

    def test_una_tienda_caida_sigue_con_su_captura_anterior(self):
        with tempfile.TemporaryDirectory() as raiz:
            raiz = Path(raiz)
            cobertura(raiz / "sources", "farmacorp", 16534)
            (raiz / "refresco" / "farmacorp").mkdir(parents=True)
            (raiz / "refresco" / "farmacorp" / "a-medias.json").write_text("{}", encoding="utf-8")
            mensual.usar_captura_anterior(raiz / "sources" / "farmacorp", raiz / "refresco" / "farmacorp")
            self.assertEqual(mensual.productos(raiz / "refresco" / "farmacorp" / "coverage.json"), 16534)
            self.assertFalse((raiz / "refresco" / "farmacorp" / "a-medias.json").exists())

    def test_detecta_el_pedido_de_bajar_el_ritmo(self):
        with tempfile.TemporaryDirectory() as raiz:
            registro = Path(raiz) / "farmacorp.log"
            registro.write_text("urllib.error.HTTPError: HTTP Error 429: Too Many Requests\n", encoding="utf-8")
            self.assertTrue(mensual.fue_429(registro))
            registro.write_text("HTTP Error 500\n", encoding="utf-8")
            self.assertFalse(mensual.fue_429(registro))


if __name__ == "__main__":
    unittest.main()
