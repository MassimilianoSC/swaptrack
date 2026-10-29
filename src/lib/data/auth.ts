// Auth access (R2). External providers live in src/lib/auth/providers.ts (R16).
import {
  signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential,
  updatePassword, verifyPasswordResetCode, confirmPasswordReset, getMultiFactorResolver, TotpMultiFactorGenerator,
  multiFactor, type User, type MultiFactorResolver, type TotpSecret,
} from "firebase/auth";
import { auth } from "./firebase";

export type { User };
export interface Claims { role?: string; orgId?: string; active?: boolean; disabledAt?: number | null }

export const onUser = (cb: (u: User | null) => void) => onAuthStateChanged(auth, cb);
export const currentUser = () => auth.currentUser;

export async function readClaims(user: User, refresh = false): Promise<Claims & { secondFactor: boolean }> {
  const r = await user.getIdTokenResult(refresh);
  const c = r.claims as Claims;
  return { role: c.role, orgId: c.orgId, active: c.active, disabledAt: c.disabledAt ?? null, secondFactor: !!r.signInSecondFactor };
}

export type SignInResult = { ok: true } | { ok: false; mfa: MultiFactorResolver } | { ok: false; code: string };

const authCode = (e: unknown) => String((e as { code?: string }).code ?? "unexpected").replace(/^auth\//, "").replace(/-/g, "_");

export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === "auth/multi-factor-auth-required") {
      return { ok: false, mfa: getMultiFactorResolver(auth, e as never) };
    }
    return { ok: false, code: authCode(e) };
  }
}

export async function resolveTotp(resolver: MultiFactorResolver, code: string): Promise<SignInResult> {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) return { ok: false, code: "mfa_no_totp" };
  try {
    await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
    return { ok: true };
  } catch (e) {
    return { ok: false, code: authCode(e) };
  }
}

export const signOut = () => fbSignOut(auth);

export async function changePassword(current: string, next: string): Promise<void> {
  const u = auth.currentUser;
  if (!u?.email) throw new Error("not_signed_in");
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
    await updatePassword(u, next);
  } catch (e) {
    throw new Error(authCode(e));
  }
}

export async function checkActionCode(oobCode: string): Promise<string> {
  try { return await verifyPasswordResetCode(auth, oobCode); } catch (e) { throw new Error(authCode(e)); }
}

export async function setNewPassword(oobCode: string, password: string): Promise<void> {
  try { await confirmPasswordReset(auth, oobCode, password); } catch (e) { throw new Error(authCode(e)); }
}

// §4.14: TOTP for admins (requires Identity Platform).
export const hasMfa = (u: User) => multiFactor(u).enrolledFactors.length > 0;
export async function startTotpEnrollment(u: User): Promise<TotpSecret> {
  const session = await multiFactor(u).getSession();
  return TotpMultiFactorGenerator.generateSecret(session);
}
export async function finishTotpEnrollment(u: User, secret: TotpSecret, code: string): Promise<void> {
  try {
    await multiFactor(u).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), "TOTP");
  } catch (e) {
    throw new Error(authCode(e));
  }
}
