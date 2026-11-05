// Deletes whole collections of the given Firestore (Admin SDK), subcollections included (P-147: deleting a document
// does not delete its subcollections, so the lines of the shipments were left behind). Used by fullSeed.mjs before
// writing the full seed. No I/O besides the given db.
export async function clearCollections(db, names) {
  for (const c of names) await db.recursiveDelete(db.collection(c));
}
