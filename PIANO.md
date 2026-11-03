# PIANO di SwapTrack

L'unico documento con lo stato dei lavori. Lo scrive la memoria storica. Il dettaglio di ogni voce (cosa, misura, opzioni, stima) è in `DA_FARE.md`, con lo stesso numero.
Stati: **aspetta il committente** · **in corso** · **da fare** · **fatto**. Dentro ogni gruppo, l'ordine è la priorità (criteri).

## Lotti pubblicati

| Lotto | Data | Cosa | Commit |
|---|---|---|---|
| 1 | 02/11/2026 | Riparazioni di riservatezza (documenti riscrivibili, listEvents, forceState/correctEventLocation, ruoli oltre la matrice, Storage), trigger riparato (spedizioni e resi), chiamate con campi vuoti (DDT ed export), DDT nella schermata di lettura, «Smista» giusto, cache offline all'accesso, BOM, resoconto mensile completo ed export leggibile, file privati con getBlob, avvisi, indice dei resi. Pubblicato con `deployBatch.mjs --yes`: tutti i controlli verdi, otto router raggiungibili | e4a053b |
| 0 | 29/10/2026 | Codice di Emergent più le correzioni locali (indici, installazione, logo), su https://swaptrack-demo.web.app (progetto `kronos-caffe-sito`) | 5e66bb4 (confermato dal committente il 30/10: logo e pulsante «Installa» sono online) |

## Aspetta il committente

| # | Cosa | Chi poi |
|---|---|---|
| P-2 | Cambiare la password degli account demo prima di condividere l'indirizzo oltre il consulente (oggi è scritta nel repository: README e `memory/test_credentials.md`) | committente in console; poi reg toglie la password dai documenti |
| P-3 | Via alla pulizia dei residui di Emergent: `memory/`, `test_result.md`, `test_reports/`, `tests/__init__.py` | reg (documenti) e o2 (`tests/__init__.py`) |
| P-4 | Elenco delle differenze notate rispetto all'app vecchia («la raffica» e «altre cose») | reg le divide in errori / specifica non fatta / scelte da valutare |
| P-50 | Dire se nella demo online ha caricato documenti (BOM o DDT) come `client_admin`: nascevano senza ASP (P-49). Se sì, lo script `scripts/fixDocumentAsp.mjs` è pronto (solo elenco di default, `--apply` dopo aver visto l'elenco; comandi in REGISTRO) | committente |

## In corso

| # | Cosa | Chi |
|---|---|---|
| P-23 | Prove end-to-end: secondo giro (12,9 min) 14 verdi, 5 rosse. Dimostrati: export Excel (P-61) e creazione del DDT. Rosse: DDT non offerto nella schermata di lettura (P-24, sul ramo); ricerca del pezzo, void della raffica, percorso 3 ×2 instabili fra un giro e l'altro (sospetto: macchina carica; da escludere un difetto della cache di Firestore). Giro dei soli percorsi 2 e 3 con l'altro progetto fermo (30/10): 4 rosse su 4, quindi NON è l'ambiente: causa trovata da o3: il seed completo fa girare nell'emulatore circa 10.000 trigger in fila per tutto il giro, e gli eventi delle prove aspettano dietro (P-71). Online non succede. P-24 verde nella parte nuova | o3 |
| P-22 | Foto scattate senza rete, da capo a fondo: parte server fatta (51d5391, verde; JPEG con GPS c328954); parte schermata di o3 | o3 |
| P-87 | Telefono condiviso (D-40). **a)** «Esci da tutti i dispositivi» e «Esci» dell'informativa nuova saltavano il blocco dell'uscita con letture o foto in coda (SPEC riga 201); la coda foto partiva prima del controllo del proprietario (foto di un altro utente caricate e lasciate orfane). Prima della demo. **b)** Dopo un'uscita forzata, se entra un altro utente le letture e foto non inviate del precedente si perdono senza avviso: avviso con due scelte. Dopo la demo; intanto nella guida | o3 |
| P-59 | Pezzo extra trovato in un altro reso: lato server su main (3f26623); resta da mostrarlo nella pagina della spedizione | o3 |
| P-30 | `scripts/deployBatch.mjs` pronto (senza `--yes` solo controlli; con `--yes` pubblica e verifica gli invoker); prima prova: il giro «solo controlli» del committente | o2 + reg + committente |
| P-89 | (C1) Scarico di export, resoconti e foto online con getBlob: probabilmente manca la regola CORS del bucket Storage. `scripts/storage-cors.json` pronto (57753c4), comando nel README; prima il committente prova l'export online; poi lancia lui il comando gcloud | o2 + committente |
| P-92 | (S3) Righe BOM con direzione obbligatoria (SPEC §11.2): il server oggi le accetta senza, il tecnico vede la BOM vuota. Server pronto sul ramo o2-p92 (codice nuovo `bom_direction_required`), esce con la pagina di o3 | o2 + o3 |
| P-96 | (A1, A2, A9) Testi grezzi nella Home dell'ufficio cliente, in Anomalie ed Esportazioni; tre errori del server senza traduzione; foto del DDT non compressa | o3 |
| P-97 | (A3) Magazzino cliente: menu Documenti gira all'infinito (ricerca negata dalle regole); filtro per tipo (o3) e indice (o2) | o3 + o2 |
| P-98 | (A4) Raffica col telefono vero: lo stesso pezzo può registrarsi due volte se la fotocamera resta sul codice | o3 |
| P-99 | (A5) Resoconti: l'ufficio cliente non vede né genera il resoconto di un'ASP | o3 |
| P-103 | (A10) L'avviso del reso apre il DDT invece della spedizione, con pulsanti che il server rifiuta | o3 |
| P-100 | (A6) Nomi al posto degli id (luoghi, ASP, categorie, da/a) in varie pagine; da controllare anche per il criterio 1 (id di un'altra ASP visibile) | o3 |
| P-102 | (A8, SPEC §10) In «Smista» la categoria suggerita si conferma con un tocco o se ne sceglie un'altra | o3 |
| P-101 | (A7) Pezzi: i filtri del cruscotto sono ignorati; mancano ricerca per sito e modello (§13.1, §13.2) | o3 |
| P-104 | (A11) Arrivo col DDT: finestra del modello anche per pezzi del DDT; il DDT compare solo dopo aver scelto «Nuovo» | o3 |
| P-94 | (S5) Storia del pezzo con organizzazione e ruolo (§13.2), mai il nome della persona | o2 + o3 |
| P-95 | (S6) Avviso del DDT controllato con l'elenco dei seriali (§11.4) | o2 + o3 |
| P-105 | (A12) Caricare il DDT come file o foto (§12.2, mappatura Excel §11.2): per ultimo, salvo decisione del committente | o3 |
| P-77 | `watchShipments` per un'ASP ascolta in diretta due ricerche senza limite: aggiungere un limite o una paginazione | o3 |
| P-78 | (diagnosi del 02/11: a utente singolo una lettura subito dopo l'accesso va «Inviata» in 2 s; i blocchi lunghi erano il carico delle prove) Caricamento a pagine fatto; misura «Inviata entro 10 s» su main (d544338). Da misurare su un telefono vero col progetto vero (P-21) | o3 |

## Da fare

| # | Cosa | Chi | Criterio |
|---|---|---|---|
| P-21 | Lettura con la fotocamera su telefoni veri (Android: motore nativo; iPhone: zxing): preparare la prova guidata, il committente la esegue sui telefoni | o3 + committente | 3 |
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
| P-75 | Esportazioni e resoconti scaricati con `getBlob`, non con indirizzi aperti (D-35); la parte delle foto va con P-70 | o3 | 02/11/2026 (ea09bb8, lotto 1) |
| P-68 | Foto (server): agganciate anche in grazia, anche prima che il trigger elabori l'evento, senza sostituire le precedenti | o2 | 30/10/2026 (59f58df, lotto 1) |
| P-25 | Categoria suggerita anche in «Arrivo» di materiale smontato, «Smista nello stesso passaggio» (D-27); suggerimento anche alla prima lettura (le regole di smistamento arrivavano dopo la lettura, anche in «Smista») | o3 | 03/11/2026 (40075fb, 40f0cc5) |
| P-86 | Materiale nuovo mai «smistato» da un arrivo con categoria (D-39): server e app | o2 + o3 | 03/11/2026 (811f995, 40f0cc5) |
| P-70 | Pagina del pezzo con le sue foto (SPEC §13.2, D-32), lette con getBlob (D-35) | o3 | 03/11/2026 (d155dc3, 540788e) |
| P-90 | Il numero di pezzi della spedizione cresce solo alla prima lettura del pezzo (3 rosse prima) | o2 | 03/11/2026 (e50f90e) |
| P-91 | «Annulla l'ultima» in un reso o trasferimento toglie la riga e fa scendere il conteggio; riga già confermata o arrivata resta | o2 | 03/11/2026 (9eeba8a) |
| P-93 | Rilettura di un pezzo nella stessa spedizione senza anomalia (D-41) | o2 | 03/11/2026 (6bcee66) |
| P-14 | Funzioni bloccanti sul progetto vero: registrate in europe-west1; `checkBlocking.mjs` tre OK (attivo entra, disattivato respinto da beforeSignIn, registrazione da soli respinta da beforeCreate); tecnico di Sud riattivato | committente | 03/11/2026 |
| P-1 | Sito Hosting predefinito `kronos-caffe-sito.web.app` (vecchio sito del bar) spento con `firebase hosting:disable`; in incognito non si apre più | committente | 03/11/2026 |
| P-88 | Controlli del committente online sul lotto 1: accesso come magazziniere Nord dal PC senza blocchi, dati per lavorare offline scaricati; indice `shipments (kind, createdAt desc)` abilitato | committente | 03/11/2026 |
| P-85 | Accesso non più fermo su «Caricamento…»: la cache parte dopo profilo e informativa, e dopo 8 s la schermata si apre comunque (informativa obbligatoria rispettata) | o3 | 02/11/2026 (3ef1bbb) |
| P-84 | `scripts/setDemoPassword.mjs` (password nuova a tutti gli account demo, nascosta, mai salvata) e seed che non la rimette sul progetto vero | o2 | 02/11/2026 (3e54adf) |
| P-82 | `deployBatch.mjs --yes` salta il giro delle prove già superato sullo stesso commit (24 ore); git, installazione e build sempre | o2 | 02/11/2026 (893679a) |
| P-69 | Foto non più «perse» per la rete: solo errori permanenti, contati al più uno ogni 15 minuti; una sola coda alla volta | o3 | 02/11/2026 (5bd81f6, 2aa2968) |
| P-81 | Pagina Esportazioni con tutti i filtri della specifica (sito/magazzino, modello, ASP, categoria, periodo) | o3 | 02/11/2026 (9ce5040) |
| P-79 | Resoconti ed export: difetti riparati (letture annullate, resi delle ASP, periodo, categoria, colonne leggibili con il codice a barre); filtri nuovi nella pagina: o3 | o2 | 02/11/2026 (b0266df) |
| P-80 | Resoconto mensile completo come SPEC §13.4 (D-38) | o2 | 02/11/2026 (b0266df) |
| P-24 | DDT nella schermata di lettura: scelta del DDT aperto, arrivati/mancanti/inattesi in diretta (SPEC §12.2, D-15) | o3 | 02/11/2026 (e57e0ed) |
| P-53 | «Smista»: ogni pezzo riceve la propria categoria suggerita | o3 | 02/11/2026 |
| P-60 | Avvisi aperti senza differenze «Nessuna differenza ora»; il tecnico non ascolta più gli avvisi | o3 | 02/11/2026 |
| P-72 | Pagina del documento aggiornata dopo «Segna verificato» | o3 | 02/11/2026 |
| P-73 | Cache offline caricata all'accesso e alla ripresa, con i modelli (D-34: «aggiornati» quando è pronta) | o3 | 02/11/2026 |
| P-74 | E2E dei percorsi 4, 1, 7 (verdi sul ramo completo) | o3 | 02/11/2026 |
| P-76 | Le direzioni delle righe BOM non si perdono al risalvataggio | o3 | 02/11/2026 |
| P-71 | Seed in due fasi (`emulators.mjs --seed`): niente trigger in coda; giro e2e da 12,9 a 3,6 minuti, rosse instabili sparite | o2 | 02/11/2026 (commit f6c3a1b) |
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
