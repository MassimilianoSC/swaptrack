import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;

export function DialogContent({ title, description, children, className, side }: {
  title: string; description?: string; children: React.ReactNode; className?: string; side?: "left";
}) {
  const { t } = useTranslation();
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/60" />
      <D.Content
        className={cn(
          "fixed z-50 bg-surface text-fg border border-border shadow-lg focus:outline-none overflow-y-auto",
          side === "left"
            ? "left-0 top-0 h-full w-[85vw] max-w-sm p-4"
            : "left-1/2 top-1/2 w-[95vw] max-w-lg max-h-[90vh] -translate-x-1/2 -translate-y-1/2 rounded-lg p-6",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <D.Title className="text-lg font-semibold">{title}</D.Title>
            {description ? <D.Description className="text-sm text-muted mt-1">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="min-h-touch min-w-touch inline-flex items-center justify-center rounded hover:bg-surface-2" aria-label={t("common.close")} data-testid="dialog-close-button">
            <X className="h-5 w-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
