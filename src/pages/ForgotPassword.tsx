import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { call } from "@/lib/data/call";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { AuthLayout } from "./SignIn";

// §4.6: the message never reveals whether an e-mail exists.
export default function ForgotPassword() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await call("requestPasswordReset", { email, language: i18n.language }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  };
  return (
    <AuthLayout title={t("auth.forgotTitle")}>
      {sent ? (
        <p role="status" data-testid="forgot-sent-message">{t("auth.forgotSent")}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted">{t("auth.forgotHint")}</p>
          <Field label={t("auth.email")} htmlFor="email"><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email-input" required /></Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email} data-testid="forgot-submit-button">{t("auth.forgotSubmit")}</Button>
        </form>
      )}
      <Link to="/signin" className="inline-block underline text-sm min-h-touch" data-testid="forgot-back-link">{t("auth.backToSignIn")}</Link>
    </AuthLayout>
  );
}
