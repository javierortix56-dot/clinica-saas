// El backend sincroniza cada 2 minutos; sin sincronizar en 2 horas indica un
// problema (servidor caído, token revocado), aunque el vínculo figure activo.
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export function isGcalStale(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return false;
  return Date.now() - new Date(lastSyncedAt).getTime() > STALE_AFTER_MS;
}
