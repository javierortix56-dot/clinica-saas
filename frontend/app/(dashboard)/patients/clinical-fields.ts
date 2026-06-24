// Definiciones compartidas de los campos clínicos configurables.
// El orden de FIELD_DEFS refleja el orden canónico de una historia clínica.

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
  // "patient" persiste en toda la historia; "note" es por consulta.
  scope: "note" | "patient";
}

export const FIELD_DEFS: FieldDef[] = [
  {
    key: "motivo",
    label: "Motivo de consulta",
    hint: "Queja principal en palabras del paciente. Breve, no es el diagnóstico.",
    scope: "note",
  },
  {
    key: "enfermedad_actual",
    label: "Enfermedad actual",
    hint: "Síntomas, tiempo de evolución y estudios previos relevantes.",
    scope: "note",
  },
  {
    key: "antecedentes_personales",
    label: "Antecedentes personales",
    hint: "Patologías previas, cirugías, alergias, medicación habitual. Persiste en toda la historia.",
    scope: "patient",
  },
  {
    key: "antecedentes_familiares",
    label: "Antecedentes familiares",
    hint: "Enfermedades relevantes en familiares directos. Persiste en toda la historia.",
    scope: "patient",
  },
  {
    key: "vitals",
    label: "Signos vitales",
    hint: "TA, FC, FR, temperatura, peso, talla, SatO₂.",
    scope: "note",
  },
  {
    key: "examen_fisico",
    label: "Examen físico",
    hint: "Hallazgos por aparato/sistema. Configurá qué sistemas mostrar.",
    scope: "note",
  },
  {
    key: "diagnostico",
    label: "Impresión diagnóstica",
    hint: "Diagnóstico o impresión clínica. Asistencia IA disponible — el médico confirma obligatoriamente.",
    scope: "note",
  },
  {
    key: "indicaciones",
    label: "Indicaciones / Tratamiento",
    hint: "Instrucciones para recetas, solicitudes de estudios, próximos pasos.",
    scope: "note",
  },
  {
    key: "fecha_control",
    label: "Fecha de control",
    hint: "Próxima consulta programada.",
    scope: "note",
  },
];

// Sub-campos de signos vitales.
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

// Sub-campos del examen físico (por aparato/sistema).
export interface ExamFisicoSistemaDef {
  key: string;
  label: string;
  placeholder: string;
}

export const EXAM_FISICO_SISTEMAS: ExamFisicoSistemaDef[] = [
  { key: "general",          label: "Apariencia general",  placeholder: "Lúcido, orientado, normohidratado…" },
  { key: "piel",             label: "Piel y faneras",       placeholder: "Sin lesiones aparentes…" },
  { key: "cabeza_cuello",    label: "Cabeza y cuello",      placeholder: "Tiroides no palpable, sin adenopatías…" },
  { key: "cardiovascular",   label: "Cardiovascular",       placeholder: "Ruidos rítmicos, sin soplos…" },
  { key: "respiratorio",     label: "Respiratorio",         placeholder: "Murmullo vesicular conservado, sin sibilancias…" },
  { key: "abdomen",          label: "Abdomen",              placeholder: "Blando, depresible, no doloroso…" },
  { key: "genitourinario",   label: "Genitourinario",       placeholder: "Sin hallazgos patológicos…" },
  { key: "neurologico",      label: "Neurológico",          placeholder: "Sin focalidad neurológica…" },
  { key: "musculoesqueletico", label: "Musculoesquelético", placeholder: "Sin limitación de movimiento…" },
  { key: "oftalmologico",    label: "Oftalmológico",        placeholder: "Sin alteraciones visuales…" },
  { key: "orl",              label: "ORL",                  placeholder: "Orofaringe sin eritema, oídos normales…" },
];

// Config por profesional. Además de FieldKey -> boolean, soporta
// examen_fisico_sistemas -> Record<string, boolean> para los sistemas del EF.
export type NoteFieldConfig = Partial<Record<FieldKey, boolean>> & {
  examen_fisico_sistemas?: Record<string, boolean>;
};

export function isFieldEnabled(config: NoteFieldConfig, key: FieldKey): boolean {
  return config[key] !== false; // ausente = activo (default ON)
}

export function isSistemaEnabled(config: NoteFieldConfig, key: string): boolean {
  const sistemas = config.examen_fisico_sistemas;
  if (!sistemas) return true; // default ON
  return sistemas[key] !== false;
}

// Datos estructurados guardados en clinical_notes.structured_data.
export interface NoteStructuredData {
  motivo?: string;
  enfermedad_actual?: string;
  vitals?: Record<string, string>;
  examen_fisico?: Record<string, string>;
  diagnostico?: string;
  indicaciones?: string;
  fecha_control?: string;
}
