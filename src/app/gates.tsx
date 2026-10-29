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
import { flushQueue } from "@/lib/offline/photoQueue";
import { useAction } from "./hooks";
import type { TotpSecret } from "firebase/auth";

export function FailClosedScreen() {
  const { t } = useTranslation();
  const { failReason } = useSession();
  return (
    <BlockingScreen testId="fail-closed-screen" title={t(`gate.${failReason}.title`)} body={t(`gate.${failReason}.body`)}>
      <Button onClick={() => location.reload()} data-testid="fail-closed-retry">{t("common.retry")}</Button>
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
      await flushPendingWrites().catch(() => undefined);
      // §4.8 / §7.3: upload the queued photos (attachPhotos) before clearing the device.
      await flushQueue().catch(() => undefined);
      try { await clearDevice(); } catch (e) { if ((e as Error).message === "other_tabs") { setStep("tabs"); return; } }
      sessionStorage.setItem("swaptrack.notice", "deactivated");
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
  const { privacy } = useSession();
  const { busy, run } = useAction();
  if (!privacy) return <Loading />;
  const text = privacy.texts[i18n.language as "it" | "en"] || privacy.texts.it || privacy.texts.en;
  return (
    <BlockingScreen testId="privacy-gate" title={t("privacy.title")} body={t("privacy.versionLabel", { version: privacy.version })}>
      <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded border border-border bg-surface p-4 text-sm" data-testid="privacy-text">
        {text || t("privacy.missing")}
      </div>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => run(() => call("acceptPrivacy", { version: privacy.version }))} data-testid="privacy-accept-button">{t("privacy.accept")}</Button>
        <Button variant="secondary" onClick={() => signOut()} data-testid="privacy-signout-button">{t("auth.signOut")}</Button>
      </div>
    </BlockingScreen>
  );
}

// §4.14: TOTP enrollment required for admins when the setting is on.
export function MfaEnrollGate() {
  const { t } = useTranslation();
  const { user, claims, branding } = useSession();
  const { busy, run } = useAction();
  const [secret, setSecret] = React.useState<TotpSecret | null>(null);
  const [code, setCode] = React.useState("");
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
        <Button disabled={busy} onClick={() => run(async () => setSecret(await startTotpEnrollment(user!)))} data-testid="mfa-start-button">{t("mfa.start")}</Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">{t("mfa.secretHint")}</p>
          <code className="block break-all rounded bg-surface p-3 font-mono text-sm" data-testid="mfa-secret">{secret.secretKey}</code>
          <a className="text-sm underline break-all" href={secret.generateQrCodeUrl(user!.email ?? "", branding.appName)} data-testid="mfa-otpauth-link">{t("mfa.openApp")}</a>
          <Field label={t("mfa.code")} htmlFor="mfa-code"><Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} data-testid="mfa-code-input" /></Field>
          <Button disabled={busy || code.length < 6} onClick={() => run(async () => { await finishTotpEnrollment(user!, secret, code); await signOut(); })} data-testid="mfa-confirm-button">{t("mfa.confirm")}</Button>
        </div>
      )}
    </BlockingScreen>
  );
}
