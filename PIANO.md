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
| P-10 | Prove sulle regole di sicurezza: parte Firestore fatta (tutte verdi, nessuna falla, quattro regole troppo strette corrette); resta la parte Storage (dettaglio nelle consegne di o2, REGISTRO) | o2 |
| P-23 | Prove end-to-end (Playwright): impianto e percorsi 6, 5, raffica e parte DDT del 2 scritti; primo giro da lanciare col turno degli emulatori (rosse/verdi da dimostrare) | o3 |
| P-24 | DDT nella schermata di lettura (lacuna della specifica §12.2, D-15): scelta del DDT aperto, `payload.ddtId`, riquadro in diretta arrivati/mancanti/inattesi | o3 |
| P-12 | Verifica della scelta D25 contro SPEC §9.2 (sola lettura, nelle attese) | o2 |
| P-15 | Controllo degli indici (sola lettura, nelle attese) | o2 |

## Da fare

| # | Cosa | Chi | Criterio |
|---|---|---|---|
| P-11 | Prove del trigger e del replay: stesso codice da due dispositivi offline, evento in ritardo, idempotenza, void, relabel | o2 | 2 |
| P-13 | Lavori programmati provati a mano sugli emulatori (dailyChecks, nightlyRecount, monthlyReports, graceExpiry) | o2 | 2 |
| P-14 | Funzioni bloccanti (`beforeCreate`/`beforeSignIn`) con Identity Platform vero: preparare la prova, il committente la esegue | o2 + committente | 3 |
| P-21 | Lettura con la fotocamera su telefoni veri (Android: motore nativo; iPhone: zxing): preparare la prova guidata, il committente la esegue sui telefoni | o3 + committente | 3 |
| P-22 | Foto con la coda senza rete, da capo a fondo, con l'emulatore Storage | o3 (schermata) + o2 (`attachPhotos`) | 2 |
| P-44 | Letture dell'app che le regole negano a ragione (trovate dalle prove di o2): `watchShipments` per `client_warehouse` senza il filtro `kind == "return"`; `watchAnomalies` sottoscritta anche da `client_warehouse`, che non ha diritto di lettura; verificare che nessun ruolo ASP chiami `listLocations()`/`listOrganizations()` senza filtri. Difetti, niente via | o3 | 1 |
| P-43 | Pagina del pezzo: la categoria di smistamento compare come id grezzo (`cat_refurbish`) invece dell'etichetta («Ricondizionamento»); difetto, niente via | o3 | 3 |
| P-25 | Categoria suggerita anche in modalità «Arrivo» (SPEC §12.2: smistare nello stesso passaggio); oggi appare solo in «Smista»; stima da chiedere a o3 dopo P-24 | o3 | 4 |
| P-45 | `ARCHITECTURE.md` elenca solo le collezioni del passo 2: completare con items, codes, anomalie, documenti, spedizioni, alert, aggregati, report, export, expectedCodes, documentMappings | o2 | 5 |
| P-30 | Procedura di pubblicazione a lotti per il committente, con uno script che controlla ogni passo | reg (procedura) + o2 (script in `scripts/`) | 2 |
| P-31 | Documentazione per l'utente e per il collaudo della demo | reg | 3 |

## Fatto

| # | Cosa | Chi | Quando |
|---|---|---|---|
| P-16 | Riparazione del trigger: tutte le letture prima delle scritture nella transazione; spedizioni e resi si riempiono di righe; anomalie senza duplicati. Quattro prove rosse prima, verdi dopo | o2 | 29/10/2026 (commit 0bda4f2) |
| P-20 | Raffica: contatore ed elenco delle letture sotto la fotocamera (opzione 1, D-11); l'aspetto lo giudica il committente al prossimo lotto | o3 | 29/10/2026 (commit 097c115) |
| P-42 | Riparazioni trovate strada facendo da o3: pagina del pezzo senza stato d'errore, ricerca silenziosa, lettura annullata nell'elenco di oggi, 18 traduzioni mancanti nelle Impostazioni | o3 | 29/10/2026 |
| P-40 | Documenti del metodo (CLAUDE, REGISTRO, PIANO, DA_FARE), copie di lavoro o2 e o3, nota sulla cartella spostata | reg | 29/10/2026 |
| P-41 | Verifica del trasloco della cartella (git, build, account Firebase per cartella) | reg + committente | 29/10/2026 |

## Più avanti (non in questa fase)

Risposte mancanti del cliente (PASSAGGIO_DI_CONSEGNE §5); estensione Trigger Email per gli inviti veri; App Check; MFA e accessi Google/Microsoft con provider veri; un progetto Firebase definitivo al posto dell'escamotage; app da store con Capacitor; divisione del bundle (avviso sopra 500 kB); scollegare Google Analytics dal progetto (facoltativo).
