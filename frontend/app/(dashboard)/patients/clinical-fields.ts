// Definiciones compartidas de los campos clínicos configurables. La forma de la
// nota, el panel de configuración por profesional y la vista de cada nota leen
// de acá para no desincronizarse.

// Claves de los grupos de campos que el profesional puede activar/desactivar.
export type FieldKey =
  | "motivo"
  | "vitals"
  | "diagnostico"
  | "indicaciones"
  | "alergias";

export interface FieldDef {
  key: FieldKey;
  label: string;
  hint: string;
  // alergias es a nivel paciente (persiste en toda la historia); el resto es por nota.
  scope: "note" | "patient";
}

export const FIELD_DEFS: FieldDef[] = [
  { key: "motivo", label: "Motivo de consulta", hint: "Queja o motivo principal del paciente.", scope: "note" },
  { key: "vitals", label: "Signos vitales", hint: "TA, FC, FR, temperatura, peso, talla, SatO2.", scope: "note" },
  { key: "diagnostico", label: "Diagnóstico", hint: "Diagnóstico clínico de la consulta.", scope: "note" },
  { key: "indicaciones", label: "Indicaciones / Plan", hint: "Tratamiento, medicación y próximos pasos.", scope: "note" },
  { key: "alergias", label: "Alergias y antecedentes", hint: "Datos del paciente, visibles en toda la historia.", scope: "patient" },
];

// Sub-campos de signos vitales (todos opcionales, texto libre con unidad).
export interface VitalDef {
  key: string;
  label: string;
  placeholder: string;
}

export const VITAL_DEFS: VitalDef[] = [
  { key: "ta", label: "TA", placeholder: "120/80" },
  { key: "fc", label: "FC", placeholder: "72 lpm" },
  { key: "fr", label: "FR", placeholder: "16 rpm" },
  { key: "temp", label: "Temp.", placeholder: "36.5 °C" },
  { key: "peso", label: "Peso", placeholder: "70 kg" },
  { key: "talla", label: "Talla", placeholder: "175 cm" },
  { key: "sato2", label: "SatO₂", placeholder: "98 %" },
];

// Config por profesional: clave -> habilitado. Ausente = habilitado (default ON).
export type NoteFieldConfig = Partial<Record<FieldKey, boolean>>;

export function isFieldEnabled(config: NoteFieldConfig, key: FieldKey): boolean {
  return config[key] !== false; // default: activo
}

// Datos estructurados guardados en clinical_notes.structured_data.
export interface NoteStructuredData {
  motivo?: string;
  vitals?: Record<string, string>;
  diagnostico?: string;
  indicaciones?: string;
}
