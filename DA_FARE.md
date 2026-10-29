# DA FARE — dettaglio delle voci del piano

Senza stati né date (stanno in `PIANO.md`). Stesso numero del piano. Per ogni voce: cosa, come si misura, opzioni e note, stima (quando c'è).

## P-1 Spegnere il sito Hosting predefinito

**Cosa:** il progetto `kronos-caffe-sito` ha due siti Hosting: `swaptrack-demo` (l'app) e `kronos-caffe-sito` (il vecchio sito del bar). Il secondo va spento.
**Misura:** `https://kronos-caffe-sito.web.app` risponde «site disabled»; `https://swaptrack-demo.web.app` continua a funzionare.
**Note:** lo lancia il committente. Non tocca l'app.

## P-2 Password degli account demo

**Cosa:** la password comune degli account demo è scritta nel repository (README e `memory/test_credentials.md`). Prima di dare l'indirizzo ad altri: cambiarla in console (Authentication) per tutti gli account e togliere la password dai documenti (resta l'elenco degli account; la password la dà il committente a voce).
**Misura:** nessuna password nel repository (una ricerca del valore vecchio non trova nulla); accesso con la password nuova riuscito.
**Note:** cambiarla sul progetto vero è un'azione del committente; i seed sugli emulatori possono tenere una password locale qualsiasi.

## P-3 Pulizia dei residui di Emergent

**Cosa:** file dell'ambiente Emergent senza funzione qui: `memory/` (PRD e credenziali), `test_result.md` (protocollo dell'agente di prova di Emergent), `test_reports/` (vuota), `tests/__init__.py` (Python, inutile).
**Misura:** file rimossi dal repository; `yarn test` e `yarn build` invariati.
**Note:** `memory/PRD.md` è un riassunto storico: le informazioni che servono sono già in DECISIONS.md e NOT_DONE.md. Cancellazione col via del committente.

## P-4 Differenze rispetto all'app vecchia

**Cosa:** il committente elenca ciò che nota di diverso (già detto: la raffica, P-20; «altre cose» da elencare). La memoria storica divide ogni voce in: errore (si ripara senza via) / cosa della specifica non fatta (si fa) / scelta diversa da valutare (stima e via).
**Misura:** ogni voce ha una categoria e un numero nel piano.

## P-6 Percorsi della demo (proposta da approvare)

**Cosa:** l'elenco di ciò che il consulente vedrà. È la misura del criterio 3: questi percorsi devono funzionare su computer, Android e iPhone.
1. **Tecnico ASP sul telefono, senza rete:** accesso, scelta del sito (ricerca offline), smontaggio di alcuni pezzi in modalità aereo con la fotocamera, «ho finito al sito», ritorno in rete: le scansioni arrivano e il pezzo compare al cliente.
2. **Magazzino ASP, arrivo di materiale nuovo con DDT:** apertura del DDT, letture in raffica, arrivati/mancanti/inattesi in diretta, DDT «controllato» con avviso delle differenze.
3. **Magazzino ASP, arrivo di materiale smontato e smistamento:** lettura con la categoria suggerita in grande, conferma con un tocco.
4. **Reso al cliente:** creazione della spedizione, letture, invio con numero DDT; il magazzino cliente conferma con un pezzo mancante: avviso.
5. **Ufficio cliente (computer):** cruscotto con le quantità, ricerca di un pezzo per codice e la sua storia, avvisi e anomalie, export Excel, resoconto mensile PDF.
6. **Riservatezza, mostrata:** accesso come ASP Centro: non vede siti, pezzi né persone di ASP Nord.
7. **Installazione dell'app:** pulsante su Android e computer, istruzioni su iPhone.
**Misura:** per ogni percorso una prova end-to-end sugli emulatori (P-23) e una prova a mano sul progetto demo (computer, Android, iPhone) con esito nel PIANO.
**Opzioni:** il committente può togliere o aggiungere percorsi; i percorsi tolti non vanno provati sui telefoni.

## P-7 Quale codice è online

**Cosa:** sapere se il lotto 0 include gli ultimi commit (pulsante «Installa l'app», logo) o solo il codice di Emergent con gli indici.
**Misura:** aprire https://swaptrack-demo.web.app: la pagina di accesso mostra il logo arancione a codice a barre e, su Android o computer, il pulsante «Installa l'app»?
**Note:** se manca, entra nel prossimo lotto.

## P-10 Prove sulle regole di sicurezza

**Cosa:** prove automatiche con `@firebase/rules-unit-testing` e gli emulatori Firestore e Storage che percorrono la matrice SPEC §3.3, le regole su `events` (§8.1) e i percorsi Storage (§7.3): per ogni ruolo, cosa può leggere e scrivere e cosa no, con dati di due ASP.
**Misura:** ogni cella della matrice ha almeno una prova «consentito» e una «negato»; tutte verdi; la catena di controlli le include. In particolare: un'ASP non legge items, codes, events, documents, shipments, alerts, anomalies, aggregates, reports, file e users dell'altra; gli eventi sono leggibili solo dall'autore; letture pubbliche solo `settings/branding`, i flag di `settings/auth` e `branding/logo.*`; nessuna scrittura dei client fuori da `events` (e foto su Storage).
**Opzioni:** modello nell'app vecchia: `C:\Users\mcracchiolo\Desktop\APP_CANTIER_QRCODE\test-rules-emulator.js`. Le prove di Storage possono venire in un secondo passo.
**Stima:** la dà o2.

## P-11 Prove del trigger e del replay

**Cosa:** prove sugli emulatori (funzioni + Firestore) delle garanzie del criterio 2: (a) lo stesso codice sconosciuto scansionato da due dispositivi offline (due eventi `remove_at_site` con id diversi, stesso `codeRaw`) produce un solo pezzo; (b) uno smontaggio delle 10:00 sincronizzato dopo l'arrivo in magazzino delle 18:00 prende il suo posto e riempie `siteOfOrigin`; (c) lo stesso evento consegnato due volte non cambia nulla; (d) `void` prima e dopo l'elaborazione del bersaglio; (e) `relabel` e `code_of_another_asp`.
**Misura:** prove verdi; per (a) un solo documento in `items` e uno in `codes`.
**Note:** il trigger gira nell'emulatore delle funzioni: le prove scrivono eventi con l'Admin SDK e aspettano `processedAt`.
**Stima:** la dà o2.

## P-12 La scelta D25 contro la specifica

**Cosa:** Emergent ha deciso (D25) che un evento vietato su un codice sconosciuto (per esempio `classify` a un sito) non crea il pezzo. SPEC §9.2 dice «codice sconosciuto → stato naturale dell'evento» e, separatamente, «transizioni vietate: evento conservato, anomalia». Le due regole si toccano: va deciso quale vince.
**Misura:** una decisione D-n nel registro e la prova unitaria corrispondente in `tests/stateMachine.test.ts` coerente con la decisione.
**Opzioni:** (1) tenere D25: più prudente, nessun pezzo «fantasma» nato da un errore; (2) seguire la lettera della specifica: il pezzo nasce nello stato naturale e l'anomalia resta. Proposta della memoria storica: (1), criteri 2 e 5; si porta al committente solo se o2 trova un caso della demo in cui (1) nasconde un pezzo reale.

## P-13 Lavori programmati

**Cosa:** `graceExpiry`, `retention`, `dailyChecks`, `nightlyRecount`, `monthlyReports` non partono mai sugli emulatori. Chiamare i gestori a mano (prove unitarie o uno script) con i dati del seed e verificare i risultati.
**Misura:** per ogni lavoro un risultato atteso verificato (per esempio: `nightlyRecount` riscrive lo shard 0 e azzera gli altri; `monthlyReports` scrive PDF e XLSX veri e un documento `reports`).
**Stima:** la dà o2.

## P-14 Funzioni bloccanti con Identity Platform vero

**Cosa:** `beforeCreate` e `beforeSignIn` sono caricate ma mai provate col servizio vero. Preparare una prova che il committente esegue sul progetto demo: accesso con un account attivo (riesce), con un account disattivato (rifiutato), tentativo di creazione fuori dall'Admin SDK (rifiutato).
**Misura:** i tre esiti osservati sul progetto demo e annotati nel PIANO.
**Note:** un accesso rifiutato per errore delle funzioni bloccanti bloccherebbe la demo: va provato presto.

## P-15 Indici

**Cosa:** gli emulatori non chiedono indici, il progetto vero sì. Rileggere ogni ricerca con più filtri o ordinamenti in `src/lib/data/` e `functions/src/` e confrontarla con `firestore.indexes.json`.
**Misura:** elenco delle ricerche con l'indice corrispondente; nessun errore «index required» nei percorsi della demo sul progetto vero.
**Stima:** la dà o2.

## P-20 Raffica: contatore ed elenco delle letture

**Cosa:** nella schermata di scansione la fotocamera riprende da sola dopo ogni lettura (c'è), ma mancano il contatore delle letture della sessione e l'elenco ben visibile delle ultime letture, come nell'app vecchia. È una «scelta diversa da valutare» (P-4): serve una stima e il via.
**Misura:** dopo tre letture la schermata mostra «3» e le tre righe (codice, esito) senza coprire la fotocamera; «annulla l'ultima» toglie la riga e scrive un `void`.
**Opzioni:** (1) contatore ed elenco a scorrimento sotto la fotocamera; (2) solo il contatore, con l'elenco in una tendina. Da far vedere al committente (criterio 6).
**Stima:** la dà o3.

## P-21 Fotocamera sui telefoni veri

**Cosa:** nessuno ha ancora letto un codice con la fotocamera su un telefono vero. Android usa il motore nativo (BarcodeDetector), iPhone sempre zxing-wasm. Preparare una prova guidata (quali etichette, quali schermate, cosa annotare) che il committente esegue sul progetto demo con Android e iPhone.
**Misura:** lettura riuscita su entrambi; nome del motore mostrato; torcia solo dove c'è; suono e lampo di conferma; errore di permesso spiegato.
**Note:** se su iPhone la lettura fallisce, il primo sospettato sono le versioni fissate di `barcode-detector` e `zxing-wasm` (`consegna/README.md`).

## P-22 Foto con la coda senza rete

**Cosa:** scatto in modalità aereo → coda in IndexedDB → ritorno in rete → caricamento su Storage → `attachPhotos`. Mai provato con l'emulatore Storage acceso.
**Misura:** la foto compare nella pagina del pezzo; il file su Storage è senza EXIF e GPS; se la rete torna dopo la chiusura dell'app, la foto parte comunque.

## P-23 Prove end-to-end dei percorsi della demo

**Cosa:** Playwright contro `yarn dev` più emulatori con il seed, un test per percorso (P-6), con ruoli diversi; la lettura con la fotocamera si sostituisce con l'inserimento manuale (`source: manual`).
**Misura:** tutte verdi sugli emulatori; fanno parte del giro completo prima di ogni lotto.
**Note:** servono gli emulatori (D-4: una istanza alla volta).
**Stima:** la dà o3.

## P-30 Procedura di pubblicazione

**Cosa:** uno script unico che, dalla copia principale su `main` pulita: controlla il ramo e che non ci siano modifiche; lancia la catena completa di prove; compila app e funzioni; pubblica regole e indici, funzioni (`--force`), hosting (`hosting:app`) sul progetto scelto; verifica dopo il deploy che gli otto router abbiano `allUsers → roles/run.invoker`; si ferma al primo errore. Prima di ogni lotto la memoria storica scrive i risultati attesi (per esempio le modifiche agli indici).
**Misura:** una pubblicazione di prova fatta dal committente con lo script, senza passi a mano.
**Note:** lo script lo lancia solo il committente, con l'account personale (`firebase login:use` già fatto nella cartella).

## P-31 Documentazione per l'utente e il collaudo

**Cosa:** una guida breve per il consulente (cosa vedrà, con quali account) e una lista di collaudo per il committente (percorso per percorso, cosa aspettarsi). Ogni scritta verificata sul codice.
**Misura:** il committente segue la lista senza chiedere nulla.
