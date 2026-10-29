# REGISTRO di SwapTrack

Lo scrive la memoria storica. In testa: DOVE SIAMO. Poi: obiettivo e criteri, decisioni, commit, stime.

## DOVE SIAMO — aggiornato il 29/10/2026, sera

- **Stato:** metodo avviato. Documenti creati (CLAUDE, REGISTRO, PIANO, DA_FARE); copie di lavoro `o2` e `o3` create dalla punta di `main`. Le sessioni o2 e o3 sono aperte: devono entrare nel proprio worktree, installare le dipendenze e presentarsi alla memoria storica.
- **Sessioni (nomi in ListAgents):** memoria storica = `swaptrack-81`; o2 = da annotare; o3 = da annotare.
- **Chi fa cosa:** nessun incarico assegnato ancora. Primi incarichi previsti: o2 → prove sulle regole di sicurezza (P-10); o3 → stima della raffica (P-20) e prove end-to-end di base (P-23).
- **Aspetta il committente:** P-1, P-2, P-3, P-4, P-6, P-7 (vedi PIANO).
- **Cosa è online:** https://swaptrack-demo.web.app sul progetto `kronos-caffe-sito` (lotto 0).
- **Prossimo passo:** presentazione di o2 e o3; poi i primi incarichi.

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

## Commit (dal passaggio di consegne in poi)

I commit `[reg]` si registrano nell'aggiornamento successivo del registro (il proprio hash non si conosce prima del commit). Quelli di o2 e o3 arrivano col loro resoconto (CLAUDE.md §7).

| Hash | Sessione | Data | Cosa |
|---|---|---|---|
| (prossimo aggiornamento) | reg | 29/10/2026 | Documenti del metodo, worktree ignorati, nota sulla cartella spostata |

Storia precedente (in `git log`): 586abdc codice di Emergent; bc3986f installazione demo (escamotage); f8c0288 fullSeed con la vera funzione d'identità; 7b0e470 gitignore; 1d468b4 indici Firestore mancanti; 587f1a6 pulsante «Installa l'app»; 5e66bb4 logo; ebbc40b passaggio di consegne.

## Stime date (per controllarle dopo)

| Data | Chi | Cosa | Stima | Com'è andata |
|---|---|---|---|---|
| — | — | — | — | — |
