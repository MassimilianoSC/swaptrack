import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

// R13: instants displayed in Europe/Rome by default.
export function formatInstant(d: Date | null | undefined, lang: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(lang === "it" ? "it-IT" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(d);
}
