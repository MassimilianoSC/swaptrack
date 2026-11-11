// P-181: the code of a server error, from what the Firebase client gives the app. The server sends its code as the message
// of an HttpsError (functions/src/core/errors.ts); @firebase/functions 0.14 (firebase 12) adds the HTTP status to it,
// "forbidden [403]", so before P-181 every server error read as "unexpected" (online and on the emulators alike).
// No network ("unavailable", or "internal" while the browser is offline): "offline". Anything else: "unexpected".
// Pure, so that a unit test can give it the errors in the client's real shape.
export function opErrorCode(err: { code?: string; message?: string } | null | undefined, online: boolean): string {
  if (err?.code === "functions/unavailable" || (err?.code === "functions/internal" && !online)) return "offline";
  const message = String(err?.message ?? "").replace(/\s*\[\d+\]\s*$/, "");
  return /^[a-z_]+$/.test(message) ? message : "unexpected";
}
