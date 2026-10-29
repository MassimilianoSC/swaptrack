import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-lg border border-border bg-surface p-5", className)} {...p} />
);

const tones = {
  neutral: "bg-surface-2 text-fg",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  primary: "bg-primary/15 text-fg",
};

// Colour never carries meaning alone (§15): a badge always has text.
export const Badge = ({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) => (
  <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...p} />
);

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight" data-testid="page-title">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
