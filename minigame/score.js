// /api/score  —  classifica "Corri Mari!"
// GET  -> restituisce la classifica ordinata (tempo crescente, poi cuori decrescenti)
// POST -> salva un punteggio {nome, secondi, cuori}
//
// Storage: Upstash Redis via Vercel Marketplace (sostituisce il dismesso @vercel/kv).
// Il filesystem di Vercel e' read-only ed effimero, quindi un vero file .txt non
// sopravviverebbe ai deploy: Redis e' l'equivalente durevole.

import { Redis } from '@upstash/redis';

// L'integrazione Marketplace "Upstash for Redis" espone le credenziali con il
// prefisso KV_ (compatibilita' con il dismesso Vercel KV), non UPSTASH_*:
// Redis.fromEnv() non le troverebbe, quindi le passiamo esplicitamente.
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const KEY = 'corrimari:punteggi';
const MAX_NOME = 24;
const MAX_RIGHE = 500;

// Il timer parte da 100s. "secondi" = tempo IMPIEGATO (100 - tempo rimasto).
const TIMER_START = 100;
const MAX_CUORI = 15;

function pulisciNome(v) {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[<>&"'`]/g, '')   // niente HTML/injection nella classifica pubblica
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOME);
}

function ordina(righe) {
  // piu' veloce prima; a parita' di tempo, piu' cuori prima
  return righe.sort((a, b) => a.secondi - b.secondi || b.cuori - a.cuori);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const righe = (await redis.get(KEY)) || [];
      return res.status(200).json({ ok: true, classifica: ordina(righe).slice(0, 100) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

      const nome = pulisciNome(body.nome);
      const secondi = Number(body.secondi);
      const cuori = Number(body.cuori);

      // validazione: rifiuta punteggi impossibili invece di fidarsi del client
      if (!nome) {
        return res.status(400).json({ ok: false, errore: 'Nome mancante' });
      }
      if (!Number.isFinite(secondi) || secondi <= 0 || secondi > TIMER_START) {
        return res.status(400).json({ ok: false, errore: 'Tempo non valido' });
      }
      if (!Number.isInteger(cuori) || cuori < 0 || cuori > MAX_CUORI) {
        return res.status(400).json({ ok: false, errore: 'Cuori non validi' });
      }

      const righe = (await redis.get(KEY)) || [];
      righe.push({
        nome,
        secondi: Math.round(secondi * 10) / 10,
        cuori,
        data: new Date().toISOString(),
      });

      const salvate = ordina(righe).slice(0, MAX_RIGHE);
      await redis.set(KEY, salvate);

      const posizione = salvate.findIndex(
        (r) => r.nome === nome && r.secondi === Math.round(secondi * 10) / 10
      ) + 1;

      return res.status(200).json({
        ok: true,
        posizione,
        totale: salvate.length,
        classifica: salvate.slice(0, 100),
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, errore: 'Metodo non consentito' });
  } catch (e) {
    console.error('score error:', e);
    return res.status(500).json({ ok: false, errore: 'Errore server' });
  }
}
