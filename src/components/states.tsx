import * as React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

// Designed loading, empty and error states for every screen (§15).

// P-152: a sign-in is going on from "Sign in" (or a provider) until the app's first page: the same signal on the button
// and on the page that waits for profile and settings. One start time, so "a few more seconds" counts from the click.
const SIGNING_KEY = "swaptrack.signingInAt";
const SLOW_MS = 4000;
export const markSigningIn = () => { try { sessionStorage.setItem(SIGNING_KEY, String(Date.now())); } catch { /* storage unavailable */ } };
export const clearSigningIn = () => { try { sessionStorage.removeItem(SIGNING_KEY); } catch { /* storage unavailable */ } };
export const signingInSince = (): number | null => { try { return Number(sessionStorage.getItem(SIGNING_KEY)) || null; } catch { return null; } };
// True once SLOW_MS have passed since the sign-in started.
export function useSigningInSlow(active: boolean): boolean {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    setSlow(false);
    const since = signingInSince();
    if (!active || !since) return;
    const timer = setTimeout(() => setSlow(true), Math.max(0, since + SLOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [active]);
  return slow;
}
export function SigningInSlow() {
  const { t } = useTranslation();
  return <p className="text-sm text-muted text-center" data-testid="signing-in-slow">{t("auth.signingInSlow")}</p>;
}
// The page between a successful sign-in and the app (profile, settings, notice still on their way).
export function SigningIn() {
  const { t } = useTranslation();
  const slow = useSigningInSlow(true);
  return (
    <div role="status" aria-busy="true" className="flex flex-col items-center gap-3 py-16 text-muted" data-testid="signing-in">
      <span className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {t("auth.signingIn")}</span>
      {slow && <SigningInSlow />}
    </div>
  );
}
export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex items-center gap-3 py-16 justify-center text-muted" data-testid="state-loading">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label ?? t("common.loading")}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-8" data-testid="state-empty">
      <Inbox className="h-6 w-6 text-muted" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted max-w-prose">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger/50 bg-danger/10 p-6" data-testid="state-error">
      <p className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="h-5 w-5" aria-hidden /> {t("common.error")}</p>
      <p className="text-sm">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry} data-testid="state-error-retry">{t("common.retry")}</Button>}
    </div>
  );
}

// Full-screen message used by the session gates (fail closed, deactivated, update required...).
export function BlockingScreen({ title, body, children, testId }: { title: string; body?: string; children?: React.ReactNode; testId: string }) {
  return (
    <div className="theme-field min-h-full bg-bg text-fg flex items-center justify-center p-6" data-testid={testId}>
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {body && <p className="text-muted">{body}</p>}
        {children}
      </div>
    </div>
  );
}
