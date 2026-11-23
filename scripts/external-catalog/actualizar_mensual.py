"""Actualización mensual del catálogo externo (SISTEMA-113).

Descarga las 5 tiendas, prepara, baja fotos, audita e instala SÓLO si los
controles dan bien; si no, no toca la base y deja el motivo en el resumen.
Sólo suma: las fichas que una tienda ya no publica quedan como históricas
(retail_prepare --previous). Nunca toca la base comercial ni los aportes de las
farmacias (esquema aporte_farmacia).

Uso (desde la raíz del repo o desde el servidor):
  uv run --python 3.12 --with playwright --with httpx --with pillow --with openpyxl \
    --with "psycopg[binary]" python scripts/external-catalog/actualizar_mensual.py \
    --datos data/external-catalog [--fecha AAAAMMDD] [--sin-instalar]

En el servidor, CATALOGO_DATABASE_URL y CATALOGO_RESPALDOS indican la base y la
carpeta de respaldos (ver install.py). Una corrida cortada se retoma con la
misma --fecha: las descargas reutilizan lo ya bajado.
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
TIENDAS = ["farmalife", "farmaplus", "farmar", "farmamix", "farmacorp"]
# Una tienda que devuelve menos que esto respecto de la vez anterior se toma
# como sitio caído o cambiado: no se instala nada.
COBERTURA_MINIMA = 0.90
ESPERAS_429_MIN = [10, 20, 40]
BAJAS_MAXIMAS = 0.01
BAJAS_MAXIMAS_MINIMO = 50


class Detener(Exception):
    """Un control no pasó: no se instala y se informa el motivo."""


def ahora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def registrar(texto):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {texto}", flush=True)


def correr(argumentos, registro: Path):
    """Corre un paso con el mismo Python; la salida va a su registro."""
    registro.parent.mkdir(parents=True, exist_ok=True)
    with registro.open("a", encoding="utf-8") as salida:
        salida.write(f"\n== {ahora()} {' '.join(map(str, argumentos))}\n")
        salida.flush()
        resultado = subprocess.run([sys.executable, *map(str, argumentos)],
                                   cwd=AQUI, stdout=salida, stderr=subprocess.STDOUT)
    return resultado.returncode


def fue_429(registro: Path):
    try:
        cola = registro.read_text(encoding="utf-8", errors="replace")[-4000:]
    except FileNotFoundError:
        return False
    return "429" in cola and "Too Many Requests" in cola


def descargar(tienda, destino: Path, registros: Path):
    registro = registros / f"{tienda}.log"
    if tienda == "farmamix":
        argumentos = [AQUI / "farmamix_download.py", "--output", destino]
    else:
        argumentos = [AQUI / "retail_download.py", tienda, "--output", destino]
    for intento, espera in enumerate([0, *ESPERAS_429_MIN]):
        if espera:
            registrar(f"{tienda}: la tienda pidió bajar el ritmo; espero {espera} min y retomo.")
            time.sleep(espera * 60)
        if correr(argumentos, registro) == 0:
            return
        if not fue_429(registro):
            break
    raise Detener(f"No se pudo descargar {tienda}. Ver {registro}.")


def productos(cobertura: Path):
    try:
        datos = json.loads(cobertura.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    return datos.get("products")


def gtins(candidatos: Path):
    if not candidatos.exists():
        return set()
    with candidatos.open(encoding="utf-8") as archivo:
        return {json.loads(linea)["gtin14"] for linea in archivo if linea.strip()}


def controlar_cobertura(datos: Path, refresco: Path):
    detalle = {}
    for tienda in TIENDAS:
        antes = productos(datos / "sources" / tienda / "coverage.json")
        despues = productos(refresco / tienda / "coverage.json")
        detalle[tienda] = {"antes": antes, "ahora": despues}
        if not despues:
            raise Detener(f"{tienda}: la descarga no dejó cobertura.")
        if antes and despues < antes * COBERTURA_MINIMA:
            raise Detener(f"{tienda}: devolvió {despues} productos contra {antes} de la vez anterior.")
    return detalle


def usar_captura_anterior(anterior: Path, destino: Path):
    """Reemplaza una descarga incompleta por la captura vigente de esa tienda."""
    if destino.exists():
        shutil.rmtree(destino)
    shutil.copytree(anterior, destino)


def promover(origen: Path, destino: Path, anterior: Path):
    """Reemplaza destino por origen; conserva sólo la versión inmediata anterior."""
    if anterior.exists():
        shutil.rmtree(anterior)
    if destino.exists():
        destino.rename(anterior)
    shutil.copytree(origen, destino)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--datos", type=Path, required=True)
    parser.add_argument("--fecha", default=datetime.now().strftime("%Y%m%d"))
    parser.add_argument("--sin-instalar", action="store_true",
                        help="Prepara y audita, pero no toca la base")
    parser.add_argument("--usar-anterior", action="append", default=[], choices=TIENDAS,
                        help="No descarga esa tienda: usa su captura vigente")
    a = parser.parse_args()
    datos = a.datos.resolve()
    refresco = datos / "staging" / f"refresh-{a.fecha}"
    preparado = datos / "staging" / f"refresh-{a.fecha}-prepared"
    registros = refresco / "logs"
    resumen = {"fecha": a.fecha, "inicio": ahora(), "instalado": False}
    destino_resumen = datos / "resumenes" / f"{a.fecha}.json"
    destino_resumen.parent.mkdir(parents=True, exist_ok=True)
    try:
        resumen["captura_anterior"] = []
        for tienda in TIENDAS:
            try:
                if tienda in a.usar_anterior:
                    raise Detener(f"{tienda}: se pidió no descargarla.")
                registrar(f"Descargando {tienda}...")
                descargar(tienda, refresco, registros)
            except Detener as motivo:
                # Una tienda caída o que no deja descargar no frena a las demás:
                # sigue con su captura anterior y queda anotado.
                anterior = datos / "sources" / tienda
                if not (anterior / "coverage.json").exists():
                    raise
                registrar(f"{motivo} Se usa su captura anterior.")
                usar_captura_anterior(anterior, refresco / tienda)
                resumen["captura_anterior"].append(tienda)
        resumen["tiendas"] = controlar_cobertura(datos, refresco)

        registrar("Preparando las fichas...")
        anteriores = gtins(datos / "current" / "candidates.jsonl")
        preparar = [AQUI / "retail_prepare.py", "--retail", refresco,
                    "--baseline", datos / "baseline" / "candidates.jsonl",
                    "--output", preparado, "--full-retail-catalog"]
        if anteriores:
            preparar += ["--previous", datos / "current" / "candidates.jsonl"]
        if correr(preparar, registros / "preparar.log"):
            raise Detener("Falló la preparación.")
        registrar("Bajando fotos nuevas...")
        if correr([AQUI / "retail_images.py", preparado, "--cache", datos / "images"],
                  registros / "fotos.log"):
            raise Detener("Falló la descarga de fotos.")
        # Fotos de medicamentos (SISTEMA-122): una foto que no baja no frena nada.
        registrar("Bajando fotos de medicamentos...")
        if correr([AQUI / "medicine_images.py", preparado, "--cache", datos / "images"],
                  registros / "fotos-medicamentos.log"):
            raise Detener("Falló la descarga de fotos de medicamentos.")
        registrar("Auditando la cobertura...")
        if correr([AQUI / "coverage_audit.py", refresco, preparado], registros / "auditoria.log"):
            raise Detener("La auditoría de cobertura no cerró.")

        nuevos = gtins(preparado / "candidates.jsonl")
        faltan = anteriores - nuevos
        resumen["codigos"] = {"antes": len(anteriores), "ahora": len(nuevos),
                              "nuevos": len(nuevos - anteriores), "faltan": len(faltan)}
        resumen["codigos"]["ejemplos_que_faltan"] = sorted(faltan)[:50]
        # Sólo sumar: los que una tienda dejó de publicar siguen como históricos.
        # Pueden salir pocos con razón (una tienda lo pasó a medicamento); muchos
        # indican un problema y no se instala.
        if len(faltan) > max(BAJAS_MAXIMAS_MINIMO, len(anteriores) * BAJAS_MAXIMAS):
            raise Detener(f"Faltarían {len(faltan)} códigos que hoy están vigentes.")
        if a.sin_instalar:
            registrar("Preparado y auditado; no se instala (--sin-instalar).")
            return
        registrar("Instalando (con respaldo previo)...")
        if correr([AQUI / "install.py", preparado, "--manifest", preparado / "manifest.json"],
                  registros / "instalar.log"):
            raise Detener("Falló la instalación; la base quedó como estaba.")
        if correr([AQUI / "catalog_readiness.py", preparado], registros / "verificar.log"):
            raise Detener("Se instaló, pero la verificación posterior falló: revisar.")
        for tienda in TIENDAS:
            promover(refresco / tienda, datos / "sources" / tienda,
                     datos / "staging" / f"anterior-sources-{tienda}")
        promover(preparado, datos / "current", datos / "staging" / "anterior-current")
        resumen["instalado"] = True
        registrar(f"Listo: {resumen['codigos']['nuevos']} códigos nuevos.")
    except Detener as motivo:
        resumen["detenido"] = str(motivo)
        registrar(f"NO SE INSTALÓ: {motivo}")
        raise SystemExit(1)
    finally:
        resumen["fin"] = ahora()
        destino_resumen.write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")
        registrar(f"Resumen: {destino_resumen}")


if __name__ == "__main__":
    main()
