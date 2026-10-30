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
| P-23 | Prove end-to-end: secondo giro (12,9 min) 14 verdi, 5 rosse. Dimostrati: export Excel (P-61) e creazione del DDT. Rosse: DDT non offerto nella schermata di lettura (P-24, sul ramo); ricerca del pezzo, void della raffica, percorso 3 ×2 instabili fra un giro e l'altro (sospetto: macchina carica; da escludere un difetto della cache di Firestore). Giro dei soli percorsi 2 e 3 con l'altro progetto fermo (30/10): 4 rosse su 4, quindi NON è l'ambiente: causa trovata da o3: il seed completo fa girare nell'emulatore circa 10.000 trigger in fila per tutto il giro, e gli eventi delle prove aspettano dietro (P-71). Online non succede. P-24 verde nella parte nuova | o3 |
| P-24 | DDT nella schermata di lettura (lacuna della specifica §12.2, D-15): scelta del DDT aperto, `payload.ddtId`, riquadro in diretta arrivati/mancanti/inattesi | o3 |
| P-25 | Categoria suggerita anche in «Arrivo» di materiale smontato, con interruttore «Smista nello stesso passaggio» spento per difetto (D-27): costruita (commit e04467c sul ramo `o3-wip-p24`), da portare su main col giro e2e | o3 |
| P-53 | Difetto riparato da o3 (commit b916c1b sul ramo, criterio 2): in «Smista» l'evento usava la categoria suggerita del pezzo PRECEDENTE (prima lettura senza evento, dalla seconda categoria sbagliata); prova: e2e del percorso 3, rossa sul codice di prima, da dimostrare col giro | o3 |
| P-60 | Avvisi aperti con `count: 0` mostrati «Nessuna differenza ora», neutri e fuori dal contatore; il contatore non si iscrive più agli avvisi per il tecnico (difetto delle tracce). Fatto sul ramo `o3-avvisi` (311cbc8), da portare su main dopo il giro; aspetto da giudicare | o3 |
| P-59 | Pezzo extra trovato in un altro reso: lato server su main (3f26623); resta da mostrarlo nella pagina della spedizione | o3 |
| P-14 | Funzioni bloccanti con Identity Platform vero: `scripts/checkBlocking.mjs` pronto (sei passi per il committente, in REGISTRO); da eseguire dopo il lotto 1 | committente |
| P-30 | `scripts/deployBatch.mjs` pronto (senza `--yes` solo controlli; con `--yes` pubblica e verifica gli invoker); prima prova: il giro «solo controlli» del committente | o2 + reg + committente |
| P-71 | Seed completo sugli emulatori: spegnere i trigger durante la scrittura e riaccenderli dopo (causa delle rosse instabili delle e2e) | o2 |
| P-72 | Difetto (o3, riparato sul ramo, commit 7486d65): la pagina del documento non rileggeva lo stato dopo «Segna controllato» | o3 |
| P-68 | Foto (server, o2): `attachPhotos` accetta l'utente in grazia (SPEC §4.8); foto arrivata prima dell'elaborazione dell'evento agganciata dal trigger; seconda tornata di foto aggiunta, non sostituita. Scritte, da provare al turno | o2 |
| P-69 | Foto (app, o3): «persa» solo per errori permanenti, contati al più uno ogni 15 minuti (un cambio di ruolo può dare `unauthorized` finché il token non si aggiorna), mai per la rete; un solo svuotamento alla volta. Sul ramo `o3-foto` | o3 |
| P-70 | Pagina del pezzo: sezione «Foto» con miniature (SPEC §13.2, D-32). Sul ramo `o3-foto`, e2e delle foto dopo P-68 | o3 |

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
| P-63 | Falle del criterio 1 nelle funzioni riparate e provate (listEvents, forceState, correctEventLocation, ruoli oltre la matrice), D-31 | o2 | 30/10/2026 (commit ce5beb9…7e2f59c) |
| P-64 | Nome dell'ASP nel resoconto mensile | o2 | 30/10/2026 |
| P-67 | `scripts/checkOnline.mjs` in sola lettura (provato sul seed: 0 eventi non elaborati, 0 documenti senza ASP) | o2 | 30/10/2026 |
| P-61 | Chiamate con campi facoltativi vuoti: riparate e dimostrate (export verde, DDT creato) | o3 | 30/10/2026 (commit 9c98fa7) |
| P-65 | «BOM» tolta dai tipi caricabili dal magazzino ASP; nessuna vista mostra uid di persone (R11, verificato) | o3 | 30/10/2026 (commit 506ee44) |
| P-66 | Risultati attesi del lotto 1, scritti in DA_FARE (P-30) | o2 + reg | 30/10/2026 |
| P-62 | Revisione della riservatezza delle 42 operazioni dei router e dei lavori programmati: 36 ok, i difetti in P-63 | o2 | 30/10/2026 |
| P-13 | Lavori programmati provati sull'emulatore (graceExpiry, retention, dailyChecks, nightlyRecount, monthlyReports) | o2 | 30/10/2026 (commit 3f26623) |
| P-54 | Ricalcolo notturno: regge con dieci ASP (lotto riusato) e corregge gli ambiti svuotati | o2 | 30/10/2026 (commit 3f26623) |
| P-55 | Scadenza della grazia: l'account viene segnato disattivato solo se Auth conferma | o2 | 30/10/2026 (commit 3f26623) |
| P-56 | Reso: seconda conferma senza anomalie, niente righe fantasma | o2 | 30/10/2026 (commit 3f26623) |
| P-57 | «Sito finito» offline senza avvisi BOM falsi (attesa limitata) | o2 | 30/10/2026 (commit 3f26623) |
| P-58 | Avvisi aggiornati al ribasso (D-29) con data di creazione conservata; righe DDT senza direzione scritte correttamente | o2 | 30/10/2026 (commit 3f26623) |
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
