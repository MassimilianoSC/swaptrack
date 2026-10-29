// Small IndexedDB stores, separate from the Firestore cache: the owner of the local cache (§4.12)
// and the offline photo queue (§7.3).
const DB_NAME = "swaptrack-device";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("meta")) r.result.createObjectStore("meta");
      if (!r.result.objectStoreNames.contains("photos")) r.result.createObjectStore("photos");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => d.close());
}

export const readCacheOwner = () => tx<string | undefined>("meta", "readonly", (s) => s.get("owner") as IDBRequest<string | undefined>);
export const writeCacheOwner = (uid: string) => tx("meta", "readwrite", (s) => s.put(uid, "owner")).then(() => undefined);
export const clearCacheOwner = () => tx("meta", "readwrite", (s) => s.delete("owner")).then(() => undefined);
export const countQueuedPhotos = () => tx<number>("photos", "readonly", (s) => s.count());
export const clearPhotoQueue = () => tx("photos", "readwrite", (s) => s.clear()).then(() => undefined);
