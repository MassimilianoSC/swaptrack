import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Paperclip, ExternalLink, X } from "lucide-react";
import { compressImage } from "@/lib/imageCompress.js";
import { fileBlobUrl } from "@/lib/data/storage";
import { Button } from "@/components/ui/button";

// §11.2 / P-105: the files of a document (several pages: images, a PDF, the Excel it was read from), with a preview
// next to the lines. Photos are compressed before they are sent (§7.3: smaller, no EXIF or GPS); the files travel
// inside the saveDocument call, so the page checks their size first.
export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // the server's limit per file
export const MAX_TOTAL_BYTES = 6 * 1024 * 1024; // all the new files of one save (base64 grows them by a third)
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";
const EXCEL = /\.(xlsx|csv)$/i;

export interface PendingFile { id: string; name: string; contentType: string; blob: Blob; url: string }
interface Shown { key: string; name: string; contentType: string; url: string | null; pending: boolean }

const typeOf = (path: string) => /\.pdf$/i.test(path) ? "application/pdf" : /\.(jpe?g|png|webp)$/i.test(path) ? "image/jpeg" : "application/octet-stream";

// D-47: a saved file can be taken out of the next version (keepFiles); it is never deleted and stays in the history.
export function FilesPanel({ existing, removed, onRemoved, pending, onPending, onExcel, canAdd }: {
  existing: string[]; removed: string[]; onRemoved: (paths: string[]) => void;
  pending: PendingFile[]; onPending: (p: PendingFile[]) => void; onExcel: (f: File) => void; canAdd: boolean;
}) {
  const { t } = useTranslation();
  const input = React.useRef<HTMLInputElement>(null);
  // The saved files are read with getBlob (D-35) and shown through local URLs, freed when the list changes.
  const [saved, setSaved] = React.useState<Record<string, string | null>>({});
  const existingKey = existing.join("|");
  React.useEffect(() => {
    const paths = existingKey ? existingKey.split("|") : [];
    let gone = false;
    const urls: string[] = [];
    void Promise.all(paths.map(async (p) => [p, await fileBlobUrl(p)] as const)).then((got) => {
      got.forEach(([, u]) => u && urls.push(u));
      if (gone) urls.forEach((u) => URL.revokeObjectURL(u)); else setSaved(Object.fromEntries(got));
    });
    return () => { gone = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [existingKey]);

  const shown: Shown[] = [
    ...existing.filter((p) => !removed.includes(p)).map((p) => ({ key: p, name: p.split("/").pop() ?? p, contentType: typeOf(p), url: saved[p] ?? null, pending: false })),
    ...pending.map((f) => ({ key: f.id, name: f.name, contentType: f.contentType, url: f.url, pending: true })),
  ];
  const [selected, setSelected] = React.useState<string | null>(null);
  const current = shown.find((s) => s.key === selected) ?? shown.find((s) => s.contentType !== "application/octet-stream") ?? null;

  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    if (existing.length - removed.length + pending.length + files.length > MAX_FILES) { toast.error(t("documents.filesTooMany", { n: MAX_FILES })); return; }
    const out: PendingFile[] = [];
    for (const f of files) {
      const isImage = f.type.startsWith("image/");
      let blob: Blob = f;
      if (isImage) {
        try { blob = await compressImage(f); } catch { toast.error(t("errors.image_unreadable")); continue; }
      }
      if (blob.size > MAX_FILE_BYTES) { toast.error(t("errors.file_too_large")); continue; }
      const contentType = isImage ? "image/jpeg" : f.type || (/\.csv$/i.test(f.name) ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      out.push({ id: `${Date.now()}-${out.length}-${f.name}`, name: isImage ? f.name.replace(/\.[^.]+$/, ".jpg") : f.name, contentType, blob, url: URL.createObjectURL(blob) });
      if (EXCEL.test(f.name)) onExcel(f);
    }
    const total = [...pending, ...out].reduce((n, p) => n + p.blob.size, 0);
    if (total > MAX_TOTAL_BYTES) { out.forEach((p) => URL.revokeObjectURL(p.url)); toast.error(t("documents.filesTooLarge", { mb: MAX_TOTAL_BYTES / 1024 / 1024 })); return; }
    onPending([...pending, ...out]);
    if (out[0]) setSelected(out[0].id);
  };
  const drop = (id: string) => {
    const f = pending.find((p) => p.id === id);
    if (f) URL.revokeObjectURL(f.url);
    onPending(pending.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-3" data-testid="document-files">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-semibold">{t("documents.files")}</h2>
        {canAdd && (
          <>
            <Button size="sm" variant="secondary" type="button" onClick={() => input.current?.click()} data-testid="document-files-add"><Paperclip className="h-4 w-4" />{t("documents.filesAdd")}</Button>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" data-testid="document-files-input" onChange={(e) => { const l = e.target.files; void add(l).finally(() => { e.target.value = ""; }); }} />
          </>
        )}
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted">{t("documents.filesEmpty")}</p> : (
        <ul className="flex flex-wrap gap-2 text-xs" data-testid="document-files-list">
          {shown.map((s) => (
            <li key={s.key} className={`flex items-center gap-1 rounded border px-2 py-1 ${current?.key === s.key ? "border-primary" : "border-border"}`} data-testid="document-file">
              <button type="button" className="font-mono hover:underline" onClick={() => setSelected(s.key)}>{s.name}</button>
              {s.pending && <span className="text-warning">{t("documents.fileNotSaved")}</span>}
              {canAdd && <button type="button" aria-label={t("documents.fileRemove", { name: s.name })} onClick={() => (s.pending ? drop(s.key) : onRemoved([...removed, s.key]))} data-testid="document-file-remove"><X className="h-3 w-3" /></button>}
            </li>
          ))}
        </ul>
      )}
      {removed.length > 0 && (
        <p className="text-xs text-muted" data-testid="document-files-removed">
          {t("documents.filesRemoved", { count: removed.length })} <button type="button" className="text-primary hover:underline" onClick={() => onRemoved([])}>{t("documents.filesRemovedUndo")}</button>
        </p>
      )}
      {current?.url && (
        <div className="space-y-2" data-testid="document-preview">
          {current.contentType.startsWith("image/")
            ? <img src={current.url} alt={current.name} className="max-h-[70vh] w-full rounded border border-border object-contain" data-testid="document-preview-image" />
            : <iframe src={current.url} title={current.name} className="h-[70vh] w-full rounded border border-border" data-testid="document-preview-pdf" />}
          {/* Safari on iPhone does not show a PDF inside the page: the file opens on its own. */}
          <a href={current.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="document-preview-open"><ExternalLink className="h-4 w-4" />{t("documents.fileOpen")}</a>
        </div>
      )}
    </div>
  );
}
