import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = (p: React.ComponentProps<typeof T.Content>) => <T.Content className="mt-6 focus:outline-none" {...p} />;
export const TabsList = ({ className, ...p }: React.ComponentProps<typeof T.List>) => (
  <T.List className={cn("flex flex-wrap gap-1 border-b border-border", className)} {...p} />
);
export const TabsTrigger = ({ className, ...p }: React.ComponentProps<typeof T.Trigger>) => (
  <T.Trigger
    className={cn("min-h-touch px-4 text-sm font-medium text-muted border-b-2 border-transparent -mb-px data-[state=active]:text-fg data-[state=active]:border-primary", className)}
    {...p}
  />
);
