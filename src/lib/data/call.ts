// The single place where server operations are called (R20).
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { OPERATIONS, type OpName } from "@shared/operations";
import { dropUndefined } from "./dropUndefined";

export class OpError extends Error {
  constructor(public code: string) { super(code); }
}

// P-153: how long the app waits for an answer. The SDK default is 70 s, while some routers may work up to 120 s
// (desk, documents): a longer wait than the server's longest, so a slow export is not given up while it is still made.
export const CALL_TIMEOUT_MS = 130_000;

export async function call<T = unknown>(op: OpName, data: unknown = {}): Promise<T> {
  try {
    const res = await httpsCallable(functions, OPERATIONS[op], { timeout: CALL_TIMEOUT_MS })({ op, data: dropUndefined(data) });
    return res.data as T;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // Server errors carry a code in the message (functions/src/core/errors.ts).
    const code = err.code === "functions/unavailable" || err.code === "functions/internal" && !navigator.onLine
      ? "offline"
      : /^[a-z_]+$/.test(err.message ?? "") ? err.message! : "unexpected";
    throw new OpError(code);
  }
}
