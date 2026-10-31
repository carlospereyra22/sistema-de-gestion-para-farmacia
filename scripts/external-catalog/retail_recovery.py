"""Recover observed retail abbreviations and contextual false exclusions.

These rules classify only; original titles, sizes and barcodes stay untouched.
Never override medicinal categories or household products based on brand alone.
"""
import re
from rules import normalized


def recover_retail(name, brand, category, reason):
    text = normalized(name + ' ' + brand)
    path = normalized(category)
    if reason in {'medicamento_o_ambiguo', 'medicinal_o_suplemento_en_categoria_fuente'}:
        return None
    if re.search(r'\b(venta libre|medicamentos?|suplementos?|hogar|alimentos|cuidado de la ropa|bano y cocina|pisos y muebles)\b', path):
        return None
    if re.search(r'\b(lavandina|lavavajillas?|detergente|insecticida|inodoro|ropa|raid|glade|lysoform|cif|granby|gran federal|ala|fuyi)\b', text):
        return None
    if re.search(r'\b(salud|farmacia|diabetes|equipamiento|ortopedia)\b', path) and re.search(r'\b(estetoscopio|glucometro|lancetas?|tiras reactivas|tensiometro|oximetro|pastillero|cortapastillas?|kit enfermeria|bolsa de (agua|hielo)|almohadilla termica)\b', text):
        return 'Insumos y primeros auxilios', 'Accesorios y dispositivos de cuidado'
    if re.search(r'\bdiabetes\b', path) and re.search(r'\bfreestyle\b', text) and re.search(r'\b(sensor|lector)\b', text):
        return 'Insumos y primeros auxilios', 'Dispositivos de monitoreo'
    if re.search(r'\belectro belleza\b', path) and re.search(r'\b(secador|planchita|rizador|ondulador)\b', text):
        return 'Cabello', 'Herramientas de cuidado capilar'
    if re.search(r'\bjab(?:on|ones)?\b', text) and (re.search(r'\btocad\w*\b', text) or re.search(r'\b(asepx|asepxia|suave|villeneuve|carrefour soft|limol|life quality|bath toys|plusb)\b', text)):
        return 'Higiene corporal', 'Jabones de uso personal'
    if re.search(r'\b(pampers|babysec|huggies)\b', text) and re.search(r'\b(babysan|bsbysan|ultrasoft|ultrasec|premium|protect|classic|confort|splashers|slpashers|trip[/ ]protec)\b', text) and re.search(r'\bx\s*\d+', text):
        return 'Bebés y maternidad', 'Pañales: línea y paquete explícitos'
    if re.search(r'\bchupete\w*\b', text) and re.search(r'\b(dispita|avent|nuk|chicco)\b', text):
        return 'Bebés y maternidad', 'Chupetes'
    if re.search(r'\b(garnier|fructis)\b', text) and re.search(r'\b(acondicion\w*|hair food)\b', text):
        return 'Cabello', 'Acondicionadores y tratamientos'
    if re.search(r'\bissue\b', text) and re.search(r'\b(tin suave|ultra brillo extremo)\b', text):
        return 'Tinturas y coloración', 'Coloración'
    makeup = re.search(r'\bmaquillaje\b', path) or re.search(r'\b(revlon|rimmel|risque|vogue|fascino|maybelline)\b', text)
    if makeup and re.search(r'\b(pvo|polvo|esmalte|esm|pincel|brocha|delineador|liner)\b', text):
        return 'Maquillaje y uñas', 'Maquillaje y accesorios'
    if re.search(r'\beyeshadow\b', text):
        return 'Maquillaje y uñas', 'Sombras de ojos'
    skin = re.search(r'\b(dermo|dermocosmetica|cuidado de la piel)\b', path)
    if skin and re.search(r'\b(cleansing|cleanser|limpiador|exfoliante|hidratante|bruma corporal|aloe soothing|hand cream)\b', text):
        return 'Dermocosmética', 'Cuidado de la piel'
    if re.search(r'\bdermaglos\b', text) and re.search(r'\b(hidratacion|hid|regeneracion|emul|nut|leche de limpieza|masc)\b', text):
        return 'Dermocosmética', 'Cuidado de la piel'
    if re.search(r'\bdermaglos\b', text) and re.search(r'\bf\s*30\b.*\bspray\b', text):
        return 'Protección solar', 'Protector solar'
    if re.search(r'\bnivea\b', text) and re.search(r'\bgel exfo facial\b', text):
        return 'Dermocosmética', 'Cuidado facial'
    if re.search(r'\brexona\b', text) and re.search(r'\bpvo\b', text) and re.search(r'\bcuidado personal\b', path):
        return 'Desodorantes', 'Desodorante en polvo'
    if re.search(r'\b(capi|capilatis)\b', text) and re.search(r'\b(sha|locion)\b', text) and re.search(r'\b(ortiga|jarilla)\b', text):
        return 'Cabello', 'Cuidado capilar'
    if re.search(r'\b(anteojos|lentes de sol)\b', text) and not re.search(r'\bsol[.]?oft|lagrima\w*', text):
        return 'Otros productos de farmacia', 'Óptica y cuidado de anteojos'
    if re.search(r'\blimpiador de (brochas|broncas|pinceles)\b', text) and re.search(r'\b(fascino|apper)\b', text):
        return 'Maquillaje y uñas', 'Limpieza de accesorios'
    if re.search(r'\blimpiador de lengua\b', text) and re.search(r'\bcuidado oral\b', path):
        return 'Higiene bucal', 'Accesorios de higiene bucal'
    if re.search(r'\belectro belleza\b', path) and re.search(r'\b(afeitadora|cortadora)\b', text):
        return 'Afeitado y depilación', 'Máquinas de cuidado personal'
    if re.search(r'\baposito\b', text) and re.search(r'\bincontinencia\b', path):
        return 'Adultos e incontinencia', 'Apósitos para incontinencia'
    if re.search(r'\b(accesorios para bebe)\b', path) and re.search(r'\b(tapitas selladoras|aspirador con dos picos)\b', text):
        return 'Bebés y maternidad', 'Accesorios para bebé'
    if re.search(r'\b(fragancias|perfumes)\b', path) and re.search(r'\b(edt|edp|parfum|cologne|body mist|set bath)\b', text):
        return 'Perfumería', 'Cofres y sets'
    return None
