# Prendi i Fiori! — mini-gioco per mariestefanosposi.it

Stefano lancia i fiori dall'alto, Mari (il giocatore) li prende in basso.
Ogni fiore mancato costa un cuore; con 3 fiori a terra la partita finisce.
Vince chi raccoglie piu' fiori. Il **fiore d'oro** vale 3.

## Come integrarlo nel sito
Gia' integrato in `index.html` nella sezione "Giochi": il pannello monta il
gioco al click su "Prendi i Fiori!" caricando `minigame/fiori/lancio-fiori.js`
in un `<div id="lancio-fiori"></div>`.

L'API della classifica vive in `api/fiori-score.js` (radice del progetto,
stessa Upstash Redis gia' collegata per "Corri Mari!", vedi `minigame/LEGGIMI.md`).
La chiave usata e' `fiori:punteggi`, separata dalle altre classifiche.

## Difficolta' crescente
Ogni 8 fiori presi il livello sale: lanci piu' frequenti e piu' veloci,
Stefano si muove di piu', e dal livello 4 arrivano i lanci doppi (tripli dal 7).

## Comandi
- Tastiera: frecce (o A/D)
- Mobile: pulsanti a schermo **oppure trascina il dito sul gioco** (consigliato)

## Anti-cheat
Stessa architettura degli altri giochi: tetto fisico sul punteggio (max 12
punti/secondo), coerenza frames/durata, token HMAC firmato durante la partita.
L'API rifiuta le richieste fabbricate da console. Il segreto e' condiviso col
client (`LF_SECRET` nel js, `FIORI_SECRET` come variabile d'ambiente su Vercel):
cambialo prima di pubblicare e tienili uguali.

## Reset classifica
`node scripts/reset-classifica.mjs --applica`  (oppure dal pannello Upstash:
`DEL fiori:punteggi`)
