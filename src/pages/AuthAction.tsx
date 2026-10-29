import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { checkActionCode, setNewPassword } from "@/lib/data/auth";
import { passwordIssues } from "@shared/policy";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { Loading } from "@/components/states";
import { AuthLayout } from "./SignIn";

// Custom action handler served by the app on its own domain (§4.6): invitation and password reset.
export default function AuthAction() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const oobCode = params.get("oobCode") ?? "";
  const invite = params.get("purpose") === "invite";
  const [email, setEmail] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"checking" | "form" | "invalid" | "done">("checking");
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const lang = params.get("lang");
    if (lang === "it" || lang === "en") void i18n.changeLanguage(lang);
    if (params.get("mode") !== "resetPassword" || !oobCode) { setState("invalid"); return; }
    checkActionCode(oobCode).then((e) => { setEmail(e); setState("form"); }).catch(() => setState("invalid"));
  }, [oobCode, params, i18n]);

  const issues = passwordIssues(pw);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (issues.length || pw !== pw2) return;
    try { await setNewPassword(oobCode, pw); setState("done"); } catch (err) { setError((err as Error).message); }
  };

  return (
    <AuthLayout title={t(invite ? "auth.setPasswordTitle" : "auth.resetTitle")}>
      {state === "checking" && <Loading />}
      {state === "invalid" && <p role="alert" data-testid="action-invalid">{t("auth.linkInvalid")}</p>}
      {state === "done" && <p role="status" data-testid="action-done">{t("auth.passwordSet")}</p>}
      {state === "form" && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted" data-testid="action-email">{email}</p>
          <Field label={t("auth.newPassword")} htmlFor="pw" hint={t("auth.passwordPolicy")}><Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="action-password-input" /></Field>
          <Field label={t("auth.confirmPassword")} htmlFor="pw2"><Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="action-password-confirm-input" /></Field>
          {pw && issues.length > 0 && <ul className="text-sm text-danger" data-testid="action-password-issues">{issues.map((i) => <li key={i}>{t(`errors.${i}`)}</li>)}</ul>}
          {pw2 && pw !== pw2 && <p className="text-sm text-danger">{t("errors.password_mismatch")}</p>}
          {error && <p role="alert" className="text-sm text-danger">{t(`errors.${error}`, { defaultValue: t("errors.unexpected") })}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={issues.length > 0 || pw !== pw2} data-testid="action-submit-button">{t("auth.savePassword")}</Button>
        </form>
      )}
      <Link to="/signin" className="inline-block underline text-sm min-h-touch" data-testid="action-signin-link">{t("auth.backToSignIn")}</Link>
    </AuthLayout>
  );
}
