# Corri Mari! — classifica online

## File

| File | Dove va |
|---|---|
| `corri-mari.js` | il gioco (sprite inclusi) |
| `score.js` | API classifica (va in `/api/score.js` alla radice del progetto) |
| `package.json` | dipendenza `@upstash/redis` |

## Inserire il gioco nel sito

```html
<div id="corri-mari"></div>
<script src="/corri-mari.js"></script>
```

Se l'API sta su un path diverso, dichiaralo **prima** dello script:

```html
<script>window.CORRI_MARI_API = '/api/score';</script>
```

## Attivare la classifica su Vercel

`@vercel/kv` è stato dismesso: la classifica usa **Upstash Redis** tramite il
Marketplace di Vercel (stessa fatturazione, stessa semplicità).

1. `api/score.js` e il `package.json` alla radice sono già pronti.
2. Nel pannello Vercel del progetto: **Storage → Marketplace Database Providers → Upstash**,
   crealo e collegalo al progetto. Vercel inserisce da solo le variabili
   `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`: non serve copiare nessuna chiave.
   In alternativa da CLI: `vercel integration add upstash`.
3. `npm install` (aggiunge `@upstash/redis`), poi deploy.

Fatto. Senza Upstash collegato il gioco funziona lo stesso: si gioca, ma la
classifica mostra "non disponibile" invece di rompersi.

## Come funziona

- **Vittoria** → chiede il nome → salva → mostra la classifica con la tua riga evidenziata.
- **Sconfitta** → "Rigioca" oppure "Classifica".
- Ordinamento: **tempo impiegato crescente**, a parità di tempo più cuori davanti.
- Il nome resta in memoria per la partita successiva (comodo su mobile).

## Note

- Il tempo salvato è quello **impiegato** (100 − timer rimasto), non il timer.
- L'API rifiuta punteggi impossibili (tempo ≤ 0 o > 100, cuori fuori da 0–15)
  e ripulisce il nome da HTML: la classifica è pubblica, meglio non fidarsi del client.
- Restano gli ultimi 500 punteggi, ne vengono mostrati 10.
