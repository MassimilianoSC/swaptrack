import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const field = "w-full rounded border border-border bg-surface px-3 min-h-touch text-sm text-fg placeholder:text-muted disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "py-2 min-h-32", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, className)} {...p} />
));
Select.displayName = "Select";

export const Label = ({ className, ...p }: React.ComponentProps<typeof LabelPrimitive.Root>) => (
  <LabelPrimitive.Root className={cn("text-sm font-medium text-fg", className)} {...p} />
);

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Checkbox({ id, checked, onChange, label, testId }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 min-h-touch cursor-pointer text-sm">
      <input id={id} data-testid={testId} type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
