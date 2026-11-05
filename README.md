# SwapTrack

Progressive Web App that tracks telecom equipment by barcode through the new-material and removed-material flows of a network swap project. Source of truth: `SPEC.md`. Firebase only (Auth, Firestore, Storage, Cloud Functions 2nd gen, Node 22, europe-west1).

## Requirements
- Node 22, Java 21 (Firestore and Storage emulators), yarn 1.x.
- `firebase-tools` is a dev dependency (`npx firebase ...`).

## Local run on the emulators (project `demo-swaptrack`)
```bash
yarn install && (cd functions && yarn install)
cp functions/.env.example functions/.env        # APP_URL = the URL the app is served from (invitation/reset links)
yarn emulators                                  # builds functions, starts auth, firestore, functions, storage, pubsub on the ports of firebase.json; Ctrl+C stops them and removes leftover Java processes
yarn seed                                       # base seed: organizations, users, locations, models, settings
yarn seed:full                                  # full §18 demo: ~5,000 items, documents, shipments, alerts, aggregates
yarn dev                                        # http://localhost:3010
```
`.env.development` holds demo values for `demo-swaptrack` (`VITE_USE_EMULATORS=true`). The dev server forwards the emulator endpoints on the same origin (see `vite.config.ts`, development only), so the app also works behind an HTTPS preview URL. Emulator ports are defined only in `firebase.json` (dedicated to SwapTrack, so another Firebase project on the same machine can run its emulators at the same time); the dev server port (3010) is defined only in `vite.config.ts`.
In containers without a cloud metadata server, `scripts/emulators.sh` sets `GCE_METADATA_HOST=127.0.0.1:1` so the CLI does not hang.

## Tests
```bash
yarn test        # Vitest: tests/**/*.test.{mjs,ts} and functions/src/**/*.test.ts
yarn test:rules  # security rules, trigger and scheduled-job tests on the emulators (functions/test/): starts and stops the emulators itself
yarn check:i18n  # it.json and en.json have the same keys
yarn e2e         # end-to-end tests of the demo paths (e2e/), in blocks (e2e/blocks.json, D-60): builds functions, then for each
                 # block starts fresh emulators, seeds, runs Playwright (its own yarn dev on port 3010) and stops everything.
                 # Needs all emulator ports and 3010 free. One block: node scripts/e2e-blocks.mjs --block <name>
yarn check:e2e-blocks  # every e2e/*.spec.ts is in exactly one block
# One profile or one file (build functions first with yarn build:functions):
#   node scripts/emulators.mjs --seed "yarn seed && yarn seed:full" --run "yarn e2e:only --project=desk"
#   node scripts/emulators.mjs --seed "yarn seed && yarn seed:full" --run "yarn e2e:only e2e/03-removed-sorting.phone.spec.ts"
# --seed "yarn seed" seeds into the running emulators (the base seed writes no events); with seed:full the data still goes through export and import, so the seed queues no triggers.
# Before a merge (D-57): only the e2e files written or changed for that item, with the small seed when enough.
# The exported full seed is kept in %TEMP%\swaptrack-seed-cache and reused the same day until the seed scripts change;
# node scripts/emulators.mjs --no-seed-cache … seeds from scratch.
# (yarn e2e --project=desk does NOT filter.) First time: npx playwright install chromium
```
Unit tests cover pure logic (state machine, sorting precedence, document comparison, code parity, report month, Firestore indexes, emulator ports). The tests on the emulators cover the security rules (Firestore and Storage), the trigger and replay, the scheduled jobs.

## Seeded accounts (emulators only, invented)
Password for all, on the emulators only: `SwapDemo2026`. The demo project online has its own password, set by the owner with `scripts/setDemoPassword.mjs` and never written in the repository.

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

## Preview before a batch (D-67)
- `node scripts/previewApp.mjs` (owner only: it writes to the cloud, never to the real site) publishes the app of `main` on the preview channel «anteprima» of the demo site for 7 days and prints the temporary address. Run again, it updates the same address. The preview domain is added to the Auth authorized domains by itself. Note: the preview uses the real demo data; functions, rules and indexes stay the ones online. Use it when only the app changed.
- `node scripts/previewLocal.mjs` opens the emulators with the full seed (from the cache when present) and the app on http://localhost:3010, prints the demo accounts (the password is the emulators' one above) and stays open until Ctrl+C, then stops the emulators. While it runs it holds the emulators (one turn, CLAUDE.md §5). Use it when the server changed too; there is no camera there (phones allow it only on a secure address).

## Invented demo documents
`node scripts/demoDocs.mjs` (from the project folder, after `yarn install`) writes into `demo-docs/` invented documents for the demo: DDTs as PDF, Excel and photo, a BOM as Excel and PDF, barcode labels, clean and damaged, labels of the BOM serials of SITO-00013, and `etichette-da-stampare.pdf` with all labels on A4 at real size (70 × 35 mm, print at 100%), all marked «DOCUMENTO DI PROVA». `demo-docs/LEGGIMI.txt` explains each file and the demo path (DDT TD-2026-0412 at Magazzino ASP Nord 1: arrived, missing, unexpected). It needs the test browser (`yarn playwright install chromium`, once, if missing).

## Progetto Firebase della demo / Firebase project of the demo installation

⚠️ **Why "kronos-caffe-sito" appears.** The demo installation "SwapTrack Demo" runs on the Firebase project **`kronos-caffe-sito`** (project number 840240907477). It is a **workaround**, decided by the owner on 29/10/2026: the owner's Google account had reached the maximum number of Firebase projects (a deleted project keeps counting for 30 days), and the company account's organization may have policies that block public callables. So an unused old project of the owner (originally the site of a café, Kronos Caffè) was reused and renamed "SwapTrack Demo". **It has nothing to do with SwapTrack**: the project ID cannot be changed, which is why the name still appears in IDs, the Storage bucket and the default Hosting site.

> In italiano: il nome «kronos-caffe-sito» è un **escamotage** per aggirare il limite di progetti Firebase dell'account del titolare. Il progetto è stato riusato e rinominato «SwapTrack Demo»; l'identificativo non si può cambiare. Non ha nessun legame con SwapTrack.

- App URL: **https://swaptrack-demo.web.app** (a dedicated Hosting site, target `app` in `.firebaserc`). The default site `kronos-caffe-sito.web.app` (old café site) was disabled on 03/11/2026 with `firebase hosting:disable --site kronos-caffe-sito --project demo`.
- Storage CORS: downloads of exports, reports and photos read the files with `getBlob` (D-35), so the bucket must allow the app's domains. Once per project, from the repository folder: `gcloud storage buckets update gs://kronos-caffe-sito.firebasestorage.app --cors-file=scripts/storage-cors.json`; check with `gcloud storage buckets describe gs://kronos-caffe-sito.firebasestorage.app --format="default(cors_config)"`. A new Hosting site needs its domains added to `scripts/storage-cors.json`.
- Web configuration: `.env.demo` (public values), build with `yarn build:demo`. `VITE_FIREBASE_AUTH_DOMAIN` is `swaptrack-demo.web.app`, the domain the app is served from.
- Functions configuration: `functions/.env.kronos-caffe-sito` (`APP_URL`).
- Alias: `demo` → `kronos-caffe-sito` (`firebase deploy --project demo`).
- Firestore and Storage in `europe-west1`; Identity Platform enabled; Blaze plan on the owner's personal billing account.
- When a proper project is available (company workspace or quota increase), create it, deploy there and retire this one: nothing in the code depends on this project ID.
- Demo data on the real project (invented data only): `gcloud auth application-default login`, then `SEED_REAL_PROJECT=kronos-caffe-sito node scripts/seed.mjs --yes-real-project` followed by the same for `scripts/fullSeed.mjs` (PowerShell: first `$env:SEED_REAL_PROJECT="kronos-caffe-sito"`, then `node scripts/seed.mjs --yes-real-project`). Without both the variable and the argument the scripts only touch the emulators. The same pattern (`CHECK_REAL_PROJECT`, `FIX_REAL_PROJECT`) protects `scripts/checkOnline.mjs` (read-only counts) and `scripts/fixDocumentAsp.mjs`. On the real project `scripts/seed.mjs` never changes the password of an existing account and asks one (hidden) only for new accounts. The base seed can be run again on a project in use: it creates only what is missing (organizations, locations, models, sorting categories and rule, demo accounts, missing settings fields) and rewrites nothing that exists: settings chosen online, logo, accepted privacy notice and disabled accounts stay as they are. To change the password of every demo account: `$env:DEMO_PASSWORD_REAL_PROJECT="kronos-caffe-sito"`, then `node scripts/setDemoPassword.mjs --yes-real-project` (it counts the accounts, asks for confirmation, then the new password twice; nothing is printed or stored).

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
1. Create a Firebase project located in the EU: Firestore in **`europe-west1`** (the event trigger and the functions run in europe-west1 and must match the database location), Storage in the EU.
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
