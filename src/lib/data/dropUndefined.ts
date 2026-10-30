// The callable client encodes `undefined` as `null`, and the server schemas take an absent optional field, not
// null (z.string().optional()): a key whose value is undefined is dropped before sending, at every depth (P-61).
// Only plain objects are rebuilt: null, dates and every other value pass through unchanged.
export function dropUndefined(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropUndefined);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, dropUndefined(x)]));
  }
  return v;
}
