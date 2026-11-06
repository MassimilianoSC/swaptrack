# Prima della presentazione

Cosa fare il giorno prima della demo, in ordine. Ogni comando si copia così com'è in **PowerShell**: comincia sempre con `cd`, quindi va bene da qualunque cartella.

Ci vogliono circa 40 minuti, più la prova completa del copione (`swaptrack-guida/COPIONE_DEMO.md`).

---

## 1. Telefoni: svuotare la coda PRIMA della pulizia

Su ogni telefono usato nelle prove (tecnico Nord e magazziniere Nord):

- aprire l'app **con la rete**;
- aspettare che in alto sparisca «da inviare».

Altrimenti le letture e le foto rimaste in coda partono dopo la pulizia e i dati delle prove tornano online. «Esci» non svuota la coda.

## 2. Accesso a Google Cloud (solo la prima volta sul computer)

```powershell
cd C:\Users\mcracchiolo\Desktop\swaptrack; gcloud auth application-default login
```

Si apre il browser: entrare con l'account che amministra il progetto della demo.

## 3. Pulizia: prima guardare, poi fare

**3a. Solo guardare (non cancella niente):**

```powershell
cd C:\Users\mcracchiolo\Desktop\swaptrack; $env:RESET_REAL_PROJECT="kronos-caffe-sito"; node scripts/resetDemo.mjs --yes-real-project
```

Cosa guardare nell'uscita:

- **«Client administrators kept … 1»** (o più): c'è almeno un amministratore cliente che resta e può entrare. Se compare **«STOP: no active client administrator»**, non andare avanti e chiamare il gruppo.
- La tabella delle collezioni: accanto a ognuna c'è **«delete N»** (si cancella) oppure **«kept»** (resta). Restano le persone, le organizzazioni, le impostazioni (Google, e-mail, AI, logo) e il catalogo (luoghi, modelli, categorie). Si cancellano le letture, i pezzi, i documenti, le spedizioni, gli avvisi, le anomalie e i loro file.
- **«NOT of SwapTrack (left)»**: dati o file che non sono di SwapTrack (per esempio del vecchio sito del caffè). Non vengono toccati.

**3b. Fare la pulizia:**

```powershell
cd C:\Users\mcracchiolo\Desktop\swaptrack; $env:RESET_REAL_PROJECT="kronos-caffe-sito"; node scripts/resetDemo.mjs --yes-real-project --apply
```

Chiede di scrivere l'id del progetto: scrivere `kronos-caffe-sito` e premere Invio. Poi fa da solo, in fila:

1. il controllo dell'amministratore;
2. la cancellazione;
3. il seed, che crea solo ciò che manca;
4. il seed completo: circa 12.000 letture, alcuni minuti;
5. il controllo finale.

Se un passo va storto, si ferma e scrive **«STOP at step N»**: i passi dopo non vengono fatti. Si può rilanciare lo stesso comando: riparte da capo e finisce il lavoro.

## 4. Il controllo finale: cosa guardare

L'ultimo passo stampa due parti. Ogni riga comincia con **OK** (va bene) o **NO** (da sistemare). Le righe senza OK/NO sono informazioni.

**Parte «What the demo script takes for granted»:**

| Riga | Cosa vuol dire | Con un NO |
|---|---|---|
| `account <ruolo> of <organizzazione>` | l'account del copione esiste, ha ruolo e ditta giusti ed è attivo | «missing»: rilanciare il comando 3b. «Auth disabled»: riattivare l'account. Amministratore cliente: menu «Utenti» → riga della persona → «…» («Azioni») → «Riattiva» → nella finestra «Riattiva l'utente» premi «Conferma». (Amministratore ASP: lo stesso dal menu «Persone», solo per magazzinieri e tecnici della sua ASP.) Vale anche dopo «Blocca subito»; la persona poi rientra con la sua password, perché le sessioni aperte sono state chiuse. Altro: chiamare il gruppo |
| `privacy notice: not accepted` | al primo accesso comparirà l'informativa | non è un errore: entrare una volta con quell'account e premere «Ho letto e accetto» |
| `active organizations`, `places of the script`, `active models`, `active sorting categories`, `sorting rule` | ditte, luoghi, modelli e categorie del copione | rilanciare il comando 3b (il seed rimette ciò che manca). Se resta NO, qualcosa è stato disattivato a mano: riattivarlo nell'app |
| `settings: …` | riepilogo: versione minima, e-mail, Google, uscita per inattività, informativa, nome dell'app, AI | confrontare con il copione: accendere o spegnere da Impostazioni |
| `no minimum app version` | nessun telefono deve aggiornare | Impostazioni → «Versione minima»: lasciare vuoto |
| `month to pick in «Reports»` | il mese da scegliere in «Rapporti» → «Genera» (tappa 9) | «none»: il seed completo non è andato. Rilanciare il comando 3b |
| `aggregates (home dashboard)` | i conteggi del cruscotto | 0: come sopra, rilanciare il comando 3b |
| `open BOMs at the demo site SITO-00013` | a SITO-00013 non c'è nessuna BOM aperta oltre a quella della demo | chiudere la BOM indicata (Documenti → numero → «Chiudi»). Se la BOM della demo è caricata, compare sotto la riga «the BOM of the demo is loaded»: va bene |
| `demo serials expected by an open document already` | un documento APERTO aspetta già i seriali della demo | chiudere il documento indicato più sopra (Documenti → numero → «Chiudi»), oppure rilanciare il comando 3b |
| `demo serials in closed documents` | documenti chiusi delle prove con gli stessi seriali: danno solo il modello del pezzo | chiamare il gruppo con i seriali indicati |
| `…/guida.html: 200` | la guida dell'app si apre | chiamare il gruppo |

**Parte «Before the demo»:**

- **«Documents of the AI procedure … still OPEN»**: chiudere i documenti elencati.
- **«Demo DDTs already saved»**: dopo la pulizia deve essere 0. Se non lo è, rilanciare il comando 3b.
- **«BOMs of the demo site SITO-00013»**: dopo la pulizia 0; dopo aver caricato la BOM della demo (punto 6), 1.
- **«Events never processed»**: deve essere 0. Se non lo è, aspettare due minuti e rilanciare solo il controllo:

```powershell
cd C:\Users\mcracchiolo\Desktop\swaptrack; $env:CHECK_REAL_PROJECT="kronos-caffe-sito"; node scripts/checkOnline.mjs --yes-real-project
```

L'ultima riga dice **«Everything the demo script takes for granted is there.»** oppure quante righe sono NO.

## 5. Telefoni, dopo la pulizia

1. **Cancellare i dati del sito** su ogni telefono:
   - Android, app installata: tenere premuta l'icona → Info app → Spazio → Cancella dati. Oppure Chrome → Impostazioni sito → swaptrack-demo.web.app → Cancella e reimposta.
   - iPhone: togliere l'app dalla schermata Home e reinstallarla da Safari (Condividi → «Aggiungi alla schermata Home»).
2. **Rientrare** con l'account della demo, con la rete. Se compare «Informativa privacy», premere «Ho letto e accetto».
3. **Aspettare** che in Home «… disponibili offline · aggiornati …» mostri l'ora di adesso: la copia del telefono è pronta per la tappa senza rete.
4. **Telefono del tecnico:** se la BOM di SITO-00013 è stata salvata dopo il punto 3, scegliere SITO-00013 una volta con la rete, così la BOM entra nella copia del telefono.
5. **Nella schermata «Leggi»:** «Raffica» senza spunta (la scelta resta sul telefono), suono acceso.
6. **App aperta dall'icona installata**, non dalla scheda del browser. Telefoni carichi.

## 6. Il resto, dal copione

- **AI accesa o spenta:** Amministratore cliente → «Impostazioni» → «Funzioni».
- **BOM di SITO-00013** caricata il giorno prima (tappa 4), dal file `demo-docs/BOM-SITO-00013.xlsx`.
- **Etichette da stampare.** Se la cartella `demo-docs` non c'è, generarla:

  ```powershell
  cd C:\Users\mcracchiolo\Desktop\swaptrack; node scripts/demoDocs.mjs
  ```

  Poi stampare `demo-docs\etichette-da-stampare.pdf` **al 100%** (non «adatta alla pagina») e ritagliare.
- **Prova completa** del copione una volta. Poi di nuovo i punti 1, 3b, 4 e 5, così la demo parte pulita.
