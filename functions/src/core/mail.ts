import { FieldValue } from "firebase-admin/firestore";
import { db, auth } from "./admin";
import { getSettings } from "./settings";
import { t, Lang } from "./i18n";

// Absolute URL of the app, per installation (functions/.env APP_URL). Used for the custom action handler (§4.6).
function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL is not configured in functions/.env");
  return url.replace(/\/$/, "");
}

// Generates the Firebase link, then points it to the app's own handler page on its own domain (§4.6).
export async function passwordLink(email: string, lang: Lang, purpose: "invite" | "reset"): Promise<string> {
  const raw = await auth.generatePasswordResetLink(email);
  const oobCode = new URL(raw).searchParams.get("oobCode") ?? "";
  return `${appUrl()}/auth/action?mode=resetPassword&purpose=${purpose}&lang=${lang}&oobCode=${encodeURIComponent(oobCode)}`;
}

// Written to `mail`, sent by the Trigger Email extension (§4.2). No e-mail API (R12).
export async function queueMail(to: string, lang: Lang, template: "invite" | "reset", link: string): Promise<void> {
  const branding = await getSettings("branding");
  const vars = { app: branding.appName, link };
  await db.collection("mail").add({
    to,
    message: {
      subject: t(lang, `mail.${template}.subject`, vars),
      text: t(lang, `mail.${template}.text`, vars),
      html: t(lang, `mail.${template}.html`, vars),
    },
    createdAt: FieldValue.serverTimestamp(),
  });
}
