# 🐝 Apiari

PWA per la gestione di apiari, famiglie di api e visite apistiche.
Offline-first, nessun account, nessun server: tutti i dati restano sul dispositivo.

| | |
|---|---|
| **Versione** | 1.1 |
| **Autore** | Lazzaro Serva — [www.graficaesiti.it](http://www.graficaesiti.it/) |
| **Licenza** | Tutti i diritti riservati (vedi `LICENSE`) |
| **Tecnologie** | HTML5 · CSS3 · JavaScript vanilla · PWA offline-first |

## Concetto

L'app separa due entità:

- **Apiario** — la postazione fisica (nome, coordinate GPS, accesso, flora, foto)
- **Famiglia** — l'arnia, identificata da un codice univoco, **indipendente**
  dall'apiario: può essere spostata in un'altra postazione mantenendo intatto
  tutto lo storico spostamenti e visite

Ogni famiglia e ogni apiario mostrano uno stato a semaforo (🟢🟡🔴) calcolato
sui giorni trascorsi dall'ultima visita e su eventuali criticità rilevate
(regina non vista, scorte basse, patologie).

## Struttura del repository

```
apiari/
├── index.html            ← struttura + tutte le viste/modali
├── style.css              ← stili (tema alveare, alto contrasto)
├── app.js                  ← logica applicativa
├── manifest.json           ← configurazione PWA
├── service-worker.js       ← cache offline + aggiornamenti
├── assets/
│   ├── icon-192.png              (any, angoli trasparenti)
│   ├── icon-512.png               (any, angoli trasparenti)
│   ├── icon-192-maskable.png      (maskable, full-bleed)
│   ├── icon-512-maskable.png      (maskable, full-bleed)
│   ├── apple-touch-icon.png       (180×180, iOS)
│   ├── favicon.ico
│   ├── favicon-32.png
│   └── favicon-16.png
├── LICENSE
├── AUTHORS
├── README.md
└── CHANGELOG
```

## Funzioni v1.0

- Anagrafica apiari e famiglie (schede indipendenti)
- Spostamento famiglia tra apiari con storico
- Checklist di visita rapida (regina, forza, scorte, patologie, trattamenti, foto, dettatura vocale)
- Trattamento cumulato per tutte le famiglie di un apiario
- Dashboard con stato a semaforo e situazioni critiche in evidenza
- Ricerca e filtri
- Backup/ripristino dati in JSON
- Installabile, offline, con banner di aggiornamento

Roadmap (v2/v3): agenda visite con promemoria, QR code per apertura rapida
scheda famiglia, registro trattamenti con scadenze, report e statistiche
di produzione, percorso ottimizzato multi-apiario, allarmi automatici.

## Uso in locale

Basta aprire `index.html` in un browser moderno, oppure servire la cartella
con un qualsiasi server statico (es. `python3 -m http.server`).

## Pubblicazione su GitHub Pages

1. Crea un repository su GitHub e carica tutti i file di questa cartella nella root
2. Vai su **Settings → Pages**
3. In **Source** seleziona il branch (es. `main`) e la cartella `/ (root)`
4. Salva: l'app sarà raggiungibile all'indirizzo `https://<utente>.github.io/<repo>/`

## Aggiornamenti

Ad ogni nuova versione: incrementa `APP_VERSION`/`version` in `manifest.json`
e il `CACHE_NAME` in `service-worker.js`, così il banner "Nuova versione
disponibile" comparirà automaticamente a chi ha già installato l'app.

## Privacy

Nessun dato lascia il dispositivo. Nessun account, nessuna connessione a
server esterni. Cancellare la cache del browser elimina anche i dati
salvati: usa "Esporta backup" in Impostazioni per avere sempre una copia
di sicurezza. Dettagli completi nel manuale d'uso integrato (tasto ❓).

---
© 2026 Lazzaro Serva - Centola — Tutti i diritti riservati.
