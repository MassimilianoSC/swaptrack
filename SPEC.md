# SwapTrack — Product and technical specification

Version 3 · 29 October 2026 · Source of truth for building SwapTrack.

---

## 0. How to use this document (instructions for the building agent)

1. Save this file as `SPEC.md` at the root of the project before writing any code. It is the source of truth. **Re-read the relevant sections at the start of every step**: do not rely on your memory of the conversation.
2. Section 2 contains rules that are **never** broken. If a rule seems to conflict with a request, the rule wins: write the conflict in `DECISIONS.md`.
3. The folder of files delivered with this spec (`consegna/`) contains code adapted from a system used in the field for months (translated to English, adapted to Vite, errors returned as codes). **Copy those files into the paths they show and do not change their logic.** Adding TypeScript declarations next to them is fine.
4. When something is unclear, choose the most conservative option, write the choice in `DECISIONS.md`, and continue. Do not stop to ask, except in step 1 (planning).
5. When you cannot build something well, **do not insist and do not loop**: leave a `TODO(SPEC §x)` comment in the code and add a line to `NOT_DONE.md` (what, where, why). A clear gap is far better than a hidden one.
6. **Do not use the testing agent and do not run test-and-fix cycles.** The owners verify the app locally after export. At the end of each step: make sure the app builds and starts on the emulators, that you can sign in with the seeded accounts, then run the unit tests **once** and report how many pass and how many fail, without fixing the failures.
7. **Build environment: Firebase emulators only.** Use the project id `demo-swaptrack` (the `demo-` prefix needs no real Firebase project and no credentials). Do not create Firebase projects, **do not make any real deploy** (the owners deploy after the export, on their own project), do not ask for credentials. **Do not build any backend other than Firebase, and do not build a mock or fake backend mode.** If the emulators cannot run in your environment, build the code anyway, write "not verified" in `NOT_DONE.md`, and do not insist.
8. Use only invented data. No real people, real e-mail addresses or real client data, and no real client names anywhere in code or seed.
9. **The end-of-step report** (after steps 2, 3 and 4) contains: what you built; what is in `NOT_DONE.md`; the unit test results; **the total number of exported Cloud Functions, with their list** (R20); and **for every server operation (`op`), the page and the button that use it** — an operation with no page or button is flagged as a defect (scheduled functions and triggers excepted: for them, say what starts them).
10. **The last line of your reply at the end of each step is exactly this sentence, in Italian, so the owner recognizes it:**
    - after step 1: `PASSO 1 COMPLETATO — aspetto le risposte alle mie domande e il prompt successivo.`
    - after step 2: `PASSO 2 COMPLETATO — puoi mandarmi il prompt successivo.`
    - after step 3: `PASSO 3 COMPLETATO — puoi mandarmi il prompt successivo.`
    - after step 4: `PASSO 4 COMPLETATO — il lavoro di questa fase è finito.`
    Then stop and wait. Never write that sentence before the step is really finished.

---

## 1. The product

**SwapTrack** tracks telecom equipment ("boards") by scanning the barcode on each piece, through the two material flows of a network swap project. It answers, in near real time: **where is each piece now, what is it, how many are there.**

**The purpose is to track MATERIALS, not work.** SwapTrack does not plan, schedule or manage jobs, crews or calendars (§20).

### 1.1 The two flows

**New material**
1. The client ships new material from its warehouse to the warehouse of an installer company (an **ASP**), with a transport document (**DDT**) produced by the client's own system. SwapTrack does **not** record the departure from the client.
2. The ASP warehouse worker records the **arrival** of each piece, optionally checking it against the DDT.
3. The material waits at most about 30 days. An ASP technician takes it to a site and records the **installation** at site level (the site is enough; no rack or position).
4. New material that turns out **defective** or **left over** stays in (or comes back to) the ASP warehouse, is **classified** as defective or leftover, and is then **returned** to the client.

**Removed material**
1. An ASP technician removes old equipment at a site (the client's or other vendors') and records the **removal at the site**, often without network coverage.
2. The same day the material reaches the ASP warehouse: the warehouse worker records the **arrival** and **sorts** every piece into a category, applying rules configured by the client (by site and by equipment model). The worker decides alone.
3. Within about 30 days everything is shipped back to the client in a **return shipment** with a DDT. The client's warehouse **confirms the arrival of the shipment**.
4. The flow of a piece **ends when it is back at the client**.

**Transfers**: material can move between warehouses of the same ASP (decided by the ASP) and between different ASPs (**decided and created by the client**).

### 1.2 Scale
Tens of thousands of boards, thousands of sites (0 to 15 boards each), about ten ASPs with at least two warehouses each, 50 to 100 users, a project lasting 1 to 3 years.

### 1.3 Installations
- **One installation per client**: each client of SwapTrack gets its own Firebase project, its own data, name and branding. Clients never share anything.
- **Inside an installation, several organizations**: the client and its ASPs, separated by the security rules (§3).
- The client's name never appears in the code. Everything client-specific lives in the installation settings (§14). Demo data uses the invented client "Telco Demo".

### 1.4 Languages
Italian and English, for **everything**: UI, errors, e-mails, PDF and Excel reports. Each user chooses their language; each organization has a default language for its reports.

### 1.5 Ready to become a store app
SwapTrack is a PWA built so that it can later be wrapped as a native app for the App Store and Google Play (Capacitor) without rewriting screens. The owners will add the native wrapper later; the building agent only respects rule R16.

---

## 2. Non-negotiable rules

**R1 — Technology.** Frontend: React 19 + TypeScript + Vite, Tailwind CSS, shadcn/ui, lucide-react icons, react-router, react-i18next, vite-plugin-pwa (Workbox). Backend: **Firebase only, no custom server**: Firebase Auth, Cloud Firestore, Cloud Storage, Cloud Functions 2nd generation on **Node 22** in region **europe-west1**. Firestore and Storage located in the **EU**. Excel files read and written with **exceljs** (never the `xlsx` package from npm: outdated, known vulnerabilities). PDFs generated server-side with **pdfmake**. Tests with **Vitest** and the **Firebase emulators**.

**R2 — One data-access layer.** Every Firestore, Storage and Functions call in the frontend goes through `src/lib/data/`. Pages and components never import the Firebase SDK.

**R3 — The field writes only events.** The only documents a client creates directly are scan **events**, in an append-only collection (§8). Everything else (documents, shipments, settings, users, item corrections, alerts, privacy acceptance, photo attachment) is written by **callable Cloud Functions**, which validate and authorize on the server (§19.2 lists them). Reason: two phones offline that scan the same unknown piece must never create two items, and security rules cannot resolve conflicts (a rejection at sync time, with the app closed, is seen by nobody). Field actions that must work offline are events (`relabel`, `void`, `site_done`), never callables.

**R4 — Items and codes are created only on the server**, by the trigger that processes events, inside a transaction keyed on `codes/{codeId}`. Never from the client.

**R5 — Idempotency and robustness of the trigger.** Event ids are UUIDs generated on the device: retries never duplicate. The trigger writes `processedAt` and skips events already processed. Retries are enabled, and the trigger throws **only on transient errors**: a malformed event opens a `malformed_event` anomaly and is marked processed (a permanent error retried for days is a retry storm).

**R6 — No conditions in the security rules that can become false between the scan and the sync** (the location is active, the site still belongs to the user's ASP, the user is still active, a clock check). Those checks go in the trigger, which accepts the event and raises an anomaly. Existence of a document can be checked (existence never regresses). §8.1 gives the exact list of checks allowed in the rules.

**R7 — Isolation on the server.** An ASP never sees the sites, items, codes, events, documents, shipments, alerts, anomalies, aggregates, reports, files or people of another ASP. Enforced by security rules (Firestore and Storage, by claims and paths, never by cross-service reads) and by callables that return explicit projections. **Hiding data in the UI is never a protection.** Whenever a role, a collection or a Storage path is added, re-read **both** `firestore.rules` and `storage.rules`. Texts generated by the server (anomaly details, alerts) never name another organization or its sites.

**R8 — Barcode identity.** Use exactly the delivered `src/lib/codeId.js` and `functions/src/codeId.node.js`, with the parity test `tests/codeId.parity.test.mjs`. `codes` documents use the codeId as document id, so duplicates are impossible by construction. Store `normVersion` on every code and event. The trigger **recomputes** the codeId from `codeRaw` with the Node copy; if it differs from the one sent by the client it uses its own and opens a `code_id_mismatch` anomaly. Never put literal control characters in source files: use `\u` escapes.

**R9 — Scan time.** Use the delivered `src/lib/clockOffset.js`. Events store `scannedAt` (corrected device time), `clockOffsetMs` and `offsetMeasuredAt`. Item positions are ordered by `scannedAt`, never by server time. The trigger clamps a future `scannedAt` to the event creation time and raises an anomaly when the offset exceeds 3 minutes.

**R10 — No GPS, ever.** The app never uses geolocation. The location of a scan is the location the user declares. Photos are always re-encoded with the delivered `src/lib/imageCompress.js`, which strips EXIF metadata (including the GPS position phones embed). Never upload an original photo file.

**R11 — Privacy by design.**
- No screen, export or report shows what a single person did: no per-person activity lists, counts, rankings, timelines, "last scanned by", or "last seen online".
- **Events are readable directly only by their author** (`userId == request.auth.uid`): for the pending list and "my scans of today". Every other read of events (item history, comparisons, counts, exports, reports) goes through callables or server jobs that return **projections without `userId`**.
- The name of who recorded **one** event can be revealed only through the callable `revealEventAuthor(eventId)`, available to `client_admin` and to the `asp_admin` of the same ASP; every call is recorded in `accessLog` (who asked, which event, when; never the revealed name). Nobody reads `accessLog` from the app.
- `users` documents are readable only by the user themself, by `client_admin` (all) and by `asp_admin` (own ASP): field roles cannot map a uid to a name.
- Fields that hold the uid of an office user (`anomalies.resolvedBy`, `documents.history[].by`, `events.correction.correctedBy`) are never shown in field views.
- Photos show only the piece or its label, never people.
- A scheduled job that removes `userId` from events older than a configurable number of days exists but is **off** by default (§14).

**R12 — No third-party services outside Firebase**: no analytics or telemetry of any kind (no PostHog, Google Analytics, Hotjar, Sentry with personal data), no e-mail APIs (SendGrid, Resend, Mailgun...), no font or script CDNs at runtime. No request leaves the EU and Firebase.

**R13 — Dates.** Calendar days are stored as `"YYYY-MM-DD"` strings, never as Timestamps at midnight. Instants are Timestamps. Default display time zone: Europe/Rome.

**R14 — i18n from day one.** No user-facing text hard-coded anywhere: every string is an i18n key with Italian and English values, including errors, e-mails and reports. Domain words ("board", "site", "warehouse", "ASP"...) also go through keys, so the client's vocabulary can be adopted later without touching code.

**R15 — Firebase Admin imports.** In Cloud Functions use the modular imports (`require("firebase-admin/firestore")` for `FieldValue`, `Timestamp`, `FieldPath`). The namespaced `admin.firestore.FieldValue` is undefined in the Functions emulator.

**R16 — Store-ready.**
- Camera scanning goes **only** through the delivered `src/lib/scanner/engine.js`; screens never import the web engine directly.
- Nothing vital relies on browser-only features that do not exist inside a native WebView: offline data relies on Firestore persistence; the service worker only caches the app shell and assets.
- Sign-in with external providers (Google, Microsoft) lives in `src/lib/auth/providers.ts`, because inside a native app it will be replaced by a native plugin. E-mail and password must not depend on it.

**R17 — Configurable only what is listed.** Make configurable exactly the items in §14, nothing more. No generic settings panels, feature-flag frameworks or plugin systems.

**R18 — The delivered files keep their logic** (see §0.3). The frontend `tsconfig` uses `allowJs: true, checkJs: false` so the delivered `.js` files are imported as they are (or a `.d.ts` is placed next to each).

**R19 — Shared pure modules.** Logic needed both by the app and by the functions (state machine, sorting precedence, document comparison) lives in `functions/src/shared/`, with no Firebase imports; the app imports it through the Vite alias `@shared` → `../functions/src/shared`. Functions never import from `../src` (the deploy uploads only `functions/`). `functions/` is TypeScript with `allowJs: true`, `module: commonjs`, and **without** `"type": "module"` in its `package.json`, so `codeId.node.js` stays as it is and is copied to the build output.

**R20 — Few "router" Cloud Functions, not one per operation** (a constraint, not a suggestion).
- Callable functions are grouped by functional area into a few **routers** (8 to 15 in total). Areas for SwapTrack: `users` (organizations, users, privacy, language), `catalog` (locations, models, imports), `items` (corrections, history, photos, reveal), `shipments`, `documents`, `alerts` (alerts and anomalies), `desk` (event lists, exports, reports), `settings`.
- Each router receives `{ op, data }`, checks that the operation belongs to its area and dispatches it to an internal handler. Authentication, permissions, validation, rate limits and logging apply to **every operation**, as if it were a function of its own.
- The map operation → area lives in **one file shared by server and frontend** (`functions/src/shared/operations.ts`, R19); the frontend builds every call in **one place** (`src/lib/data/call.ts`).
- An unknown operation, or an operation of another area, answers `NOT_FOUND`.
- Functions that are not callables (the event trigger, the blocking functions, the scheduled jobs) stay separate and are listed in `ARCHITECTURE.md`. Public functions without sign-in, if any, are listed too.
- Report the total number of exported Cloud Functions at the end of each step (§0.9). The expected total is about 16. **If it exceeds 25, write why in `DECISIONS.md` and in the report, and continue** (do not stop: the step must be completed).
- Fewer functions also means fewer Cloud Run services whose invoker permission (`allUsers` → `roles/run.invoker`, needed by callables) must be checked after every deploy: write that check in the README.

---

## 3. Organizations, roles, permissions

### 3.1 Organizations
`organizations/{orgId}`: `name`, `type` (`client` | `asp`), `language` (default report language), `active`, `createdAt`. Exactly one `client` organization per installation; any number of `asp` organizations. Deactivating an ASP deactivates all its users (§4.8).

### 3.2 Roles
| Role | Organization | Typical device | What they do |
|---|---|---|---|
| `client_admin` | client | desktop | Everything `client_office` does, plus all settings (§14), enabling ASPs and their first admin, managing every user, creating transfers between ASPs |
| `client_office` | client | desktop | Sees everything (dashboards, items, history, documents, alerts, reports). Changes nothing |
| `client_warehouse` | client | desktop or phone | Confirms the arrival of return shipments at the client warehouse |
| `asp_admin` | ASP | desktop and phone | Enables and disables the people of their own ASP, uploads BOMs, sees everything of their own ASP, **and can do everything `asp_warehouse` does** (confirmed by the client) |
| `asp_warehouse` | ASP | phone, desktop, desktop with handheld gun | Arrivals, sorting, classification, transfers within the ASP, return shipments, DDT upload |
| `asp_technician` | ASP | phone, gloves, often offline | Removals and installations at the sites of their ASP |

### 3.3 Permissions matrix (enforced on the server)
"Own ASP" for items and codes means `currentAspId == orgId` or `pendingAspId == orgId`.

| | client_admin | client_office | client_warehouse | asp_admin | asp_warehouse | asp_technician |
|---|---|---|---|---|---|---|
| Read items, codes | all | all | all | own ASP | own ASP | own ASP (all pieces of the ASP, needed offline for installations) |
| Read events directly | own only | own only | own only | own only | own only | own only |
| Item history, event lists (callable, no `userId`) | all | all | return shipments | own ASP | own ASP | ❌ |
| Read organizations | all | all | all | own only | own only | own only |
| Read locations | all | all | all | own ASP + client warehouses | own ASP + client warehouses | own ASP |
| Read models, sorting categories, sorting rules, non-sensitive settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read documents (DDT, BOM) | all | all | `ddt_return` | own ASP | own ASP | BOMs of own ASP sites |
| Read document mappings | all | ❌ | ❌ | own ASP + `_client` defaults | own ASP + `_client` defaults | ❌ |
| Read shipments | all | all | return shipments | `fromAspId` or `toAspId` = own | same | ❌ |
| Read users | all | ❌ | ❌ | own ASP | self | self |
| Read aggregates, reports | all scopes | all scopes | ❌ | own scope | ❌ | ❌ |
| Read alerts | all | all | return-shipment alerts | own | own | ❌ |
| Read anomalies | all | all | ❌ | own | own | ❌ |
| Create events | ❌ | ❌ | ❌ (confirmation is a callable) | `arrive_at_warehouse`, `classify`, `transfer_out`, `return_ship`, `relabel`, `void` at own ASP warehouses | same as asp_admin | `remove_at_site`, `install_at_site`, `site_done`, `relabel`, `void` at own ASP sites |
| Upload DDT | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Upload BOM | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Transfers within the ASP | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Transfers between ASPs (create) | ✅ | ❌ | ❌ | ❌ (send and receive only) | ❌ (send and receive only) | ❌ |
| Return shipments (create, send) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Confirm return shipments | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Edit item data (model, fields) | ✅ | ❌ | ❌ | ✅ own | ✅ own | ❌ |
| Corrections (location, merge, force state) | ✅ | ❌ | ❌ | ✅ own | ❌ | ❌ |
| Close alerts, resolve anomalies | ✅ | ❌ | return-shipment alerts | ✅ own | ❌ | ❌ |
| Exports, on-demand reports | all + per ASP | all + per ASP | ❌ | own | ❌ | ❌ |
| Settings (§14) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage users | everyone | ❌ | ❌ | `asp_warehouse`, `asp_technician` of own ASP | ❌ | ❌ |
| Enable/disable ASP organizations | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `revealEventAuthor` | ✅ | ❌ | ❌ | ✅ own ASP events | ❌ | ❌ |
| Admin log | read | ❌ | ❌ | ❌ | ❌ | ❌ |

Client roles do not create scan events. `client_warehouse` may scan or type codes on the confirmation screen to add extra pieces, but the confirmation itself is a callable (§9.3).

### 3.4 Claims
Role, organization and status are stored in the user document **and** as Firebase Auth custom claims (`role`, `orgId`, `active`, `disabledAt`), set only by Cloud Functions. **Rules use the claims, never a `get()` on the user document.** A role change takes effect at the next token refresh; the app forces a refresh after admin actions on the current user and says so.

---

## 4. Access and accounts

All the features below are **built**. Those marked *(off)* are built and disabled by default, enabled from the settings (§14).

1. **No self-registration.** Accounts exist only by invitation: `client_admin` creates an ASP organization and its first `asp_admin`; `asp_admin` creates the people of their own ASP; `client_admin` can manage everyone. All users have a work e-mail.
2. **Invitation**: the callable creates the Auth user, the user document and the claims, and generates a password-setting link (`generatePasswordResetLink`). The e-mail is written to the collection `mail` (closed to clients) and sent by the Firebase extension **Trigger Email**, configured per installation with the client's SMTP server (§18). The link expires; the admin can resend it. In the build environment no e-mail is sent: the admin sees the link to copy.
3. **Sign-in** with e-mail and password.
4. **Google sign-in** *(off)* and **Microsoft sign-in** (company account) *(off)*, in the provider module (R16). Signing in with a provider for an e-mail without an active user document is refused by a **blocking function** (`beforeSignIn`/`beforeCreate`), which requires **Identity Platform** (§18). If the same person has a password and a provider, the two credentials are linked to one account.
5. **Auth domain**: `authDomain` must be the **same domain the app is served from** (on mobile and in installed PWAs a cross-domain auth domain makes sign-in fail silently). Document the per-installation configuration, including the OAuth redirect URIs for the providers.
6. **Forgot password**: reset e-mail in the user's language and branding (through `mail` and Trigger Email, with `generatePasswordResetLink`); the message shown never reveals whether an e-mail exists; the reset page is served by the app on its own domain (custom action handler).
7. **Change password** from the profile, re-authenticating with the current password. Password policy: at least 10 characters, letters and digits.
8. **Deactivation with a grace period** (decided by the owner):
   - **Deactivate** (normal case, someone leaving): the claims become `active: false` with `disabledAt` = now, the user document is updated, and the person immediately can no longer use the app: no sign-in to the UI, no reads, no new scans. **But events with `scannedAt <= disabledAt` are still accepted** (rules, §8.1) for a grace period of 7 days, so scans made offline before the deactivation reach the server as soon as the phone gets network. The app, on detecting the deactivation, sends the pending events and photos, shows "your access has been deactivated: sending your remaining scans", then signs out and clears the device. After the grace period a scheduled job disables the Auth account. Events with `scannedAt > disabledAt` (possible while the phone still holds the old token) are accepted but open an anomaly `event_after_deactivation` for the office; events scanned before the deactivation open nothing. The Storage rules on `photos/` and the `attachPhotos` operation also accept a user in grace, so pending photos are sent too. "Immediately" means: the app forces a token refresh at resume and every 10 minutes while open, so the deactivation takes effect within that time (refresh tokens are not revoked, otherwise the grace period could not work).
   - **Block now** (lost or stolen phone, urgent cases): disables the Auth account and revokes refresh tokens immediately; pending scans on the device are lost, on purpose.
   - Deactivating an ASP applies **Deactivate** to all its users.
   - A "sign out everywhere" action is the same as **Block now** without disabling the account.
9. **Never without an admin**: the last active `client_admin`, and the last active `asp_admin` of an ASP, cannot be removed or demoted (checked in a transaction).
10. **Offline**: a signed-in user keeps working offline (Firebase Auth local persistence).
11. **Sign-out is blocked while events or photos are still waiting to be sent**: the app explains why and shows what is pending.
12. **Shared devices**: when a different user signs in on a device, or the previous user was deactivated, the app first tries to send the previous user's pending events (while their session is still valid), then **clears the local Firestore cache and the pending photo queue before showing anything** (terminate Firestore, `clearIndexedDbPersistence`, reload). The owner of the local cache is stored in a small separate IndexedDB entry and compared at start. **If clearing fails because other tabs are open, the app does not open and asks to close the other tabs (fail closed).** If the owner of the cache cannot be read or written, the app does not open either.
13. **Inactivity sign-out** on desktop sessions after a configurable time *(off by default, value in §14)*; never on the phone field shell (gloves).
14. **Two-step verification (MFA, TOTP)** for `client_admin` and `asp_admin` *(off)*, requires Identity Platform.
15. **Privacy notice**: at first sign-in, and whenever its version changes, the user must accept the privacy notice (text per language, versioned, §14). Accepted version and time stored on the user document by a callable.
16. **Admin log**: every access-management action (user created, invited, deactivated, blocked, role changed, ASP enabled or disabled, settings changed) is written by the callables to `adminLog` {actor, action, target, at, details}. Readable by `client_admin` only. It logs administration, not workers' activity.
17. **App Check** (reCAPTCHA Enterprise on web) on Firestore, Storage and Functions *(off: monitoring mode, documented how to enforce)*.
18. **Minimum version**: a value in `settings/app` (`minVersion`); a client older than that shows "update required" and reloads *(off by default: empty value)*.
19. **End of employment**: deleting a user closes the account and removes personal data from the user document; events keep `userId` until the retention job removes it.

---

## 5. Locations

`locations/{locationId}`: `code` (the client's site or warehouse code, unique), `name`, `type` (`client_warehouse` | `asp_warehouse` | `site`), `aspId` (for a site: the ASP it is assigned to; for an ASP warehouse: its ASP; `null` for client warehouses), `address`, `region`, `active`, `updatedAt`, `importId`.

- **Every site is assigned to exactly one ASP.** `client_admin` can reassign a site (callable): pieces currently `removed_at_site` at that site move to the new ASP together with the site, through one server `force_state` event per piece with the new `aspId` (§8.2: never by writing the item directly), recorded in `adminLog`; the aggregates follow through the trigger. Events already recorded keep their `aspId`.
- **Import of sites** (and warehouses) from Excel or CSV by `client_admin`: column mapping (saved in `settings/importMappings` and reused), preview (new, changed, unchanged, rows with errors, unknown ASP names), explicit confirm; server-side upsert by `code` in a callable, in batches of 500 rows sent in chunks by the client; it never deletes: sites missing from the file are listed and can be deactivated explicitly; re-running the same file changes nothing.
- Manual creation and editing by `client_admin`.
- **Site picker** for the field: search by code or by name, instant with thousands of sites, **working offline**. The sites of the user's ASP are loaded with one query at sign-in and at resume (not with thousands of listeners) and stay in the Firestore cache; show how many are available offline and when they were last updated. The chosen location stays selected for the session, is always visible in the top bar, and changes with one tap. Never pre-select a location silently.

---

## 6. Catalog, items, codes

### 6.1 Catalog of models
`models/{modelId}`: `materialCode` (unique: the client's product number, the same on every board of that model), `model`, `manufacturer`, `equipmentType`, `active`. Importable from Excel by `client_admin` (same import pattern as sites), editable by hand. Readable by every active user and kept in the offline cache.

### 6.2 Items
`items/{itemId}` (created only by the trigger):
`flow` (`new` | `removed`), `previousFlow` (set when installed new material is later removed), `modelId`, `materialCode`, `model`, `manufacturer`, `equipmentType` (copied from the catalog when known), `condition`, `extra` (map of configurable fields, §14), `status` (§9), `statusSince`, `previousStatus`, `currentLocationId`, `currentLocationType`, `currentAspId`, `pendingAspId` (during a transfer to another ASP), `shipmentId` (while `in_transfer` or `in_return`), `sortingCategoryId`, `siteOfOrigin` (removed material), `siteOfInstallation` (new material), `lastEventId`, `lastScannedAt`, `needsModel` (boolean), `photoPaths`, `mergedInto`, `createdAt`.
Never store a person's name or uid on the item. A returned item keeps its `currentAspId` (the ASP that returned it), used by reports.

### 6.3 Codes — only codes that identify ONE piece
`codes/{codeId}`: `raw`, `norm`, `normVersion`, `itemId`, `aspId`, `pendingAspId`, `active`, `replacedBy`, `createdAt`. `aspId` and `pendingAspId` are written by the trigger in the same transaction that updates the item (also at transfers and site reassignments), so rules and offline queries can use them.
- `codes` contains **only codes unique to one physical piece**: the serial number, or a replacement label. A piece can have several such codes (relabelling).
- **The product code (`materialCode`) is never a `codes` document**: it is the same on hundreds of boards. It goes only into `event.secondCodeRaw` and `item.materialCode`.
- If the code read as the piece's identity matches a `materialCode` of the catalog (comparison `normalizeBarcode(codeRaw) == normalizeBarcode(materialCode)`, active **or inactive** models), the scanning screen, which has the catalog in its offline cache, warns at once ("this is the product code: read the serial number") and **does not write the event**. If an event arrives anyway (catalog not cached), the trigger accepts it but **creates and resolves no item** (`itemId: null`, outside every replay) and opens an anomaly `product_code_scanned_as_identity`.

### 6.4 How the app knows the model of a piece
The code read is usually the serial number, which does not say the model. In order:
1. a **second code** read on the same label (`secondCodeRaw`) that matches a `materialCode` in the catalog: the scanning screen lets the user read the product code right after the serial;
2. an **expected-code entry** written when a DDT or BOM was saved (`expectedCodes/{codeId}`, §11.2): the trigger reads it in one lookup;
3. otherwise, at the first scan of an unknown piece, the user can pick the model from the catalog (search by code or name), or skip.
A piece without a model is accepted, marked `needsModel: true`, and appears in the "to complete" list (warehouse roles and client roles). When a document is saved after the arrival, the callable fills the model of pieces of that ASP that match its serial lines and still have `needsModel: true`.

### 6.5 Corrections
- **Relabel** (event `relabel`, works offline): `codeRaw` is the **new** code, `payload.oldCodeRaw` the old one. The new code is added to the piece, the old one becomes `active: false` with `replacedBy`. If the new code is already active on another piece: no change, anomaly `conflicting_creation`. Reading a replaced code later still finds the piece and opens `old_label_used`.
- **Merge** (callable): two items found to be the same piece; the merged one gets `mergedInto`, its codes and events are re-pointed to the canonical item by the server; the trigger always follows `mergedInto`.
- **Location correction** (callable): an event recorded at the wrong location is corrected from the desk. The event keeps the original values in `correction` {previousLocationId, correctedBy, correctedAt, reason}; the item state is recomputed by replay (§8.2). History is never erased.
- **Force state** (operation on an anomaly, `client_admin` or `asp_admin` of the item's ASP): writes a server event `force_state` {status?, aspId?, locationId?, reason} that the replay applies; closes the anomaly. Only `client_admin` can change the ASP.
- **Edit item data** (callable): model, condition, extra fields.

---

## 7. Scanning

### 7.1 Engine
Camera scanning uses only `src/lib/scanner/engine.js` (delivered, R16, R18): native BarcodeDetector where available, zxing-wasm fallback elsewhere, two identical consecutive decodes required, result closest to the centre of the frame, engine name reported at start. The supported formats are those of `FORMATS` in `webEngine.js` (not configurable). The `.wasm` file is copied by `scripts/copy-wasm.mjs` (delivered; run it in `predev` and `prebuild`) and **precached** by the service worker (§16). Pin the versions listed in `consegna/README.md`.

### 7.2 The scanning screen (built by the agent)
- Camera view with an aiming frame and the engine name shown discreetly.
- Clear confirmation of every reading: a short sound (can be muted) **and** a full-screen flash with the code. Vibration only where supported (**iOS Safari has no vibration API**).
- Torch button only when the device really offers it (usually not on iOS).
- **Exposure control**: when the engine reports an exposure range (`onExposure`), show a "sun" control that lowers the exposure (glossy labels in direct sunlight).
- Burst mode for warehouses: many pieces in a row without leaving the camera, running list, and **"undo last"**, which writes a `void` event for the last event (§8.1). Never delete or hide an event without a `void`.
- After reading a serial, an optional "read product code" step (`secondCodeRaw`).
- **Keyboard-wedge input on every scanning screen, phone included**: handheld guns, Bluetooth ring scanners and rugged phones with a built-in reader type the code followed by Enter into a focused input. On phones the input has `inputmode="none"` so the on-screen keyboard does not cover the camera. Same event as a camera scan, with `source: "wedge"`.
- Manual entry of the digits printed under the barcode, always available (`source: "manual"`).
- Errors explained with what to do: camera denied (with instructions for iPhone), engine unavailable (offer manual entry), code not recognised, product code read instead of the serial.
- Optional photo of the piece or of an unreadable label; a reminder on the camera screen: "only the piece, never people".

### 7.3 Photos and Storage paths
Photos are compressed with `imageCompress.js` (strips EXIF and GPS). **Storage has no offline queue**: photos taken offline are kept in IndexedDB and uploaded when back online, then attached through a callable. A scan never fails because of a photo: the event is saved first, the photo follows or is reported as lost. Photos can be made mandatory for "defective" classification (§14). Max 5 MB, images only.

Storage paths (rules decide by path and claims, never by cross-service reads):
- `photos/{aspId}/{eventId}/{n}.jpg`
- `documents/{aspId|client}/{documentId}/{n}.{ext}`
- `exports/{scope}/{exportId}.xlsx` and `reports/{scope}/{month}.{pdf|xlsx}` (`scope` = `client` or an aspId)
- `branding/logo.{ext}`: **readable without authentication** (the sign-in page shows it).

### 7.4 iPhone rules (explicit)
1. On iPhone there is no native BarcodeDetector in **any** browser (all iOS browsers use Safari's engine): the fallback always runs.
2. No vibration: confirmation by sound and visual flash.
3. Torch usually unavailable: hide the button.
4. Camera permission can be asked again in the installed app; handle denial with instructions (Settings > Safari > Camera, or the installed app's settings).
5. **The app must be installed on the Home Screen**: as a Safari tab, iOS can delete stored data after days of non-use, including pending scans and the offline site list. iOS has no install button: show the instructions (Share, then "Add to Home Screen") and remind until installed. Also call `navigator.storage.persist()` on every platform.
6. Close-focus on some recent iPhones is difficult with small labels: to be tested on real devices later (no code needed now).

---

## 8. Events and the trigger

### 8.1 Events
`events/{uuid}` — created by the field (R3), never updated or deleted by clients:
`type`, `codeRaw`, `codeId`, `normVersion`, `secondCodeRaw` (optional), `locationId`, `aspId`, `scannedAt`, `clockOffsetMs`, `offsetMeasuredAt`, `userId`, `orgId`, `source` (`camera` | `wedge` | `manual` | `server`), `engine` (`native` | `fallback` | null), `payload` (type-specific), `createdAt` (server timestamp), and, written only by the trigger, `itemId`, `processedAt`, `outcome`, `voided`, `scannedAtEffective`.

| Type | Who | Where | Code | Payload |
|---|---|---|---|---|
| `remove_at_site` | technician | site | yes | `modelId?` |
| `install_at_site` | technician | site | yes | — |
| `site_done` | technician | site | **no** | — ("I have finished at this site", works offline) |
| `arrive_at_warehouse` | asp_warehouse, asp_admin | own ASP warehouse | yes | `flow?` (for unknown codes), `ddtId?`, `categoryId?` (arrival and sorting in one pass), `modelId?`, `shipmentId?` (arrival of a transfer) |
| `classify` | asp_warehouse, asp_admin | own ASP warehouse | yes | `categoryId` (removed) or `newClass: defective \| leftover` (new), `suggestedCategoryId` |
| `transfer_out` | asp_warehouse, asp_admin | own ASP warehouse | yes | `shipmentId` |
| `return_ship` | asp_warehouse, asp_admin | own ASP warehouse | yes | `shipmentId` |
| `relabel` | ASP field and warehouse roles | own location | yes (new code) | `oldCodeRaw` |
| `void` | the author of the target event | same location | no | `targetEventId` |
| `return_confirm` | **server only** | client warehouse | — | `shipmentId` |
| `force_state` | **server only** | — | — | `status?`, `aspId?`, `locationId?`, `reason` |
| server `transfer_out`, server `void` | **server only** | — | — | as the client versions; `source: server` |

**The security rules on `events` create check ONLY** (R6):
- the user is signed in; `active == true` in the claims, **or** `request.resource.data.scannedAt.toMillis() <= claims.disabledAt` (deactivation with grace period, §4.8; `disabledAt` is a number of milliseconds in the claims; no time-based expiry in the rules: the end of the grace period is enforced by the job that disables the account);
- `userId == request.auth.uid`; `orgId == claims.orgId`; for ASP roles `aspId == claims.orgId`;
- the type is allowed for the role (`return_confirm` and `force_state` are never allowed from clients);
- `exists(/databases/$(database)/documents/locations/$(locationId))`;
- required fields present for the type, no server-only fields (`itemId`, `processedAt`, `outcome`, `voided`, `scannedAtEffective`).
The location's ASP and status, and the void conditions, are checked by the trigger (anomalies `location_of_another_asp`, `location_inactive`, `void_not_allowed`).

Events are **readable directly only by their author** (R11).

### 8.2 The trigger `onEventCreated`
- Idempotent and robust (R5); retries enabled; deploying it requires `firebase deploy --only functions --force` (note in the README).
- Recompute the codeId (R8). Clamp a future `scannedAt` (R9) and **write the result on the event as `scannedAtEffective`** (server-only field): the replay orders on it.
- `site_done`, `void` and `force_state` have no code: they act on the site or on the target item.
- Product code used as identity: §6.3.
- In a transaction on `codes/{codeId}`: unknown code → create item and code (R4); known code → load the item, following `mergedInto`. Write `itemId` on the event.
- **Replay**: the state of an item is the result of applying **all its events, in order of `scannedAtEffective`** (the clamped scan time written by the trigger on every event; ties broken by `createdAt`, then by id), skipping voided ones, through the state machine (§9). On every event the trigger, inside the transaction:
  - reads **its own event document from the database** (never only the trigger snapshot): if it is already `voided` or processed, it marks it processed and applies nothing;
  - reads **the item document** `items/{itemId}` (this serializes two parallel replays of the same piece, even when they arrive through two different codes after a relabel);
  - reads the item's events (a few per item; index on `itemId` + `scannedAtEffective`) and **adds the current event by hand** (it has no `itemId` yet);
  - replays them and writes the derived fields.
- **What the replay derives, and only this**: `status`, `statusSince`, `currentLocationId`, `currentLocationType`, `currentAspId`, `pendingAspId`, `previousStatus` (defined only while `in_transfer` or `in_return`: the state before the last `transfer_out` or `return_ship`), `shipmentId`, `flow`, `previousFlow`, `sortingCategoryId`, `siteOfOrigin`, `siteOfInstallation`, `lastEventId`, `lastScannedAt`. The ASP comes from the events: a position event gives the event's `aspId`; the arrival of a transfer gives the destination ASP; a `force_state` with `aspId` gives that.
- **What the replay never overwrites**: `modelId` and the catalog data (taken from events or documents **only if empty**; `editItem` always wins), `condition`, `extra`, `photoPaths`, `needsModel`, `mergedInto`, `createdAt`.
- **Every office correction that changes status, ASP or position is a server event**, so the replay keeps it: `force_state` {status?, aspId?, locationId?, reason}. `reassignSite` writes one `force_state` (aspId of the new ASP) for every piece `removed_at_site` at that site; the resolution of `code_of_another_asp` writes a server `transfer_out` with `scannedAt` one instant before the arrival, so the arrival applies normally. A callable never writes status, ASP or position directly on an item.
- So a late event (a removal made offline at 10:00 and synced after the 16:00 warehouse arrival) takes its place in the history and fills `siteOfOrigin`, instead of being lost. An anomaly `late_event` is raised **only** if the replay meets a forbidden transition.
- **`relabel` does not follow the "unknown code → create" rule**: resolution starts from `payload.oldCodeRaw`; the transaction reads both codes; old code unknown → anomaly `unknown_code_where_known_expected`, no piece; new code already active on another piece → `conflicting_creation`; otherwise the new code is added and the old one deactivated.
- **`void`**: its trigger sets `voided: true` on the target event **even if the target is not processed yet** (the target's own trigger then skips it), and replays the target's item if it has one. A `void` cannot target another `void`. Server `void`s (`source: server`) are exempt from the author, location and 24-hour conditions.
- Never write a person's name or uid on items or codes.
- **Aggregates are incremented after the transaction commits, outside it**, in documents split into 10 shards summed when read (§13.1); the nightly recount corrects any drift.
- Never orders by server time.

### 8.3 Anomalies
`anomalies/{id}`: `type`, `eventId`, `codeId`, `itemId`, `locationId`, `aspId`, `detail` (never naming another organization or its sites), `openedAt`, `resolution` (`null` | `automatic` | `manual` | `forced`), `resolvedAt`, `resolvedBy` (an office uid, never shown in field views).
Types: `unknown_code_where_known_expected`, `code_of_another_asp`, `location_of_another_asp`, `location_inactive`, `clock_suspicious`, `late_event`, `forbidden_transition`, `conflicting_creation`, `old_label_used`, `moved_without_transfer`, `event_after_end_of_flow`, `event_after_deactivation`, `merge_chain_suspicious`, `product_code_scanned_as_identity`, `code_id_mismatch`, `malformed_event`, `void_not_allowed`, `returned_piece_reappeared`.
Visible to client roles (all) and to `asp_admin` / `asp_warehouse` (own). Resolved by `client_admin` or `asp_admin` through a callable (resolve, or force state §6.5).

---

## 9. States and flows

### 9.1 States
`removed_at_site`, `received_at_asp`, `sorted`, `installed`, `defective`, `leftover`, `in_transfer`, `in_return`, `returned` (end).

### 9.2 State machine
Implemented once, as a pure function `applyEvent(state, event) → {state, anomaly?}` in `functions/src/shared/` (R19), used by the replay, with unit tests for every row below, every forbidden case and the replay sequences.

**General rules**
- **Position events** (`remove_at_site`, `install_at_site`, `arrive_at_warehouse`) always update the position (the physical location is a fact); if the state transition is forbidden, the state stays and an anomaly is raised.
- **Repetition**: a position event at the piece's **current location** changes nothing and raises no anomaly, whatever the current state (`removed_at_site`, `received_at_asp`, `sorted`, `defective`, `leftover`, `installed`): two technicians removing the same piece, a second arrival scan in the same warehouse, re-checking a DDT after sorting. The event stays in the history. **Exception**: `arrive_at_warehouse` with `categoryId` on a `received_at_asp` piece is a sorting (→ `sorted`).
- **Unknown code**: any event with a code creates the piece in the natural state of that event: `remove_at_site` → `removed_at_site` (flow removed); `install_at_site` → `installed` (flow new); `arrive_at_warehouse` → `received_at_asp` (flow from payload or `expectedCodes`, otherwise the UI asks before saving); `classify` → `sorted` / `defective` / `leftover`; `transfer_out` → `in_transfer`; `return_ship` → `in_return`; `return_confirm` (extra piece with an unknown code found at the client) → `returned`. For all except `remove_at_site` and `arrive_at_warehouse`, also raise `unknown_code_where_known_expected`. `relabel` follows its own rule (§8.2).
- **Another ASP's piece**: an event of an ASP role on a piece whose `currentAspId` is another ASP, with no open transfer towards the event's ASP: the event stays, state and ASP do **not** change, anomaly `code_of_another_asp` visible to the client and to the ASP that scanned, without naming the other ASP or its site. `client_admin` resolves it; if the piece is really there, the operation writes a server `transfer_out` just before the arrival (§8.2), so the replay moves the piece to the scanning ASP.
- **After `returned`**: any further event raises `event_after_end_of_flow` (also `relabel`).

**Transitions**
| From | Event | To | Notes |
|---|---|---|---|
| `installed` | `remove_at_site` | `removed_at_site` | flow becomes removed, `previousFlow: new` (installed material later removed, e.g. failed after installation) |
| `removed_at_site` | `arrive_at_warehouse` | `received_at_asp` | with `categoryId`: then `sorted` in the same event |
| `received_at_asp` | `arrive_at_warehouse` (another warehouse of the same ASP, no transfer) | `received_at_asp` | position moves, anomaly `moved_without_transfer` |
| `in_transfer` | `arrive_at_warehouse` (at the transfer's destination) | `previousStatus` if it was `sorted`, `defective` or `leftover`, else `received_at_asp` | ownership moves to the destination ASP; another warehouse of the destination ASP: allowed with anomaly `moved_without_transfer` |
| `in_transfer` | `arrive_at_warehouse` (back at the sender's warehouse) | `previousStatus` | the line leaves the shipment, anomaly `moved_without_transfer` |
| `received_at_asp` (removed) | `classify` | `sorted` | with `categoryId` |
| `sorted` | `classify` | `sorted` | re-classification |
| `received_at_asp` (new) | `classify` | `defective` or `leftover` | — |
| `defective`, `leftover` | `classify` | `defective` or `leftover` | re-classification |
| `received_at_asp` (new) | `install_at_site` | `installed` | site of the same ASP |
| `received_at_asp`, `sorted`, `defective`, `leftover` | `transfer_out` | `in_transfer` | shipment sent or draft of that ASP; `shipmentId` and `previousStatus` stored |
| `sorted`, `defective`, `leftover` | `return_ship` | `in_return` | return shipment draft of that ASP; `shipmentId` and `previousStatus` stored |
| `in_return` | `return_confirm` | `returned` | end of flow |
| `received_at_asp`, `sorted`, `defective`, `leftover`, `in_return` of another shipment | `return_confirm` (extra piece found at the client) | `returned` | with alert (§9.3); if it was in another return shipment, that line is marked "confirmed elsewhere" |
| `in_return` | `arrive_at_warehouse` at an ASP warehouse | `previousStatus` | missing piece that reappeared: anomaly `returned_piece_reappeared` |
| any | `relabel` | unchanged | codes updated (§6.5) |
| any | `force_state` | the forced status | server only |

`void` removes the target event from the replay. A client `void` is allowed only to the author of the target event, at the same location, within 24 hours; otherwise `void_not_allowed`. Server `void`s are exempt (§8.2).

**Forbidden (event kept, `forbidden_transition`)**, at least: `return_ship` of removed material not yet sorted; `install_at_site` of removed material; `install_at_site` at a site of another ASP; `classify` at a site; `installed → arrive_at_warehouse` without a removal (position moves, state stays: an office user can force it).

### 9.3 Return shipments
`shipments/{id}` with `kind: "return"`: `fromLocationId`, `fromAspId`, `toLocationId` (client warehouse), `toAspId: null`, `ddtNumber`, `documentId?`, `status` (`draft` | `sent` | `confirmed` | `cancelled`), `itemCount`, `createdAt`, `sentAt`, `confirmedAt`, `confirmedComplete`. Lines in `shipments/{id}/lines/{itemId}` {codeRaw, model, addedAt, confirmedAt?, missing?}.
- `asp_warehouse` creates a draft (callable), scans the pieces in burst mode (`return_ship` events with `shipmentId`; the trigger adds the line), enters the DDT number, and sends it (callable). Attaching the DDT file (a `ddt_return` document, §11) arrives in step 4; in step 3 only `ddtNumber` is stored.
- **Cancelling a draft** (callable) writes a server `void` for every `return_ship` of that shipment: the pieces go back to their `previousStatus`.
- `client_warehouse` opens an incoming shipment: all lines are shown **ticked**; they untick the missing pieces and add extra pieces by scanning or typing their code (desktop with a gun works). The callable receives `{confirmed[], missing[], extra[]}`: the server writes `return_confirm` events for confirmed and extra pieces; missing ones stay `in_return`; missing or extra pieces create an alert `ddt_return_difference` (§11.4). The shipment becomes `confirmed`, `confirmedComplete` false if anything was missing or extra. If missing pieces arrive later at the client, `confirmReturn` can be called again on the same shipment for those pieces only.
- Shipment documents never carry names of locations or organizations of the other party; the client warehouse resolves its own, the ASP its own.

### 9.4 Transfers
`shipments/{id}` with `kind: "transfer"`: `fromLocationId`, `fromAspId`, `toLocationId`, `toAspId`, `status` (`draft` | `sent` | `received` | `cancelled`), `createdBy` (office or warehouse uid, never shown to field roles), `createdAt`, `sentAt`, `receivedAt`. Lines with `arrivedAt`.
- **Within one ASP**: created by `asp_warehouse` or `asp_admin`, choosing a destination warehouse of their own ASP.
- **Between ASPs**: **created only by `client_admin`** (decided by the client), choosing the sending warehouse and the destination warehouse. No ASP ever sees the list of the other ASPs' warehouses; the sending ASP sees the shipment as "to send", the receiving ASP as "incoming", each with the name of its own warehouse only.
- The sending warehouse scans the pieces (`transfer_out` with `shipmentId`) and sends. `pendingAspId` is set on items and codes; both ASPs can read the item while `in_transfer`; a third ASP never sees it.
- Cancelling a transfer draft (callable) writes a server `void` for every `transfer_out` of that shipment: the pieces go back to their state.
- **The shipment document carries no names of locations or organizations.** Each ASP resolves only its own warehouse; the other end is shown as "another organization" (the client sees both).
- The receiving warehouse records `arrive_at_warehouse` with `shipmentId`: `currentAspId` becomes the destination ASP, `pendingAspId` cleared, the line gets `arrivedAt`. The shipment becomes `received` when all lines have arrived; after 7 days with missing lines an alert `transfer_difference` goes to both ASPs and to the client.
- After the arrival the receiving ASP sees the piece's history as "another organization" for events before the transfer, and does not see photos taken by the sending ASP; the sending ASP no longer lists the piece.

---

## 10. Sorting

- `sortingCategories/{id}`: `labels {it, en}`, `active`, `order`. Configured by `client_admin`.
- `sortingRules/{id}`: optional `siteId`, optional `modelId`, optional `equipmentType`, `categoryId`, `active`. Configured by `client_admin`.
- **Precedence** (most specific wins): site + model > site + equipment type > model > equipment type > site > none. Saving a rule with the same specificity and the same keys as an existing active rule is refused, with an explanation.
- When a warehouse user scans a removed piece for sorting, the app shows **in large type** the suggested category (from `siteOfOrigin` and the model; for `previousFlow: new` pieces it also says "installed new material") and the worker confirms with one tap or chooses another. The worker decides alone. The event stores the chosen and the suggested category.
- Pure function in `functions/src/shared/` (R19), with unit tests for the precedence.

---

## 11. Documents: DDT and BOM

### 11.1 Kinds
- `ddt_in`: transport document of new material from the client to an ASP warehouse (produced by the client's system). Uploaded by the ASP warehouse at arrival (also as a photo of the paper document), or by `asp_admin` / `client_admin`.
- `ddt_return`: transport document of a return shipment (attached to the shipment).
- `bom`: bill of materials of a site, prepared by the ASP when the work is defined: what will be removed and what will be installed. Uploaded by `asp_admin` (or `client_admin`).

### 11.2 Format and storage
`documents/{id}`: `kind`, `number`, `aspId`, `locationId` (warehouse or site), `files[]` (Storage paths, §7.3; **several pages**: several images or one multi-page PDF), `lines[]`, `linesSource` (`excel` | `manual`), `version`, `status` (`open` | `checked` | `closed`), `createdAt`, `history[]` (previous versions: what changed, when, by which office uid).
- Accepted files: **Excel, PDF, JPEG, PNG**.
- **Lines**: either a serial line (`codeRaw`, optional `materialCode` or `modelId`) or a quantity line (`materialCode` or `modelId`, `quantity`). **BOM lines also have a mandatory `direction`: `remove` | `install`.**
- **Excel**: a column-mapping step; mappings are saved by callable in `documentMappings/{kind}_{aspId}` (each ASP its own, written by its warehouse roles and admin) and reused. `client_admin` can save a default `documentMappings/{kind}_client` (for example for the client's DDT format), which an ASP sees as the starting point and copies into its own; ASP roles never write `_client`.
- **PDF and images**: the file is stored and the user types the lines next to the preview (paste from clipboard supported). **Automatic reading with AI is not allowed yet**: keep an isolated, disabled extension point `src/lib/documents/extract.ts` that returns "not available".
- Saving a document (callable) also writes `expectedCodes/{codeId}_{documentId}` {codeId, documentId, kind, aspId, locationId, materialCode, modelId, direction} for every serial line (the trigger queries by `codeId` and chooses by `kind`; a DDT and a BOM listing the same serial do not overwrite each other), and fills the model of pieces of that ASP with that code and `needsModel: true` (§6.4).
- The same document number uploaded twice for the same kind and ASP is detected and the user is warned.
- A document is never deleted: it is corrected, creating a new version and keeping the previous one in `history`.
- `status: closed` is set by `client_admin` or `asp_admin` when no further check is expected (for example after all differences were handled).

### 11.3 Comparison (pure function in `functions/src/shared/`, unit-tested)
- `ddt_in`: an arrival counts for a DDT **only** if the event's `ddtId` is that DDT, or its code is a serial line of that DDT (automatic link through `expectedCodes`). Never "every arrival at that warehouse since the upload". Results: `arrived`, `missing`, `unexpected`, `arrived_model_unknown` (counted apart from quantity lines), and per quantity line `expected` vs `counted`.
- `ddt_return`: pieces of the shipment vs pieces confirmed by the client (§9.3).
- `bom`: removals and installations recorded at that site since the BOM date vs lines, separately for `direction: remove` and `install` → less or more than expected, per model and per serial.
- **When**: `ddt_in` is shown live on screen during the arrival, but alerts are created only when the user marks the DDT "checked"; `ddt_return` at confirmation; `bom` when the trigger processes a `site_done` event for that site, and otherwise by the daily job for sites with scans and no `site_done` in the last 24 hours (so between 24 and 48 hours after the last scan).

### 11.4 Alerts
Every difference creates or updates an **alert, inside the app only (no e-mail)**: `alerts/{id}`: `kind` (`ddt_in_difference`, `ddt_return_difference`, `bom_difference`, `transfer_difference`, `stale_material`), `aspId`, `locationId`, `documentId`, `shipmentId`, `detail`, `count`, `createdAt`, `updatedAt`, `seenAt`, `closedAt`, `closedNote`.
- **One alert per object, not per piece**, with deterministic ids: `stale-{locationId}-{flow}`, `bom-{documentId}`, `ddt-{documentId}`, `transfer-{shipmentId}`, `return-{shipmentId}`; updated with the count and the list, never duplicated.
- `stale_material`: new material waiting in an ASP warehouse, or removed material waiting to be returned, for more than the threshold (30 days by default, §14); computed by a daily scheduled function.
- Client roles see all alerts; ASP roles see their own; `client_warehouse` sees return-shipment alerts. An inbox with filters, a counter in the top bar, and a link to the document, shipment or pieces. Mark as seen and close (with a note) through callables.

---

## 12. Field experience (by role)

### 12.1 ASP technician (phone, field shell)
1. Opens the app; the selected site (if any) is shown in the top bar.
2. Searches the site by code or name (works offline) and selects it.
3. Chooses **Remove** or **Install**.
4. If the site has a BOM, sees the expected list for that direction; every reading ticks a line; unexpected pieces are marked. The ticks are computed on the device from **the user's own events** (local, including those still waiting to be sent) **joined with the items and codes of the ASP** in the cache (which carry colleagues' work once synced); never from a query on other people's events.
5. Scans pieces one after another (camera, wedge or manual), optionally reading the product code after the serial; for an unknown piece being removed, can pick the model or skip. "Undo last" is always available.
6. Optional photo.
7. Taps **"I have finished at this site"** (a `site_done` event, works offline).
8. Always sees whether they are online and how many scans and photos are waiting to be sent. Sees only **their own scans of today** and their sync status: no personal history, no counts over time.

### 12.2 ASP warehouse worker and ASP admin (phone, desktop, desktop with gun)
On screens narrower than 768 px the field shell is used, on wider screens the desk shell (by width, not by role).
- **New material arrival**: chooses or uploads the DDT (also as a photo), scans in burst mode, sees arrived / missing / unexpected live (computed on the device from the user's own events joined with the items and codes of the ASP in the cache, never from other people's events), marks the DDT checked; the official result and the alerts come from the `compareDocument` operation at that moment.
- **Removed material arrival**: scans pieces; can **sort in the same pass** (the suggested category appears at each reading) or only record the arrival and sort later.
- **Sorting**: scans a piece, sees the suggested category in large type, confirms with one tap or chooses another.
- **New defective or leftover**: scans and classifies (photo mandatory for defective if the setting is on).
- **Return shipment**: creates it, scans the pieces, enters the DDT number, attaches the file, sends; can cancel the draft.
- **Transfer within the ASP**: chooses the destination warehouse of the same ASP, scans the pieces, sends. **Transfers between ASPs** appear as "to send" or "incoming" when the client creates them.
- **Arrival of a transfer**: opens the incoming transfer and scans the pieces.
- **To complete**: list of pieces without a model or with required extra fields missing.

### 12.3 ASP admin (desk shell, in addition to 12.2)
People of their ASP (invite, resend invitation, deactivate, block now); BOM upload per site; ASP dashboard; alerts and anomalies; item search and history; exports; monthly reports of their ASP; `revealEventAuthor` on one event when strictly needed.

### 12.4 Client warehouse
Incoming return shipments; confirms with the ticked list (untick missing, add extra); sees the differences.

### 12.5 Client office (desk shell, read-only)
Dashboard of all ASPs (§13.1), alerts, anomalies, item search and history, documents, exports, monthly reports (client-wide and per ASP).

### 12.6 Client admin (desk shell)
Everything of the office, plus: ASPs and their first admin, all users, sites and warehouses (import, reassignment), catalog of models (import), sorting categories and rules, transfers between ASPs, corrections, settings (§14), admin log.

---

## 13. Desk views

### 13.1 Dashboards and aggregates
Never compute dashboards by reading every item in the browser.
- The trigger increments counters (after the transaction, §8.2) in `aggregates/{id}` documents, each with a `scope` (`client` or an aspId) and **10 shards** summed when read. Every dimension exists **both** client-wide **and** per ASP: status × flow, status × model, status × equipment type, status × manufacturer, status × site, status × warehouse, status × region, sorting category. Rules: client roles read all scopes, ASP roles only `scope == orgId`.
- **Granularity**: one document per (scope, dimension, shard) holding a map key → counter (for example `aggregates/client_statusBySite_3` with `{ "siteId|status": n, ... }`), not one document per cell: a dashboard reads tens of documents, not thousands. Each shard holds only the keys it touched, so even status × site with thousands of sites stays well under 1 MB.
- A nightly scheduled job recounts everything from `items` and rewrites the aggregates (corrects drift). Data a few minutes old is acceptable.
- **Client dashboard**: quantities by flow and status, by model, equipment type, manufacturer, ASP, warehouse, site and region; new material waiting in ASP warehouses and for how long (warning beyond the threshold); removed material waiting to be returned (warning beyond the threshold); sorting outcome by category; "removed, of which previously new". The question it answers: *how much new material must I order, and how much old material must I dispose of, keep or refurbish.*
- **ASP dashboard**: the same, limited to the ASP.
- Every number drills down to the list of pieces.

### 13.2 Item search and history
Search by any code (exact, through `codes`), by model, by site. Item page: data, photos, current status and location, and the **full history** through the callable `itemHistory(itemId)`: every event with time, location, organization and role, **never the person's name or uid** (R11); corrections shown as notes; for ASP roles, events of other organizations appear as "another organization".

### 13.3 Exports
Excel export of pieces filtered by site, model, period, ASP, warehouse, status, sorting category. Generated by a callable with exceljs into `exports/{scope}/`, downloaded when ready. Headers in the user's language. No `userId` column.

### 13.4 Monthly reports
A scheduled function on the 1st of every month at 06:00 Europe/Rome produces, **for the client and for each ASP (each only with its own data)**, a PDF report (pdfmake) and the Excel extract of the month, in the organization's language. Content: received, installed, removed, sorted per category, returned, waiting beyond the threshold, alerts opened and closed, top models and sites. Listed in the app for download (no e-mail). Client roles can generate one on demand. `reports/{id}`: `scope`, `month` ("YYYY-MM"), `language`, `pdfPath`, `xlsxPath`, `createdAt`.

### 13.5 Alerts and anomalies
Inbox views with filters (§11.4, §8.3).

---

## 14. Settings (client_admin) — configurable items, and only these
- `settings/branding` (**readable without authentication**): app name (default "SwapTrack"), logo path, primary color (default `#FF6B00`).
- `settings/auth` (the provider flags **readable without authentication**): Google sign-in (off), Microsoft sign-in (off), MFA for admins (off), desktop inactivity sign-out (off, minutes: 30).
- `settings/app`: `minVersion` (empty).
- Sorting categories and rules: the collections of §10 (the settings menu links to them).
- `settings/itemFields`: extra fields of items (label it/en, type text/number/choice; `required` means "appears in the to-complete list", never blocks a scan).
- `settings/importMappings`: saved column mappings for sites and models (document mappings live in `documentMappings`, §11.2).
- `settings/thresholds`: days before `stale_material` (30), days before `transfer_difference` (7).
- `settings/photos`: photo mandatory for "defective" (off).
- `settings/fieldPolicy`: piece found at a site but not in the BOM: accept and alert (default) or accept silently.
- `settings/privacy`: privacy notice text per language and its version; retention job (off) and days.
- `settings/features`: AI document extraction (off; not implemented: shows "not available").

---

## 15. Visual design

- **One tokens file** (`src/styles/tokens.css`, CSS variables mapped in the Tailwind config) holds colors, typography, spacing, radii. Screens use tokens only, never raw colors. The branding primary color is applied at runtime to the token. The visual polish will be done later by the owners on this file.
- **Layout: a classic PWA with a sidebar, for every role.** On desktop and tablet a left sidebar with the sections of the role (collapsible to icons), a top bar with the installation's logo and name, the selected location (field roles), the alert counter, online/offline status and pending count, language and the user menu. On the phone the sidebar becomes a drawer opened from the top bar, and the field roles also get a large, always reachable **Scan** button. The content area is full width. Do NOT use a narrow centered column on desktop, and do NOT use a step-by-step "pipeline" navigation.
- **Field shell** (technicians, warehouse on narrow screens): dark theme (background `#1E1E1E`, surfaces `#2D2D2D`, borders 2px `#404040`, primary `#FF6B00` by default, secondary text at least `#B0B0B0`); touch targets **at least 56 px** (gloves), drawer items included; no glassmorphism, no soft shadows, no low-contrast or pastel colors (direct sunlight); **green and red never carry meaning alone**: always text or an icon too.
- **Desk shell** (client roles, ASP admin and warehouse on wide screens): the same sidebar layout in a light theme, dense but ordered, keyboard friendly, tables with sorting, filters and pagination.
- Numbers: tabular figures in tables; key quantities large.
- **Every screen has designed loading, empty and error states**; empty states say what to do next, with the button to do it.
- Typeface: IBM Plex Sans for UI, IBM Plex Mono for codes, **self-hosted** (no font CDN). Icons: lucide-react only.
- Contrast and accessibility at least WCAG AA; visible keyboard focus; labels on every control.
- A provisional, simple text logo for SwapTrack, replaceable from settings.
- A short in-app guide per role (one screen, bilingual).

---

## 16. PWA and offline

- Installable. The service worker caches the app shell, fonts, icons and `zxing_reader.wasm`: in vite-plugin-pwa set `workbox.globPatterns` to include `**/*.wasm` and raise `maximumFileSizeToCacheInBytes` above the wasm size.
- When a new version is ready, the app shows "new version available, reload"; the minimum version (§4.18) can force it.
- Offline data: Firestore `persistentLocalCache` with `persistentMultipleTabManager`. Events written offline are queued by Firestore and sent when back online.
- Always visible in the field shell: online/offline and the number of events and photos waiting to be sent.
- `navigator.storage.persist()` requested on start.
- iOS installation guidance (§7.4).

---

## 17. Security rules and tests

- The agent writes `firestore.rules` and `storage.rules` implementing §3, §7.3, §8.1, R7 and R11. Clients create only events (with the checks of §8.1) and read according to §3.3; every other write is denied to clients (callables use the Admin SDK). Public reads: only `settings/branding`, the provider flags of `settings/auth`, and `branding/logo.*` in Storage.
- The agent configures **Vitest** (including `functions/src/**`) and the **emulators** (auth, firestore, functions, storage) with npm scripts, and writes **unit tests for pure logic only**: the state machine (§9.2: every transition, every forbidden case, the general rules, replay sequences including the late removal of §8.2), sorting precedence (§10), document comparison (§11.3), plus the delivered parity test (R8). Run them once at the end of each step and report the results.
- **The owners write the security-rules tests and the end-to-end offline tests locally.** The agent does not write or iterate them.

---

## 18. Environments, deployment, seed

- Firebase project aliases in `.firebaserc`: `demo-swaptrack` (emulators, build environment), and placeholders `dev`, `demo`, `prod` to be filled by the owners. Deploy scripts take the project id as a parameter (`npm run deploy -- --project <id>`), so the same code serves any installation.
- `README.md` documents: local run with emulators, tests, seeding, deployment (`--force` for the trigger), and **preparing a new installation**: create the project in the EU; enable Auth, Firestore, Storage, Functions; **upgrade to Firebase Authentication with Identity Platform** (required by MFA and blocking functions); install the **Trigger Email** extension with the client's SMTP server; set the auth domain and the OAuth redirect URIs; create the first `client_admin`; initial settings; enable **Firestore point-in-time recovery and scheduled backups** for production.
- **Demo seed** (invented data, a script run once): client organization "Telco Demo", three ASPs ("ASP Nord", "ASP Centro", "ASP Sud") with two warehouses each, 1,500 sites distributed among them, a client warehouse, 20 models from 4 manufacturers, about 5,000 pieces across every state of both flows, open and checked DDTs, BOMs with and without differences, transfers within and between ASPs, open alerts and anomalies, sorting categories and rules, two months of history. **The seed writes items, codes, events (with `processedAt` and `scannedAtEffective` already set, so the trigger skips them), documents and the rest directly with the Admin SDK**, then runs the aggregate recount once. The seeded events of each piece are **valid sequences** for the state machine, and the seeded state of every piece is computed with **the same replay function** (§8.2), so the first real event on a seeded piece does not change its state by surprise. One account per role per organization, with invented names on a fake domain, listed in `README.md`.

---

## 19. Data model and server actions

### 19.1 Collections
`organizations`, `users` (`email`, `firstName`, `lastName`, `role`, `orgId`, `active`, `disabledAt`, `language`, `privacyNoticeVersion`, `privacyAcceptedAt`, `createdAt`), `locations`, `models`, `items`, `codes`, `events`, `expectedCodes`, `anomalies`, `documents`, `documentMappings`, `shipments` (+ `lines`), `alerts`, `sortingCategories`, `sortingRules`, `settings`, `aggregates` (server writes), `reports`, `mail` (server only), `adminLog` (client_admin read), `accessLog` (no client access). Document every collection and field in `ARCHITECTURE.md`.

### 19.2 Server operations, by router (R20)
Every client action that is not an event is an operation `op` of one router. The names below are the operations; the map operation → router is in `functions/src/shared/operations.ts`.
- **`users`**: `createAsp`, `setAspActive`, `inviteUser`, `resendInvitation`, `changeRole`, `deactivateUser`, `blockUserNow`, `signOutEverywhere`, `deleteUser`, `acceptPrivacy`, `setLanguage`.
- **`catalog`**: `importLocations` (preview and commit), `saveLocation`, `reassignSite`, `importModels`, `saveModel`.
- **`items`**: `editItem`, `mergeItems`, `correctEventLocation`, `forceState`, `itemHistory`, `revealEventAuthor`, `attachPhotos`.
- **`shipments`**: `createShipment`, `sendShipment`, `cancelShipment`, `confirmReturn`.
- **`documents`**: `saveDocument`, `markDocumentChecked`, `closeDocument`, `saveDocumentMapping`, `compareDocument`.
- **`alerts`**: `markAlertSeen`, `closeAlert`, `resolveAnomaly`.
- **`desk`**: `listEvents` (projection without `userId`), `createExport`, `generateReport`.
- **`settings`**: `saveSettings`, `saveSortingCategory`, `saveSortingRule`.

Functions that are not routers: the trigger `onEventCreated`; the blocking functions `beforeCreate` and `beforeSignIn`; the scheduled jobs (monthly reports, daily `stale_material` and BOM check, nightly aggregate recount, end of grace periods, retention job (off)). Expected total: about 16 exported functions.

---

## 20. Out of scope (do not build)
- Work planning, scheduling, crews, calendars, job or activity management.
- E-mail notifications other than invitations and password reset (alerts are in-app only).
- Any per-person analytics or activity view.
- AI reading of documents or photos (extension point only, disabled).
- Integration with the client's systems (none for now).
- The native app wrapper (the owners add it later; respect R16).
- Recording the departure of new material from the client warehouse.
- Values or prices of materials.
- Pieces with no readable code at all (label destroyed and no digits): the identity of a piece is its code; such pieces are out of the system, by design (write it in `NOT_DONE.md` as "by design").

---

## 21. Build steps
- **Step 1 — Plan.** Read this spec and the delivered files. No code.
- **Step 2 — Foundations.** §0, §2 (all rules), §3, §4, §5, §14 (`branding`, `auth`, `app`, `privacy`, `importMappings`), §15 (tokens, sidebar layout, both shells, states), §16, §17 (rules for these collections, Vitest and emulators setup, the delivered parity test), §18 (aliases, scripts, README sections; seed of organizations, users, locations and models), R20 (the routers, the shared operation map, the single call point) with the `users`, `catalog` and `settings` routers (§19.2; `settings` only for the parts of §14 in this step), i18n infrastructure, `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `NOT_DONE.md`.
- **Step 3 — Scanning and flows.** The delivered files in place; §6, §7, §8, §9, §10; §12.1 and §12.2 **without** the DDT part (`ddtId` stays optional; choosing or uploading a DDT arrives in step 4) plus the "to complete" list; the `items` and `shipments` routers (§19.2), shipments (§9.3, §9.4); the schema of `aggregates` and the increments in the trigger (§13.1) **without** the dashboards; photo offline queue; rules for the new collections and Storage paths; unit tests for §9 and §10.
- **Step 4 — Documents and desk.** §11 (including the DDT part of §12.2, the DDT file of return shipments, and `expectedCodes`); the `documents`, `alerts` and `desk` routers (§19.2); §12.3 to §12.6; §13; the rest of §14; full demo seed (§18); unit tests for §11.3; final update of `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `NOT_DONE.md`.
