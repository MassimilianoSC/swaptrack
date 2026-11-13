import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "./session";
import { BlockingScreen, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { call } from "@/lib/data/call";
import { signOut, hasMfa, startTotpEnrollment, finishTotpEnrollment } from "@/lib/data/auth";
import { flushPendingWrites } from "@/lib/data/db";
import { clearDevice } from "@/lib/offline/device";
import { flushQueue, listQueued } from "@/lib/offline/photoQueue";
import { rejectedScanCount } from "@/lib/data/events";
import { useAction } from "./hooks";
import { SignOutBlockedDialog } from "@/components/shell/parts";
import type { TotpSecret } from "firebase/auth";
import { toast } from "sonner";

export function FailClosedScreen() {
  const { t } = useTranslation();
  const { failReason } = useSession();
  return (
    <BlockingScreen testId="fail-closed-screen" title={t(`gate.${failReason}.title`)} body={t(`gate.${failReason}.body`)}>
      <Button onClick={() => location.reload()} data-testid="fail-closed-retry">{t("common.retry")}</Button>
    </BlockingScreen>
  );
}

// P-87b (D-40): another user signs in on a device where the previous one left readings or photos not yet sent.
export function PreviousPendingScreen() {
  const { t } = useTranslation();
  const { leftBehind, keepPrevious, discardPrevious } = useSession();
  const [busy, setBusy] = React.useState(false);
  const act = (fn: () => Promise<void>) => { setBusy(true); void fn().finally(() => setBusy(false)); };
  const body = leftBehind > 0 ? t("gate.previousPending.body", { count: leftBehind }) : t("gate.previousPending.bodyUnknown");
  return (
    <BlockingScreen testId="previous-pending-screen" title={t("gate.previousPending.title")} body={body}>
      <div className="flex flex-col gap-2">
        <Button disabled={busy} onClick={() => act(keepPrevious)} data-testid="previous-pending-keep">{t("gate.previousPending.keep")}</Button>
        <Button variant="danger" disabled={busy} onClick={() => act(discardPrevious)} data-testid="previous-pending-discard">{t("gate.previousPending.discard")}</Button>
      </div>
    </BlockingScreen>
  );
}

export function NoAccountScreen() {
  const { t } = useTranslation();
  return (
    <BlockingScreen testId="no-account-screen" title={t("gate.noAccount.title")} body={t("gate.noAccount.body")}>
      <Button onClick={() => signOut()} data-testid="no-account-signout">{t("auth.signOut")}</Button>
    </BlockingScreen>
  );
}

// §4.8: send what is pending, then sign out and clear the device.
export function DeactivatedScreen() {
  const { t } = useTranslation();
  const { pending } = useSession();
  const [step, setStep] = React.useState<"sending" | "tabs">("sending");
  React.useEffect(() => {
    void (async () => {
      const writesOk = await flushPendingWrites().then(() => true, () => false);
      // §4.8 / §7.3: upload the queued photos (attachPhotos) before clearing the device.
      await flushQueue().catch(() => undefined);
      // P-115 (n.33): "everything was sent" only when it is true: no reading refused, no photo left in the queue.
      const allSent = writesOk && rejectedScanCount() === 0 && (await listQueued().catch(() => [1])).length === 0;
      try { await clearDevice(); } catch (e) { if ((e as Error).message === "other_tabs") { setStep("tabs"); return; } }
      sessionStorage.setItem("swaptrack.notice", allSent ? "deactivated" : "deactivated_partial");
      await signOut().catch(() => undefined);
      location.reload();
    })();
  }, []);
  return (
    <BlockingScreen testId="deactivated-screen" title={t("gate.deactivated.title")} body={t(step === "tabs" ? "gate.other_tabs.body" : "gate.deactivated.body")}>
      <p className="text-sm tabular" data-testid="deactivated-pending">{t("status.pending", { count: pending.events + pending.photos })}</p>
    </BlockingScreen>
  );
}

export function UpdateRequiredScreen() {
  const { t } = useTranslation();
  return (
    <BlockingScreen testId="update-required-screen" title={t("gate.update.title")} body={t("gate.update.body")}>
      <Button onClick={async () => {
        const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
        await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
        location.reload();
      }} data-testid="update-required-reload">{t("pwa.reload")}</Button>
    </BlockingScreen>
  );
}

// §4.15: privacy notice accepted at first sign-in and at every new version.
export function PrivacyGate() {
  const { t, i18n } = useTranslation();
  const { privacy, safeSignOut } = useSession();
  const { busy, run } = useAction();
  // D-40 (P-87a): leaving from the notice goes through the same check as the user menu: never with readings or photos
  // still waiting to be sent.
  const [blocked, setBlocked] = React.useState(false);
  if (!privacy) return <Loading />;
  const text = privacy.texts[i18n.language as "it" | "en"] || privacy.texts.it || privacy.texts.en;
  return (
    <BlockingScreen testId="privacy-gate" title={t("privacy.title")} body={t("privacy.versionLabel", { version: privacy.version })}>
      <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded border border-border bg-surface p-4 text-sm" data-testid="privacy-text">
        {text || t("privacy.missing")}
      </div>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => run(() => call("acceptPrivacy", { version: privacy.version }))} data-testid="privacy-accept-button">{t("privacy.accept")}</Button>
        <Button variant="secondary" onClick={async () => { if ((await safeSignOut()) === "pending") setBlocked(true); }} data-testid="privacy-signout-button">{t("auth.signOut")}</Button>
      </div>
      <SignOutBlockedDialog open={blocked} onOpenChange={setBlocked} />
    </BlockingScreen>
  );
}

// §4.14: TOTP enrollment required for admins when the setting is on.
export function MfaEnrollGate() {
  const { t } = useTranslation();
  const { user, claims, branding, safeSignOut } = useSession();
  const { busy, run } = useAction();
  const [secret, setSecret] = React.useState<TotpSecret | null>(null);
  const [code, setCode] = React.useState("");
  // P-207: "Sign out" always there (an administrator without the phone at hand was stuck on this screen), blocked as
  // anywhere else while readings or photos wait to be sent.
  const [blocked, setBlocked] = React.useState(false);
  const leave = (
    <>
      <Button variant="secondary" onClick={async () => { if ((await safeSignOut()) === "pending") setBlocked(true); }} data-testid="mfa-signout-button">{t("auth.signOut")}</Button>
      <SignOutBlockedDialog open={blocked} onOpenChange={setBlocked} />
    </>
  );
  if (user && hasMfa(user) && !claims?.secondFactor) {
    return (
      <BlockingScreen testId="mfa-resignin" title={t("mfa.title")} body={t("mfa.signInAgain")}>
        <Button onClick={() => signOut()} data-testid="mfa-resignin-button">{t("auth.signOut")}</Button>
      </BlockingScreen>
    );
  }
  return (
    <BlockingScreen testId="mfa-enroll-gate" title={t("mfa.title")} body={t("mfa.required")}>
      {!secret ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => run(async () => setSecret(await startTotpEnrollment(user!)))} data-testid="mfa-start-button">{t("mfa.start")}</Button>
          {leave}
        </div>
      ) : (
        <div className="space-y-3">
          {/* P-207: what to do with the key, said step by step (a computer has nothing to open the link with). */}
          <p className="text-sm" data-testid="mfa-secret-hint">{t("mfa.secretHint")}</p>
          <div className="flex items-center gap-2">
            <code className="block min-w-0 flex-1 break-all rounded bg-surface p-3 font-mono text-sm" data-testid="mfa-secret">{secret.secretKey}</code>
            <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(secret.secretKey).then(() => toast.success(t("common.copied")), () => undefined); }} data-testid="mfa-secret-copy">{t("common.copy")}</Button>
          </div>
          <a className="text-sm underline break-all" href={secret.generateQrCodeUrl(user!.email ?? "", branding.appName)} data-testid="mfa-otpauth-link">{t("mfa.openApp")}</a>
          <Field label={t("mfa.code")} htmlFor="mfa-code"><Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} data-testid="mfa-code-input" /></Field>
          <p className="text-xs text-muted">{t("mfa.afterConfirmHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || code.length < 6} onClick={() => run(async () => { await finishTotpEnrollment(user!, secret, code); toast.success(t("mfa.done")); await signOut(); })} data-testid="mfa-confirm-button">{t("mfa.confirm")}</Button>
            {leave}
          </div>
        </div>
      )}
    </BlockingScreen>
  );
}
