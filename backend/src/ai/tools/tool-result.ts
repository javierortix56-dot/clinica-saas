/**
 * Resultado estructurado de una tool (blueprint §1: "Errores de tool").
 *
 * Las tools NUNCA tiran excepciones al loop: cualquier fallo —incluida una regla
 * de negocio violada (cool-down, prime time, no-show)— se devuelve como un
 * resultado `{ ok:false, ... }` que el modelo puede leer para recuperarse o
 * escalar a un humano.
 */
export type ToolSuccess<T = Record<string, unknown>> = {
  ok: true;
  data: T;
};

export type ToolFailure = {
  ok: false;
  /** Código estable, legible por el modelo y por el código (p.ej. NOT_IMPLEMENTED). */
  error_code: string;
  message: string;
};

export type ToolResult<T = Record<string, unknown>> =
  | ToolSuccess<T>
  | ToolFailure;

export function ok<T extends Record<string, unknown>>(data: T): ToolSuccess<T> {
  return { ok: true, data };
}

export function fail(errorCode: string, message: string): ToolFailure {
  return { ok: false, error_code: errorCode, message };
}
