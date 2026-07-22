# Anti-cheat — Corri Mari!

## Il problema
La classifica era manipolabile: chiunque poteva aprire la console del browser (F12)
e inviare un punteggio falso con una riga, senza giocare. I tempi tipo "7.7s" erano
**fisicamente impossibili** (il minimo teorico per finire il livello e' ~11.5s).

## Le tre difese (nell'API `api/score.js`)

1. **Validazione fisica** — rifiuta ogni tempo sotto la soglia minima (10.9s).

2. **Coerenza cuori/tempo** — piu' cuori richiedono piu' percorso, quindi un tempo
   minimo piu' alto: 0 cuori -> 10.9s, 15 cuori -> 16.1s. Un "15 cuori in 8s" cade.

3. **Token di gioco (HMAC)** — durante la partita il client conta i frame e, alla
   vittoria, firma `tempo|cuori|frames` con un segreto condiviso. L'API ricalcola la
   firma e verifica. Una richiesta fabbricata a mano non ha una firma valida, e
   modificarne un valore (es. dichiarare piu' cuori) rompe la firma.

## Limite onesto
Il segreto vive nel JavaScript del browser: chi legge e capisce il codice puo'
estrarlo. **Nessuna protezione e' perfetta** quando il gioco gira sul dispositivo
dell'utente. Ma questo alza enormemente l'asticella: da "una riga in console" a
"leggere il codice, estrarre il segreto e replicare l'algoritmo HMAC". Ferma il 99%.

Per rendere il segreto piu' robusto, su Vercel imposta la variabile d'ambiente
`CORRIMARI_SECRET` (Settings -> Environment Variables) con un valore tuo, e cambia
di conseguenza `CM_SECRET` nel client (`minigame/corri-mari.js`). Tienili uguali.

## Pulire i punteggi falsi gia' presenti
```
vercel env pull .env.local          # scarica le credenziali Upstash Redis
node scripts/pulisci-classifica.mjs           # mostra cosa rimuoverebbe (dry-run)
node scripts/pulisci-classifica.mjs --applica # rimuove davvero
```
Rimuove solo i punteggi fisicamente impossibili, lasciando intatti quelli validi.
