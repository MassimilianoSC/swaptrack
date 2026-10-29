// The single place where server operations are called (R20).
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { OPERATIONS, type OpName } from "@shared/operations";

export class OpError extends Error {
  constructor(public code: string) { super(code); }
}

export async function call<T = unknown>(op: OpName, data: unknown = {}): Promise<T> {
  try {
    const res = await httpsCallable(functions, OPERATIONS[op])({ op, data });
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
