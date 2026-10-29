/**
 * Device clock offset.
 *
 * DO NOT REWRITE. Copied from a system used in the field for months.
 *
 * Positions are ordered by scannedAt, the device time at decode, NOT by
 * serverTimestamp(), which is assigned at sync: a scan made at 10:00 and synced
 * at 18:00 would otherwise overtake a warehouse arrival scanned at 15:00.
 *
 * The phone clock can be wrong, so we measure it against `iat` (issued-at) of the
 * Firebase ID token, which is ISSUED BY THE SERVER.
 *
 * Why not measure at sync: |scannedAt - server time at sync| is skew + sync
 * delay, impossible to tell apart. 30 offline scans at 10:00 synced at 18:00
 * would raise 30 flags for zero errors.
 */
const STORAGE_KEY = "clockOffset.v1";
// Expected noise: iat has 1 s granularity plus network latency, so the
// suspicion threshold is in MINUTES, not seconds.
export const SUSPICIOUS_OFFSET_MS = 3 * 60 * 1000;

let cache = null;

function isValid(o) {
  return !!o && Number.isFinite(o.offsetMs) && Number.isFinite(o.measuredAt);
}

function read() {
  if (isValid(cache)) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // localStorage can be tampered with: a non-numeric value would produce an
      // Invalid Date and make the save fail.
      if (isValid(parsed)) cache = parsed;
    }
  } catch {}
  return isValid(cache) ? cache : null;
}

/**
 * Measures the offset. Needs network: offline it returns null and the last known
 * value is kept.
 *
 * forceRefresh = true is NOT optional. Without it getIdTokenResult() returns the
 * CACHED token, which the SDK renews only close to expiry (1 h lifetime): on
 * session restore, that is every time the app is opened, `iat` can be up to ~55
 * minutes old. The offset would become real offset + TOKEN AGE and every scan
 * would be back-dated by up to an hour, silently corrupting last-scan-wins.
 *
 * NEVER call this from inside an onIdTokenChanged listener: the forced refresh
 * fires the listener again, an infinite loop. Call it after login and when the
 * app comes back online.
 */
export async function measureOffset(firebaseUser) {
  if (!firebaseUser) return null;
  try {
    const res = await firebaseUser.getIdTokenResult(true);
    const serverMs = new Date(res.issuedAtTime).getTime();
    if (!Number.isFinite(serverMs)) return null;
    const val = {
      // offset > 0 means the local clock is AHEAD of the server
      offsetMs: Date.now() - serverMs,
      measuredAt: Date.now(),
    };
    cache = val;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)); } catch {}
    return val;
  } catch {
    return null; // offline or token not renewable: keep the last known value
  }
}

/**
 * Corrected instant to use as scannedAt.
 *
 * The client CORRECTS, it does not only record. We still record the offset and
 * the age of the measurement: after days offline the token cannot refresh, and
 * an offset that looks fresh may be stale (or tampered with).
 */
export function scanInstant() {
  const o = read();
  const offsetMs = o?.offsetMs ?? 0;
  return {
    scannedAt: new Date(Date.now() - offsetMs),
    clockOffsetMs: offsetMs,
    offsetMeasuredAt: o?.measuredAt ? new Date(o.measuredAt) : null,
  };
}

export function isOffsetSuspicious() {
  const o = read();
  return !!o && Math.abs(o.offsetMs) > SUSPICIOUS_OFFSET_MS;
}
