// P-176: the name of an uploaded file as a download can use it again: the last part only (no folders), no control
// characters, at most 120 characters. Empty: no name (the page falls back to one of its own).
export function cleanFileName(name: string | undefined | null): string | null {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const clean = Array.from(base).filter((ch) => { const c = ch.codePointAt(0) ?? 0; return c >= 0x20 && c !== 0x7f; }).join("").trim();
  return Array.from(clean).slice(0, 120).join("").trim() || null;
}
