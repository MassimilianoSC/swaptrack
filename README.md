# SwapTrack

Progressive Web App that tracks telecom equipment by barcode through the new-material and removed-material flows of a network swap project. Source of truth: `SPEC.md`. Firebase only (Auth, Firestore, Storage, Cloud Functions 2nd gen, Node 22, europe-west1).

## Requirements
- Node 22, Java 21 (Firestore and Storage emulators), yarn 1.x.
- `firebase-tools` is a dev dependency (`npx firebase ...`).

## Local run on the emulators (project `demo-swaptrack`)
```bash
yarn install && (cd functions && yarn install)
cp functions/.env.example functions/.env        # APP_URL = the URL the app is served from (invitation/reset links)
yarn emulators                                  # builds functions, starts auth, firestore(8180), functions, storage, pubsub
yarn seed                                       # base seed: organizations, users, locations, models, settings
yarn seed:full                                  # full §18 demo: ~5,000 items, documents, shipments, alerts, aggregates
yarn dev                                        # http://localhost:3000
```
`.env.development` holds demo values for `demo-swaptrack` (`VITE_USE_EMULATORS=true`). The dev server forwards the emulator endpoints on the same origin (see `vite.config.ts`, development only), so the app also works behind an HTTPS preview URL. Firestore runs on port **8180** (8080 is often taken).
In containers without a cloud metadata server, `scripts/emulators.sh` sets `GCE_METADATA_HOST=127.0.0.1:1` so the CLI does not hang.

## Tests
```bash
yarn test        # Vitest: tests/**/*.test.{mjs,ts} and functions/src/**/*.test.ts
```
Covered pure logic: state machine (§9.2), sorting precedence (§10), document comparison (§11.3), code normalization parity. The owners write the security-rules tests and the end-to-end offline tests (SPEC §17).

## Seeded accounts (emulators only, invented)
Password for all: `SwapDemo2026`

| E-mail | Role | Organization |
|---|---|---|
| client.admin.telco@swaptrack-demo.test | client_admin | Telco Demo |
| client.office.telco@swaptrack-demo.test | client_office | Telco Demo |
| client.warehouse.telco@swaptrack-demo.test | client_warehouse | Telco Demo |
| asp.admin.nord@swaptrack-demo.test | asp_admin | ASP Nord |
| asp.warehouse.nord@swaptrack-demo.test | asp_warehouse | ASP Nord |
| asp.technician.nord@swaptrack-demo.test | asp_technician | ASP Nord |
| asp.admin.centro@swaptrack-demo.test | asp_admin | ASP Centro |
| asp.warehouse.centro@swaptrack-demo.test | asp_warehouse | ASP Centro |
| asp.technician.centro@swaptrack-demo.test | asp_technician | ASP Centro |
| asp.admin.sud@swaptrack-demo.test | asp_admin | ASP Sud |
| asp.warehouse.sud@swaptrack-demo.test | asp_warehouse | ASP Sud |
| asp.technician.sud@swaptrack-demo.test | asp_technician | ASP Sud |

**Base seed (`yarn seed`)**: 4 organizations, 12 users, 1 client warehouse, 6 ASP warehouses, 1,500 sites, 20 models, default settings. The privacy notice must be accepted at first sign-in.

**Full demo seed (`yarn seed:full`)**: on top of the base seed, ~5,000 pieces across every state of both flows (installed / received / sorted / defective / leftover / removed_at_site / returned / in_transfer / in_return, with `previousFlow: new` on about 10%), 10 DDTs (3 checked), 5 return DDTs, 10 BOMs, 5 within-ASP transfers (3 received), 3 between-ASP transfers, 5 return shipments (2 confirmed, 1 complete), 6 alerts, 6 anomalies, two months of history, aggregate recount for `client` and each ASP across every dimension including status × region.

## Deployment (done by the owners, never from the build environment)
```bash
cp .env.example .env.production   # fill VITE_FIREBASE_* of the installation
npm run deploy -- --project <projectId>     # or: yarn deploy --project <projectId>
```
- The event trigger `onEventCreated` requires `firebase deploy --only functions --force` the first time (retries enabled).
- **After every deploy check the invoker permission of the callable routers**: each Cloud Run service of `users`, `catalog`, `settings`, `items`, `shipments`, `documents`, `alerts`, `desk` must have `allUsers` → `roles/run.invoker`. Example: `gcloud run services get-iam-policy users --region europe-west1`.
- App Check (§4.17) is in monitoring mode: set `VITE_APPCHECK_SITE_KEY`; to enforce, turn on enforcement for Firestore, Storage and Functions in the console and set `enforceAppCheck: true` in `functions/src/core/router.ts`.
- Scheduled jobs run in Europe/Rome: `graceExpiry` 03:00, `retention` 03:30, `nightlyRecount` 02:00, `dailyChecks` 04:00, `monthlyReports` 06:00 on the 1st.

## Preparing a new installation
1. Create a Firebase project located in the EU (Firestore `eur3` or `europe-west1`; Storage in the EU).
2. Enable Authentication (e-mail/password), Firestore, Storage, Functions (Blaze plan).
3. **Upgrade to Firebase Authentication with Identity Platform**: needed by the blocking functions `beforeCreate`/`beforeSignIn` and by TOTP MFA (enable TOTP in Identity Platform settings). Configure the password policy (min 10, letters and digits).
4. Install the **Trigger Email** extension (collection `mail`) with the client's SMTP server, then set `settings/app.emailConfigured = true` from Settings → App.
5. **Auth domain = the domain the app is served from** (`VITE_FIREBASE_AUTH_DOMAIN`), e.g. Firebase Hosting custom domain; add it to the authorized domains. For Google/Microsoft, the OAuth redirect URI is `https://<app-domain>/__/auth/handler`. Microsoft: register an Azure AD app (company accounts), put client id/secret in the Microsoft provider.
6. Set `APP_URL` in `functions/.env` to the app URL: invitation and reset links point to the app's own handler page `/auth/action`. Also set the custom action URL in Auth templates to `https://<app-domain>/auth/action`.
7. Create the first `client_admin`: create the `client` organization and the user with the Admin SDK (same shape as `scripts/seed.mjs`, without demo data), set claims `{role, orgId, active: true, disabledAt: null}`.
8. Initial settings from the app (Settings): branding, sign-in, privacy notice, thresholds, photos, field policy, item fields.
9. Production: enable **Firestore point-in-time recovery** and **scheduled backups**.

## What is in this repo
See `ARCHITECTURE.md` for the exported Cloud Functions, the routers and the shared operation map; `DECISIONS.md` for every choice not fully specified; `NOT_DONE.md` for anything not finished and the reason; `SPEC.md` for the product.
