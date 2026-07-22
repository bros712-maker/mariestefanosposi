// /api/fiori-score  —  classifica "Prendi i Fiori!"
// GET  -> classifica ordinata per fiori decrescenti (a parita', durata crescente)
// POST -> salva {nome, fiori, durata, prova}
//
// Storage: Vercel KV (il filesystem Vercel e' read-only ed effimero).
//
// ANTI-CHEAT (come gli altri giochi):
//  1. Validazione fisica: i fiori raccolti non possono superare quelli lanciabili
//     nel tempo dichiarato (rate di lancio noto).
//  2. Coerenza frames/durata (~60fps).
//  3. Token HMAC firmato durante la partita: una richiesta da console non ha firma valida.

import { kv } from '@vercel/kv';
import crypto from 'crypto';

const KEY = 'fiori:punteggi';
const MAX_NOME = 24;
const MAX_RIGHE = 500;

// Limiti fisici: al livello massimo un lancio ogni 420ms, fino a 3 fiori a lancio,
// fiore d'oro = 3 punti. Tetto prudente: 12 punti/secondo. Durata minima sensata: 5s.
const MAX_PUNTI_AL_SEC = 12;
const MIN_DURATA = 5;
const MAX_DURATA = 3600;
const MAX_FIORI = 5000;

const SECRET = process.env.FIORI_SECRET || 'ste-mari-2026-cambami';

function pulisciNome(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOME);
}

// piu' fiori = meglio; a parita', chi ha resistito meno tempo (piu' efficiente)
const ordina = (r) => r.sort((a, b) => b.fiori - a.fiori || a.durata - b.durata);

function provaValida(fiori, durata, prova) {
  if (!prova || typeof prova !== 'object') return false;
  const { frames, sig } = prova;
  if (!Number.isFinite(frames) || typeof sig !== 'string') return false;
  if (frames < durata * 45 || frames > durata * 75) return false;
  const base = `${fiori}|${durata.toFixed(1)}|${frames}`;
  const atteso = crypto.createHmac('sha256', SECRET).update(base).digest('hex');
  const a = Buffer.from(atteso), b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const righe = (await kv.get(KEY)) || [];
      return res.status(200).json({ ok: true, classifica: ordina(righe).slice(0, 100) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const nome = pulisciNome(body.nome);
      const fiori = Number(body.fiori);
      const durata = Number(body.durata);

      if (!nome) return res.status(400).json({ ok: false, errore: 'Nome mancante' });
      if (!Number.isInteger(fiori) || fiori < 0 || fiori > MAX_FIORI) {
        return res.status(400).json({ ok: false, errore: 'Fiori non validi' });
      }
      if (!Number.isFinite(durata) || durata < MIN_DURATA || durata > MAX_DURATA) {
        return res.status(400).json({ ok: false, errore: 'Durata non valida' });
      }
      // 1. tetto fisico: non puoi aver preso piu' fiori di quanti se ne lanciano
      if (fiori > durata * MAX_PUNTI_AL_SEC) {
        return res.status(400).json({ ok: false, errore: 'Punteggio impossibile' });
      }
      // 2+3. prova di gioco
      if (!provaValida(fiori, durata, body.prova)) {
        return res.status(400).json({ ok: false, errore: 'Partita non valida' });
      }

      const dur = Math.round(durata * 10) / 10;
      const righe = (await kv.get(KEY)) || [];
      righe.push({ nome, fiori, durata: dur, data: new Date().toISOString() });

      const salvate = ordina(righe).slice(0, MAX_RIGHE);
      await kv.set(KEY, salvate);

      const posizione = salvate.findIndex(r => r.nome === nome && r.fiori === fiori) + 1;
      return res.status(200).json({
        ok: true, posizione, totale: salvate.length,
        classifica: salvate.slice(0, 100)
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, errore: 'Metodo non consentito' });
  } catch (e) {
    console.error('fiori-score:', e);
    return res.status(500).json({ ok: false, errore: 'Errore server' });
  }
}
