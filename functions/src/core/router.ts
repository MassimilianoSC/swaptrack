import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z, ZodTypeAny } from "zod";
import { REGION } from "./admin";
import { fail } from "./errors";
import { rateLimit } from "./rateLimit";
import { getSettings } from "./settings";
import { Area, OpName, OPERATIONS, PUBLIC_OPERATIONS, areaOf } from "../shared/operations";
import { Role, isAdminRole } from "../shared/roles";

export interface Ctx {
  uid: string | null;
  role: Role;
  orgId: string;
  ip: string;
  token: Record<string, unknown>;
}

export interface OpDef<S extends ZodTypeAny> {
  roles: readonly Role[] | "public";
  schema: S;
  rate?: [limit: number, windowSec: number];
  // §4.8: a deactivated user in the grace period (claims active false, disabledAt set) may still call this op;
  // the handler then checks that the data predates the deactivation.
  grace?: boolean;
  handler: (ctx: Ctx, data: z.infer<S>) => Promise<unknown>;
}

export const op = <S extends ZodTypeAny>(def: OpDef<S>) => def;

// One router per area (R20). Auth, permissions, validation, rate limit and logging apply to every op.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeRouter(area: Area, handlers: Partial<Record<OpName, OpDef<any>>>) {
  return onCall({ region: REGION, enforceAppCheck: false }, async (req: CallableRequest<unknown>) => {
    const started = Date.now();
    const body = (req.data ?? {}) as { op?: string; data?: unknown };
    const name = String(body.op ?? "");
    if (areaOf(name) !== area) fail("not-found", "unknown_operation");
    const def = handlers[name as OpName];
    if (!def) fail("unimplemented", "not_implemented");
    const ip = req.rawRequest?.ip ?? "unknown";
    let ctx: Ctx;
    if (def!.roles === "public") {
      if (!PUBLIC_OPERATIONS.includes(name as OpName)) fail("permission-denied", "forbidden");
      ctx = { uid: req.auth?.uid ?? null, role: "asp_technician", orgId: "", ip, token: {} };
    } else {
      const token = req.auth?.token as Record<string, unknown> | undefined;
      if (!req.auth || !token) fail("unauthenticated", "not_signed_in");
      if (token!.active !== true && !(def!.grace && typeof token!.disabledAt === "number")) fail("permission-denied", "account_inactive");
      const role = token!.role as Role;
      if (!(def!.roles as readonly string[]).includes(role)) fail("permission-denied", "forbidden");
      if (isAdminRole(role) && (await getSettings("auth")).mfaAdmins) {
        const fb = token!.firebase as { sign_in_second_factor?: string } | undefined;
        if (!fb?.sign_in_second_factor) fail("permission-denied", "mfa_required");
      }
      ctx = { uid: req.auth!.uid, role, orgId: String(token!.orgId ?? ""), ip, token: token! };
    }
    const [limit, windowSec] = def!.rate ?? [60, 60];
    await rateLimit(`${name}_${ctx.uid ?? "ip_" + ip}`, limit, windowSec);
    const parsed = def!.schema.safeParse(body.data ?? {});
    if (!parsed.success) fail("invalid-argument", "invalid_data");
    try {
      const result = await def!.handler(ctx, parsed.data);
      logger.info("op", { area, op: name, uid: ctx.uid, ok: true, ms: Date.now() - started });
      return result ?? { ok: true };
    } catch (e) {
      logger.warn("op", { area, op: name, uid: ctx.uid, ok: false, error: (e as Error).message, ms: Date.now() - started });
      throw e;
    }
  });
}

export const OPS_OF = (area: Area) => (Object.keys(OPERATIONS) as OpName[]).filter((o) => OPERATIONS[o] === area);
