// P-69: only these Storage errors can never succeed on a retry; a missing or weak network never makes a photo lost.
const PERMANENT_STORAGE_ERRORS = new Set(["storage/unauthorized", "storage/invalid-argument", "storage/invalid-format", "storage/quota-exceeded"]);

export const isPermanentPhotoError = (code: string | undefined): boolean => !!code && PERMANENT_STORAGE_ERRORS.has(code);

// A photo is declared lost after this many permanent failures (or at once if the stored file is unreadable).
export const MAX_PERMANENT_FAILURES = 5;
