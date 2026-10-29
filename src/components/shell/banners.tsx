import * as React from "react";
import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Share, X, RefreshCw, Download } from "lucide-react";
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

// Install button (like the previous app's "Installa l'app"): Android and desktop Chrome/Edge expose
// beforeinstallprompt; iOS has no prompt, so the button shows the Share → "Add to Home Screen" steps.
// The event can fire before React mounts: capture it at module load and keep it for the components.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e as InstallPromptEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; notify(); });
}
function useInstallPrompt() {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return deferredPrompt;
}

export function InstallAppButton({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const prompt = useInstallPrompt();
  const [iosOpen, setIosOpen] = React.useState(false);
  if (isStandalone()) return null;
  if (prompt) {
    return (
      <Button size="sm" className={className} data-testid="install-app-button"
        onClick={async () => { await prompt.prompt(); await prompt.userChoice.catch(() => null); deferredPrompt = null; notify(); }}>
        <Download className="h-4 w-4" aria-hidden /> {t("pwa.install")}
      </Button>
    );
  }
  if (isIos()) {
    return (
      <div className={className}>
        <Button size="sm" variant="secondary" onClick={() => setIosOpen((v) => !v)} data-testid="install-app-ios-button">
          <Share className="h-4 w-4" aria-hidden /> {t("pwa.install")}
        </Button>
        {iosOpen && <p className="mt-2 text-sm text-muted max-w-xs" data-testid="install-app-ios-steps">{t("pwa.iosInstall")}</p>}
      </div>
    );
  }
  return null;
}

// Inside the app (Android/desktop): a banner while the browser offers installation and the app is not installed.
export function InstallBanner() {
  const { t } = useTranslation();
  const prompt = useInstallPrompt();
  if (!prompt || isStandalone()) return null;
  return (
    <div role="note" className="flex flex-wrap items-center gap-3 bg-primary/10 border-b border-border px-4 py-2 text-sm" data-testid="install-banner">
      <Download className="h-4 w-4" aria-hidden /> <span className="flex-1">{t("pwa.installHint")}</span>
      <InstallAppButton />
    </div>
  );
}
