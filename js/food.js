// Finn Fit — food engine: search, barcode, scanner, voice, AI estimates, portions.
import { get, uid } from './store.js';
import { FOODS } from './fooddb.js';

/* ============================================================ candidates
 * Every searchable food is normalised to:
 * { key, name, brand?, barcode?, source: 'mine'|'generic'|'off'|'ai',
 *   per100?: {kcal, protein, carbs, fat}, serving?: {label, g},
 *   fixed?: {label, kcal, protein, carbs, fat}, fav? }
 * per100 foods can be weighed; fixed foods (old saved entries) are counted in servings.
 */

export function fromLibrary(f) {
  return {
    key: `m:${f.id}`, id: f.id, name: f.name, brand: f.brand || '', barcode: f.barcode || '', source: 'mine',
    per100: f.per100 || null, serving: f.serving || null,
    fixed: f.per100 ? null : { label: f.qty || 'serving', kcal: +f.kcal || 0, protein: +f.protein || 0, carbs: +f.carbs || 0, fat: +f.fat || 0 },
    fav: !!f.fav, lastUsed: f.lastUsed || 0, uses: f.uses || 0,
  };
}

export const myFoods = () => get().library.map(fromLibrary);

export function recents(limit = 12) {
  return myFoods().sort((a, b) => (b.fav - a.fav) || (b.lastUsed - a.lastUsed) || (b.uses - a.uses)).slice(0, limit);
}

/* ============================================================ portions */
const r1 = (n) => Math.round(n * 10) / 10;

/** unit: 'g' | 'serving'. Returns totals for the chosen amount. */
export function portion(c, amount, unit) {
  amount = Math.max(0, +amount || 0);
  if (c.per100) {
    const grams = unit === 'serving' && c.serving ? amount * c.serving.g : amount;
    const k = grams / 100;
    let qty = `${Math.round(grams)} g`;
    if (unit === 'serving' && c.serving) {
      const lbl = c.serving.label;
      qty = /\d/.test(lbl) // label already says how much, e.g. "1 pot (170 g)"
        ? (amount === 1 ? lbl : `${fmtAmt(amount)} × ${lbl}`)
        : `${fmtAmt(amount)} ${lbl}${amount === 1 ? '' : 's'} (${Math.round(grams)} g)`;
    }
    return { grams, qty, kcal: Math.round(c.per100.kcal * k), protein: r1(c.per100.protein * k), carbs: r1(c.per100.carbs * k), fat: r1(c.per100.fat * k) };
  }
  const f = c.fixed;
  return { grams: null, qty: amount === 1 ? f.label : `${fmtAmt(amount)} × ${f.label}`, kcal: Math.round(f.kcal * amount), protein: r1(f.protein * amount), carbs: r1(f.carbs * amount), fat: r1(f.fat * amount) };
}

const fmtAmt = (n) => (n === 0.5 ? '½' : n === 0.25 ? '¼' : String(+n.toFixed(2)));

/** Save or refresh a food in My foods (mutates state). Returns the library id. */
export function upsertLibrary(state, c, extra = {}) {
  const norm = (s) => (s || '').trim().toLowerCase();
  let f = state.library.find((x) => (c.barcode && x.barcode === c.barcode) || (norm(x.name) === norm(c.name) && norm(x.brand) === norm(c.brand)));
  if (!f) {
    f = { id: uid(), name: c.name, brand: c.brand || '', barcode: c.barcode || '' };
    state.library.unshift(f);
  }
  if (c.per100) { f.per100 = c.per100; f.serving = c.serving || f.serving || null; }
  else if (c.fixed) Object.assign(f, { qty: c.fixed.label, kcal: c.fixed.kcal, protein: c.fixed.protein, carbs: c.fixed.carbs, fat: c.fixed.fat });
  f.lastUsed = Date.now();
  f.uses = (f.uses || 0) + 1;
  Object.assign(f, extra);
  return f.id;
}

/* ============================================================ local search */
function score(words, q) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  let s = 0;
  for (const t of toks) {
    const i = words.indexOf(t);
    if (i === -1) {
      if (t.length > 3 && t.endsWith('s') && words.includes(t.slice(0, -1))) { s += 1; continue; } // plurals
      return 0;
    }
    s += i === 0 ? 4 : words[i - 1] === ' ' || words[i - 1] === '(' ? 2 : 1;
  }
  return s;
}

export function searchLocal(q, dedupe = true) {
  const mine = myFoods().map((c) => { const s = score(`${c.name} ${c.brand}`.toLowerCase(), q); return { c, s: s ? s + 3 + (c.fav ? 2 : 0) : 0 }; });
  const gen = FOODS.map((c) => ({ c, s: score(c.words, q) }));
  const seen = new Set();
  return [...mine, ...gen]
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c)
    .filter((c) => { if (!dedupe) return true; const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 20);
}

/* ============================================================ Open Food Facts */
const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity';

function fromOFF(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184;
  const name = (p.product_name_en || p.product_name || '').trim();
  if (!name || kcal == null || Number.isNaN(+kcal)) return null;
  const brand = (Array.isArray(p.brands) ? p.brands[0] : (p.brands || '').split(',')[0] || '').trim();
  const sq = parseFloat(p.serving_quantity);
  return {
    key: `o:${p.code || name}`, name, brand, barcode: p.code || '', source: 'off',
    per100: { kcal: Math.round(+kcal), protein: r1(+n.proteins_100g || 0), carbs: r1(+n.carbohydrates_100g || 0), fat: r1(+n.fat_100g || 0) },
    serving: sq > 0 ? { label: (p.serving_size || 'serving').replace(/\s+/g, ' ').slice(0, 30), g: sq } : null,
  };
}

// Open Food Facts allows ~10 text searches a minute per user, so results are cached
// and the sheet only searches after a pause in typing.
const offCache = new Map();
const BUSY = 'Product search is busy (it allows about 10 searches a minute). Pause a few seconds, then keep typing.';

export async function searchOFF(q, signal) {
  const k = q.trim().toLowerCase();
  if (offCache.has(k)) return offCache.get(k);
  const url = `https://uk.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(k)}&search_simple=1&action=process&json=1&page_size=24&fields=${OFF_FIELDS}`;
  if (!navigator.onLine) throw new Error('Offline — showing your foods and common foods only.');
  // The server often answers 503 for a moment (and its error replies lack CORS headers,
  // so the browser just sees a failed fetch) — retry twice with a short backoff.
  let r = null;
  for (const delay of [0, 1500, 3000]) {
    if (delay) await new Promise((res, rej) => { const t = setTimeout(res, delay); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }); });
    try {
      r = await fetch(url, { signal });
      if (r.status !== 429 && r.status !== 503) break;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      r = null;
    }
  }
  if (!r || r.status === 429 || r.status === 503) throw new Error(BUSY);
  if (!r.ok) throw new Error('The food database had a problem — try again in a moment.');
  const out = ((await r.json()).products || []).map(fromOFF).filter(Boolean)
    .map((c, i) => ({ c, i, s: score(`${c.name} ${c.brand}`.toLowerCase(), k) }))
    .sort((a, b) => (b.s > 0) - (a.s > 0) || b.s - a.s || a.i - b.i) // full-word matches first
    .map((x) => x.c);
  offCache.set(k, out);
  return out;
}

export async function lookupBarcode(code) {
  const mine = myFoods().find((c) => c.barcode === code);
  if (mine) return mine;
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Could not reach the food database.');
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return fromOFF({ ...j.product, code });
}

/* ============================================================ barcode scanner */
const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/+esm';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const f = FORMATS.filter((x) => supported.includes(x));
    return f.length ? new window.BarcodeDetector({ formats: f }) : null;
  } catch { return null; }
}

/** Start the camera in `video` and call onCode(code) once. Returns a stop() function. */
export async function startScanner(video, onCode) {
  let stopped = false;
  let found = false;
  const hit = (code) => { if (found || stopped) return; found = true; onCode(code); };
  const det = await nativeDetector();
  if (det) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    await video.play();
    const loop = async () => {
      if (stopped || found) return;
      try { const codes = await det.detect(video); if (codes[0]) hit(codes[0].rawValue); } catch { /* frame not ready */ }
      setTimeout(loop, 200);
    };
    loop();
    return () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  }
  const { BrowserMultiFormatReader } = await import(ZXING);
  const reader = new BrowserMultiFormatReader();
  video.setAttribute('playsinline', '');
  const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (result) => {
    if (result) hit(result.getText());
  });
  return () => { stopped = true; controls.stop(); };
}

/** Read a barcode from a photo (fallback when live camera isn't available). */
export async function decodeImage(file) {
  const det = await nativeDetector();
  if (det) {
    const bmp = await createImageBitmap(file);
    const codes = await det.detect(bmp);
    if (codes[0]) return codes[0].rawValue;
  }
  const { BrowserMultiFormatReader } = await import(ZXING);
  const url = URL.createObjectURL(file);
  try { return (await new BrowserMultiFormatReader().decodeFromImageUrl(url)).getText(); }
  finally { URL.revokeObjectURL(url); }
}

/* ============================================================ voice */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const speechSupported = () => !!SR;

/** Listen once. onText(text, final). Returns stop(). */
export function listen(onText, onEnd, onError) {
  const rec = new SR();
  rec.lang = 'en-GB';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    const text = [...e.results].map((r) => r[0].transcript).join(' ');
    onText(text, e.results[e.results.length - 1].isFinal);
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => onEnd?.();
  rec.start();
  return () => { try { rec.stop(); } catch { /* already stopped */ } };
}

/* Offline parser for "2 eggs, 150g chicken and a banana". Returns review items. */
const NUMS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, couple: 2, few: 3 };
export function parseLocal(text) {
  const parts = text.toLowerCase().replace(/[.!?]/g, ',').split(/,|\band\b|\bwith\b|\bplus\b|\+|\bthen\b/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  const missed = [];
  for (let p of parts) {
    p = p.replace(/^(i (had|ate|drank)|had|ate|some|of)\s+/g, '').trim();
    let amount = null, grams = null;
    let m = p.match(/^(\d+(?:\.\d+)?)\s*(g|grams?|gram|ml|kg)\b\s*(of\s+)?/);
    if (m) { grams = +m[1] * (m[2] === 'kg' ? 1000 : 1); p = p.slice(m[0].length); }
    else if ((m = p.match(/^(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half|couple|few)\s+(of\s+)?(a\s+)?/))) {
      amount = isNaN(+m[1]) ? NUMS[m[1]] : +m[1];
      p = p.slice(m[0].length);
    }
    p = p.replace(/^(slices?|pieces?|cups?|bowls?|glass(es)?|mugs?|cans?|pints?|portions?|handfuls?|scoops?|pots?|tbsp|tsp)\s+(of\s+)?/, '').trim();
    if (!p) continue;
    const c = searchLocal(p, false).find((x) => x.per100);
    if (!c) { missed.push(p); continue; }
    const g = grams ?? (amount ?? 1) * (c.serving?.g || 100);
    out.push(reviewItem(c.name, g, c.per100, c.source, c.brand, c.serving));
  }
  return { items: out, missed };
}

export function reviewItem(name, grams, per100, source, brand = '', serving = null) {
  return { id: uid(), name, brand, grams: Math.round(grams), per100, source, serving, on: true };
}

/* ============================================================ AI estimates (Claude) */
const SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm';
const KEY = 'finnfit.aiKey'; // kept outside the main data so backups never include it

export const aiKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setAiKey = (k) => { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'confidence'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['items', 'note'],
  additionalProperties: false,
};

const SYSTEM = `You estimate nutrition for entries in a personal food diary. The user lives in Ireland, so assume UK/Irish products and portion sizes when unsure.
List each distinct food or drink separately. For each, estimate the amount eaten in grams (treat ml as grams for drinks) and give kcal, protein, carbs and fat in grams for that amount — totals for the portion, not per 100 g.
Account for visible cooking oil, butter, sauces and dressings. If a nutrition label or packaging is visible, use its values. Use short plain names such as "Chicken breast (grilled)" or "Basmati rice (cooked)".
Set confidence to low when the portion size or the food itself is hard to tell. If no food is shown or described, return an empty items list and explain why in note; otherwise keep note to one short sentence of anything the user should check.`;

async function resizeImage(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that photo.')); i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}

/** Ask Claude to estimate foods from a photo and/or a description. Returns { items, note }. */
export async function aiEstimate({ photo, text }) {
  const apiKey = aiKey();
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings to use AI estimates.');
  const { default: Anthropic } = await import(SDK);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const content = [];
  if (photo) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await resizeImage(photo) } });
  content.push({ type: 'text', text: photo ? `Estimate the food in this photo.${text ? ` Extra detail from me: ${text}` : ''}` : `Here is what I ate: ${text}` });

  let res;
  try {
    res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Your API key was rejected. Check it in Settings.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('This API key is not allowed to use that model.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Too many requests right now — wait a few seconds and try again.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('No connection to the AI service. Check your internet.');
    if (err instanceof Anthropic.APIError) throw new Error(`AI service error (${err.status ?? 'unknown'}). Try again.`);
    throw err;
  }
  if (res.stop_reason === 'refusal') throw new Error('The AI declined to estimate this one. Try search or barcode instead.');
  if (res.stop_reason === 'max_tokens') throw new Error('The AI answer was cut short. Try again.');
  const textBlock = res.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('The AI returned no answer. Try again.');
  const parsed = JSON.parse(textBlock.text);
  const items = parsed.items
    .filter((i) => i.name && i.grams > 0)
    .map((i) => {
      const k = 100 / i.grams;
      const it = reviewItem(i.name, i.grams, { kcal: Math.round(i.kcal * k), protein: r1(i.protein * k), carbs: r1(i.carbs * k), fat: r1(i.fat * k) }, 'ai');
      it.confidence = i.confidence;
      return it;
    });
  return { items, note: parsed.note || '' };
}
