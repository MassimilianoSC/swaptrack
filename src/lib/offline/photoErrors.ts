// P-69: only these Storage errors can never succeed on a retry; a missing or weak network never makes a photo lost.
const PERMANENT_STORAGE_ERRORS = new Set(["storage/unauthorized", "storage/invalid-argument", "storage/invalid-format", "storage/quota-exceeded"]);

export const isPermanentPhotoError = (code: string | undefined): boolean => !!code && PERMANENT_STORAGE_ERRORS.has(code);

// A photo is declared lost after this many permanent failures (or at once if the stored file is unreadable).
export const MAX_PERMANENT_FAILURES = 5;

// storage/unauthorized can also last a few minutes after a change of role or ASP, until the ID token (which carries
// the claims, and lives one hour) is refreshed: a permanent failure counts only 15 minutes after the previous counted
// one, so five of them take more than an hour.
export const MIN_PERMANENT_INTERVAL_MS = 15 * 60 * 1000;
export const countsAsPermanentFailure = (lastCountedAt: number | undefined, now: number): boolean =>
  lastCountedAt === undefined || now - lastCountedAt >= MIN_PERMANENT_INTERVAL_MS;
