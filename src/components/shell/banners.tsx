import * as React from "react";
import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Share, X, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

// §16: "new version available, reload".
export function UpdatePrompt() {
  const { t } = useTranslation();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 bg-primary/15 border-b border-border px-4 py-2 text-sm" data-testid="update-banner">
      <RefreshCw className="h-4 w-4" aria-hidden /> {t("pwa.newVersion")}
      <Button size="sm" onClick={() => updateServiceWorker(true)} data-testid="update-reload-button">{t("pwa.reload")}</Button>
    </div>
  );
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

// §7.4.5: iOS has no install button; remind until installed (dismissed only for this session).
export function IosInstallHint() {
  const { t } = useTranslation();
  const [hidden, setHidden] = React.useState(() => sessionStorage.getItem("swaptrack.iosHint") === "1");
  if (!isIos() || isStandalone() || hidden) return null;
  return (
    <div role="note" className="flex items-start gap-3 bg-warning/15 border-b border-border px-4 py-3 text-sm" data-testid="ios-install-hint">
      <Share className="h-5 w-5 shrink-0" aria-hidden />
      <p className="flex-1">{t("pwa.iosInstall")}</p>
      <Button size="icon" variant="ghost" aria-label={t("common.close")} onClick={() => { sessionStorage.setItem("swaptrack.iosHint", "1"); setHidden(true); }} data-testid="ios-install-hint-close"><X className="h-5 w-5" /></Button>
    </div>
  );
}
