"""Observed shorthand in all supplied SEPA files, 2026-10-25.

These rules classify original evidence; they never expand names or invent units.
They run after medicine/household exclusions. Brand alone is insufficient.
"""
import re
from rules import normalized


def recovery_classification(name, brand=""):
    value = normalized(name)
    both = value + " " + normalized(brand)
    def has(pattern):
        return bool(re.search(r"\b(?:" + pattern + r")\b", value))
    def context(pattern):
        return bool(re.search(r"\b(?:" + pattern + r")\b", both))

    # BIC also sells stationery and lighters: require shaving type/model.
    if context(r"bic") and has(r"soleil|comfort\s*\d*\w*|comf\d*|flex\s*\d*|hybrid|af|afei|lady"):
        return "Afeitado y depilación", "Máquinas de afeitar"
    if context(r"venus") and has(r"maq|maquina|repuesto|rep"):
        return "Afeitado y depilación", "Máquinas y repuestos"
    if context(r"veet") and has(r"bandas?|crema|kit\s+fac"):
        return "Afeitado y depilación", "Ceras y cremas depilatorias"
    if context(r"nosotras|always|kotex|ladysoft|calipso|siempre\s+libre") and has(r"pd|th|toa|toall\w*|tamp|prot\w*|pro\s+dia|diarios|ultra\s+seca|xtra\s+(seca|suave)|t\s+(clasi|invisi)"):
        return "Higiene femenina", "Protección e higiene íntima"
    if context(r"huggies|babysec|pampers|estrella|duffy") and has(r"pan|pa|pants?|swimmers"):
        return "Bebés y maternidad", "Pañales"
    if context(r"huggies|babysec|pampers|johnson\w*|estrella") and has(r"th|toa|toall\w*|wipes"):
        return "Bebés y maternidad", "Higiene infantil"
    if context(r"johnson\w*|huggies") and has(r"crem\w*|bano\s+liq"):
        return "Bebés y maternidad", "Cuidado infantil"
    hair = r"suave|elvive|pantene|sedal|tresemme|dove|johnson\w*|algabo|roby|biferdil|capilatis|otowil|plusbelle"
    if context(hair) and has(r"ac|aco|acon|acodicionador|cn"):
        return "Cabello", "Acondicionadores"
    if context(hair) and has(r"sham|sha"):
        return "Cabello", "Champús"
    if context(hair) and has(r"cp|cpp|cdp|ctc|cr\s+(pein|tra)|mascarilla|mousse|gel|prot\w*\s+(ter|termico)|leave\s+on|tonic\w*|oil|tr|3mm"):
        return "Cabello", "Tratamientos y peinado"
    if context(r"colgate|sensodyne|odontol|aquafresh") and has(r"cd|dent|cepil\w*|cre|anticarie\w*|lumi\w*|lw"):
        return "Higiene bucal", "Accesorios y cuidado bucal"
    if context(r"nivea|rexona|axe|dove") and has(r"aer|aero|aerosol|ar\s+ap|sti|bodyspray|bs|allbody|antitran\w*|clinical|cli|cl\s+aer"):
        return "Desodorantes", "Desodorantes personales"
    if context(r"algabo|rexona|veritas") and has(r"tal|talc|talco|talcos"):
        return "Higiene corporal", "Talcos personales"
    if context(r"algabo") and has(r"q\s+esma"):
        return "Maquillaje y uñas", "Quitaesmaltes"
    if context(r"algabo") and has(r"discos\s+desma"):
        return "Dermocosmética", "Desmaquillantes"
    if context(r"algabo") and has(r"pompones\s+algo"):
        return "Insumos y primeros auxilios", "Algodón"
    if context(r"algabo") and has(r"baby\s+oleo"):
        return "Bebés y maternidad", "Higiene infantil"
    if context(r"algabo|dove") and has(r"ja\s+liq"):
        return "Higiene corporal", "Jabones líquidos"
    if has(r"cotonetes"):
        return "Otros productos de farmacia", "Hisopos"
    if re.match(r"^(?:set\s+)?colitas\b", value):
        return "Otros productos de farmacia", "Accesorios de cabello"
    return None
