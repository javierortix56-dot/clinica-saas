/**
 * Helpers de extracción/validación de `args` del modelo (NO confiables).
 * Devuelven el valor coaccionado o lanzan `InvalidArgsError`, que los handlers
 * traducen a `{ ok:false, error_code:'INVALID_ARGS' }`.
 */

export class InvalidArgsError extends Error {}

export function requireString(
  args: Record<string, unknown>,
  key: string,
): string {
  const v = args[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new InvalidArgsError(`Falta o es inválido el parámetro "${key}".`);
  }
  return v.trim();
}

export function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') {
    throw new InvalidArgsError(`El parámetro "${key}" debe ser texto.`);
  }
  const t = v.trim();
  return t === '' ? undefined : t;
}

export function optionalDate(
  args: Record<string, unknown>,
  key: string,
): Date | undefined {
  const v = optionalString(args, key);
  if (v === undefined) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidArgsError(`El parámetro "${key}" no es una fecha válida.`);
  }
  return d;
}

export function requireDate(
  args: Record<string, unknown>,
  key: string,
): Date {
  const v = requireString(args, key);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidArgsError(`El parámetro "${key}" no es una fecha válida.`);
  }
  return d;
}
