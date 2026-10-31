"""Reviewed truncations/typos observed in SEPA. No fuzzy auto-acceptance."""
import re
from rules import normalized


def third_classification(name, brand=""):
    value = normalized(name)
    both = value + " " + normalized(brand)
    if re.search(r"\b(tao|skora|jessamy|basicare|basiccare|soul care)\b", both) and re.search(r"\b(cepillo|colines?|colitas?|vincha|elastico\w*|broche|jab onera|jabonera|guante\s+exf|blender|puntos\s+negros)\b", value):
        return "Otros productos de farmacia", "Accesorios de cuidado personal"
    if (re.search(r"\b(crem?\w*|emulsion|brum)\b", value) and re.search(r"\b(fac|corpo|corp|manos)\b", value)) or (re.search(r"\b(toal\w*|agua)\b", value) and re.search(r"\b(desmaq\w*|micela)\b", value)):
        return "Dermocosmética", "Cuidado de la piel"
    if re.search(r"\b(cera|cer)\b", value) and re.search(r"\b(capilatis|modeladora|model)\b", both):
        return "Cabello", "Tratamientos y peinado"
    if re.search(r"\bcera\b", value) and re.search(r"\benjoy\b", both) and re.search(r"\b(cacer\w*|micro|veget\w*|miel)\b", value):
        return "Afeitado y depilación", "Afeitado y depilación"
    if re.search(r"\bth\b", value) and re.search(r"\benjoy\b", both) and re.search(r"\balas\b", value):
        return "Higiene femenina", "Protección e higiene íntima"
    if re.search(r"\b(edt|edp|eau\s+de\s+toil\w*|body\s+spl\w*)\b", value):
        return "Perfumería", "Fragancias"
    if re.search(r"\b(sombra\w*\s+(de\s+)?ojos|lip\s+gloss)\b", value):
        return "Maquillaje y uñas", "Maquillaje y manicura"
    if re.search(r"\b(acondicionad|acondicion)\b", value):
        return "Cabello", "Acondicionadores"
    if re.search(r"\b(dentifr|interden|dentifix)\b", value):
        return "Higiene bucal", "Accesorios y cuidado bucal"
    if re.search(r"\b(tintur|tintu)\b", value) and re.search(r"\b(castan\w*|rubio|negro|rojo|bonte)\b", both):
        return "Tinturas y coloración", "Coloración y oxidantes"
    if re.search(r"\b(repelent|pelente)\b", value) and re.search(r"\b(bonte|off|rep|insect\w*|mosquit\w*)\b", both):
        return "Otros productos de farmacia", "Higiene y accesorios"
    if re.search(r"\b(demaquillante\w*|hidrantante|gelcapilar)\b", value):
        return ("Cabello", "Tratamientos y peinado") if "gelcapilar" in value else ("Dermocosmética", "Cuidado de la piel")
    if re.search(r"\b(panuel\w*)\b", value) and re.search(r"\b(desc\w*|pocket|mentol\w*|kleenex|elite|farmacity|carilina|bonte|soul care)\b", both):
        return "Otros productos de farmacia", "Pañuelos descartables"
    if re.search(r"\bth\b", value) and re.search(r"\b(bebe|baby|huggies|pampers)\b", both):
        return "Bebés y maternidad", "Toallitas húmedas"
    if re.search(r"\btoallas?\b", value) and re.search(r"\b(siempre libre|s[.]libre|kotex|nosotras|ladysoft|c/alas|c/alas|ultrafina|supersec|enjoy|calipso|lina)\b", both):
        return "Higiene femenina", "Protección e higiene íntima"
    if re.search(r"\b(cepill|cepillo)\b.*\bdient\w*\b", value):
        return "Higiene bucal", "Accesorios y cuidado bucal"
    if re.search(r"\b(maybelline|myb|rimmel|rml|revlon|wet n wild)\b", both) and re.search(r"\b(lab|masc|mascara|base|corr\w*|delin\w*|deli|sombr\w*|palett\w*|bronzer|brow|lumi\s+matt|teddy\s+tint|lip|gloss|iluminador|brocha|primer\s+stick|set\s+esponjas)\b", value):
        return "Maquillaje y uñas", "Maquillaje y manicura"
    if re.search(r"\b(contorno\s+de\s+ojos|cont\s+ojos|balsamolab|protector\s+lab)\b", value):
        return "Dermocosmética", "Cuidado de la piel"
    if re.search(r"\b(nivea|cerave|crv|eucerin|vichy|dove|hinds|tortulan|jergens|neutrogena|dermaglos|bagovit)\b", both) and re.search(r"\b(cre|ser|tonico|loc|corpo|hidrata|hidratante|hydr|cleans|clans|lip|balsamo|dem aquillante|eau\s+thermale)\b", value):
        return "Dermocosmética", "Cuidado de la piel"
    if re.search(r"\b(sha|shamp|sh)\b", value) and re.search(r"\b(vichy|dercos|bagovit)\b", both):
        return "Cabello", "Champús"
    if re.search(r"\b(balsam|desenredante|savia|mascara|tratamiento|capil)\b", value) and re.search(r"\b(biferdil|capilatis|bagovit)\b", both):
        return "Cabello", "Tratamientos y peinado"
    if re.search(r"\baclarante\b", value) and re.search(r"\b(capilatis|rubio)\b", both):
        return "Tinturas y coloración", "Coloración y oxidantes"
    if re.search(r"\b(banditas|elastico)\b", value) and re.search(r"\bcabel\w*\b", value):
        return "Cabello", "Accesorios capilares"
    if re.search(r"\b(basicare|basiccare)\b", both) and re.search(r"\b(botellitas\s+de\s+viaje|tijera.*bebe)\b", value):
        return "Otros productos de farmacia", "Accesorios de cuidado personal"
    if re.search(r"\balcohol\b", value) and re.search(r"\b(aerosol|spray)\b", value) and re.search(r"\bfarmacity\b", both):
        return "Insumos y primeros auxilios", "Botiquín y equipos"
    return None
