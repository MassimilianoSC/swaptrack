import { auth } from "./admin";

export type Lang = "it" | "en";

// Absolute URL of the app, per installation (functions/.env APP_URL). Used for the custom action handler (§4.6).
function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL is not configured in functions/.env");
  return url.replace(/\/$/, "");
}

// The link shown once to the inviting admin when invitations are not e-mailed (DECISIONS b2): Firebase's link,
// pointed to the app's own handler page on its own domain (§4.6).
export async function passwordLink(email: string, lang: Lang, purpose: "invite" | "reset"): Promise<string> {
  const raw = await auth.generatePasswordResetLink(email);
  const oobCode = new URL(raw).searchParams.get("oobCode") ?? "";
  return `${appUrl()}/auth/action?mode=resetPassword&purpose=${purpose}&lang=${lang}&oobCode=${encodeURIComponent(oobCode)}`;
}

// D-69 (P-140): the «set your password» (invitation) and «reset your password» e-mails are sent by Firebase
// Authentication with its «password reset» template (console: Authentication → Templates, whose custom action URL is
// the app's /auth/action). It is the call the web SDK makes for sendPasswordResetEmail: Identity Toolkit
// accounts:sendOobCode with the public web API key (WEB_API_KEY in functions/.env: the same key the app ships, not a
// secret). No e-mail service of our own and no extension (R12). continueUrl carries the purpose and the language, so
// the action page says «set your password» for an invitation. On the emulators the call goes to the Auth emulator,
// which records the e-mail instead of sending it.
export async function sendPasswordEmail(email: string, lang: Lang, purpose: "invite" | "reset"): Promise<void> {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const body = JSON.stringify({ requestType: "PASSWORD_RESET", email, continueUrl: `${appUrl()}/signin?purpose=${purpose}&lang=${lang}` });
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Firebase-Locale": lang };
  let url: string;
  if (emulator) {
    // The emulator serves several projects: the project goes in the path, with its admin token.
    const project = process.env.GCLOUD_PROJECT ?? JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId;
    url = `http://${emulator}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:sendOobCode`;
    headers.Authorization = "Bearer owner";
  } else {
    const key = process.env.WEB_API_KEY;
    if (!key) throw new Error("WEB_API_KEY is not configured in functions/.env");
    url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`;
  }
  const r = await fetch(url, { method: "POST", headers, body });
  // Google's error code only (for example UNAUTHORIZED_DOMAIN when APP_URL's domain is not authorized in Auth).
  if (!r.ok) throw new Error(`password e-mail not sent (${r.status} ${((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? ""})`);
}
