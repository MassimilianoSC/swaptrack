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
| P-50 | Dire se nella demo online ha caricato documenti (BOM o DDT) come `client_admin`: nascevano senza ASP (P-49). Se sì, lo script `scripts/fixDocumentAsp.mjs` è pronto (solo elenco di default, `--apply` dopo aver visto l'elenco; comandi in REGISTRO) | committente |

## In corso

| # | Cosa | Chi |
|---|---|---|
| P-23 | Prove end-to-end (Playwright): impianto e percorsi 6, 5, raffica e parte DDT del 2 scritti; primo giro da lanciare col turno degli emulatori (rosse/verdi da dimostrare) | o3 |
| P-24 | DDT nella schermata di lettura (lacuna della specifica §12.2, D-15): scelta del DDT aperto, `payload.ddtId`, riquadro in diretta arrivati/mancanti/inattesi | o3 |
| P-25 | Categoria suggerita anche in «Arrivo» di materiale smontato, con interruttore «Smista nello stesso passaggio» spento per difetto (D-27): costruita (commit e04467c sul ramo `o3-wip-p24`), da portare su main col giro e2e | o3 |
| P-53 | Difetto riparato da o3 (commit b916c1b sul ramo, criterio 2): in «Smista» l'evento usava la categoria suggerita del pezzo PRECEDENTE (prima lettura senza evento, dalla seconda categoria sbagliata); prova: e2e del percorso 3, rossa sul codice di prima, da dimostrare col giro | o3 |
| P-13 | Lavori programmati: prove scritte (commit locale a33d9e4), da lanciare al prossimo turno | o2 |
| P-54 | Difetti di `runNightlyRecount` (criterio 2, produzione): lotto riusato dopo il commit (con circa dieci ASP il ricalcolo notturno si fermerebbe ogni notte) e ambiti svuotati con conteggi vecchi; riparati, da dimostrare al turno | o2 |
| P-55 | `runGraceExpiry` segna `authDisabled` anche se la disattivazione dell'account fallisce, e non ci riprova più (criterio 1); riparazione con prova pura (Auth finto) | o2 |
| P-56 | (scritto, da lanciare al turno) Reso (percorso 4): una seconda conferma (o un doppio clic) riconferma anche le righe già confermate e apre un'anomalia per ogni pezzo già reso; `missing` accetta id che non sono righe. Riparazione lato server | o2 |
| P-57 | (scritto, da lanciare al turno) Percorso 1: il `site_done` fa il controllo BOM prima che le letture offline arrivate insieme siano elaborate → avviso BOM falso. Il controllo aspetta gli eventi del sito, con ripetizione limitata | o2 |
| P-58 | Avvisi aggiornati anche al ribasso (D-29, BOM, fermo, reso, trasferimento, DDT d'arrivo); data di creazione dell'avviso di materiale fermo conservata. Scritti, da lanciare al turno | o2 |
| P-60 | Pagina degli avvisi e contatore: un avviso aperto con `count: 0` si mostra «nessuna differenza ora», neutro, fuori dal conteggio | o3 |
| P-59 | Pezzo extra trovato in un altro reso: la riga di quel reso marcata «confermata altrove» (SPEC §9.2, D-30, stima 1 ora); poi o3 la mostra | o2, poi o3 |
| P-14 | Funzioni bloccanti con Identity Platform vero: `scripts/checkBlocking.mjs` pronto (sei passi per il committente, in REGISTRO); da eseguire dopo il lotto 1 | committente |
| P-30 | `scripts/deployBatch.mjs` pronto (senza `--yes` solo controlli; con `--yes` pubblica e verifica gli invoker); prima prova: il giro «solo controlli» del committente | o2 + reg + committente |

## Da fare

| # | Cosa | Chi | Criterio |
|---|---|---|---|
| P-21 | Lettura con la fotocamera su telefoni veri (Android: motore nativo; iPhone: zxing): preparare la prova guidata, il committente la esegue sui telefoni | o3 + committente | 3 |
| P-22 | Foto con la coda senza rete, da capo a fondo, con l'emulatore Storage | o3 (schermata) + o2 (`attachPhotos`) | 2 |
| P-44 | Letture dell'app negate a ragione dalle regole: coperte dal commit 9a47902 di o3 (luoghi per ambito, resi del magazzino cliente, anomalie solo per chi le legge); resta da confermare col primo giro delle e2e | o3 | 1 |
| P-31 | Documentazione per l'utente e per il collaudo della demo | reg | 3 |

## Fatto

| # | Cosa | Chi | Quando |
|---|---|---|---|
| P-12 | Scelta D25 verificata contro SPEC §9.2: si tiene (D-19), nessuna modifica | o2 | 30/10/2026 |
| P-10 | Prove sulle regole di sicurezza Firestore e Storage: tutte verdi; nessuna falla nelle regole Firestore; due strette su Storage (D-25, D-28) | o2 | 30/10/2026 (commit 17e4a88, 3e24041) |
| P-11 | Prove del trigger e del replay (due telefoni, ritardo, doppia consegna, void, relabel, altra ASP): verdi anche sul codice di prima, nessun difetto | o2 | 30/10/2026 (commit 3e24041) |
| P-48 | Eventi annullati esclusi dai confronti DDT e BOM | o2 | 30/10/2026 (commit 3e24041) |
| P-49 | `aspId` dei documenti sempre dal luogo; riparate anche due falle del criterio 1 (documento altrui riscrivibile, DDT agganciato a spedizione altrui) | o2 | 30/10/2026 (commit 3e24041) |
| P-45 | ARCHITECTURE.md completo (funzioni, collezioni, Storage, indici) | o2 | 30/10/2026 (commit 3e24041) |
| P-51 | `emulators.mjs --run`, timeout delle funzioni (D-26), chiusura per PID; avvio delle funzioni più veloce | o2 | 30/10/2026 (commit 8963bd9) |
| P-52 | Mese giusto nei resoconti (prima ottobre usciva come settembre e lo sovrascriveva) | o2 | 30/10/2026 (commit 8963bd9) |
| P-43 | Pagina del pezzo: categoria di smistamento col nome invece dell'id (la e2e del percorso 3 confermava il difetto: corretta) | o3 | 30/10/2026 (commit ac804e5) |
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
