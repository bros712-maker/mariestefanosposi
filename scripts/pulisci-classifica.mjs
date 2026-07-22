// scripts/pulisci-classifica.mjs
// Rimuove dalla classifica di "Corri Mari!" i punteggi fisicamente impossibili
// (quelli inseriti barando prima dell'introduzione dell'anti-cheat).
//
// USO (in locale, con le variabili Upstash Redis di Vercel caricate):
//   node scripts/pulisci-classifica.mjs           # mostra cosa rimuoverebbe (dry-run)
//   node scripts/pulisci-classifica.mjs --applica # rimuove davvero
//
// Le credenziali le prende da process.env (KV_REST_API_URL, KV_REST_API_TOKEN),
// le stesse usate da api/score.js: su Vercel ci sono gia'; in locale usa
// `vercel env pull` per scaricarle.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const KEY = 'corrimari:punteggi';
const SOGLIA_MIN = 10.9;
const SEC_PER_CUORE = 0.35;
const MAX_CUORI = 15;

function impossibile(r) {
  const sec = Number(r.secondi);
  const cuori = Number(r.cuori);
  if (!Number.isFinite(sec)) return 'tempo non numerico';
  if (!Number.isInteger(cuori) || cuori < 0 || cuori > MAX_CUORI) return 'cuori fuori range';
  const soglia = SOGLIA_MIN + cuori * SEC_PER_CUORE;
  if (sec < soglia) return `${sec}s con ${cuori} cuori (minimo ${soglia.toFixed(1)}s)`;
  return null;
}

const applica = process.argv.includes('--applica');

const righe = (await redis.get(KEY)) || [];
console.log(`Classifica attuale: ${righe.length} punteggi\n`);

const buoni = [];
const sospetti = [];
for (const r of righe) {
  const motivo = impossibile(r);
  if (motivo) sospetti.push({ r, motivo });
  else buoni.push(r);
}

if (sospetti.length === 0) {
  console.log('Nessun punteggio impossibile. Classifica pulita.');
  process.exit(0);
}

console.log(`Punteggi SOSPETTI da rimuovere: ${sospetti.length}`);
for (const { r, motivo } of sospetti) {
  console.log(`  - ${r.nome}: ${motivo}`);
}
console.log(`\nRimarrebbero: ${buoni.length} punteggi validi`);

if (!applica) {
  console.log('\n(dry-run: nessuna modifica. Rilancia con --applica per rimuoverli.)');
  process.exit(0);
}

buoni.sort((a, b) => a.secondi - b.secondi || b.cuori - a.cuori);
await redis.set(KEY, buoni);
console.log(`\nFatto. Rimossi ${sospetti.length} punteggi. Classifica ora: ${buoni.length}.`);
