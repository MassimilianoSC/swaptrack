import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Paperclip, ExternalLink, X, FileSpreadsheet, Download } from "lucide-react";
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
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// P-160: what the server takes (DOC_FILE_TYPES), told at once, for the button and for a dragged file alike. Any image
// is taken (it is turned into a JPEG, a photo from an iPhone too); a spreadsheet by its extension, because Windows may
// call a CSV "application/vnd.ms-excel", which the server refused at the save.
function typeToSend(f: File): "image" | string | null {
  if (f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name)) return "image";
  if (/\.csv$/i.test(f.name)) return "text/csv";
  if (/\.xlsx$/i.test(f.name)) return XLSX;
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return "application/pdf";
  return null;
}
const hasFiles = (e: { dataTransfer: DataTransfer | null }) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export interface PendingFile { id: string; name: string; contentType: string; blob: Blob; url: string }
interface Shown { key: string; name: string; contentType: string; url: string | null; pending: boolean }

const typeOf = (path: string) => /\.pdf$/i.test(path) ? "application/pdf" : /\.(jpe?g|png|webp)$/i.test(path) ? "image/jpeg" : "application/octet-stream";

// D-47: a saved file can be taken out of the next version (keepFiles); it is never deleted and stays in the history.
// P-176: names = the original name of each saved file (by Storage path), shown and used when it is downloaded again.
export function FilesPanel({ existing, removed, onRemoved, pending, onPending, onExcel, canAdd, names }: {
  existing: string[]; removed: string[]; onRemoved: (paths: string[]) => void;
  pending: PendingFile[]; onPending: (p: PendingFile[]) => void; onExcel: (f: File) => void; canAdd: boolean;
  names?: Record<string, string>;
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
    ...existing.filter((p) => !removed.includes(p)).map((p) => ({ key: p, name: names?.[p] ?? p.split("/").pop() ?? p, contentType: typeOf(p), url: saved[p] ?? null, pending: false })),
    ...pending.map((f) => ({ key: f.id, name: f.name, contentType: f.contentType, url: f.url, pending: true })),
  ];
  const [selected, setSelected] = React.useState<string | null>(null);
  const current = shown.find((s) => s.key === selected) ?? shown.find((s) => s.contentType !== "application/octet-stream") ?? null;

  const add = async (list: FileList | null) => {
    const all = Array.from(list ?? []);
    const files = all.filter((f) => typeToSend(f));
    if (files.length < all.length) toast.error(t("errors.unsupported_file_type"));
    if (!files.length) return;
    if (existing.length - removed.length + pending.length + files.length > MAX_FILES) { toast.error(t("documents.filesTooMany", { n: MAX_FILES })); return; }
    const out: PendingFile[] = [];
    for (const f of files) {
      const isImage = typeToSend(f) === "image";
      let blob: Blob = f;
      if (isImage) {
        try { blob = await compressImage(f); } catch { toast.error(t("errors.image_unreadable")); continue; }
      }
      if (blob.size > MAX_FILE_BYTES) { toast.error(t("errors.file_too_large")); continue; }
      const contentType = isImage ? "image/jpeg" : typeToSend(f)!;
      out.push({ id: `${Date.now()}-${out.length}-${f.name}`, name: isImage ? f.name.replace(/\.[^.]+$/, ".jpg") : f.name, contentType, blob, url: URL.createObjectURL(blob) });
      if (EXCEL.test(f.name)) onExcel(f);
    }
    const total = [...pending, ...out].reduce((n, p) => n + p.blob.size, 0);
    if (total > MAX_TOTAL_BYTES) { out.forEach((p) => URL.revokeObjectURL(p.url)); toast.error(t("documents.filesTooLarge", { mb: MAX_TOTAL_BYTES / 1024 / 1024 })); return; }
    onPending([...pending, ...out]);
    if (out[0]) setSelected(out[0].id);
  };
  // P-160: files dragged onto the box go the button's way. Elsewhere on the page a dropped file is ignored: the browser
  // would open it in place of the page, and the document not saved yet would be lost.
  const [dragging, setDragging] = React.useState(false);
  React.useEffect(() => {
    if (!canAdd) return;
    const outside = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", outside);
    window.addEventListener("drop", outside);
    return () => { window.removeEventListener("dragover", outside); window.removeEventListener("drop", outside); };
  }, [canAdd]);
  const over = (e: React.DragEvent) => {
    if (!canAdd || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const zone = canAdd ? {
    onDragEnter: over,
    onDragOver: over,
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      void add(e.dataTransfer.files);
    },
  } : {};

  const drop = (id: string) => {
    const f = pending.find((p) => p.id === id);
    if (f) URL.revokeObjectURL(f.url);
    onPending(pending.filter((p) => p.id !== id));
  };

  return (
    <div className={`relative space-y-3 rounded-lg ${dragging ? "outline-dashed outline-2 outline-offset-4 outline-primary" : ""}`} data-testid="document-files" data-dragging={dragging ? "true" : "false"} {...zone}>
      {dragging && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/10 font-medium text-primary" data-testid="document-files-drop">{t("documents.filesDrop")}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-semibold">{t("documents.files")}</h2>
        {canAdd && (
          <>
            <Button size="sm" variant="secondary" type="button" onClick={() => input.current?.click()} data-testid="document-files-add"><Paperclip className="h-4 w-4" />{t("documents.filesAdd")}</Button>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" data-testid="document-files-input" onChange={(e) => { const l = e.target.files; void add(l).finally(() => { e.target.value = ""; }); }} />
          </>
        )}
      </div>
      {/* P-209: the invitation to add files only to those who can (the office, the client warehouse, a closed document: none). */}
      {shown.length === 0 ? <p className="text-sm text-muted">{t(canAdd ? "documents.filesEmpty" : "documents.filesNone")}</p> : (
        <ul className="flex flex-wrap gap-2 text-xs" data-testid="document-files-list">
          {shown.map((s) => {
            // P-174: an Excel the lines were read from stands out at once (filled, its icon, the name in bold).
            const excel = EXCEL.test(s.name);
            return (
            <li key={s.key} className={`flex items-center gap-1 rounded border px-2 py-1 ${excel ? "border-success bg-success/15 text-sm font-semibold" : current?.key === s.key ? "border-primary" : "border-border"}`} data-testid="document-file" data-excel={excel ? "true" : undefined}>
              {excel ? <FileSpreadsheet className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <Paperclip className="h-3 w-3 shrink-0 text-muted" aria-hidden />}
              <button type="button" className="font-mono hover:underline" onClick={() => setSelected(s.key)}>{s.name}</button>
              {s.pending && <span className="text-warning">{t("documents.fileNotSaved")}</span>}
              {canAdd && <button type="button" aria-label={t("documents.fileRemove", { name: s.name })} onClick={() => (s.pending ? drop(s.key) : onRemoved([...removed, s.key]))} data-testid="document-file-remove"><X className="h-3 w-3" /></button>}
            </li>
            );
          })}
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
          <div className="flex flex-wrap gap-4">
            <a href={current.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="document-preview-open"><ExternalLink className="h-4 w-4" />{t("documents.fileOpen")}</a>
            {/* P-176: saved with the name it had on the user's computer. */}
            <a href={current.url} download={current.name} className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="document-preview-download"><Download className="h-4 w-4" />{t("common.download")}</a>
          </div>
        </div>
      )}
    </div>
  );
}
