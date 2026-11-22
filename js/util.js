// Shared helpers: DOM, formatting, storage, IndexedDB, toasts, colour extraction.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
export const fmtLong = s => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} h ${m} min` : `${m} min`; };
export const fmtNum = n => new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const plural = (n, one, many) => `${n.toLocaleString('es')} ${n === 1 ? one : many}`;
export const COVER = 'icons/cover.svg';
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

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
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.text)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
  el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2400);
}

/* Dominant colour of an image, tuned to sit well behind white text. */
const colorCache = new Map();
export function imageColor(url) {
  if (!url || url.startsWith('icons/')) return Promise.resolve([88, 60, 140]);
  if (colorCache.has(url)) return colorCache.get(url);
  const p = new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          const sat = mx ? (mx - mn) / mx : 0, wt = 0.15 + sat * sat * 3 + (mx > 40 && mx < 235 ? 0.5 : 0);
          r += R * wt; g += G * wt; b += B * wt; w += wt;
        }
        let rgb = [r / w, g / w, b / w];
        const l = (Math.max(...rgb) + Math.min(...rgb)) / 2;           // clamp lightness 55..120
        const k = l > 120 ? 120 / l : l < 55 ? 55 / Math.max(l, 1) : 1;
        res(rgb.map(v => Math.round(Math.min(255, v * k))));
      } catch { res([88, 60, 140]); }
    };
    img.onerror = () => res([88, 60, 140]);
    img.src = url;
  });
  colorCache.set(url, p); return p;
}
export const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
