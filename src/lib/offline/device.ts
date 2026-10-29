import { clearFirestoreCache } from "../data/firebase";
import { clearCacheOwner, clearPhotoQueue } from "./deviceStore";

export const LOCAL_KEYS = ["swaptrack.location", "swaptrack.fieldLocationsMeta"];

// §4.12: clears local Firestore cache and the photo queue. Throws "other_tabs" when other tabs are open.
export async function clearDevice(): Promise<void> {
  await clearFirestoreCache();
  await clearPhotoQueue();
  await clearCacheOwner();
  LOCAL_KEYS.forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
}

export async function requestPersistentStorage(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}
