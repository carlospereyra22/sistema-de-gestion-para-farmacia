"""Fotos de medicamentos (SISTEMA-122)."""
import base64
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from medicine_images import con_foto_argentina, elegir

IBU = '7798420160383'


def ficha(source, url, code=IBU, status='discard', ref=''):
    return {'source': source, 'code': code, 'status': status, 'image_url': url, 'source_ref': ref, 'source_id': '1'}


class EligeFotoDeMedicamento(unittest.TestCase):
    def test_prefiere_farmalife_y_deja_las_otras_como_respaldo(self):
        elegidas = elegir([
            ficha('public_farmamix', 'https://mix/1.jpg'),
            ficha('public_farmalife', 'https://life/1.jpg'),
            ficha('public_farmaplus', 'https://plus/1.jpg'),
        ], set())
        self.assertEqual([f['source'] for f in elegidas['0' + IBU]],
                         ['public_farmalife', 'public_farmaplus', 'public_farmamix'])

    def test_no_usa_farmacorp(self):
        self.assertEqual(elegir([ficha('public_farmacorp', 'https://corp/1.jpg')], set()), {})

    def test_solo_fichas_descartadas_con_codigo_valido_y_foto(self):
        filas = [
            ficha('public_farmalife', 'https://life/1.jpg', status='candidate'),
            ficha('public_farmalife', 'https://life/2.jpg', status='invalid_code'),
            ficha('public_farmalife', '', status='discard'),
            ficha('public_farmalife', 'https://life/3.jpg', code='7798420160384'),
            ficha('public_farmalife', 'https://life/4.jpg', code='abc'),
        ]
        self.assertEqual(elegir(filas, set()), {})

    def test_saltea_codigos_que_ya_tienen_foto_argentina(self):
        ya = con_foto_argentina([{'gtin14': '0' + IBU, 'source': 'public_farmar'}])
        self.assertEqual(elegir([ficha('public_farmalife', 'https://life/1.jpg')], ya), {})

    def test_una_foto_de_farmacorp_en_la_proyeccion_no_cuenta(self):
        ya = con_foto_argentina([{'gtin14': '0' + IBU, 'source': 'public_farmacorp'}])
        self.assertIn('0' + IBU, elegir([ficha('public_farmalife', 'https://life/1.jpg')], ya))

    def test_la_misma_foto_no_se_intenta_dos_veces(self):
        elegidas = elegir([ficha('public_farmalife', 'https://x/1.jpg'), ficha('public_farmalife', 'https://x/1.jpg', ref='b')], set())
        self.assertEqual(len(elegidas['0' + IBU]), 1)


class InstalaSoloFotosValidas(unittest.TestCase):
    def filas(self, *filas):
        carpeta = Path(tempfile.mkdtemp())
        path = carpeta / 'medicine-images.jsonl'
        path.write_text(''.join(json.dumps(f) + '\n' for f in filas), encoding='utf-8')
        return path

    def foto(self, **cambios):
        raw = b'\xff\xd8foto\xff\xd9'
        fila = {'gtin14': '0' + IBU, 'source': 'public_farmalife', 'source_ref': 'https://life/p', 'url': 'https://life/1.jpg',
                'sha256': hashlib.sha256(raw).hexdigest(), 'data_url': 'data:image/jpeg;base64,' + base64.b64encode(raw).decode()}
        fila.update(cambios)
        return fila

    def test_acepta_una_foto_valida(self):
        try:
            from install import medicine_rows
        except ModuleNotFoundError:
            self.skipTest('install.py necesita psycopg')
        filas = medicine_rows(self.filas(self.foto()))
        self.assertEqual(filas[0]['foto'], b'\xff\xd8foto\xff\xd9')

    def test_rechaza_farmacorp_codigo_invalido_repetido_o_huella_distinta(self):
        try:
            from install import medicine_rows
        except ModuleNotFoundError:
            self.skipTest('install.py necesita psycopg')
        for filas in [
            [self.foto(source='public_farmacorp')],
            [self.foto(gtin14='07798420160384')],
            [self.foto(), self.foto()],
            [self.foto(sha256='0' * 64)],
        ]:
            with self.assertRaises(ValueError):
                medicine_rows(self.filas(*filas))


if __name__ == '__main__':
    unittest.main()
