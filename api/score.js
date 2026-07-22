// /api/score  —  classifica "Corri Mari!"
// GET  -> restituisce la classifica ordinata (tempo crescente, poi cuori decrescenti)
// POST -> salva un punteggio {nome, secondi, cuori, prova}
//
// Storage: Upstash Redis via Vercel Marketplace (sostituisce il dismesso @vercel/kv).
// Il filesystem di Vercel e' read-only ed effimero, quindi un vero file .txt non
// sopravviverebbe ai deploy: Redis e' l'equivalente durevole.
//
// ANTI-CHEAT (3 livelli, vedi minigame/ANTICHEAT.md):
//  1. Validazione fisica: rifiuta tempi impossibili da ottenere giocando.
//  2. Coerenza cuori/tempo: piu' cuori richiedono piu' percorso -> tempo minimo piu' alto.
//  3. Token di gioco ("prova"): firma HMAC generata durante la partita. Una richiesta
//     fabbricata a mano nella console del browser non ha una prova valida.

import { Redis } from '@upstash/redis';
import crypto from 'crypto';

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

// --- vincoli fisici, ricavati dal codice del gioco ---
// Livello 4470px, velocita' max 6.5px/frame @60fps -> minimo teorico 11.46s.
// Sotto questa soglia il tempo e' fisicamente impossibile.
const SOGLIA_MIN = 10.9;            // margine sotto il teorico
const SEC_PER_CUORE = 0.35;         // ogni cuore raccolto aggiunge percorso minimo

// Segreto condiviso col client. In produzione mettilo come variabile d'ambiente
// su Vercel (Settings -> Environment Variables: CORRIMARI_SECRET) e leggilo da process.env.
const SECRET = process.env.CORRIMARI_SECRET || 'ste-mari-2026-cambami';

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

// Ricostruisce la firma attesa e la confronta con quella inviata.
// La "prova" e': HMAC(secondi|cuori|frames, SECRET). Il client la genera solo
// alla fine di una partita reale, usando i valori effettivi di gioco.
function provaValida(secondi, cuori, prova) {
  if (!prova || typeof prova !== 'object') return false;
  const { frames, sig } = prova;
  if (!Number.isFinite(frames) || typeof sig !== 'string') return false;

  // I frame devono essere coerenti col tempo dichiarato (~60fps, con tolleranza).
  const attesiMin = secondi * 45;   // anche a framerate basso
  const attesiMax = secondi * 75;   // e con un po' di margine alto
  if (frames < attesiMin || frames > attesiMax) return false;

  // Ricalcolo la firma e confronto in modo sicuro.
  const base = `${secondi.toFixed(1)}|${cuori}|${frames}`;
  const atteso = crypto.createHmac('sha256', SECRET).update(base).digest('hex');
  const a = Buffer.from(atteso);
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

      // 1+2. Soglia fisica, piu' severa in base ai cuori raccolti.
      const sogliaMin = SOGLIA_MIN + cuori * SEC_PER_CUORE;
      if (secondi < sogliaMin) {
        return res.status(400).json({
          ok: false,
          errore: 'Tempo impossibile per il numero di cuori raccolti',
        });
      }

      // 3. Token di gioco.
      if (!provaValida(secondi, cuori, body.prova)) {
        return res.status(400).json({ ok: false, errore: 'Partita non valida' });
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
