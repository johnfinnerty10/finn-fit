// Finn Fit — free, on-device food photo recognition.
// Runs Apple's open MobileCLIP-S0 image model in the browser (Transformers.js + WebAssembly).
// Food-name embeddings are precomputed (foodvec.js), so the phone only downloads the
// ~23 MB image model once; after that it works offline and costs nothing.
import { FOODS } from './fooddb.js';
import { FOOD_VEC } from './foodvec.js';

// self-contained browser build (bundles the ONNX runtime loader; no bare imports)
const TF = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';
const SCALE = 100; // CLIP logit scale

let loading = null;
let onProgress = null;
let rows = null;

function labelRows() {
  if (rows) return rows;
  const bin = atob(FOOD_VEC.data);
  const q = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
  const d = FOOD_VEC.dims;
  rows = [];
  for (let r = 0; r < q.length / d; r++) {
    const v = new Float32Array(d);
    let n = 0;
    for (let j = 0; j < d; j++) { v[j] = q[r * d + j]; n += v[j] * v[j]; }
    n = Math.sqrt(n);
    for (let j = 0; j < d; j++) v[j] /= n;
    rows.push(v);
  }
  return rows;
}

/** True once the model has been downloaded in this browser (so no wait next time). */
export async function isCached() {
  try {
    const c = await caches.open('transformers-cache');
    const keys = await c.keys();
    return keys.some((k) => k.url.includes('mobileclip_s0') && k.url.endsWith('.onnx'));
  } catch { return false; }
}

/** Load (and on first use download) the model. progress(0..100) is reported during download. */
export function load(progress) {
  onProgress = progress || null;
  if (!loading) {
    loading = (async () => {
      const T = await import(TF);
      T.env.allowLocalModels = false;
      const cb = (p) => { if (p.status === 'progress' && /\.onnx$/.test(p.file || '')) onProgress?.(Math.round(p.progress || 0)); };
      const proc = await T.AutoProcessor.from_pretrained(FOOD_VEC.model);
      let model;
      try {
        model = await T.CLIPVisionModelWithProjection.from_pretrained(FOOD_VEC.model, { dtype: 'fp16', device: 'wasm', progress_callback: cb });
      } catch {
        // some older phones can't run half-precision — fall back to the full model (~45 MB)
        model = await T.CLIPVisionModelWithProjection.from_pretrained(FOOD_VEC.model, { dtype: 'fp32', device: 'wasm', progress_callback: cb });
      }
      return { T, proc, model };
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

const softmax = (xs) => {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
};

/**
 * Recognise foods in a photo. Returns { items: [{ food, score, on }], notFood }.
 * Looks at the whole photo plus four overlapping zoomed crops so several foods on one plate
 * can each be spotted.
 */
export async function recognise(file, progress) {
  const { T, proc, model } = await load(progress);
  const url = URL.createObjectURL(file);
  let img;
  try { img = await T.RawImage.fromURL(url); } finally { URL.revokeObjectURL(url); }
  const big = Math.max(img.width, img.height);
  if (big > 640) img = await img.resize(Math.round((img.width * 640) / big), Math.round((img.height * 640) / big));
  const W = img.width, H = img.height;
  const cw = Math.round(W * 0.6), ch = Math.round(H * 0.6);
  const crops = [
    img,
    await img.crop([0, 0, cw - 1, ch - 1]),
    await img.crop([W - cw, 0, W - 1, ch - 1]),
    await img.crop([0, H - ch, cw - 1, H - 1]),
    await img.crop([W - cw, H - ch, W - 1, H - 1]),
  ];
  const { image_embeds } = await model(await proc(crops));
  const d = image_embeds.dims[1];
  const L = labelRows();
  const nFood = FOOD_VEC.foods;

  const probs = crops.map((_, c) => {
    const e = image_embeds.data.subarray(c * d, (c + 1) * d);
    let n = 0; for (let j = 0; j < d; j++) n += e[j] * e[j];
    n = Math.sqrt(n);
    return softmax(L.map((row) => { let s = 0; for (let j = 0; j < d; j++) s += row[j] * e[j]; return (SCALE * s) / n; }));
  });
  const full = probs[0];
  const notFoodP = full.slice(nFood).reduce((a, b) => a + b, 0);

  const scored = [];
  for (let i = 0; i < nFood; i++) {
    const cropMax = Math.max(...probs.slice(1).map((p) => p[i]));
    scored.push({ i, full: full[i], cropMax, score: Math.max(full[i], 0.8 * cropMax) });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0.02).slice(0, 8);
  let ticked = 0;
  const items = top.map((s, k) => {
    const on = k === 0 || ((s.full >= 0.2 || s.cropMax >= 0.5) && ticked < 3);
    if (on && k > 0) ticked++;
    return { food: FOODS[s.i], score: s.score, on };
  });
  return { items, notFood: notFoodP > 0.5 && (top[0]?.full ?? 0) < 0.3 };
}
