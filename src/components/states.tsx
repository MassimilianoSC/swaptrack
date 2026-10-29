import * as React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

// Designed loading, empty and error states for every screen (§15).
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
