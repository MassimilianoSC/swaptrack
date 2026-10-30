# PIANO di SwapTrack

L'unico documento con lo stato dei lavori. Lo scrive la memoria storica. Il dettaglio di ogni voce (cosa, misura, opzioni, stima) è in `DA_FARE.md`, con lo stesso numero.
Stati: **aspetta il committente** · **in corso** · **da fare** · **fatto**. Dentro ogni gruppo, l'ordine è la priorità (criteri).

## Lotti pubblicati

| Lotto | Data | Cosa | Commit |
|---|---|---|---|
| 0 | 29/10/2026 | Codice di Emergent più le correzioni locali (indici, installazione, logo), su https://swaptrack-demo.web.app (progetto `kronos-caffe-sito`) | 5e66bb4 (confermato dal committente il 30/10: logo e pulsante «Installa» sono online) |

## Aspetta il committente

| # | Cosa | Chi poi |
|---|---|---|
| P-1 | Spegnere il sito Hosting predefinito `kronos-caffe-sito.web.app` (vecchio sito del bar): `cd C:\Users\mcracchiolo\Desktop\swaptrack` poi `firebase hosting:disable --site kronos-caffe-sito --project demo` | committente |
| P-2 | Cambiare la password degli account demo prima di condividere l'indirizzo oltre il consulente (oggi è scritta nel repository: README e `memory/test_credentials.md`) | committente in console; poi reg toglie la password dai documenti |
| P-3 | Via alla pulizia dei residui di Emergent: `memory/`, `test_result.md`, `test_reports/`, `tests/__init__.py` | reg (documenti) e o2 (`tests/__init__.py`) |
| P-4 | Elenco delle differenze notate rispetto all'app vecchia («la raffica» e «altre cose») | reg le divide in errori / specifica non fatta / scelte da valutare |
| P-50 | Dire se nella demo online ha caricato documenti (BOM o DDT) come `client_admin`: nascevano senza ASP (P-49) e restano invisibili alle ASP; se sì, o2 prepara uno script che li elenca e li sistema dal luogo (lo lancia il committente) | o2 |

## In corso

| # | Cosa | Chi |
|---|---|---|
| P-10 | Prove sulle regole di sicurezza: parte Firestore fatta (tutte verdi, nessuna falla, quattro regole troppo strette corrette); parte Storage in scrittura, con le due strette di D-25, da lanciare al turno degli emulatori | o2 |
| P-23 | Prove end-to-end (Playwright): impianto e percorsi 6, 5, raffica e parte DDT del 2 scritti; primo giro da lanciare col turno degli emulatori (rosse/verdi da dimostrare) | o3 |
| P-24 | DDT nella schermata di lettura (lacuna della specifica §12.2, D-15): scelta del DDT aperto, `payload.ddtId`, riquadro in diretta arrivati/mancanti/inattesi | o3 |
| P-52 | Difetto riparato da o2 (commit locale 96f4363, da portare su main col turno): il resoconto chiesto dal cliente usciva sempre col mese precedente (ottobre → «2026-09», sovrascrivendo il file di settembre); il lavoro mensile sbagliava solo a gennaio («2027-00»). Funzione pura `reportMonth.ts` con prove | o2 |
| P-51 | Script degli emulatori: `FUNCTIONS_DISCOVERY_TIMEOUT=60` (D-26) e modalità `--run "<comando>"` che avvia, esegue, chiude per PID e verifica le porte; poi le e2e e le prove con emulatori girano solo così | o2 |
| P-49 | Difetto (o2, da confermare con una prova rossa): i documenti caricati dai ruoli cliente nascono con `aspId` nullo (l'app non lo manda, il server non lo ricava dal luogo): l'ASP non vede la BOM del suo sito né il DDT del suo magazzino, niente avviso BOM, `expectedCodes` senza ASP, file sotto `documents/client/…`. Rimedio: `aspId` sempre dal luogo, per tutti i ruoli | o2 |
| P-48 | Probabile difetto (o3, da confermare con una prova rossa di o2): `compareDocument` conta anche gli eventi annullati (`voided`) per `ddt_in` e `bom`: un arrivo annullato resta «arrivato» o «inatteso» e l'avviso del DDT è sbagliato; rimedio: filtrare `voided` come fa il replay | o2 |

## Da fare

| # | Cosa | Chi | Criterio |
|---|---|---|---|
| P-11 | Prove del trigger e del replay: stesso codice da due dispositivi offline, evento in ritardo, idempotenza, void, relabel | o2 | 2 |
| P-13 | Lavori programmati provati a mano sugli emulatori (dailyChecks, nightlyRecount, monthlyReports, graceExpiry) | o2 | 2 |
| P-14 | Funzioni bloccanti (`beforeCreate`/`beforeSignIn`) con Identity Platform vero: preparare la prova, il committente la esegue | o2 + committente | 3 |
| P-21 | Lettura con la fotocamera su telefoni veri (Android: motore nativo; iPhone: zxing): preparare la prova guidata, il committente la esegue sui telefoni | o3 + committente | 3 |
| P-22 | Foto con la coda senza rete, da capo a fondo, con l'emulatore Storage | o3 (schermata) + o2 (`attachPhotos`) | 2 |
| P-44 | Letture dell'app negate a ragione dalle regole: coperte dal commit 9a47902 di o3 (luoghi per ambito, resi del magazzino cliente, anomalie solo per chi le legge); resta da confermare col primo giro delle e2e | o3 | 1 |
| P-43 | Pagina del pezzo: la categoria di smistamento compare come id grezzo (`cat_refurbish`) invece dell'etichetta («Ricondizionamento»); difetto, niente via | o3 | 3 |
| P-25 | Categoria suggerita anche in modalità «Arrivo» (SPEC §12.2: smistare nello stesso passaggio); oggi appare solo in «Smista»; stima da chiedere a o3 dopo P-24 | o3 | 4 |
| P-45 | `ARCHITECTURE.md` elenca solo le collezioni del passo 2: completare con items, codes, anomalie, documenti, spedizioni, alert, aggregati, report, export, expectedCodes, documentMappings | o2 | 5 |
| P-30 | Procedura di pubblicazione a lotti per il committente, con uno script che controlla ogni passo | reg (procedura) + o2 (script in `scripts/`) | 2 |
| P-31 | Documentazione per l'utente e per il collaudo della demo | reg | 3 |

## Fatto

| # | Cosa | Chi | Quando |
|---|---|---|---|
| P-12 | Scelta D25 verificata contro SPEC §9.2: si tiene (D-19), nessuna modifica | o2 | 30/10/2026 |
| P-6 | Percorsi della demo approvati dal committente (D-24): i sette di DA_FARE | committente | 30/10/2026 |
| P-7 | Il lotto 0 online corrisponde al commit 5e66bb4 (logo e pulsante «Installa» presenti) | committente | 30/10/2026 |
| P-47 | Porte dedicate degli emulatori (D-21) e server di sviluppo sulla 3010 (D-22), una sola fonte per ciascuna (`firebase.json`, `vite.config.ts`) | o2 + o3 | 30/10/2026 (commit 9e2a728, d21fb8f, cf2eefe, f8ec635) |
| P-46 | `scripts/emulators.mjs`: avvio degli emulatori con `--only` e chiusura dei Java orfani (netstat italiano compreso); porte lette da `firebase.json` da tutti gli script | o2 | 30/10/2026 (commit 9e2a728) |
| P-15 | Indici: una ricerca senza indice (resi del magazzino cliente) corretta; prova pura sugli indici che fissa la trappola (D-20); l'indice va pubblicato col lotto 1 | o2 | 30/10/2026 (commit e1c32c7) |
| P-16 | Riparazione del trigger: tutte le letture prima delle scritture nella transazione; spedizioni e resi si riempiono di righe; anomalie senza duplicati. Quattro prove rosse prima, verdi dopo | o2 | 29/10/2026 (commit 0bda4f2) |
| P-20 | Raffica: contatore ed elenco delle letture sotto la fotocamera (opzione 1, D-11); l'aspetto lo giudica il committente al prossimo lotto | o3 | 29/10/2026 (commit 097c115) |
| P-42 | Riparazioni trovate strada facendo da o3: pagina del pezzo senza stato d'errore, ricerca silenziosa, lettura annullata nell'elenco di oggi, 18 traduzioni mancanti nelle Impostazioni | o3 | 29/10/2026 |
| P-40 | Documenti del metodo (CLAUDE, REGISTRO, PIANO, DA_FARE), copie di lavoro o2 e o3, nota sulla cartella spostata | reg | 29/10/2026 |
| P-41 | Verifica del trasloco della cartella (git, build, account Firebase per cartella) | reg + committente | 29/10/2026 |

## Più avanti (non in questa fase)

**AI nell'app (30/10/2026, parere del committente):** integrarla non è difficile né vietato (Vertex AI in regione europea, Google unico subfornitore, nessun addestramento sui dati: compatibile con R12); la parte difficile è decidere **dove e cosa farle fare**. Decisione del committente, da riprendere quando vuole; il punto di innesto nel codice esiste (`src/lib/documents/extract.ts`, spento). Candidati finora: lettura automatica di DDT e BOM da PDF o foto; spiegazione in parole semplici di anomalie e differenze; lettura di etichette rovinate dalla foto. Resta aperta la domanda al cliente sulle sue regole per l'AI.

Risposte mancanti del cliente (PASSAGGIO_DI_CONSEGNE §5); estensione Trigger Email per gli inviti veri; App Check; MFA e accessi Google/Microsoft con provider veri; un progetto Firebase definitivo al posto dell'escamotage; app da store con Capacitor; divisione del bundle (avviso sopra 500 kB); scollegare Google Analytics dal progetto (facoltativo).
