// Uso y dosis habitual orientativos por principio activo (SISTEMA-108).
// Generados con IA a partir de información general de medicamentos: son un
// resumen para el mostrador, no reemplazan al prospecto ni a la indicación
// médica. Dosis de adultos salvo aclaración, siempre con intervalo en horas
// ("cada 8 h"; semanal o mensual, en días). La clave es el principio activo tal
// como lo escribe el padrón oficial (se normaliza al cargar).
// Para sumar o corregir: editar estos archivos y correr
//   pnpm --filter @gestion/api catalogo-medicamentos guias

import { tanda, type DosisOrientativa, type FilaDosis } from "./guias-dosis";
import { DOSIS_TANDA_2 } from "./guias-dosis-2.data";
import { DOSIS_TANDA_3 } from "./guias-dosis-3.data";
import { DOSIS_TANDA_4 } from "./guias-dosis-4.data";
import { DOSIS_TANDA_5 } from "./guias-dosis-5.data";
import { DOSIS_TANDA_6 } from "./guias-dosis-6.data";
import { DOSIS_TANDA_7 } from "./guias-dosis-7.data";
import { DOSIS_TANDA_8 } from "./guias-dosis-8.data";

export type { DosisOrientativa } from "./guias-dosis";

const ESP = "la dosis la indica el médico especialista.";

const TANDA_1: FilaDosis[] = [
  [
    "ibuprofeno",
    "Dolor, fiebre e inflamación.",
    "400 mg cada 6-8 h con comida (máx. 1.200 mg/día sin indicación médica). Niños: según peso. Inyectable: uso hospitalario, habitual 400 mg IV cada 6-8 h según indicación médica.",
  ],
  [
    "metformina",
    "Diabetes tipo 2.",
    "500-850 mg cada 8-12 h con las comidas; se empieza bajo (máx. 2.550 mg/día).",
  ],
  ["rosuvastatina", "Colesterol alto.", "5-20 mg cada 24 h (máx. 40 mg)."],
  [
    "carvedilol",
    "Presión alta, insuficiencia cardíaca y angina.",
    "6,25-25 mg cada 12 h con comida; se empieza con dosis baja.",
  ],
  [
    "proteínas+grasas+carbohid.+asoc.",
    "Nutrición especial (alimento para propósitos médicos).",
    "Tomas cada 3-4 h o según indique el médico o nutricionista.",
  ],
  [
    "amoxicilina",
    "Infecciones bacterianas.",
    "500 mg cada 8 h o 875 mg cada 12 h, 7-10 días. Completar el tratamiento. Inyectable: uso hospitalario, cada 8 h.",
  ],
  [
    "clonazepam",
    "Ansiedad, ataques de pánico y convulsiones.",
    "0,25-0,5 mg cada 8-12 h según indicación. No suspender de golpe.",
  ],
  [
    "pregabalina",
    "Dolor neuropático, epilepsia y ansiedad.",
    "75-150 mg cada 12 h (máx. 600 mg/día).",
  ],
  ["atorvastatín", "Colesterol alto.", "10-80 mg cada 24 h."],
  [
    "quetiapina",
    "Esquizofrenia y trastorno bipolar.",
    "Cada 12 h (liberación inmediata) o cada 24 h a la noche (prolongada); se ajusta de a poco.",
  ],
  [
    "sildenafil",
    "Disfunción eréctil.",
    "50 mg (25-100 mg) 1 h antes de la relación; no más de 1 dosis cada 24 h.",
  ],
  [
    "tadalafilo",
    "Disfunción eréctil e hiperplasia de próstata.",
    "10-20 mg antes de la relación (no más de 1 cada 24 h) o 5 mg cada 24 h.",
  ],
  [
    "diclofenac sódico",
    "Dolor e inflamación.",
    "50 mg cada 8-12 h o 75 mg cada 12 h, con comida (máx. 150 mg/día). Inyectable: 75 mg (1 ampolla) IM cada 24 h; solo en casos graves cada 12 h, no más de 2 días. Gel: cada 6-8 h (3-4 veces por día) sobre la zona; consultar si sigue a los 7 días. Parche: 1 cada 24 h, máx. 7 días. Colirio: 1 gota cada 5-8 h (3-5 veces por día), según el oftalmólogo.",
  ],
  [
    "enalapril",
    "Presión alta e insuficiencia cardíaca.",
    "5-20 mg cada 12-24 h (máx. 40 mg/día).",
  ],
  [
    "alprazolam",
    "Ansiedad y ataques de pánico.",
    "0,25-0,5 mg cada 8-12 h. No suspender de golpe.",
  ],
  [
    "etoricoxib",
    "Dolor e inflamación (artrosis, artritis, dolor agudo).",
    "60-90 mg cada 24 h; 120 mg cada 24 h solo por pocos días.",
  ],
  ["losartán", "Presión alta.", "50 mg cada 24 h (25-100 mg)."],
  [
    "paracetamol",
    "Dolor y fiebre.",
    "Adultos: 500 mg-1 g cada 6-8 h (máx. 3-4 g/día). Niños: 10-15 mg/kg cada 6 h (máx. 60 mg/kg/día); comprimidos infantiles de 80 o 160 mg según el peso. Inyectable: uso hospitalario, 1 g IV en 15 min cada 6 h (máx. 4 g/día; menos de 50 kg: 15 mg/kg).",
  ],
  ["amlodipina", "Presión alta y angina de pecho.", "5-10 mg cada 24 h."],
  [
    "cefalexina",
    "Infecciones bacterianas (piel, garganta, urinarias).",
    "500 mg cada 6-8 h, 7-10 días. Completar el tratamiento.",
  ],
  [
    "claritromicina",
    "Infecciones bacterianas respiratorias.",
    "250-500 mg cada 12 h, 7-14 días. Inyectable: uso hospitalario, 500 mg IV cada 12 h.",
  ],
  [
    "fluconazol",
    "Infecciones por hongos (candidiasis).",
    "Candidiasis vaginal: 150 mg dosis única. Otras: 50-400 mg cada 24 h según indicación. Inyectable: uso hospitalario, cada 24 h.",
  ],
  [
    "azitromicina",
    "Infecciones bacterianas.",
    "500 mg cada 24 h por 3 días (o 500 mg el primer día y 250 mg cada 24 h 4 días más). Colirio: 1 gota cada 12 h por 3 días. Inyectable: uso hospitalario, 500 mg IV cada 24 h.",
  ],
  [
    "omeprazol",
    "Acidez, reflujo y úlcera.",
    "Acidez (venta libre, 10-20 mg): 20 mg cada 24 h en ayunas, hasta 14 días. Reflujo o úlcera: 20-40 mg cada 24 h según indicación médica. Inyectable: uso hospitalario, 40 mg IV cada 24 h.",
  ],
  [
    "carbohidratos+asoc.",
    "Nutrición especial (alimento para propósitos médicos).",
    "Tomas cada 3-4 h o según indique el médico o nutricionista.",
  ],
  [
    "risperidona",
    "Esquizofrenia, trastorno bipolar e irritabilidad.",
    "Oral: cada 12-24 h; se ajusta según indicación médica. Inyectable de depósito: cada 14 días.",
  ],
  [
    "valsartán",
    "Presión alta e insuficiencia cardíaca.",
    "80-160 mg cada 24 h (máx. 320 mg); en insuficiencia cardíaca, cada 12 h.",
  ],
  [
    "levetiracetam",
    "Epilepsia.",
    "500 mg cada 12 h; se ajusta hasta 1.500 mg cada 12 h.",
  ],
  ["valsartán+hidroclorotiazida", "Presión alta.", "1 comprimido cada 24 h."],
  [
    "vit.+minerales",
    "Suplemento de vitaminas y minerales.",
    "1 toma cada 24 h con una comida.",
  ],
  ["hialurónico,ác.+asoc.", "Hidratación de la piel.", "Aplicar cada 12-24 h."],
  [
    "vit.d3",
    "Déficit de vitamina D.",
    "Según la presentación: cada 24 h, cada 7 días o cada 30 días, como indique el médico.",
  ],
  [
    "lorazepam",
    "Ansiedad e insomnio.",
    "1 mg cada 8-12 h (habitual 2-3 mg/día). No suspender de golpe.",
  ],
  [
    "tramadol",
    "Dolor moderado a intenso.",
    "50-100 mg cada 6 h (máx. 400 mg/día). Liberación prolongada: cada 12 h. Inyectable: 50-100 mg IM o IV lenta cada 4-6 h (máx. 400 mg/día).",
  ],
  ["escitalopram", "Depresión y ansiedad.", "10 mg cada 24 h (5-20 mg)."],
  [
    "amoxicilina+clavulánico,ác.",
    "Infecciones bacterianas.",
    "875/125 mg cada 12 h o 500/125 mg cada 8 h, con comida, 7-10 días.",
  ],
  [
    "colágeno+asoc.",
    "Suplemento para articulaciones, piel y cabello.",
    "1 toma cada 24 h.",
  ],
  [
    "esomeprazol",
    "Acidez, reflujo y úlcera.",
    "20-40 mg cada 24 h antes del desayuno.",
  ],
  [
    "vildagliptin+metformina",
    "Diabetes tipo 2.",
    "1 comprimido cada 12 h con las comidas.",
  ],
  [
    "paclitaxel",
    "Tratamiento oncológico (mama, ovario, pulmón).",
    `Infusión en el hospital cada 7 o 21 días según el esquema; ${ESP}`,
  ],
  [
    "lenalidomida",
    "Tratamiento oncológico (mieloma múltiple).",
    `Cada 24 h los días 1 a 21 de ciclos de 28 días; ${ESP}`,
  ],
  [
    "rivaroxabán",
    "Anticoagulante: prevención y tratamiento de trombosis y ACV.",
    "Habitual 20 mg cada 24 h con la cena; al inicio de una trombosis, 15 mg cada 12 h por 21 días.",
  ],
  [
    "ciprofloxacina",
    "Infecciones bacterianas (urinarias, intestinales y otras).",
    "250-750 mg cada 12 h según la infección. Colirio: 1-2 gotas cada 2 h los 2 primeros días y luego cada 4 h (durante el día). Inyectable: uso hospitalario, 400 mg IV cada 8-12 h.",
  ],
  [
    "diclofenac potásico+paracetamol",
    "Dolor e inflamación.",
    "1 comprimido cada 8-12 h con comida.",
  ],
  [
    "vit.a+alantoína+asoc.",
    "Piel irritada, paspaduras y cicatrización.",
    "Aplicar cada 8-12 h.",
  ],
  [
    "aciclovir",
    "Herpes (labial, genital y zóster).",
    "Herpes simple: 400 mg cada 8 h o 200 mg cada 4 h (5 tomas por día). Zóster: 800 mg cada 4 h (5 tomas por día), 7 días. Crema: cada 4 h. Pomada oftálmica: 1 cm dentro del ojo cada 4 h (5 veces por día), hasta 3 días después de curar. Inyectable: uso hospitalario, cada 8 h según el peso.",
  ],
  [
    "aminoácidos+asoc.",
    "Crema: hidratación y cuidado de la piel. Oral: suplemento nutricional.",
    "Crema: aplicar cada 12-24 h. Oral: 1 toma cada 24 h, según envase.",
  ],
  [
    "proteínas+asoc.",
    "Nutrición especial (alimento para propósitos médicos).",
    "Tomas cada 3-4 h o según indique el médico o nutricionista.",
  ],
  [
    "bisoprolol",
    "Presión alta e insuficiencia cardíaca.",
    "2,5-10 mg cada 24 h.",
  ],
  [
    "fólico,ác.",
    "Embarazo y anemia por falta de ácido fólico.",
    "0,4-5 mg cada 24 h según indicación.",
  ],
  [
    "magnesio+asoc.",
    "Suplemento de magnesio (cansancio, calambres).",
    "1 toma cada 12-24 h según envase.",
  ],
  [
    "metronidazol",
    "Infecciones por bacterias anaerobias y parásitos.",
    "500 mg cada 8-12 h, 7 días. No tomar alcohol durante y 48 h después. Gel: capa fina cada 12 h (mañana y noche), hasta 2 meses. Óvulos: 1 óvulo cada 24 h a la noche, 10 días. Inyectable: uso hospitalario, 500 mg en infusión cada 8 h.",
  ],
  [
    "montelukast",
    "Asma y rinitis alérgica.",
    "Adultos: 10 mg cada 24 h a la noche. Niños: 4-5 mg cada 24 h.",
  ],
  [
    "ketorolac",
    "Dolor agudo moderado a intenso.",
    "10 mg cada 4-6 h (máx. 40 mg/día), no más de 5 días. Inyectable: 10-30 mg IM o IV cada 4-6 h (máx. 90 mg/día, 2 días). Colirio: 1 gota cada 6-8 h (3-4 veces por día).",
  ],
  [
    "lamotrigina",
    "Epilepsia y trastorno bipolar.",
    "Cada 12-24 h; se aumenta de a poco según indicación médica (riesgo de erupción en la piel).",
  ],
  [
    "mesalazina",
    "Colitis ulcerosa y enfermedad de Crohn.",
    "Oral: cada 8-24 h según presentación (habitual 2,4-4,8 g/día). Supositorio: 1 g cada 24 h a la noche. Enema: 1 cada 24 h a la noche.",
  ],
  ["sertralina", "Depresión, ansiedad y TOC.", "50 mg cada 24 h (50-200 mg)."],
  [
    "aminoácidos+carbohidratos+asoc.",
    "Nutrición especial (alimento para propósitos médicos).",
    "Tomas cada 3-4 h o según indique el médico o nutricionista.",
  ],
  [
    "diclofenac+pridinol",
    "Dolor con contractura muscular.",
    "1 comprimido cada 8-12 h con comida.",
  ],
  [
    "sitagliptina+metformina,clorh.",
    "Diabetes tipo 2.",
    "1 comprimido cada 12 h con las comidas.",
  ],
  [
    "sodio,cloruro",
    "Solución fisiológica: lavado nasal, ocular o de heridas.",
    "Lavado nasal: cada 4-8 h o cuando haga falta. Colirio: lavado ocular cuando haga falta. Nebulización: cada 4-8 h según indicación. Uso externo: lavado de heridas cuando haga falta. Inyectable: uso hospitalario según indicación.",
  ],
  [
    "betametasona",
    "Corticoide: alergias, inflamación y afecciones de la piel.",
    "Oral: cada 24 h por la mañana o cada 12 h, según indicación. Crema: cada 12 h. Inyectable: 1 ampolla IM (depósito); se puede repetir cada 7 días según indicación médica.",
  ],
  ["nebivolol", "Presión alta e insuficiencia cardíaca.", "5 mg cada 24 h."],
  [
    "vit.c",
    "Suplemento de vitamina C.",
    "500 mg-1 g cada 24 h. Crema o sérum: cada 12-24 h sobre la piel limpia. Inyectable: según indicación médica.",
  ],
  [
    "aripiprazol",
    "Esquizofrenia y trastorno bipolar.",
    "10-15 mg cada 24 h (máx. 30 mg).",
  ],
  [
    "venlafaxina",
    "Depresión y ansiedad.",
    "75 mg cada 24 h con comida (liberación prolongada); se ajusta hasta 225 mg.",
  ],
  [
    "betahistina",
    "Vértigo y enfermedad de Ménière.",
    "16 mg cada 8 h o 24 mg cada 12 h, con comida.",
  ],
  [
    "cilostazol",
    "Dolor en las piernas al caminar (claudicación intermitente).",
    "100 mg cada 12 h, 30 min antes o 2 h después de comer.",
  ],
  [
    "vit.a+asoc.",
    "Cuidado y regeneración de la piel.",
    "Aplicar cada 12-24 h.",
  ],
  [
    "levofloxacina",
    "Infecciones bacterianas.",
    "500-750 mg cada 24 h, 5-14 días. Inyectable: uso hospitalario, 500-750 mg IV cada 24 h.",
  ],
  ["olanzapina", "Esquizofrenia y trastorno bipolar.", "5-20 mg cada 24 h."],
  [
    "dexametasona",
    "Corticoide: inflamación, alergias y otras indicaciones.",
    "Oral: cada 24 h por la mañana o cada 6-12 h, según indicación médica. Inyectable: 4-8 mg IM o IV cada 6-24 h según el cuadro; la aplica un profesional. Colirio: 1-2 gotas cada 8 h, máx. 14 días salvo indicación.",
  ],
  [
    "diclofenac+vit.b12+betametasona",
    "Dolor e inflamación (lumbalgia, ciática, neuralgias).",
    "Comprimidos: 1 cada 8-12 h, solo por pocos días. Inyectable: 1 ampolla IM cada 48-72 h, pocas aplicaciones, según indicación médica.",
  ],
  ["losartán+hidroclorotiazida", "Presión alta.", "1 comprimido cada 24 h."],
  [
    "palbociclib",
    "Tratamiento oncológico (cáncer de mama).",
    `125 mg cada 24 h los días 1 a 21 de ciclos de 28 días; ${ESP}`,
  ],
  [
    "levotiroxina",
    "Hipotiroidismo.",
    "Cada 24 h en ayunas, 30-60 min antes del desayuno; la dosis depende de los análisis.",
  ],
  [
    "vit.a",
    "Vitamina A (piel, vista).",
    "Oral: cada 24 h. Crema: cada 12-24 h.",
  ],
  [
    "clobetasol",
    "Corticoide potente para la piel (psoriasis, dermatitis).",
    "Capa fina cada 12-24 h, no más de 2 semanas seguidas.",
  ],
  [
    "drospirenona+etinilestradiol",
    "Anticonceptivo oral.",
    "1 comprimido cada 24 h a la misma hora, según el esquema del envase.",
  ],
  [
    "acetilcisteína",
    "Mucolítico: tos con flema.",
    "600 mg cada 24 h o 200 mg cada 8 h.",
  ],
  [
    "enoxaparina sódica",
    "Anticoagulante inyectable.",
    "Prevención: 40 mg cada 24 h subcutánea. Tratamiento: 1 mg/kg cada 12 h.",
  ],
  [
    "inmunoglobulina humana",
    "Inmunoglobulina (defensas).",
    `Infusión cada 21-28 días según el caso; ${ESP}`,
  ],
  [
    "pantoprazol",
    "Acidez, reflujo y úlcera.",
    "Acidez (venta libre, 20 mg): 20 mg cada 24 h antes del desayuno, hasta 14 días. Reflujo o úlcera: 40 mg cada 24 h según indicación médica. Inyectable: uso hospitalario, 40 mg IV cada 24 h.",
  ],
  [
    "paroxetina",
    "Depresión y ansiedad.",
    "20 mg cada 24 h a la mañana (máx. 50 mg).",
  ],
  [
    "tamsulosina",
    "Agrandamiento benigno de la próstata.",
    "0,4 mg cada 24 h, después de la misma comida.",
  ],
  ["valsartán+amlodipina", "Presión alta.", "1 comprimido cada 24 h."],
  [
    "diosmina+hesperidina micronizada",
    "Várices, piernas pesadas y hemorroides.",
    "500 mg cada 12 h o 1.000 mg cada 24 h; en crisis hemorroidal, más por pocos días según envase.",
  ],
  ["loratadina", "Alergia.", "10 mg cada 24 h."],
  [
    "memantine",
    "Enfermedad de Alzheimer.",
    "Cada 24 h; se aumenta de a 5 mg por semana hasta 20 mg.",
  ],
  [
    "diclofenac potásico",
    "Dolor agudo e inflamación.",
    "Venta libre (25 mg): 25 mg cada 4-6 h si hace falta (máx. 75 mg/día). Con receta: 50 mg cada 8-12 h con comida (máx. 150 mg/día).",
  ],
  [
    "pramipexol",
    "Parkinson y síndrome de piernas inquietas.",
    "Parkinson: cada 8 h (o cada 24 h la de liberación prolongada). Piernas inquietas: cada 24 h, 2-3 h antes de dormir.",
  ],
  [
    "rifaximina",
    "Diarrea del viajero y encefalopatía hepática.",
    "Diarrea: 200 mg cada 8 h por 3 días. Encefalopatía: 550 mg cada 12 h.",
  ],
  ["rosuvastatina+ezetimibe", "Colesterol alto.", "1 comprimido cada 24 h."],
  ["sitagliptina", "Diabetes tipo 2.", "100 mg cada 24 h."],
  [
    "terbinafina",
    "Hongos de piel y uñas.",
    "Oral: 250 mg cada 24 h (uñas: 6-12 semanas). Crema: cada 12-24 h.",
  ],
  [
    "ursodesoxicólico,ác.",
    "Cálculos biliares y enfermedades del hígado.",
    "Cada 8-12 h, según peso (habitual 10-15 mg/kg al día).",
  ],
  [
    "valsartán+hidrocloroti.+amlodip.",
    "Presión alta.",
    "1 comprimido cada 24 h.",
  ],
  [
    "hidrocortisona",
    "Corticoide suave (piel) o reemplazo hormonal (oral).",
    "Crema: cada 12-24 h. Oral: cada 8-12 h según indicación médica. Inyectable: 100-500 mg IV o IM, se repite cada 2-6 h según la gravedad; la aplica un profesional.",
  ],
  [
    "naproxeno",
    "Dolor e inflamación.",
    "250-500 mg cada 12 h con comida (la de liberación prolongada, cada 24 h).",
  ],
  [
    "trifluridina+tipiracilo",
    "Tratamiento oncológico (cáncer colorrectal y gástrico).",
    `Cada 12 h los días 1-5 y 8-12 de ciclos de 28 días; ${ESP}`,
  ],
  [
    "urea+asoc.",
    "Hidratación de piel seca o engrosada.",
    "Aplicar cada 12-24 h.",
  ],
  ["cetirizina", "Alergia.", "10 mg cada 24 h."],
  [
    "clotrimazol",
    "Hongos en la piel y vaginales.",
    "Crema: cada 8-12 h. Vaginal: cada 24 h a la noche, según el envase.",
  ],
  ["dasatinib", "Tratamiento oncológico (leucemia).", `Cada 24 h; ${ESP}`],
  [
    "temozolomida",
    "Tratamiento oncológico (tumores cerebrales).",
    `Cada 24 h los días 1 a 5 de ciclos de 28 días; ${ESP}`,
  ],
  [
    "apixaban",
    "Anticoagulante: prevención de trombosis y ACV.",
    "Habitual 5 mg cada 12 h; 2,5 mg cada 12 h según el caso.",
  ],
  [
    "avena+asoc.",
    "Cuidado de piel sensible o irritada.",
    "Aplicar cada 12-24 h.",
  ],
  [
    "eritropoyetina recomb.humana",
    "Anemia (por enfermedad renal y otras).",
    `Inyección cada 2-7 días según el caso; ${ESP}`,
  ],
  [
    "ibrutinib",
    "Tratamiento oncológico (linfomas y leucemia).",
    `Cada 24 h; ${ESP}`,
  ],
  [
    "lidocaína",
    "Anestésico local.",
    "Gel o crema: cada 4-8 h según necesidad, sin superar lo que indica el envase. Inyectable: anestesia local; la aplica el médico u odontólogo, dosis única según el procedimiento.",
  ],
  [
    "salicílico,ác.+asoc.",
    "Verrugas, callosidades, acné o descamación.",
    "Aplicar cada 12-24 h según la presentación.",
  ],
  [
    "tobramicina",
    "Infecciones bacterianas del ojo.",
    "Colirio: 1-2 gotas cada 4 h. Inyectable: uso hospitalario, cada 8-24 h según peso y función renal. Inhalada: 300 mg cada 12 h en ciclos de 28 días (fibrosis quística).",
  ],
  [
    "trimebutina",
    "Colon irritable y dolor abdominal.",
    "100-200 mg cada 8 h antes de las comidas.",
  ],
  [
    "diclofenac dietilamina",
    "Dolor muscular y articular (gel).",
    "Aplicar cada 6-8 h con masaje suave.",
  ],
  [
    "eritromicina",
    "Infecciones bacterianas y acné (tópica).",
    "Oral: 250-500 mg cada 6-12 h. Tópica: cada 12 h. Pomada oftálmica: 1 cm en el ojo cada 4-12 h (hasta 6 veces por día).",
  ],
  [
    "fenoximetilpenicilina",
    "Infecciones bacterianas (faringitis).",
    "1.000.000 UI cada 8-12 h; faringitis: 10 días.",
  ],
  ["amlodipina+losartán,potásico", "Presión alta.", "1 comprimido cada 24 h."],
  [
    "sulfadiazina de plata+asoc.",
    "Quemaduras y heridas.",
    "Aplicar cada 12-24 h.",
  ],
  [
    "fluticasona+salmeterol",
    "Asma y EPOC.",
    "1 inhalación cada 12 h; enjuagarse la boca después.",
  ],
  [
    "humectantes+emolientes",
    "Hidratación de piel seca.",
    "Aplicar cada 12-24 h.",
  ],
  [
    "ibandrónico,ác.",
    "Osteoporosis.",
    "150 mg cada 30 días, en ayunas con agua; no acostarse por 1 h. Inyectable: 3 mg IV cada 3 meses.",
  ],
  [
    "magnesio",
    "Suplemento de magnesio (calambres, cansancio).",
    "1 toma cada 12-24 h según envase.",
  ],
  [
    "meprednisona",
    "Corticoide: inflamación, alergias y asma.",
    "Cada 24 h por la mañana, según indicación médica. No suspender de golpe un tratamiento largo.",
  ],
  [
    "mometasona furoato",
    "Corticoide para piel o nariz (rinitis).",
    "Crema: cada 24 h. Spray nasal: 2 aplicaciones por fosa cada 24 h; al mejorar, 1 por fosa.",
  ],
  [
    "proteínas",
    "Suplemento de proteínas.",
    "1 toma cada 24 h o según indicación del nutricionista.",
  ],
  [
    "sodio,divalproato",
    "Epilepsia, trastorno bipolar y prevención de migraña.",
    "Cada 12 h (o cada 24 h la de liberación prolongada); se ajusta según indicación médica.",
  ],
  [
    "topiramato",
    "Epilepsia y prevención de migraña.",
    "Cada 12 h; migraña: se empieza con 25 mg y se sube hasta 50 mg cada 12 h.",
  ],
  ["atenolol", "Presión alta y angina.", "50-100 mg cada 24 h."],
  ["atorvastatín+ezetimibe", "Colesterol alto.", "1 comprimido cada 24 h."],
  [
    "budesonide",
    "Corticoide inhalado o nasal (asma, rinitis).",
    "Cada 12-24 h según la presentación.",
  ],
  [
    "budesonide+formoterol",
    "Asma y EPOC.",
    "1-2 inhalaciones cada 12 h; enjuagarse la boca después.",
  ],
  ["fexofenadina", "Alergia.", "120-180 mg cada 24 h, o 60 mg cada 12 h."],
  [
    "hialurónico,ác.",
    "Óvulos o gel vaginal: sequedad vaginal. Crema: hidratación de la piel. Colirio: ojo seco. Inyectable: dolor articular (lo aplica el médico).",
    "Óvulo o gel vaginal: 1 cada 24-72 h. Crema: aplicar cada 12-24 h. Colirio: 1-2 gotas cada 4-8 h. Inyectable: la aplica el médico, cada 7 días según indicación.",
  ],
  [
    "loperamida",
    "Diarrea aguda.",
    "4 mg al inicio y 2 mg después de cada deposición líquida (máx. 8 mg cada 24 h sin indicación médica).",
  ],
  [
    "metotrexato",
    "Artritis reumatoidea, psoriasis y cáncer.",
    "Cada 7 días (una vez por SEMANA, no diario); dosis según indicación médica. Inyectable: también una vez por SEMANA, en la dosis que indica el médico.",
  ],
  ["telmisartán", "Presión alta.", "40-80 mg cada 24 h."],
  [
    "bromhexina",
    "Mucolítico: tos con flema.",
    "Adultos: 8-16 mg cada 8 h. Niños de 6-12 años: 4 mg cada 8 h; de 2-6 años: 2 mg cada 8 h.",
  ],
  [
    "carboximetilcelulosa sód.+asoc.",
    "Colirio: ojo seco (lágrimas artificiales). Crema o polvo: adhesivo para prótesis dentales.",
    "Colirio: 1-2 gotas cada 4-6 h o cuando haga falta. Crema o polvo: aplicar cada 12-24 h al colocar la prótesis.",
  ],
  ["desloratadina", "Alergia.", "5 mg cada 24 h."],
  [
    "dipirona",
    "Dolor y fiebre.",
    "500 mg-1 g cada 6-8 h (máx. 4 g/día). Inyectable: 1 g IM o IV muy lenta cada 6-8 h (máx. 4 g/día); en casos puntuales el médico puede indicar hasta 2,5 g por dosis (máx. 5 g/día). La aplica un profesional.",
  ],
  [
    "ketoconazol",
    "Hongos de la piel y caspa.",
    "Crema: cada 12-24 h. Champú: cada 3-4 días. Comprimidos: 200 mg cada 24 h con comida, solo por indicación médica. Óvulo: 1 cada 24 h a la noche, 3-5 días.",
  ],
  [
    "metoclopramida",
    "Náuseas y vómitos.",
    "10 mg cada 8 h, máximo 5 días. Inyectable: 10 mg IM o IV lenta, hasta cada 8 h (máx. 30 mg/día), lo menos posible.",
  ],
  [
    "oxaliplatino",
    "Tratamiento oncológico (cáncer colorrectal).",
    `Infusión en el hospital cada 14-21 días; ${ESP}`,
  ],
  [
    "paracetamol+pseudoefedrina+asoc.",
    "Síntomas de resfrío y congestión.",
    "Cada 6-8 h según envase, sin superar 4 g de paracetamol por día ni usar más de 5 días.",
  ],
  ["simvastatin", "Colesterol alto.", "10-40 mg cada 24 h, a la noche."],
  [
    "docetaxel",
    "Tratamiento oncológico (mama, próstata, pulmón).",
    `Infusión en el hospital cada 21 días; ${ESP}`,
  ],
  ["donepecilo", "Enfermedad de Alzheimer.", "5-10 mg cada 24 h a la noche."],
  [
    "empagliflozina+metformina clorh.",
    "Diabetes tipo 2.",
    "1 comprimido cada 12 h con las comidas.",
  ],
  [
    "gemcitabina",
    "Tratamiento oncológico (páncreas, pulmón, vejiga).",
    `Infusión en el hospital cada 7 días según el ciclo; ${ESP}`,
  ],
  [
    "láctico,ác.+asoc.",
    "Higiene íntima femenina.",
    "Higiene externa: usar cada 12-24 h. Gel vaginal: 1 aplicación cada 24-72 h.",
  ],
  [
    "metilfenidato",
    "TDAH.",
    "Liberación inmediata: cada 4-6 h (mañana y mediodía). Prolongada: cada 24 h a la mañana. Dosis según indicación médica.",
  ],
  [
    "miconazol+metronidazol+asoc.",
    "Infecciones vaginales.",
    "1 óvulo cada 24 h a la noche (habitual 7-10 días).",
  ],
  [
    "paracetamol+fenilefrina+asoc.",
    "Síntomas de resfrío y congestión.",
    "Cada 6-8 h según envase, sin superar 4 g de paracetamol por día ni usar más de 5 días.",
  ],
  [
    "tacrolimus",
    "Trasplantes (oral) o dermatitis atópica (pomada).",
    "Oral: cada 12 h, dosis según el especialista. Pomada: cada 12 h.",
  ],
  [
    "tirotricina+benzocaína",
    "Dolor e irritación de garganta.",
    "1 pastilla cada 6-8 h dejándola disolver (máx. 4 por día).",
  ],
  ["vit.+asoc.", "Suplemento dietario.", "1 toma cada 24 h con una comida."],
  [
    "cistina+asoc.",
    "Caída del cabello y uñas frágiles.",
    "1-2 cápsulas cada 24 h por 3 meses, según envase.",
  ],
  [
    "clindamicina",
    "Infecciones bacterianas; acné (tópica).",
    "Oral: 300 mg cada 6-8 h. Gel: cada 12 h. Inyectable: 600-900 mg IM o IV cada 8 h, según indicación médica. Crema vaginal: 1 aplicador a la noche, cada 24 h por 3-7 días.",
  ],
  [
    "clopidogrel",
    "Antiagregante: prevención de infarto y ACV.",
    "75 mg cada 24 h.",
  ],
  [
    "espironolactona",
    "Insuficiencia cardíaca, presión alta y edemas.",
    "25-100 mg cada 24 h.",
  ],
  [
    "finasteride",
    "Próstata agrandada (5 mg) o caída del cabello (1 mg).",
    "1 comprimido cada 24 h.",
  ],
  [
    "fórm.etapa 1",
    "Leche de fórmula infantil (0-6 meses).",
    "Tomas cada 3-4 h, preparadas según la tabla del envase.",
  ],
  [
    "fórm.etapa 2",
    "Leche de fórmula infantil (6-12 meses).",
    "Tomas cada 4-6 h junto con la alimentación, según la tabla del envase.",
  ],
  [
    "fórm.etapa 3",
    "Leche de fórmula infantil (desde 1 año).",
    "1 taza cada 8-12 h, según la tabla del envase.",
  ],
  [
    "gabapentin",
    "Dolor neuropático y epilepsia.",
    "Cada 8 h; se aumenta de a poco hasta 300-600 mg por toma.",
  ],
  [
    "imatinib",
    "Tratamiento oncológico (leucemia, GIST).",
    `Cada 24 h con comida; ${ESP}`,
  ],
  [
    "meloxicam",
    "Dolor e inflamación (artrosis, artritis).",
    "7,5-15 mg cada 24 h con comida.",
  ],
  [
    "pazopanib",
    "Tratamiento oncológico (cáncer renal y sarcomas).",
    `Cada 24 h sin comida; ${ESP}`,
  ],
  [
    "pomalidomida",
    "Tratamiento oncológico (mieloma múltiple).",
    `Cada 24 h los días 1 a 21 de ciclos de 28 días; ${ESP}`,
  ],
  [
    "proteínas+vitaminas+minerales",
    "Suplemento nutricional.",
    "1 toma cada 12-24 h según envase.",
  ],
  [
    "sulfametoxazol+trimetoprima",
    "Infecciones urinarias y otras infecciones bacterianas.",
    "800/160 mg cada 12 h, 3-14 días según la infección.",
  ],
  [
    "tióctico,ác.",
    "Neuropatía diabética.",
    "600 mg cada 24 h en ayunas. Inyectable: 600 mg IV cada 24 h, uso médico.",
  ],
  [
    "empagliflozina",
    "Diabetes tipo 2 e insuficiencia cardíaca.",
    "10-25 mg cada 24 h.",
  ],
  [
    "lurasidona,clorhidrato",
    "Esquizofrenia y depresión bipolar.",
    "Cada 24 h con comida; dosis según indicación médica.",
  ],
  [
    "midazolam",
    "Sedación (uso médico).",
    "Inyectable: lo aplica el médico (sedación). Comprimidos: 7,5-15 mg cada 24 h justo antes de acostarse, máx. 2 semanas.",
  ],
  [
    "nilotinib",
    "Tratamiento oncológico (leucemia).",
    `Cada 12 h, en ayunas; ${ESP}`,
  ],
  [
    "salbutamol",
    "Broncoespasmo (asma).",
    "1-2 inhalaciones cada 4-6 h si hace falta. Jarabe: 2-4 mg cada 6-8 h.",
  ],
  ["solifenacina", "Vejiga hiperactiva.", "5-10 mg cada 24 h."],
  ["axitinib", "Tratamiento oncológico (cáncer renal).", `Cada 12 h; ${ESP}`],
  [
    "carboplatino",
    "Tratamiento oncológico (ovario, pulmón y otros).",
    `Infusión en el hospital cada 21-28 días; ${ESP}`,
  ],
  ["enalapril+hidroclorotiazida", "Presión alta.", "1 comprimido cada 24 h."],
  [
    "fenofibrato micronizado",
    "Triglicéridos y colesterol altos.",
    "1 cápsula cada 24 h con comida.",
  ],
  [
    "hialuronato sódico",
    "Lubricante (ojo seco) o articular.",
    "Gotas: cada 4-8 h. Inyección articular: la aplica el médico. Crema o gel: cada 8-12 h sobre la zona.",
  ],
  [
    "morfina,clorhidrato",
    "Dolor intenso.",
    "Liberación inmediata: cada 4 h. Prolongada: cada 12 h. Dosis según indicación médica (receta oficial). Inyectable: uso médico u hospitalario, cada 4 h según el dolor.",
  ],
  [
    "nimodipina",
    "Circulación cerebral.",
    "Cada 4 h tras hemorragia cerebral, o 30 mg cada 8 h en otros usos, según indicación médica.",
  ],
  ["pirfenidona", "Fibrosis pulmonar.", `Cada 8 h con comida; ${ESP}`],
  [
    "propóleo+asoc.",
    "Garganta irritada.",
    "1 pastilla o pulverización cada 3-4 h, según el envase.",
  ],
  [
    "tobramicina+dexametasona",
    "Infección e inflamación del ojo.",
    "1-2 gotas cada 4-6 h.",
  ],
  [
    "vit.a+vit.e+asoc.",
    "Suplemento dietario.",
    "1 toma cada 24 h con una comida.",
  ],
  [
    "allopurinol",
    "Gota y ácido úrico alto.",
    "100-300 mg cada 24 h después de comer.",
  ],
  [
    "clorhexidina+asoc.",
    "Antiséptico bucal o de la piel.",
    "Enjuague cada 12 h. Piel: cada 12-24 h según la presentación.",
  ],
  ["levocetirizina", "Alergia.", "5 mg cada 24 h."],
  ["potasio,nitrato+asoc.", "Sensibilidad dental.", "Cepillado cada 12 h."],
  ["vildagliptin", "Diabetes tipo 2.", "50 mg cada 12-24 h."],
  ["vortioxetina", "Depresión.", "10 mg cada 24 h (5-20 mg)."],
  [
    "abiraterona,acetato",
    "Tratamiento oncológico (cáncer de próstata).",
    `1.000 mg cada 24 h en ayunas, con prednisona; ${ESP}`,
  ],
  ["adapaleno", "Acné.", "Capa fina cada 24 h, a la noche."],
  [
    "afatinib",
    "Tratamiento oncológico (cáncer de pulmón).",
    `Cada 24 h en ayunas; ${ESP}`,
  ],
  [
    "betametasona+gentamic.+miconazol",
    "Infección e inflamación de la piel.",
    "Aplicar cada 12 h, hasta 2 semanas.",
  ],
  [
    "cabozantinib",
    "Tratamiento oncológico (riñón, hígado, tiroides).",
    `Cada 24 h en ayunas; ${ESP}`,
  ],
  [
    "capecitabina",
    "Tratamiento oncológico (colon, mama).",
    `Cada 12 h después de comer, 14 días de ciclos de 21; ${ESP}`,
  ],
  [
    "diclofenac sódico+paracetamol",
    "Dolor e inflamación.",
    "1 comprimido cada 8-12 h con comida.",
  ],
  [
    "difenhidramina",
    "Alergia, picazón e insomnio ocasional.",
    "25-50 mg cada 6-8 h. Da sueño. Inyectable: 10-50 mg IM o IV cada 6-8 h; la aplica un profesional.",
  ],
  [
    "duloxetina",
    "Depresión, ansiedad, dolor neuropático y fibromialgia.",
    "60 mg cada 24 h (30-120 mg).",
  ],
  [
    "famotidina",
    "Acidez y úlcera.",
    "Acidez (venta libre, 10 mg): 10 mg cuando aparece, se puede repetir cada 12 h (máx. 20 mg/día). Úlcera: 20 mg cada 12 h o 40 mg cada 24 h según indicación médica.",
  ],
  [
    "fluoxetina",
    "Depresión, ansiedad y bulimia.",
    "20 mg cada 24 h a la mañana.",
  ],
  [
    "fluticasona",
    "Corticoide inhalado o nasal (asma, rinitis).",
    "Inhalador: cada 12 h. Spray nasal: cada 24 h.",
  ],
  [
    "glicólico,ác.+asoc.",
    "Renovación de la piel (manchas, acné).",
    "Aplicar cada 24 h a la noche.",
  ],
  ["glimepiride", "Diabetes tipo 2.", "1-4 mg cada 24 h con el desayuno."],
  [
    "insulina humana",
    "Diabetes.",
    "NPH: cada 12-24 h. Corriente: 30 min antes de cada comida. Dosis individual según indicación médica.",
  ],
  [
    "iodopovidona",
    "Antiséptico para piel y heridas.",
    "Aplicar cada 8-12 h según necesidad.",
  ],
  [
    "minoxidil",
    "Caída del cabello (loción).",
    "Loción: 1 ml cada 12 h sobre cuero cabelludo seco. Comprimidos: cada 12-24 h en la dosis que indica el médico (presión alta o caída del cabello).",
  ],
  [
    "rivastigmina",
    "Alzheimer y demencia por Parkinson.",
    "Parche: cada 24 h. Cápsulas: cada 12 h con comida; se ajusta.",
  ],
  [
    "somatotrofina",
    "Déficit de hormona de crecimiento.",
    `Inyección cada 24 h a la noche; ${ESP}`,
  ],
  [
    "sunitinib",
    "Tratamiento oncológico (riñón, GIST).",
    `Cada 24 h, 4 semanas con 2 de descanso; ${ESP}`,
  ],
  ["telmisartán+hidroclorotiazida", "Presión alta.", "1 comprimido cada 24 h."],
  [
    "tramadol+paracetamol",
    "Dolor moderado a intenso.",
    "1-2 comprimidos cada 6 h (máx. 8 por día).",
  ],
  [
    "treprostinil",
    "Hipertensión pulmonar.",
    `Infusión continua o inhalaciones cada 6 h; ${ESP}`,
  ],
  ["urea", "Hidratación de piel seca o engrosada.", "Aplicar cada 12-24 h."],
  [
    "vit.+minerales+asoc.",
    "Suplemento dietario.",
    "1 toma cada 24 h con una comida.",
  ],
  [
    "aloe vera+asoc.",
    "Hidratación y cuidado de la piel.",
    "Aplicar cada 8-12 h.",
  ],
  ["aloe vera", "Hidratación y cuidado de la piel.", "Aplicar cada 8-12 h."],
  ["anastrozol", "Cáncer de mama hormonodependiente.", "1 mg cada 24 h."],
  [
    "azacitidina",
    "Tratamiento oncológico (síndromes mielodisplásicos, leucemia).",
    `Inyección cada 24 h por 7 días en ciclos de 28; ${ESP}`,
  ],
  ["cefadroxilo", "Infecciones bacterianas.", "500 mg-1 g cada 12 h, 10 días."],
  [
    "dapagliflozina",
    "Diabetes tipo 2, insuficiencia cardíaca y renal.",
    "10 mg cada 24 h.",
  ],
  ["dexlansoprazol", "Reflujo y acidez.", "30-60 mg cada 24 h."],
  ["dutasteride", "Agrandamiento benigno de la próstata.", "0,5 mg cada 24 h."],
  ["eplerenona", "Insuficiencia cardíaca.", "25-50 mg cada 24 h."],
  [
    "haloperidol",
    "Psicosis y agitación.",
    "Cada 8-12 h según indicación médica. Inyectable: 5 mg IM; se puede repetir cada 1 h si hace falta (máx. 20 mg/día). La aplica un profesional.",
  ],
  [
    "hierro+fólico,ác.",
    "Anemia y embarazo.",
    "1 toma cada 24 h (o cada 8-12 h si lo indica el médico), lejos del té, café y lácteos.",
  ],
  ["lacosamida", "Epilepsia.", "50-200 mg cada 12 h; se ajusta."],
  [
    "terazosina",
    "Próstata agrandada y presión alta.",
    "1-10 mg cada 24 h a la noche; se empieza con 1 mg.",
  ],
  [
    "acetilsalicílico,ác.",
    "Dolor y fiebre (500 mg) o antiagregante (75-100 mg, como Aspirinetas).",
    "Dolor: 500 mg cada 6-8 h. Antiagregante (100 mg): 1 comprimido cada 24 h.",
  ],
  [
    "bendamustina,clorh.",
    "Tratamiento oncológico (linfomas, leucemia).",
    `Infusión en el hospital cada 24 h los días 1 y 2 de ciclos de 21-28 días; ${ESP}`,
  ],
  [
    "bosentan",
    "Hipertensión pulmonar.",
    "62,5 mg cada 12 h por 4 semanas y luego 125 mg cada 12 h, según el especialista.",
  ],
  ["brivaracetam", "Epilepsia.", "50-100 mg cada 12 h."],
  [
    "carbón activado",
    "Gases y distensión abdominal.",
    "Cada 8 h después de las comidas, según envase.",
  ],
  [
    "ciprofloxacina+dexametasona",
    "Infección e inflamación de oído u ojo.",
    "Gotas cada 8-12 h según el envase.",
  ],
  ["desvenlafaxina", "Depresión.", "50 mg cada 24 h."],
  [
    "diazepam",
    "Ansiedad, contracturas y convulsiones.",
    "2-10 mg cada 6-12 h. No suspender de golpe. Inyectable: 2-10 mg IM o IV lenta; se puede repetir a las 3-4 h. La aplica un profesional.",
  ],
  [
    "domperidona",
    "Náuseas y digestión lenta.",
    "10 mg cada 8 h antes de las comidas, máx. 7 días.",
  ],
  [
    "enzalutamida",
    "Tratamiento oncológico (cáncer de próstata).",
    `160 mg cada 24 h; ${ESP}`,
  ],
  [
    "ivermectina",
    "Parásitos: sarna, piojos y gusanos.",
    "Oral: dosis única según peso, a veces repetida a los 7 días. Loción: dosis única, repetir a los 7 días si hace falta. Crema (rosácea): cada 24 h.",
  ],
  ["peg 3350", "Constipación.", "1 sobre (17 g) disuelto en agua cada 24 h."],
  [
    "pemetrexed",
    "Tratamiento oncológico (pulmón, mesotelioma).",
    `Infusión en el hospital cada 21 días; ${ESP}`,
  ],
  [
    "resveratrol+asoc.",
    "Suplemento dietario antioxidante.",
    "1 toma cada 24 h.",
  ],
  [
    "sacubitrilo+valsartán",
    "Insuficiencia cardíaca.",
    "Cada 12 h; dosis según indicación médica.",
  ],
  [
    "semaglutida",
    "Diabetes tipo 2 y obesidad.",
    "Inyectable: cada 7 días con dosis creciente. Oral: cada 24 h en ayunas.",
  ],
  ["siliconas", "Cicatrices.", "Aplicar cada 12 h."],
  ["sodio,fluoruro+asoc.", "Prevención de caries.", "Cepillado cada 8-12 h."],
  [
    "amitriptilina",
    "Depresión, dolor crónico y prevención de migraña.",
    "10-25 mg cada 24 h a la noche; se ajusta.",
  ],
  // Venta libre de mostrador (pedido del 18/11/2026).
  [
    "hioscina,n-butilbr.",
    "Cólicos y dolor abdominal tipo espasmo.",
    "10-20 mg (1-2 grageas o perlas) cada 6-8 h (máx. 100 mg/día). Inyectable: 20-40 mg IM, IV lenta o SC cada 6-8 h si hace falta (máx. 100 mg/día).",
  ],
  [
    "hioscina,n-butilbr.+ibuprofeno",
    "Dolor menstrual y cólicos con dolor.",
    "1 comprimido cada 8 h con comida (máx. 3 por día).",
  ],
  [
    "hioscina,n-butilbr.+paracetamol",
    "Cólicos y dolor abdominal con dolor intenso (Buscapina Duo y Compositum N).",
    "1-2 comprimidos cada 8 h (máx. 6 por día).",
  ],
  [
    "hioscina,n-butilbr.+dipirona",
    "Cólicos con dolor (Buscapina Compositum).",
    "1-2 comprimidos cada 8 h (máx. 6 por día). Inyectable: 1 ampolla IM o IV muy lenta; se puede repetir a las 8 h si hace falta (máx. 2 ampollas por día: 5 g de dipirona). La aplica un profesional.",
  ],
  [
    "propinox",
    "Cólicos y dolor abdominal tipo espasmo.",
    "10-20 mg cada 6-8 h.",
  ],
  [
    "propinox+clonixinato de lisina",
    "Cólicos con dolor (abdominales, menstruales, renales).",
    "1 comprimido cada 6-8 h (máx. 4 por día).",
  ],
  [
    "acetilsalicílico,ác.+cafeína",
    "Dolor de cabeza y dolores leves a moderados.",
    "1-2 comprimidos cada 6-8 h si hace falta, con comida (máx. 4 g de aspirina por día).",
  ],
  [
    "sodio,bicarbonato+asoc.",
    "Acidez y malestar estomacal.",
    "Oral: 1 sobre o 1 cucharadita disuelta en agua cada 8 h después de las comidas (máx. 3 por día), solo por pocos días.",
  ],
];

export const DOSIS_ORIENTATIVAS: Record<string, DosisOrientativa> = {
  ...tanda(TANDA_1),
  ...DOSIS_TANDA_2,
  ...DOSIS_TANDA_3,
  ...DOSIS_TANDA_4,
  ...DOSIS_TANDA_5,
  ...DOSIS_TANDA_6,
  ...DOSIS_TANDA_7,
  ...DOSIS_TANDA_8,
};
