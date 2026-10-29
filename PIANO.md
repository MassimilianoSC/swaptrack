# PIANO di SwapTrack

L'unico documento con lo stato dei lavori. Lo scrive la memoria storica. Il dettaglio di ogni voce (cosa, misura, opzioni, stima) è in `DA_FARE.md`, con lo stesso numero.
Stati: **aspetta il committente** · **in corso** · **da fare** · **fatto**. Dentro ogni gruppo, l'ordine è la priorità (criteri).

## Lotti pubblicati

| Lotto | Data | Cosa | Commit |
|---|---|---|---|
| 0 | 29/10/2026 | Codice di Emergent più le correzioni locali (indici, installazione, logo), su https://swaptrack-demo.web.app (progetto `kronos-caffe-sito`) | non registrato con precisione (vedi P-7); da ora ogni lotto riporta il commit |

## Aspetta il committente

| # | Cosa | Chi poi |
|---|---|---|
| P-1 | Spegnere il sito Hosting predefinito `kronos-caffe-sito.web.app` (vecchio sito del bar): `cd C:\Users\mcracchiolo\Desktop\swaptrack` poi `firebase hosting:disable --site kronos-caffe-sito --project demo` | committente |
| P-2 | Cambiare la password degli account demo prima di condividere l'indirizzo oltre il consulente (oggi è scritta nel repository: README e `memory/test_credentials.md`) | committente in console; poi reg toglie la password dai documenti |
| P-3 | Via alla pulizia dei residui di Emergent: `memory/`, `test_result.md`, `test_reports/`, `tests/__init__.py` | reg (documenti) e o2 (`tests/__init__.py`) |
| P-4 | Elenco delle differenze notate rispetto all'app vecchia («la raffica» e «altre cose») | reg le divide in errori / specifica non fatta / scelte da valutare |
| P-6 | Approvare l'elenco dei percorsi della demo (proposta in DA_FARE) | o3, o2 |
| P-7 | Dire quale codice è online: il lotto 0 include il pulsante «Installa l'app» e il logo (commit 587f1a6 e 5e66bb4)? | reg aggiorna il lotto 0 |

## In corso

| # | Cosa | Chi |
|---|---|---|
| — | — | — |

## Da fare

| # | Cosa | Chi | Criterio |
|---|---|---|---|
| P-10 | Prove sulle regole di sicurezza con l'emulatore (Firestore e Storage): isolamento fra ASP, eventi solo dell'autore, letture pubbliche solo branding e flag di accesso | o2 | 1 |
| P-11 | Prove del trigger e del replay: stesso codice da due dispositivi offline, evento in ritardo, idempotenza, void, relabel | o2 | 2 |
| P-12 | Verificare la scelta D25 di Emergent (evento vietato su codice sconosciuto non crea il pezzo) contro SPEC §9.2 e proporre | o2 → reg decide | 4 |
| P-13 | Lavori programmati provati a mano sugli emulatori (dailyChecks, nightlyRecount, monthlyReports, graceExpiry) | o2 | 2 |
| P-14 | Funzioni bloccanti (`beforeCreate`/`beforeSignIn`) con Identity Platform vero: preparare la prova, il committente la esegue | o2 + committente | 3 |
| P-15 | Controllo che ogni ricerca con più filtri abbia un indice in `firestore.indexes.json` | o2 | 3 |
| P-20 | Raffica: contatore ed elenco ben visibile delle letture appena fatte nella schermata di scansione (come nell'app vecchia); prima la stima | o3 | 3 |
| P-21 | Lettura con la fotocamera su telefoni veri (Android: motore nativo; iPhone: zxing): preparare la prova guidata, il committente la esegue sui telefoni | o3 + committente | 3 |
| P-22 | Foto con la coda senza rete, da capo a fondo, con l'emulatore Storage | o3 (schermata) + o2 (`attachPhotos`) | 2 |
| P-23 | Prove end-to-end (Playwright) dei percorsi della demo sugli emulatori | o3 | 3 |
| P-30 | Procedura di pubblicazione a lotti per il committente, con uno script che controlla ogni passo | reg (procedura) + o2 (script in `scripts/`) | 2 |
| P-31 | Documentazione per l'utente e per il collaudo della demo | reg | 3 |

## Fatto

| # | Cosa | Chi | Quando |
|---|---|---|---|
| P-40 | Documenti del metodo (CLAUDE, REGISTRO, PIANO, DA_FARE), copie di lavoro o2 e o3, nota sulla cartella spostata | reg | 29/10/2026 |
| P-41 | Verifica del trasloco della cartella (git, build, account Firebase per cartella) | reg + committente | 29/10/2026 |

## Più avanti (non in questa fase)

Risposte mancanti del cliente (PASSAGGIO_DI_CONSEGNE §5); estensione Trigger Email per gli inviti veri; App Check; MFA e accessi Google/Microsoft con provider veri; un progetto Firebase definitivo al posto dell'escamotage; app da store con Capacitor; divisione del bundle (avviso sopra 500 kB); scollegare Google Analytics dal progetto (facoltativo).
