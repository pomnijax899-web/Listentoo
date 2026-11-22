// App shell: routing, player UI, now-playing views, lyrics, settings, PWA.
import { $, $$, esc, fmt, fmtNum, store, toast, imageColor, rgb, COVER, debounce } from './util.js';
import { lib } from './library.js';
import { player } from './player.js';
import { deezer, lyrics as fetchLyrics, youtube } from './api.js';
import * as V from './views.js';
import { icons, getList, trackMenu, showMenu, hideMenu, modal, prompt, share } from './ui.js';

/* ================= ROUTER ================= */
const routes = {
  home: () => V.home(), search: (p, q) => V.search(q.get('q') || ''), library: () => V.library(), liked: () => V.liked(),
  artist: p => V.artist(p[1]), album: p => V.album(p[1]), dzplaylist: p => V.dzplaylist(p[1]), playlist: p => V.playlist(p[1]),
  genre: p => V.genre(p[1]), chart: () => V.chart(0), queue: () => V.queue(), lyrics: () => lyricsPage()
};
let current = '';
function route() {
  const [path, qs] = (location.hash.slice(1) || '/home').split('?');
  const parts = path.split('/').filter(Boolean), name = parts[0] || 'home';
  if (!routes[name]) { location.replace('#/home'); return; }
  const key = path + (name === 'search' ? '' : '?' + (qs || ''));
  const sameSearch = name === 'search' && current.startsWith('/search');
  current = key;
  document.body.dataset.route = name;
  const navName = ['liked', 'playlist', 'queue'].includes(name) ? 'library' : name === 'genre' || name === 'chart' ? 'search' : name;
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navName));
  $$('#sideList a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + path));
  $('#tbTitle').textContent = '';
  if (!sameSearch) { $('#main').scrollTop = 0; $('#view').classList.remove('enter'); void $('#view').offsetWidth; $('#view').classList.add('enter'); }
  hideMenu();
  if (name !== 'lyrics') lyricsPageActive = false;
  routes[name](parts, new URLSearchParams(qs || ''));
  if ($('#np').classList.contains('open') && name !== 'lyrics') closeNP();
}
addEventListener('hashchange', route);
$('#back').onclick = () => history.back();
$('#fwd').onclick = () => history.forward();

/* top bar: fades in as you scroll, shows page title */
$('#main').addEventListener('scroll', () => {
  const y = $('#main').scrollTop, h1 = $('#view h1');
  $('#topbar').style.setProperty('--o', Math.min(1, y / 220).toFixed(2));
  $('#topbar').classList.toggle('titled', !!h1 && y > 280);
  if (h1) $('#tbTitle').textContent = h1.textContent;
}, { passive: true });

/* search box in top bar */
const sInput = $('#searchInput');
const goSearch = debounce(q => {
  const target = '#/search' + (q ? '?q=' + encodeURIComponent(q) : '');
  if (location.hash.startsWith('#/search')) { history.replaceState(null, '', target); route(); } else location.hash = target;
}, 320);
sInput.addEventListener('input', () => { $('#searchClear').hidden = !sInput.value; goSearch(sInput.value.trim()); });
sInput.addEventListener('focus', () => { if (!location.hash.startsWith('#/search')) location.hash = '#/search' + (sInput.value ? '?q=' + encodeURIComponent(sInput.value) : ''); });
sInput.addEventListener('keydown', e => { if (e.key === 'Escape') sInput.blur(); });
$('#searchClear').onclick = () => { sInput.value = ''; $('#searchClear').hidden = true; goSearch(''); sInput.focus(); };

/* ================= SIDEBAR LIBRARY ================= */
let sideFilter = store.get('sideFilter', '');
function renderSide() {
  const items = [
    { kind: 'liked', href: '#/liked', title: 'Tus me gusta', sub: `Playlist · ${lib.liked.length} canciones`, art: `<div class="sart liked-art">${icons.heartOn}</div>`, f: 'playlists' },
    ...lib.playlists.map(p => ({ href: `#/playlist/${p.id}`, title: p.name, sub: 'Playlist · Tú', art: p.tracks[0]?.cover ? `<img class="sart" src="${esc(p.tracks[0].cover)}" alt="" loading="lazy">` : `<div class="sart empty-art">${icons.music}</div>`, f: 'playlists' })),
    ...lib.dzplaylists.map(p => ({ href: `#/dzplaylist/${p.id}`, title: p.title, sub: `Playlist · ${p.by}`, art: `<img class="sart" src="${esc(p.cover)}" alt="" loading="lazy">`, f: 'playlists' })),
    ...lib.albums.map(a => ({ href: `#/album/${a.id}`, title: a.title, sub: `Álbum · ${a.artist}`, art: `<img class="sart" src="${esc(a.cover)}" alt="" loading="lazy">`, f: 'albums' })),
    ...lib.artists.map(a => ({ href: `#/artist/${a.id}`, title: a.name, sub: 'Artista', art: `<img class="sart round" src="${esc(a.pic)}" alt="" loading="lazy">`, f: 'artists' }))
  ].filter(i => !sideFilter || i.f === sideFilter);
  const playingHref = player.ctx.href;
  $('#sideList').innerHTML = items.map(i => `<a href="${i.href}" class="${location.hash === i.href ? 'active' : ''}">${i.art}<div class="smeta"><div class="ellipsis st${playingHref === i.href ? ' playing' : ''}">${esc(i.title)}</div><div class="ellipsis ss">${esc(i.sub)}</div></div>${playingHref === i.href && !player.paused ? '<span class="eq"><i></i><i></i><i></i><i></i></span>' : ''}</a>`).join('')
    || '<div class="side-empty"><b>Crea tu primera playlist</b><p>Es muy fácil, te ayudaremos.</p><button class="pill primary sm" id="sideCreate">Crear playlist</button></div>';
  $('#sideCreate')?.addEventListener('click', newPlaylist);
  $$('#sideFilters .chip').forEach(c => c.classList.toggle('on', c.dataset.sf === sideFilter));
}
$('#sideFilters').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; sideFilter = sideFilter === c.dataset.sf ? '' : c.dataset.sf; store.set('sideFilter', sideFilter); renderSide(); };
async function newPlaylist() { const n = await prompt('Nueva playlist', '', 'Crear'); if (n === null) return; const p = lib.createPlaylist(n); location.hash = '#/playlist/' + p.id; }
$('#sideNew').onclick = newPlaylist;
lib.addEventListener('change', e => {
  if (['playlists', 'albums', 'artists', 'dzplaylists', 'liked'].includes(e.detail)) renderSide();
  if (e.detail === 'liked') refreshLikes();
  if (e.detail === 'playlists' && location.hash.startsWith('#/playlist/')) route();
  if (e.detail === 'liked' && location.hash === '#/liked') route();
  if (e.detail === 'local' && location.hash === '#/library') route();
});

/* ================= DELEGATED CLICKS ================= */
document.addEventListener('click', async e => {
  // track rows
  const row = e.target.closest('.trow:not(.head)');
  const wrap = row?.closest('.tracks[data-list]');
  if (row && wrap) {
    if (e.target.closest('a')) return;
    const L = getList(wrap.dataset.list); if (!L) return;
    const i = +row.dataset.i, t = L.tracks[i];
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'like') { lib.toggleLike(t); return; }
    if (act === 'more') { trackMenu(t, e.target.closest('[data-act]'), { playlistId: L.playlistId }); return; }
    if (wrap.dataset.now) return player.toggle();
    if (wrap.dataset.manual) return player.jumpManual(i);
    if (wrap.dataset.upcoming) return player.jumpUpcoming(i);
    if (player.current?.id === t.id && player.ctx.href === L.href && L.href) return player.toggle();
    // single click plays on touch devices; desktop: click plays too (Spotify uses dblclick, but that hurts discoverability)
    return player.playList(L.tracks, i, { label: L.label, href: L.href });
  }
  // track cards (recent, indie)
  const tcard = e.target.closest('[data-track-i]');
  if (tcard) { const L = getList(tcard.parentElement.dataset.list); if (L) player.playList(L.tracks, +tcard.dataset.trackI, { label: L.label, href: L.href }); return; }
  // play button on collection cards / quick tiles
  const fab = e.target.closest('[data-act="playcoll"]');
  if (fab) {
    e.preventDefault(); e.stopPropagation();
    const el = fab.closest('[data-kind]'); await playCollection(el.dataset.kind, el.dataset.id, fab); return;
  }
});
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.trow:not(.head)'), wrap = row?.closest('.tracks[data-list]');
  if (!row || !wrap) return;
  const L = getList(wrap.dataset.list); const t = L?.tracks[+row.dataset.i]; if (!t) return;
  e.preventDefault(); trackMenu(t, { x: e.clientX, y: e.clientY }, { playlistId: L.playlistId });
});
document.addEventListener('keydown', e => {
  const row = e.target.closest?.('.trow:not(.head)');
  if (row && e.key === 'Enter') row.click();
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('#menu')) hideMenu(); });
$('#main').addEventListener('scroll', hideMenu, { passive: true });

async function playCollection(kind, id, btn) {
  const href = kind === 'liked' ? '#/liked' : `#/${kind}/${id}`;
  if (player.ctx.href === href && player.current) return player.toggle();
  btn?.classList.add('busy');
  try {
    let tracks = [], label = '';
    if (kind === 'album') { const a = await deezer.album(id); tracks = a.tracks; label = a.title; }
    else if (kind === 'artist') { const [a, top] = await Promise.all([deezer.artist(id), deezer.artistTop(id, 20)]); tracks = top; label = a.name; }
    else if (kind === 'dzplaylist') { const p = await deezer.playlist(id); tracks = p.tracks; label = p.title; }
    else if (kind === 'playlist') { const p = lib.playlist(id); tracks = p?.tracks || []; label = p?.name; }
    else if (kind === 'liked') { tracks = lib.liked; label = 'Tus me gusta'; }
    if (!tracks.length) toast('No hay canciones para reproducir');
    else player.playList(tracks, 0, { label, href });
  } catch { toast('No se pudo cargar'); }
  btn?.classList.remove('busy');
}

/* ================= SLIDERS ================= */
function slider(el, { onInput, onCommit }) {
  let dragging = false;
  const val = e => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  el.addEventListener('pointerdown', e => { dragging = true; el.setPointerCapture(e.pointerId); el.classList.add('drag'); const v = val(e); set(el, v); onInput?.(v); });
  el.addEventListener('pointermove', e => { if (!dragging) return; const v = val(e); set(el, v); onInput?.(v); });
  const end = e => { if (!dragging) return; dragging = false; el.classList.remove('drag'); onCommit?.(val(e)); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { dragging = false; el.classList.remove('drag'); });
  el.addEventListener('keydown', e => {
    const cur = parseFloat(el.style.getPropertyValue('--p')) / 100 || 0;
    const step = e.shiftKey ? 0.1 : 0.03;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); onCommit?.(Math.min(1, cur + step)); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); onCommit?.(Math.max(0, cur - step)); }
  });
  return { get dragging() { return dragging; } };
}
const set = (el, v) => { el.style.setProperty('--p', (v * 100).toFixed(2) + '%'); el.setAttribute('aria-valuenow', Math.round(v * 100)); };

const seekers = ['#seek', '#npSeek'].map(sel => slider($(sel), {
  onInput: v => { $('#tCur').textContent = $('#npCur').textContent = fmt(v * player.duration); },
  onCommit: v => player.seek(v * player.duration)
}));
slider($('#volume'), { onInput: v => player.setVolume(v), onCommit: v => player.setVolume(v) });

/* ================= PLAYER UI ================= */
const repeatIcon = r => r === 2
  ? '<svg viewBox="0 0 24 24"><path d="M5 5h12v-2.5L21 6l-4 3.5V7H7v5H5zm14 7h2v7H7v2.5L3 18l4-3.5V17h10z"/><text x="12" y="15" font-size="7" text-anchor="middle" font-weight="800" fill="currentColor">1</text></svg>'
  : '<svg viewBox="0 0 24 24"><path d="M5 5h12v-2.5L21 6l-4 3.5V7H7v5H5zm14 7h2v7H7v2.5L3 18l4-3.5V17h10z"/></svg>';
const volIcon = v => v === 0 ? '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zm13.6 3 2.7-2.7 1.4 1.4-2.7 2.7 2.7 2.7-1.4 1.4-2.7-2.7-2.7 2.7-1.4-1.4 2.7-2.7-2.7-2.7 1.4-1.4z"/></svg>'
  : v < .5 ? '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>'
  : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

function renderTrack() {
  const t = player.current; if (!t) return;
  $('#plCover').src = $('#nppCover').src = t.cover || COVER;
  $('#npCover').src = t.coverXL || t.cover || COVER;
  $('#plTitle').textContent = $('#npTitle').textContent = $('#nppTitle').textContent = t.title;
  $('#plTitle').href = t.albumId ? `#/album/${t.albumId}` : player.ctx.href || '#/queue';
  $('#plArtist').innerHTML = t.artistId ? `<a href="#/artist/${t.artistId}">${esc(t.artist)}</a>` : esc(t.artist);
  $('#nppArtist').innerHTML = $('#plArtist').innerHTML;
  $('#npArtist').textContent = t.artist; $('#npArtist').href = t.artistId ? `#/artist/${t.artistId}` : '#/queue';
  $('#npCtx').textContent = $('#nppCtx').textContent = player.ctx.label || 'Tu música';
  $('#npCtx').href = player.ctx.href || '#/queue';
  document.title = `${t.title} · ${t.artist}`;
  refreshLikes();
  imageColor(t.cover).then(c => {
    if (player.current !== t) return;
    document.documentElement.style.setProperty('--np', rgb(c));
    document.documentElement.style.setProperty('--np-a', rgb(c, .6));
    $('meta[name=theme-color]').content = $('#np').classList.contains('open') ? rgb(c) : '#08080c';
  });
  $$('.trow').forEach(r => r.classList.toggle('playing', r.dataset.id === t.id));
  renderSide(); renderArtistCard(t); loadLyrics(t);
  $('#app').classList.add('has-track');
}
function refreshLikes() {
  const t = player.current, on = lib.isLiked(t);
  ['#plLike', '#npLike', '#nppLike'].forEach(s => { const b = $(s); b.innerHTML = on ? icons.heartOn : icons.heart; b.classList.toggle('on', on); b.title = on ? 'Quitar de Tus me gusta' : 'Guardar en Tus me gusta'; });
  $$('.trow').forEach(r => { const b = r.querySelector('[data-act="like"]'); if (!b) return; const L = getList(r.closest('.tracks')?.dataset.list); const tr = L?.tracks[+r.dataset.i]; if (!tr) return; const l = lib.isLiked(tr); b.classList.toggle('on', l); b.innerHTML = l ? icons.heartOn : icons.heart; });
}
['#plLike', '#npLike', '#nppLike'].forEach(s => $(s).onclick = () => player.current && lib.toggleLike(player.current));

function renderState() {
  const p = player.paused, ic = p ? icons.play : icons.pause, lbl = p ? 'Reproducir' : 'Pausar';
  ['#playBtn', '#npPlay', '#miniPlay'].forEach(s => { const b = $(s); b.innerHTML = ic; b.setAttribute('aria-label', lbl); b.classList.toggle('loading', player.loading); });
  document.body.classList.toggle('is-playing', !p);
  $$('.bigplay[data-list]').forEach(b => { const L = getList(b.dataset.list); const mine = L && player.ctx.href && L.href === player.ctx.href; b.innerHTML = mine && !p ? icons.pause : icons.play; });
  $$('.card[data-kind], .qtile[data-kind]').forEach(c => { const href = c.dataset.kind === 'liked' ? '#/liked' : `#/${c.dataset.kind}/${c.dataset.id}`; const on = player.ctx.href === href && !p; c.classList.toggle('active-play', on); const f = c.querySelector('.fab'); if (f) f.innerHTML = on ? icons.pause : icons.play; });
}
function renderTime() {
  const d = player.duration, t = player.time, v = d ? t / d : 0;
  seekers.forEach((s, i) => { if (!s.dragging) set($(i ? '#npSeek' : '#seek'), v); });
  if (!seekers.some(s => s.dragging)) { $('#tCur').textContent = $('#npCur').textContent = fmt(t); }
  $('#tDur').textContent = $('#npDur').textContent = fmt(d);
  $('#miniProgress i').style.width = (v * 100) + '%';
  syncLyrics(t);
}
function renderMode() {
  ['#shuffleBtn', '#npShuffle'].forEach(sel => { const b = $(sel); b.innerHTML = icons.shuffle; b.classList.toggle('on', player.shuffle); });
  ['#repeatBtn', '#npRepeat'].forEach(sel => { const b = $(sel); b.innerHTML = repeatIcon(player.repeat); b.classList.toggle('on', player.repeat > 0); b.title = ['Repetir', 'Repetir todo', 'Repetir canción'][player.repeat]; });
  $$('[data-hero="shuffle"]').forEach(b => b.classList.toggle('on', player.shuffle));
}
function renderEngine() {
  const m = player.mode, b = $('#modeBadge');
  b.hidden = !m || m === 'full';
  b.textContent = m === 'preview' ? 'Vista previa 30 s' : m === 'yt' ? 'Completa · YouTube' : '';
  b.className = 'mode-badge ' + m;
  $('#npMode').textContent = m === 'preview' ? 'VISTA PREVIA' : m === 'yt' ? 'YOUTUBE' : '';
  const yt = player.engine === 'yt';
  $('#ytDock').hidden = !yt;
  document.body.classList.toggle('yt-on', yt);
}
function renderVolume() { set($('#volume'), player.muted ? 0 : player.volume); $('#muteBtn').innerHTML = volIcon(player.muted ? 0 : player.volume); }

player.addEventListener('track', renderTrack);
player.addEventListener('state', renderState);
player.addEventListener('time', renderTime);
player.addEventListener('mode', renderMode);
player.addEventListener('engine', () => { renderEngine(); renderTime(); });
player.addEventListener('volume', renderVolume);
player.addEventListener('queue', () => { renderNext(); if (location.hash === '#/queue') V.queue(); });
player.addEventListener('sleep', () => $('#npSleep').classList.toggle('on', !!player.sleep));

$('#playBtn').onclick = $('#npPlay').onclick = () => player.toggle();
$('#miniPlay').onclick = e => { e.stopPropagation(); player.toggle(); };
$('#nextBtn').onclick = $('#npNext').onclick = () => player.next();
$('#prevBtn').onclick = $('#npPrev').onclick = () => player.prev();
$('#shuffleBtn').onclick = $('#npShuffle').onclick = () => player.setShuffle(!player.shuffle);
$('#repeatBtn').onclick = $('#npRepeat').onclick = () => player.cycleRepeat();
$('#muteBtn').onclick = () => player.toggleMute();
$('#queueBtn').onclick = $('#npQueue').onclick = () => { location.hash = location.hash === '#/queue' ? '#/home' : '#/queue'; };
$('#lyricsBtn').onclick = () => { location.hash = location.hash === '#/lyrics' ? '#/home' : '#/lyrics'; };
$('#modeBadge').onclick = () => openSettings();
$('#npShare').onclick = () => { const t = player.current; if (t) share(`${t.title} · ${t.artist}`, t.albumId ? `#/album/${t.albumId}` : '#/home'); };
$('#npMore').onclick = e => { const t = player.current; if (t) trackMenu(t, e.currentTarget); };
$('#npSleep').onclick = e => showMenu([
  { label: 'Temporizador' },
  ...[5, 15, 30, 45, 60].map(m => ({ text: `${m} minutos`, run: () => player.setSleep(m) })),
  { text: 'Al final de la canción', run: () => player.setSleep('track') },
  ...(player.sleep ? ['-', { text: 'Desactivar temporizador', run: () => player.setSleep(0) }] : [])
], e.currentTarget);

/* full-screen player */
function openNP() { if (!player.current) return; const np = $('#np'); np.hidden = false; requestAnimationFrame(() => np.classList.add('open')); document.body.classList.add('np-open'); $('meta[name=theme-color]').content = getComputedStyle(document.documentElement).getPropertyValue('--np').trim() || '#08080c'; }
function closeNP() { const np = $('#np'); np.classList.remove('open'); document.body.classList.remove('np-open'); setTimeout(() => { if (!np.classList.contains('open')) np.hidden = true; }, 320); $('meta[name=theme-color]').content = '#08080c'; }
$('#fullBtn').onclick = () => $('#np').classList.contains('open') ? closeNP() : openNP();
$('#npClose').onclick = closeNP;
$('#plExpandCover').onclick = openNP;
$('#plLeft').addEventListener('click', e => { if (matchMedia('(max-width: 820px)').matches && !e.target.closest('button, a')) openNP(); });
$('#player').addEventListener('click', e => { if (matchMedia('(max-width: 820px)').matches && !e.target.closest('button, a, .slider')) openNP(); });
// swipe down to close
let sy = null;
$('#np').addEventListener('touchstart', e => { if (e.target.closest('.slider, .lyrics')) return; sy = e.touches[0].clientY; }, { passive: true });
$('#np').addEventListener('touchmove', e => { if (sy === null) return; const dy = e.touches[0].clientY - sy; if (dy > 0) $('#np .np-inner').style.transform = `translateY(${dy}px)`; }, { passive: true });
$('#np').addEventListener('touchend', e => { if (sy === null) return; const dy = e.changedTouches[0].clientY - sy; $('#np .np-inner').style.transform = ''; sy = null; if (dy > 120) closeNP(); });
// mini player swipe left/right
let sx = null;
$('#player').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
$('#player').addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 70 && matchMedia('(max-width: 820px)').matches) dx < 0 ? player.next() : player.prev(); });

/* side now-playing panel */
const npPanelOn = () => store.get('npPanel', true);
function syncPanel() { $('#npPanel').hidden = !(npPanelOn() && player.current); $('#npViewBtn').classList.toggle('on', npPanelOn()); $('#app').classList.toggle('panel-open', !$('#npPanel').hidden); }
$('#npViewBtn').onclick = () => { store.set('npPanel', !npPanelOn()); syncPanel(); };
$('#nppClose').onclick = () => { store.set('npPanel', false); syncPanel(); };
$('#nppLyricsOpen').onclick = () => { location.hash = '#/lyrics'; };
player.addEventListener('track', syncPanel);

async function renderArtistCard(t) {
  const box = $('#nppArtistCard');
  if (!t.artistId) { box.innerHTML = ''; return; }
  try {
    const a = await deezer.artist(t.artistId); if (player.current !== t) return;
    const following = lib.isSaved('artist', a.id);
    box.innerHTML = `<div class="ac-img" style="background-image:url('${esc(a.picXL)}')"><span>Información del artista</span></div><div class="ac-body"><a href="#/artist/${a.id}" class="ac-name">${esc(a.name)}</a><div class="ac-row"><span class="muted">${fmtNum(a.fans)} seguidores</span><button class="pill ghost sm" id="acFollow">${following ? 'Siguiendo' : 'Seguir'}</button></div></div>`;
    $('#acFollow').onclick = () => { lib.toggleSaved('artist', { kind: 'artist', id: a.id, name: a.name, pic: a.pic }); renderArtistCard(t); };
  } catch { box.innerHTML = ''; }
}
function renderNext() {
  const nx = player.manual[0] || player.upcoming[0], box = $('#nppNext');
  box.innerHTML = nx ? `<div class="npp-card-h"><b>Siguiente en la cola</b><a class="linkbtn" href="#/queue">Abrir cola</a></div><div class="next-row" id="nextRow"><img src="${esc(nx.cover || COVER)}" alt=""><div class="smeta"><div class="ellipsis st">${esc(nx.title)}</div><div class="ellipsis ss">${esc(nx.artist)}</div></div></div>` : '';
  $('#nextRow')?.addEventListener('click', () => player.next());
}

/* ================= LYRICS ================= */
let lyr = null, lyrIdx = -1, lyricsPageActive = false;
async function loadLyrics(t) {
  lyr = null; lyrIdx = -1;
  $$('[data-lyrics]').forEach(el => { el.innerHTML = '<div class="lyr-msg">Buscando letra…</div>'; });
  if (lyricsPageActive) $('#lyricsPage') && ($('#lyricsPage').innerHTML = '<div class="lyr-msg">Buscando letra…</div>');
  try { lyr = await fetchLyrics(t); } catch { lyr = null; }
  if (player.current !== t) return;
  paintLyrics();
}
function lyricsHTML() {
  if (!lyr) return '<div class="lyr-msg">No hay letra disponible para esta canción.</div>';
  if (lyr.instrumental) return '<div class="lyr-msg">♪ Instrumental ♪</div>';
  return (lyr.synced ? '' : '<div class="lyr-note">Letra sin sincronizar</div>') + lyr.lines.map((l, i) => `<p data-li="${i}" class="${lyr.synced ? '' : 'plain'}">${esc(l.text) || '&nbsp;'}</p>`).join('');
}
function paintLyrics() {
  const html = lyricsHTML();
  $$('[data-lyrics]').forEach(el => { el.innerHTML = html; });
  if (lyricsPageActive && $('#lyricsPage')) $('#lyricsPage').innerHTML = html;
  lyrIdx = -1; syncLyrics(player.time);
}
function syncLyrics(t) {
  if (!lyr?.synced || player.mode === 'preview') return;
  let i = -1; for (let k = 0; k < lyr.lines.length; k++) { if (lyr.lines[k].t <= t + 0.25) i = k; else break; }
  if (i === lyrIdx) return; lyrIdx = i;
  $$('[data-lyrics], #lyricsPage').forEach(box => {
    box.querySelectorAll('p').forEach((p, k) => { p.classList.toggle('on', k === i); p.classList.toggle('past', k < i); });
    const cur = box.querySelector(`p[data-li="${i}"]`);
    if (!cur || !box.offsetParent) return;
    if (box.id === 'lyricsPage') cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else box.scrollTo({ top: cur.offsetTop - box.clientHeight * 0.4, behavior: 'smooth' });
  });
}
document.addEventListener('click', e => {
  const p = e.target.closest('[data-lyrics] p[data-li], #lyricsPage p[data-li]');
  if (p && lyr?.synced && player.mode !== 'preview') player.seek(lyr.lines[+p.dataset.li].t);
});
function lyricsPage() {
  lyricsPageActive = true;
  const t = player.current;
  document.documentElement.style.setProperty('--tint', getComputedStyle(document.documentElement).getPropertyValue('--np'));
  $('#view').innerHTML = t ? `<div class="lyrics-page"><div class="lp-head">${t.cover ? `<img src="${esc(t.cover)}" alt="">` : ''}<div><b>${esc(t.title)}</b><div class="muted">${esc(t.artist)}</div></div></div>${player.mode === 'preview' ? '<div class="lyr-note">Las letras se sincronizan con la canción completa. Activa la reproducción completa en Ajustes.</div>' : ''}<div class="lyrics big" id="lyricsPage"></div><p class="fine">Letras de LRCLIB</p></div>` : '<div class="empty"><h3>Reproduce algo para ver la letra</h3></div>';
  if (t) { $('#lyricsPage').innerHTML = lyr ? lyricsHTML() : '<div class="lyr-msg">Buscando letra…</div>'; lyrIdx = -1; syncLyrics(player.time); }
}

/* ================= KEYBOARD ================= */
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === ' ' || k === 'k') { e.preventDefault(); player.toggle(); }
  else if (k === 'ArrowRight' && e.shiftKey) player.next();
  else if (k === 'ArrowLeft' && e.shiftKey) player.prev();
  else if (k === 'ArrowRight' && !e.target.closest('.slider')) player.seek(player.time + 5);
  else if (k === 'ArrowLeft' && !e.target.closest('.slider')) player.seek(player.time - 5);
  else if (k === 'ArrowUp' && !e.target.closest('.slider')) { e.preventDefault(); player.setVolume(player.volume + .05); }
  else if (k === 'ArrowDown' && !e.target.closest('.slider')) { e.preventDefault(); player.setVolume(player.volume - .05); }
  else if (k === 'm') player.toggleMute();
  else if (k === 's') player.setShuffle(!player.shuffle);
  else if (k === 'r') player.cycleRepeat();
  else if (k === 'l' && player.current) lib.toggleLike(player.current);
  else if (k === 'f') $('#fullBtn').click();
  else if (k === '/') { e.preventDefault(); sInput.focus(); }
  else if (k === 'Escape' && $('#np').classList.contains('open')) closeNP();
});

/* ================= SETTINGS ================= */
function openSettings() {
  const s = lib.settings;
  modal(`<div class="settings">
    <h3>Ajustes</h3>
    <section><h4>Reproducción completa</h4>
      <p class="muted">Listentoo usa el catálogo de Deezer (más de 120 millones de canciones). Sin configuración, las canciones comerciales suenan como <b>vista previa de 30 s</b> y la música independiente de Audius suena completa.</p>
      <p class="muted">Para escuchar <b>todas las canciones completas</b>, añade una clave gratuita de la API de YouTube: la canción se reproducirá en el reproductor oficial de YouTube integrado.</p>
      <ol class="steps"><li>Entra en <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud Console</a> y activa «YouTube Data API v3».</li><li>En «Credenciales», crea una «Clave de API».</li><li>Pégala aquí. Se guarda solo en este dispositivo.</li></ol>
      <div class="keyrow"><input class="field" id="ytKey" type="password" placeholder="Clave de API de YouTube" value="${esc(s.ytKey)}" autocomplete="off" spellcheck="false"><button class="pill primary" id="ytSave">Guardar</button></div>
      <div id="ytStatus" class="muted small">${s.ytKey ? '✔ Reproducción completa activada' : 'Desactivada · vistas previas de 30 s'}</div>
    </section>
    <section><h4>Preferencias</h4>
      <label class="switch"><span><b>Reproducción automática</b><br><small class="muted">Al terminar, sigue con canciones similares.</small></span><input type="checkbox" id="setAuto" ${s.autoplay ? 'checked' : ''}><i></i></label>
    </section>
    <section><h4>Tu biblioteca</h4>
      <p class="muted">Tu biblioteca se guarda en este dispositivo. Exporta una copia para pasarla a otro.</p>
      <div class="row-btns"><button class="pill ghost" id="exp">Exportar biblioteca</button><button class="pill ghost" id="imp">Importar biblioteca</button><button class="pill ghost" id="clrH">Borrar historial</button></div>
      <input type="file" id="impFile" accept="application/json" hidden>
    </section>
    <section class="about-app"><h4>Acerca de</h4><p class="muted small">Listentoo · catálogo y vistas previas de Deezer, música independiente de Audius, letras de LRCLIB, reproducción completa a través del reproductor oficial de YouTube. Atajos: Espacio, ←/→, Shift+←/→, ↑/↓, M, S, R, L, F, /.</p></section>
    <div class="acts"><button class="pill primary" data-close>Listo</button></div></div>`, (el) => {
    el.querySelector('#ytSave').onclick = async () => {
      const key = el.querySelector('#ytKey').value.trim(), st = el.querySelector('#ytStatus');
      if (!key) { lib.setSetting('ytKey', ''); st.textContent = 'Desactivada · vistas previas de 30 s'; return; }
      st.textContent = 'Comprobando clave…';
      const ok = await youtube.test(key).catch(() => false);
      if (ok) { lib.setSetting('ytKey', key); st.textContent = '✔ Clave válida: reproducción completa activada'; toast('Reproducción completa activada'); }
      else st.textContent = '✕ La clave no funciona. Revisa que la API esté activada.';
    };
    el.querySelector('#setAuto').onchange = e => lib.setSetting('autoplay', e.target.checked);
    el.querySelector('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lib.export()], { type: 'application/json' })); a.download = `listentoo-biblioteca-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    el.querySelector('#imp').onclick = () => el.querySelector('#impFile').click();
    el.querySelector('#impFile').onchange = async e => { try { lib.import(await e.target.files[0].text()); toast('Biblioteca importada'); renderSide(); } catch (err) { toast(err.message || 'Archivo no válido'); } };
    el.querySelector('#clrH').onclick = () => { lib.recent = []; lib.visited = []; lib.save('recent'); lib.save('visited'); toast('Historial borrado'); };
  });
}
$('#settingsBtn').onclick = openSettings;

/* ================= FILES / PWA ================= */
$('#filePicker').onchange = async e => { await lib.importFiles([...e.target.files]); e.target.value = ''; };
addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); document.body.classList.add('dragging-files'); } });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging-files'); });
addEventListener('drop', async e => { document.body.classList.remove('dragging-files'); if (e.dataTransfer?.files?.length) { e.preventDefault(); await lib.importFiles([...e.dataTransfer.files]); location.hash = '#/library'; } });

let deferred;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('¡Listentoo instalada!'); });
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone && !store.get('iosHint')) {
  setTimeout(() => { toast('Instálala: Compartir → «Añadir a pantalla de inicio»'); store.set('iosHint', true); }, 3000);
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Nueva versión disponible', { text: 'Actualizar', run: () => location.reload() }); });
    });
  }).catch(() => {});
}
addEventListener('online', () => toast('Vuelves a estar conectado'));
addEventListener('offline', () => toast('Sin conexión: tu biblioteca local sigue disponible'));

/* ================= BOOT ================= */
renderSide(); renderMode(); renderVolume(); renderState(); renderTime(); syncPanel(); renderEngine();
if (!location.hash) history.replaceState(null, '', '#/home');
route();
