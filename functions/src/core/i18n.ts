// Server-side texts (e-mails; later reports and anomaly details), Italian and English (R14).
export type Lang = "it" | "en";

const STRINGS: Record<Lang, Record<string, string>> = {
  it: {
    "mail.invite.subject": "Invito a {app}",
    "mail.invite.text": "Sei stato invitato a usare {app}. Imposta la tua password da questo link (scade): {link}",
    "mail.invite.html": "<p>Sei stato invitato a usare <b>{app}</b>.</p><p><a href=\"{link}\">Imposta la tua password</a> (il link scade).</p>",
    "mail.reset.subject": "{app}: reimposta la password",
    "mail.reset.text": "Per reimpostare la password di {app} usa questo link (scade): {link}. Se non l'hai chiesto, ignora questo messaggio.",
    "mail.reset.html": "<p>Per reimpostare la password di <b>{app}</b>: <a href=\"{link}\">reimposta la password</a> (il link scade).</p><p>Se non l'hai chiesto, ignora questo messaggio.</p>",
  },
  en: {
    "mail.invite.subject": "Invitation to {app}",
    "mail.invite.text": "You have been invited to use {app}. Set your password with this link (it expires): {link}",
    "mail.invite.html": "<p>You have been invited to use <b>{app}</b>.</p><p><a href=\"{link}\">Set your password</a> (the link expires).</p>",
    "mail.reset.subject": "{app}: reset your password",
    "mail.reset.text": "To reset your {app} password use this link (it expires): {link}. If you did not ask for it, ignore this message.",
    "mail.reset.html": "<p>To reset your <b>{app}</b> password: <a href=\"{link}\">reset the password</a> (the link expires).</p><p>If you did not ask for it, ignore this message.</p>",
  },
};

export function t(lang: Lang, key: string, vars: Record<string, string> = {}): string {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
