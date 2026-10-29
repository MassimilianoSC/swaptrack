# SwapTrack — Architecture

## Layout
- `/` Vite + React 19 + TypeScript PWA. `src/lib/data/` is the only code importing the Firebase SDK (R2); `src/lib/auth/providers.ts` holds Google/Microsoft (R16); `src/lib/data/call.ts` is the single call point for server operations (R20).
- `functions/` TypeScript (CommonJS, `allowJs`), Node 22, europe-west1. `functions/src/shared/` holds pure modules shared with the app through the `@shared` alias (R19): `operations.ts` (op → router map), `roles.ts`, `policy.ts`, `settingsDefaults.ts`, `importDiff.ts`.
- Delivered files (`consegna/`, R18): `src/lib/codeId.js`, `functions/src/codeId.node.js`, `tests/codeId.parity.test.mjs`, `src/lib/clockOffset.js`, `src/lib/imageCompress.js`, `src/lib/scanner/engine.js`, `src/lib/scanner/webEngine.js`, `scripts/copy-wasm.mjs`.

## Exported Cloud Functions (step 2: 7)
| Function | Kind | Started by |
|---|---|---|
| `users` | callable router | app |
| `catalog` | callable router | app |
| `settings` | callable router | app |
| `beforeCreate` | blocking (Identity Platform) | any account creation outside the Admin SDK |
| `beforeSignIn` | blocking (Identity Platform) | every sign-in |
| `graceExpiry` | scheduled, daily 03:00 Europe/Rome | Cloud Scheduler |
| `retention` | scheduled, daily 03:30 Europe/Rome (no-op unless enabled) | Cloud Scheduler |

Planned (steps 3–4): routers `items`, `shipments`, `documents`, `alerts`, `desk`; trigger `onEventCreated`; scheduled `dailyChecks`, `nightlyRecount`, `monthlyReports` → total 16.

**Public operation (no sign-in):** `users.requestPasswordReset` (rate-limited per IP and per e-mail, always the same answer).

## Routers
Every router receives `{op, data}` (`functions/src/core/router.ts`): unknown op or op of another area → `NOT_FOUND`; then sign-in, `active` claim, role, MFA (when on, admins need a second-factor token), rate limit (`rateLimits`, fixed windows), zod validation, structured logging (no payload). Ops present in the map but not built yet answer `UNIMPLEMENTED`. Errors are codes translated by the app (`errors.<code>`).

## Collections (step 2)
| Collection | Fields | Client access |
|---|---|---|
| `organizations/{orgId}` | name, type (client\|asp), language, active, createdAt | read: client roles all, ASP roles own |
| `users/{uid}` | email, firstName, lastName, role, orgId, active, disabledAt (Timestamp), authDisabled, language, privacyNoticeVersion, privacyAcceptedAt, createdAt, deleted?, deletedAt? | read: self, client_admin all, asp_admin own ASP |
| `locations/{loc_<code>}` | code, name, type, aspId, address, region, active, importId, createdAt, updatedAt | read: client roles all; ASP roles own ASP; asp_admin/asp_warehouse also client warehouses |
| `models/{mdl_<materialCode>}` | materialCode (normalized), model, manufacturer, equipmentType, active, createdAt, updatedAt | read: active users |
| `settings/{name}` | branding, auth, app (minVersion, emailConfigured), privacy (version, texts, retentionEnabled, retentionDays), importMappings | branding/auth public; importMappings client_admin; rest active users |
| `events/{uuid}` | §8.1 (rules in place; written from step 3) | create per §8.1; read own only |
| `adminLog/{id}` | actor, action, target, details, at | read client_admin |
| `mail/{id}` | to, message {subject, text, html}, createdAt (Trigger Email format) | none |
| `rateLimits/{key}` | count, expiresAt, updatedAt | none |
| `accessLog/{id}` | (step 3, revealEventAuthor) | none |

Claims: `role`, `orgId`, `active`, `disabledAt` (ms or null), set only by functions. Rules use claims only.

## Storage (step 2)
`branding/logo.{ext}` public read, written by `settings.saveSettings`. Everything else denied (photos, documents `documents/{aspId|client}/{kind}/{documentId}/{n}.{ext}`, exports, reports arrive in steps 3–4).

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
