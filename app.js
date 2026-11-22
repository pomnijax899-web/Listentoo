'use strict';
/* Listentoo — PWA music player.
   Sources: Audius (full tracks), iTunes Search (30s previews), local files (IndexedDB). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const COVER = 'icons/cover.svg';
const APP = 'Listentoo';

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('lt:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lt:' + k, JSON.stringify(v)); } catch { /* quota */ } }
};
const lib = {
  liked: store.get('liked', []),            // [track] newest first
  playlists: store.get('playlists', []),    // [{id,name,tracks:[track]}]
  recent: store.get('recent', []),          // [track]
  local: store.get('local', [])             // [track] (blobs live in IndexedDB)
};
const save = k => store.set(k, lib[k]);

const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('listentoo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(this.db = r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode); const out = fn(t.objectStore('files'));
      t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error);
    });
  },
  put(k, v) { return this.tx('readwrite', s => s.put(v, k)); },
  get(k) { return this.tx('readonly', s => s.get(k)); },
  del(k) { return this.tx('readwrite', s => s.delete(k)); }
};

/* ---------- catalog providers ---------- */
const GENRES = [
  ['Electronic', '#7c3aed'], ['Hip-Hop/Rap', '#ea580c'], ['Rock', '#dc2626'], ['Pop', '#db2777'],
  ['Alternative', '#0d9488'], ['Ambient', '#2563eb'], ['Jazz', '#ca8a04'], ['Latin', '#16a34a'],
  ['R&B/Soul', '#9333ea'], ['Metal', '#475569'], ['Reggae', '#65a30d'], ['Classical', '#b45309']
];

const audius = {
  base: 'https://api.audius.co/v1',
  async json(path) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(`${this.base}${path}${sep}app_name=${APP}`);
    if (!r.ok) throw new Error('Audius ' + r.status);
    return (await r.json()).data || [];
  },
  map(t) {
    return {
      id: 'a:' + t.id, src: 'audius', title: t.title, artist: t.user?.name || 'Desconocido',
      cover: t.artwork?.['480x480'] || t.artwork?.['150x150'] || '', dur: t.duration || 0,
      url: `${this.base}/tracks/${t.id}/stream?app_name=${APP}`, genre: t.genre || ''
    };
  },
  async trending(genre) { return (await this.json(`/tracks/trending?time=week&limit=30${genre ? '&genre=' + encodeURIComponent(genre) : ''}`)).map(t => this.map(t)); },
  async search(q) { return (await this.json(`/tracks/search?limit=30&query=${encodeURIComponent(q)}`)).map(t => this.map(t)); }
};

const itunes = {
  async search(q) {
    const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=30&term=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error('iTunes ' + r.status);
    return ((await r.json()).results || []).filter(t => t.previewUrl).map(t => ({
      id: 'i:' + t.trackId, src: 'itunes', title: t.trackName, artist: t.artistName, album: t.collectionName,
      cover: (t.artworkUrl100 || '').replace('100x100', '400x400'), dur: 30, url: t.previewUrl, preview: true
    }));
  }
};

/* ---------- player ---------- */
const audio = new Audio();
audio.preload = 'auto';
audio.crossOrigin = 'anonymous';
const P = { queue: [], order: [], pos: -1, shuffle: store.get('shuffle', false), repeat: store.get('repeat', 0), blobUrl: null };
audio.volume = store.get('volume', 0.8);

const cur = () => P.queue[P.order[P.pos]];
const isLiked = t => t && lib.liked.some(x => x.id === t.id);

function buildOrder(keepCurrent) {
  const n = P.queue.length, idx = [...Array(n).keys()];
  const current = keepCurrent && P.pos >= 0 ? P.order[P.pos] : -1;
  if (P.shuffle) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    if (current >= 0) { idx.splice(idx.indexOf(current), 1); idx.unshift(current); }
  }
  P.order = idx;
  P.pos = current >= 0 ? idx.indexOf(current) : P.pos;
}

async function loadSrc(t) {
  if (P.blobUrl) { URL.revokeObjectURL(P.blobUrl); P.blobUrl = null; }
  if (t.src === 'local') {
    const blob = await idb.get(t.id);
    if (!blob) throw new Error('Archivo local no encontrado');
    P.blobUrl = URL.createObjectURL(blob); return P.blobUrl;
  }
  return t.url;
}

let playToken = 0;
async function playAt(pos) {
  if (pos < 0 || pos >= P.order.length) return;
  P.pos = pos; const t = cur(), token = ++playToken;
  try {
    audio.src = await loadSrc(t);
    if (token !== playToken) return;
    await audio.play();
  } catch (e) {
    if (token !== playToken || e.name === 'AbortError') return;
    toast('No se pudo reproducir «' + t.title + '»');
    if (e.name !== 'NotAllowedError') { setTimeout(() => token === playToken && next(true), 800); }
  }
  addRecent(t); renderPlayer();
}

function playList(tracks, start = 0, shuffle) {
  if (!tracks.length) return;
  P.queue = tracks.slice();
  if (shuffle !== undefined) { P.shuffle = shuffle; store.set('shuffle', shuffle); }
  P.pos = -1; P.order = [];
  const startIdx = P.shuffle && shuffle ? Math.floor(Math.random() * tracks.length) : start;
  P.order = [...Array(tracks.length).keys()]; P.pos = startIdx;
  buildOrder(true); playAt(P.pos);
}

function next(auto) {
  if (!P.queue.length) return;
  if (auto && P.repeat === 2) { audio.currentTime = 0; audio.play(); return; }
  if (P.pos + 1 < P.order.length) return playAt(P.pos + 1);
  if (P.repeat === 1) { buildOrder(false); P.pos = 0; return playAt(0); }
  if (auto) { audio.pause(); audio.currentTime = 0; renderPlayer(); } else playAt(0);
}
function prev() {
  if (audio.currentTime > 3 || P.pos <= 0) { audio.currentTime = 0; return; }
  playAt(P.pos - 1);
}
function toggle() {
  if (!cur()) { const seed = lib.recent.length ? lib.recent : lib.liked; if (seed.length) playList(seed); return; }
  audio.paused ? audio.play().catch(() => {}) : audio.pause();
}
function playNext(t) { if (!cur()) return playList([t]); P.queue.splice(P.order[P.pos] + 1, 0, t); const base = P.order[P.pos]; buildOrderKeep(base); toast('Se reproducirá a continuación'); }
function addToQueue(t) { if (!cur()) return playList([t]); P.queue.push(t); P.order.push(P.queue.length - 1); toast('Añadida a la cola'); if (location.hash === '#/queue') route(); }
function buildOrderKeep(baseIdx) {
  // after splice-insert after current: shift indexes > baseIdx and put new item right after current in play order
  P.order = P.order.map(i => i > baseIdx ? i + 1 : i);
  P.order.splice(P.pos + 1, 0, baseIdx + 1);
  if (location.hash === '#/queue') route();
}
function setShuffle(v) { P.shuffle = v; store.set('shuffle', v); if (P.queue.length) buildOrder(true); renderPlayer(); }
function cycleRepeat() { P.repeat = (P.repeat + 1) % 3; store.set('repeat', P.repeat); renderPlayer(); }

function addRecent(t) {
  lib.recent = [t, ...lib.recent.filter(x => x.id !== t.id)].slice(0, 30); save('recent');
}

audio.addEventListener('ended', () => next(true));
audio.addEventListener('play', renderPlayState);
audio.addEventListener('pause', renderPlayState);
audio.addEventListener('timeupdate', renderTime);
audio.addEventListener('loadedmetadata', renderTime);
audio.addEventListener('error', () => { if (audio.src && cur()) { toast('Error al cargar la pista'); setTimeout(() => next(true), 800); } });

/* ---------- player UI ---------- */
const setRange = (el, v, max) => { el.value = v; el.style.setProperty('--p', (v / max * 100) + '%'); };
function renderTime() {
  const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (cur()?.dur || 0);
  if (!seeking) { const v = d ? audio.currentTime / d * 1000 : 0; setRange($('#seek'), v, 1000); setRange($('#npSeek'), v, 1000); }
  $('#tCur').textContent = $('#npCur').textContent = fmt(audio.currentTime);
  $('#tDur').textContent = $('#npDur').textContent = fmt(d);
  if ('mediaSession' in navigator && d && isFinite(audio.duration)) {
    try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate }); } catch { /* */ }
  }
}
function renderPlayState() {
  const playing = !audio.paused;
  $('#icoPlay').hidden = playing; $('#icoPause').hidden = !playing;
  $('#npIcoPlay').hidden = playing; $('#npIcoPause').hidden = !playing;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  $$('.row').forEach(r => r.classList.toggle('playing', r.dataset.id === cur()?.id));
}
function renderPlayer() {
  const t = cur();
  $('#pbTitle').textContent = $('#npTitle').textContent = t ? t.title : 'Nada sonando';
  $('#pbArtist').textContent = $('#npArtist').textContent = t ? t.artist + (t.preview ? ' · Preview 30 s' : '') : '—';
  $('#pbCover').src = $('#npCover').src = t?.cover || COVER;
  const liked = isLiked(t);
  [$('#pbLike'), $('#npLike')].forEach(b => { b.textContent = liked ? '♥' : '♡'; b.classList.toggle('on', liked); });
  [$('#btnShuffle'), $('#npShuffle')].forEach(b => b.classList.toggle('on', P.shuffle));
  [$('#btnRepeat'), $('#npRepeat')].forEach(b => b.classList.toggle('on', P.repeat > 0));
  $('#repeatOne').hidden = P.repeat !== 2;
  document.title = t ? `${t.title} · ${t.artist}` : 'Listentoo';
  if ('mediaSession' in navigator && t) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: t.album || APP,
      artwork: t.cover ? [{ src: t.cover, sizes: '512x512' }] : []
    });
  }
  renderPlayState(); renderTime();
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  [['play', () => audio.play()], ['pause', () => audio.pause()], ['previoustrack', prev], ['nexttrack', () => next(false)],
   ['seekto', e => { audio.currentTime = e.seekTime; }],
   ['seekbackward', e => { audio.currentTime -= e.seekOffset || 10; }], ['seekforward', e => { audio.currentTime += e.seekOffset || 10; }]
  ].forEach(([a, h]) => { try { ms.setActionHandler(a, h); } catch { /* unsupported */ } });
}

let seeking = false;
['#seek', '#npSeek'].forEach(sel => {
  const el = $(sel);
  el.addEventListener('input', () => { seeking = true; setRange(el, el.value, 1000); const d = audio.duration || cur()?.dur || 0; $('#tCur').textContent = $('#npCur').textContent = fmt(el.value / 1000 * d); });
  el.addEventListener('change', () => { if (isFinite(audio.duration)) audio.currentTime = el.value / 1000 * audio.duration; seeking = false; });
});
$('#btnPlay').onclick = $('#npPlay').onclick = toggle;
$('#btnNext').onclick = $('#npNext').onclick = () => next(false);
$('#btnPrev').onclick = $('#npPrev').onclick = prev;
$('#btnShuffle').onclick = $('#npShuffle').onclick = () => setShuffle(!P.shuffle);
$('#btnRepeat').onclick = $('#npRepeat').onclick = cycleRepeat;
$('#pbLike').onclick = $('#npLike').onclick = () => { const t = cur(); if (t) toggleLike(t); };
$('#btnQueue').onclick = $('#npQueue').onclick = () => { $('#npFull').hidden = true; location.hash = '#/queue'; };
$('#btnExpand').onclick = () => { if (cur()) $('#npFull').hidden = false; };
$('#pbTrack').onclick = e => { if (e.target.closest('#pbLike')) return; if (cur() && matchMedia('(max-width:900px)').matches) $('#npFull').hidden = false; };
$('#npClose').onclick = () => $('#npFull').hidden = true;
$('#npMore').onclick = e => { const t = cur(); if (t) openTrackMenu(t, e.currentTarget); };
function setVol(v) { audio.volume = v; store.set('volume', v); setRange($('#volume'), v * 100, 100); }
$('#volume').oninput = e => setVol(e.target.value / 100);
$('#btnMute').onclick = () => { audio.muted = !audio.muted; $('#btnMute').style.opacity = audio.muted ? .4 : 1; };
setVol(audio.volume);

document.addEventListener('keydown', e => {
  if (e.target.matches('input[type=text],input[type=search],textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowRight' && e.shiftKey) next(false);
  else if (e.code === 'ArrowLeft' && e.shiftKey) prev();
  else if (e.code === 'ArrowRight') audio.currentTime += 5;
  else if (e.code === 'ArrowLeft') audio.currentTime -= 5;
  else if (e.code === 'ArrowUp') { e.preventDefault(); setVol(Math.min(1, audio.volume + .05)); }
  else if (e.code === 'ArrowDown') { e.preventDefault(); setVol(Math.max(0, audio.volume - .05)); }
  else if (e.key === 'm') $('#btnMute').click();
  else if (e.key === 's') setShuffle(!P.shuffle);
  else if (e.key === 'r') cycleRepeat();
  else if (e.key === '/') { e.preventDefault(); location.hash = '#/search'; setTimeout(() => $('#q')?.focus(), 50); }
});

/* ---------- library actions ---------- */
function toggleLike(t) {
  if (isLiked(t)) { lib.liked = lib.liked.filter(x => x.id !== t.id); toast('Eliminada de Tus me gusta'); }
  else { lib.liked = [t, ...lib.liked]; toast('Añadida a Tus me gusta'); }
  save('liked'); renderPlayer();
  $$(`.row[data-id="${CSS.escape(t.id)}"] .like`).forEach(b => { const l = isLiked(t); b.textContent = l ? '♥' : '♡'; b.classList.toggle('on', l); });
  if (location.hash === '#/liked') route();
}
function createPlaylist(name, tracks = []) {
  const p = { id: uid(), name: name.trim() || 'Mi playlist', tracks };
  lib.playlists.push(p); save('playlists'); renderSide(); return p;
}
function addToPlaylist(pid, t) {
  const p = lib.playlists.find(x => x.id === pid); if (!p) return;
  if (p.tracks.some(x => x.id === t.id)) return toast('Ya está en «' + p.name + '»');
  p.tracks.push(t); save('playlists'); toast('Añadida a «' + p.name + '»'); renderSide();
}
function removeFromPlaylist(pid, tid) {
  const p = lib.playlists.find(x => x.id === pid); if (!p) return;
  p.tracks = p.tracks.filter(x => x.id !== tid); save('playlists'); renderSide(); route();
}

/* ---------- UI helpers ---------- */
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2200); }

function askText(title, value = '', ok = 'Guardar') {
  return new Promise(res => {
    const m = $('#modal');
    m.innerHTML = `<div><h3>${esc(title)}</h3><input type="text" maxlength="60" value="${esc(value)}"><div class="acts"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>${esc(ok)}</button></div></div>`;
    m.hidden = false; const inp = $('input', m); inp.focus(); inp.select();
    const done = v => { m.hidden = true; m.innerHTML = ''; res(v); };
    $('[data-x]', m).onclick = () => done(null);
    $('[data-ok]', m).onclick = () => done(inp.value);
    inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); };
    m.onclick = e => { if (e.target === m) done(null); };
  });
}

function showMenu(items, anchor, pt) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.label ? `<div class="lbl">${esc(it.label)}</div>` : `<button data-i="${i}">${esc(it.text)}</button>`).join('');
  m.hidden = false;
  const r = m.getBoundingClientRect(), a = anchor ? anchor.getBoundingClientRect() : { left: pt.x, right: pt.x + r.width, bottom: pt.y, top: pt.y };
  let x = Math.min(a.right - r.width, innerWidth - r.width - 8), y = a.bottom + 4;
  if (y + r.height > innerHeight - 8) y = Math.max(8, a.top - r.height - 4);
  m.style.left = Math.max(8, x) + 'px'; m.style.top = y + 'px';
  m.onclick = e => { const b = e.target.closest('button'); if (!b) return; m.hidden = true; items[b.dataset.i].run(); };
}
document.addEventListener('click', e => { if (!e.target.closest('#menu') && !e.target.closest('[data-more]')) $('#menu').hidden = true; }, true);
addEventListener('scroll', () => $('#menu').hidden = true, true);

function openTrackMenu(t, anchor, ctx = {}, pt) {
  const items = [
    { text: '▶ Reproducir', run: () => playList([t]) },
    { text: '⏭ Reproducir a continuación', run: () => playNext(t) },
    { text: '☰ Añadir a la cola', run: () => addToQueue(t) },
    { text: isLiked(t) ? '♥ Quitar de Tus me gusta' : '♡ Guardar en Tus me gusta', run: () => toggleLike(t) },
    '-', { label: 'Añadir a playlist' },
    { text: '＋ Nueva playlist…', run: async () => { const n = await askText('Nueva playlist', '', 'Crear'); if (n !== null) { createPlaylist(n, [t]); toast('Playlist creada'); } } },
    ...lib.playlists.map(p => ({ text: p.name, run: () => addToPlaylist(p.id, t) }))
  ];
  if (ctx.playlistId) items.push('-', { text: '✕ Quitar de esta playlist', run: () => removeFromPlaylist(ctx.playlistId, t.id) });
  if (t.src === 'local') items.push('-', { text: '🗑 Eliminar archivo', run: () => deleteLocal(t) });
  showMenu(items, anchor, pt);
}

function trackRows(tracks, ctx = {}) {
  if (!tracks.length) return '';
  return `<div class="tracks" data-ctx='${esc(JSON.stringify(ctx))}'>${tracks.map((t, i) => `
  <div class="row${cur()?.id === t.id ? ' playing' : ''}" data-i="${i}" data-id="${esc(t.id)}">
    <div class="num">${i + 1}</div>
    <div class="info"><img loading="lazy" src="${esc(t.cover || COVER)}" alt="" onerror="this.src='${COVER}'"><div><div class="rt ellipsis">${esc(t.title)}</div><div class="ra ellipsis">${esc(t.artist)}${t.preview ? ' · 30 s' : ''}</div></div></div>
    <button class="icon-btn like${isLiked(t) ? ' on' : ''}" data-like aria-label="Me gusta">${isLiked(t) ? '♥' : '♡'}</button>
    <div class="dur">${t.dur ? fmt(t.dur) : ''}</div>
    <button class="icon-btn" data-more aria-label="Más opciones">⋯</button>
  </div>`).join('')}</div>`;
}

const mosaic = (tracks, cls = '') => {
  const imgs = tracks.map(t => t.cover).filter(Boolean).slice(0, 4);
  if (imgs.length < 4) return imgs.length ? `<img class="${cls}" src="${esc(imgs[0])}" alt="">` : `<div class="mosaic empty ${cls}">♪</div>`;
  return `<div class="mosaic ${cls}">${imgs.map(s => `<img src="${esc(s)}" alt="">`).join('')}</div>`;
};

function trackCards(tracks) {
  return tracks.map((t, i) => `<div class="card" data-play-i="${i}"><img loading="lazy" src="${esc(t.cover || COVER)}" alt="" onerror="this.src='${COVER}'"><div class="t ellipsis">${esc(t.title)}</div><div class="s ellipsis">${esc(t.artist)}</div><div class="pp"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg></div></div>`).join('');
}

/* ---------- views ---------- */
const view = $('#view');
const cache = new Map();
const cached = async (key, fn, ttl = 600000) => {
  const c = cache.get(key); if (c && Date.now() - c.t < ttl) return c.v;
  const v = await fn(); cache.set(key, { t: Date.now(), v }); return v;
};
const loading = () => view.innerHTML = '<div class="spinner"></div>';
const offlineMsg = () => `<div class="empty-state">No se pudo conectar con el catálogo.<br>Comprueba tu conexión; tu biblioteca y archivos locales siguen disponibles.<br><button class="btn" onclick="route()">Reintentar</button></div>`;

let lists = {}; // per-render track lists for click handling
function bindList(key, tracks) { lists[key] = tracks; }

const nSongs = n => n + (n === 1 ? ' canción' : ' canciones');
const greeting = () => { const h = new Date().getHours(); return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; };

async function viewHome() {
  lists = {};
  let html = `<h1>${greeting()}</h1>`;
  if (lib.recent.length) { bindList('recent', lib.recent); html += `<h2>Escuchado recientemente</h2><div class="hscroll" data-list="recent">${trackCards(lib.recent.slice(0, 12))}</div>`; }
  html += `<h2>Explorar géneros</h2><div class="chips" id="homeGenres">${GENRES.slice(0, 8).map(([g]) => `<a class="chip" href="#/genre/${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}</div>`;
  view.innerHTML = html + '<div id="trendWrap"><div class="spinner"></div></div>';
  try {
    const tr = await cached('trend', () => audius.trending());
    bindList('trend', tr);
    $('#trendWrap').innerHTML = `<h2>Tendencias de la semana</h2><div class="hscroll" data-list="trend">${trackCards(tr.slice(0, 15))}</div>
      <h2>Top canciones</h2>${trackRows(tr.slice(0, 20), { list: 'trend' })}`;
  } catch { $('#trendWrap').innerHTML = offlineMsg(); }
}

async function viewGenre(g) {
  lists = {}; loading();
  try {
    const tr = await cached('g:' + g, () => audius.trending(g)); bindList('genre', tr);
    view.innerHTML = heroHtml({ kind: 'Género', title: g, sub: tr.length + ' canciones en tendencia', cover: mosaic(tr, 'cover'), tracks: tr }) + trackRows(tr, { list: 'genre' }) + (tr.length ? '' : '<div class="empty-state">Sin resultados</div>');
    bindList('genre', tr);
  } catch { view.innerHTML = offlineMsg(); }
}

let searchSeq = 0;
async function viewSearch(q = '') {
  lists = {};
  view.innerHTML = `<div class="search-box"><svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 1 0 5 14.2l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg><input id="q" type="search" placeholder="¿Qué quieres escuchar?" value="${esc(q)}" autocomplete="off" enterkeyhint="search"></div><div id="results"></div>`;
  const input = $('#q'); let t;
  input.oninput = () => { clearTimeout(t); t = setTimeout(() => runSearch(input.value.trim()), 350); };
  input.onkeydown = e => { if (e.key === 'Enter') { clearTimeout(t); runSearch(input.value.trim()); } };
  if (q) runSearch(q); else { $('#results').innerHTML = `<h2>Explorar todo</h2><div class="genres">${GENRES.map(([g, c]) => `<a class="genre" style="background:${c}" href="#/genre/${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}</div>`; input.focus(); }
}
async function runSearch(q) {
  const box = $('#results'); if (!box) return;
  history.replaceState(null, '', '#/search' + (q ? '?q=' + encodeURIComponent(q) : ''));
  if (!q) return viewSearch('');
  const seq = ++searchSeq; box.innerHTML = '<div class="spinner"></div>';
  const local = [...lib.local, ...lib.liked, ...lib.playlists.flatMap(p => p.tracks)].filter((t, i, a) => a.findIndex(x => x.id === t.id) === i)
    .filter(t => (t.title + ' ' + t.artist).toLowerCase().includes(q.toLowerCase()));
  const [a, i] = await Promise.allSettled([cached('s:a:' + q, () => audius.search(q), 300000), cached('s:i:' + q, () => itunes.search(q), 300000)]);
  if (seq !== searchSeq) return;
  const A = a.value || [], I = i.value || [];
  lists = { local, audius: A, itunes: I };
  let html = '';
  if (local.length) html += `<h2>En tu biblioteca</h2>${trackRows(local.slice(0, 8), { list: 'local' })}`;
  if (A.length) html += `<h2>Canciones completas</h2>${trackRows(A, { list: 'audius' })}`;
  if (I.length) html += `<h2>Previews de 30 s</h2>${trackRows(I, { list: 'itunes' })}`;
  if (!html) html = a.status === 'rejected' && i.status === 'rejected' ? offlineMsg() : `<div class="empty-state">No se encontró nada para «${esc(q)}».</div>`;
  box.innerHTML = html;
}

function heroHtml({ kind, title, sub, cover, tracks, extra = '' }) {
  return `<div class="hero">${cover}<div><div class="kind">${esc(kind)}</div><h1>${esc(title)}</h1><div class="muted">${esc(sub)}</div>
  <div class="actions"><button class="big-play" data-hero-play aria-label="Reproducir"><svg viewBox="0 0 24 24" fill="#fff"><path d="M7 4v16l13-8z"/></svg></button>
  <button class="icon-btn${P.shuffle ? ' on' : ''}" data-hero-shuffle aria-label="Aleatorio" title="Aleatorio"><svg viewBox="0 0 24 24"><path d="M17 3h4v4l-1.5-1.5-4 4-1.4-1.4 4-4zM3 6h4.5l9 12H21v2h-5.5l-9-12H3zm11.1 7.6 1.4 1.4-4 4H21v2h-9.5l-1.5-1.5z" transform="scale(.9) translate(1 1)"/></svg></button>${extra}</div></div></div>`;
}

function viewLiked() {
  lists = { liked: lib.liked };
  view.innerHTML = heroHtml({ kind: 'Playlist', title: 'Tus me gusta', sub: nSongs(lib.liked.length), cover: `<div class="mosaic empty cover" style="background:linear-gradient(135deg,#6d28d9,#ec4899);font-size:4rem">♥</div>`, tracks: lib.liked })
    + (lib.liked.length ? trackRows(lib.liked, { list: 'liked' }) : '<div class="empty-state">Toca el ♡ de cualquier canción para guardarla aquí.</div>');
}

function viewPlaylist(id) {
  const p = lib.playlists.find(x => x.id === id);
  if (!p) { view.innerHTML = '<div class="empty-state">Playlist no encontrada</div>'; return; }
  lists = { pl: p.tracks };
  view.innerHTML = heroHtml({ kind: 'Playlist', title: p.name, sub: nSongs(p.tracks.length), cover: mosaic(p.tracks, 'cover'), tracks: p.tracks,
    extra: `<button class="btn" data-rename>Renombrar</button><button class="btn" data-delpl>Eliminar</button>` })
    + (p.tracks.length ? trackRows(p.tracks, { list: 'pl', playlistId: id }) : `<div class="empty-state">Esta playlist está vacía.<br>Busca canciones y añádelas con ⋯ → Añadir a playlist.<br><a class="btn" href="#/search">Buscar música</a></div>`);
  $('[data-rename]').onclick = async () => { const n = await askText('Renombrar playlist', p.name); if (n) { p.name = n.trim(); save('playlists'); renderSide(); route(); } };
  $('[data-delpl]').onclick = () => { if (confirm('¿Eliminar la playlist «' + p.name + '»?')) { lib.playlists = lib.playlists.filter(x => x.id !== id); save('playlists'); renderSide(); location.hash = '#/library'; } };
}

function viewLibrary() {
  lists = { local: lib.local };
  view.innerHTML = `<h1>Tu biblioteca</h1>
  <div class="actions"><button class="btn primary" id="newPl">＋ Nueva playlist</button><button class="btn" id="addFiles">📁 Importar música del dispositivo</button></div>
  <div class="grid">
    <a class="card" href="#/liked"><div class="mosaic empty" style="background:linear-gradient(135deg,#6d28d9,#ec4899);font-size:3rem">♥</div><div class="t">Tus me gusta</div><div class="s">${nSongs(lib.liked.length)}</div></a>
    ${lib.playlists.map(p => `<a class="card" href="#/playlist/${p.id}">${mosaic(p.tracks)}<div class="t ellipsis">${esc(p.name)}</div><div class="s">${nSongs(p.tracks.length)}</div></a>`).join('')}
  </div>
  <h2>Archivos locales</h2>
  ${lib.local.length ? trackRows(lib.local, { list: 'local' }) : '<div class="empty-state">Importa MP3, M4A, FLAC, WAV… y escúchalos aquí, incluso sin conexión.</div>'}
  <h2>Escuchado recientemente</h2>${lib.recent.length ? (lists.recent = lib.recent, trackRows(lib.recent.slice(0, 15), { list: 'recent' })) : '<div class="empty-state">Aún no has escuchado nada.</div>'}`;
  $('#newPl').onclick = newPlaylistFlow; $('#addFiles').onclick = () => $('#filePicker').click();
}

function viewQueue() {
  lists = {};
  const upcoming = P.order.slice(P.pos + 1).map(i => P.queue[i]);
  lists.queue = upcoming; lists.now = cur() ? [cur()] : [];
  view.innerHTML = `<h1>Cola de reproducción</h1>
  ${cur() ? `<h2>Sonando ahora</h2>${trackRows([cur()], { list: 'now' })}` : ''}
  ${upcoming.length ? `<h2>A continuación</h2>${trackRows(upcoming, { list: 'queue', queue: 1 })}` : '<div class="empty-state">La cola está vacía. Reproduce algo o usa «Añadir a la cola».</div>'}`;
}

async function viewHash() {
  const [path, qs] = (location.hash.slice(1) || '/home').split('?');
  const parts = path.split('/').filter(Boolean), name = parts[0] || 'home';
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (name === 'liked' || name === 'playlist' || name === 'queue' ? 'library' : name === 'genre' ? 'search' : name)));
  $$('#sidePlaylists a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + path));
  $('#main').scrollTop = 0;
  if (name === 'home') return viewHome();
  if (name === 'search') return viewSearch(new URLSearchParams(qs || '').get('q') || '');
  if (name === 'genre') return viewGenre(decodeURIComponent(parts[1] || ''));
  if (name === 'library') return viewLibrary();
  if (name === 'liked') return viewLiked();
  if (name === 'playlist') return viewPlaylist(parts[1]);
  if (name === 'queue') return viewQueue();
  location.hash = '#/home';
}
function route() { viewHash(); }
window.route = route;
addEventListener('hashchange', route);

/* delegated clicks inside views */
view.addEventListener('click', e => {
  const row = e.target.closest('.row');
  if (row) {
    const wrap = row.closest('.tracks'); let ctx = {}; try { ctx = JSON.parse(wrap.dataset.ctx); } catch { /* */ }
    const list = lists[ctx.list] || [], i = +row.dataset.i, t = list[i]; if (!t) return;
    if (e.target.closest('[data-like]')) return toggleLike(t);
    if (e.target.closest('[data-more]')) return openTrackMenu(t, e.target.closest('[data-more]'), ctx);
    if (ctx.queue) { // jump inside the queue
      const target = P.order[P.pos + 1 + i]; const p = P.order.indexOf(target); return playAt(p);
    }
    if (ctx.list === 'now') return toggle();
    return playList(list, i);
  }
  const card = e.target.closest('[data-play-i]');
  if (card) { const key = card.parentElement.dataset.list; return playList(lists[key] || [], +card.dataset.playI); }
  const hp = e.target.closest('[data-hero-play]');
  if (hp) { const l = Object.values(lists)[0] || []; return playList(l, 0, false); }
  if (e.target.closest('[data-hero-shuffle]')) { const l = Object.values(lists)[0] || []; return playList(l, 0, true); }
});
view.addEventListener('contextmenu', e => {
  const row = e.target.closest('.row'); if (!row) return; e.preventDefault();
  const wrap = row.closest('.tracks'); let ctx = {}; try { ctx = JSON.parse(wrap.dataset.ctx); } catch { /* */ }
  const t = (lists[ctx.list] || [])[+row.dataset.i]; if (t) openTrackMenu(t, null, ctx, { x: e.clientX, y: e.clientY });
});

/* sidebar */
function renderSide() {
  $('#sidePlaylists').innerHTML = `<a href="#/liked"><div class="mosaic empty s" style="background:linear-gradient(135deg,#6d28d9,#ec4899);width:38px;height:38px;border-radius:6px;font-size:1rem">♥</div><span class="ellipsis">Tus me gusta</span></a>` +
    lib.playlists.map(p => `<a href="#/playlist/${p.id}">${p.tracks[0]?.cover ? `<img src="${esc(p.tracks[0].cover)}" alt="">` : `<div class="mosaic empty s" style="width:38px;height:38px;border-radius:6px;font-size:1rem">♪</div>`}<span class="ellipsis">${esc(p.name)}</span></a>`).join('');
}
async function newPlaylistFlow() { const n = await askText('Nueva playlist', '', 'Crear'); if (n === null) return; const p = createPlaylist(n); location.hash = '#/playlist/' + p.id; }
$('#newPlaylistBtn').onclick = newPlaylistFlow;

/* local files */
async function importFiles(files) {
  let n = 0;
  for (const f of files) {
    if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|flac|wav|ogg|opus|weba)$/i.test(f.name)) continue;
    const id = 'l:' + uid();
    const t = { id, src: 'local', title: f.name.replace(/\.[^.]+$/, ''), artist: 'Mi dispositivo', cover: '', dur: 0 };
    try {
      await idb.put(id, f);
      t.dur = await new Promise(res => { const a = new Audio(), u = URL.createObjectURL(f); a.preload = 'metadata'; a.onloadedmetadata = () => { res(a.duration || 0); URL.revokeObjectURL(u); }; a.onerror = () => res(0); a.src = u; });
      lib.local.push(t); n++;
    } catch { toast('No hay espacio para guardar «' + f.name + '»'); break; }
  }
  save('local'); if (n) { toast(n + ' archivo(s) importado(s)'); route(); }
}
$('#filePicker').onchange = e => { importFiles([...e.target.files]); e.target.value = ''; };
async function deleteLocal(t) {
  lib.local = lib.local.filter(x => x.id !== t.id); save('local'); idb.del(t.id).catch(() => {});
  lib.liked = lib.liked.filter(x => x.id !== t.id); save('liked');
  lib.playlists.forEach(p => p.tracks = p.tracks.filter(x => x.id !== t.id)); save('playlists');
  toast('Archivo eliminado'); renderSide(); route();
}
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer?.files?.length) importFiles([...e.dataTransfer.files]); });

/* ---------- PWA ---------- */
let deferredInstall;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#installBtn').hidden = true; };
addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('¡Listentoo instalada!'); });
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone && !store.get('iosHint', false)) {
  setTimeout(() => { toast('Para instalar: Compartir → «Añadir a pantalla de inicio»'); store.set('iosHint', true); }, 2500);
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

/* boot */
renderSide(); renderPlayer(); route();
