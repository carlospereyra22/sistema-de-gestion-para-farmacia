import re
import unicodedata

def text(value):
    return str(value if value is not None else "").strip()

def normalized(value):
    value = text(value)
    # Repair reversible UTF-8 mojibake only for matching; source text is retained.
    for _ in range(2):
        if not any(marker in value for marker in ("Ã", "Â", "â€")): break
        repaired = None
        for encoding in ("latin1", "cp1252"):
            try:
                repaired = value.encode(encoding).decode("utf-8")
                break
            except (UnicodeError, ValueError):
                pass
        if repaired is None: break
        value = repaired
    return "".join(c for c in unicodedata.normalize("NFD", value.lower()) if not unicodedata.combining(c))

def gtin_error(value):
    if not value:
        return "missing_barcode"
    if not re.fullmatch(r"(?:[0-9]{8}|[0-9]{12,14})", value) or set(value) == {"0"}:
        return "invalid_format"
    total = sum(int(c) * (3 if i % 2 == 0 else 1) for i, c in enumerate(value[-2::-1]))
    if (10 - total % 10) % 10 != int(value[-1]):
        return "invalid_check_digit"
    # Restricted circulation numbers are not global product identifiers.
    ean = value.zfill(14)
    if ean.startswith("02") or ean.startswith("002"):
        return "restricted_circulation"
    return None

EXCLUDED = re.compile(r"\b(ibuprofeno|paracetamol|aspirina|amoxicilina|diclofenac|omeprazol|loratadina|medicamento|comprimidos|capsulas|jarabe|antibiotico|antimicotico|minoxidil|ketoconazol|hidrocortisona|povidona|clorhexidina|suplemento|vitaminas|analgesico)\b")
HOUSEHOLD = re.compile(r"\b(lavandina|lavavajilla|ropa|lavarropas|vajilla|pisos|ambiente|ambiental|ambientes|textil|inodoro|insecticida|mascotas|perros|gatos|detergente|harina|fideos|arroz|galletitas)\b")
EXTRA_EXCLUDED = re.compile(r"\b(almohadon|almohadones|campera|remera|pantalon|micropanal|ambientador|panel|estaca|sintetico|polipapel|residuo|residuos|multiuso|panopet|washpet)\b|\bmanta\b(?!.*termica)|\bbolsa\b.*\balgodon\b|\bnew car\b|\bcan ice\b|\bdulce\b.*\bleche\b")
GROUPS = [
    ("Coloración y tinturas", r"tinturas?|coloracion|decolorante|oxidante|tonalizante|koleston|nutrisse"),
    ("Cabello", r"shampoos?|shampus?|champus?|acondicionador(?:es)?|enjuague capilar|crema de enjuague|capilar(?:es)?|para peinar|antifrizz|anticaspa|hair|conditioner"),
    ("Higiene bucal", r"dental(?:es)?|dentifric[oa]s?|bucal(?:es)?|protesis dentales|tooth|mouthwash"),
    ("Higiene femenina", r"femenin[oa]s?|protect(?:or|ores|\.).*diari\w*|tampon(?:es)?|toalla.*higien\w*|menstrual|higiene maternal"),
    ("Bebés e incontinencia", r"panal(?:es)?|toall\w*.*humed\w*|chupetes?|mamaderas?|cuidado infantil|incontinencia"),
    ("Desodorantes", r"desodorantes?|antitranspirantes?|deodorant"),
    ("Cosmética y piel", r"crema (corporal|facial|de manos)|cuidado (corporal|personal|de la piel)|locion|solar(?:es)?|bronceador|maquillaje|labial(?:es)?|mascara.*pestan\w*|esmaltes?|manicura|unas|quitaesmalte|depil\w*|afeit\w*|facial|micelar|skin|cosmetic\w*|sunscreen"),
    ("Higiene personal", r"jabon(?:es)?|higiene.*corporal|gel de ducha|talco|esponja de bano|soap|shower"),
    ("Perfumería", r"perfumes?|colonias?|fragancias?|eau de"),
    ("Ortopedia e insumos", r"ortopedia|equipos de salud|alcohol.*(etilico|higiene|gel)|algodon|gasas?|vendas?|apositos?|curitas|termometros?|tensiometros?|nebulizador(?:es)?|barbijos?|preservativos?|higiene sexual|muletas?|rodilleras?|tobilleras?|faja lumbar"),
]
GROUPS = [(category, re.compile(r"\b(?:" + pattern + r")\b")) for category, pattern in GROUPS]

def classify(name, category=""):
    value = normalized(name + " " + category)
    if EXCLUDED.search(value):
        return None, "medicinal_or_ambiguous"
    if HOUSEHOLD.search(value) or EXTRA_EXCLUDED.search(value):
        return None, "outside_scope"
    for group, pattern in GROUPS:
        if pattern.search(value):
            return group, None
    return None, "unclassified_review"
