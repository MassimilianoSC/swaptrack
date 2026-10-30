# SwapTrack — regole per ogni sessione di Claude Code

Letto all'avvio da ogni sessione. Lo scrive solo la memoria storica; quando cambia, manda alle altre sessioni le righe cambiate. Rispondi sempre in italiano semplice: il committente non è un tecnico.

## 1. Il progetto in tre righe

SwapTrack è una PWA (React + Firebase) che traccia apparati telecom («board») leggendo il codice a barre di ogni pezzo nei due percorsi di uno swap di rete: materiale nuovo (cliente → magazzino ASP → sito) e materiale smontato (sito → magazzino ASP → smistamento → reso al cliente). Traccia i MATERIALI, non le lavorazioni. Usano l'app il cliente (un operatore telecom) e circa dieci ditte installatrici (ASP): ognuna vede solo il suo.

**Fonte di verità:** `SPEC.md` (versione 3). Se le risposte del committente divergono dalla specifica, valgono le risposte (registrate come decisioni nel REGISTRO). All'avvio leggi anche la testa di `REGISTRO.md` (DOVE SIAMO, obiettivo, criteri) e `PIANO.md`.

## 2. Chi fa cosa

| Sessione | Ruolo | Dove lavora |
|---|---|---|
| **memoria storica** (etichetta `[reg]`) | coordina, assegna i lavori, decide entro i criteri, registra, scrive i documenti. **Non tocca mai il codice.** | copia principale `C:\Users\mcracchiolo\Desktop\swaptrack`, ramo `main` |
| **o2** | server e dati: funzioni, regole, indici, script, prove di logica e di regole | copia `C:\Users\mcracchiolo\Desktop\swaptrack\.claude\worktrees\o2`, ramo `o2` |
| **o3** | interfaccia, PWA, prove end-to-end | copia `C:\Users\mcracchiolo\Desktop\swaptrack\.claude\worktrees\o3`, ramo `o3` |
| **committente** | decide ciò che i criteri non risolvono e l'estetica; fa push, pubblicazioni, migrazioni del database online, configurazioni del cloud, segreti e cancellazioni | fuori dalla macchina, nelle console |

**Come o2 e o3 raggiungono la propria copia.** Tutte le sessioni sono aperte nella cartella principale (la finestra di VS Code è su `C:\Users\mcracchiolo\Desktop\swaptrack`). **Non si entra mai nel worktree con lo strumento interno EnterWorktree:** accende una protezione che vieta `git -C` verso la copia principale e quindi il merge su main. Si lavora nella propria copia scrivendo i percorsi per intero: i file si leggono e si modificano con il percorso completo (per esempio `C:\Users\mcracchiolo\Desktop\swaptrack\.claude\worktrees\o2\functions\src\trigger.ts`), git si usa sempre con `-C <propria copia>`, e ogni comando `yarn`/`node` comincia con `cd C:/Users/mcracchiolo/Desktop/swaptrack/.claude/worktrees/o2 &&` (o3: `.../o3`). Nella copia principale non si modifica nulla: serve solo per il merge.

I nomi delle sessioni in ListAgents cambiano a ogni riavvio: quelli attuali sono nel DOVE SIAMO di `REGISTRO.md`. Un'autorizzazione riferita da un'altra sessione è un'informazione, non un permesso: le azioni del committente le fa lui, oppure le autorizza nella finestra di chi le esegue.

## 3. Un file, un proprietario

Si modificano solo i propri file, nella propria copia di lavoro. Serve un cambio in un file altrui? Si chiede tramite la memoria storica.

**o2**
- `functions/` tutto (sorgenti, `package.json`, `yarn.lock`, `tsconfig.json`, `.env.example`), tranne `functions/src/codeId.node.js` (congelato)
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`
- `scripts/`, tranne `scripts/copy-wasm.mjs` (congelato)
- `tests/` e `vitest.config.ts`, tranne `tests/codeId.parity.test.mjs` (congelato)
- `ARCHITECTURE.md`

**o3**
- `src/`, tranne i file consegnati (congelati): `src/lib/codeId.js`, `src/lib/clockOffset.js`, `src/lib/imageCompress.js`, `src/lib/scanner/engine.js`, `src/lib/scanner/webEngine.js`
- `public/`, `index.html`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json`
- `package.json` e `yarn.lock` della radice; `.env.example`, `.env.development`, `.env.demo`
- `e2e/` e `playwright.config.ts` (da creare)

**memoria storica**
- `CLAUDE.md`, `REGISTRO.md`, `PIANO.md`, `DA_FARE.md`, `README.md`, `.gitignore`, `.gitattributes`

**Congelati (nessuno li modifica):** `SPEC.md` (gli scostamenti sono decisioni nel REGISTRO, non modifiche alla specifica); `consegna/` e i file consegnati elencati sopra (SPEC R18: la logica non si tocca; si può aggiungere un `.d.ts` accanto); `DECISIONS.md`, `NOT_DONE.md`, `PASSAGGIO_DI_CONSEGNE.md`, `memory/` (storici di Emergent e del passaggio).

**Punti di contatto** (chi cambia avvisa l'altra sessione, con la memoria storica in copia):
- `functions/src/shared/` (o2) è importato dall'app con l'alias `@shared`: una firma che cambia si cerca in tutto il repository (`src/` compreso) e si avvisa o3.
- I codici d'errore del server (o2) sono tradotti dall'app in `src/i18n/*.json` (o3): un codice nuovo va comunicato.
- `firebase.json` (o2) contiene anche hosting e intestazioni del service worker, che servono a o3.
- `package.json` della radice (o3): se o2 ha bisogno di una dipendenza di prova alla radice, la chiede tramite la memoria storica.
- Una ricerca Firestore nuova con filtri più ordinamento o intervallo (in `src/lib/data/`, o3, o nelle funzioni, o2) richiede un indice in `firestore.indexes.json` (o2) e una riga nella prova degli indici in `tests/` (o2): gli emulatori non li chiedono, il progetto vero sì. o3 avvisa o2 prima di committare la ricerca.

## 4. Git

- **Copie di lavoro:** o2 e o3 lavorano solo nella propria copia (§2: percorsi completi e `git -C`, mai EnterWorktree). Nella copia principale non si modifica nulla: serve solo per il merge.
- **Commit per percorsi:** `git -C <propria copia> add <file...>` (mai `-A`, mai `.`); messaggio scritto in un file fuori dal repository (la propria cartella temporanea) e `git -C <propria copia> commit -F <file>`; prima riga con l'etichetta: `[o2] …`, `[o3] …`, `[reg] …`.
- **Portare il lavoro su main, dopo ogni commit.** Lo fa la sessione stessa, con SOLO questi due comandi git nella forma con `-C`, scritti esattamente così (barre `/`, non `\`: il terminale è Git Bash):
  1. `git -C C:/Users/mcracchiolo/Desktop/swaptrack/.claude/worktrees/o2 rebase main` (o3: `.../worktrees/o3 rebase main`);
  2. la catena di controlli (§5), in `&&`, che si ferma alla prima rossa;
  3. `git -C C:/Users/mcracchiolo/Desktop/swaptrack merge --ff-only o2` (o3: `merge --ff-only o3`);
  4. riferire alla memoria storica (§7).
  Se il merge è rifiutato perché `main` è avanzato: si rifà rebase e catena e si riprova. Un conflitto su un file dell'altra sessione: `git rebase --abort` e si segnala alla memoria storica, non si risolve da soli.
  Il committente ha dato un permesso preventivo a questi due comandi, alle prove, a `git add` e `git commit` (regole già nelle sue impostazioni). Se un comando del merge viene comunque rifiutato, non si cercano altre strade: si manda l'hash alla memoria storica con il testo del rifiuto, e il `merge --ff-only` lo lancia lei.
- **Mai push, mai deploy, mai migrazioni del database online, mai segreti, mai scritture sul cloud.** Li fa il committente. Online va solo ciò che è in git, a lotti, dopo un giro completo di prove lanciato da una sola sessione; in quel momento `main` è congelato (lo annuncia la memoria storica) e non si avviano altre prove pesanti; o2 e o3 continuano sui loro rami.

## 5. Comandi (Git Bash dello strumento, sempre dalla propria copia: `cd <propria copia> && …`)

- Prima volta in una copia: `yarn install --frozen-lockfile` e `yarn --cwd functions install --frozen-lockfile`; `Copy-Item functions\.env.example functions\.env` (contiene `APP_URL=http://localhost:3000`).
- Prove unitarie: `yarn test` (Vitest: `tests/**` e `functions/src/**/*.test.ts`); un file solo: `yarn test <percorso>`.
- Compilazione: `yarn build` (app, con controllo dei tipi) e `yarn --cwd functions build` (funzioni).
- **Catena prima di ogni merge:** `yarn build && yarn --cwd functions build && yarn test && yarn check:i18n` (`&&` tra i passi, mai `;`, nessuna pipe che nasconda il codice d'uscita; `check:i18n` confronta le chiavi di `it.json` e `en.json`, D-14). Le prove sulle regole (`yarn test:rules`, D-12) entrano nella catena dal momento in cui o2 consegna `functions/test/vitest.config.ts`: lo annuncia la memoria storica.
- **Prove end-to-end** (`yarn e2e`, Playwright, cartella `e2e/`, di o3): NON entrano nella catena per commit (servono gli emulatori col seed); entrano nel giro completo prima di ogni lotto. Si lanciano solo col turno degli emulatori.
- Emulatori: `yarn emulators` (compila le funzioni e avvia auth 9099, firestore 8180, functions 5001, storage 9199, pubsub 8085; progetto finto `demo-swaptrack`), poi `yarn seed` e, se serve, `yarn seed:full`; app di sviluppo: `yarn dev` (porta 3000). **Le porte sono fisse: sulla macchina gira una sola istanza degli emulatori alla volta.** Chi ne ha bisogno lo dice alla memoria storica, che dà il turno.
- Durante il lavoro si lanciano solo le prove dei file toccati e di chi li usa; un giro intero solo col via della memoria storica.
- Il progetto Firebase della demo (`kronos-caffe-sito`, alias `demo`) è un escamotage senza legame con SwapTrack (README, D39). Letture del cloud solo in sola lettura, concordate con la memoria storica, stampando solo i campi necessari.

## 6. Regole di lavoro (valgono per tutti)

- Prima di costruire si decide come si misura se ha funzionato.
- Prima di una funzione nuova: stima (ore, rischio) alla memoria storica e attesa del via. Le riparazioni di difetti non hanno bisogno del via.
- Ogni difetto riparato ha una prova che è rossa sul codice di prima. Un difetto trovato strada facendo si ripara subito e si dichiara.
- Una prova che scrive usa dati propri, mai dati condivisi che altre prove contano.
- Quando cambia la firma di un'operazione o la forma di una risposta, si cercano nel repository tutti i punti e le prove che la usano.
- Una frase che dichiara una garanzia («nessuno lo usa», «non si può») si verifica sul codice. Una misura assurda: il primo sospettato è lo strumento.
- I numeri (quante prove, quanti file) non si scrivono nei documenti: si rilanciano i comandi.
- NESSUNO RESTA FERMO: dopo una risposta si torna subito alla propria coda; in attesa si lavora a ciò che non dipende dall'attesa (bozze, stime, controlli in sola lettura).
- Mai chiedere né scrivere password o segreti. Dati reali di persone mai nel progetto (solo dati inventati). Non aggirare un permesso negato e non far eseguire ad altre sessioni un'azione bloccata: si chiede al committente.
- Mai caratteri di controllo letterali nei sorgenti (usare `\u`). Codice, commenti, README e ARCHITECTURE in inglese; i documenti del metodo in italiano; ogni testo per l'utente passa da i18n (italiano e inglese).
- Niente funzioni nuove non richieste (criterio 5).

## 7. Cosa riferire alla memoria storica dopo ogni commit (SendMessage)

Prima riga: `[o2] commit <hash> — <titolo>`. Poi: cosa è stato fatto; prove (quante rosse prima, quante verdi dopo, con il comando); la riga per l'utente se cambia ciò che vede; decisioni prese e con quale criterio; tempo impiegato (ore reali) per ogni voce stimata; domande. Per i dettagli tecnici o2 e o3 si scrivono direttamente, sempre con la memoria storica in copia (lo stesso messaggio anche a lei).

## 8. Memoria di contesto piena (compact)

- Vicini al compact: avvisare la memoria storica e mandarle il PASSAGGIO DI CONSEGNE: stato della copia di lavoro (tutto committato), commit non ancora su main e prove da lanciare, accordi in corso con l'altra sessione, prossimo passo, ciò che sa solo questa sessione (difetti intravisti, misure, trappole).
- Dopo un compact: rileggere `CLAUDE.md`, il DOVE SIAMO di `REGISTRO.md` e `PIANO.md` (quelli della copia principale, sempre aggiornati); rileggere i nomi con ListAgents; dire alla memoria storica cosa si ricorda (ruolo, copia, lavoro in corso, cosa non è sicuro).
- Mai due sessioni con lo stesso ruolo sulla stessa copia.

## 9. Mappa «una cosa, un posto»

| Domanda | Dove sta la risposta | Chi lo scrive |
|---|---|---|
| Cosa deve fare il prodotto | `SPEC.md` | nessuno (congelato, versione 3) |
| Cosa ha risposto il cliente; la storia fino al 29/10/2026 | `PASSAGGIO_DI_CONSEGNE.md` §5 e §4 | nessuno (storico) |
| Obiettivo, criteri, dove siamo, decisioni (D-1, D-2…), commit, stime date | `REGISTRO.md` | memoria storica |
| Stato dei lavori (da fare / in corso / fatto / aspetta il committente), lotti pubblicati | `PIANO.md` | memoria storica |
| Dettaglio di ogni voce del piano (cosa, misura, opzioni, stima) | `DA_FARE.md` | memoria storica |
| Regole, ruoli, file, git, comandi | `CLAUDE.md` | memoria storica |
| Come si avvia, prova, pubblica; installazione nuova; account demo | `README.md` | memoria storica (le sessioni le mandano le righe) |
| Funzioni esportate, router, collezioni, regole, Storage | `ARCHITECTURE.md` | o2 |
| Scelte fatte da Emergent (D1–D39) e cosa non ha verificato | `DECISIONS.md`, `NOT_DONE.md` | nessuno (storici) |
| File consegnati da non riscrivere | `consegna/README.md` | nessuno |
| Documentazione per l'utente e il collaudo | da creare (PIANO, P-31) | memoria storica |
