"""Additional source-observed abbreviations. Run only after scope exclusions."""
import re
from rules import normalized

SKIN_BRANDS = r"nivea|atrix|dove|hinds|bagovit|dermaglos|neutrogena|loreal|l.oreal|garnier|cicatricure|goicoechea|tortulan|cetaphil|cerave|eucerin|pond.?s|teatrical|vichy|la roche|villeneuve"
HAIR_BRANDS = r"pantene|sedal|dove|elvive|fructis|tresemme|plusbelle|biferdil|capilatis|tio nacho|head\s*.\s*shoulders|herbal|ogx|issue"
ACCESSORY_BRANDS = r"basicare|basiccare|jessamy|skora|algabo|tao|prelude|visiv|farmacity|soul care"


def skin_context(value):
    return bool(re.search(r"\b(" + SKIN_BRANDS + r")\b", value) or re.search(r"\b(facial|rostro|piel|cutis|micelar|desmaquill\w*|hialuron\w*)\b", value))


def extra_classification(name, brand=""):
    value = normalized(name)
    both = value + " " + normalized(brand)
    if re.search(r"\b(ropa\s+int\w*|pant|toalla|prot|protect)\b", value) and re.search(r"\b(plenitud|tena|nonisec|cotidian)\b", both):
        return "Adultos e incontinencia", "Protección absorbente"
    if re.search(r"\b(mamad\w*|tetin\w*|teti|tet|chupet\w*|chupex\w*|descongestionador\s+nasal)\b", value) and re.search(r"\b(nuk|avent|chicco|dispita|bebe|baby)\b", both):
        return "Bebés y maternidad", "Accesorios de cuidado infantil"
    if re.search(r"\b(aerocamara|almohada\s+electrica|aspirador\s+nasal)\b", value):
        return "Insumos y primeros auxilios", "Botiquín y equipos"
    if re.search(r"\b(lech\w*\s+inf|formula\s+lactea)\b", value) or re.search(r"\bleche\s+vital\s+nutri\s+plus\s+[12]\b", value):
        return "Nutrición infantil y especializada", "Fórmulas y nutrición"
    if re.search(r"\bissue\b", both) and re.search(r"\b(col|color|keratin\w*\s+n[°º]?\s*\d|rubio|castano)\b", value):
        return "Tinturas y coloración", "Coloración y oxidantes"
    if re.search(r"\bespuma\s+de\s+bano\b", value):
        return "Higiene corporal", "Jabones y accesorios"
    if re.search(r"\bgel\b", value) and re.search(r"\b(cap|fijac\w*|efecto\s+humedo|ef\s+humedo)\b", value):
        return "Cabello", "Tratamientos y peinado"
    if re.search(r"\b(preserv|lubricante\s+int|gel\s+int)\b", value):
        return "Otros productos de farmacia", "Higiene sexual"
    if re.search(r"\b(prime|tulipan)\b", both) and re.search(r"\b(skyn|superfinos?|texturados?|lubricado|ultra\s+fino|gel)\b", value):
        return "Otros productos de farmacia", "Higiene sexual"
    if re.search(r"\b(ortodoncia|ortodontica|flossers|interdent|soft.picks)\b", value):
        return "Higiene bucal", "Accesorios y cuidado bucal"
    if re.search(r"\b(prot|protec|protector|sun)\b", value) and re.search(r"\b(nivea|bagovit|dermaglos|villeneuve|cocoa beach)\b", both) and re.search(r"\b(f\d+|fact\d+|fps\d*|30|50|60|65)\b", value):
        return "Protección solar", "Protectores y postsolares"
    if re.search(r"\b(pedico|talquera|foot)\b", value):
        return "Higiene corporal", "Cuidado de los pies"
    if re.search(r"\b(afe|afei)\b", value) and re.search(r"\b(espuma|esp|gel)\b", value):
        return "Afeitado y depilación", "Afeitado y depilación"
    if re.search(r"\b(shampo|shamoo)\b", value):
        return "Cabello", "Champús"
    if re.search(r"\b(quitaesmal|quita\s+esm|parches.*ojeras)\b", value):
        return "Maquillaje y uñas", "Maquillaje y manicura"
    # The type token is required, even when a brand is recognized.
    if re.search(r"\b(antit|antitr|antitra|antitrans|antitransp|antitranspi|antritran|antitrasp|desodor|desodorant|deo)\b", value) or (re.search(r"\b(des|deso|desodo|ant|anti|r-on)\b", value) and not re.search(r"\b(anti[ -]?(manchas?|arrugas|edad))\b", value) and re.search(r"\b(rexona|dove|nivea|axe|secret|old spice)\b", both)):
        return "Desodorantes", "Desodorantes y antitranspirantes"
    if re.search(r"\b(sh|sha|sham|shamp)\b", value) and re.search(r"\b(" + HAIR_BRANDS + r")\b", both):
        return "Cabello", "Champús"
    if re.search(r"\b(ac|aco|acondic)\b", value) and re.search(r"\b(" + HAIR_BRANDS + r")\b", both):
        return "Cabello", "Acondicionadores"
    if re.search(r"\b(masc|mascara|mascarilla|trat|tratamiento|emulsion|spray|aceite|crem|crema|oleo|ampolla|balsamo)\w*\b", value) and re.search(r"\b(" + HAIR_BRANDS + r")\b", both) and not skin_context(both):
        return "Cabello", "Tratamientos y peinado"
    if re.search(r"\b(masc|mascara|trat|tratamiento|capi|curly|crecim|crecimiento|oleo)\b", value) and re.search(r"\b(" + HAIR_BRANDS + r")\b", both):
        return "Cabello", "Tratamientos y peinado"
    if (re.search(r"\b(cr|crem|crema|creme|cream|emuls|emulsion|gel|limpiador|anti[ -]?manchas?|anti[ -]?arrugas|desmaq|toallitas|body|rostro|agua\s+mic|acido hialuronico)\b", value) and skin_context(both)) or re.search(r"\b(crema\s+(corp|f)|desmaquill\w*|limpieza\s+facial|humect\w*\s+piel)\b", value):
        return "Dermocosmética", "Cuidado de la piel"
    if re.search(r"\b(fem|prot\.?\s*diar|toallas?\s+fem)\b", value) and re.search(r"\b(toall\w*|prot\w*)\b", value):
        return "Higiene femenina", "Protección e higiene íntima"
    if re.search(r"\b(cep|cepillo|cepillos|cr|crem|crema|enjuag|enjuague|enjuage|enj|pasta|hilo)\b", value) and re.search(r"\b(dent|dental|buc|bucal|colgate|kolynos|odol|sensodyne|gum|oral.?b)\b", both):
        return "Higiene bucal", "Accesorios y cuidado bucal"
    if re.search(r"\b(fecula|almidon|aceite|bano\s+liquido)\b", value) and re.search(r"\b(baby|bebe|johnson\w*|algabo)\b", both):
        return "Bebés y maternidad", "Cuidado infantil"
    if re.search(r"\b(vaso|vasito|plato|taza|cuchara|cubierto|cepillo|esterilizador|calienta\s*biberon)\w*\b", value) and re.search(r"\b(nuk|avent|chicco|dispita|bebe|baby|lactante)\b", both):
        return "Bebés y maternidad", "Accesorios de alimentación"
    if re.search(r"\b(peine|peines|peineta|gorra?\s+de?\s*ducha|gorro\s+ducha)\b", value):
        return "Cabello", "Accesorios capilares"
    if re.search(r"\b(manicuria|cortaunas|cuticulas?|pomez|pestan\w*|cejas|separador\s+de\s+dedos|maquillar|sombra\s+de\s+ojos)\b", value):
        return "Maquillaje y uñas", "Maquillaje y manicura"
    if re.search(r"\balicate\b", value) and re.search(r"\b(pies|unas|" + ACCESSORY_BRANDS + r"|trim|nuk)\b", both):
        return "Maquillaje y uñas", "Maquillaje y manicura"
    if re.search(r"\b(lima|limas|brocha|brochas|pincel|cisne|escofina|block|espejo|esponja|aplicador)\w*\b", value) and re.search(r"\b(" + ACCESSORY_BRANDS + r")\b", both):
        return "Maquillaje y uñas", "Accesorios de cuidado personal"
    if re.search(r"\b(esponja|manopla|pompon)\b.*\bbano\b|\bcepillo\b.*\b(corporal|celulitis)\b", value) or (re.search(r"\bcepillo\b.*\bbano\b", value) and re.search(r"\b(" + ACCESSORY_BRANDS + r")\b", both)):
        return "Higiene corporal", "Jabones y accesorios"
    return None
