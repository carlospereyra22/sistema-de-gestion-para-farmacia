"""Final source-observed coverage rules. Preserve original fields; never infer a GTIN."""
import re
from rules import normalized


def final_scope_issue(name, brand=""):
    value = normalized(name + " " + brand)
    # Abbreviated environmental/automotive descriptions missed by the earlier rules.
    if re.search(r"\b(glade|lysol|lysoform|revigal|aromass|pato\s+purific)\b", value):
        return "uso_no_personal"
    if re.search(r"\b(desod\w*|deo|perf\w*)\b.*\b(amb|amiente|autom|telas?)\b", value):
        return "uso_no_personal"
    if re.search(r"\b(tabletas?|espirales?|liq\w*\s+elect\w*)\b", value) and re.search(r"\b(fuyi|selton|mosquitos?|repelente)\b", value):
        return "uso_no_personal"
    if re.search(r"\balcohol\b.*\b(boricado|quemar|desnaturalizado)\b", value):
        return "medicamento_o_ambiguo"
    return ""


def final_classification(name, brand=""):
    value = normalized(name)
    both = value + " " + normalized(brand)
    def has(pattern):
        return bool(re.search(r"\b(?:" + pattern + r")\b", value))
    def context(pattern):
        return bool(re.search(r"\b(?:" + pattern + r")\b", both))

    if has(r"biberon\w*|saca\s+leche|protectores?\s+mamarios?|vaso\s+(entrenador|antiderrame)|oleo\s+calc\w*"):
        return "Bebés y maternidad", "Accesorios y cuidado infantil"
    if context(r"babelito|blt|baby\s+bee|chicco|dispita|ted dy|teddy|vaita|nuk|avent|infan\s*tec|twistshake") and has(r"mam|mamade\w*|chup\w*|chupe|mord|babero|cambiador|plato\s+termico|cucharas?|cubiertos|tijerit\w*|sujetad\w*"):
        return "Bebés y maternidad", "Accesorios y cuidado infantil"
    if context(r"estrella|candy\s*baby|huggies|pampers|q.?soft") and has(r"toa|toallitas?|oleo|panos.*bebe"):
        return "Bebés y maternidad", "Higiene infantil"
    if context(r"duffy") and has(r"pan|hiperpack|hiperpac"):
        return "Bebés y maternidad", "Pañales"
    if context(r"tena|nonisec|cotidian") and has(r"toal|pants|apo|incont\w*|zaleas|p\s+(noc|up)"):
        return "Adultos e incontinencia", "Protección absorbente"
    if has(r"zaleas|geriatrico\w*"):
        return "Adultos e incontinencia", "Protección absorbente"
    if context(r"calipso|calpso|ladysoft|siempre\s+libre") and has(r"toa|toal\w*|alas|protect\w*|permasec"):
        return "Higiene femenina", "Protección e higiene íntima"
    if has(r"panuelos") and context(r"campanita|carrefour|elite|kleenex|carilina|farmacity"):
        return "Otros productos de farmacia", "Pañuelos descartables"
    if has(r"quitaesmaltes|cortaunas?|cortauna|arqueador\s+pesta\w*"):
        return "Maquillaje y uñas", "Maquillaje y manicura"
    if context(r"brand\s+beauty|trim|tao|jessamy|skora|prelude|yiwu|lanossi|moon") and has(r"limas?|cisne|escofina|alic|tijer\w*|invisibles?|broches?|minibroches|terminales\s+de\s+trenza|tic\s+tac|cepillo"):
        return "Otros productos de farmacia", "Accesorios de cuidado personal"
    if has(r"esponjas?\s+(de\s+)?bano|cepillo\s+espalda") or (context(r"bijou|espon|estilo\s+spa") and has(r"esponjas?")):
        return "Higiene corporal", "Accesorios de baño"
    if has(r"crema\s+(de\s+)?(ordene|ordone)|cremacorporal|emulsion\s+corporal|crema\s+para\s+(cuerpo|man\w*.*cuer\w*)"):
        return "Dermocosmética", "Cuidado de la piel"
    if context(r"algabo") and has(r"barro\s+(vegetal|natural)|cream|crema"):
        return "Dermocosmética", "Cuidado de la piel"
    if context(r"algabo") and has(r"jb\s+liq"):
        return "Higiene corporal", "Jabones líquidos"
    if context(r"ferrini|go\s+to\s+be|norma\s+maliandi|koreia") and has(r"cr|crema|emul|tonico|piel|hidro|hid r|hid rante"):
        return "Dermocosmética", "Cuidado de la piel"
    if has(r"panos?\s+(demaq|desmaq)|toa\s+desm"):
        return "Dermocosmética", "Desmaquillantes"
    if context(r"la\s+roche\s+posay|lrp") and has(r"cre|ser|eau\s+thermale|labios|manos|baume|yeux"):
        return "Dermocosmética", "Cuidado de la piel"
    if context(r"cocoa\s*beach|banana\s+boat|zono") and has(r"f\d+|f\s*\d+"):
        return "Protección solar", "Protectores y postsolares"
    if context(r"alta\s+moda|otowil|meraki|pol yana|polyana|estrella|ice|biferdil") and has(r"aco|ac|cond|condic|balsam"):
        return "Cabello", "Acondicionadores"
    if context(r"alta\s+moda|ice") and has(r"sham|sha"):
        return "Cabello", "Champús"
    if has(r"mascara\s+cap|thermo\s+alisador|protector\s+thermico|mousse\s+styling") or (context(r"roby|life\s+quality") and has(r"gel|efecto\s+humedo")):
        return "Cabello", "Tratamientos y peinado"
    if context(r"alta\s+moda|otowil|bonte") and has(r"masc|cr.*kerat\w*|tratamient\w*\s+shock\s+ker"):
        return "Cabello", "Tratamientos y peinado"
    if has(r"tinte\s+colorante|kit\s+(col|color)|color\s+perm") and has(r"rub\w*|cast\w*|negro|ceniz\w*|rojo|ciruela|choco"):
        return "Tinturas y coloración", "Coloración y oxidantes"
    if context(r"just\s+for\s+men|excellence") and has(r"tint|tinte|color\w*"):
        return "Tinturas y coloración", "Coloración y oxidantes"
    if context(r"depimiel|millefiori|diaman") and has(r"cera|bandas?|depi"):
        return "Afeitado y depilación", "Ceras y bandas"
    if context(r"bic") and has(r"maquina\s+(af|desechable)|flex3|comfort\s*3"):
        return "Afeitado y depilación", "Máquinas de afeitar"
    if context(r"venus") and has(r"rep|repsts|afe|maq\s+simply"):
        return "Afeitado y depilación", "Máquinas y repuestos"
    if context(r"kevingston|kevin") and has(r"des|deos"):
        return "Desodorantes", "Desodorantes personales"
    if has(r"b\.?\s*splash|eau\s+toilette"):
        return "Perfumería", "Fragancias"
    if context(r"off|aktiol") and has(r"rep|crema|defense.*gel"):
        return "Otros productos de farmacia", "Repelentes personales"
    if context(r"bialcohol|life\s+quality") and has(r"alcohol.*(70|spray|cosm|sanit)|gel\s+neutro"):
        return "Insumos y primeros auxilios", "Higiene y desinfección personal"
    if context(r"coronet") and has(r"test\s+embaraz\w*|tensio|bolsa\s+hielo"):
        return "Insumos y primeros auxilios", "Botiquín y equipos"
    return None


def final_needs_review(name, brand=""):
    # Preserve plausible short model/family names as pending, not approved by brand alone.
    return bool(re.search(r"\b(algabo|vichy|la roche posay|laroche|lrp|cerave|maybelline|rimmel|otowil|bucal tac|biferdil|alta moda|la rive|lattafa|bensimon|antonio banderas|benetton|paco rabanne|chicco|babelito|dispita|vaita|nuk|avent|listerine)\b", normalized(name + " " + brand)))
