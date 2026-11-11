import * as React from "react";
import i18n from "@/i18n";
import { onUser, readClaims, signOut, type User, type Claims } from "@/lib/data/auth";
import { watchDoc, watchProfile, watchPendingEvents, countPendingEvents, firstFieldLocations, type Row, type UserProfile } from "@/lib/data/db";
import { readCacheOwner, writeCacheOwner, countQueuedPhotos } from "@/lib/offline/deviceStore";
import { clearDevice, requestPersistentStorage, OWNER_PENDING_KEY } from "@/lib/offline/device";
import { flushQueue } from "@/lib/offline/photoQueue";
import { primeFieldCache } from "@/lib/data/events";
import { isAspRole } from "@shared/roles";
import { measureOffset } from "@/lib/clockOffset.js";
import { SETTINGS_DEFAULTS } from "@shared/settingsDefaults";

export type Phase = "loading" | "signedOut" | "failClosed" | "noAccount" | "deactivated" | "previousPending" | "ready";
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
  // D-34: when the ASP's offline cache (items, codes, documents, models) was last loaded in full from the server.
  fieldCacheAt: number | null;
  // P-85: profile, app settings or privacy notice still missing DOCS_LATE_MS after sign-in: the app opens anyway
  // (the notice is shown as soon as it is known and newer than the accepted one, §4.15).
  docsLate: boolean;
  location: SelectedLocation | null;
  setLocation: (l: SelectedLocation | null) => void;
  refreshClaims: () => Promise<void>;
  // §4.11: sign-out is refused while events or photos are waiting to be sent.
  safeSignOut: () => Promise<"ok" | "pending">;
  // P-87b (phase "previousPending"): readings and photos of the previous user not yet sent (-1: not known), and the two
  // choices: sign out so that the previous user signs in again and sends them, or delete them and go on.
  leftBehind: number;
  keepPrevious: () => Promise<void>;
  discardPrevious: () => Promise<void>;
}

const Ctx = React.createContext<SessionValue | null>(null);
export const useSession = () => React.useContext(Ctx)!;

const LOC_KEY = "swaptrack.location";
const REFRESH_MS = 10 * 60 * 1000;
const PRIME_RESUME_MS = 10 * 60 * 1000;
const DOCS_LATE_MS = 8000;
const LOCATIONS_FIRST_MS = 20_000;

function applyPrimary(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m) document.documentElement.style.setProperty("--primary", `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`);
}

// P-87b: readings (last count seen by the owner) and queued photos (the queue holds only the owner's) not yet sent;
// -1 when they cannot be read, so that the user is warned rather than the data lost in silence.
async function previousLeftBehind(): Promise<number> {
  try {
    const events = Number(localStorage.getItem(OWNER_PENDING_KEY) ?? 0) || 0;
    return events + await countQueuedPhotos();
  } catch { return -1; }
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
  const [leftBehind, setLeftBehind] = React.useState(0);
  const [pendingSeen, setPendingSeen] = React.useState(false);
  const [fieldCacheAt, setFieldCacheAt] = React.useState<number | null>(null);
  const [location, setLocationState] = React.useState<SelectedLocation | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(LOC_KEY) ?? "null"); } catch { return null; }
  });

  const failClosed = (reason: string) => { setFailReason(reason); setPhase("failClosed"); };
  // §4.12: the data of the previous owner leave the device before the new user uses it; any failure keeps the app closed.
  const replaceOwner = async (uid: string) => {
    try { await clearDevice(); await writeCacheOwner(uid); } catch (e) {
      return failClosed((e as Error).message === "other_tabs" ? "other_tabs" : "clear_failed");
    }
    window.location.reload();
  };

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
    const next: Phase = !c.role || !c.orgId ? "noAccount" : c.active !== true ? "deactivated" : "ready";
    // P-87b: the periodic refresh of the claims never opens the app past the choice about the previous user's data.
    setPhase((p) => (p === "previousPending" ? p : next));
  }, []);

  React.useEffect(() => onUser(async (u) => {
    setUser(u);
    if (!u) { setClaims(null); setProfile(null); setPhase("signedOut"); return; }
    // §4.12: the owner of the local cache is compared at start; any failure keeps the app closed.
    let owner: string | undefined;
    try { owner = await readCacheOwner(); } catch { return failClosed("owner_unreadable"); }
    if (owner && owner !== u.uid) {
      // P-87b (D-40): clearing would lose what the previous user has not sent yet: ask first.
      const left = await previousLeftBehind();
      if (left !== 0) { setLeftBehind(left); setPhase("previousPending"); return; }
      return replaceOwner(u.uid);
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

  // b7 / SPEC §6.1, §16 (P-73): the ASP's items, codes, documents and the model catalog go to the offline cache at
  // sign-in and at every resume, not only when the scanning screen is opened.
  // P-85: the session documents arrive first; a missing one stops blocking the screen after DOCS_LATE_MS.
  const [docsLate, setDocsLate] = React.useState(false);
  const docsReady = !!profile && !!privacy && !!appSettings;
  const docsGate = docsReady || docsLate;
  React.useEffect(() => {
    setDocsLate(false);
    if (!user || phase !== "ready") return;
    const timer = setTimeout(() => setDocsLate(true), DOCS_LATE_MS);
    return () => clearTimeout(timer);
  }, [user, phase]);

  const orgId = claims?.orgId;
  const role = claims?.role;
  React.useEffect(() => {
    // It starts once the session documents are in (or late), so their listeners are never queued behind thousands
    // of documents of the cache (P-85: the app stayed on "Loading" after the sign-in).
    if (!user || phase !== "ready" || !orgId || !role || !isAspRole(role) || !docsGate) return;
    // One load at a time; at resume only if the last complete load is older than 10 minutes (D-36: thousands of reads).
    // A load cut halfway by the network leaves the time where it was: the technician can see it is not ready.
    // The time survives a page reload of this tab (P-78), so a reload does not load thousands of documents again.
    const key = `swaptrack.fieldCacheAt.${user.uid}`;
    let running = false;
    let lastOk = 0;
    try { lastOk = Number(sessionStorage.getItem(key) ?? 0) || 0; } catch { /* storage unavailable */ }
    const prime = () => {
      if (running) return;
      running = true;
      // P-122: the field locations first (the site picker, the first screen), then the thousands of documents; never
      // more than LOCATIONS_FIRST_MS of waiting, so a failed list does not stop the cache.
      const first = Promise.race([firstFieldLocations(orgId).catch(() => null), new Promise((r) => setTimeout(r, LOCATIONS_FIRST_MS))]);
      void first.then(() => primeFieldCache(orgId, role)).then((ok) => {
        if (!ok) return;
        lastOk = Date.now();
        setFieldCacheAt(lastOk);
        try { sessionStorage.setItem(key, String(lastOk)); } catch { /* storage unavailable */ }
      }, () => undefined).finally(() => { running = false; });
    };
    if (Date.now() - lastOk > PRIME_RESUME_MS) prime(); else setFieldCacheAt(lastOk);
    const onVis = () => { if (document.visibilityState === "visible" && Date.now() - lastOk > PRIME_RESUME_MS) prime(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user, phase, orgId, role, docsGate]);

  React.useEffect(() => {
    if (!user) return;
    let events = 0;
    setPendingSeen(false);
    const unsub = watchPendingEvents(user.uid, (n) => { events = n; setPending((p) => ({ ...p, events: n })); setPendingSeen(true); });
    const poll = setInterval(async () => {
      const photos = await countQueuedPhotos().catch(() => 0);
      setPending({ events, photos });
    }, 5000);
    return () => { unsub(); clearInterval(poll); };
  }, [user]);

  // §7.3 photo offline queue: upload when online, attach through attachPhotos. D-40 (P-87a): only once the owner of the
  // device was checked (phase "ready", §4.12): the photos of a previous user are never sent with the token of a new one.
  React.useEffect(() => {
    if (!user || phase !== "ready") return;
    const flush = () => { if (navigator.onLine) void flushQueue(); };
    flush();
    const flushEvery = setInterval(flush, 30_000);
    window.addEventListener("online", flush);
    return () => { clearInterval(flushEvery); window.removeEventListener("online", flush); };
  }, [user, phase]);

  // P-87b: what the owner of the device has not sent yet, kept for another user who signs in (only once the owner was
  // checked: before that, the counts are of a user who may not be the owner).
  React.useEffect(() => {
    if (!user || phase !== "ready" || !pendingSeen) return;
    try { localStorage.setItem(OWNER_PENDING_KEY, String(pending.events)); } catch { /* storage unavailable: the next sign-in warns anyway */ }
  }, [user, phase, pendingSeen, pending.events]);

  const keepPrevious = React.useCallback(async () => {
    sessionStorage.setItem("swaptrack.notice", "previous_pending");
    await signOut();
  }, []);
  const discardPrevious = React.useCallback(async () => { if (user) await replaceOwner(user.uid); }, [user]);

  const setLocation = React.useCallback((l: SelectedLocation | null) => {
    setLocationState(l);
    if (l) sessionStorage.setItem(LOC_KEY, JSON.stringify(l)); else sessionStorage.removeItem(LOC_KEY);
  }, []);

  // P-167: what waits to be sent is counted at the click, and the window that blocks the sign-out shows those numbers
  // (the photos were counted every 5 s: right after a photo, the window said 0 readings and 0 photos).
  const safeSignOut = React.useCallback(async () => {
    const photos = await countQueuedPhotos().catch(() => 0);
    const events = user ? await countPendingEvents(user.uid).catch(() => pending.events) : pending.events;
    setPending({ events, photos });
    if (events > 0 || photos > 0) return "pending" as const;
    setLocation(null);
    await signOut();
    return "ok" as const;
  }, [user, pending.events, setLocation]);

  const value: SessionValue = {
    phase, failReason, user, claims, profile, branding, authSettings, appSettings, privacy, pending, fieldCacheAt, docsLate, location, setLocation, refreshClaims, safeSignOut,
    leftBehind, keepPrevious, discardPrevious,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
