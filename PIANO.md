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
| P-2 | Cambiare la password degli account demo prima di condividere l'indirizzo oltre il consulente (oggi è scritta nel README; `memory/test_credentials.md` cancellato con P-3, ma resta nella storia di git) | committente in console; poi reg toglie la password dai documenti |
| P-4 | Differenze notate rispetto all'app vecchia. Prime tre del 03/11: (1) il luogo lo sceglie solo l'operaio sul telefono, nella vecchia app poteva indicarlo un amministratore: domanda al committente; (2) pulsante «Foto» a volte spento senza spiegazione: P-108; (3) stessa etichetta letta due volte, la seconda ignorata senza avviso: P-109 | committente |
| P-50 | Dire se nella demo online ha caricato documenti (BOM o DDT) come `client_admin`: nascevano senza ASP (P-49). Se sì, lo script `scripts/fixDocumentAsp.mjs` è pronto (solo elenco di default, `--apply` dopo aver visto l'elenco; comandi in REGISTRO) | committente |

## In corso

| # | Cosa | Chi |
|---|---|---|
| P-23 | Prove end-to-end: secondo giro (12,9 min) 14 verdi, 5 rosse. Dimostrati: export Excel (P-61) e creazione del DDT. Rosse: DDT non offerto nella schermata di lettura (P-24, sul ramo); ricerca del pezzo, void della raffica, percorso 3 ×2 instabili fra un giro e l'altro (sospetto: macchina carica; da escludere un difetto della cache di Firestore). Giro dei soli percorsi 2 e 3 con l'altro progetto fermo (30/10): 4 rosse su 4, quindi NON è l'ambiente: causa trovata da o3: il seed completo fa girare nell'emulatore circa 10.000 trigger in fila per tutto il giro, e gli eventi delle prove aspettano dietro (P-71). Online non succede. P-24 verde nella parte nuova | o3 |
| P-22 | Foto scattate senza rete, da capo a fondo: parte server fatta (51d5391, verde; JPEG con GPS c328954); parte schermata di o3 | o3 |
| P-107 | Lettura automatica con l'AI di foto e PDF di DDT e BOM (D-45): callable `extractDocument` ed `extractLabel` con Gemini su Vertex AI su main (db5385a, 37eca36; o2 circa 3 h 15); pulsante «Leggi automaticamente» e righe da confermare (o3, 3–4 h, subito dopo P-105, entro il 08/11); passi in console del committente: Vertex AI API abilitata, ruolo «Vertex AI User» a 840240907477-compute@developer.gserviceaccount.com, budget presente (03/11); restano le chiamate vere di messa a punto dopo la pubblicazione, con il costo misurato dai report di fatturazione | o2 + o3 + committente |
| P-121 | Interruttore «Raffica», spento di partenza (D-55): lettura singola con «Leggi il prossimo». Circa 1 h, dopo P-100 | o3 |
| P-120 | Resoconto con la fotografia di fine mese (n.27, proposta A): il lavoro dell'1 del mese salva i numeri di fine mese e le generazioni successive li usano, con la data scritta nel resoconto. 2–3 h | o2 |
| P-115 | Dal censimento (criterio 2, prima di P-105): lettura aperta da una spedizione senza il suo luogo (n.28); lettura rifiutata senza motivo (n.23); Foto agganciata a una lettura annullata (n.21); spunte BOM del telefono con letture di altri siti (n.4); «Foto obbligatoria» inefficace (n.5); righe dei documenti che perdono modello e codice (n.38); «dispositivo ripulito» anche a invio fallito (n.33). Stima 5 h | o3 |
| P-116 | Dal censimento, piccole: «Accetta spostamento» all'ufficio (n.7), storia vuota per il magazzino cliente (n.12), nota annullata che chiude l'avviso (n.20), coppie di trasferimento rifiutate (n.29), intestazioni data (n.31), Scan per indirizzo (n.34), filtri delle tabelle (n.39), modulo di nuovo documento per ruoli che non possono salvare (n.6); «Correggi luogo» e «Cambia ASP» chiedono un identificativo interno: scelta da elenco (trovato dalla guida). Stima 3,5 h più la scelta da elenco | o3 |
| P-117 | Dal censimento, pagine passate a o2 (D-44): azioni dell'amministratore ASP (n.30), testi non tradotti e registro senza testo (n.32), password non svuotate (n.35), avviso di export troncato (n.36) | o2 |
| P-111 | Lettura con l'AI di un'etichetta rovinata nella schermata di lettura (D-49): foto, codice proposto, conferma, lettura; senza rete inserimento a mano. o2 server dopo extractDocument; o3 schermata con P-108 e P-109. Stime chieste | o2 + o3 |
| P-87 | Telefono condiviso (D-40). **a)** «Esci da tutti i dispositivi» e «Esci» dell'informativa nuova saltavano il blocco dell'uscita con letture o foto in coda (SPEC riga 201); la coda foto partiva prima del controllo del proprietario (foto di un altro utente caricate e lasciate orfane). Prima della demo. **b)** Dopo un'uscita forzata, se entra un altro utente le letture e foto non inviate del precedente si perdono senza avviso: avviso con due scelte. Dopo la demo; intanto nella guida | o3 |
| P-59 | Pezzo extra trovato in un altro reso: lato server su main (3f26623); resta da mostrarlo nella pagina della spedizione | o3 |
| P-30 | `scripts/deployBatch.mjs` pronto (senza `--yes` solo controlli; con `--yes` pubblica e verifica gli invoker); prima prova: il giro «solo controlli» del committente | o2 + reg + committente |
| P-100 | (A6, con n.11 e n.13 del censimento: elenchi dei seriali e organizzazione e ruolo nella storia, già mandati dal server) Nomi al posto degli id (luoghi, ASP, categorie, da/a) in varie pagine; da controllare anche per il criterio 1 (id di un'altra ASP visibile) | o3 |
| P-102 | (A8, SPEC §10) In «Smista» la categoria suggerita si conferma con un tocco o se ne sceglie un'altra | o3 |
| P-104 | (A11) Arrivo col DDT: finestra del modello anche per pezzi del DDT; il DDT compare solo dopo aver scelto «Nuovo» | o3 |
| P-105 | (A12) Caricare il DDT come file o foto (§12.2, mappatura Excel §11.2): PRIMA della demo (D-43). Server: file delle versioni precedenti conservati e keepFiles (D-47) su main (o2). App 9–10 h (stima di o3: file allegati e anteprima, Excel con scelta delle colonne, stato unico «righe da confermare», e2e); su main entro il 08/11 | o3 + o2 |
| P-78 | (diagnosi del 02/11: a utente singolo una lettura subito dopo l'accesso va «Inviata» in 2 s; i blocchi lunghi erano il carico delle prove) Caricamento a pagine fatto; misura «Inviata entro 10 s» su main (d544338). Da misurare su un telefono vero col progetto vero (P-21) | o3 |

## Da fare

| # | Cosa | Chi | Criterio |
|---|---|---|---|
| P-21 | Lettura con la fotocamera su telefoni veri (Android: motore nativo; iPhone: zxing): preparare la prova guidata, il committente la esegue sui telefoni | o3 + committente | 3 |
| P-44 | Letture dell'app negate a ragione dalle regole: coperte dal commit 9a47902 di o3 (luoghi per ambito, resi del magazzino cliente, anomalie solo per chi le legge); resta da confermare col primo giro delle e2e | o3 | 1 |
| P-31 | Guida completa per ruolo (D-52): censimento fatto (bf65dfc, 39 incongruenze nelle voci P-114…P-117); prima versione di `GUIDA.md` (sha 69e14f14e5c4) da far leggere al committente; versione HTML `GUIDA.html` fatta (stesso testo, controllato parola per parola) e i testi brevi della pagina «Guida» nell'app, da passare a o3. Da aggiornare a ogni lotto con le funzioni riparate | reg | 3 |

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
| P-114 | Dal censimento, server: trasferimento «ricevuto», DDT di reso confrontato con la spedizione, BOM dalla sua data e «accetta in silenzio», pezzo tolto annullando la sua unica lettura (contatori compresi, D-53), resoconti non sovrascritti, export che dice se è troncato, nessuna categoria disattivata suggerita | o2 | 03/11/2026 (152b6a3) |
| P-92 | BOM: direzione obbligatoria (pagina cbcb602, server 1d1e288) | o2 + o3 | 03/11/2026 |
| P-106 | Nomi leggibili dei file scaricati | o3 | 03/11/2026 (5560a2c) |
| P-99 | L'ufficio cliente vede e genera il resoconto di una sola ASP | o3 | 03/11/2026 (5560a2c) |
| P-103 | L'avviso di un reso apre il reso; pulsanti del documento solo ai ruoli ammessi | o3 | 03/11/2026 (7768daa) |
| P-97 | Documenti del magazzino cliente: niente più caricamento infinito (indice di o2) | o3 + o2 | 03/11/2026 (7768daa) |
| P-108 | Pulsanti «Foto» e «Annulla» spenti riconoscibili, con spiegazione | o3 | 03/11/2026 (3d1f475) |
| P-109 | Avviso «Già letto» per la lettura doppia ignorata | o3 | 03/11/2026 (3d1f475) |
| P-112 | Chiudere «Pezzo sconosciuto» registra la lettura e la fotocamera riparte (D-50) | o3 | 03/11/2026 (82dac6e) |
| P-113 | Ricerca del modello per nome o codice nella finestra «Pezzo sconosciuto» | o3 | 03/11/2026 (aca787e) |
| P-119 | Telefono: la barra in alto era larga 19 px più dello schermo (pagina rimpicciolita, tocchi spostati) | o3 | 03/11/2026 (ad6edbf) |
| P-101 | Pagina Pezzi filtrabile per stato, ASP, sito o magazzino e modello; numeri del cruscotto aprono la lista filtrata; 200 alla volta (4 indici). Difetto proprio trovato dalla e2e della raffica e riparato | o2 | 03/11/2026 (6b36997) |
| P-77 | Spedizioni di un'ASP: ultime 200 inviate e 200 ricevute (2 indici) | o2 | 03/11/2026 |
| P-94 | Storia del pezzo con organizzazione e ruolo, mai il nome | o2 | 03/11/2026 |
| P-95 | Avvisi e confronto dei documenti con l'elenco dei seriali mancanti e inattesi | o2 | 03/11/2026 |
| P-98 | Raffica col telefono vero: lo stesso pezzo non si registra più due volte con la fotocamera ferma sul codice | o3 | 03/11/2026 (d01510b) |
| P-96 | Niente testi grezzi (Home dell'ufficio cliente, Anomalie, Esportazioni); errori del server tradotti; foto del DDT compressa; controllo permanente delle chiavi in check:i18n | o3 | 03/11/2026 (8e3d5bc) |
| P-90 | Il numero di pezzi della spedizione cresce solo alla prima lettura del pezzo (3 rosse prima) | o2 | 03/11/2026 (e50f90e) |
| P-91 | «Annulla l'ultima» in un reso o trasferimento toglie la riga e fa scendere il conteggio; riga già confermata o arrivata resta | o2 | 03/11/2026 (9eeba8a) |
| P-93 | Rilettura di un pezzo nella stessa spedizione senza anomalia (D-41) | o2 | 03/11/2026 (6bcee66) |
| P-3 | Residui di Emergent cancellati: `memory/`, `test_result.md`, `test_reports/` (reg); `tests/__init__.py` (o2, 6b36997). Restano nella storia di git | reg + o2 | 03/11/2026 |
| P-89 | Scarico online di export, resoconti e foto: mancava la regola CORS del bucket (errore visto in console dal committente); `scripts/storage-cors.json` (57753c4) applicato dal committente con gcloud, export scaricato | o2 + committente | 03/11/2026 |
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

**AI nell'app:** il 03/11/2026 il committente ha deciso la prima applicazione, la lettura di DDT e BOM (D-45, P-107). Altri candidati per dopo: spiegazione in parole semplici di anomalie e differenze; lettura di etichette rovinate dalla foto. Resta aperta la domanda al cliente sulle sue regole per l'AI.

**Luogo indicato da un superiore (D-48, P-110):** dopo la demo, un superiore può indicare all'operaio dove lavorerà. Da progettare con il committente: chi assegna, durata, cambio da parte dell'operaio, offline, chi la vede (criterio 1).

**Dal censimento, dopo la demo (stime di o2 del 03/11):** campi extra che alimentano «Da completare» (n.14: campo calcolato sul pezzo e ricalcolo a blocchi, o2 3–4 h + o3 3 h + ricalcolo online del committente); rietichettatura con la sua schermata (n.37: server già pronto, o2 45 min + o3 2–3 h; domanda al cliente ancora aperta). Il n.27 (fotografia di fine mese nel resoconto, proposta A di o2: 2–3 h, solo server) va prima della demo, P-120.

Risposte mancanti del cliente (PASSAGGIO_DI_CONSEGNE §5); estensione Trigger Email per gli inviti veri; App Check; MFA e accessi Google/Microsoft con provider veri; un progetto Firebase definitivo al posto dell'escamotage; app da store con Capacitor; divisione del bundle (avviso sopra 500 kB); scollegare Google Analytics dal progetto (facoltativo).
