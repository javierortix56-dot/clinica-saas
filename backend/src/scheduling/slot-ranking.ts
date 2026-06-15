/**
 * Ranking de slots por ADYACENCIA + COLCHÓN (blueprint Paso 5 §5.E · B1).
 *
 * Lógica pura (sin BD), para poder testearla aislada. Prioriza slots back-to-back
 * con turnos existentes del profesional (rellenar huecos, no fragmentar la agenda),
 * con un colchón fijo configurable; desempata por el más temprano.
 *
 * El colchón dinámico por estadística histórica es deuda técnica anotada (fuera
 * de Paso 5).
 */

export interface Slot {
  start: Date;
  end: Date;
}

/** Distancia en minutos entre un candidato y el turno existente más cercano. */
export function nearestGapMinutes(candidate: Slot, existing: Slot[]): number {
  let best = Infinity;
  for (const e of existing) {
    // Gap si el candidato va justo después de `e` o justo antes.
    const afterGap = (candidate.start.getTime() - e.end.getTime()) / 60000;
    const beforeGap = (e.start.getTime() - candidate.end.getTime()) / 60000;
    // Solo cuentan gaps no-negativos (no solapados; el solape se filtra antes).
    if (afterGap >= 0) best = Math.min(best, afterGap);
    if (beforeGap >= 0) best = Math.min(best, beforeGap);
  }
  return best;
}

/**
 * Ordena candidatos: primero los adyacentes (gap ≤ colchón) por gap ascendente,
 * luego el resto; en ambos grupos, desempate por inicio más temprano. Devuelve
 * los primeros `limit`.
 */
export function rankSlots(
  candidates: Slot[],
  existing: Slot[],
  bufferMinutes: number,
  limit: number,
): Slot[] {
  const scored = candidates.map((c) => {
    const gap = nearestGapMinutes(c, existing);
    return { slot: c, gap, adjacent: gap <= bufferMinutes };
  });

  scored.sort((a, b) => {
    // Adyacentes primero.
    if (a.adjacent !== b.adjacent) return a.adjacent ? -1 : 1;
    // Entre adyacentes, menor gap primero (más pegado al turno existente).
    if (a.adjacent && a.gap !== b.gap) return a.gap - b.gap;
    // Desempate: más temprano primero.
    return a.slot.start.getTime() - b.slot.start.getTime();
  });

  return scored.slice(0, limit).map((s) => s.slot);
}
