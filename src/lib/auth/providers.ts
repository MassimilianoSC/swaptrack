// External sign-in providers (R16): inside a native app this module is replaced by a native plugin.
// E-mail and password never depend on it.
import {
  signInWithPopup, GoogleAuthProvider, OAuthProvider, linkWithCredential, signInWithEmailAndPassword, type AuthCredential,
} from "firebase/auth";
import { auth } from "../data/firebase";

export type ProviderResult = { ok: true } | { ok: false; code: string; email?: string; pending?: AuthCredential };

async function run(provider: GoogleAuthProvider | OAuthProvider, fromError: (e: never) => AuthCredential | null): Promise<ProviderResult> {
  try {
    await signInWithPopup(auth, provider);
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; customData?: { email?: string } };
    if (err.code === "auth/account-exists-with-different-credential") {
      // §4.4: same person with password and provider -> the two credentials are linked after password sign-in.
      return { ok: false, code: "link_required", email: err.customData?.email, pending: fromError(e as never) ?? undefined };
    }
    return { ok: false, code: String(err.code ?? "unexpected").replace(/^auth\//, "").replace(/-/g, "_") };
  }
}

export const signInWithGoogle = () => run(new GoogleAuthProvider(), GoogleAuthProvider.credentialFromError);

export function signInWithMicrosoft() {
  const p = new OAuthProvider("microsoft.com");
  p.setCustomParameters({ prompt: "select_account" });
  return run(p, OAuthProvider.credentialFromError);
}

export async function linkAfterPassword(email: string, password: string, pending: AuthCredential): Promise<void> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await linkWithCredential(cred.user, pending);
}
