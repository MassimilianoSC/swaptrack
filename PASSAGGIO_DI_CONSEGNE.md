# Passaggio di consegne alla nuova MEMORIA STORICA

> **Nota del 29/10/2026, sera (memoria storica nuova):** la cartella di lavoro è ora `C:\Users\mcracchiolo\Desktop\swaptrack` (il committente l'ha spostata da `C:\dev\swaptrack`; i comandi qui sotto vanno letti con la cartella nuova). I documenti vivi sono `CLAUDE.md`, `REGISTRO.md`, `PIANO.md`, `DA_FARE.md`: questo file resta come storia e non si aggiorna.

Scritto il 29/10/2026 dalla memoria storica precedente (una sessione di Claude Code aperta nella cartella dell'app vecchia, `C:\Users\mcracchiolo\Desktop\APP_CANTIER_QRCODE`), che ha seguito il progetto dall'inizio. Leggilo per intero prima di qualunque altra cosa: contiene ciò che non si ricava dal codice.

Il committente (Massimiliano, il titolare) non è un tecnico: parlagli in italiano semplice.

---

## 1. Cos'è SwapTrack, in breve

- **SwapTrack** è una PWA che traccia apparati telecom («board») leggendo il codice a barre di ogni pezzo, lungo i due percorsi di un progetto di sostituzione della rete (swap):
  - **materiale nuovo:** magazzino del cliente → magazzino della ditta installatrice (ASP) → montaggio nel sito;
  - **materiale smontato:** smontaggio nel sito (spesso senza rete) → magazzino ASP → smistamento con regole del cliente → reso al cliente, che conferma il documento di trasporto (DDT).
- **Lo scopo è tracciare i MATERIALI, non le lavorazioni**: niente pianificazione di squadre o calendari (frase del committente).
- **Il cliente è Ericsson**, che compra l'app; la usano Ericsson e circa dieci ASP (ognuna con ≥2 magazzini, ognuna vede solo il suo materiale e i suoi siti; ogni sito è di una sola ASP). 50–100 persone, decine di migliaia di board, migliaia di siti, 1–3 anni, partenza a gennaio 2027.
- **HQE vende l'app** (non è l'installatore). Il prodotto sarà venduto anche ad altri clienti con il loro nome e marchio.
- **La fonte di verità tecnica è `SPEC.md`** (versione 3, verificata due volte da un revisore avversativo). Va letta prima di toccare qualunque cosa.

## 2. Obiettivo e criteri (approvati dal committente il 29/10/2026, «dinamici»: ne potrà aggiungere)

**Obiettivo:** una demo di SwapTrack che funziona davvero, da mostrare a un **consulente Ericsson intorno all'11 novembre 2026**, che sia anche base solida per la produzione (gennaio).

**Criteri**, in ordine (in conflitto vince il più in alto):
1. **Riservatezza:** nessuna ASP vede materiale, siti o persone di un'altra; nessuna vista per singola persona; niente GPS. Non negoziabile.
2. **Dati giusti:** mai un pezzo doppio o perso; una scansione fatta senza rete arriva sempre.
3. **Funziona nella demo:** i percorsi che vedrà il consulente funzionano su computer e telefoni (Android e iPhone).
4. **Fedele a quanto deciso:** la specifica e le risposte del committente; se divergono, valgono le risposte.
5. **Semplice:** la soluzione più semplice che regge; niente funzioni nuove non richieste.
6. **Aspetto:** decide il committente.

## 3. Il metodo di lavoro voluto dal committente

Il committente ha definito un metodo con tre sessioni (memoria storica + o2 + o3) e documenti precisi (`CLAUDE.md`, `REGISTRO.md`, `PIANO.md`, `DA_FARE.md`, mappa «una cosa, un posto»). Te lo ridarà lui. Al momento di questo passaggio: **obiettivo e criteri approvati (§2); i documenti del metodo NON sono ancora stati creati; la divisione del codice tra o2 e o3 e le copie di lavoro (git worktree) NON sono ancora state fatte.** Una proposta era: o2 = `functions/`, regole, indici, `scripts/`, `tests/`; o3 = `src/`, `public/`, `index.html`, configurazione Vite/Tailwind, `package.json` della radice, prove end-to-end in `e2e/`; memoria storica = documenti e configurazione delle installazioni. Il punto di contatto è `functions/src/shared/operations.ts` (mappa delle operazioni, di o2).

**Preferenze del committente** (valgono sempre):
- italiano semplice; risposte brevi; una domanda alla volta, sempre con una proposta consigliata e il perché; mai pannelli a scelta multipla;
- **i comandi da lanciare si danno con la cartella** (`cd C:\dev\swaptrack` prima), per PowerShell;
- **push, deploy, configurazioni cloud e script contro il progetto online li lancia lui**; le sessioni non pubblicano (i permessi lo impediscono, ed è voluto);
- passi uno alla volta quando lo guidi in una console («dimmi solo la prima cosa»);
- nessun dato reale di persone, nessun segreto nei file o in chat;
- stime realistiche, e dire subito se una stima era sbagliata.

## 4. La storia, perché conta

1. **L'app vecchia** («Cantiere», repo `APP_CANTIER_QRCODE`, progetto Firebase `cantiere-qr-app`) era stata costruita senza conoscere il processo del cliente (immaginava un trasloco di attrezzi). Resta accesa come riserva, ma **SwapTrack è un progetto indipendente**: non va mai riutilizzato `cantiere-qr-app`.
2. **Tre giri di domande** al commerciale e al cliente (ottobre 2026) hanno chiarito il dominio. Le risposte sono riassunte in §5.
3. **Decisione: nuova PWA generata con Emergent** (emergent.sh) da una specifica scritta da noi, come **base della produzione** (non demo usa e getta), poi perfezionata in locale. Regole date a Emergent: 4 prompt, niente cicli di prove (esperienza del committente: costosi e inutili), solo emulatori, nessun deploy, dati finti.
4. La specifica è stata **rivista due volte da Fable** (revisore avversativo, modello diverso in sessione pulita): 41 rilievi alla v1, poi una verifica alla v2 con un grave nuovo, tutti chiusi nella v3. I documenti di quel lavoro stanno nel repo vecchio, cartella `swaptrack/` (SPEC storiche, PROMPTS, consegna, revisioni, istruzioni).
5. **Emergent ha costruito i passi 1–4.** Il passo 3 si era fermato a metà perché la memoria dell'agente era piena: rimedio con **«Fork»** (nuova chat con riassunto) e modello **Claude Opus 4.7 – 1M**. Poi un lavoro extra (Excel/PDF veri, spunte BOM, percorso documenti con il tipo, casella resi del magazzino cliente).
6. Il collegamento Emergent→GitHub non funzionava: il codice è stato **scaricato dal VS Code nel browser di Emergent** come archivio e aperto in `C:\dev\swaptrack`, poi pubblicato su **GitHub `MassimilianoSC/swaptrack`** (privato).
7. **Deploy** il 29/10 (vedi §6). La prima impressione del committente sulla vista desktop: «molto positiva», con errori da sistemare.

## 5. Le risposte del cliente (sintesi, fanno testo sulla specifica)

- Ericsson compra; Ericsson e ASP usano l'app; ~10 ASP con ≥2 magazzini; ogni ASP vede solo il suo; 50–100 persone, accessi personali, tutti con email di lavoro.
- Accessi: **Ericsson abilita le ASP, ogni ASP abilita il suo personale.** HQE configura all'inizio, poi forma il cliente; i difetti restano a HQE.
- **Trasferimenti fra ASP diverse: li decide e crea Ericsson.** **Chi abilita i colleghi di un'ASP ha anche tutti i permessi del magazziniere.**
- Materiale nuovo con codice a barre; niente materiale a quantità; si legge ogni pezzo anche se in scatola. Di Ericsson e di altri produttori, etichette simili.
- Nuovo: l'app registra **solo l'arrivo** nel magazzino ASP (non l'uscita da Ericsson); viaggia con DDT; al montaggio basta il sito; max ~30 giorni in ASP; difettoso/avanzato classificato in ASP e poi reso.
- Smontato: si registra **nel sito**, spesso **senza rete**; smistamento del magazziniere da solo, criteri per sito e modello; differenze rispetto al previsto registrate e **segnalate a Ericsson solo dentro l'app**; rivendita e smaltimento li fa Ericsson; reso entro ~30 giorni, Ericsson conferma il DDT intero.
- Il **previsto di un sito** è la **BOM** che l'ASP prepara (PDF o Excel). I **DDT** arrivano da un gestionale esterno di Ericsson come **JPEG, PNG, PDF o Excel**: l'app li **confronta** con il materiale.
- Il cliente vuole: quantità anche per sito e modello, storia del singolo pezzo, aggiornamento entro minuti, export filtrabile (sito, modello), **resoconto mensile PDF + Excel a Ericsson e a ogni ASP**. Valore dei materiali non richiesto ora.
- Telefono, computer e lettori a pistola; Android e iPhone; dentro e fuori; **inglese per tutto**. Foto solo dei pezzi. Responsabili dei dati: Ericsson e ASP. Niente pesate.
- **Ancora senza risposta dal cliente:** quale codice leggere se su una board ce n'è più d'uno; altri campi dei pezzi; pezzi fuori elenco; rietichettatura; formato del programma settimanale; il gestionale Ericsson e gli scambi di dati; gestione dei telefoni (MDM); conservazione dei dati; requisiti di sicurezza; elenco board e nomi delle parti; foto delle etichette; regole sull'AI; accesso con account aziendale e verifica in due passaggi; un esempio di DDT e di BOM.

## 6. L'installazione demo: «kronos-caffe-sito» è un ESCAMOTAGE

⚠️ L'app pubblicata gira sul progetto Firebase **`kronos-caffe-sito`** (numero 840240907477, account personale del committente `m.scardovellicrac@gmail.com`), rinominato «SwapTrack Demo». È un **escamotage**: l'account personale aveva raggiunto il limite di progetti (un progetto eliminato conta per 30 giorni) e l'organizzazione dell'account aziendale `hqe.it` potrebbe avere regole che bloccano le funzioni chiamabili dal browser (indizio: nel progetto aziendale `portale-sicurezza-4aad2` le funzioni hanno la policy di accesso vuota). È scritto anche nel README e in `DECISIONS.md` (D39). **Non ha nessun legame con SwapTrack**; quando ci sarà un progetto giusto si pubblica lì e questo si dismette.

- **Indirizzo dell'app: https://swaptrack-demo.web.app** (sito Hosting dedicato, target `app`). Il sito predefinito `kronos-caffe-sito.web.app` ha il vecchio sito di un bar: al committente non interessa, **da spegnere** (`firebase hosting:disable --site kronos-caffe-sito --project demo`, lo lancia lui).
- Firestore e Storage in `europe-west1`; Authentication email/password (Google attivato in console ma spento nell'app); **Identity Platform attivo**; piano Blaze; avviso di budget.
- Configurazione: `.env.demo` (valori web pubblici, `VITE_FIREBASE_AUTH_DOMAIN=swaptrack-demo.web.app`), `functions/.env.kronos-caffe-sito` (`APP_URL`), alias `demo` in `.firebaserc`. Build: `yarn build:demo`.
- **Comandi di deploy** (li lancia il committente, da `C:\dev\swaptrack`):
  - regole e indici: `firebase deploy --only firestore,storage --project demo`
  - funzioni: `firebase deploy --only functions --project demo --force`
  - app: `yarn build:demo` poi `firebase deploy --only hosting:app --project demo`
- **Dati finti caricati sul progetto vero** (organizzazione «Telco Demo», 3 ASP, 1.507 luoghi, 20 modelli, 5.000 pezzi, 12.000 eventi): `SEED_REAL_PROJECT=kronos-caffe-sito node scripts/seed.mjs --yes-real-project`, poi lo stesso con `scripts/fullSeed.mjs` (credenziali: `gcloud auth application-default login` + `set-quota-project kronos-caffe-sito`).
- **Account demo** (inventati): `client.admin.telco@swaptrack-demo.test`, `asp.technician.nord@swaptrack-demo.test`, ecc. (elenco in README), password `SwapDemo2026`. ⚠️ La password è scritta nel repository: **va cambiata prima di condividere l'indirizzo** oltre il consulente.
- Il progetto ha ancora collegato Google Analytics dal suo uso precedente: SwapTrack non lo carica mai; si può scollegare dalla console.

## 7. Cosa è già stato corretto in locale dopo Emergent (commit su `main`)

- `fullSeed.mjs` usava una formula inventata per il codice dei pezzi (`cid_…`) invece della funzione d'identità vera: i pezzi finti non si sarebbero ritrovati con la scansione. **Corretto** prima di caricare i dati.
- **10 indici Firestore mancanti** (export, documenti per ASP, anomalie del pezzo, eventi per luogo/ASP/pezzo, lavori notturni) aggiunti a `firestore.indexes.json` e pubblicati.
- **Pulsante «Installa l'app»** (mancava: Emergent aveva fatto solo l'avviso per iPhone) nella pagina di accesso e banner dentro l'app.
- **Logo**: il codice a barre arancione dell'app vecchia (l'unica cosa che al committente piaceva) come icona dell'app, favicon e simbolo accanto al nome.
- `.gitattributes` (a capo LF per gli script), `.firebase/` nel `.gitignore`.

## 8. Cosa resta da fare (non c'è ancora un PIANO.md: va creato)

**Subito:**
- creare i documenti del metodo (§3) e la divisione del codice;
- raccogliere le **differenze che il committente sta notando** rispetto all'app vecchia e dividerle in: errori / cose della specifica non fatte / scelte diverse da valutare. Già segnalate: **la raffica** (c'è — la fotocamera riprende da sola dopo ogni lettura — ma manca il contatore e l'elenco ben visibile delle letture appena fatte, come nell'app vecchia); «anche altre cose» da farsi elencare;
- spegnere il sito `kronos-caffe-sito`; cambiare la password demo prima di condividere; scollegare Google Analytics (facoltativo).

**Verifiche da fare in locale (le prove vere, che Emergent non ha fatto):**
- **regole di accesso fra le ASP** (criterio 1): prove sulle regole con l'emulatore, come nell'app vecchia (`test-rules-emulator.js` nel repo vecchio è un buon modello);
- **ricalcolo dello stato e scansioni senza rete** (criterio 2): due telefoni offline sullo stesso pezzo, una scansione delle 10 sincronizzata alle 18; e la scelta di Emergent **D25** (un evento vietato su un codice sconosciuto non crea il pezzo) da verificare contro la specifica §9.2;
- **lettura con la fotocamera su telefoni veri**, Android e iPhone (motore nativo e zxing);
- foto con la coda senza rete; funzioni bloccanti con Identity Platform vero; lavori programmati (non partono sugli emulatori);
- `NOT_DONE.md` elenca ciò che Emergent non ha potuto verificare.

**Aperti più avanti:** risposte del cliente mancanti (§5); estensione email (Trigger Email) per gli inviti veri; App Check; un progetto definitivo al posto dell'escamotage; app da store con Capacitor se il cliente lo chiede (il codice è già predisposto: motore di lettura dietro un'interfaccia, `src/lib/scanner/engine.js`).

## 9. Trappole già incontrate (non ricaderci)

- **`authDomain` deve essere il dominio da cui si apre l'app** (`swaptrack-demo.web.app`), non `…firebaseapp.com`: altrimenti il login fallisce in silenzio sul telefono e nell'app installata.
- **Primo deploy delle funzioni:** il trigger `onEventCreated` può fallire per i permessi di Eventarc non ancora propagati: si aspetta ~10 minuti e si rilancia. Il trigger richiede sempre `--force`.
- **Dopo ogni deploy delle funzioni** verificare che le 8 funzioni smistatrici (`users`, `catalog`, `settings`, `items`, `shipments`, `documents`, `alerts`, `desk`) abbiano `allUsers` → `roles/run.invoker` (`gcloud run services get-iam-policy users --region europe-west1 --project kronos-caffe-sito`). Al 29/10 sono a posto.
- **Indici:** gli emulatori non li chiedono, il progetto vero sì. Ogni ricerca nuova con più filtri va aggiunta a `firestore.indexes.json`.
- **Account sugli strumenti:** Firebase CLI e gcloud hanno sia l'account personale sia `m.cracchiolo@hqe.it`. Per SwapTrack serve il **personale** (proprietario di `kronos-caffe-sito`). Le credenziali possono scadere: `firebase login --reauth` / `gcloud auth login`. Usare `--account` invece di cambiare l'account attivo.
- **Codice fuori da OneDrive:** `C:\dev\swaptrack` è fuori dal Desktop apposta (sul Desktop OneDrive bloccava le cartelle di build).
- **Mai caratteri di controllo letterali nei sorgenti** (usare `\u`): sono invisibili e gli strumenti li perdono.

## 10. Dove sta cosa

| Cosa | Dove |
|---|---|
| Codice, documenti di SwapTrack | `C:\dev\swaptrack` (ramo `main`), GitHub `MassimilianoSC/swaptrack` |
| Specifica (fonte di verità) | `SPEC.md` |
| Scelte fatte da Emergent (D1–D39) | `DECISIONS.md` |
| Cosa Emergent non ha fatto o verificato | `NOT_DONE.md` |
| Come si avvia, prova, pubblica; l'escamotage | `README.md` |
| File adattati dall'app vecchia (da non riscrivere) | `consegna/README.md` |
| Storia della specifica, revisioni di Fable, prompt dati a Emergent | repo vecchio, cartella `swaptrack/` |
| Le pagine con le domande e le risposte dei tre giri | claude.ai/artifact/WU5J1NtMVedaFJJWBM6dSE, …/NZzXre9E1oJAWE9LyWaPSr, …/SZLBYrDu9ZFPn74WVqCdnr |
