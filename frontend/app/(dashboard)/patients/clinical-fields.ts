// Definiciones compartidas de los campos clínicos configurables.
//
// Modelo en 3 capas:
//   1. Campos base (FIELD_DEFS): comunes a todas las especialidades.
//   2. Campos especializados (SPECIALTY_FIELD_DEFS): texto libre, reutilizables
//      entre especialidades. Opt-in (default OFF).
//   3. Presets por especialidad (SPECIALTY_PRESETS): seleccionan qué campos base,
//      qué sistemas del examen físico y qué campos especializados se activan.
//
// El profesional elige un preset en el panel ⚙ Campos y luego ajusta a mano.

// ─── Capa 1: campos base ──────────────────────────────────────────────────────

export type FieldKey =
  | "motivo"
  | "enfermedad_actual"
  | "antecedentes_personales"
  | "antecedentes_familiares"
  | "vitals"
  | "examen_fisico"
  | "diagnostico"
  | "indicaciones"
  | "fecha_control";

export interface FieldDef {
  key: FieldKey;
  label: string;
  hint: string;
  scope: "note" | "patient";
}

export const FIELD_DEFS: FieldDef[] = [
  { key: "motivo", label: "Motivo de consulta", hint: "Queja principal en palabras del paciente. Breve, no es el diagnóstico.", scope: "note" },
  { key: "enfermedad_actual", label: "Enfermedad actual", hint: "Síntomas, tiempo de evolución y estudios previos relevantes.", scope: "note" },
  { key: "antecedentes_personales", label: "Antecedentes personales", hint: "Patologías previas, cirugías, alergias, medicación habitual. Persiste en toda la historia.", scope: "patient" },
  { key: "antecedentes_familiares", label: "Antecedentes familiares", hint: "Enfermedades relevantes en familiares directos. Persiste en toda la historia.", scope: "patient" },
  { key: "vitals", label: "Signos vitales", hint: "TA, FC, FR, temperatura, peso, talla, SatO₂.", scope: "note" },
  { key: "examen_fisico", label: "Examen físico", hint: "Hallazgos por aparato/sistema. Configurá qué sistemas mostrar.", scope: "note" },
  { key: "diagnostico", label: "Impresión diagnóstica", hint: "Diagnóstico o impresión clínica. Asistencia IA disponible — el médico confirma obligatoriamente.", scope: "note" },
  { key: "indicaciones", label: "Indicaciones / Tratamiento", hint: "Instrucciones para recetas, solicitudes de estudios, próximos pasos.", scope: "note" },
  { key: "fecha_control", label: "Fecha de control", hint: "Próxima consulta programada.", scope: "note" },
];

// ─── Signos vitales (sub-campos) ──────────────────────────────────────────────

export interface VitalDef {
  key: string;
  label: string;
  placeholder: string;
}

export const VITAL_DEFS: VitalDef[] = [
  { key: "ta",    label: "TA",     placeholder: "120/80" },
  { key: "fc",    label: "FC",     placeholder: "72 lpm" },
  { key: "fr",    label: "FR",     placeholder: "16 rpm" },
  { key: "temp",  label: "Temp.",  placeholder: "36.5 °C" },
  { key: "peso",  label: "Peso",   placeholder: "70 kg" },
  { key: "talla", label: "Talla",  placeholder: "175 cm" },
  { key: "sato2", label: "SatO₂",  placeholder: "98 %" },
];

// ─── Examen físico (sub-campos por sistema) ───────────────────────────────────

export interface ExamFisicoSistemaDef {
  key: string;
  label: string;
  placeholder: string;
}

export const EXAM_FISICO_SISTEMAS: ExamFisicoSistemaDef[] = [
  { key: "general",            label: "Apariencia general",  placeholder: "Lúcido, orientado, normohidratado…" },
  { key: "piel",               label: "Piel y faneras",       placeholder: "Sin lesiones aparentes…" },
  { key: "cabeza_cuello",      label: "Cabeza y cuello",      placeholder: "Tiroides no palpable, sin adenopatías…" },
  { key: "cardiovascular",     label: "Cardiovascular",       placeholder: "Ruidos rítmicos, sin soplos…" },
  { key: "respiratorio",       label: "Respiratorio",         placeholder: "Murmullo vesicular conservado…" },
  { key: "abdomen",            label: "Abdomen",              placeholder: "Blando, depresible, no doloroso…" },
  { key: "genitourinario",     label: "Genitourinario",       placeholder: "Sin hallazgos patológicos…" },
  { key: "neurologico",        label: "Neurológico",          placeholder: "Sin focalidad neurológica…" },
  { key: "musculoesqueletico", label: "Musculoesquelético",   placeholder: "Sin limitación de movimiento…" },
  { key: "oftalmologico",      label: "Oftalmológico",        placeholder: "Sin alteraciones visuales…" },
  { key: "orl",                label: "ORL",                  placeholder: "Orofaringe sin eritema, oídos normales…" },
];

// ─── Capa 2 + 3: catálogo de campos especializados (texto libre) ──────────────

export interface SpecialtyFieldDef {
  key: string;
  label: string;
  placeholder: string;
}

// Catálogo único; los presets eligen un subconjunto. Reutilizable entre
// especialidades (ej. "rom" lo usan traumatólogo, kinesiólogo y reumatólogo).
export const SPECIALTY_FIELD_DEFS: SpecialtyFieldDef[] = [
  // Pediatría / crecimiento
  { key: "antec_perinatologicos", label: "Antecedentes perinatológicos", placeholder: "Embarazo, parto, peso al nacer, APGAR…" },
  { key: "percentiles", label: "Percentiles", placeholder: "Peso, talla, perímetro cefálico (Px)…" },
  { key: "velocidad_crecimiento", label: "Velocidad de crecimiento", placeholder: "cm/año…" },
  { key: "tanner", label: "Estadio de Tanner", placeholder: "Tanner I–V…" },
  { key: "edad_osea", label: "Edad ósea", placeholder: "Edad ósea estimada…" },
  { key: "desarrollo_psicomotor", label: "Desarrollo psicomotor", placeholder: "Hitos del desarrollo…" },
  { key: "vacunas", label: "Vacunas", placeholder: "Calendario / vacunas aplicadas…" },
  { key: "alimentacion", label: "Alimentación", placeholder: "Tipo de alimentación, lactancia…" },
  // Endocrinología
  { key: "lab_hormonal", label: "Laboratorio hormonal", placeholder: "TSH, T4, glucemia, HbA1c, cortisol…" },
  { key: "imc", label: "IMC", placeholder: "kg/m²…" },
  { key: "perimetro_cintura", label: "Perímetro de cintura", placeholder: "cm…" },
  { key: "palpacion_tiroidea", label: "Palpación tiroidea", placeholder: "Tamaño, nódulos, consistencia…" },
  // Neumonología
  { key: "espirometria", label: "Espirometría", placeholder: "FEV1, FVC, FEV1/FVC…" },
  { key: "pef", label: "Flujo espiratorio pico (PEF)", placeholder: "L/min…" },
  { key: "auscultacion_pulmonar", label: "Auscultación pulmonar", placeholder: "MV, sibilancias, rales…" },
  { key: "tabaquismo", label: "Hábito tabáquico", placeholder: "Paquetes/año, estado…" },
  // Psiquiatría / psicología
  { key: "examen_mental", label: "Examen mental", placeholder: "Aspecto, ánimo, pensamiento, juicio…" },
  { key: "escalas_psi", label: "Escalas", placeholder: "PHQ-9, GAD-7, Hamilton…" },
  { key: "med_psicotropica", label: "Medicación psicotrópica", placeholder: "Psicofármacos y dosis…" },
  { key: "riesgo_suicida", label: "Riesgo suicida", placeholder: "Ideación, plan, intentos previos…" },
  { key: "antec_psiquiatricos", label: "Antecedentes psiquiátricos", placeholder: "Internaciones, diagnósticos previos…" },
  { key: "enfoque_terapeutico", label: "Enfoque terapéutico", placeholder: "Marco / abordaje terapéutico…" },
  { key: "evolucion_sesiones", label: "Evolución entre sesiones", placeholder: "Cambios desde la última sesión…" },
  { key: "objetivos_terapeuticos", label: "Objetivos terapéuticos", placeholder: "Objetivos del tratamiento…" },
  // Traumatología / kinesiología / reumatología
  { key: "region_afectada", label: "Región afectada", placeholder: "Zona / articulación afectada…" },
  { key: "rom", label: "Rango de movilidad (ROM)", placeholder: "Flexión/extensión en grados…" },
  { key: "eva", label: "Escala de dolor (EVA)", placeholder: "Dolor 0–10…" },
  { key: "maniobras", label: "Maniobras semiológicas", placeholder: "Lachman, McMurray, Neer…" },
  { key: "estudios_imagen", label: "Estudios por imagen", placeholder: "Rx, RMN, TAC, ecografía…" },
  { key: "fuerza_muscular", label: "Fuerza muscular", placeholder: "Escala 0–5…" },
  { key: "evaluacion_funcional", label: "Evaluación funcional", placeholder: "Capacidad funcional, marcha…" },
  { key: "plan_sesiones", label: "Plan de sesiones", placeholder: "Cantidad, frecuencia, técnicas…" },
  { key: "objetivos_funcionales", label: "Objetivos funcionales", placeholder: "Metas de rehabilitación…" },
  { key: "articulaciones_afectadas", label: "Articulaciones afectadas", placeholder: "Recuento articular, simetría…" },
  { key: "lab_inmunologico", label: "Laboratorio inmunológico", placeholder: "FR, anti-CCP, ANA, PCR, VSG…" },
  { key: "escala_actividad", label: "Escala de actividad", placeholder: "DAS28, BASDAI…" },
  // Odontología
  { key: "odontograma", label: "Odontograma", placeholder: "Estado por pieza…" },
  { key: "pieza_dental", label: "Pieza / cuadrante", placeholder: "Ej: 4.6, cuadrante inferior derecho…" },
  { key: "higiene_oral", label: "Higiene oral", placeholder: "Índice de placa, sarro, gingivitis…" },
  { key: "plan_dental", label: "Plan de tratamiento dental", placeholder: "Plan por sesión…" },
  { key: "color_vita", label: "Color / guía VITA", placeholder: "Ej: A2, B1…" },
  { key: "tipo_trat_estetico", label: "Tipo de tratamiento estético", placeholder: "Carillas, blanqueamiento, diseño de sonrisa…" },
  { key: "linea_sonrisa", label: "Análisis de sonrisa", placeholder: "Línea media, corredor bucal…" },
  { key: "maloclusion", label: "Tipo de maloclusión", placeholder: "Clase I / II / III…" },
  { key: "aparatologia", label: "Aparatología", placeholder: "Brackets, alineadores, placa…" },
  { key: "cefalometria", label: "Cefalometría", placeholder: "Análisis cefalométrico…" },
  { key: "conductos", label: "Conductos", placeholder: "N° de conductos, longitud de trabajo…" },
  { key: "vitalidad_pulpar", label: "Vitalidad pulpar", placeholder: "Test térmico/eléctrico…" },
  { key: "rx_periapical", label: "Rx periapical", placeholder: "Hallazgos periapicales…" },
  // Ginecología / obstetricia
  { key: "fum", label: "FUM", placeholder: "Fecha de última menstruación…" },
  { key: "citologia_pap", label: "Citología / PAP", placeholder: "Resultado del PAP / colposcopía…" },
  { key: "mamografia", label: "Mamografía / eco mamaria", placeholder: "BI-RADS, hallazgos…" },
  { key: "anticoncepcion", label: "Anticoncepción", placeholder: "Método anticonceptivo actual…" },
  { key: "examen_ginecologico", label: "Examen ginecológico", placeholder: "Especuloscopía, tacto vaginal…" },
  { key: "edad_gestacional", label: "Edad gestacional", placeholder: "Semanas de gestación…" },
  { key: "altura_uterina", label: "Altura uterina", placeholder: "cm…" },
  { key: "lcf", label: "Latidos cardíacos fetales", placeholder: "LCF (lpm)…" },
  { key: "control_prenatal", label: "Control prenatal", placeholder: "Laboratorio, ecografías, controles…" },
  { key: "fpp", label: "Fecha probable de parto", placeholder: "FPP…" },
  // Cardiología
  { key: "ecg", label: "ECG", placeholder: "Ritmo, frecuencia, hallazgos…" },
  { key: "soplos", label: "Soplos / ruidos", placeholder: "Soplos, R3, R4…" },
  { key: "clase_funcional", label: "Clase funcional", placeholder: "NYHA I–IV…" },
  { key: "riesgo_cv", label: "Riesgo cardiovascular", placeholder: "Factores de riesgo, score…" },
  // Dermatología
  { key: "lesion_descripcion", label: "Descripción de la lesión", placeholder: "Tipo, localización, distribución…" },
  { key: "dermatoscopia", label: "Dermatoscopía", placeholder: "Hallazgos dermatoscópicos…" },
  { key: "fototipo", label: "Fototipo", placeholder: "Fototipo I–VI…" },
  // Oftalmología
  { key: "agudeza_visual", label: "Agudeza visual", placeholder: "AV con/sin corrección…" },
  { key: "pio", label: "Presión intraocular", placeholder: "PIO (mmHg)…" },
  { key: "fondo_ojo", label: "Fondo de ojo", placeholder: "Papila, mácula, retina…" },
  { key: "refraccion", label: "Refracción", placeholder: "Esfera / cilindro / eje…" },
  // ORL / fonoaudiología
  { key: "otoscopia", label: "Otoscopía", placeholder: "Conducto, membrana timpánica…" },
  { key: "rinoscopia", label: "Rinoscopía", placeholder: "Mucosa, cornetes, secreciones…" },
  { key: "audiometria", label: "Audiometría", placeholder: "Umbrales auditivos…" },
  { key: "fauces", label: "Fauces / orofaringe", placeholder: "Amígdalas, faringe…" },
  { key: "eval_habla_lenguaje", label: "Habla y lenguaje", placeholder: "Articulación, fluidez, voz…" },
  { key: "deglucion", label: "Deglución", placeholder: "Evaluación de la deglución…" },
  { key: "plan_fono", label: "Plan fonoaudiológico", placeholder: "Objetivos y ejercicios…" },
  // Gastroenterología
  { key: "endoscopia", label: "Endoscopía", placeholder: "VEDA / colonoscopía: hallazgos…" },
  { key: "habito_evacuatorio", label: "Hábito evacuatorio", placeholder: "Ritmo, características…" },
  { key: "hepatograma", label: "Hepatograma / lab digestivo", placeholder: "TGO, TGP, bilirrubina…" },
  // Neurología
  { key: "pares_craneales", label: "Pares craneales", placeholder: "Pares I–XII…" },
  { key: "fuerza_reflejos", label: "Fuerza, reflejos y sensibilidad", placeholder: "Fuerza, ROT, sensibilidad…" },
  { key: "escalas_cognitivas", label: "Escalas cognitivas", placeholder: "MMSE, MoCA…" },
  // Urología
  { key: "tacto_prostata", label: "Tacto prostático", placeholder: "Tamaño, consistencia, nódulos…" },
  { key: "psa", label: "PSA", placeholder: "PSA (ng/mL)…" },
  { key: "examen_genital", label: "Examen genital", placeholder: "Hallazgos del examen genital…" },
  { key: "sintomas_urinarios", label: "Síntomas urinarios", placeholder: "IPSS, disuria, frecuencia…" },
  // Nutrición
  { key: "composicion_corporal", label: "Composición corporal", placeholder: "% graso, masa magra…" },
  { key: "anamnesis_alimentaria", label: "Anamnesis alimentaria", placeholder: "Recordatorio 24h, hábitos…" },
  { key: "plan_nutricional", label: "Plan nutricional", placeholder: "Plan alimentario, objetivos…" },
];

// ─── Presets por especialidad ─────────────────────────────────────────────────

export interface SpecialtyPreset {
  id: string;
  label: string;
  // Campos base a DESACTIVAR (el resto queda activo).
  baseOff?: FieldKey[];
  // Sistemas del examen físico a activar (el resto se desactiva).
  examSystems: string[];
  // Campos especializados a activar (opt-in).
  specialtyFields: string[];
}

export const SPECIALTY_PRESETS: SpecialtyPreset[] = [
  // ── Odontología ──
  {
    id: "odont_general", label: "Odontólogo general",
    baseOff: ["examen_fisico", "vitals"], examSystems: [],
    specialtyFields: ["odontograma", "pieza_dental", "higiene_oral", "plan_dental", "estudios_imagen"],
  },
  {
    id: "odont_estetico", label: "Odontólogo estético",
    baseOff: ["examen_fisico", "vitals"], examSystems: [],
    specialtyFields: ["pieza_dental", "color_vita", "tipo_trat_estetico", "linea_sonrisa", "plan_dental"],
  },
  {
    id: "ortodoncista", label: "Ortodoncista",
    baseOff: ["examen_fisico", "vitals"], examSystems: [],
    specialtyFields: ["maloclusion", "aparatologia", "cefalometria", "plan_dental", "estudios_imagen"],
  },
  {
    id: "endodoncista", label: "Endodoncista",
    baseOff: ["examen_fisico", "vitals"], examSystems: [],
    specialtyFields: ["pieza_dental", "conductos", "vitalidad_pulpar", "rx_periapical"],
  },
  // ── Pediatría / endocrinología ──
  {
    id: "pediatra", label: "Pediatra",
    examSystems: ["general", "piel", "cabeza_cuello", "cardiovascular", "respiratorio", "abdomen", "orl"],
    specialtyFields: ["antec_perinatologicos", "percentiles", "desarrollo_psicomotor", "vacunas", "alimentacion"],
  },
  {
    id: "endo_pediatra", label: "Endocrinólogo pediátrico",
    examSystems: ["general", "cabeza_cuello", "abdomen"],
    specialtyFields: ["percentiles", "velocidad_crecimiento", "tanner", "edad_osea", "lab_hormonal"],
  },
  {
    id: "endo_adulto", label: "Endocrinólogo adulto",
    examSystems: ["general", "cabeza_cuello"],
    specialtyFields: ["lab_hormonal", "imc", "perimetro_cintura", "palpacion_tiroidea"],
  },
  {
    id: "neumologo", label: "Neumólogo",
    examSystems: ["general", "respiratorio", "cardiovascular"],
    specialtyFields: ["espirometria", "pef", "auscultacion_pulmonar", "tabaquismo", "estudios_imagen"],
  },
  {
    id: "psiquiatra", label: "Psiquiatra",
    baseOff: ["examen_fisico"], examSystems: [],
    specialtyFields: ["examen_mental", "escalas_psi", "med_psicotropica", "riesgo_suicida", "antec_psiquiatricos"],
  },
  {
    id: "traumatologo", label: "Traumatólogo",
    examSystems: ["musculoesqueletico", "neurologico"],
    specialtyFields: ["region_afectada", "rom", "eva", "maniobras", "estudios_imagen"],
  },
  // ── Clínicas / otras ──
  {
    id: "clinico", label: "Médico clínico / generalista",
    examSystems: ["general", "piel", "cabeza_cuello", "cardiovascular", "respiratorio", "abdomen", "neurologico", "musculoesqueletico"],
    specialtyFields: [],
  },
  {
    id: "ginecologo", label: "Ginecólogo",
    examSystems: ["general", "abdomen"],
    specialtyFields: ["fum", "citologia_pap", "mamografia", "anticoncepcion", "examen_ginecologico"],
  },
  {
    id: "obstetra", label: "Obstetra",
    examSystems: ["general", "abdomen"],
    specialtyFields: ["edad_gestacional", "altura_uterina", "lcf", "control_prenatal", "fpp"],
  },
  {
    id: "cardiologo", label: "Cardiólogo",
    examSystems: ["general", "cardiovascular", "respiratorio"],
    specialtyFields: ["ecg", "soplos", "clase_funcional", "riesgo_cv", "estudios_imagen"],
  },
  {
    id: "dermatologo", label: "Dermatólogo",
    examSystems: ["piel"],
    specialtyFields: ["lesion_descripcion", "dermatoscopia", "fototipo"],
  },
  {
    id: "oftalmologo", label: "Oftalmólogo",
    baseOff: ["examen_fisico", "vitals"], examSystems: [],
    specialtyFields: ["agudeza_visual", "pio", "fondo_ojo", "refraccion"],
  },
  {
    id: "orl", label: "Otorrinolaringólogo",
    examSystems: ["cabeza_cuello", "orl"],
    specialtyFields: ["otoscopia", "rinoscopia", "audiometria", "fauces"],
  },
  {
    id: "gastroenterologo", label: "Gastroenterólogo",
    examSystems: ["general", "abdomen"],
    specialtyFields: ["habito_evacuatorio", "endoscopia", "hepatograma", "estudios_imagen"],
  },
  {
    id: "neurologo", label: "Neurólogo",
    examSystems: ["general", "neurologico"],
    specialtyFields: ["pares_craneales", "fuerza_reflejos", "escalas_cognitivas", "estudios_imagen"],
  },
  {
    id: "urologo", label: "Urólogo",
    examSystems: ["general", "genitourinario", "abdomen"],
    specialtyFields: ["tacto_prostata", "psa", "examen_genital", "sintomas_urinarios"],
  },
  {
    id: "kinesiologo", label: "Kinesiólogo / Fisioterapeuta",
    examSystems: ["musculoesqueletico", "neurologico"],
    specialtyFields: ["region_afectada", "rom", "eva", "fuerza_muscular", "evaluacion_funcional", "plan_sesiones", "objetivos_funcionales"],
  },
  {
    id: "nutricionista", label: "Nutricionista",
    baseOff: ["examen_fisico"], examSystems: [],
    specialtyFields: ["imc", "perimetro_cintura", "composicion_corporal", "anamnesis_alimentaria", "plan_nutricional"],
  },
  {
    id: "psicologo", label: "Psicólogo",
    baseOff: ["examen_fisico", "vitals", "diagnostico"], examSystems: [],
    specialtyFields: ["enfoque_terapeutico", "evolucion_sesiones", "objetivos_terapeuticos", "escalas_psi"],
  },
  {
    id: "fonoaudiologo", label: "Fonoaudiólogo",
    baseOff: ["vitals"], examSystems: ["orl", "cabeza_cuello"],
    specialtyFields: ["eval_habla_lenguaje", "deglucion", "audiometria", "plan_fono"],
  },
  {
    id: "reumatologo", label: "Reumatólogo",
    examSystems: ["general", "musculoesqueletico", "piel"],
    specialtyFields: ["articulaciones_afectadas", "rom", "eva", "lab_inmunologico", "escala_actividad"],
  },
];

// ─── Config por profesional ───────────────────────────────────────────────────

export type NoteFieldConfig = Partial<Record<FieldKey, boolean>> & {
  examen_fisico_sistemas?: Record<string, boolean>;
  especializados?: Record<string, boolean>; // opt-in (default OFF)
  especialidad?: string;                     // último preset aplicado
};

// Campos base: ausente = activo (default ON).
export function isFieldEnabled(config: NoteFieldConfig, key: FieldKey): boolean {
  return config[key] !== false;
}

// Sistemas del examen físico: ausente = activo (default ON).
export function isSistemaEnabled(config: NoteFieldConfig, key: string): boolean {
  const sistemas = config.examen_fisico_sistemas;
  if (!sistemas) return true;
  return sistemas[key] !== false;
}

// Campos especializados: ausente = inactivo (default OFF, opt-in).
export function isSpecialtyFieldEnabled(config: NoteFieldConfig, key: string): boolean {
  return config.especializados?.[key] === true;
}

// Construye una config completa a partir de un preset de especialidad.
export function buildConfigFromPreset(preset: SpecialtyPreset): NoteFieldConfig {
  const cfg: NoteFieldConfig = {};
  for (const f of FIELD_DEFS) cfg[f.key] = !preset.baseOff?.includes(f.key);

  const sistemas: Record<string, boolean> = {};
  for (const s of EXAM_FISICO_SISTEMAS) sistemas[s.key] = preset.examSystems.includes(s.key);
  cfg.examen_fisico_sistemas = sistemas;

  const esp: Record<string, boolean> = {};
  for (const sf of SPECIALTY_FIELD_DEFS) esp[sf.key] = preset.specialtyFields.includes(sf.key);
  cfg.especializados = esp;

  cfg.especialidad = preset.id;
  return cfg;
}

// ─── Datos estructurados guardados en clinical_notes.structured_data ──────────

export interface NoteStructuredData {
  motivo?: string;
  enfermedad_actual?: string;
  vitals?: Record<string, string>;
  examen_fisico?: Record<string, string>;
  especializados?: Record<string, string>;
  diagnostico?: string;
  indicaciones?: string;
  fecha_control?: string;
}
