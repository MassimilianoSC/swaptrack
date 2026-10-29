import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export async function logoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try { return await getDownloadURL(ref(storage, path)); } catch { return null; }
}
// Signed URL for a Storage path (download links).
export const fileUrl = (path: string) => logoUrl(path);
export { logoUrl as getDownloadURL };
