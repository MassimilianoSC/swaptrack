# Dopo la demo

Elenco permanente di tutto ciò che è stato rimandato a dopo la presentazione. Lo scrive la memoria storica. Ogni voce rimandata si aggiunge qui nello stesso momento in cui si decide di rimandarla; quando si comincia a lavorarla passa in `PIANO.md` (e il dettaglio in `DA_FARE.md`), e qui resta barrata con il numero della voce.

Ordine: prima le funzioni previste dalla specifica che mancano, poi le scelte da fare con il committente o il cliente, poi i difetti minori, infine la parte tecnica.

## 1. Funzioni della specifica che mancano nell'app

| # | Cosa | Stato | Stima e chi |
|---|---|---|---|
| n.37 | **Rietichetta** (SPEC §6.5, §8): attaccare un'etichetta nuova a un pezzo con l'etichetta rovinata; in «Leggi» si legge il codice vecchio, poi il nuovo. Trovata col censimento del 03/11; il server è pronto e sicuro (P-123, D-56); manca la schermata. **Prima voce dopo la demo** (committente, 13/11). Domanda al cliente: nel loro lavoro le etichette si sostituiscono davvero? | da fare | o2 45 min + o3 2–3 h |
| n.14 | **Campi extra che alimentano «Da completare»**: lista, colonna «cosa manca» e modulo. Server già fatto sul ramo o2-n14 (8f04914), da provare sugli emulatori; online va salvata una volta Impostazioni → Campi extra | da fare | o3 3 h + prove |
| P-207 | **Codice QR** nella verifica in due passaggi, al posto della sola chiave da copiare. Rimandato per non aggiungere una dipendenza nuova prima della demo (proposta di o3: «qrcode-generator», MIT, circa 20 KB, caricata solo in quella schermata) | da fare | o3 1 h |

## 2. Da decidere con il committente o con il cliente

| # | Cosa |
|---|---|
| P-133 | **Schermata «Leggi» riordinata** secondo i criteri D-62: configurare e lavorare senza distrazioni e ambiguità (preparazione prima della lettura, fotocamera grande, dettaglio in un pannello). Oggi molti comandi, alcuni da scorrere |
| P-110 | **Luogo indicato da un superiore** (D-48): un responsabile indica all'operaio dove lavorerà. Da progettare: chi assegna, per quanto, se l'operaio può cambiarlo, senza rete, chi la vede |
| P-138 | **Tempo reale**: quali pagine devono aggiornarsi da sole quando un altro ruolo cambia qualcosa (oggi 19 ascolti in diretta in 12 pagine; il cruscotto legge una volta all'apertura) |
| P-143 | **Guida completa in inglese**: oggi «Apri la guida completa» apre sempre quella italiana |
| P-145 | **Tabelle sul telefono**: oggi scorrono di lato. Se il cliente dice che il magazzino le usa dal telefono, una vista a schede per 2–3 pagine |
| D-36 | **Dati scaricati sul telefono anche alla scrivania**: ogni accesso di un ruolo ASP scarica tutti i pezzi della sua ASP, anche al computer. Proposta: niente copia per l'amministratore ASP alla scrivania; per il magazziniere solo alla prima apertura di «Leggi» |
| AI | **Altri usi dell'AI**: spiegazione in parole semplici di anomalie e differenze. Resta aperta la domanda al cliente sulle sue regole per l'AI |
| — | **Risposte mancanti del cliente** (PASSAGGIO_DI_CONSEGNE §5) |

## 3. Difetti minori rimandati (censimento per ruolo del 13/11)

I file completi sono in `swaptrack-guida/CENSIMENTO_RUOLI_APP_1311.md` e `CENSIMENTO_SERVER_PER_RUOLO_1311.md`.

**Server (o2)**
- «Correggi luogo» dell'amministratore ASP su una lettura di un pezzo che non è più della sua ASP: la correzione si salva, poi risponde «pezzo non trovato»; resta senza ricalcolo e senza riga nel registro (items.ts:138-143). Da verificare con dati reali.
- Magazzino cliente su un avviso che non è di un reso: «Segna visto» e «Chiudi» rispondono con due codici d'errore diversi (alerts.ts:36, 46). Solo coerenza.
- Avviso «Materiale fermo»: prende l'ASP dell'ultimo pezzo del gruppo luogo + flusso (scheduled.ts:78). Da verificare se in un luogo possono stare pezzi fermi di ASP diverse.
- L'importazione dei luoghi può cambiare il tipo di un luogo esistente, che la modifica a mano rifiuta (catalog.ts:88-96).
- Un luogo si può assegnare a un'ASP disabilitata (catalog.ts:113-116).
- La tendina «Luogo» dei documenti mostra anche i luoghi disattivati (da verificare con la specifica).
- Foto obbligatoria del difettoso: dal lotto 14 l'app non la dimentica più (P-201), ma il server non controlla l'impostazione. Da valutare se serve anche il controllo sul server.

**App (o3)**
- «Ho finito in questo sito»: nessuna conferma, non si annulla, e ogni tocco fa partire di nuovo il controllo della BOM (Scan.tsx:844, 962).
- Da verificare: nell'arrivo di un trasferimento «Materiale», DDT e categoria sono visibili ma il server li ignora; il luogo imposto dalla spedizione resta per tutta l'app; si può inviare una spedizione vuota, e un trasferimento vuoto non diventa mai «Ricevuta»; il cruscotto dell'amministratore ASP potrebbe restare in caricamento per un'ASP senza numeri.
- «Chiudi» sull'avviso delle foto non inviate le cancella (voluto, §7.3), ma il nome non lo dice.
- Aggiungendo un Excel l'anteprima potrebbe avviare un download (da verificare).

**Guide (memoria storica)**
- Nella guida del Magazzino ASP «controlla il luogo in alto»: sotto i 640 px il luogo è nel menu ☰.

## 4. Parte tecnica e infrastruttura

- Estensione Trigger Email per inviti e messaggi veri.
- App Check.
- Verifica in due passaggi e accessi Google e Microsoft con i fornitori veri.
- Un progetto Firebase definitivo al posto dell'escamotage `kronos-caffe-sito`.
- App da negozio (Capacitor).
- Divisione del pacchetto dell'app (avviso sopra 500 kB).
- Scollegare Google Analytics dal progetto (facoltativo).
- P-156: finestre dei processi all'avvio degli emulatori su Windows.
