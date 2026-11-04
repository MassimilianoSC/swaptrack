import * as React from "react";
import { Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { useNarrow, useOnline } from "@/app/hooks";
import { shellFor, isAspRole } from "@shared/roles";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "../ui/dialog";
import { Sidebar, SideNav, TopBar, ScanButton, LocationChip } from "./parts";
import { IosInstallHint, UpdatePrompt, InstallBanner, InstallNavItem } from "./banners";

// §4.13: inactivity sign-out on desktop sessions only, never in the field shell.
function useInactivity(enabled: boolean, minutes: number, signOut: () => Promise<unknown>) {
  React.useEffect(() => {
    if (!enabled) return;
    let timer = setTimeout(() => void signOut(), minutes * 60_000);
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => void signOut(), minutes * 60_000); };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(timer); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [enabled, minutes, signOut]);
}

// Classic PWA layout with a sidebar for every role (§15); field shell dark, desk shell light, chosen by width.
export function AppShell() {
  const { t } = useTranslation();
  const { claims, authSettings, safeSignOut } = useSession();
  const narrow = useNarrow();
  const role = claims?.role ?? "";
  const shell = shellFor(role, narrow);
  const [drawer, setDrawer] = React.useState(false);
  const online = useOnline();
  const loc = useLocation();
  React.useEffect(() => { setDrawer(false); }, [loc.pathname]);
  const onScan = loc.pathname === "/scan";
  useInactivity(shell === "desk" && !narrow && authSettings.inactivityEnabled, authSettings.inactivityMinutes, safeSignOut);

  return (
    <div className={cn("min-h-full flex flex-col bg-bg text-fg", shell === "field" && "theme-field")} data-testid={`shell-${shell}`}>
      <TopBar onMenu={() => setDrawer(true)} />
      <UpdatePrompt />
      <IosInstallHint />
      {/* D-59: the install banner only on the phone; the menu entry everywhere. */}
      {narrow && <InstallBanner />}
      {/* D-58 B1: desk pages read the server once; without network what they show may be old. */}
      {shell === "desk" && !online && <div role="status" className="border-b border-border bg-warning/15 px-4 py-2 text-sm" data-testid="desk-offline-strip">{t("status.offlineStrip")}</div>}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className={cn("flex-1 min-w-0 p-4 lg:p-8", isAspRole(role) && !onScan && "pb-28")} data-testid="main-content">
          <Outlet />
        </main>
      </div>
      {/* P-134: on the scanning page the floating button would only cover the screen. */}
      {isAspRole(role) && !onScan && <ScanButton />}
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogContent title={t("nav.menu")} side="left" className={cn(shell === "field" && "theme-field")}>
          {isAspRole(role) && <div className="mb-4 sm:hidden"><LocationChip /></div>}
          <SideNav onNavigate={() => setDrawer(false)} />
          <InstallNavItem className="mt-4 border-t border-border pt-2" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
