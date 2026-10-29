import { z } from "zod";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { db, auth } from "../core/admin";
import { fail } from "../core/errors";
import { makeRouter, op, Ctx } from "../core/router";
import { adminLog } from "../core/adminLog";
import { getSettings } from "../core/settings";
import { passwordLink, queueMail } from "../core/mail";
import { rateLimit } from "../core/rateLimit";
import { ASP_ROLES, ROLES, Role, canManageUser, isAdminRole, roleFitsOrg, OrgType } from "../shared/roles";
import { EMAIL_RE } from "../shared/policy";

const lang = z.enum(["it", "en"]);
const uidSchema = z.object({ uid: z.string().min(1).max(128) });
const person = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_RE).max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  language: lang,
});

interface UserDoc { email: string | null; role: Role; orgId: string; active: boolean; language: "it" | "en"; deleted?: boolean }

async function loadUser(uid: string, tx?: Transaction): Promise<UserDoc> {
  const ref = db.collection("users").doc(uid);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists || snap.get("deleted")) fail("not-found", "user_not_found");
  return snap.data() as UserDoc;
}

function assertCanManage(ctx: Ctx, target: { role: string; orgId: string }) {
  if (!canManageUser(ctx, target)) fail("permission-denied", "forbidden");
}

// §4.9: never without an admin. Must run inside the transaction that changes the user.
async function guardLastAdmin(tx: Transaction, target: UserDoc) {
  if (!target.active || !isAdminRole(target.role)) return;
  const q = db.collection("users").where("orgId", "==", target.orgId).where("role", "==", target.role).where("active", "==", true);
  const snap = await tx.get(q);
  if (snap.size <= 1) fail("failed-precondition", "last_admin");
}

async function setClaims(uid: string, role: Role, orgId: string, active: boolean, disabledAt: number | null) {
  await auth.setCustomUserClaims(uid, { role, orgId, active, disabledAt });
}

async function deliverInvitation(ctx: Ctx, uid: string, email: string, language: "it" | "en") {
  const link = await passwordLink(email, language, "invite");
  if ((await getSettings("app")).emailConfigured) {
    await queueMail(email, language, "invite", link);
    return { delivered: "email" as const };
  }
  // DECISIONS b2: no e-mail configured -> link shown once to the inviting admin, every display logged.
  await adminLog(ctx.uid!, "invitation_link_shown", uid);
  return { delivered: "link" as const, link };
}

async function createAccount(ctx: Ctx, p: z.infer<typeof person> & { role: Role; orgId: string }) {
  const org = await db.collection("organizations").doc(p.orgId).get();
  if (!org.exists || !org.get("active")) fail("failed-precondition", "organization_inactive");
  if (!roleFitsOrg(p.role, org.get("type") as OrgType)) fail("invalid-argument", "role_not_for_organization");
  let uid: string;
  try {
    uid = (await auth.createUser({ email: p.email, emailVerified: false, disabled: false })).uid;
  } catch (e) {
    if ((e as { code?: string }).code === "auth/email-already-exists") fail("already-exists", "email_exists");
    throw e;
  }
  await setClaims(uid!, p.role, p.orgId, true, null);
  await db.collection("users").doc(uid!).set({
    email: p.email, firstName: p.firstName, lastName: p.lastName, role: p.role, orgId: p.orgId,
    active: true, disabledAt: null, language: p.language, privacyNoticeVersion: null, privacyAcceptedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  await adminLog(ctx.uid!, "user_created", uid!, { role: p.role, orgId: p.orgId });
  return { uid: uid!, ...(await deliverInvitation(ctx, uid!, p.email, p.language)) };
}

// §4.8 Deactivate: claims inactive with disabledAt, grace period for offline scans.
async function deactivate(ctx: Ctx, uid: string, checkLastAdmin: boolean) {
  const now = Date.now();
  const user = await db.runTransaction(async (tx) => {
    const u = await loadUser(uid, tx);
    if (checkLastAdmin) await guardLastAdmin(tx, u);
    tx.update(db.collection("users").doc(uid), { active: false, disabledAt: Timestamp.fromMillis(now), authDisabled: false });
    return u;
  });
  if (user.active) await setClaims(uid, user.role, user.orgId, false, now);
  await adminLog(ctx.uid!, "user_deactivated", uid);
}

const users = {
  createAsp: op({
    roles: ["client_admin"],
    schema: z.object({ name: z.string().trim().min(1).max(120), language: lang, admin: person }),
    handler: async (ctx, d) => {
      const ref = db.collection("organizations").doc();
      await ref.set({ name: d.name, type: "asp", language: d.language, active: true, createdAt: FieldValue.serverTimestamp() });
      await adminLog(ctx.uid!, "asp_created", ref.id, { name: d.name });
      const admin = await createAccount(ctx, { ...d.admin, role: "asp_admin", orgId: ref.id });
      return { orgId: ref.id, admin };
    },
  }),
  setAspActive: op({
    roles: ["client_admin"],
    schema: z.object({ orgId: z.string().min(1), active: z.boolean() }),
    handler: async (ctx, d) => {
      const ref = db.collection("organizations").doc(d.orgId);
      const org = await ref.get();
      if (!org.exists || org.get("type") !== "asp") fail("not-found", "organization_not_found");
      await ref.update({ active: d.active });
      if (!d.active) {
        const members = await db.collection("users").where("orgId", "==", d.orgId).where("active", "==", true).get();
        for (const m of members.docs) await deactivate(ctx, m.id, false);
      }
      await adminLog(ctx.uid!, d.active ? "asp_enabled" : "asp_disabled", d.orgId);
    },
  }),
  inviteUser: op({
    roles: ["client_admin", "asp_admin"],
    rate: [30, 60],
    schema: person.extend({ role: z.enum(ROLES), orgId: z.string().min(1) }),
    handler: async (ctx, d) => {
      assertCanManage(ctx, d);
      return createAccount(ctx, d);
    },
  }),
  resendInvitation: op({
    roles: ["client_admin", "asp_admin"],
    rate: [30, 60],
    schema: uidSchema,
    handler: async (ctx, d) => {
      const u = await loadUser(d.uid);
      assertCanManage(ctx, u);
      if (!u.active) fail("failed-precondition", "account_inactive");
      await adminLog(ctx.uid!, "user_invited_again", d.uid);
      return deliverInvitation(ctx, d.uid, u.email!, u.language);
    },
  }),
  changeRole: op({
    roles: ["client_admin", "asp_admin"],
    schema: uidSchema.extend({ role: z.enum(ROLES) }),
    handler: async (ctx, d) => {
      const u = await db.runTransaction(async (tx) => {
        const u = await loadUser(d.uid, tx);
        assertCanManage(ctx, u);
        assertCanManage(ctx, { role: d.role, orgId: u.orgId });
        const org = await tx.get(db.collection("organizations").doc(u.orgId));
        if (!roleFitsOrg(d.role, org.get("type"))) fail("invalid-argument", "role_not_for_organization");
        if (u.role !== d.role) await guardLastAdmin(tx, u);
        tx.update(db.collection("users").doc(d.uid), { role: d.role });
        return u;
      });
      if (u.active) await setClaims(d.uid, d.role, u.orgId, true, null);
      await adminLog(ctx.uid!, "role_changed", d.uid, { from: u.role, to: d.role });
      return { selfChanged: d.uid === ctx.uid };
    },
  }),
  deactivateUser: op({
    roles: ["client_admin", "asp_admin"],
    schema: uidSchema.extend({ reactivate: z.boolean().optional() }),
    handler: async (ctx, d) => {
      const u = await loadUser(d.uid);
      assertCanManage(ctx, u);
      if (!d.reactivate) return deactivate(ctx, d.uid, true);
      // DECISIONS: re-enabling a person is the inverse of deactivateUser (no separate op in §19.2).
      const org = await db.collection("organizations").doc(u.orgId).get();
      if (!org.get("active")) fail("failed-precondition", "organization_inactive");
      await auth.updateUser(d.uid, { disabled: false });
      await db.collection("users").doc(d.uid).update({ active: true, disabledAt: null, authDisabled: false });
      await setClaims(d.uid, u.role, u.orgId, true, null);
      await adminLog(ctx.uid!, "user_reactivated", d.uid);
    },
  }),
  blockUserNow: op({
    roles: ["client_admin", "asp_admin"],
    schema: uidSchema,
    handler: async (ctx, d) => {
      const now = Date.now();
      const u = await db.runTransaction(async (tx) => {
        const u = await loadUser(d.uid, tx);
        assertCanManage(ctx, u);
        await guardLastAdmin(tx, u);
        tx.update(db.collection("users").doc(d.uid), { active: false, disabledAt: Timestamp.fromMillis(now), authDisabled: true });
        return u;
      });
      await auth.updateUser(d.uid, { disabled: true });
      await auth.revokeRefreshTokens(d.uid);
      await setClaims(d.uid, u.role, u.orgId, false, now);
      await adminLog(ctx.uid!, "user_blocked", d.uid);
    },
  }),
  signOutEverywhere: op({
    roles: ROLES,
    schema: uidSchema,
    handler: async (ctx, d) => {
      if (d.uid !== ctx.uid) assertCanManage(ctx, await loadUser(d.uid));
      await auth.revokeRefreshTokens(d.uid);
      await adminLog(ctx.uid!, "signed_out_everywhere", d.uid);
    },
  }),
  deleteUser: op({
    roles: ["client_admin", "asp_admin"],
    schema: uidSchema,
    handler: async (ctx, d) => {
      await db.runTransaction(async (tx) => {
        const u = await loadUser(d.uid, tx);
        assertCanManage(ctx, u);
        await guardLastAdmin(tx, u);
        // §4.19: personal data removed; events keep userId until the retention job.
        tx.update(db.collection("users").doc(d.uid), {
          email: null, firstName: null, lastName: null, active: false, deleted: true, deletedAt: FieldValue.serverTimestamp(),
        });
      });
      await auth.deleteUser(d.uid).catch(() => undefined);
      await adminLog(ctx.uid!, "user_deleted", d.uid);
    },
  }),
  acceptPrivacy: op({
    roles: ROLES,
    schema: z.object({ version: z.number().int().min(1) }),
    handler: async (ctx, d) => {
      const privacy = await getSettings("privacy");
      if (privacy.version !== d.version) fail("failed-precondition", "privacy_version_changed");
      await db.collection("users").doc(ctx.uid!).update({ privacyNoticeVersion: d.version, privacyAcceptedAt: FieldValue.serverTimestamp() });
    },
  }),
  setLanguage: op({
    roles: ROLES,
    schema: z.object({ target: z.enum(["user", "organization"]), language: lang, orgId: z.string().optional() }),
    handler: async (ctx, d) => {
      if (d.target === "user") return db.collection("users").doc(ctx.uid!).update({ language: d.language }).then(() => undefined);
      if (ctx.role !== "client_admin" || !d.orgId) fail("permission-denied", "forbidden");
      const ref = db.collection("organizations").doc(d.orgId!);
      if (!(await ref.get()).exists) fail("not-found", "organization_not_found");
      await ref.update({ language: d.language });
      await adminLog(ctx.uid!, "organization_language_changed", d.orgId!, { language: d.language });
    },
  }),
  // Public (DECISIONS b1): always the same answer, so it never reveals whether an e-mail exists.
  requestPasswordReset: op({
    roles: "public",
    rate: [5, 900],
    schema: z.object({ email: z.string().trim().toLowerCase().max(254), language: lang }),
    handler: async (_ctx, d) => {
      try {
        if (!EMAIL_RE.test(d.email)) return { ok: true };
        await rateLimit(`reset_email_${d.email}`, 3, 3600);
        const snap = await db.collection("users").where("email", "==", d.email).limit(1).get();
        const u = snap.docs[0]?.data() as UserDoc | undefined;
        if (u && u.active && !u.deleted) {
          const language = u.language ?? d.language;
          await queueMail(d.email, language, "reset", await passwordLink(d.email, language, "reset"));
        }
      } catch {
        // swallowed on purpose: same answer in every case
      }
      return { ok: true };
    },
  }),
};

// asp_admin may only invite or manage the roles of their own ASP.
export const ASSIGNABLE_BY_ASP_ADMIN = ASP_ROLES.filter((r) => r !== "asp_admin");
export const usersRouter = makeRouter("users", users);
