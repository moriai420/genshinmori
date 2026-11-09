# 原神のモリ - genshin no mori - aggiornato

## Funzioni
- Accesso tramite UID Enka senza selezionare un JSON.
- Recupero dei personaggi, statistiche, talenti, armi e manufatti.
- Obiettivi per livello e statistiche, con barre di avanzamento salvate localmente per UID/personaggio.
- Scheda arma cliccabile con statistiche e descrizione/passiva quando presenti nel catalogo statico Enka.
- Icone caricate dagli URL UI di Enka.

## Struttura
- `src/`: frontend.
- `src-tauri/`: app Tauri 2 e comando Rust `fetch_enka`.

## Avvio
Prerequisiti: Rust, Node.js e prerequisiti desktop Tauri 2 installati.

Dalla cartella `src-tauri`:
1. `cargo check`
2. `cargo tauri dev` (se Tauri CLI è installato; altrimenti dalla root del progetto con la configurazione CLI corretta).

La finestra richiede solo l'UID. La vetrina e i dettagli dei personaggi devono essere pubblici su Enka.Network.

## Note
- Gli obiettivi sono salvati nel `localStorage` del dispositivo e non vengono sincronizzati su Enka.
- La passiva di alcune armi può non essere presente nel catalogo Enka scaricato: in quel caso il sito mostra un messaggio esplicito invece di inventarla.
- Non è stata reintegrata la sincronizzazione Notion: questa versione si concentra sull'accesso UID richiesto.
