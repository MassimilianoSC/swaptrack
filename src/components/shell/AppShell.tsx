import * as React from "react";
import { Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { useNarrow } from "@/app/hooks";
import { shellFor, isAspRole } from "@shared/roles";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "../ui/dialog";
import { Sidebar, SideNav, TopBar, ScanButton, LocationChip } from "./parts";
import { IosInstallHint, UpdatePrompt, InstallBanner } from "./banners";

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
  const loc = useLocation();
  React.useEffect(() => { setDrawer(false); }, [loc.pathname]);
  useInactivity(shell === "desk" && !narrow && authSettings.inactivityEnabled, authSettings.inactivityMinutes, safeSignOut);

  return (
    <div className={cn("min-h-full flex flex-col bg-bg text-fg", shell === "field" && "theme-field")} data-testid={`shell-${shell}`}>
      <TopBar onMenu={() => setDrawer(true)} />
      <UpdatePrompt />
      <IosInstallHint />
      <InstallBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className={cn("flex-1 min-w-0 p-4 lg:p-8", isAspRole(role) && "pb-28")} data-testid="main-content">
          <Outlet />
        </main>
      </div>
      {isAspRole(role) && <ScanButton />}
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogContent title={t("nav.menu")} side="left" className={cn(shell === "field" && "theme-field")}>
          {isAspRole(role) && <div className="mb-4 sm:hidden"><LocationChip /></div>}
          <SideNav onNavigate={() => setDrawer(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
