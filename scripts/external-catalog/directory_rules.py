"""Extended, conservative pharmacy scope. Categories are inferred, source text is intact."""
import re
from functools import lru_cache
from rules import normalized, classify as previous_classify
from coverage_rules import extra_classification, skin_context
from third_rules import third_classification
from final_rules import final_scope_issue, final_classification, final_needs_review
from recovery_rules import recovery_classification

MEDICINE = re.compile(r"\b(ibuprofeno|paracetamol|aspirina|amoxicilina|diclofenac|omeprazol|loratadina|medicamentos?|comprimidos?|capsulas?|jarabes?|antibioticos?|antimicoticos?|minoxidil|ketoconazol|hidrocortisona|povidona|clorhexidina|analgesicos?|antiparasitarios?|permetrina)\b")
HOUSEHOLD = re.compile(r"\b(lavandina|detergentes?|lavavajillas?|lavarropas|vajilla|pisos|ambientes?|ambientador|textil|inodoro|insecticida|mascotas?|perros?|gatos?|panopet|washpet|campera|remera|pantalon|micropanal|almohadon|sintetico|panel|estaca|residuos?|multiuso|polipapel)\b|\bnew car\b|\bcan ice\b|\bjabon\b.*\b(ropa|lavar)\b|\bbolsa\b.*\balgodon\b|\bmanta\b(?!.*termica)")
FOOD = re.compile(r"\b(fideos|arroz|harina|galletitas?|galletas?|aceitunas?|yerba|cafe|gaseosa|vino|cerveza|queso|yogur|hamburguesa|carne|dulce de leche|crema de leche|manteca|mermelada|helado)\b|\baceite\b.*\b(girasol|cocina|comestible|oliva)\b")
KNOWN_PHARMACY = re.compile(r"\b(pantene|sedal|elvive|tresemme|biferdil|capilatis|koleston|nutrisse|issue|huggies|pampers|babysec|nosotras|always|kotex|colgate|sensodyne|oral.?b|corega|neutrogena|cetaphil|isdin|dermaglos|bagovit|gillette|tulipan|nutrilon|ensure|pediasure)\b")
NON_PERSONAL = re.compile(r"\b(aire\s+acond\w*|hidrolavadora\w*|siliconado|automotor\w*|automovil\w*|autos?|carroceria|tapizado\w*|pets|pet['’]s|pulguicida|pulgicida|can\s+cat|phiphipets|dish\s+daddy|scotch\s+brite|lamp\w*|linternas?|luces|luminaria\w*|reflector\w*|guirnaldas?|faroles?|mops?|mopa\w*|mantel\w*|acol|acolchado\w*|sabanas?|cortinas?|repasadores?|trapos?|rejillas?|baldes?|escob\w*|prelavado|quitamanchas|suavizante\w*|lav\s+matic|lavado\s+(automatico|a\s+mano)|papel\s+higienico|saphirus|sahumerio\w*|difusor\w*)\b|\bjabon\s+en\s+polvo\b|\b(tableta\s+choco|chocolate\s+dark)\b")
COSMETIC_CONTEXT = re.compile(r"\b(tintura\w*|coloracion|nutrisse|koleston|labial\w*|shampoo|champu|acondicionador\w*|jabon|exfoliante|gel\s+de\s+ducha|mascarilla\w*)\b")
HOUSEHOLD_DETAILS = re.compile(r"\b(kaftan|calzas?|boxer|vedetina|culotte|zoquetes?|micromedia|panera|canasta|camison|camiseta|aromati|poett|ariel|granby|skip|camellito|limzul|saphirus|odorizante|desodor.*automotor)\b|\bmedia\w*\s+(?:crew\s+)?algodon\b|\bpie\s+de\s+cama\b|\b(guante|gte)\w*\s+.*algodon\b|\bjab(?:on)?\b.*\b(polvo|polv|lavado|lav\.?\s*mat|rop\.?\s*fina)\b|\b(limpiador|limp\.liq|perf\s+fraganza|rollo\s+de\s+cocina|algodon\s+de\s+azucar)\b")
NON_HEALTH = re.compile(r"\b(reposteria|cucarach\w*|hormig\w*|blattanex|hormix|raid|pared|grietas|pintor|cocina|potaxan|wo(o)?lite|zorro|ecovita|gran\s+federal|mr\.?\s*musculo|matic|pvo|quitamancha\w*)\b")
SOAP_PERSONAL = re.compile(r"\b(tocador|toc|toque|toilet|manos?|corporal|corp|cuerpo|piel|bebe|baby|kids|facial|intimo|intima|antibact\w*|antibac|skin\w*|glicerina|humect\w*|hidrat\w*|palmolive|palmo|protex|dove|lux|rexona|algabo|plusbe\w*|norma\s+maliandi|veritas|espadol|soul\s+care|soul\s+baby|johnson\w*|huggies|neutrogena|asepxia|estilo\s+spa|st\.?\s*tropez|sents|cupido|evagina|lomecan|next\s+ab)\b")
NON_COSMETIC = re.compile(r"\b(termotanque\w*|sistema\s+solar|arbol\s+luz|cadena\s+solar|luz\s+solar|farol|sandalia\w*|bombacha\w*|short\w*|conjunto\s+agua|pintura\w*|venier|antioxido|sint\s*tico|salva\s+unas|perfume.*telas?|aromatizador\w*|aromatizante\w*)\b|^lb\s")
SPECS = [
    ("Nutrición infantil y especializada", "Fórmulas y nutrición", r"\b(form(?:ula|ulas)?\.?\s*infantil|formula\s+(de\s+)?(inicio|continuacion|crecimiento)|leche\s+(de\s+)?(inicio|continuacion|crecimiento|etapa)|nutrilon|nidina|nan\s+(optipro|supreme|expert|[1234])|enfamil|sancor\s*bebe|nido\s*(?:1\+|3\+)|pediasure|ensure|papillas?|cereal(?:es)?\s+infantil|nutribaby|nutricia)\b"),
    ("Cabello", "Champús", r"\b(sh|shamp|shampoo|shampu|champu|shampoos|champus)\b"),
    ("Cabello", "Acondicionadores", r"\b(acond|acondic|acondicionador(?:es)?|conditioner|crema\s+(?:de\s+)?enjuague)\b"),
    ("Cabello", "Tratamientos y peinado", r"\b(capilar(?:es)?|cabello|pelo|antifrizz|anticaspa|peinar|peinados?|rulos|fijador|laca capilar|hair|bano\s+de\s+crema|protector\s+termico)\b"),
    ("Tinturas y coloración", "Coloración y oxidantes", r"\b(tinturas?|tint\.?\s*cap|colorac|coloracion|decolorantes?|oxidantes?|tonalizantes?|matizador(?:es)?|retocador(?:es)?\s+(?:de\s+)?raices|koleston|nutrisse|excellence|casting\s+creme)\b"),
    ("Higiene bucal", "Pastas dentales", r"\b(past(?:a|as)?\.?\s*dent|pasta(?:s)?\s+dental(?:es)?|crema\s+dental|dentifric[oa]s?)\b"),
    ("Higiene bucal", "Accesorios y cuidado bucal", r"\b(dental(?:es)?|bucal(?:es)?|interdental(?:es)?|protesis\s+dentales|toothpaste|mouthwash|hilo\s+dental|oral.?b|corega)\b"),
    ("Desodorantes", "Desodorantes y antitranspirantes", r"\b(desod|desodorantes?|antitransp|antitran|antitranspirantes?|roll[ -]?on|deodorant)\b"),
    ("Higiene femenina", "Protección e higiene íntima", r"\b(toall\.?\s*fem|femenin[oa]s?|tampon(?:es)?|menstrual(?:es)?|prote?c?t?\.?\s*diario?s?|protectores\s+diarios|protector\s+diario|toalla.*higienica|higiene\s+intima|intimo|intima)\b"),
    ("Adultos e incontinencia", "Protección absorbente", r"\b(incontinencia|panal(?:es)?.*adult|ropa\s+interior\s+absorbente|protector(?:es)?\s+(?:de\s+)?cama|protector(?:es)?\s+anatomic[oa]s?)\b"),
    ("Bebés y maternidad", "Pañales y cuidado infantil", r"\b(panal(?:es)?|toall(?:a|as|itas)?\.?\s*hum(?:edas)?|toallitas\s+humedas|paspaduras?|chupetes?|tetinas?|mamaderas?|mordillos?|sacaleche|lactancia|oleo\s+calcareo|cuidado\s+infantil)\b"),
    ("Protección solar", "Protectores y postsolares", r"\b(protect(?:or|ores)?\.?\s*solar(?:es)?|prot\.?\s*sol|fps\s*\d+|spf\s*\d+|postsolar(?:es)?|post\s+solar|bronceador(?:es)?|autobronceante|sunscreen|solar)\b"),
    ("Dermocosmética", "Cuidado de la piel", r"\b(crema\s+(corporal|facial|manos|pies|de\s+manos)|cuidado\s+(corporal|personal|de\s+la\s+piel)|locion|facial(?:es)?|micelar|tonico\s+facial|serum|serums|balsamo\s+labial|exfoliante|hidratante|humectante|skin|antiarrugas|antiedad|dermocosmetica)\b"),
    ("Higiene corporal", "Jabones y accesorios", r"\b(jabon(?:es)?|jab|gel\s+de\s+ducha|talcos?|esponja\s+(de\s+)?bano|soap|shower|higiene\s+(de\s+)?manos)\b"),
    ("Maquillaje y uñas", "Maquillaje y manicura", r"\b(maquillaje|labial(?:es)?|mascara.*pestan|esmaltes?|manicura|unas|quitaesmalte|delineador(?:es)?|rubor|base\s+maquillaje|corrector\s+(facial|ojeras)|polvo\s+compacto|lima\s+de\s+unas)\b"),
    ("Afeitado y depilación", "Afeitado y depilación", r"\b(afeit\w*|depil\w*|postafeitado|after\s*shave|gillette|prestobarba)\b"),
    ("Perfumería", "Fragancias", r"\b(perfumes?|colonias?|fragancias?|eau\s+de|body\s+(splash|mist))\b"),
    ("Ortopedia", "Soportes y rehabilitación", r"\b(ortopedia|ortopedic\w*|rodilleras?|tobilleras?|muletas?|munequeras?|taloneras?|medias\s+(de\s+)?compresion|faja\s+lumbar|plantillas?\s+(ortopedic\w*|gel)|rehabilitacion)\b"),
    ("Insumos y primeros auxilios", "Botiquín y equipos", r"\b(gasas?|vendas?|apositos?|curitas|algodon|barbijos?|jeringas?|termometros?|tensiometros?|oximetros?|nebulizador(?:es)?|guantes?\s+(latex|nitrilo|descartables)|cinta\s+(medica|hipoalergenica)|alcohol\s+(etilico|medicinal|gel|desinfectante)|equipos\s+de\s+salud)\b"),
    ("Otros productos de farmacia", "Higiene y accesorios", r"\b(preservativos?|lubricante\s+(intimo|personal)|test\s+(de\s+)?embarazo|prueba\s+(de\s+)?embarazo|repelente(?:s)?|peine\s+fino|piojos|pediculosis|lentes\s+de\s+contacto|hisopos?|panuelos\s+(descartables|de\s+papel))\b"),
]
SPECS = [(category, subcategory, re.compile(pattern)) for category, subcategory, pattern in SPECS]
# Colouring is more specific than the generic word "capilar".
SPECS.insert(1, SPECS.pop(4))

@lru_cache(maxsize=250000)
def classify_product(name, brand="", category=""):
    # Expand source shorthand only for matching; never rewrite the source name.
    value = re.sub(r"\bd/", "de ", normalized(name + " " + category))
    value = re.sub(r"\bp/", "para ", value)
    final_issue = final_scope_issue(value, brand)
    if final_issue: return "discard", "", "", final_issue
    if MEDICINE.search(value): return "discard", "", "", "medicamento_o_ambiguo"
    if re.search(r"\bacond\w*\b.*\baire\b", value): return "discard", "", "", "uso_no_personal"
    if re.search(r"\b(esponja|cepillo)\b", value) and re.search(r"\b(ayudin|extralimp|trash)\b", value + " " + normalized(brand)):
        return "discard", "", "", "uso_no_personal"
    if re.search(r"\bpeine\s+manopla\b", value):
        return "review", "Sin clasificar", "", "uso_personal_no_confirmado"
    if re.search(r"\b(deo|desodor)\b", value) and re.search(r"\b(lysoform|glade|multimax|poett|blem|proc enex|procenex)\b", value + " " + normalized(brand)):
        return "discard", "", "", "uso_no_personal"
    if re.search(r"\b(aire\s*pur|air\s+perfum|fulton)\b", normalized(name + " " + brand)):
        return "review", "Sin clasificar", "", "fragancia_uso_personal_no_confirmado"
    if re.search(r"\b(piso|antihumedad|suav\.?\s+federal)\b", value): return "discard", "", "", "uso_no_personal"
    if NON_COSMETIC.search(value): return "discard", "", "", "uso_no_personal"
    health_context = normalized(name + " " + brand)
    # PVO means polvo; it is not necessarily laundry detergent.
    if re.search(r"\b(veritas|algabo)\b", health_context) and re.search(r"\b(desod|talco)\b", value):
        health_context = re.sub(r"\bpvo\b", "polvo", health_context)
    if NON_HEALTH.search(health_context): return "discard", "", "", "uso_no_personal"
    if NON_PERSONAL.search(normalized(name + " " + brand)): return "discard", "", "", "uso_no_personal"
    if HOUSEHOLD_DETAILS.search(normalized(name + " " + brand)) and not (re.search(r"\blimpiador\b", value) and skin_context(value + " " + normalized(brand))): return "discard", "", "", "uso_no_personal"
    if HOUSEHOLD.search(value): return "discard", "", "", "fuera_de_alcance"
    # Rice can be a documented ingredient of infant cereal, for example.
    if FOOD.search(value) and not SPECS[0][2].search(value) and not COSMETIC_CONTEXT.search(value): return "discard", "", "", "fuera_de_alcance"
    if re.search(r"\b(toall\w*.*desinf|desinf.*toall|juguete\w*|playset|tiny|juliana|dispens\w*.*jabon)\b", value):
        return "review", "Sin clasificar", "", "uso_personal_no_confirmado"
    recovered = recovery_classification(value, brand)
    if recovered:
        return "candidate", recovered[0], recovered[1], ""
    if re.search(r"\bjab(?:on|ones)?\b", value) and not SOAP_PERSONAL.search(normalized(name + " " + brand)) and not re.search(r"\bnivea\b", value + " " + normalized(brand)):
        return "review", "Higiene corporal", "", "jabon_uso_personal_no_confirmado"
    if re.search(r"\b(porta\s*papilla|plato.*bebe|cuchara.*bebe)\b", value):
        return "candidate", "Bebés y maternidad", "Accesorios de alimentación", ""
    for group, sub, pattern in SPECS:
        if pattern.search(value):
            return "candidate", group, sub, ""
    extra = extra_classification(value, brand)
    if extra:
        return "candidate", extra[0], extra[1], ""
    third = third_classification(value, brand)
    if third:
        return "candidate", third[0], third[1], ""
    final = final_classification(value, brand)
    if final:
        return "candidate", final[0], final[1], ""
    old, error = previous_classify(name, category)
    if old: return "candidate", old, "Sin subcategoría documentada", ""
    if KNOWN_PHARMACY.search(normalized(name + " " + brand)) or final_needs_review(name, brand):
        return "review", "Sin clasificar", "", "marca_pertinente_descripcion_insuficiente"
    return "discard", "", "", "no_identificado_como_farmacia"

def quantity_signature(name, quantity, unit):
    """Only strong explicit quantities; 1 unit is often a commercial placeholder."""
    value = normalized(name)
    explicit = re.findall(r"(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(ml|cc|cm3|gr|grs|g|kg|litros?|lts?)\b", value)
    if explicit:
        amount, measure = explicit[-1]
    elif normalized(unit) in {"ml", "cc", "cm3", "g", "gr", "grs", "kg", "l", "lt", "lts"}:
        amount, measure = quantity, normalized(unit)
    else: return ""
    try:
        from decimal import Decimal
        number = Decimal(amount.replace(",", "."))
        if measure in {"kg", "l", "lt", "lts", "litro", "litros"}: number *= 1000
        family = "g" if measure in {"g", "gr", "grs", "kg"} else "ml"
        return str(number.normalize()) + family
    except Exception: return ""
