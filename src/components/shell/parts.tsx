import * as React from "react";
import { NavLink, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronsLeft, ChevronsRight, Menu as MenuIcon, ScanLine, Wifi, WifiOff, MapPin, LogOut, User as UserIcon, BookOpen, Languages, Bell } from "lucide-react";
import { useSession } from "@/app/session";
import { navFor } from "@/app/nav";
import { useOnline } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { logoUrl } from "@/lib/data/storage";
import { watchOpenAlertCount } from "@/lib/data/documents";
import { isAspRole } from "@shared/roles";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent } from "../ui/dialog";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuSeparator } from "../ui/menu";

export function Logo() {
  const { branding } = useSession();
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => { void logoUrl(branding.logoPath).then(setUrl); }, [branding.logoPath]);
  return (
    <Link to="/" className="flex items-center gap-2 min-h-touch font-semibold" data-testid="topbar-logo">
      {url ? <img src={url} alt="" className="h-7 w-auto" /> : <span className="rounded bg-primary text-primary-fg px-1.5 py-0.5 font-mono text-sm font-bold" aria-hidden>ST</span>}
      <span className="truncate">{branding.appName}</span>
    </Link>
  );
}

export function SideNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { claims } = useSession();
  return (
    <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
      {navFor(claims?.role ?? "").map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={onNavigate} title={collapsed ? t(n.label) : undefined}
          data-testid={`nav-${n.to.replace(/\//g, "-").replace(/^-/, "") || "home"}`}
          className={({ isActive }) => cn("flex items-center gap-3 rounded px-3 min-h-touch text-sm font-medium hover:bg-surface-2", isActive && "bg-primary/15 border-l-4 border-primary")}>
          <n.icon className="h-5 w-5 shrink-0" aria-hidden />
          {!collapsed && <span>{t(n.label)}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem("swaptrack.sidebar") === "1");
  const toggle = () => { localStorage.setItem("swaptrack.sidebar", collapsed ? "0" : "1"); setCollapsed(!collapsed); };
  return (
    <aside className={cn("hidden md:flex flex-col border-r border-border bg-surface p-2 gap-2 transition-[width]", collapsed ? "w-16" : "w-60")} data-testid="sidebar">
      <SideNav collapsed={collapsed} />
      <Button variant="ghost" size="icon" className="mt-auto" onClick={toggle} aria-label={t(collapsed ? "nav.expand" : "nav.collapse")} data-testid="sidebar-toggle">
        {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
      </Button>
    </aside>
  );
}

function Connection() {
  const { t } = useTranslation();
  const online = useOnline();
  const { pending } = useSession();
  const waiting = pending.events + pending.photos;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium", online ? "bg-success/15 text-success" : "bg-warning/15 text-warning")} data-testid="topbar-connection" role="status">
      {online ? <Wifi className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
      <span>{online ? t("status.online") : t("status.offline")}</span>
      {waiting > 0 && <span className="tabular" data-testid="topbar-pending-count">· {t("status.pending", { count: waiting })}</span>}
    </span>
  );
}

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const { phase } = useSession();
  const change = async (lng: "it" | "en") => {
    await i18n.changeLanguage(lng);
    if (phase === "ready") await call("setLanguage", { target: "user", language: lng }).catch(() => undefined);
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("common.language")} data-testid="language-switch"><Languages className="h-5 w-5" /></Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => change("it")} data-testid="language-it">Italiano</MenuItem>
        <MenuItem onSelect={() => change("en")} data-testid="language-en">English</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { profile, claims, safeSignOut, pending } = useSession();
  const [blocked, setBlocked] = React.useState(false);
  const out = async () => { if ((await safeSignOut()) === "pending") setBlocked(true); };
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("nav.userMenu")} data-testid="user-menu-trigger"><UserIcon className="h-5 w-5" /></Button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>{profile ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}` : ""} · {t(`roles.${claims?.role}`)}</MenuLabel>
          <MenuSeparator />
          <MenuItem onSelect={() => nav("/profile")} data-testid="user-menu-profile"><UserIcon className="h-4 w-4" /> {t("nav.profile")}</MenuItem>
          <MenuItem onSelect={() => nav("/guide")} data-testid="user-menu-guide"><BookOpen className="h-4 w-4" /> {t("nav.guide")}</MenuItem>
          <MenuItem onSelect={out} data-testid="user-menu-signout"><LogOut className="h-4 w-4" /> {t("auth.signOut")}</MenuItem>
        </MenuContent>
      </Menu>
      <Dialog open={blocked} onOpenChange={setBlocked}>
        <DialogContent title={t("auth.signOutBlockedTitle")} description={t("auth.signOutBlockedBody")}>
          <ul className="text-sm space-y-1" data-testid="signout-pending-list">
            <li>{t("status.pendingEvents", { count: pending.events })}</li>
            <li>{t("status.pendingPhotos", { count: pending.photos })}</li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LocationChip() {
  const { t } = useTranslation();
  const { location } = useSession();
  return (
    <Link to="/" className="inline-flex items-center gap-2 rounded border border-border px-3 min-h-touch text-sm max-w-[45vw]" data-testid="topbar-location">
      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate">{location ? <><span className="font-mono">{location.code}</span> {location.name}</> : t("location.choose")}</span>
    </Link>
  );
}

function AlertCounter() {
  const { t } = useTranslation();
  const { claims } = useSession();
  const [n, setN] = React.useState(0);
  React.useEffect(() => claims?.orgId ? watchOpenAlertCount({ role: claims.role!, orgId: claims.orgId }, setN) : undefined, [claims]);
  if (!claims?.role || !["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"].includes(claims.role)) return null;
  return (
    <Link to="/alerts" className="relative inline-flex items-center min-h-touch px-2" aria-label={t("nav.alerts")} data-testid="topbar-alert-counter">
      <Bell className="h-5 w-5" aria-hidden />
      {n > 0 && <span className="absolute top-2 right-0 rounded-full bg-warning text-black text-xs font-bold px-1.5 tabular" data-testid="topbar-alert-count">{n}</span>}
    </Link>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const { claims } = useSession();
  return (
    <header className="flex items-center gap-2 border-b border-border bg-surface px-2 md:px-4 min-h-16" data-testid="topbar">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenu} aria-label={t("nav.openMenu")} data-testid="topbar-menu-button"><MenuIcon className="h-6 w-6" /></Button>
      <Logo />
      {isAspRole(claims?.role ?? "") && <div className="hidden sm:block ml-2"><LocationChip /></div>}
      <div className="ml-auto flex items-center gap-1">
        <AlertCounter />
        <Connection />
        <LanguageSwitch />
        <UserMenu />
      </div>
    </header>
  );
}

export function ScanButton() {
  const { t } = useTranslation();
  const { location } = useSession();
  return (
    <Link to={location ? "/scan" : "/"} className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-fg px-6 min-h-16 text-lg font-semibold" data-testid="scan-fab">
      <ScanLine className="h-6 w-6" aria-hidden /> {t("scan.button")}
    </Link>
  );
}

export { LocationChip };
