import * as React from "react";
import { InstallAppButton } from "@/components/shell/banners";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { MultiFactorResolver, AuthCredential } from "firebase/auth";
import { useSession } from "@/app/session";
import { signIn, resolveTotp } from "@/lib/data/auth";
import { signInWithGoogle, signInWithMicrosoft, linkAfterPassword } from "@/lib/auth/providers";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { Logo, LanguageSwitch } from "@/components/shell/parts";

export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="theme-field min-h-full bg-bg text-fg flex flex-col">
      <header className="flex items-center justify-between px-4 min-h-16 border-b border-border"><Logo /><div className="flex items-center gap-2"><InstallAppButton /><LanguageSwitch /></div></header>
      <main className="flex-1 flex items-start md:items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <h1 className="text-3xl font-semibold" data-testid="auth-title">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export default function SignIn() {
  const { t } = useTranslation();
  const { authSettings } = useSession();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [mfa, setMfa] = React.useState<MultiFactorResolver | null>(null);
  const [code, setCode] = React.useState("");
  const [link, setLink] = React.useState<{ email: string; pending: AuthCredential } | null>(null);
  const [notice] = React.useState(() => { const n = sessionStorage.getItem("swaptrack.notice"); sessionStorage.removeItem("swaptrack.notice"); return n; });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (link) { await linkAfterPassword(link.email, password, link.pending); return; }
      const r = mfa ? await resolveTotp(mfa, code) : await signIn(email, password);
      if (!r.ok && "mfa" in r) setMfa(r.mfa);
      else if (!r.ok) setError(r.code);
    } catch (err) {
      setError(String((err as { code?: string }).code ?? "unexpected").replace(/^auth\//, "").replace(/-/g, "_"));
    } finally { setBusy(false); }
  };

  const provider = async (fn: typeof signInWithGoogle) => {
    setError(null);
    const r = await fn();
    if (!r.ok && r.code === "link_required" && r.email && r.pending) { setEmail(r.email); setLink({ email: r.email, pending: r.pending }); }
    else if (!r.ok) setError(r.code);
  };

  return (
    <AuthLayout title={t(mfa ? "mfa.title" : "auth.signInTitle")}>
      {notice === "deactivated" && <p role="alert" className="rounded border border-warning p-3 text-sm" data-testid="signin-deactivated-notice">{t("gate.deactivated.done")}</p>}
      {link && <p className="text-sm" data-testid="signin-link-notice">{t("auth.linkRequired")}</p>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!mfa ? (
          <>
            <Field label={t("auth.email")} htmlFor="email"><Input id="email" type="email" autoComplete="username" value={email} disabled={!!link} onChange={(e) => setEmail(e.target.value)} data-testid="signin-email-input" required /></Field>
            <Field label={t("auth.password")} htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="signin-password-input" required /></Field>
          </>
        ) : (
          <Field label={t("mfa.code")} htmlFor="totp"><Input id="totp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} data-testid="signin-totp-input" /></Field>
        )}
        {error && <p role="alert" className="text-sm text-danger" data-testid="signin-error">{t(`errors.${error}`, { defaultValue: t("errors.sign_in_failed") })}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy} data-testid="signin-submit-button">{t("auth.signIn")}</Button>
      </form>
      {!mfa && !link && (authSettings.google || authSettings.microsoft) && (
        <div className="space-y-2">
          {authSettings.google && <Button variant="secondary" className="w-full" onClick={() => provider(signInWithGoogle)} data-testid="signin-google-button">{t("auth.withGoogle")}</Button>}
          {authSettings.microsoft && <Button variant="secondary" className="w-full" onClick={() => provider(signInWithMicrosoft)} data-testid="signin-microsoft-button">{t("auth.withMicrosoft")}</Button>}
        </div>
      )}
      <Link to="/forgot" className="inline-block underline text-sm min-h-touch" data-testid="signin-forgot-link">{t("auth.forgot")}</Link>
    </AuthLayout>
  );
}
