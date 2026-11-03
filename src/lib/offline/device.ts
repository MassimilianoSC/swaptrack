import { clearFirestoreCache } from "../data/firebase";
import { clearCacheOwner, clearPhotoQueue } from "./deviceStore";

// P-87b: readings of the owner of the device not yet sent, as last seen; Firestore shows its queue only to the user who
// wrote it, so this is what another user signing in can know of it.
export const OWNER_PENDING_KEY = "swaptrack.ownerPendingEvents";
export const LOCAL_KEYS = ["swaptrack.location", "swaptrack.fieldLocationsMeta", OWNER_PENDING_KEY];
// Per-user "offline cache loaded at" times (session.tsx, P-78): gone with the cache they describe.
const CACHE_TIME_PREFIX = "swaptrack.fieldCacheAt.";

// §4.12: clears local Firestore cache and the photo queue. Throws "other_tabs" when other tabs are open.
export async function clearDevice(): Promise<void> {
  await clearFirestoreCache();
  await clearPhotoQueue();
  await clearCacheOwner();
  LOCAL_KEYS.forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
  Object.keys(sessionStorage).filter((k) => k.startsWith(CACHE_TIME_PREFIX)).forEach((k) => sessionStorage.removeItem(k));
}

export async function requestPersistentStorage(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}
