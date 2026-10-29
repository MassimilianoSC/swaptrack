# SwapTrack — PRD (working notes)

## Original problem statement
Build SwapTrack, a production-grade PWA sold to several clients and maintained for years. Source of truth: `/app/SPEC.md`. Delivered files: `consegna/` (logic unchanged). Build environment: Firebase emulators only, project `demo-swaptrack`; no real Firebase project, no deploy, no other backend, no mock backend. Work in steps (SPEC §21); end each step with the Italian sentence and wait.

## Architecture
React 19 + TS + Vite PWA at repo root; Firebase only (Auth, Firestore, Storage, Functions v2 Node 22 europe-west1). Routers per area: `users`, `catalog`, `settings`, `items`, `shipments`, `documents`, `alerts`, `desk`. Shared op map in `functions/src/shared/operations.ts`. Toolchain under `/root/toolchain`; supervisor programs `swaptrack-emulators` and `swaptrack-web` (`/etc/supervisor/conf.d/swaptrack.conf`, backup in `/app/scripts/supervisor/swaptrack.conf`). Firestore emulator on port 8180.

## User personas
`client_admin`, `client_office`, `client_warehouse`, `asp_admin`, `asp_warehouse`, `asp_technician` (SPEC §3.2).

## Core requirements
SPEC.md sections 2 (R1–R20) and 3–19.

## Implemented
- 2026-10-29 — Step 1: plan and questions.
- 2026-10-29 — Step 2: foundations (§4, §5, §14 branding/auth/app/privacy/importMappings, shells, i18n, PWA, rules, users/catalog/settings routers, blocking functions, graceExpiry, retention, seed of orgs/users/locations/models, docs).
- 2026-10-29 — Step 3A: replay §8.2 fixed (null state for forbidden-at-wrong-location on unknown codes; `late_event` only on forbidden; ties ASC by `createdAt` then `id`); `events {itemId, scannedAtEffective}` index; `mergeItems`, `correctEventLocation`, `resolveAnomaly` (code_of_another_asp via server event one instant before the arrival, D22).
- 2026-10-29 — Step 3B: `/items`, `/items/to-complete`, `/items/:id` with history (no `userId`), `editItem`, `forceState`, `mergeItems`, `correctEventLocation`, `revealEventAuthor`, anomaly resolution; model pick on scan for unknown pieces (D28).
- 2026-10-29 — Step 3C: scan photo button, `imageCompress.js`, IndexedDB photo queue (`src/lib/offline/photoQueue.ts`), upload + `attachPhotos`, lost-photo report, `photos.mandatoryForDefective` setting, deactivation flush of pending photos (§4.8).
- 2026-10-29 — Step 3D: `/shipments`, `/shipments/:id` with create return/transfer, scan burst (`?mode=…&shipmentId=…`, D27), send with DDT, cancel draft, client-warehouse confirmation with tick list + extras, transfer arrival on the scan screen.
- 2026-10-29 — Step 4A: documents router (`saveDocument`, `markDocumentChecked`, `closeDocument`, `saveDocumentMapping`, `compareDocument`); pure `compareDocument` + unit tests (`tests/documents.test.ts`); `expectedCodes` written on save and read by the trigger (`findModel`); DDT part of the arrival screen (§12.2); DDT file of return shipments (saveDocument kind=ddt_return + shipmentId); BOM tick list on the technician's scan screen; alert rules with deterministic ids (D31); alerts inbox (`/alerts`) with counter in the top bar; anomalies inbox (`/anomalies`).
- 2026-10-29 — Step 4B: client and ASP dashboards (`/dashboard`) reading aggregates, drill-down to `/items`; status × region aggregate (D34); "installed new material" badge on the scan screen (§10); `desk` router (`listEvents`, `createExport`, `generateReport`); `/exports`, `/reports`; scheduled `monthlyReports`, `dailyChecks`, `nightlyRecount`; rest of §14 (`thresholds`, `photos`, `itemFields`, `fieldPolicy`, `features`); report / export files are placeholders in text/plain and CSV (D30).
- 2026-10-29 — Step 4C: `scripts/fullSeed.mjs`: 3 ASPs × 2 warehouses, 1,500 sites, 20 models, 5,000 pieces across every state of both flows, 25 documents, 13 shipments, 6 alerts, 6 anomalies, 360 aggregate docs after the recount.
- 2026-10-30 — Extra step (D30 and D38 close four NOT_DONE items):
  - Real file formats: monthly reports as real PDF via pdfmake and real Excel via exceljs; on-demand exports as real Excel via exceljs. Strings in the organization language (`functions/src/core/orgLang.ts`, `functions/src/shared/reportStrings.ts`). Same Storage paths and callables (`produceReport`, `createExport`).
  - BOM tick list on the technician scan screen (§12.1 point 4): computed on the device from the user's own events (local, including pending writes) joined with the ASP's BOM documents in the local cache (`primeFieldCache` extended to pull BOMs; `cachedBomForSite`).
  - Document Storage path includes the kind: `documents/{aspId|client}/{kind}/{documentId}/{n}.{ext}`. `storage.rules` gate reads by kind (asp_technician reads BOM files of their ASP; client_warehouse reads `ddt_return` files, as in §3.3). `firestore.rules` also allow asp_technician to read BOM documents of their ASP.
  - Client-warehouse inbox for `ddt_return_difference` alerts (§11.4 / §12.4): `watchAlerts` filters by kind for `client_warehouse` and orders by `updatedAt desc`; `closeAlert` already restricted to this kind for `client_warehouse`.

## Exported Cloud Functions (14)
Callables (routers, R20): `users`, `catalog`, `settings`, `items`, `shipments`, `documents`, `alerts`, `desk`.
Trigger: `onEventCreated`.
Blocking: `beforeCreate`, `beforeSignIn`.
Scheduled (Europe/Rome): `graceExpiry` 03:00, `retention` 03:30, `dailyChecks` 04:00, `nightlyRecount` 02:00, `monthlyReports` 06:00 on the 1st.

## Backlog
- **P2 — Hardening:** route-level code splitting (vite warns > 500 kB); TOTP MFA against real Identity Platform; Google / Microsoft sign-in; App Check enforce in production; Firestore PITR + scheduled backups; cross-ASP exercise of `revealEventAuthor`.
