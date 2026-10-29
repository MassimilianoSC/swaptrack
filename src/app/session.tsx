import * as React from "react";
import i18n from "@/i18n";
import { onUser, readClaims, signOut, type User, type Claims } from "@/lib/data/auth";
import { watchDoc, watchProfile, watchPendingEvents, type Row, type UserProfile } from "@/lib/data/db";
import { readCacheOwner, writeCacheOwner, countQueuedPhotos } from "@/lib/offline/deviceStore";
import { clearDevice, requestPersistentStorage } from "@/lib/offline/device";
import { flushQueue } from "@/lib/offline/photoQueue";
import { measureOffset } from "@/lib/clockOffset.js";
import { SETTINGS_DEFAULTS } from "@shared/settingsDefaults";

export type Phase = "loading" | "signedOut" | "failClosed" | "noAccount" | "deactivated" | "ready";
type Branding = typeof SETTINGS_DEFAULTS.branding;
type AuthSettings = typeof SETTINGS_DEFAULTS.auth;
type AppSettings = typeof SETTINGS_DEFAULTS.app;
type Privacy = typeof SETTINGS_DEFAULTS.privacy;
export interface SelectedLocation { id: string; code: string; name: string; type: string }

interface SessionValue {
  phase: Phase;
  failReason: string | null;
  user: User | null;
  claims: Claims & { secondFactor: boolean } | null;
  profile: Row<UserProfile> | null;
  branding: Branding;
  authSettings: AuthSettings;
  appSettings: AppSettings | null;
  privacy: Privacy | null;
  pending: { events: number; photos: number };
  location: SelectedLocation | null;
  setLocation: (l: SelectedLocation | null) => void;
  refreshClaims: () => Promise<void>;
  // §4.11: sign-out is refused while events or photos are waiting to be sent.
  safeSignOut: () => Promise<"ok" | "pending">;
}

const Ctx = React.createContext<SessionValue | null>(null);
export const useSession = () => React.useContext(Ctx)!;

const LOC_KEY = "swaptrack.location";
const REFRESH_MS = 10 * 60 * 1000;

function applyPrimary(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m) document.documentElement.style.setProperty("--primary", `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [failReason, setFailReason] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [claims, setClaims] = React.useState<SessionValue["claims"]>(null);
  const [profile, setProfile] = React.useState<Row<UserProfile> | null>(null);
  const [branding, setBranding] = React.useState<Branding>(SETTINGS_DEFAULTS.branding);
  const [authSettings, setAuthSettings] = React.useState<AuthSettings>(SETTINGS_DEFAULTS.auth);
  const [appSettings, setAppSettings] = React.useState<AppSettings | null>(null);
  const [privacy, setPrivacy] = React.useState<Privacy | null>(null);
  const [pending, setPending] = React.useState({ events: 0, photos: 0 });
  const [location, setLocationState] = React.useState<SelectedLocation | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(LOC_KEY) ?? "null"); } catch { return null; }
  });

  const failClosed = (reason: string) => { setFailReason(reason); setPhase("failClosed"); };

  // Public settings: branding and provider flags (readable without sign-in).
  React.useEffect(() => {
    void requestPersistentStorage();
    const a = watchDoc<Branding>("settings/branding", (v) => {
      const b = { ...SETTINGS_DEFAULTS.branding, ...(v ?? {}) };
      setBranding(b);
      applyPrimary(b.primaryColor);
      document.title = b.appName;
    });
    const b = watchDoc<AuthSettings>("settings/auth", (v) => setAuthSettings({ ...SETTINGS_DEFAULTS.auth, ...(v ?? {}) }));
    return () => { a(); b(); };
  }, []);

  const evaluate = React.useCallback(async (u: User, refresh: boolean) => {
    const c = await readClaims(u, refresh);
    setClaims(c);
    if (!c.role || !c.orgId) setPhase("noAccount");
    else if (c.active !== true) setPhase("deactivated");
    else setPhase("ready");
  }, []);

  React.useEffect(() => onUser(async (u) => {
    setUser(u);
    if (!u) { setClaims(null); setProfile(null); setPhase("signedOut"); return; }
    // §4.12: the owner of the local cache is compared at start; any failure keeps the app closed.
    let owner: string | undefined;
    try { owner = await readCacheOwner(); } catch { return failClosed("owner_unreadable"); }
    if (owner && owner !== u.uid) {
      try { await clearDevice(); await writeCacheOwner(u.uid); } catch (e) {
        return failClosed((e as Error).message === "other_tabs" ? "other_tabs" : "clear_failed");
      }
      window.location.reload();
      return;
    }
    if (!owner) {
      try { await writeCacheOwner(u.uid); } catch { return failClosed("owner_unwritable"); }
    }
    try { await evaluate(u, false); } catch { setPhase("noAccount"); }
    void measureOffset(u);
  }), [evaluate]);

  // §4.8: token refresh at resume and every 10 minutes, so a deactivation takes effect.
  const refreshClaims = React.useCallback(async () => { if (user) { try { await evaluate(user, true); } catch { /* offline */ } } }, [user, evaluate]);
  React.useEffect(() => {
    if (!user) return;
    const timer = setInterval(refreshClaims, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === "visible") void refreshClaims(); };
    const onOnline = () => { void measureOffset(user); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", onOnline); };
  }, [user, refreshClaims]);

  React.useEffect(() => {
    if (!user || phase !== "ready") return;
    const a = watchProfile(user.uid, (p) => {
      setProfile(p);
      if (p?.language && p.language !== i18n.language) void i18n.changeLanguage(p.language);
    });
    const b = watchDoc<AppSettings>("settings/app", (v) => setAppSettings({ ...SETTINGS_DEFAULTS.app, ...(v ?? {}) }), () => setAppSettings(SETTINGS_DEFAULTS.app));
    const c = watchDoc<Privacy>("settings/privacy", (v) => setPrivacy({ ...SETTINGS_DEFAULTS.privacy, ...(v ?? {}) }), () => setPrivacy(SETTINGS_DEFAULTS.privacy));
    return () => { a(); b(); c(); };
  }, [user, phase]);

  React.useEffect(() => {
    if (!user) return;
    let events = 0;
    const unsub = watchPendingEvents(user.uid, (n) => { events = n; setPending((p) => ({ ...p, events: n })); });
    const poll = setInterval(async () => {
      const photos = await countQueuedPhotos().catch(() => 0);
      setPending({ events, photos });
    }, 5000);
    // §7.3 photo offline queue: upload when online, attach through attachPhotos.
    const flush = () => { if (navigator.onLine) void flushQueue(); };
    flush();
    const flushEvery = setInterval(flush, 30_000);
    window.addEventListener("online", flush);
    return () => { unsub(); clearInterval(poll); clearInterval(flushEvery); window.removeEventListener("online", flush); };
  }, [user]);

  const setLocation = React.useCallback((l: SelectedLocation | null) => {
    setLocationState(l);
    if (l) sessionStorage.setItem(LOC_KEY, JSON.stringify(l)); else sessionStorage.removeItem(LOC_KEY);
  }, []);

  const safeSignOut = React.useCallback(async () => {
    const photos = await countQueuedPhotos().catch(() => 0);
    if (pending.events > 0 || photos > 0) return "pending" as const;
    setLocation(null);
    await signOut();
    return "ok" as const;
  }, [pending.events, setLocation]);

  const value: SessionValue = {
    phase, failReason, user, claims, profile, branding, authSettings, appSettings, privacy, pending, location, setLocation, refreshClaims, safeSignOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
