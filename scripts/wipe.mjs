// P-148: what wipeProject.mjs deletes, as two steps that the tests run on the emulators: plan() only reads and counts,
// applyPlan() deletes what the plan says. Only the collections and Storage folders of SwapTrack (a fixed list, from the
// code: functions/src and storage.rules); anything else in the project is listed as "left". In every mode the active
// client administrators are kept (their users/{uid}, their organization) with settings/privacy, so that someone can
// always sign in and invite the others; without one, the plan refuses.
// Never prints or returns an e-mail or a uid: only counts and the names of collections and folders.

// Every top-level collection SwapTrack writes (functions/src, scripts/seed*.mjs). Subcollections go with their parent.
export const COLLECTIONS = [
  "events", "items", "codes", "documents", "expectedCodes", "shipments", "alerts", "anomalies", "aggregates",
  "reports", "reportSnapshots", "exports", "rateLimits", "documentMappings",
  "users", "organizations", "settings", "locations", "models", "sortingCategories", "sortingRules", "adminLog", "accessLog",
];
// --keep-people: the people, their organizations, the settings chosen online and the catalog stay; only the data of the
// work goes (then fullSeed alone fills it again, with no setting overwritten).
export const KEEP_PEOPLE = ["users", "organizations", "settings", "locations", "models", "sortingCategories", "sortingRules", "adminLog", "accessLog"];
// The Storage folders of SwapTrack (storage.rules).
export const FOLDERS = ["branding/", "photos/", "documents/", "exports/", "reports/"];
// Collections whose documents only point to a file: with the files gone they would only give "could not load".
const FILE_POINTERS = ["exports", "reports", "reportSnapshots"];

const count = async (q) => (await q.count().get()).data().count;
const firstSegment = (name) => `${name.split("/")[0]}/`;

/**
 * Reads the project and says what a wipe would delete and keep. Nothing is written.
 * @param {{ db: FirebaseFirestore.Firestore, bucket: any, auth: any }} env
 * @param {{ data: boolean, files: boolean, keepPeople: boolean }} mode
 */
export async function plan({ db, bucket, auth }, mode) {
  // The administrators kept in every mode: client_admin, active, with an Auth account that is not disabled.
  const candidates = (await db.collection("users").where("role", "==", "client_admin").where("active", "==", true).get()).docs;
  const admins = [];
  for (const u of candidates) {
    const account = await auth.getUser(u.id).catch(() => null);
    if (account && !account.disabled) admins.push({ uid: u.id, orgId: String(u.get("orgId") ?? "") });
  }
  const wanted = [...new Set([...admins.map((a) => `users/${a.uid}`), ...admins.map((a) => `organizations/${a.orgId}`), "settings/privacy"])];
  // Only the documents that exist count as kept (settings/privacy may be missing).
  const keepDocs = new Set((await db.getAll(...wanted.map((p) => db.doc(p)))).filter((d) => d.exists).map((d) => d.ref.path));

  const present = (await db.listCollections()).map((c) => c.id);
  const left = [];
  for (const c of present.filter((c) => !COLLECTIONS.includes(c)).sort()) left.push({ name: c, docs: await count(db.collection(c)) });

  const collections = [];
  for (const c of COLLECTIONS.filter((c) => present.includes(c))) {
    const total = await count(db.collection(c));
    const keptWhole = mode.keepPeople && KEEP_PEOPLE.includes(c);
    const kept = keptWhole ? total : [...keepDocs].filter((p) => p.startsWith(`${c}/`)).length;
    const wiped = mode.data && !keptWhole;
    const filesOnly = !mode.data && mode.files && FILE_POINTERS.includes(c);
    collections.push({ name: c, docs: total, delete: wiped ? total - kept : filesOnly ? total : 0, keptWhole });
  }
  const lines = present.includes("shipments") ? await count(db.collectionGroup("lines")) : 0;

  const [all] = await bucket.getFiles();
  const folders = FOLDERS.map((f) => ({ name: f, files: all.filter((x) => x.name.startsWith(f)).length }));
  const foldersLeft = [...new Set(all.map((x) => x.name).filter((n) => !FOLDERS.some((f) => n.startsWith(f))).map(firstSegment))].sort()
    .map((f) => ({ name: f, files: all.filter((x) => x.name.startsWith(f) || x.name === f.slice(0, -1)).length }));
  // --keep-people keeps the logo too: it is a setting chosen online, like the switches.
  const deleteFolders = mode.files ? FOLDERS.filter((f) => !(mode.keepPeople && f === "branding/")) : [];

  // Files gone, data kept (--files only): documents and pieces that would point to missing files.
  let dangling = null;
  if (mode.files && !mode.data) {
    const withFiles = (await db.collection("documents").select("files").get()).docs.filter((d) => (d.get("files") ?? []).length).length;
    const withPhotos = (await db.collection("items").select("photoPaths").get()).docs.filter((d) => (d.get("photoPaths") ?? []).length).length;
    dangling = { documents: withFiles, items: withPhotos };
  }
  return { admins: admins.length, adminRefs: admins, keepDocs: [...keepDocs], collections, lines, left, folders, foldersLeft, deleteFolders, dangling, mode };
}

/** Deletes what the plan says, in batches (BulkWriter of the Admin SDK). Run again, it finishes an interrupted wipe. */
export async function applyPlan({ db, bucket }, p) {
  if (!p.admins) throw new Error("no active client administrator: nothing deleted");
  const keep = new Set(p.keepDocs);
  for (const c of p.collections.filter((c) => c.delete > 0)) {
    const kept = [...keep].filter((k) => k.startsWith(`${c.name}/`));
    if (!kept.length) { await db.recursiveDelete(db.collection(c.name)); continue; }
    // A collection with kept documents: the others one by one (with their subcollections).
    const refs = await db.collection(c.name).listDocuments();
    for (const r of refs) if (!keep.has(r.path)) await db.recursiveDelete(r);
  }
  for (const f of p.deleteFolders) await bucket.deleteFiles({ prefix: f, force: true });
  // Files gone, data kept: the logo setting would point to nothing.
  if (p.mode.files && !p.mode.data && p.deleteFolders.includes("branding/")) {
    const branding = db.collection("settings").doc("branding");
    if ((await branding.get()).exists) await branding.update({ logoPath: null });
  }
}

/** The plan as lines of text for the terminal: counts and names only. */
export function describe(p) {
  const out = [];
  out.push(`Client administrators kept (active, can sign in): ${p.admins}`);
  out.push("Firestore, collections of SwapTrack:");
  for (const c of p.collections) out.push(`  ${c.name.padEnd(18)} ${String(c.docs).padStart(6)} documents  → ${c.delete ? `delete ${c.delete}` : c.keptWhole ? "kept (--keep-people)" : "kept"}`);
  if (p.lines) out.push(`  ${"shipments/*/lines".padEnd(18)} ${String(p.lines).padStart(6)} documents  → ${p.collections.find((c) => c.name === "shipments")?.delete ? "deleted with their shipments" : "kept"}`);
  if (p.left.length) out.push(`Firestore, NOT of SwapTrack (left): ${p.left.map((l) => `${l.name} (${l.docs})`).join(", ")}`);
  out.push("Storage, folders of SwapTrack:");
  for (const f of p.folders) out.push(`  ${f.name.padEnd(18)} ${String(f.files).padStart(6)} files      → ${p.deleteFolders.includes(f.name) ? "delete" : "kept"}`);
  if (p.foldersLeft.length) out.push(`Storage, NOT of SwapTrack (left): ${p.foldersLeft.map((f) => `${f.name} (${f.files})`).join(", ")}`);
  if (p.dangling) out.push(`Data that would point to deleted files: ${p.dangling.documents} documents with files, ${p.dangling.items} pieces with photos`);
  return out;
}
