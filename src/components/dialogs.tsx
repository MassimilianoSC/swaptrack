import * as React from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";

export type InviteResult = { delivered: "email" } | { delivered: "link"; link: string };

// DECISIONS b2: when e-mail is not configured the link is shown ONCE to the inviting admin (logged in adminLog).
export function InviteResultDialog({ result, onClose }: { result: InviteResult | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={!!result} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={t("users.inviteDone")} description={result?.delivered === "link" ? t("users.linkOnce") : t("users.emailSent")}>
        {result?.delivered === "link" && (
          <div className="space-y-3">
            <code className="block break-all rounded bg-surface-2 p-3 font-mono text-xs" data-testid="invite-link">{result.link}</code>
            <Button onClick={() => { void navigator.clipboard.writeText(result.link); toast.success(t("common.copied")); }} data-testid="invite-link-copy"><Copy className="h-4 w-4" /> {t("common.copy")}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onClose, busy }: {
  open: boolean; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void; busy?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={title} description={body}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} data-testid="confirm-cancel">{t("common.cancel")}</Button>
          <Button variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm} data-testid="confirm-ok">{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
