// Finn Fit — the Add Food sheet: search, barcode, photo AI, voice, manual, portions, review.
import { get, update, uid } from './store.js';
import * as F from './food.js';
import { MEALS } from './logic.js';
import { esc, toast, openModal, num, buzz } from './ui.js';

const I = {
  scan: '<svg viewBox="0 0 24 24"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 8v8M10 8v8M13 8v8M16 8v8"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const SRC = { mine: 'My food', generic: 'Common', off: 'Product', ai: 'AI estimate' };

export function defaultMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 17 ? 'Snacks' : h < 21 ? 'Dinner' : 'Snacks';
}

/**
 * Open the sheet. start: 'search' | 'scan' | 'photo' | 'voice' | 'manual' | candidate object.
 * onChange is called after anything is logged so the page behind can refresh.
 */
export function openAddFood({ date, meal, start = 'search', onChange = () => {} }) {
  let currentMeal = meal || defaultMeal();
  let cleanup = () => {};
  let added = 0;

  openModal(`
    <div class="af">
      <div class="row between" style="margin-bottom:12px">
        <h2 style="margin:0">Add food</h2>
        <button class="btn icon ghost" data-close aria-label="Close">${I.close}</button>
      </div>
      <div class="seg af-meals" role="group" aria-label="Meal">${MEALS.map((m) => `<button data-meal="${m}">${m}</button>`).join('')}</div>
      <div data-body class="af-body"></div>
    </div>`, (sheet, close) => {
    sheet.classList.add('sheet-tall');
    const body = sheet.querySelector('[data-body]');
    let onMealChange = () => {};
    const paintMeals = () => sheet.querySelectorAll('[data-meal]').forEach((b) => b.classList.toggle('on', b.dataset.meal === currentMeal));
    sheet.querySelectorAll('[data-meal]').forEach((b) => b.addEventListener('click', () => { currentMeal = b.dataset.meal; paintMeals(); onMealChange(); }));
    paintMeals();

    // stop camera / mic when the sheet closes
    const obs = new MutationObserver(() => { if (!sheet.isConnected) { cleanup(); obs.disconnect(); if (added) onChange(); } });
    obs.observe(document.getElementById('modal'), { childList: true });

    const go = (fn, ...args) => { cleanup(); cleanup = () => {}; onMealChange = () => {}; body.scrollTop = 0; fn(...args); };

    /* ---------------- logging ---------------- */
    function log(c, totals) {
      update((s) => {
        (s.foods[date] ||= []).push({ id: uid(), meal: currentMeal, name: c.brand ? `${c.name} (${c.brand})` : c.name, qty: totals.qty, kcal: totals.kcal, protein: totals.protein, carbs: totals.carbs, fat: totals.fat, source: c.source });
        F.upsertLibrary(s, c);
      });
      added++;
      buzz(15);
      onChange();
    }

    /* ---------------- search (home) ---------------- */
    function home(q = '') {
      body.innerHTML = `
        <div class="af-search"><input type="search" data-q placeholder="Search any food or brand…" value="${esc(q)}" aria-label="Search foods" autocomplete="off" enterkeyhint="search"></div>
        <div class="af-actions">
          <button data-go="scan">${I.scan}<span>Scan</span></button>
          <button data-go="photo">${I.camera}<span>Photo AI</span></button>
          <button data-go="voice">${I.mic}<span>Speak</span></button>
          <button data-go="manual">${I.pen}<span>Manual</span></button>
        </div>
        <div data-results></div>`;
      const input = body.querySelector('[data-q]');
      const results = body.querySelector('[data-results]');
      body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(VIEWS[b.dataset.go])));
      let timer, ctrl;
      const run = () => {
        const term = input.value.trim();
        clearTimeout(timer); ctrl?.abort();
        if (!term) { results.innerHTML = listSection(F.recents(), 'Favourites & recent', 'Foods you add show up here for one-tap logging.'); wireRows(results); return; }
        const local = F.searchLocal(term);
        results.innerHTML = listSection(local, 'Your foods & common foods', '') + `<div data-off><p class="af-loading">Searching 3 million products…</p></div>`;
        wireRows(results);
        if (term.length < 3) { results.querySelector('[data-off]').innerHTML = ''; return; }
        timer = setTimeout(async () => {
          ctrl = new AbortController();
          const slot = results.querySelector('[data-off]');
          try {
            const off = await F.searchOFF(term, ctrl.signal);
            if (!slot.isConnected) return;
            slot.innerHTML = off.length ? listSection(off, 'Products', '') : '<p class="tiny muted">No packaged products match. Try different words, scan the barcode, or add it manually.</p>';
            wireRows(slot);
          } catch (e) {
            if (e.name !== 'AbortError' && slot.isConnected) slot.innerHTML = `<p class="tiny muted">${esc(e.message || 'Product search failed.')}</p>`;
          }
        }, 700);
      };
      input.addEventListener('input', run);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      run();
      if (window.matchMedia('(pointer: fine)').matches) input.focus();
      cleanup = () => { clearTimeout(timer); ctrl?.abort(); };
    }

    function listSection(list, title, empty) {
      if (!list.length) return empty ? `<p class="tiny muted" style="margin:14px 2px">${esc(empty)}</p>` : '';
      return `<p class="eyebrow" style="margin:16px 2px 6px">${esc(title)}</p><div class="af-list">${list.map(rowHTML).join('')}</div>`;
    }

    const rowMap = new Map();
    function rowHTML(c) {
      rowMap.set(c.key, c);
      const def = defaultPortion(c);
      const t = F.portion(c, def.amount, def.unit);
      return `<div class="af-row" data-key="${esc(c.key)}">
        <button class="af-main" data-pick>
          <strong>${c.fav ? '★ ' : ''}${esc(c.name)}</strong>
          <span>${c.brand ? `${esc(c.brand)} · ` : ''}${esc(t.qty)} · <span class="af-src ${c.source}">${SRC[c.source]}</span></span>
        </button>
        <span class="af-kcal">${t.kcal}<small> kcal</small></span>
        <button class="af-add" data-quick aria-label="Add ${esc(c.name)}">${I.plus}</button>
      </div>`;
    }

    function wireRows(root) {
      root.querySelectorAll('.af-row').forEach((row) => {
        const c = rowMap.get(row.dataset.key);
        row.querySelector('[data-pick]').addEventListener('click', () => go(portionView, c));
        row.querySelector('[data-quick]').addEventListener('click', (e) => {
          const def = defaultPortion(c);
          const t = F.portion(c, def.amount, def.unit);
          log(c, t);
          e.currentTarget.classList.add('done');
          e.currentTarget.innerHTML = '✓';
          toast(`Added ${c.name} · ${t.kcal} kcal to ${currentMeal}`);
        });
      });
    }

    function defaultPortion(c) {
      if (c.per100) return c.serving ? { amount: 1, unit: 'serving' } : { amount: 100, unit: 'g' };
      return { amount: 1, unit: 'serving' };
    }

    /* ---------------- portion ---------------- */
    function portionView(c) {
      const def = defaultPortion(c);
      let amount = def.amount, unit = def.unit;
      const canWeigh = !!c.per100;
      body.innerHTML = `
        <button class="btn sm ghost" data-back>${I.back} Back</button>
        <div style="margin:10px 0 14px">
          <h3 style="font-size:20px">${esc(c.name)}</h3>
          <p class="tiny muted" style="margin:2px 0 0">${c.brand ? `${esc(c.brand)} · ` : ''}<span class="af-src ${c.source}">${SRC[c.source]}</span>${c.per100 ? ` · ${c.per100.kcal} kcal / 100 g` : ''}</p>
        </div>
        <div class="af-amount">
          <input type="number" inputmode="decimal" min="0" step="any" data-amt value="${amount}" aria-label="Amount">
          ${canWeigh && c.serving ? `<div class="seg" data-units><button data-u="serving">${esc(c.serving.label)}</button><button data-u="g">grams</button></div>`
            : `<span class="muted">${canWeigh ? 'grams' : esc(c.fixed.label)}</span>`}
        </div>
        <div class="row wrap" data-chips style="gap:6px;margin-top:10px"></div>
        <div class="af-macros" data-macros></div>
        <div class="row" style="gap:10px;margin-top:16px">
          ${c.source === 'mine' ? `<button class="btn icon ${c.fav ? 'fav-on' : ''}" data-fav aria-label="Favourite">${I.star}</button>` : ''}
          <button class="btn primary lg" data-add style="flex:1">Add to <span data-mealname>${currentMeal}</span></button>
        </div>`;
      const amt = body.querySelector('[data-amt]');
      const chips = body.querySelector('[data-chips]');
      const paint = () => {
        const t = F.portion(c, amount, unit);
        body.querySelector('[data-macros]').innerHTML = `
          <div><strong>${t.kcal}</strong><span>kcal</span></div>
          <div><strong>${t.protein}</strong><span>protein g</span></div>
          <div><strong>${t.carbs}</strong><span>carbs g</span></div>
          <div><strong>${t.fat}</strong><span>fat g</span></div>`;
        body.querySelectorAll('[data-u]').forEach((b) => b.classList.toggle('on', b.dataset.u === unit));
        const opts = unit === 'g' ? [50, 100, 150, 200, 250] : [0.5, 1, 1.5, 2, 3];
        chips.innerHTML = opts.map((o) => `<button class="pill ${o === amount ? 'accent' : ''}" data-chip="${o}">${unit === 'g' ? `${o} g` : o === 0.5 ? '½' : o}</button>`).join('');
        chips.querySelectorAll('[data-chip]').forEach((b) => b.addEventListener('click', () => { amount = +b.dataset.chip; amt.value = amount; paint(); }));
        const mn = body.querySelector('[data-mealname]'); if (mn) mn.textContent = currentMeal;
      };
      amt.addEventListener('input', () => { amount = num(amt.value) || 0; paint(); });
      body.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.u === unit) return;
        // convert so the portion stays the same size
        amount = b.dataset.u === 'g' ? Math.round(amount * c.serving.g) : +(amount / c.serving.g).toFixed(2);
        unit = b.dataset.u; amt.value = amount; paint();
      }));
      body.querySelector('[data-back]').addEventListener('click', () => go(home));
      body.querySelector('[data-fav]')?.addEventListener('click', (e) => {
        c.fav = !c.fav;
        update((s) => { const f = s.library.find((x) => x.id === c.id); if (f) f.fav = c.fav; });
        e.currentTarget.classList.toggle('fav-on', c.fav);
        toast(c.fav ? 'Added to favourites' : 'Removed from favourites');
      });
      body.querySelector('[data-add]').addEventListener('click', () => {
        if (!(amount > 0)) { toast('Enter an amount'); return; }
        const t = F.portion(c, amount, unit);
        log(c, t);
        toast(`Added ${c.name} · ${t.kcal} kcal to ${currentMeal}`);
        go(home);
      });
      onMealChange = paint;
      paint();
    }

    /* ---------------- barcode ---------------- */
    function scan() {
      body.innerHTML = `
        <button class="btn sm ghost" data-back>${I.back} Back</button>
        <div class="af-video"><video muted playsinline></video><div class="af-frame"></div></div>
        <p class="small muted" data-status style="text-align:center;margin:10px 0">Starting camera…</p>
        <div class="row" style="gap:8px">
          <input type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Or type the barcode number" data-code aria-label="Barcode number">
          <button class="btn" data-lookup>Find</button>
        </div>
        <label class="btn sm ghost" style="margin-top:10px">${I.camera} Read barcode from a photo<input type="file" accept="image/*" data-photo hidden></label>`;
      const status = body.querySelector('[data-status]');
      const video = body.querySelector('video');
      body.querySelector('[data-back]').addEventListener('click', () => go(home));
      const found = async (code) => {
        buzz(40);
        status.textContent = `Found ${code} — looking it up…`;
        cleanup();
        try {
          const c = await F.lookupBarcode(code);
          if (c) go(portionView, c);
          else {
            status.innerHTML = `Barcode ${esc(code)} isn't in the food database yet.`;
            const b = document.createElement('button');
            b.className = 'btn primary block'; b.textContent = 'Add it manually';
            b.style.marginTop = '8px';
            b.onclick = () => go(manual, { barcode: code });
            status.after(b);
          }
        } catch (e) { status.textContent = e.message; }
      };
      body.querySelector('[data-lookup]').addEventListener('click', () => {
        const code = body.querySelector('[data-code]').value.replace(/\D/g, '');
        if (code.length >= 8) found(code); else toast('Barcodes have 8–13 digits');
      });
      body.querySelector('[data-photo]').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        status.textContent = 'Reading barcode from photo…';
        try { found(await F.decodeImage(file)); } catch { status.textContent = 'No barcode found in that photo. Try a closer, sharper shot.'; }
      });
      if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'Camera not available here — type the number or use a photo.'; return; }
      F.startScanner(video, found)
        .then((stop) => { cleanup = stop; if (status.textContent.startsWith('Starting')) status.textContent = 'Point the camera at the barcode'; })
        .catch((e) => { status.textContent = e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in Settings → Safari → Camera, or type the number.' : 'Could not start the camera — type the number or use a photo.'; });
    }

    /* ---------------- photo AI ---------------- */
    function photo() {
      const hasKey = !!F.aiKey();
      body.innerHTML = `
        <button class="btn sm ghost" data-back>${I.back} Back</button>
        <h3 style="margin:12px 0 4px">Photo estimate</h3>
        <p class="small muted" style="margin:0 0 14px">Snap your plate and AI estimates each food, its portion and macros. You can adjust everything before it's added.</p>
        ${hasKey ? `
          <div class="row" style="gap:8px">
            <label class="btn primary lg" style="flex:1">${I.camera} Take photo<input type="file" accept="image/*" capture="environment" data-file hidden></label>
            <label class="btn lg">Library<input type="file" accept="image/*" data-file hidden></label>
          </div>
          <label class="field" style="margin-top:12px">Anything the photo won't show? (optional)
            <input type="text" data-extra placeholder="e.g. cooked in a tbsp of oil, 2 sugars in the tea"></label>
          <div data-out></div>`
        : `<div class="banner"><span>AI estimates need your Anthropic API key. Add it once in <strong>Settings → AI food estimates</strong>; it stays on this phone.</span></div>
           <a class="btn primary block" style="margin-top:12px" href="#settings">Open Settings</a>`}`;
      body.querySelector('[data-back]').addEventListener('click', () => go(home));
      body.querySelectorAll('[data-file]').forEach((inp) => inp.addEventListener('change', async () => {
        const file = inp.files[0]; if (!file) return;
        const out = body.querySelector('[data-out]');
        const url = URL.createObjectURL(file);
        out.innerHTML = `<img src="${url}" alt="Your food photo" class="af-thumb"><p class="af-loading">Estimating your food…</p>`;
        try {
          const res = await F.aiEstimate({ photo: file, text: body.querySelector('[data-extra]').value.trim() });
          if (!res.items.length) { out.innerHTML = `<img src="${url}" alt="" class="af-thumb"><p class="small">${esc(res.note || 'No food found in that photo.')}</p>`; return; }
          go(review, res.items, res.note, url);
        } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message || 'Something went wrong.')}</p>`; }
      }));
    }

    /* ---------------- voice ---------------- */
    function voice() {
      const hasKey = !!F.aiKey();
      const canListen = F.speechSupported();
      body.innerHTML = `
        <button class="btn sm ghost" data-back>${I.back} Back</button>
        <h3 style="margin:12px 0 4px">Say what you had</h3>
        <p class="small muted" style="margin:0 0 14px">e.g. "two eggs, two slices of sourdough and a latte"${hasKey ? '' : '. Without an AI key, simple foods and amounts work best.'}</p>
        ${canListen ? `<button class="af-mic" data-mic aria-label="Start speaking">${I.mic}</button><p class="tiny muted" data-hint style="text-align:center">Tap and speak</p>`
          : `<p class="tiny muted">Tip: tap the 🎤 on your keyboard to dictate.</p>`}
        <textarea data-text rows="3" placeholder="Or type it here…" style="width:100%;margin-top:10px"></textarea>
        <button class="btn primary block lg" data-parse style="margin-top:12px">Work it out</button>
        <div data-out></div>`;
      const ta = body.querySelector('[data-text]');
      const out = body.querySelector('[data-out]');
      body.querySelector('[data-back]').addEventListener('click', () => go(home));
      const mic = body.querySelector('[data-mic]');
      let stop = null;
      mic?.addEventListener('click', () => {
        if (stop) { stop(); return; }
        mic.classList.add('live');
        body.querySelector('[data-hint]').textContent = 'Listening… tap to stop';
        try {
          stop = F.listen((t) => { ta.value = t; }, () => {
            stop = null; mic.classList.remove('live');
            const h = body.querySelector('[data-hint]'); if (h) h.textContent = 'Tap and speak';
            if (ta.value.trim()) parse();
          }, (err) => { const h = body.querySelector('[data-hint]'); if (h) h.textContent = err === 'not-allowed' ? 'Microphone blocked — use the keyboard 🎤 instead' : 'Didn\'t catch that — try again'; });
        } catch { mic.classList.remove('live'); stop = null; }
      });
      cleanup = () => stop?.();
      const parse = async () => {
        const text = ta.value.trim();
        if (!text) { toast('Say or type what you had'); return; }
        if (hasKey) {
          out.innerHTML = '<p class="af-loading">Working it out…</p>';
          try {
            const res = await F.aiEstimate({ text });
            if (!res.items.length) { out.innerHTML = `<p class="small">${esc(res.note || 'Couldn\'t find any food in that.')}</p>`; return; }
            go(review, res.items, res.note);
          } catch (e) { out.innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; }
        } else {
          const { items, missed } = F.parseLocal(text);
          if (!items.length) { out.innerHTML = `<p class="small">Couldn't match that to any foods. Try simpler words like "2 eggs and a banana", or search instead.</p>`; return; }
          go(review, items, missed.length ? `Not recognised: ${missed.join(', ')} — search for these separately.` : '');
        }
      };
      body.querySelector('[data-parse]').addEventListener('click', parse);
    }

    /* ---------------- review (AI / voice) ---------------- */
    function review(items, note, thumb) {
      const totalOf = (it) => F.portion({ per100: it.per100 }, it.grams, 'g');
      body.innerHTML = `
        <button class="btn sm ghost" data-back>${I.back} Back</button>
        ${thumb ? `<img src="${thumb}" alt="" class="af-thumb">` : ''}
        <h3 style="margin:12px 0 4px">Check and adjust</h3>
        ${note ? `<p class="small muted" style="margin:0 0 10px">${esc(note)}</p>` : ''}
        <div class="af-review">${items.map((it) => `
          <div class="af-rv" data-id="${it.id}">
            <input type="checkbox" ${it.on ? 'checked' : ''} aria-label="Include ${esc(it.name)}">
            <div class="af-rv-main">
              <input type="text" data-name value="${esc(it.name)}" aria-label="Food name">
              <span class="tiny muted" data-line></span>
            </div>
            <label class="af-g"><input type="number" inputmode="decimal" min="0" data-g value="${it.grams}" aria-label="Grams"><span>g</span></label>
          </div>`).join('')}</div>
        <div class="af-macros" data-total style="margin-top:12px"></div>
        <button class="btn primary block lg" data-addall style="margin-top:14px"></button>`;
      const paint = () => {
        let sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 }, n = 0;
        for (const it of items) {
          const t = totalOf(it);
          const row = body.querySelector(`[data-id="${it.id}"]`);
          row.querySelector('[data-line]').textContent = `${t.kcal} kcal · ${t.protein} g protein${it.confidence === 'low' ? ' · rough guess' : ''}`;
          row.classList.toggle('off', !it.on);
          if (it.on) { n++; for (const k in sum) sum[k] += t[k]; }
        }
        body.querySelector('[data-total]').innerHTML = `
          <div><strong>${Math.round(sum.kcal)}</strong><span>kcal</span></div>
          <div><strong>${Math.round(sum.protein)}</strong><span>protein g</span></div>
          <div><strong>${Math.round(sum.carbs)}</strong><span>carbs g</span></div>
          <div><strong>${Math.round(sum.fat)}</strong><span>fat g</span></div>`;
        const btn = body.querySelector('[data-addall]');
        btn.textContent = `Add ${n} item${n === 1 ? '' : 's'} to ${currentMeal}`;
        btn.disabled = !n;
      };
      body.querySelectorAll('.af-rv').forEach((row) => {
        const it = items.find((x) => x.id === row.dataset.id);
        row.querySelector('input[type=checkbox]').addEventListener('change', (e) => { it.on = e.target.checked; paint(); });
        row.querySelector('[data-g]').addEventListener('input', (e) => { it.grams = num(e.target.value) || 0; paint(); });
        row.querySelector('[data-name]').addEventListener('input', (e) => { it.name = e.target.value; });
      });
      body.querySelector('[data-back]').addEventListener('click', () => go(home));
      body.querySelector('[data-addall]').addEventListener('click', () => {
        const chosen = items.filter((it) => it.on && it.grams > 0 && it.name.trim());
        for (const it of chosen) {
          const c = { name: it.name.trim(), brand: it.brand || '', source: it.source, per100: it.per100, serving: it.serving || { label: 'portion', g: it.grams } };
          const n = it.serving ? it.grams / it.serving.g : 0;
          const whole = it.serving && n >= 0.5 && Math.abs(n * 2 - Math.round(n * 2)) < 0.02; // ½-serving steps
          log(c, whole ? F.portion(c, Math.round(n * 2) / 2, 'serving') : F.portion(c, it.grams, 'g'));
        }
        toast(`Added ${chosen.length} item${chosen.length === 1 ? '' : 's'} to ${currentMeal}`);
        go(home);
      });
      onMealChange = paint;
      paint();
    }

    /* ---------------- manual ---------------- */
    function manual(pre = {}) {
      body.innerHTML = `
        <button class="btn sm ghost" data-back>${I.back} Back</button>
        <h3 style="margin:12px 0 10px">New food</h3>
        <form class="form" data-f>
          <label class="field">Name<input type="text" name="name" required placeholder="e.g. Greek yoghurt" value="${esc(pre.name || '')}"></label>
          <div class="cols two">
            <label class="field">Brand (optional)<input type="text" name="brand" placeholder="e.g. Fage"></label>
            <label class="field">Values are for<select name="basis"><option value="portion">the amount below</option><option value="100">100 g</option></select></label>
          </div>
          <div class="cols two">
            <label class="field">Amount<input type="text" name="qty" placeholder="e.g. 1 pot (170 g)"></label>
            <label class="field">Grams (optional)<input type="number" name="g" min="0" inputmode="decimal" placeholder="170"></label>
          </div>
          <div class="cols">
            <label class="field">kcal<input type="number" name="kcal" min="0" inputmode="decimal" required></label>
            <label class="field">Protein<input type="number" name="protein" min="0" step="0.1" inputmode="decimal"></label>
            <label class="field">Carbs<input type="number" name="carbs" min="0" step="0.1" inputmode="decimal"></label>
            <label class="field">Fat<input type="number" name="fat" min="0" step="0.1" inputmode="decimal"></label>
          </div>
          ${pre.barcode ? `<p class="tiny muted" style="margin:0">Barcode ${esc(pre.barcode)} will be remembered, so next scan finds it instantly.</p>` : ''}
          <button class="btn primary lg">Add to <span data-mealname>${currentMeal}</span></button>
        </form>`;
      body.querySelector('[data-back]').addEventListener('click', () => go(home));
      onMealChange = () => { body.querySelector('[data-mealname]').textContent = currentMeal; };
      const f = body.querySelector('[data-f]');
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const vals = { kcal: num(f.kcal.value) || 0, protein: num(f.protein.value) || 0, carbs: num(f.carbs.value) || 0, fat: num(f.fat.value) || 0 };
        const g = num(f.g.value);
        const base = { name: f.name.value.trim(), brand: f.brand.value.trim(), barcode: pre.barcode || '', source: 'mine' };
        if (!base.name) return;
        let c, t;
        if (f.basis.value === '100') {
          c = { ...base, per100: vals, serving: g ? { label: f.qty.value.trim() || 'portion', g } : null };
          t = F.portion(c, g || 100, 'g');
        } else if (g) {
          const k = 100 / g;
          c = { ...base, per100: { kcal: Math.round(vals.kcal * k), protein: +(vals.protein * k).toFixed(1), carbs: +(vals.carbs * k).toFixed(1), fat: +(vals.fat * k).toFixed(1) }, serving: { label: f.qty.value.trim() || 'portion', g } };
          t = F.portion(c, 1, 'serving');
        } else {
          c = { ...base, fixed: { label: f.qty.value.trim() || '1 serving', ...vals } };
          t = F.portion(c, 1, 'serving');
        }
        log(c, t);
        toast(`Added ${c.name} · ${t.kcal} kcal and saved to My foods`);
        go(home);
      });
    }

    const VIEWS = { search: home, scan, photo, voice, manual };
    if (typeof start === 'object') go(portionView, start);
    else go(VIEWS[start] || home);
  });
}
