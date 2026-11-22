// Shared helpers: DOM, formatting, storage, IndexedDB, toasts, colour extraction.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s || '');
export const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
export const fmtLong = s => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} h ${m} min` : `${m} min`; };
export const fmtNum = n => new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const plural = (n, one, many) => `${(n || 0).toLocaleString('es')} ${n === 1 ? one : many}`;
export const COVER = 'icons/cover.svg';
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const store = {
  get(k, d) { try { const v = localStorage.getItem('lt:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lt:' + k, JSON.stringify(v)); } catch { /* quota or private mode */ } },
  del(k) { try { localStorage.removeItem('lt:' + k); } catch { /* */ } }
};

export const idb = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('listentoo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(this._db = r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('files', mode), req = fn(tx.objectStore('files'));
      tx.oncomplete = () => res(req.result); tx.onerror = () => rej(tx.error);
    });
  },
  put(k, v) { return this.run('readwrite', s => s.put(v, k)); },
  get(k) { return this.run('readonly', s => s.get(k)); },
  del(k) { return this.run('readwrite', s => s.delete(k)); }
};

let toastTimer;
export function toast(msg, action) {
  const el = $('#toast'); if (!el) return;
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.text)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
  el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

/* Palette of an image: [dominant, secondary, tertiary] tuned for a dark or light UI. */
const palCache = new Map();
const FALLBACK = [[124, 58, 237], [6, 182, 212], [219, 39, 119]];
export function imagePalette(url) {
  if (!url || url.startsWith('icons/')) return Promise.resolve(FALLBACK);
  if (palCache.has(url)) return palCache.get(url);
  const p = new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const S = 30, c = document.createElement('canvas'); c.width = c.height = S;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, S, S);
        const d = x.getImageData(0, 0, S, S).data;
        // bucket colours by hue, weight by saturation
        const buckets = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const sat = mx ? (mx - mn) / mx : 0, light = (mx + mn) / 2;
          if (light < 18 || light > 245) continue;
          let h = 0; if (mx !== mn) { h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h = (h * 60 + 360) % 360; }
          const key = sat < 0.15 ? 'grey' : Math.round(h / 30);
          const w = 0.2 + sat * sat * 3;
          const bk = buckets.get(key) || { r: 0, g: 0, b: 0, w: 0 };
          bk.r += r * w; bk.g += g * w; bk.b += b * w; bk.w += w; buckets.set(key, bk);
        }
        const cols = [...buckets.values()].sort((a, b) => b.w - a.w).map(k => [k.r / k.w, k.g / k.w, k.b / k.w]);
        const tune = c => { const l = (Math.max(...c) + Math.min(...c)) / 2, k = l > 150 ? 150 / l : l < 70 ? 70 / Math.max(l, 1) : 1; return c.map(v => Math.round(Math.min(255, v * k))); };
        const out = cols.slice(0, 3).map(tune);
        while (out.length < 3) out.push(out[0] ? out[0].map((v, i) => Math.round((v + FALLBACK[out.length][i]) / 2)) : FALLBACK[out.length]);
        res(out);
      } catch { res(FALLBACK); }
    };
    img.onerror = () => res(FALLBACK);
    img.src = url;
  });
  palCache.set(url, p); return p;
}
export const imageColor = url => imagePalette(url).then(p => p[0]);
export const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
