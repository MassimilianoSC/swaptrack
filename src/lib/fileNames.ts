// P-106: readable names for the files the user downloads. Only the saved name changes: the Storage paths stay as the
// server writes them (exports/<scope>/<ms>.xlsx, reports/...).
const two = (n: number) => String(n).padStart(2, "0");

// A name part without spaces, accents or signs: "Nord Impianti S.r.l." -> "Nord-Impianti-S-r-l".
export const fileNamePart = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "file";

// SwapTrack-export-YYYY-MM-DD-hhmm.xlsx, from the creation time, local clock.
export const exportFileName = (createdAt: Date) =>
  `SwapTrack-export-${createdAt.getFullYear()}-${two(createdAt.getMonth() + 1)}-${two(createdAt.getDate())}-${two(createdAt.getHours())}${two(createdAt.getMinutes())}.xlsx`;

// SwapTrack-resoconto-YYYY-MM-<scope>.<ext>; scope is "cliente" (translated) or the name of the ASP.
export const reportFileName = (month: string, scope: string, ext: "pdf" | "xlsx") =>
  `SwapTrack-resoconto-${month}-${fileNamePart(scope)}.${ext}`;
