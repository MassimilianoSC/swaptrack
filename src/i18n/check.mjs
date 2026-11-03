// yarn check:i18n (D-14, P-96): the texts the user reads all exist, in Italian and in English.
//  1. it.json and en.json have the same keys.
//  2. Every literal key used in src/ (t("a.b"), label: "nav.x") exists in both files.
//  3. Every server error code (fail("kind", "code") and HttpsError("kind", "code") in functions/src) has errors.<code>.
// Limit: a composed key (t(`a.b.${x}`)) cannot be checked value by value; only that its prefix ("a.b.") holds at
// least one key. Plurals count when the key exists with _one or _other.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const flat = (o, pre = "", out = new Set()) => {
  for (const [k, v] of Object.entries(o)) {
    const kk = pre ? `${pre}.${k}` : k;
    if (v && typeof v === "object") flat(v, kk, out); else out.add(kk);
  }
  return out;
};
const it = flat(JSON.parse(readFileSync(join(root, "src/i18n/it.json"), "utf8")));
const en = flat(JSON.parse(readFileSync(join(root, "src/i18n/en.json"), "utf8")));
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return f === "node_modules" ? [] : files(p);
  return /\.(tsx?|jsx?)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
});
const problems = [];

const onlyIt = [...it].filter((k) => !en.has(k)), onlyEn = [...en].filter((k) => !it.has(k));
if (onlyIt.length) problems.push(`only in it.json: ${onlyIt.join(", ")}`);
if (onlyEn.length) problems.push(`only in en.json: ${onlyEn.join(", ")}`);

const has = (k) => [k, `${k}_one`, `${k}_other`].some((x) => it.has(x));
for (const f of files(join(root, "src"))) {
  const s = readFileSync(f, "utf8");
  const where = relative(root, f);
  for (const m of s.matchAll(/\bt\(\s*["'`]([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)["'`]/g)) if (!has(m[1])) problems.push(`${where}: missing key ${m[1]}`);
  for (const m of s.matchAll(/\blabel:\s*"([a-z][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)"/g)) if (!has(m[1])) problems.push(`${where}: missing key ${m[1]}`);
  for (const m of s.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+\.)\$\{/g)) if (![...it].some((k) => k.startsWith(m[1]))) problems.push(`${where}: no key under ${m[1]}*`);
}

for (const f of files(join(root, "functions/src"))) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/\b(?:fail|HttpsError)\(\s*"[a-z-]+",\s*"([a-z0-9_]+)"/g)) if (!it.has(`errors.${m[1]}`)) problems.push(`${relative(root, f)}: server error ${m[1]} has no errors.${m[1]}`);
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`i18n: ${unique.length} problem(s)\n${unique.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`i18n keys: it and en match (${it.size}); every key used in src/ and every server error code exists`);
