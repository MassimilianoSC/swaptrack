// Pure validation shared by app and functions (R19).
export const PASSWORD_MIN = 10;

// §4.7: at least 10 characters, letters and digits.
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if ((pw ?? "").length < PASSWORD_MIN) issues.push("password_too_short");
  if (!/\p{L}/u.test(pw ?? "")) issues.push("password_needs_letter");
  if (!/\d/.test(pw ?? "")) issues.push("password_needs_digit");
  return issues;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Compares two semantic versions "1.2.3". Returns -1, 0, 1.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Deterministic document ids, so uniqueness of `code` / `materialCode` holds by construction.
export function locationIdFor(code: string): string {
  return `loc_${encodeURIComponent(code.trim())}`;
}
export function modelIdFor(materialCode: string): string {
  return `mdl_${encodeURIComponent(materialCode.trim())}`;
}
