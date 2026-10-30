# SwapTrack — Architecture

## Layout
- `/` Vite + React 19 + TypeScript PWA. `src/lib/data/` is the only code importing the Firebase SDK (R2); `src/lib/auth/providers.ts` holds Google/Microsoft (R16); `src/lib/data/call.ts` is the single call point for server operations (R20).
- `functions/` TypeScript (CommonJS, `allowJs`), Node 22, europe-west1. `functions/src/shared/` holds pure modules shared with the app through the `@shared` alias (R19): `operations.ts` (op → router map), `roles.ts`, `policy.ts`, `settingsDefaults.ts`, `importDiff.ts`.
- Delivered files (`consegna/`, R18): `src/lib/codeId.js`, `functions/src/codeId.node.js`, `tests/codeId.parity.test.mjs`, `src/lib/clockOffset.js`, `src/lib/imageCompress.js`, `src/lib/scanner/engine.js`, `src/lib/scanner/webEngine.js`, `scripts/copy-wasm.mjs`.

## Exported Cloud Functions (`functions/src/index.ts`)
| Function | Kind | Started by |
|---|---|---|
| `users`, `catalog`, `settings`, `items`, `shipments`, `documents`, `alerts`, `desk` | callable routers (R20) | app, through `src/lib/data/call.ts` |
| `onEventCreated` | Firestore trigger on `events/{id}`, retry on | every scan event (`processEvent` in `trigger.ts`) |
| `beforeCreate` | blocking (Identity Platform) | any account creation outside the Admin SDK |
| `beforeSignIn` | blocking (Identity Platform) | every sign-in |
| `nightlyRecount` | scheduled, daily 02:00 Europe/Rome | Cloud Scheduler: rewrites the aggregates from `items` |
| `graceExpiry` | scheduled, daily 03:00 Europe/Rome | Cloud Scheduler: ends the grace period of deactivated users |
| `retention` | scheduled, daily 03:30 Europe/Rome (no-op unless enabled) | Cloud Scheduler |
| `dailyChecks` | scheduled, daily 04:00 Europe/Rome | Cloud Scheduler: `stale_material` and transfer alerts, BOM check of sites with no `site_done` |
| `monthlyReports` | scheduled, 1st of the month 06:00 Europe/Rome | Cloud Scheduler: PDF + Excel of the previous month per scope (`shared/reportMonth.ts`) |

**Public operation (no sign-in):** `users.requestPasswordReset` (rate-limited per IP and per e-mail, always the same answer).

## Routers
Every router receives `{op, data}` (`functions/src/core/router.ts`): unknown op or op of another area → `NOT_FOUND`; then sign-in, `active` claim, role, MFA (when on, admins need a second-factor token), rate limit (`rateLimits`, fixed windows), zod validation, structured logging (no payload). Ops present in the map but not built yet answer `UNIMPLEMENTED`. Errors are codes translated by the app (`errors.<code>`).

## Collections
Every client read is decided in `firestore.rules` (tests in `functions/test/rules/`); every write goes through the
Admin SDK (routers, trigger, scheduled jobs), except `events` created by the field (§8.1). "Own ASP" below means
the caller's `orgId`. Composite indexes: `firestore.indexes.json`, checked by `tests/firestoreIndexes.test.ts`.

| Collection | Fields | Client access |
|---|---|---|
| `organizations/{orgId}` | name, type (client\|asp), language, active, createdAt | read: client roles all, ASP roles own |
| `users/{uid}` | email, firstName, lastName, role, orgId, active, disabledAt (Timestamp), authDisabled, language, privacyNoticeVersion, privacyAcceptedAt, createdAt, deleted?, deletedAt? | read: self, client_admin all, asp_admin own ASP |
| `locations/{loc_<code>}` | code, name, type, aspId, address, region, active, importId, createdAt, updatedAt | read: client roles all; ASP roles own ASP; asp_admin/asp_warehouse also client warehouses |
| `models/{mdl_<materialCode>}` | materialCode (normalized), model, manufacturer, equipmentType, active, createdAt, updatedAt | read: active users |
| `settings/{name}` | branding, auth, app (minVersion, emailConfigured), privacy (version, texts, retentionEnabled, retentionDays), importMappings | branding/auth public; importMappings client_admin; rest active users |
| `events/{uuid}` | §8.1 (type, codeRaw, codeId, normVersion, locationId, aspId, userId, orgId, scannedAt, clockOffsetMs, source, engine, payload, createdAt); set by the trigger: processedAt, scannedAtEffective, itemId, outcome, voided | create per §8.1 (types by role, own org, location exists); read own only (R11) |
| `items/{id}` | `ItemState` of `shared/stateMachine.ts` (status, flow, current location/ASP, pendingAspId, shipmentId, sortingCategoryId, siteOfOrigin, siteOfInstallation, …) + model fields, needsModel, photoPaths, mergedInto, currentRegion | client roles all; ASP roles when `currentAspId` or `pendingAspId` is own ASP |
| `codes/{codeId}` | raw, norm, normVersion, itemId, aspId, pendingAspId, active, replacedBy (§6.5) | client roles all; ASP roles own (`aspId`/`pendingAspId`, or item of own ASP); a missing code: every active user |
| `anomalies/{eventId}_{type}` | type, eventId, codeId, itemId, locationId, aspId, detail, openedAt, resolution, resolvedAt, resolvedBy (one per event and type, R5) | client_admin/office all; ASP admin/warehouse own ASP or item of own ASP |
| `alerts/{id}` | kind, aspId, locationId, documentId, shipmentId, detail, count, createdAt, updatedAt, seenAt, closedAt, closedNote (§11.4; ids in `shared/alertIds.ts`) | client_admin/office all; client_warehouse `ddt_return_difference`; ASP admin/warehouse own ASP |
| `shipments/{id}` (+ `lines/{itemId}`) | §9.3 return / §9.4 transfer: kind, from/to location and ASP, status, ddtNumber, documentId, itemCount, dates; lines: codeRaw, model, addedAt, arrivedAt, confirmedAt, missing | client_admin/office all; client_warehouse returns; ASP admin/warehouse when from or to own ASP; lines follow the shipment |
| `documents/{id}` | kind (`ddt_in`, `ddt_return`, `bom`), number, aspId (ASP of the location, P-49), locationId, lines, files, version, history, status, duplicateOf, shipmentId, dates | client_admin/office all; client_warehouse `ddt_return`; ASP admin/warehouse own ASP; technicians BOMs of own ASP |
| `expectedCodes/{codeId}_{documentId}` | codeId, documentId, kind, aspId, locationId, materialCode, modelId, direction (§11.2) | client_admin/office all; ASP admin/warehouse own ASP |
| `documentMappings/{kind}_{scope}` | kind, scope, mapping, updatedAt (column mapping of imports) | client_admin; ASP admin/warehouse own and `*_client` default |
| `sortingCategories/{id}`, `sortingRules/{id}` | labels, active, order / category, site, model, equipmentType, priority (§10) | active users |
| `aggregates/{scope}_{dimension}_{shard}` | scope, dimension, shard (10 shards), counts {key: n} (§13.1) | client_admin/office all; asp_admin own scope |
| `reports/{id}` | scope, month (`YYYY-MM`), language, pdfPath, xlsxPath, summary, createdAt | client_admin/office all; asp_admin own scope |
| `exports/{id}` | scope, filter, language, path, rowCount, createdAt, createdBy | only the creator (client_admin, client_office, asp_admin) |
| `adminLog/{id}` | actor, action, target, details, at | read client_admin |
| `accessLog/{id}` | actor, eventId, at (every `revealEventAuthor`) | none |
| `mail/{id}` | to, message {subject, text, html}, createdAt (Trigger Email format) | none |
| `rateLimits/{key}` | count, expiresAt, updatedAt | none |

Claims: `role`, `orgId`, `active`, `disabledAt` (ms or null), set only by functions. Rules use claims only.

## Storage
Decided by path and claims only (`storage.rules`, tests in `functions/test/rules/storage.test.ts`). No client writes except photos.
- `branding/logo.{ext}`: public read, written by `settings.saveSettings`.
- `photos/{aspId}/{eventId}/{n}.jpg`: created by an ASP role of that ASP (also in grace), images under 5 MB; read by client roles and that ASP.
- `documents/{aspId}/{kind}/{documentId}/{n}.{ext}`: written by `documents.saveDocument`; `aspId` is always the ASP of the document's location, also when `client_admin` uploads. Read like the Firestore document: client_admin/client_office all, ASP admin/warehouse own ASP, technicians BOMs of own ASP, client_warehouse `ddt_return`.
- `exports/{scope}/…`, `reports/{scope}/…`: client_admin/client_office all, asp_admin own scope.

## Security rules: reads decided with a `get()`
Rules use the claims only (§3.4), but three reads are decided on another document, so that the queries the app
makes are provable: `shipments/{id}/lines` follows the parent shipment; `codes` and `anomalies` listed by `itemId`
are allowed when that item is at (or in transfer towards) the caller's ASP (`ownsItem`). A `get` of a missing
`codes/{codeId}` is allowed to every active user ("unknown code" is an answer the field needs). `exports` are
readable only by their creator.

## Tests
- `yarn test` (root `vitest.config.ts`): pure logic only, no emulator (`tests/**`, `functions/src/**/*.test.ts`).
- `node scripts/test-rules.mjs` (`functions/test/vitest.config.ts`, D-12): starts the Firestore and Storage emulators,
  runs `functions/test/**/*.test.ts`, stops the emulators as a process tree (on Windows `emulators:exec` leaves the
  Firestore Java process on its port). `functions/test/rules/` = security rules with `@firebase/rules-unit-testing`,
  one project id per file (`demo-rules-<name>`); `functions/test/trigger/` = the trigger logic run in-process
  (`processEvent`, what `onEventCreated` calls) against the emulator, project `demo-trigger-tests`. Neither touches
  the seed of `demo-swaptrack`. `functions/tsconfig.json` includes only `src`, so `test/` never reaches the deploy.

## Session on the device
`src/app/session.tsx`: cache owner check in IndexedDB (`swaptrack-device`), fail closed; shared-device clear (terminate + clearIndexedDbPersistence + reload); token refresh every 10 min and at resume; deactivation flow (flush pending writes, clear, sign out); gates for min version, privacy, MFA. Offline: Firestore `persistentLocalCache` + `persistentMultipleTabManager`; the service worker caches only the shell, fonts, icons and `zxing_reader.wasm`.
