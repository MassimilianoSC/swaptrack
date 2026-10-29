# REGISTRO di SwapTrack

Lo scrive la memoria storica. In testa: DOVE SIAMO. Poi: obiettivo e criteri, decisioni, commit, stime.

## DOVE SIAMO — aggiornato il 29/10/2026, sera

- **Stato:** metodo in funzione. o2 e o3 si sono presentate, sono nel proprio worktree con le dipendenze installate (`yarn test` verde per o2, `yarn build` verde per o3) e hanno il primo incarico.
- **Sessioni (nomi in ListAgents):** memoria storica = `swaptrack-81`; o2 = `swaptrack-30`; o3 = `swaptrack-2b`.
- **Chi fa cosa:** o2 → P-10 (prove sulle regole, Firestore prima e Storage poi), nell'attesa P-12 e P-15 in sola lettura; o3 → costruzione di P-20 (raffica, opzione 1, via dato con D-11) e avvio di P-23 (Playwright, percorsi 6 e 5 per primi). **Turno degli emulatori: o2** (o3 lo aspetta per lanciare le sue prove).
- **Aspetta il committente:** P-1, P-2, P-3, P-4, P-6, P-7 (vedi PIANO); giudizio sull'aspetto della raffica quando o3 la consegna (D-11 è rivedibile); **chi fa il `merge --ff-only` nella copia principale** (lo strumento di o3 rifiuta di scrivere fuori dal suo worktree; proposta: lo fa la memoria storica).
- **Difetti intravisti da o3 (da confermare con le prove):** la pagina del pezzo resta su «Caricamento» per sempre se il pezzo non è leggibile (nessuno stato d'errore, SPEC §15); la ricerca per codice di un codice non leggibile fallisce in silenzio. o3 li ripara strada facendo nel percorso 6.
- **Difetti intravisti da o2 (sola lettura):** (1) **grave, in verifica da un aiutante in sola lettura:** nel trigger, nei percorsi `old_label_used` e `merge_chain_suspicious`, l'anomalia è scritta dentro la transazione prima di altre letture; l'Admin SDK lo vieta e l'errore verrebbe ritentato all'infinito (R5). Se confermato, o2 lo ripara con una prova rossa subito dopo le prove Firestore di P-10. (2) piccolo: etichetta del mese nei resoconti sbagliata di uno (gennaio → «2027-00»); o2 la ripara con una prova quando tocca quei file.
- **Ordine dei lavori di o2:** P-10 Firestore → riparazione del trigger (se confermata) → P-10 Storage → P-11.
- **Cosa è online:** https://swaptrack-demo.web.app sul progetto `kronos-caffe-sito` (lotto 0). `main` è avanti di commit non ancora su GitHub: il push lo fa il committente.
- **Prossimo passo:** stime di o2 (P-10) e o3 (P-20, P-23) da registrare; primi commit di o2 (con la rimozione di `functions/package-lock.json`, D-10).

## Obiettivo

Una demo di SwapTrack che funziona davvero, da mostrare a un consulente Ericsson intorno all'11 novembre 2026, che sia anche base solida per la produzione (gennaio 2027). Approvato dal committente il 29/10/2026 e riconfermato la sera stessa. I criteri sono «dinamici»: il committente può aggiungerne o cambiarne lungo il cammino.

## Criteri (in ordine: in conflitto vince il più in alto)

| # | Criterio | Come lo misuriamo |
|---|---|---|
| 1 | **Riservatezza.** Nessuna ASP vede materiale, siti o persone di un'altra; nessuna vista per singola persona; niente GPS. Non negoziabile. | Prove sulle regole con l'emulatore: ogni lettura o scrittura di un'ASP su dati di un'altra è rifiutata; gli eventi sono leggibili solo dall'autore; le risposte delle funzioni non contengono `userId`. Nessun uso di geolocalizzazione nel codice (ricerca nel repository). |
| 2 | **Dati giusti.** Mai un pezzo doppio o perso; una scansione fatta senza rete arriva sempre. | Prove del trigger sull'emulatore: lo stesso codice da due dispositivi offline dà un solo pezzo; un evento in ritardo prende il suo posto nella storia; il trigger è idempotente. Una prova su telefono vero in modalità aereo. |
| 3 | **Funziona nella demo.** I percorsi che vedrà il consulente funzionano su computer e telefoni, Android e iPhone. | L'elenco dei percorsi della demo (DA_FARE, P-6) provato su computer, Android e iPhone, con esito annotato nel PIANO; prove end-to-end sugli emulatori per gli stessi percorsi. |
| 4 | **Fedele a quanto deciso.** La specifica e le risposte del committente; se divergono, valgono le risposte. | Ogni scostamento dalla specifica o dalle risposte è una decisione registrata qui (D-n) con il criterio. |
| 5 | **Semplice.** La soluzione più semplice che regge; niente funzioni nuove non richieste. | Nessuna funzione nuova senza stima e via; ogni via è registrato. |
| 6 | **Aspetto.** Decide il committente. | Il committente guarda e dice. |

## Decisioni

Formato: numero, data, decisione, criterio o chi ha deciso, rivedibile. Le scelte fatte da Emergent (D1–D39, senza trattino) stanno in `DECISIONS.md` e non si toccano.

| # | Data | Decisione | Criterio / chi | Rivedibile |
|---|---|---|---|---|
| D-1 | 29/10/2026 | Metodo a tre sessioni (memoria storica, o2, o3) con i documenti CLAUDE.md, REGISTRO.md, PIANO.md, DA_FARE.md. | committente | no |
| D-2 | 29/10/2026 | Divisione del codice: o2 = server, dati, regole, indici, script, prove di logica e di regole; o3 = interfaccia, PWA, prove end-to-end; memoria storica = documenti e configurazione. Dettaglio in CLAUDE.md §3. Segue le cartelle esistenti; l'unico punto di contatto è `functions/src/shared/`. | criterio 5 | sì |
| D-3 | 29/10/2026 | Copie di lavoro: worktree `.claude/worktrees/o2` (ramo `o2`) e `.claude/worktrees/o3` (ramo `o3`), creati dalla memoria storica dalla punta di `main`; le sessioni ci entrano con EnterWorktree. Ogni copia installa le proprie dipendenze (circa 700 MB a copia). | criterio 5 | sì |
| D-4 | 29/10/2026 | Emulatori: una sola istanza alla volta sulla macchina (porte fisse in `firebase.json`); il turno lo dà la memoria storica. Se blocca il lavoro: seconda configurazione con porte diverse (`firebase --config`). | criterio 5 | sì |
| D-5 | 29/10/2026 | `SPEC.md` resta la versione 3 e non si modifica: gli scostamenti sono decisioni qui. `DECISIONS.md`, `NOT_DONE.md`, `memory/` e `PASSAGGIO_DI_CONSEGNE.md` sono storici (Emergent e passaggio): nessuno li aggiorna. | criterio 4 | sì |
| D-6 | 29/10/2026 | Lingue: documenti del metodo in italiano; codice, commenti, README e ARCHITECTURE in inglese (il prodotto si vende in inglese: risposta del cliente). | criterio 4 | sì |
| D-7 | 29/10/2026 | Cartella di lavoro spostata dal committente da `C:\dev\swaptrack` a `C:\Users\mcracchiolo\Desktop\swaptrack` (il Desktop non è sotto OneDrive). Verificato: git integro, build dell'app e delle funzioni riuscite. L'unica cosa persa era l'account Firebase per cartella, reimpostato dal committente (`firebase login:use`). | committente | — |
| D-8 | 29/10/2026 | Catena di controlli prima di ogni merge su `main`: `yarn build && yarn --cwd functions build && yarn test`; si allunga con le prove sulle regole quando esisteranno. | criterio 2 | sì |
| D-9 | 29/10/2026 | Le prove che usano gli emulatori (regole P-10, trigger P-11) stanno in `functions/test/`, con le dipendenze in `functions/package.json` (devDependencies) e l'include di `vitest.config.ts` esteso da o2: tutto nei file di o2, nessuna attesa su o3. `tests/` resta per la logica pura. | criterio 5 | sì |
| D-10 | 29/10/2026 | `functions/package-lock.json` è un residuo (lo strumento è yarn, DECISIONS b11): o2 lo toglie nel suo primo commit. | criterio 5 | sì |
| D-12 | 29/10/2026 | Le prove che usano gli emulatori hanno una configurazione Vitest separata (`functions/test/vitest.config.ts`, di o2): `yarn test` resta puro e veloce. Comando: `firebase emulators:exec --only firestore,storage --project demo-swaptrack "vitest run --config functions/test/vitest.config.ts"` (script `test:rules` alla radice, chiesto a o3). La catena prima del merge diventa `yarn build && yarn --cwd functions build && yarn test && yarn test:rules`. Ogni file di prova usa un proprio id di progetto `demo-rules-<nome>`: il seed di `demo-swaptrack` non si tocca. | criterio 5 | sì |
| D-11 | 29/10/2026 | Raffica (P-20): si costruisce l'opzione 1, contatore grande ed elenco a scorrimento delle letture della sessione subito sotto la fotocamera (ultima in cima, circa tre righe visibili, codice + tipo + esito); «annulla l'ultima» toglie la riga e abbassa il numero. Il contatore conta dall'apertura della schermata; il cambio di modo non azzera. SPEC §7.2 chiede già una «running list»; l'opzione 2 (tendina) è più complessa e ferma la lettura con la pistola mentre è aperta. L'aspetto lo giudica il committente sul risultato. | criteri 4 e 5; aspetto: criterio 6 | sì |

## Commit (dal passaggio di consegne in poi)

I commit `[reg]` si registrano nell'aggiornamento successivo del registro (il proprio hash non si conosce prima del commit). Quelli di o2 e o3 arrivano col loro resoconto (CLAUDE.md §7).

| Hash | Sessione | Data | Cosa |
|---|---|---|---|
| 7625662 | reg | 29/10/2026 | Documenti del metodo (CLAUDE, REGISTRO, PIANO, DA_FARE), worktree ignorati, nota sulla cartella spostata |
| (prossimo aggiornamento) | reg | 29/10/2026 | DOVE SIAMO con i nomi delle sessioni e i primi incarichi; D-9, D-10 |

Storia precedente (in `git log`): 586abdc codice di Emergent; bc3986f installazione demo (escamotage); f8c0288 fullSeed con la vera funzione d'identità; 7b0e470 gitignore; 1d468b4 indici Firestore mancanti; 587f1a6 pulsante «Installa l'app»; 5e66bb4 logo; ebbc40b passaggio di consegne.

## Stime date (per controllarle dopo)

| Data | Chi | Cosa | Stima | Com'è andata |
|---|---|---|---|---|
| 29/10/2026 | o3 | P-20 raffica, opzione 1 (contatore + elenco sotto la fotocamera) | 2–3 ore, rischio basso | in corso |
| 29/10/2026 | o3 | P-20 opzione 2 (tendina), non scelta | 3–4 ore, rischio medio | — |
| 29/10/2026 | o3 | P-23 prove end-to-end, tutto (impianto 2 h; percorsi: 6 → 2 h, 5 → 2 h, 2 raffica → 1 h + DDT 2 h, 3 → 1,5 h, 4 → 3 h, 1 offline → 3 h, 7 → 1 h) | 17–18 ore, rischio medio (il più alto: percorso 1, Firestore offline in Chromium headless) | in corso |
| 29/10/2026 | o3 | P-23 primo lotto: impianto + percorsi 6, 5 e raffica | circa 7 ore | in corso |
| 29/10/2026 | o2 | P-10 prove sulle regole (impianto 1 h, Firestore 4–5 h, Storage 1–2 h) | 6–8 ore, rischio medio | in corso |
