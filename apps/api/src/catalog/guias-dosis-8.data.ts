// Dosis orientativas, tanda 8 (SISTEMA-108). Ver guias-dosis.data.ts.
import { tanda, type FilaDosis } from "./guias-dosis";

const ESP = "la dosis la indica el médico especialista.";
const HOSP = "Uso hospitalario: lo aplica el equipo de salud";
const CONTRASTE =
  "Dosis única durante el estudio, la aplica el servicio de imágenes.";
const LUBRICANTE_OCULAR = "1-2 gotas cada 4-6 h o cuando haga falta.";
const PIOJOS = "Dosis única; repetir a los 7 días.";
const SOLAR = "Aplicar 30 min antes de exponerse y renovar cada 2 h.";

const FILAS: FilaDosis[] = [
  [
    "lutetio-177 vipivotida tetraxetan",
    "Cáncer de próstata (medicina nuclear).",
    `Infusión cada 42 días, hasta 6 dosis; ${ESP}`,
  ],
  ["luteína+vit.c+vit.e+asoc.", "Salud visual.", "1 cápsula cada 24 h."],
  [
    "magaldrato+simeticona",
    "Acidez y gases.",
    "10 ml cada 6-8 h, 1 h después de las comidas y al acostarse.",
  ],
  ["magnesio glicinato", "Suplemento de magnesio.", "1-2 cápsulas cada 24 h."],
  [
    "magnesio treonato+asoc.",
    "Suplemento de magnesio (memoria, sueño).",
    "1-2 comprimidos cada 24 h.",
  ],
  ["magnesio+ginseng+asoc.", "Cansancio y energía.", "1 sobre cada 24 h."],
  ["magnesio+vit.b6+zinc", "Suplemento de magnesio.", "1 cápsula cada 24 h."],
  [
    "maitake,zinc+asoc",
    "Suplemento de hongos medicinales.",
    "1 cápsula cada 24 h.",
  ],
  ["maltodextrina+asoc.", "Hidratación de la piel.", "Aplicar cada 12-24 h."],
  [
    "manitol",
    "Reducir la presión dentro del cráneo o del ojo.",
    `${HOSP}, cada 6-8 h.`,
  ],
  ["matrixil", "Antienvejecimiento de la piel.", "Aplicar cada 12 h."],
  [
    "mebeverina",
    "Colon irritable.",
    "200 mg cada 12 h (o 135 mg cada 8 h) antes de las comidas.",
  ],
  [
    "meclizina,clorhidrato",
    "Mareo en viajes y vértigo.",
    "25-50 mg 1 h antes del viaje; se puede repetir cada 24 h.",
  ],
  [
    "megestrol",
    "Falta de apetito y algunos cánceres.",
    "160-800 mg cada 24 h según indicación médica.",
  ],
  ["meglumina,gadoterato", "Contraste para resonancia.", CONTRASTE],
  [
    "melena de leon,l-teanina+asoc.",
    "Memoria y concentración.",
    "1 cápsula cada 24 h.",
  ],
  ["melisa+asoc.", "Nerviosismo y relajación.", "1 comprimido cada 8-12 h."],
  ["meloxicam+diacereína", "Artrosis.", "1 de cada uno cada 24 h con comida."],
  ["mentol", "Garganta y congestión.", "1 pastilla cada 2-3 h."],
  [
    "mentol+alcanfor+asoc.",
    "Congestión nasal (bálsamo).",
    "Aplicar en el pecho cada 8-12 h o inhalar los vapores.",
  ],
  ["mentol+eucaliptol", "Dolor muscular (gel).", "Aplicar cada 6-8 h."],
  ["meperidina", "Dolor intenso.", `${HOSP}, cada 3-4 h.`],
  [
    "metaraminol",
    "Presión baja.",
    `${HOSP}, dosis repetidas o infusión continua.`,
  ],
  [
    "metirapona",
    "Diagnóstico o tratamiento del síndrome de Cushing.",
    "Cada 4-6 h según indicación del especialista.",
  ],
  [
    "metoclopramida+asoc.",
    "Acidez con náuseas.",
    "1 comprimido cada 8 h antes de las comidas, máx. 5 días.",
  ],
  [
    "metoxsaleno",
    "Psoriasis y vitiligo (con luz ultravioleta).",
    "Dosis única 1-2 h antes de cada sesión de luz (cada 48-72 h).",
  ],
  [
    "metronidazol+miconazol",
    "Infecciones vaginales.",
    "1 óvulo cada 24 h a la noche, 7 días.",
  ],
  ["mianserina", "Depresión.", "30-90 mg cada 24 h a la noche."],
  [
    "miconazol,nitr.+óx.de zinc",
    "Paspaduras con hongos.",
    "Aplicar en cada cambio de pañal o cada 8-12 h.",
  ],
  [
    "mifepristona",
    "Uso ginecológico (solo con indicación médica).",
    "Dosis única según el protocolo médico.",
  ],
  [
    "mifepristona+misoprostol",
    "Uso ginecológico (solo con indicación médica).",
    "Mifepristona dosis única y misoprostol 24-48 h después, según el protocolo médico.",
  ],
  ["mitotano", "Cáncer suprarrenal.", `Cada 6-8 h con comida; ${ESP}`],
  [
    "mitoxantrona",
    "Tratamiento oncológico y esclerosis múltiple.",
    `Infusión cada 21-90 días; ${ESP}`,
  ],
  [
    "monacolina k",
    "Colesterol (levadura roja de arroz).",
    "1 cápsula cada 24 h a la noche.",
  ],
  ["moringa+arginina", "Suplemento dietario.", "1 comprimido cada 24 h."],
  [
    "moxifloxacina+dexametasona clor.",
    "Infección e inflamación del ojo.",
    "1 gota cada 6-8 h.",
  ],
  [
    "nafazolina+cromoglicato disódico",
    "Rinitis alérgica con congestión.",
    "Aplicar cada 6-8 h, máx. 5 días.",
  ],
  [
    "nandrolona",
    "Anemia renal y pérdida de masa muscular (uso médico).",
    "Inyección cada 7-21 días según indicación médica.",
  ],
  [
    "naproxeno+esomeprazol",
    "Dolor e inflamación con protección gástrica.",
    "1 comprimido cada 12 h, 30 min antes de comer.",
  ],
  [
    "naratriptán",
    "Crisis de migraña.",
    "2,5 mg al inicio; se puede repetir a las 4 h (máx. 5 mg cada 24 h).",
  ],
  [
    "nepafenac",
    "Inflamación y dolor después de cirugía de ojo.",
    "1 gota cada 8 h.",
  ],
  ["netarsudil,mesilato", "Glaucoma.", "1 gota cada 24 h a la noche."],
  [
    "netupitant+palonosetrón",
    "Prevención de vómitos por quimioterapia.",
    "1 cápsula dosis única 1 h antes de la quimioterapia.",
  ],
  [
    "niflúmico,ác.+orfenadrina",
    "Dolor con contractura muscular.",
    "1 comprimido cada 8-12 h con comida.",
  ],
  [
    "nistatina+neomicina+asoc.",
    "Infecciones vaginales.",
    "1 óvulo cada 24 h a la noche, 6-10 días.",
  ],
  [
    "nivolumab+relatlimab",
    "Melanoma (inmunoterapia).",
    `Infusión cada 28 días; ${ESP}`,
  ],
  [
    "nomegestrol",
    "Trastornos menstruales.",
    "5 mg cada 24 h según el esquema indicado.",
  ],
  [
    "norelgestromin+etinilestradiol",
    "Anticonceptivo (parche).",
    "1 parche cada 7 días por 3 semanas y 7 días de descanso.",
  ],
  [
    "noretisterona",
    "Trastornos menstruales y endometriosis.",
    "5-10 mg cada 8-24 h según el esquema indicado.",
  ],
  [
    "norfloxacina+fenazopiridina",
    "Infección urinaria con ardor.",
    "Norfloxacina cada 12 h y fenazopiridina cada 8 h los 2 primeros días.",
  ],
  [
    "nusinersen",
    "Atrofia muscular espinal.",
    "Inyección intratecal: 4 dosis de carga y luego cada 120 días.",
  ],
  [
    "obinutuzumabe",
    "Tratamiento oncológico (leucemia, linfoma).",
    `Infusión cada 7 días al inicio y luego cada 28 días; ${ESP}`,
  ],
  ["octopirox+asoc.", "Caspa y dermatitis seborreica.", "Champú cada 48-72 h."],
  [
    "ofatumumab",
    "Esclerosis múltiple.",
    "Inyección cada 7 días las 3 primeras y luego cada 28 días.",
  ],
  [
    "oligoelementos",
    "Nutrición parenteral.",
    `${HOSP}, cada 24 h en la nutrición.`,
  ],
  [
    "omega 3-6+avena+pantenol+vit.e",
    "Piel seca o atópica.",
    "Aplicar cada 12-24 h.",
  ],
  ["omeprazol+asoc.", "Acidez y úlcera.", "1 cápsula cada 24 h en ayunas."],
  [
    "ornidazol",
    "Infecciones por anaerobios y parásitos.",
    "500 mg cada 12 h, 5-10 días.",
  ],
  [
    "oseltamivir",
    "Gripe (tratamiento y prevención).",
    "75 mg cada 12 h por 5 días (prevención: cada 24 h por 10 días).",
  ],
  [
    "oximetazolina clor.+asoc.",
    "Ojos rojos e irritados.",
    "1-2 gotas cada 6 h, máx. 3 días.",
  ],
  [
    "oximetazolina+hialuronato sódico",
    "Ojos rojos con sequedad.",
    "1-2 gotas cada 6 h, máx. 3 días.",
  ],
  [
    "paclitaxel albúmina",
    "Tratamiento oncológico (mama, páncreas, pulmón).",
    `Infusión cada 7-21 días según el esquema; ${ESP}`,
  ],
  [
    "panitumumab",
    "Tratamiento oncológico (colon).",
    `Infusión cada 14 días; ${ESP}`,
  ],
  [
    "paracetamol+difenhidramina+asoc.",
    "Resfrío y dolor (con sueño).",
    "1 gragea cada 6-8 h (máx. 4 por día). Da sueño.",
  ],
  [
    "paracetamol+orfenadrina",
    "Dolor con contractura muscular.",
    "1 comprimido cada 8 h.",
  ],
  [
    "paroxetina mesilato",
    "Sofocos de la menopausia.",
    "7,5 mg cada 24 h antes de dormir.",
  ],
  [
    "part.similares a hpv (vlp)",
    "Vacuna contra el VPH.",
    "2 dosis, la segunda cada 180 días de la primera (o 3 dosis según edad).",
  ],
  [
    "patirómero",
    "Potasio alto.",
    "1 sobre cada 24 h con comida, separado de otros medicamentos.",
  ],
  [
    "peg 3350+bisacodilo",
    "Limpieza intestinal antes de estudios.",
    "Según el instructivo: bisacodilo y luego tomas cada 10-15 min de la solución.",
  ],
  [
    "pegaspargasa",
    "Tratamiento oncológico (leucemia).",
    `Inyección cada 14 días según el esquema; ${ESP}`,
  ],
  [
    "pegcetacoplan",
    "Hemoglobinuria paroxística nocturna.",
    "Infusión subcutánea cada 72-96 h (2 veces por semana).",
  ],
  [
    "penicilamina",
    "Enfermedad de Wilson, cistinuria y artritis.",
    "Cada 6-12 h en ayunas; dosis según el especialista.",
  ],
  [
    "pentano+butano",
    "Golpes (frío local en aerosol).",
    "Aplicar unos segundos; repetir cada 2-4 h si hace falta.",
  ],
  [
    "pentosan polisulfato",
    "Cistitis intersticial.",
    "100 mg cada 8 h en ayunas.",
  ],
  ["permetrina+asoc.", "Piojos y sarna.", PIOJOS],
  ["permetrina+etilo,aminobenzoato", "Piojos y sarna.", PIOJOS],
  [
    "pertuzumab",
    "Tratamiento oncológico (mama).",
    `Infusión cada 21 días; ${ESP}`,
  ],
  [
    "peróxido de calcio+asoc.",
    "Blanqueamiento dental.",
    "Cepillado cada 12 h.",
  ],
  [
    "peróxido de hidrógeno",
    "Limpieza de lentes de contacto.",
    "Cada 24 h al sacarlos, dejar al menos 6 h en el estuche neutralizador.",
  ],
  [
    "phaseolus vulgaris",
    "Suplemento para el control del peso.",
    "1 comprimido antes de cada comida principal (cada 8-12 h).",
  ],
  [
    "phaseolus vulgaris+asoc.",
    "Suplemento para el control del peso.",
    "1 comprimido antes de cada comida principal (cada 8-12 h).",
  ],
  ["phytoqueratina+biotina+asoc.", "Uñas frágiles.", "Aplicar cada 24-48 h."],
  [
    "pirazinamida",
    "Tuberculosis.",
    "Cada 24 h; dosis según peso, en combinación.",
  ],
  [
    "pirimetamina",
    "Toxoplasmosis.",
    "Cada 24 h con ácido folínico; dosis según indicación médica.",
  ],
  [
    "piroxicam+carisoprodol+asoc.",
    "Dolor con contractura muscular.",
    "1 comprimido cada 12-24 h con comida.",
  ],
  [
    "piroxicam+vit.b12",
    "Dolor e inflamación con neuritis.",
    "1 comprimido cada 24 h con comida.",
  ],
  ["poliacrílico,ác.", "Lubricante ocular (ojo seco).", "1 gota cada 6-8 h."],
  [
    "polietilenglicol+propilenglicol+asoc.",
    "Lubricante ocular (ojo seco).",
    LUBRICANTE_OCULAR,
  ],
  [
    "polietileno,microgránulos",
    "Exfoliante para piel grasa.",
    "Usar cada 24-72 h.",
  ],
  [
    "polisac.meningocóc.acyw135",
    "Vacuna contra el meningococo.",
    "Dosis única (refuerzo según edad y riesgo).",
  ],
  [
    "polisacaridosulfúrico,ác.(éster)",
    "Golpes, moretones y várices.",
    "Aplicar cada 8-12 h.",
  ],
  [
    "polisacáridos de neumococos",
    "Vacuna contra el neumococo (23 serotipos).",
    "Dosis única; refuerzo a los 5 años (1.825 días) en algunos casos.",
  ],
  [
    "polisorbato 80+glicerina",
    "Lubricante ocular (ojo seco).",
    LUBRICANTE_OCULAR,
  ],
  ["poliuretano", "Parches para cicatrices.", "Cambiar cada 24-72 h."],
  [
    "polímeros de dextrosa",
    "Aporte de calorías.",
    "Agregar en comidas cada 8 h según el nutricionista.",
  ],
  ["potasio", "Suplemento de potasio.", "1 cápsula cada 24 h."],
  ["potasio,citrato+asoc.", "Suplemento de potasio.", "1 cápsula cada 24 h."],
  [
    "povidona+asoc.",
    "Lubricante ocular para lentes de contacto.",
    LUBRICANTE_OCULAR,
  ],
  [
    "pralatrexato",
    "Tratamiento oncológico (linfoma).",
    `Infusión cada 7 días por 6 semanas en ciclos de 7; ${ESP}`,
  ],
  [
    "pramoxina+fenilefrina+asoc.",
    "Hemorroides.",
    "Aplicar cada 6-8 h y después de cada deposición.",
  ],
  [
    "praziquantel",
    "Parásitos (tenias y otros).",
    "Dosis única según peso, o cada 8 h por 1 día según el parásito.",
  ],
  [
    "prednisolona",
    "Inflamación del ojo (colirio) o corticoide oral.",
    "Colirio: 1-2 gotas cada 6-12 h. Oral: cada 24 h a la mañana.",
  ],
  [
    "prednisolona+cloramfenicol",
    "Otitis o infección con inflamación.",
    "Gotas cada 8 h, 7 días.",
  ],
  [
    "probiót.+vit.c+vit.d+beta-glucanos+zinc",
    "Refuerzo de defensas.",
    "1 cápsula cada 24 h.",
  ],
  [
    "propilenglicol+asoc.",
    "Lubricante íntimo.",
    "Dosis única antes de cada relación.",
  ],
  [
    "propinox+dipirona",
    "Cólicos con dolor.",
    "1 comprimido cada 6-8 h (máx. 4 por día).",
  ],
  [
    "propranolol,clorh.",
    "Hemangioma infantil (solución) u otros usos.",
    "Cada 12 h con comida; dosis según peso, indicada por el médico.",
  ],
  [
    "proteínas plasmáticas",
    "Inmunoglobulina (defensas).",
    `Infusión cada 21-28 días; ${ESP}`,
  ],
  [
    "proteínas+minerales",
    "Suplemento proteico.",
    "1 toma cada 12-24 h según el nutricionista.",
  ],
  [
    "pseudoefedrina+asoc.",
    "Congestión nasal con alergia.",
    "1 comprimido cada 6-8 h (máx. 4 por día).",
  ],
  ["psidium guajava", "Diarrea leve (guayaba).", "1 comprimido cada 8 h."],
  [
    "psyllium+asoc.",
    "Constipación.",
    "1-2 comprimidos cada 12-24 h con abundante agua.",
  ],
  [
    "pygeum africanum+serenoa rep.",
    "Agrandamiento benigno de la próstata.",
    "1 cápsula cada 24 h.",
  ],
  [
    "péptido cúprico",
    "Caída del cabello.",
    "Aplicar cada 24 h en el cuero cabelludo.",
  ],
  [
    "quinidina,sulfato",
    "Arritmias.",
    "200-400 mg cada 6-8 h según indicación médica.",
  ],
  [
    "quinina,sulfato",
    "Calambres nocturnos o malaria.",
    "Calambres: 200-300 mg cada 24 h a la noche. Malaria: cada 8 h según indicación.",
  ],
  [
    "racotumomab",
    "Vacuna terapéutica (cáncer de pulmón).",
    "Inyección cada 14 días al inicio y luego cada 28 días.",
  ],
  ["ramipril+hidroclorotiazida", "Presión alta.", "1 comprimido cada 24 h."],
  [
    "ranibizumab",
    "Degeneración macular y edema de retina.",
    "Inyección en el ojo cada 28 días o según controles.",
  ],
  [
    "ranitidina",
    "Acidez y úlcera.",
    "150 mg cada 12 h o 300 mg a la noche. Inyectable: cada 6-8 h, uso médico.",
  ],
  [
    "rasburicasa",
    "Ácido úrico alto por quimioterapia.",
    `${HOSP}, cada 24 h por hasta 7 días.`,
  ],
  ["rebamipida", "Ojo seco.", "1 gota cada 6 h."],
  ["reishi,melisa+asoc", "Relajación y defensas.", "1 cápsula cada 24 h."],
  ["remdesivir", "COVID-19.", `${HOSP}, cada 24 h por 3-5 días.`],
  [
    "resinas neutras",
    "Adhesivo para vendajes y apósitos.",
    "Aplicar en cada curación (cada 24-72 h).",
  ],
  [
    "resveratrol+coenzima q10+vit.+asoc.",
    "Suplemento antioxidante.",
    "1 cápsula cada 24 h.",
  ],
  [
    "ribavirina",
    "Hepatitis C y otras infecciones virales.",
    "Cada 12 h con comida; dosis según peso, en combinación.",
  ],
  [
    "ribosomas+proteoglicanos",
    "Prevención de infecciones respiratorias.",
    "1 comprimido cada 24 h en ayunas, 4 días por semana.",
  ],
  ["rifabutina", "Tuberculosis y micobacterias.", "150-300 mg cada 24 h."],
  [
    "rifampicina+isoniacida",
    "Tuberculosis.",
    "Cada 24 h en ayunas; dosis según peso.",
  ],
  [
    "rifampicina+isoniazida+pirazinamida+etambutol",
    "Tuberculosis.",
    "Cada 24 h en ayunas; cantidad de comprimidos según peso.",
  ],
  [
    "rilpivirina",
    "VIH.",
    "Oral: 25 mg cada 24 h con comida. Inyectable: cada 30-60 días.",
  ],
  [
    "rilpivirina+emtricitabina+tenofovir dis.fumarato",
    "VIH.",
    "1 comprimido cada 24 h con comida.",
  ],
  [
    "risdiplam",
    "Atrofia muscular espinal.",
    "Cada 24 h después de una comida; dosis según peso.",
  ],
  [
    "romiplostim",
    "Plaquetas bajas (trombocitopenia inmune).",
    "Inyección cada 7 días; dosis según plaquetas.",
  ],
  [
    "romosozumab",
    "Osteoporosis grave.",
    "Inyección cada 30 días por 12 meses.",
  ],
  [
    "rosuvastatina+fenofibrato",
    "Colesterol y triglicéridos altos.",
    "1 de cada uno cada 24 h.",
  ],
  [
    "ruibarbo,extr.+salicílico,ác.",
    "Aftas y llagas en la boca.",
    "Aplicar cada 6-8 h.",
  ],
  [
    "sacituzumab govitecán",
    "Tratamiento oncológico (mama).",
    `Infusión cada 7 días (días 1 y 8) en ciclos de 21 días; ${ESP}`,
  ],
  [
    "salicílico,ác.+glicólico,ác.+retinol",
    "Piel áspera y renovación.",
    "Aplicar cada 24 h a la noche.",
  ],
  [
    "salicílico,ác.+mandélico,ác.",
    "Piel grasa (astringente).",
    "Aplicar cada 12 h.",
  ],
  [
    "sapropterina,diclorh.",
    "Fenilcetonuria.",
    "Cada 24 h a la mañana; dosis según peso.",
  ],
  ["sarilumab", "Artritis reumatoidea.", "Inyección cada 14 días."],
  [
    "satralizumab",
    "Neuromielitis óptica.",
    "Inyección a las 0, 2 y 4 semanas y luego cada 28 días.",
  ],
  ["saxagliptina", "Diabetes tipo 2.", "5 mg cada 24 h."],
  ["selegilina", "Parkinson.", "5 mg cada 12 h (desayuno y almuerzo)."],
  ["selenio glicinato", "Suplemento antioxidante.", "1 comprimido cada 24 h."],
  [
    "serenoa repens+asoc.",
    "Agrandamiento benigno de la próstata.",
    "1 cápsula cada 12-24 h con comida.",
  ],
  [
    "serotipos de virus del dengue vivos atenuados",
    "Vacuna contra el dengue.",
    "2 dosis, la segunda cada 90 días de la primera.",
  ],
  [
    "simeticona+asoc.",
    "Repelente de insectos para el hogar.",
    "Aplicar cada 6-8 h según el envase.",
  ],
  [
    "sodio,carbonato",
    "Ablandar la cera del oído.",
    "3-5 gotas cada 8-12 h, 3-4 días.",
  ],
  [
    "sodio,dioctilsulfosuccinato",
    "Tapón de cera del oído.",
    "Llenar el oído cada 12-24 h, hasta 3 días.",
  ],
  [
    "sodio,fusidato",
    "Infecciones bacterianas de la piel.",
    "Aplicar cada 8-12 h, 7 días.",
  ],
  [
    "sodio,sulfato anhidro+asoc.",
    "Limpieza intestinal antes de estudios.",
    "2 dosis, la segunda cada 10-12 h de la primera, según el instructivo.",
  ],
  [
    "sofosbuvir+velpatasvir",
    "Hepatitis C.",
    "1 comprimido cada 24 h, 12 semanas.",
  ],
  [
    "sofosbuvir+velpatasvir+voxilaprevir",
    "Hepatitis C.",
    "1 comprimido cada 24 h con comida, 8-12 semanas.",
  ],
  [
    "sonidegib",
    "Carcinoma basocelular avanzado.",
    `200 mg cada 24 h en ayunas; ${ESP}`,
  ],
  ["sotorasib", "Tratamiento oncológico (pulmón).", `960 mg cada 24 h; ${ESP}`],
  [
    "suero antiofídico",
    "Mordedura de serpiente venenosa.",
    `${HOSP}, dosis única que se repite si hace falta.`,
  ],
  [
    "suero antitimocitario",
    "Trasplantes y aplasia medular.",
    `${HOSP}, cada 24 h por varios días.`,
  ],
  ["sulbactam", "Infecciones bacterianas.", `${HOSP}, cada 6-8 h.`],
  [
    "sulfacetamida sódica+asoc.",
    "Acné y dermatitis seborreica.",
    "Aplicar cada 12-24 h.",
  ],
  [
    "sulfadiazina",
    "Toxoplasmosis y otras infecciones.",
    "Cada 6 h; dosis según indicación médica.",
  ],
  ["sulfadiazina de plata", "Quemaduras.", "Aplicar cada 12-24 h."],
  [
    "sulfasalazina",
    "Colitis ulcerosa y artritis reumatoidea.",
    "500 mg-1 g cada 6-12 h con comida; se aumenta de a poco.",
  ],
  ["sulfatiazol+asoc.", "Otitis externa.", "Gotas cada 8 h, 7 días."],
  ["sulpirida", "Vértigo, náuseas y ansiedad.", "50-100 mg cada 8-12 h."],
  [
    "sulpirida+clorazep.dipotásico",
    "Malestar digestivo con ansiedad.",
    "1 comprimido cada 12 h.",
  ],
  [
    "sumatriptán+naproxeno",
    "Crisis de migraña.",
    "1 comprimido al inicio; no repetir antes de 2 h (máx. 2 cada 24 h).",
  ],
  [
    "suplemento de fibras bifidogénico",
    "Fibra para la flora intestinal.",
    "1 medida cada 24 h.",
  ],
  [
    "surfactantes+asoc.",
    "Limpieza de lentes de contacto rígidos.",
    "Cada 24 h al sacarlos.",
  ],
  [
    "tafasitamab",
    "Tratamiento oncológico (linfoma).",
    `Infusión cada 7 días al inicio y luego cada 14 días; ${ESP}`,
  ],
  [
    "talidomida",
    "Mieloma y eritema nudoso leproso.",
    `Cada 24 h a la noche; ${ESP} Prohibido en el embarazo.`,
  ],
  [
    "tamsulosina+tadalafilo",
    "Agrandamiento benigno de la próstata.",
    "1 cápsula cada 24 h.",
  ],
  ["teanina+asoc.", "Relajación y concentración.", "1 cápsula cada 24 h."],
  ["tenofovir alafenamide", "Hepatitis B.", "25 mg cada 24 h con comida."],
  [
    "tepotinib",
    "Tratamiento oncológico (pulmón).",
    `450 mg cada 24 h con comida; ${ESP}`,
  ],
  [
    "terlipresina",
    "Sangrado por várices esofágicas y síndrome hepatorrenal.",
    `${HOSP}, cada 4-6 h.`,
  ],
  [
    "tetraciclina",
    "Infecciones bacterianas y acné.",
    "250-500 mg cada 6 h, 1 h antes de comer.",
  ],
  [
    "tetraciclina+metronidazol+bismuto,subcitrato",
    "Erradicación de Helicobacter pylori.",
    "3 cápsulas cada 6 h (4 tomas por día) con omeprazol, 10 días.",
  ],
  [
    "tezacaftor+ivacaftor",
    "Fibrosis quística.",
    "1 comprimido a la mañana e ivacaftor a la noche (cada 12 h), con comida grasa.",
  ],
  ["tezepelumab", "Asma grave.", "Inyección cada 28 días."],
  [
    "tiabendazol",
    "Parásitos intestinales.",
    "Cada 12 h por 2-3 días; dosis según peso.",
  ],
  ["tilo+passiflora", "Relajación (caramelos).", "1 caramelo cada 3-4 h."],
  [
    "tilo,extr.+melisa,extr.+vit.+asoc.",
    "Nerviosismo y relajación.",
    "1 comprimido cada 12-24 h.",
  ],
  ["timomodulina", "Refuerzo de defensas.", "1 ampolla bebible cada 24 h."],
  [
    "tiocolchicosido",
    "Contracturas musculares.",
    "4-8 mg cada 12 h, máx. 7 días.",
  ],
  ["tioguanina", "Leucemia.", `Cada 24 h; ${ESP}`],
  ["tiopenthal sódico", "Inducción de anestesia.", `${HOSP}, dosis única.`],
  ["tiotropio+olodaterol", "EPOC.", "2 inhalaciones cada 24 h."],
  ["tirofiban", "Síndrome coronario agudo.", `${HOSP}, en infusión continua.`],
  [
    "tranilcipromina+trifluoperazina",
    "Depresión con ansiedad.",
    "1 comprimido cada 12-24 h; evitar alimentos con tiramina.",
  ],
  [
    "trastuzumab deruxtecán",
    "Tratamiento oncológico (mama, estómago, pulmón).",
    `Infusión cada 21 días; ${ESP}`,
  ],
  ["trehalosa 3", "Lubricante ocular (ojo seco).", LUBRICANTE_OCULAR],
  ["triamcinolona+asoc.", "Psoriasis y eccemas.", "Aplicar cada 12 h."],
  [
    "triclorocarbanilida+asoc.",
    "Desodorante antitranspirante.",
    "Aplicar cada 24 h.",
  ],
  [
    "triclosán+asoc.",
    "Pasta dental para dientes sensibles.",
    "Cepillado cada 12 h.",
  ],
  ["trietanolamina+asoc.", "Limpieza capilar.", "Champú cada 24-48 h."],
  ["trifaroteno", "Acné.", "Capa fina cada 24 h a la noche."],
  [
    "triglicéridos cad.media+asoc.",
    "Dieta cetogénica (alimento para propósitos médicos).",
    "Según indique el especialista, con las comidas (cada 8 h).",
  ],
  [
    "triiodotironina+flumetasona",
    "Celulitis localizada.",
    "Aplicar cada 12-24 h.",
  ],
  [
    "trimebutina+domperidona+simetic.",
    "Colon irritable con gases y náuseas.",
    "1 de cada uno cada 8 h antes de las comidas.",
  ],
  [
    "trimebutina+ruscogenina",
    "Hemorroides.",
    "Aplicar cada 8-12 h y después de cada deposición.",
  ],
  [
    "trimetazidina",
    "Angina de pecho.",
    "35 mg cada 12 h (liberación modificada) con las comidas.",
  ],
  [
    "trióxido arsénico",
    "Leucemia promielocítica.",
    `${HOSP}, cada 24 h según el esquema.`,
  ],
  [
    "troxerrutina",
    "Várices y piernas pesadas.",
    "Gel: cada 8-12 h. Oral: cada 8-12 h.",
  ],
  [
    "tuberculina",
    "Prueba de la tuberculina (PPD).",
    "Dosis única intradérmica; se lee a las 48-72 h.",
  ],
  [
    "té rojo",
    "Caramelos o infusión de té rojo.",
    "1 caramelo o taza cada 4-8 h.",
  ],
  ["umeclidinio", "EPOC.", "1 inhalación cada 24 h."],
  ["umeclidinio+vilanterol", "EPOC.", "1 inhalación cada 24 h."],
  ["undecilénico,ác.", "Hongos de la piel (jabón).", "Usar cada 12-24 h."],
  [
    "vac.meningocócica multicomponente del grupo b",
    "Vacuna contra el meningococo B.",
    "2 dosis, la segunda cada 30-180 días de la primera, según edad.",
  ],
  [
    "vacuna antipoliomielítica trival",
    "Vacuna contra la poliomielitis.",
    "Según calendario: dosis cada 60 días y refuerzo.",
  ],
  [
    "vacuna antirrábica",
    "Prevención de la rabia.",
    "Tras mordedura: dosis los días 0, 3, 7 y 14 (cada 72-168 h).",
  ],
  [
    "vacuna antitifoidea",
    "Vacuna contra la fiebre tifoidea.",
    "Dosis única; refuerzo cada 3 años (1.095 días) si sigue el riesgo.",
  ],
  [
    "vacuna dpt+antipoliomielítica",
    "Vacuna cuádruple infantil.",
    "Según calendario: dosis única de refuerzo.",
  ],
  [
    "valeriana",
    "Nerviosismo y dificultad para dormir.",
    "Cada 8-12 h, o cada 24 h 1 h antes de dormir.",
  ],
  [
    "vaselina sólida",
    "Protección de piel y labios.",
    "Aplicar cada 8-12 h o cuando haga falta.",
  ],
  [
    "vasopresina sintética",
    "Diabetes insípida y shock.",
    `${HOSP}, cada 4-6 h o en infusión continua.`,
  ],
  [
    "vemurafenib",
    "Tratamiento oncológico (melanoma).",
    `960 mg cada 12 h; ${ESP}`,
  ],
  [
    "vigabatrin",
    "Epilepsia y espasmos infantiles.",
    "Cada 12 h; dosis según peso.",
  ],
  [
    "vinblastina",
    "Tratamiento oncológico (linfoma).",
    `Inyección cada 7-14 días; ${ESP}`,
  ],
  [
    "virus atenuados fiebre amarilla",
    "Vacuna contra la fiebre amarilla.",
    "Dosis única, al menos 10 días antes de viajar.",
  ],
  [
    "virus atenuados varicela",
    "Vacuna contra la varicela.",
    "2 dosis: a los 15 meses y a los 5 años (en adultos, la segunda cada 30-90 días de la primera).",
  ],
  [
    "virus saram.+parotiditis+rubéola",
    "Vacuna triple viral (sarampión, paperas, rubéola).",
    "2 dosis: al año y a los 5 años (en adultos, la segunda cada 30 días de la primera).",
  ],
  [
    "vit.a+triamcinolona",
    "Dermatitis con piel seca.",
    "Aplicar cada 12 h, máx. 2 semanas.",
  ],
  [
    "vit.a+zinc,óxido+xylitol+niacinamida+m.karité",
    "Paspaduras y piel atópica.",
    "Aplicar en cada cambio de pañal o cada 8-12 h.",
  ],
  [
    "vit.b1",
    "Déficit de vitamina B1 (alcoholismo, neuritis).",
    "Oral: cada 24 h. Inyectable: cada 24 h según indicación médica.",
  ],
  [
    "vit.b1 b6 b12+cafeína+ginseng+guaraná",
    "Energía y cansancio.",
    "1 comprimido cada 24 h a la mañana.",
  ],
  [
    "vit.b1 b6 b12+dha+fosfatidilserina+ác.fól.",
    "Memoria y concentración.",
    "1 comprimido cada 24 h.",
  ],
  [
    "vit.b1 b6 b12+ác.tióctico",
    "Neuropatía y hormigueos.",
    "1 cápsula cada 12-24 h.",
  ],
  [
    "vit.b1+bhb+asoc.",
    "Suplemento para dieta cetogénica.",
    "1-2 comprimidos cada 12-24 h.",
  ],
  [
    "vit.b1+vit.b6+magn.+triptof.+tean.",
    "Descanso y sueño.",
    "1 comprimido cada 24 h antes de dormir.",
  ],
  [
    "vit.c+cetonas+vinagre de sidra+asoc.",
    "Suplemento para el control del peso.",
    "1 cápsula cada 12-24 h.",
  ],
  [
    "vit.c+citroflavonoide+asoc.",
    "Fragilidad capilar y várices.",
    "1 comprimido cada 12-24 h.",
  ],
  ["vit.c+vit.d+zinc+asoc.", "Refuerzo de defensas.", "1 cápsula cada 24 h."],
  [
    "vit.d+magnesio",
    "Suplemento de vitamina D y magnesio.",
    "1 cápsula cada 24 h.",
  ],
  [
    "vit.d+vit.c+zinc+calcio+magnesio",
    "Suplemento para huesos y defensas.",
    "1 cápsula cada 24 h.",
  ],
  [
    "vit.d+zinc,óx.+bórico,ác.",
    "Paspaduras.",
    "Aplicar en cada cambio de pañal (cada 3-4 h).",
  ],
  ["vit.e natural", "Suplemento antioxidante.", "1 cápsula cada 24 h."],
  ["vit.e+eritritol", "Suplemento dietario.", "1 medida cada 24 h."],
  ["vit.k", "Vitamina K (coagulación, huesos).", "1 comprimido cada 24 h."],
  ["vit.k2", "Huesos y calcio.", "1 comprimido cada 24 h."],
  ["vit.k2+vit.d3+calcio", "Huesos.", "1 cápsula cada 24 h con comida."],
  [
    "vitaminas",
    "Regeneración de la piel (cicatrices, estrías).",
    "Aplicar cada 12 h.",
  ],
  ["vorinostat", "Linfoma cutáneo.", `400 mg cada 24 h con comida; ${ESP}`],
  ["xilitol+niacinamida", "Limpieza de piel atópica.", "Usar cada 12-24 h."],
  [
    "yacón+asoc.",
    "Suplemento para glucosa y peso.",
    "1-2 cápsulas cada 12 h antes de las comidas.",
  ],
  ["yerba mate", "Energía (suplemento).", "1 comprimido cada 12-24 h."],
  [
    "zidovudina",
    "VIH y prevención de transmisión al bebé.",
    "300 mg cada 12 h (niños: según peso).",
  ],
  ["zinc piritiona", "Caspa y dermatitis seborreica.", "Champú cada 48-72 h."],
  [
    "zinc,acetato",
    "Enfermedad de Wilson.",
    "50 mg cada 8 h, 1 h antes de las comidas.",
  ],
  ["zinc,bisglicinato", "Suplemento de zinc.", "1 comprimido cada 24 h."],
  [
    "zinc,óx.+ti.óx.+hierro,óx.-filtros minerales",
    "Protección solar mineral con color.",
    SOLAR,
  ],
  [
    "zinc,óxido",
    "Paspaduras y protección de la piel.",
    "Aplicar en cada cambio de pañal o cada 8-12 h.",
  ],
  [
    "zinc,óxido+hierro,óxidos-filtros minerales",
    "Protección solar mineral con color.",
    SOLAR,
  ],
  [
    "zuclopentixol",
    "Esquizofrenia y psicosis.",
    "Oral: cada 24 h a la noche (o cada 8-12 h); dosis según indicación médica.",
  ],
  [
    "zuclopentixol, acetato",
    "Agitación psicótica aguda.",
    "Inyección cada 48-72 h, máx. 4 dosis; uso médico.",
  ],
  [
    "zuclopentixol, decanoato",
    "Esquizofrenia (depósito).",
    "Inyección cada 14-28 días; uso médico.",
  ],
  [
    "ác.docosahexaenoico (dha)",
    "Suplemento de DHA (embarazo y lactancia).",
    "1 cápsula cada 24 h.",
  ],
  [
    "ác.hialur.7d+fitocolágeno+aceite de argán",
    "Hidratación y firmeza de la piel.",
    "Aplicar cada 12-24 h.",
  ],
  [
    "ácido omega 3-ésteres etílicos al 90%",
    "Triglicéridos altos.",
    "1-4 cápsulas cada 24 h con comida.",
  ],
  [
    "ácidos grasos esenciales omega 3",
    "Suplemento de omega 3 (ojos, corazón).",
    "1-2 cápsulas cada 24 h.",
  ],
  [
    "ácidos grasos hiperoxigenados+asoc.",
    "Prevención de escaras y piel frágil.",
    "Aplicar cada 8-12 h.",
  ],
  // Solo dados de baja en el padrón.
  [
    "alirocumab",
    "Colesterol muy alto.",
    "Inyección cada 14 días (o 300 mg cada 28 días).",
  ],
  [
    "diclofenac+vit.b12+asoc.",
    "Dolor e inflamación con neuritis.",
    "1 comprimido cada 12 h con comida, pocos días.",
  ],
  [
    "fenolftaleina",
    "Constipación ocasional.",
    "Cada 24 h a la noche, no más de 7 días.",
  ],
  [
    "gangliosidos",
    "Neuropatías (uso médico).",
    "Inyección cada 24 h según indicación médica.",
  ],
  ["inavolisib", "Tratamiento oncológico (mama).", `9 mg cada 24 h; ${ESP}`],
  ["irbesartan", "Presión alta.", "150-300 mg cada 24 h."],
  ["irbesartan+hidroclorotiazida", "Presión alta.", "1 comprimido cada 24 h."],
  [
    "lhrh",
    "Tratamientos hormonales (próstata, endometriosis, fertilidad).",
    "Inyección cada 28 días o según la presentación.",
  ],
  [
    "mifamurtida",
    "Osteosarcoma.",
    `Infusión cada 72-96 h (2 veces por semana) por 12 semanas y luego cada 7 días; ${ESP}`,
  ],
  // Agregados del padrón del 19/11/2026.
  [
    "amidotrizoato de sodio",
    "Contraste para estudios radiológicos.",
    CONTRASTE,
  ],
  ["amidotrizoico,ác.", "Contraste para estudios radiológicos.", CONTRASTE],
  ["meglumina,diatrizoato", "Contraste para estudios radiológicos.", CONTRASTE],
  [
    "dietilestilbestrol",
    "Tratamiento oncológico (cáncer de próstata).",
    `Cada 24 h; ${ESP}`,
  ],
];

export const DOSIS_TANDA_8 = tanda(FILAS);
