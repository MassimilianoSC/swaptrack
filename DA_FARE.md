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

### Prova guidata (preparata da o3 il 03/11, per l'app online dopo il lotto 2)
Account: tecnico Nord (sito), magazziniere Nord (arrivo); la password la sa il committente. Per ogni passo: FAI / VEDI / RIFERISCI. Testi tra «…» esatti dell'app.
0. Prima (amministratore cliente, al computer): Impostazioni → «Funzioni» → spunta «Lettura automatica documenti e codici delle etichette rovinate (AI)» → «Salva» («Salvato»); a prova finita la toglie. Tre etichette: A e B leggibili, C rovinata o coperta da un dito.
1. Installazione. Android (Chrome): entrati nell'app, nella striscia in alto «Installa l'app» (oppure in fondo al menu ☰ la voce «Installa l'app»); se non compare, menu ⋮ di Chrome → «Installa app» (o «Aggiungi a schermata Home»). iPhone (Safari): Condividi → «Aggiungi alla schermata Home» → «Aggiungi». Vede l'icona; l'app si apre a tutto schermo. Riferisce modello e sistema, icona, tutto schermo.
2. Accesso dall'icona, «Accedi», informativa «Ho letto e accetto». Vede «Scegli il sito» con l'elenco e, in alto, l'icona della rete (sul telefono la scritta «Online» non c'è, solo l'icona). Riferisce i secondi da «Accedi» all'elenco; se qualcosa è rimasto su «Caricamento…» oltre 10 s.
3. Sito, «Leggi», «Smonta», «Consenti» la fotocamera. Vede la fotocamera col riquadro e «Motore nativo» o «Motore di riserva». Riferisce il motore e se la fotocamera si apre subito.
4. Lettura singola (Raffica spenta): A → suono, lampo verde, «Leggi il prossimo»; B inquadrata non si registra finché non si preme «Leggi il prossimo». Riferisce i due esiti.
5. Pezzo sconosciuto: chiuso con la X (o indietro su Android) → la lettura c'è e la fotocamera riparte. Con un'altra etichetta nuova: ricerca del modello per nome, tocco, «Conferma». Riferisce i due esiti.
6. Raffica: spunta «Raffica (la fotocamera riparte da sola dopo ogni lettura)»; due etichette NUOVE (D ed E) in fila, il numero sale (A è già letta al passo 4: darebbe «… già letto poco fa (alle …)», D-68); chiusa e riaperta l'app, «Raffica» resta spuntata.
7. «Già letto»: fermo 5 s sull'etichetta appena letta → «Codice già letto. Inquadra il pezzo successivo.», il numero non sale. Poi allontana il telefono 3 s e reinquadrala: compare «… già letto poco fa (alle …)» in giallo e il numero non sale (D-68).
8. Foto dopo una lettura: «Foto in coda per l'invio»; prima di ogni lettura «Foto» sembra spento con «Leggi un pezzo, poi scatta la foto.»; «Foto» e «Annulla l'ultima» sono subito sotto la fotocamera.
9. Con la rete: secondi da «Da inviare» a «Inviata» nell'elenco sotto la fotocamera (o aprendo «Le mie letture di oggi · N», che ora è un pannello chiuso).
10. Modalità aereo: 2 letture e «Ho finito in questo sito»; l'icona della rete barrata e «2 da inviare»; «Esci» bloccato con la spiegazione.
11. Ritorno della rete con l'app aperta: «Online», tutte «Inviata», sparisce «da inviare». Secondi.
12. Modalità aereo, app chiusa e riaperta: l'elenco dei siti c'è e la ricerca funziona; cosa dice «aggiornati».
13. AI, con la rete: sotto «Il codice non si legge?» premi «Fotografa l'etichetta» su C → «Codici letti dalla foto», caratteri incerti evidenziati, correzione, «Conferma» → lampo verde e «Foto in coda per l'invio». In modalità aereo «Fotografa l'etichetta» non compare: resta solo il campo delle cifre («oppure» sparisce con il pulsante). Riferisce se il codice era giusto, i secondi, la chiarezza del messaggio.
14. Magazziniere, se c'è tempo: «Arrivo», poi «Smista / classifica»: «Suggerita: …» in grande con «Conferma» e le altre come pulsanti; «Annulla» → «… non smistato».
15. Facoltativo (D-68 caso 2): chiudi e riapri la schermata «Leggi», stessa modalità e luogo: rileggi A → avviso giallo «… è già a … dal …», riga «già qui», il numero non sale.
Alla fine, per ogni telefono: modello e sistema, cosa non ha funzionato con il numero del passo, eventuali foto dello schermo.

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
**Script:** `scripts/deployBatch.mjs` (o2). `node scripts/deployBatch.mjs` = solo controlli e giro completo di prove, nulla online; `node scripts/deployBatch.mjs --yes` = poi pubblica e verifica gli invoker. Prima va fatto il push: lo script rifiuta un `main` diverso da GitHub.

### Lotto 1: risultati attesi (ricavati da o2 il 30/10, confronto 5e66bb4 → main)
- **Indici:** uno aggiunto (`shipments`: `kind`, `createdAt desc`), nessuno tolto. Se la CLI chiede di cancellare indici non presenti nel file: rispondere **no**. L'indice nuovo si costruisce in qualche minuto: le prove a mano si fanno quando in console (Firestore → Indici) risulta «Abilitato».
- **Regole Firestore:** solo letture rese possibili dove l'app ne aveva diritto (codici e anomalie di un proprio pezzo; codice inesistente; righe delle spedizioni decise sulla spedizione madre; export «creati da me»). Nessuna scrittura nuova dei client.
- **Regole Storage:** nessuna ASP legge più `documents/client/…`; foto caricate solo da ruoli ASP; ri-caricamento della stessa foto dalla propria ASP.
- **Funzioni:** le stesse 16 (nessuna nuova, nessuna rimossa); il trigger chiede `--force` (già nello script); dopo il deploy, controllo degli invoker degli otto router (nello script).
- **Dati online, prima di pubblicare:** lanciare `scripts/checkOnline.mjs` (sola lettura, P-67): conta gli eventi mai elaborati (se ci sono, serve uno script di rielaborazione) e i documenti senza ASP (se ci sono, `scripts/fixDocumentAsp.mjs`, P-50).
- **Dopo la prima notte:** gli avvisi del seed «materiale fermo» e «trasferimento» vengono ricalcolati sui dati veri e possono cambiare numero o andare a 0 (D-29): non è un errore. Il ricalcolo dei contatori delle 02:00 riscrive tutto.
- **Prova rapida a mano dopo il lotto** (account del seed):
  1. Magazzino cliente: Spedizioni mostra i resi senza errori; aprendo un reso si vedono le righe.
  2. Ufficio cliente: crea una BOM per un sito di ASP Nord; il tecnico di Nord la vede nella schermata di lettura di quel sito.
  3. Ufficio cliente: Esportazioni → crea un export senza filtri → il file Excel si scarica.
  4. Ufficio cliente: «Rapporti» → genera ottobre 2026 → il file scaricato si chiama «SwapTrack-resoconto-2026-10-cliente» (P-106); scegliendo l'ambito ASP Nord (P-99) il file finisce con il nome dell'ASP e il resoconto dice «ASP Nord»; generandolo due volte, il primo file resta scaricabile (P-114).
  5. Magazzino Nord: in arrivo con un DDT legge un pezzo sbagliato, «annulla l'ultima», poi «Confronta»: il pezzo annullato non è fra gli inattesi.
  6. Magazzino Nord, «Arrivo» di materiale nuovo: compare la scelta del DDT aperto e il riquadro arrivati/mancanti/inattesi si aggiorna a ogni lettura (P-24).
  7. Tecnico o magazzino: una lettura con foto scattata in rete; poi l'ufficio cliente apre la pagina di quel pezzo e vede la foto (P-68, P-70).
  8. Un avviso le cui differenze sono sparite compare «Nessuna differenza ora», non in rosso (P-60, D-29).
- **Aggiornamento del 02/11 (o2):** nessun indice, regola o funzione nuova rispetto al quadro del 30/10; nessuna migrazione nuova. Le funzioni vanno ripubblicate perché il loro codice interno è cambiato (riservatezza, foto, resoconti). Le ricerche nuove dell'app sono solo uguaglianze.

### Lotto 2: risultati attesi e controlli a mano (preparati da o2 il 03/11)
- **Cosa cambia online rispetto al lotto 1:** 7 indici nuovi (shipments ×2, items ×4, documents ×1); nessuna regola cambiata (Storage: solo un commento); dipendenza nuova delle funzioni `@google/genai`; router `documents` con timeout 120 s e 1 GiB; impostazione nuova `features.aiDailyLimit` (predefinito 20). La regola CORS del bucket è già applicata (03/11). Le funzioni bloccanti sono già verificate (P-14).
- **Prima dei controlli:** nella console, i 7 indici nuovi «Abilitati».
- **Controlli a mano** (account del seed; in ordine di importanza per la demo; l'atteso viene dalla specifica o dalla decisione):
  1. Pezzi, due filtri insieme (P-101; §13.1–13.2). Ufficio cliente → Cruscotto → clic su «Smistato»: solo pezzi «Smistato». Poi scegli anche un modello: solo smistati di quel modello, nessun errore. Un errore d'indice: mandarne il testo.
  2. Raffica col telefono vero (P-98, P-109). Magazziniere Nord sul telefono, Arrivo, fotocamera ferma 5 s sulla stessa etichetta: una sola riga, contatore +1; entro 3 s compare «Codice già letto. Inquadra il pezzo successivo.»; dopo, rileggendo, compare «… già letto poco fa (alle …)» (D-68); in tutti e due i casi il contatore non sale.
  3. Reso: rilettura e «Annulla l'ultima» (P-90, P-91, D-41; §8.2). Magazziniere Nord: nuovo reso, due pezzi «Smistato», rileggi il secondo: avviso giallo «… già letto poco fa (alle …)», la lettura non si registra (D-68); pezzi 2, nessuna anomalia nuova. «Annulla l'ultima»: 1 pezzo e 1 riga, il pezzo annullato torna «Smistato».
  4. Esportazione scaricata (D-35, P-89, P-106; §13.3). Ufficio cliente → Esportazioni → senza filtri → Scarica: si apre in Excel e si chiama «SwapTrack-export-AAAA-MM-GG-hhmm.xlsx».
  5. Resoconto di un'ASP (P-99, P-114 n.26; §13.4). Ufficio cliente → «Rapporti» → ambito «ASP Nord», il mese indicato da checkOnline («month to pick in «Reports»») → Genera due volte: due righe, tutte e due scaricabili; il file dice «ASP Nord» e si chiama «SwapTrack-resoconto-2026-10-…».
  6. Reso con un mancante, avviso che apre il reso (P-103; §9.3). Magazzino cliente: conferma un reso togliendo la spunta a un pezzo → avviso di differenza del reso; aperto da Avvisi porta al reso, non al documento.
  7. Foto vista dall'ufficio (P-68, P-70; §13.2). Tecnico Nord: lettura con foto, in rete. Ufficio cliente: nel pezzo la miniatura, cliccata si apre.
  8. Arrivo di smontato con smistamento (P-25, D-27, D-39; §12.2). Magazziniere Nord, Arrivo, «Materiale smontato», «Smista nello stesso passaggio»: categoria suggerita in grande, pezzo «Smistato». Con «Materiale nuovo» il pezzo è «Al magazzino ASP», mai «Smistato».
  9. BOM con direzione (P-92; §11.2). Amministratore cliente: BOM per un sito di Nord con righe in «Da smontare» e «Da installare» → si salva. Tecnico Nord a quel sito, «Leggi»: tocca la riga «Lista BOM · 0/N» per aprirla (ora è chiusa); con «Smonta» vede i «Pezzi da smontare», con «Installa» i «Pezzi da installare».
  10. Trasferimento ricevuto (P-114 n.16; §9.4). Magazziniere Nord: trasferimento MAG-NORD-01 → MAG-NORD-02 con 2 pezzi, i pezzi si leggono con «Leggi i pezzi» dalla scheda del trasferimento (P-134); invia; a MAG-NORD-02, «Leggi i pezzi» dalla scheda del trasferimento, leggi i 2 pezzi: spedizione «Ricevuta», con la data.
  11. Documenti del magazzino cliente (P-97): l'elenco dei DDT di reso compare, nessuna rotellina infinita.
  12. Niente testi grezzi (P-96, P-117). Ufficio cliente: Home, Anomalie, Esportazioni senza scritte tipo «home.cards…». Amministratore cliente: Registro con testi, mai codici con il trattino basso.
  13. Persone dell'amministratore ASP (P-117 n.30; §3.3). Amministratore Nord → Persone: nessun menu azioni sulla propria riga; sì su magazziniere e tecnico.
  14. Uscita con letture in coda (P-87a, se nel lotto). Tecnico, modalità aereo: una lettura, poi Profilo → «Esci da tutti i dispositivi»: «Non puoi ancora uscire», l'uscita non avviene.
  15. DDT caricato come foto (P-105, D-47, se nel lotto; §11.2). Magazziniere Nord: nuovo DDT con 2 foto → salva; aggiunge una terza: 3 pagine; tolta una, resta nella storia.
  16. Lettura con l'AI (D-45, se nel lotto; dopo i passi di messa a punto). Interruttore spento: nessun pulsante «Leggi automaticamente». Acceso: righe proposte da confermare, nulla salvato senza conferma.

### Prima della demo (9-10/11): controllo dei dati online (o2, 1454229)
Comando (PowerShell, sola lettura; servono le credenziali di `gcloud auth application-default login`): `cd C:\Users\mcracchiolo\Desktop\swaptrack` poi `$env:CHECK_REAL_PROJECT="kronos-caffe-sito"` poi `node scripts/checkOnline.mjs --yes-real-project`.
Nella parte «--- What the demo script takes for granted» ogni riga comincia con OK (va bene) o NO (da sistemare); le righe rientrate sono informazioni.
- A) «account <ruolo> of <organizzazione>»: i 7 account del copione. NO = «missing», «claims» (permessi), «profile» (scheda utente), «Auth disabled» (accesso bloccato). «privacy notice: … not accepted …: shown at the first sign-in» non è un errore: al primo accesso compare l'informativa da accettare (farlo il giorno prima).
- B–E) ditte attive (almeno 4), i 4 luoghi del copione (4 su 4), modelli attivi (almeno 20), categorie di smistamento (3), regola «Radio unit → cat_refurbish» attiva.
- F) «settings: …» da confrontare con il copione (AI accesa, e-mail, Google); «no minimum app version» NO se c'è una versione minima.
- G) «month to pick in «Reports»: AAAA-MM» = il mese da scegliere in «Rapporti» → «Genera»; «aggregates (home dashboard)» NO se 0 (cruscotto vuoto).
- H) «demo serials expected by a document already» deve essere 0; se NO, «Demo DDTs already saved» e «BOMs of the demo site» dicono quale documento è già stato salvato.
- I) «https://swaptrack-demo.web.app/guida.html: 200»; altro numero o «no answer» = NO (riga mai provata prima: guardarla bene).
- Ultima riga: «Everything the demo script takes for granted is there.» oppure «N line(s) NO: send them to the team before the demo.»
A mano in console (committente): Functions → ci sono gli 8 router e onEventCreated.

### Lotto 2: prima prova dell'AI online (procedura preparata da o2 il 03/11)
Serve: lotto 2 pubblicato (con 69df411, registro «ai_call»), i file di `node scripts/demoDocs.mjs` in `demo-docs/`, circa 30 minuti, un cronometro.
1. Amministratore cliente: Impostazioni → «Funzioni» → «Lettura automatica documenti e codici delle etichette rovinate (AI)» → «Salva». Limite 20 letture al giorno a persona (contano anche quelle fallite); la prova ne usa 6.
2. Amministratore ASP Nord: «Nuovo documento», DDT (arrivo), numero AI-PROVA-1, luogo MAG-NORD-01; file DDT-TD-2026-0412-foto.jpg → «Salva» → «Leggi automaticamente». Atteso: «10 righe proposte…» con TD260412001…008 (MC400100, …107, …114, …121, …128, …135, …142, …149), «#3 MC400170», «#2 MC400205». Non salvare. Annotare secondi, righe giuste/sbagliate/mancanti, avvisi.
3. Come 2 con AI-PROVA-2 e DDT-TD-2026-0412.pdf: stesse 10 righe.
4. Come 2 con AI-PROVA-3 e DDT-TD-2026-0413.pdf: 46 righe (44 seriali TD260413001…044, codice che riparte da MC400100 alla riga 21, poi «#4 MC400184», «#6 MC400219»); controllare prime 3, righe 21–23, ultime 3.
5. BOM AI-PROVA-BOM, luogo SITO-00013, file BOM-SITO-00013.pdf: «Da smontare» TD26R13001…005 (MC400100…128), «Da installare» TD26I13001…004 (MC400135…156) e «#2 MC400177», nessuna «Righe senza direzione». Attenzione alla lettera I di «TD26I».
6. Magazzino ASP Nord, MAG-NORD-01, «Leggi» → «Arrivo» → «Leggi dalla foto dell'etichetta»: etichetta-4-sfocata-TD260412004.jpg → primo codice TD260412004; etichetta-5-strappata-TD260412005.jpg → TD260412005, probabilmente evidenziato lo «0» macchiato. Sempre «Annulla».
7. Pulizia: chiudere AI-PROVA-1, -2, -3, -BOM (altrimenti compaiono nella tendina «DDT»).
8. Se compare «Il servizio di lettura automatica non risponde…»: Esplora log del progetto, query `resource.type="cloud_run_revision"`, `resource.labels.service_name="documents"`, `jsonPayload.message=~"ai_call"`. «ai_call»: ms e token; «ai_call_failed»: status ed error (403 permesso, 404 o «not found in location eu» modello assente sull'endpoint eu → decisione su D-46, 429 troppe richieste).
9. Il giorno dopo: Fatturazione → Report, servizio Vertex AI, raggruppato per SKU, giorno della prova.
Da riferire: una riga per passo (secondi, righe giuste/sbagliate/mancanti, avvisi, note), le righe del registro, il costo.

### Prima della demo (9–10/11): controllo dei dati online (o2, `checkOnline.mjs`, sola lettura)
Dalla cartella del progetto, in PowerShell: (se lo chiede) `gcloud auth application-default login`; `$env:CHECK_REAL_PROJECT="kronos-caffe-sito"`; `node scripts/checkOnline.mjs --yes-real-project`. Mandare il testo dalla riga «REAL project» in giù. Controlla: eventi mai elaborati, documenti senza ASP, BOM senza direzione, documenti AI-PROVA aperti (da chiudere), DDT TD-2026-… e codici TD26… già usati (alla demo non sarebbero «nuovi»: usare l'altro DDT o rigenerare i file), bozze di spedizione aperte, avvisi e anomalie per tipo (seed: 6 e 6), pezzi da completare, interruttore AI e limite.

### P-141: «Accedi con Google» online, cosa gli emulatori non vedono (o2, 05/11)
Prima prova online del committente (05/11): «Errore 400: redirect_uri_mismatch». Causa: authDomain della demo = swaptrack-demo.web.app, ritorno su https://swaptrack-demo.web.app/__/auth/handler, assente dal client OAuth.
1. Google Cloud → API e servizi → Credenziali → «Web client (auto created by Google Service)»: origine JavaScript `https://swaptrack-demo.web.app` e URI di reindirizzamento `https://swaptrack-demo.web.app/__/auth/handler` → Salva (vale dopo qualche minuto).
2. Gli account della demo (@swaptrack-demo.test) non sono account Google: per mostrare Google serve un utente invitato nell'app con un indirizzo Google vero (decisione del committente: suo indirizzo, disattivato dopo la demo). Se l'invitato non ha ancora impostato la password, Google la toglie (P-141).
3. Google Auth Platform → «Pubblico»: se «Test», entrano solo gli utenti di prova (altrimenti «403 access_denied»): aggiungere l'indirizzo del punto 2 oppure «Pubblica app» (ambiti email/profile/openid: nessuna verifica).
4. Google Auth Platform → «Branding»: nome mostrato nella scelta dell'account (forse quello del vecchio sito): «SwapTrack».
5. Firebase → Authentication → Impostazioni → «Collegamento account utente»: «Collega gli account che usano lo stesso indirizzo email» (con «Crea più account» si ha «no_active_account»).
6. Authentication → Impostazioni → «Funzioni di blocco»: beforeCreate e beforeSignIn selezionate. Sign-in method → Google abilitato.
7. Il giorno prima: prova dal computer e dall'app installata sui due telefoni (popup su iPhone installato = caso più fragile). Interruttore «Accesso con Google» acceso (checkOnline: «Google sign-in ON»).

### P-140: passi in console per gli inviti per e-mail (aggiornati il 05/11: modelli e URL d'azione bloccati su questo progetto)
Su kronos-caffe-sito Firebase non permette di modificare i modelli delle e-mail né l'URL d'azione: si usano l'e-mail standard («Reimposta la password per %APP_NAME%», nella lingua della persona) e la pagina standard di Firebase; dopo il salvataggio «Continua» riporta all'accesso di SwapTrack.
1. Impostazioni progetto → Generali → «Nome pubblico» → SwapTrack Demo → Salva. FATTO il 05/11.
2. Domini autorizzati: swaptrack-demo.web.app (FATTO il 05/11).
3. Authentication → Impostazioni → «Policy relative alle password»: «Richiedi applicazione», lunghezza minima 10, carattere minuscolo e numerico obbligatori, «Forza l'upgrade all'accesso» spento. FATTO il 05/11 (la password demo la rispetta).
4. Pubblicazione delle funzioni con P-140.
5. Amministratore cliente → Impostazioni → «App» → interruttore degli inviti per e-mail → «Salva».
6. Prova: invito a un indirizzo proprio → arriva «Reimposta la password per SwapTrack Demo», l'app non mostra il link; password corta rifiutata, giusta accettata → «Continua» → accesso.
Da dire nella guida: l'e-mail di invito si chiama «Reimposta la password…»; chi invita lo dica alla persona. Per un testo d'invito proprio: richiesta all'assistenza Firebase o funzione con il server di posta del cliente (strada B).

### Anteprima locale del 05/11 (P-139, P-140), passi preparati da o2
Avvio: `cd C:\Users\mcracchiolo\Desktop\swaptrack` poi `node scripts/previewLocal.mjs`; pronto con «Local: http://localhost:3010/»; Chrome su http://localhost:3010, F12 e Ctrl+Shift+M per la modalità telefono, F5. Nessuna sessione usa gli emulatori mentre è aperta.
P-139 (magazziniere Nord, MAG-NORD-01, cifre a mano): (1) Arrivo, Materiale nuovo, PROVA-0001 → al «Pezzo sconosciuto» premere «Salta»; di nuovo PROVA-0001 → avviso giallo «già letto poco fa», contatore fermo. (2) Dopo «Inviata», Home e di nuovo Arrivo, PROVA-0001 → avviso giallo «è già a MAG-NORD-01 … dal …», riga «già qui», contatore fermo. (3) Rosso: Smista con categoria «Riutilizzo» e PROVA-0001, oppure Arrivo nuovo con SNN-000002 (installato in un sito di Nord) → «… risulta «…» a …: controlla l'etichetta».
P-140 (amministratore cliente): Impostazioni → App → «Gli inviti partono per e-mail (Firebase Authentication)» → Salva; Utenti → Invita utente (e-mail inventata) → «L'e-mail di invito è stata inviata.» e nessun link. L'e-mail finta si legge su http://127.0.0.1:9109/emulator/v1/projects/demo-swaptrack/oobCodes (riga «oobLink»); aprirla, scegliere la password, entrare. Controprova a interruttore spento: compare il link.
Chiusura: Ctrl+C una volta, attendere «emulators: … stopped». Se resta una porta: `netstat -ano | findstr ":8190 :9109 :5011 :9209 :3010"` e `taskkill /PID <numero> /F` solo per quei numeri; avvisare la memoria storica.

## P-31 Documentazione per l'utente e il collaudo

**Cosa:** una guida breve per il consulente (cosa vedrà, con quali account) e una lista di collaudo per il committente (percorso per percorso, cosa aspettarsi). Ogni scritta verificata sul codice.
**Misura:** il committente segue la lista senza chiedere nulla.

## P-16 Riparazione del trigger (letture dopo scritture nella transazione)

**Cosa:** in `functions/src/trigger.ts` la transazione principale scrive (anomalia o pezzo) e poi legge ancora; l'Admin SDK di Firestore lo vieta («all reads before all writes»), l'errore non è classificato come permanente e l'evento viene ritentato fino alla scadenza (circa 24 ore), mai elaborato, con anomalie duplicate a ogni tentativo. Tre percorsi: lettura di una vecchia etichetta dopo un `relabel` (`old_label_used`), catena di merge a 5 salti (`merge_chain_suspicious`) e ogni `transfer_out` o `return_ship` con `shipmentId` (lettura della spedizione dopo la scrittura del pezzo): spedizioni e resi non si riempiono mai di righe. Confermato da un aiutante in sola lettura il 29/10/2026.
**Misura:** tre prove sull'emulatore delle funzioni, rosse sul codice di prima: (a) `return_ship` con `shipmentId` → riga della spedizione creata e `itemCount` aggiornato; (b) lettura di una vecchia etichetta dopo `relabel` → evento elaborato, una sola anomalia `old_label_used`; (c) catena di merge a 5 salti → evento elaborato con anomalia. Poi una rilettura dell'intero trigger per lo stesso schema.
**Opzioni:** (1) tutte le letture prima di tutte le scritture: anticipare la lettura della spedizione (o usare la cache già riempita dal replay) e raccogliere le anomalie in una lista scritta alla fine; (2) scrivere le anomalie fuori dalla transazione dopo il commit. Decide o2 (file suoi).
**Note:** fino alla pubblicazione della riparazione, la demo online non deve mostrare spedizioni o resi con scansioni vere.

## P-24 DDT nella schermata di lettura (lacuna della specifica)

**Cosa:** SPEC §12.2: all'arrivo di materiale nuovo il magazziniere «sceglie o carica il DDT, legge in raffica, vede arrivati / mancanti / inattesi in diretta». Nel codice di Emergent la schermata di lettura non permette di scegliere il DDT e non manda mai `payload.ddtId` (il server lo legge già, `functions/src/routers/documents.ts`); gli «inattesi» non possono quindi esistere e il confronto si vede solo nella pagina del documento («Confronta» e «controllato»). Decisione D-15.
**Misura:** la parte DDT del percorso 2 in e2e: dalla schermata di lettura si sceglie un DDT aperto del proprio magazzino (dalla cache; mai scelto in silenzio; si può leggere anche senza DDT); tre letture di cui una fuori DDT → riquadro in diretta «2 arrivati, 1 mancante, 1 inatteso»; gli eventi portano `payload.ddtId`; «controllato» → gli stessi numeri dal server e l'avviso `ddt_in_difference`.
**Opzioni:** calcolo in diretta sul dispositivo dai propri eventi più le righe del DDT in cache, come i tick della BOM (D38). Nessun file altrui.
**Stima:** 4–6 ore, rischio medio (o3).

## P-25 Categoria suggerita in modalità «Arrivo»

**Cosa:** SPEC §12.2: all'arrivo di materiale smontato il magazziniere «può smistare nello stesso passaggio (la categoria suggerita appare a ogni lettura)». Oggi la categoria suggerita si calcola e si mostra solo in modalità «Smista / classifica»; in «Arrivo» no (segnalato da o3 il 29/10/2026). Lacuna piccola: il percorso 3 della demo funziona in due passaggi (arrivo, poi smistamento).
**Misura:** in modalità «Arrivo» di un pezzo smontato, dopo la lettura compare la categoria suggerita in grande con conferma a un tocco; l'evento `arrive_at_warehouse` porta `categoryId` e `suggestedCategoryId` e il pezzo risulta `sorted` (SPEC §9.2, arrivo con categoria).
**Stima:** da chiedere a o3 dopo P-24.
