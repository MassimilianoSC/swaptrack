// §7.3 photo offline queue: compress with imageCompress.js, store in IndexedDB,
// upload to Storage when online, then attach through the attachPhotos callable.
// A scan NEVER fails because of a photo: the event is saved first, the photo follows or is reported as lost.
import { ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/data/firebase";
import { compressImage } from "@/lib/imageCompress.js";
import { call } from "@/lib/data/call";

const DB_NAME = "swaptrack-device";
const STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("meta")) r.result.createObjectStore("meta");
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

interface QueuedPhoto { eventId: string; aspId: string; n: number; blob: Blob; createdAt: number; tries: number; lost?: boolean }

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const d = await open();
  return new Promise<T>((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const req = fn(s);
    if (req) { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }
    else { t.oncomplete = () => resolve(undefined as T); t.onerror = () => reject(t.error); }
  }).finally(() => d.close());
}

export async function enqueuePhoto(eventId: string, aspId: string, file: File | Blob, n: number): Promise<void> {
  const blob = file instanceof File ? await compressImage(file) : file;
  const key = `${eventId}/${n}`;
  const row: QueuedPhoto = { eventId, aspId, n, blob, createdAt: Date.now(), tries: 0 };
  await tx("readwrite", (s) => s.put(row, key));
}

export async function listQueued(): Promise<Array<QueuedPhoto & { key: string }>> {
  const d = await open();
  return new Promise<Array<QueuedPhoto & { key: string }>>((resolve, reject) => {
    const out: Array<QueuedPhoto & { key: string }> = [];
    const req = d.transaction(STORE, "readonly").objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out.push({ key: String(c.key), ...(c.value as QueuedPhoto) }); c.continue(); }
      else resolve(out);
    };
    req.onerror = () => reject(req.error);
  }).finally(() => d.close());
}

export const deleteQueued = (key: string) => tx("readwrite", (s) => s.delete(key));

// Upload the queue: one photo at a time, grouped by eventId. Returns {uploaded, lost}.
export async function flushQueue(signal?: AbortSignal): Promise<{ uploaded: number; lost: number }> {
  const rows = await listQueued();
  let uploaded = 0, lost = 0;
  const groups = new Map<string, Array<QueuedPhoto & { key: string }>>();
  rows.forEach((r) => { if (!groups.has(r.eventId)) groups.set(r.eventId, []); groups.get(r.eventId)!.push(r); });
  for (const [eventId, items] of groups) {
    if (signal?.aborted) break;
    const paths: string[] = [];
    const okKeys: string[] = [];
    for (const it of items) {
      if (it.lost) { lost++; continue; }
      try {
        const path = `photos/${it.aspId}/${eventId}/${it.n}.jpg`;
        await uploadBytes(ref(storage, path), it.blob, { contentType: "image/jpeg" });
        paths.push(path);
        okKeys.push(it.key);
      } catch {
        if (it.tries >= 5) {
          await tx("readwrite", (s) => s.put({ ...it, lost: true, tries: it.tries + 1 }, it.key));
          lost++;
        } else {
          await tx("readwrite", (s) => s.put({ ...it, tries: it.tries + 1 }, it.key));
        }
      }
    }
    if (paths.length) {
      try {
        await call("attachPhotos", { eventId, paths });
        for (const k of okKeys) await deleteQueued(k);
        uploaded += paths.length;
      } catch { /* keep in queue; will retry next flush */ }
    }
  }
  return { uploaded, lost };
}

// §7.3 "photo lost" report: delete lost rows after telling the user.
export async function listLost(): Promise<Array<QueuedPhoto & { key: string }>> {
  return (await listQueued()).filter((r) => r.lost);
}
export const dropLost = async () => { for (const r of await listLost()) await deleteQueued(r.key); };
