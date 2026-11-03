import { ref, getDownloadURL, getBlob } from "firebase/storage";
import { storage } from "./firebase";

// Public files only (branding/logo.*, read before sign-in): a download URL works for anyone who has it.
export async function logoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try { return await getDownloadURL(ref(storage, path)); } catch { return null; }
}

// D-35: private files (photos, exports, reports) are read with getBlob, so the Storage rules are checked at every
// read (a download URL would keep working for anyone, also after a change of role). The page shows them through a
// local URL that the caller revokes. null when the rules refuse the file or it cannot be read.
export async function fileBlobUrl(path: string): Promise<string | null> {
  try { return URL.createObjectURL(await getBlob(ref(storage, path))); } catch { return null; }
}

// Saves a private file on the device, under `name` when given (P-106), else under its own; the local URL is revoked
// right after.
export async function downloadFile(path: string, name?: string): Promise<boolean> {
  const url = await fileBlobUrl(path);
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = name || path.split("/").pop() || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
