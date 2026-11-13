import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { call, OpError } from "@/lib/data/call";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { AuthLayout } from "./SignIn";

// §4.6: the message never reveals whether an e-mail exists.
export default function ForgotPassword() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // P-207: the server answers the same for every address (§4.6), so an error here is never about the address: no
  // network, the limit of requests, a server not reached. It is said (it said "you will receive an e-mail" offline too).
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await call("requestPasswordReset", { email, language: i18n.language });
      setSent(true);
    } catch (err) {
      const code = err instanceof OpError ? err.code : "unexpected";
      setError(t(`errors.${code}`, { defaultValue: t("errors.unexpected") }));
    } finally { setBusy(false); }
  };
  return (
    <AuthLayout title={t("auth.forgotTitle")}>
      {sent ? (
        <p role="status" data-testid="forgot-sent-message">{t("auth.forgotSent")}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted">{t("auth.forgotHint")}</p>
          <Field label={t("auth.email")} htmlFor="email"><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email-input" required /></Field>
          {error && <p role="alert" className="text-sm text-danger" data-testid="forgot-error">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email} data-testid="forgot-submit-button">{t("auth.forgotSubmit")}</Button>
        </form>
      )}
      <Link to="/signin" className="inline-block underline text-sm min-h-touch" data-testid="forgot-back-link">{t("auth.backToSignIn")}</Link>
    </AuthLayout>
  );
}
