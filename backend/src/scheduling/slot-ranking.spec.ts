import { nearestGapMinutes, rankSlots, Slot } from './slot-ranking';

/** Helpers: construyen slots en una fecha fija (UTC) para aserciones estables. */
const at = (h: number, m = 0): Date => new Date(Date.UTC(2026, 5, 20, h, m));
const slot = (h: number, m = 0, durMin = 30): Slot => ({
  start: at(h, m),
  end: new Date(at(h, m).getTime() + durMin * 60000),
});
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

describe('slot-ranking (B1) — nearestGapMinutes', () => {
  it('devuelve Infinity si no hay turnos existentes', () => {
    expect(nearestGapMinutes(slot(9), [])).toBe(Infinity);
  });

  it('calcula el gap cuando el candidato va justo después de un turno', () => {
    // existente 10:00–10:30; candidato 10:30–11:00 => back-to-back (gap 0)
    expect(nearestGapMinutes(slot(10, 30), [slot(10, 0)])).toBe(0);
  });

  it('calcula el gap cuando el candidato va antes de un turno', () => {
    // candidato 09:00–09:30; existente 10:00–10:30 => gap 30
    expect(nearestGapMinutes(slot(9, 0), [slot(10, 0)])).toBe(30);
  });

  it('toma el turno más cercano entre varios', () => {
    // candidato 12:00–12:30; existentes 10:00 y 12:45 => gap 15 (al de 12:45)
    expect(nearestGapMinutes(slot(12, 0), [slot(10, 0), slot(12, 45)])).toBe(15);
  });
});

describe('slot-ranking (B1) — rankSlots', () => {
  it('prioriza el slot back-to-back (gap ≤ colchón) sobre el más temprano', () => {
    const existing = [slot(10, 0)];
    const candidates = [slot(9, 0), slot(10, 30), slot(14, 0)];
    const ranked = rankSlots(candidates, existing, 5, 3);
    // 10:30 es adyacente (gap 0) => primero, pese a no ser el más temprano.
    expect(ranked.map((s) => hhmm(s.start))).toEqual(['10:30', '09:00', '14:00']);
  });

  it('sin turnos existentes ordena por el más temprano', () => {
    const ranked = rankSlots([slot(14), slot(9), slot(11)], [], 5, 3);
    expect(ranked.map((s) => hhmm(s.start))).toEqual(['09:00', '11:00', '14:00']);
  });

  it('respeta el colchón: un gap mayor al buffer no cuenta como adyacente', () => {
    const existing = [slot(10, 0)]; // 10:00–10:30
    // 10:40 deja gap 10 (> buffer 5) => NO adyacente; 09:55 deja gap 5 (= buffer) => adyacente
    const candidates = [slot(10, 40), slot(7, 0)];
    const adjacentCandidate = { start: at(9, 55), end: at(10, 0) }; // termina justo al inicio? gap 0
    const ranked = rankSlots(
      [...candidates, adjacentCandidate],
      existing,
      5,
      3,
    );
    // El adyacente (gap 0) va primero; el resto por más temprano (07:00 antes que 10:40).
    expect(hhmm(ranked[0].start)).toBe('09:55');
    expect(ranked.slice(1).map((s) => hhmm(s.start))).toEqual(['07:00', '10:40']);
  });

  it('limita al top N', () => {
    const ranked = rankSlots([slot(9), slot(10), slot(11), slot(12)], [], 5, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked.map((s) => hhmm(s.start))).toEqual(['09:00', '10:00']);
  });

  it('devuelve lista vacía si no hay candidatos', () => {
    expect(rankSlots([], [slot(10)], 5, 3)).toEqual([]);
  });
});
