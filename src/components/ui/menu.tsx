import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = "end" }: { children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className="z-50 min-w-48 rounded border border-border bg-surface p-1 text-fg shadow-lg">
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export const MenuItem = ({ className, ...p }: React.ComponentProps<typeof DM.Item>) => (
  <DM.Item className={cn("flex items-center gap-2 rounded px-3 min-h-touch text-sm cursor-pointer outline-none data-[highlighted]:bg-surface-2", className)} {...p} />
);
export const MenuLabel = (p: React.ComponentProps<typeof DM.Label>) => <DM.Label className="px-3 py-2 text-xs text-muted" {...p} />;
export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;
