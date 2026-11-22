// App shell: routing, the floating Island player, the Orbit full-screen player, dock,
// lyrics, notifications, account state and PWA wiring.
import { $, $$, esc, fmt, store, toast, debounce, COVER } from './util.js';
import { lib } from './library.js';
import { player } from './player.js';
import { cloud } from './cloud.js';
import { lyrics as fetchLyrics, deezer } from './api.js';
import { applyTheme, setCover } from './themes.js';
import * as V from './views.js';
import { icons, getList, trackMenu, showMenu, hideMenu, share, avatar } from './ui.js';

applyTheme();

/* ================= ROUTER ================= */
const LEGACY = { home: 'inicio', search: 'explorar', library: 'biblioteca', artist: 'artista', dzplaylist: 'lista', liked: 'megusta', genre: 'genero', chart: 'top', queue: 'cola' };
const routes = {
  inicio: () => V.home(), explorar: (p, q) => V.explore(q.get('q') || ''), mood: p => V.mood(p[1]), top: () => V.top(0), genero: p => V.genre(p[1]),
  artista: p => V.artist(p[1]), album: p => V.album(p[1]), lista: p => V.dzplaylist(p[1]), playlist: p => V.playlist(p[1]), p: p => V.shared(p[1]),
  megusta: () => V.liked(), biblioteca: () => V.library(), cola: () => V.queue(),
  cuenta: p => V.account(p[1] === 'registro' ? 'registro' : 'entrar'), perfil: () => V.profile(), temas: () => V.themes(), admin: () => V.admin()
};
const NAV = { inicio: 'inicio', explorar: 'explorar', mood: 'explorar', top: 'explorar', genero: 'explorar', biblioteca: 'biblioteca', megusta: 'biblioteca', playlist: 'biblioteca', cola: 'biblioteca', temas: 'temas', perfil: 'perfil', cuenta: 'perfil', admin: 'perfil' };
let lastKey = '';
function route() {
  const [path, qs] = (location.hash.slice(1) || '/inicio').split('?');
  const parts = path.split('/').filter(Boolean);
  let name = parts[0] || 'inicio';
  if (LEGACY[name]) { parts[0] = LEGACY[name]; location.replace('#/' + parts.join('/') + (qs ? '?' + qs : '')); return; }
  if (!routes[name]) { location.replace('#/inicio'); return; }
  const key = name === 'explorar' ? 'explorar' + (qs ? '?' : '') : path + '?' + (qs || '');
  const soft = key === lastKey && name === 'explorar';
  lastKey = key;
  document.body.dataset.route = name;
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === NAV[name]));
  moveDockGlow();
  if (!soft) { $('#main').scrollTop = 0; const v = $('#view'); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
  hideMenu();
  if (orbitOpen()) closeOrbit();
  routes[name](parts, new URLSearchParams(qs || ''));
}
addEventListener('hashchange', route);
$('#back').onclick = () => history.back();
$('#fwd').onclick = () => history.forward();
$('#main').addEventListener('scroll', () => { document.body.classList.toggle('scrolled', $('#main').scrollTop > 12); hideMenu(); }, { passive: true });

/* search in the top bar (desktop) */
const sInput = $('#searchInput');
const goSearch = debounce(q => {
  const target = '#/explorar' + (q ? '?q=' + encodeURIComponent(q) : '');
  if (location.hash.startsWith('#/explorar')) { history.replaceState(null, '', target); route(); } else location.hash = target;
}, 340);
sInput.addEventListener('input', () => goSearch(sInput.value.trim()));
sInput.addEventListener('keydown', e => { if (e.key === 'Escape') sInput.blur(); if (e.key === 'Enter') goSearch(sInput.value.trim()); });

/* dock highlight */
function moveDockGlow() {
  const a = $('#dock a.active'), g = $('#dock .dock-glow');
  if (!a) { g.style.opacity = 0; return; }
  g.style.opacity = 1; g.style.width = a.offsetWidth + 'px'; g.style.transform = `translateX(${a.offsetLeft}px)`;
}
addEventListener('resize', () => { moveDockGlow(); placeYT(); });

/* ================= ACCOUNT STATE ================= */
function renderAccount() {
  const btn = $('#accountBtn');
  if (cloud.signedIn) {
    const n = cloud.profile?.display_name || cloud.user.email;
    btn.innerHTML = avatar(n, cloud.profile?.avatar_hue ?? 275) + `<span class="acct-name ellipsis">${esc(n)}</span>`;
    btn.href = '#/perfil'; btn.classList.add('in');
  } else { btn.innerHTML = '<span>Entrar</span>'; btn.href = '#/cuenta'; btn.classList.remove('in'); }
  $('#dockMe span').textContent = cloud.signedIn ? 'Tú' : 'Entrar';
}
cloud.addEventListener('auth', () => {
  renderAccount(); applyTheme();
  const r = document.body.dataset.route;
  if (['cuenta', 'perfil', 'admin', 'inicio', 'biblioteca', 'megusta', 'playlist'].includes(r)) route();
});
cloud.addEventListener('announcement', () => { if (document.body.dataset.route === 'inicio') V.home(); });
cloud.addEventListener('recovery', () => { if (!document.body.classList.contains('ready')) return; location.hash = '#/perfil'; V.changePassword(true); });
lib.addEventListener('change', e => {
  const r = document.body.dataset.route, d = e.detail;
  if (d === 'liked' || d === 'all') refreshLikes();
  if (d === 'settings') applyTheme();
  if ((d === 'playlists' || d === 'all') && r === 'playlist') route();
  if ((d === 'liked' || d === 'all') && r === 'megusta') route();
  if (['local', 'playlists', 'albums', 'artists', 'dzplaylists', 'all'].includes(d) && r === 'biblioteca') route();
});

/* ================= DELEGATED CLICKS ================= */
document.addEventListener('click', async e => {
  const row = e.target.closest('.trow');
  const wrap = row?.closest('.tracks[data-list]');
  if (row && wrap) {
    if (e.target.closest('a')) return;
    const L = getList(wrap.dataset.list); if (!L) return;
    const i = +row.dataset.i, t = L.tracks[i];
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'like') return lib.toggleLike(t);
    if (act === 'more') return trackMenu(t, e.target.closest('[data-act]'), { playlistId: L.playlistId });
    if (wrap.dataset.now) return player.toggle();
    if (wrap.dataset.manual) return player.jumpManual(i);
    if (wrap.dataset.upcoming) return player.jumpUpcoming(i);
    if (player.current?.id === t.id && L.href && player.ctx.href === L.href) return player.toggle();
    return player.playList(L.tracks, i, { label: L.label, href: L.href });
  }
  const tcard = e.target.closest('[data-track-i]');
  if (tcard) { const L = getList(tcard.closest('[data-list]').dataset.list); if (L) player.playList(L.tracks, +tcard.dataset.trackI, { label: L.label, href: L.href }); return; }
  const fab = e.target.closest('[data-act="playcoll"]');
  if (fab) { e.preventDefault(); e.stopPropagation(); const el = fab.closest('[data-kind]'); await playCollection(el.dataset.kind, el.dataset.id, fab); }
});
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.trow'), wrap = row?.closest('.tracks[data-list]');
  if (!row || !wrap) return;
  const L = getList(wrap.dataset.list), t = L?.tracks[+row.dataset.i]; if (!t) return;
  e.preventDefault(); trackMenu(t, { x: e.clientX, y: e.clientY }, { playlistId: L.playlistId });
});
document.addEventListener('keydown', e => { const r = e.target.closest?.('.trow, .tcard'); if (r && e.key === 'Enter') r.click(); });
document.addEventListener('pointerdown', e => { if (!e.target.closest('#menu')) hideMenu(); });

async function playCollection(kind, id, btn) {
  const href = { liked: '#/megusta', album: `#/album/${id}`, artist: `#/artista/${id}`, dzplaylist: `#/lista/${id}`, playlist: `#/playlist/${id}` }[kind];
  if (player.ctx.href === href && player.current) return player.toggle();
  btn?.classList.add('busy');
  try {
    let tracks = [], label = '';
    if (kind === 'album') { const a = await deezer.album(id); tracks = a.tracks; label = a.title; }
    else if (kind === 'artist') { const [a, top] = await Promise.all([deezer.artist(id), deezer.artistTop(id, 20)]); tracks = top; label = a.name; }
    else if (kind === 'dzplaylist') { const p = await deezer.playlist(id); tracks = p.tracks; label = p.title; }
    else if (kind === 'playlist') { const p = lib.playlist(id); tracks = p?.tracks || []; label = p?.name; }
    else if (kind === 'liked') { tracks = lib.liked; label = 'Me gusta'; }
    tracks.length ? player.playList(tracks, 0, { label, href }) : toast('No hay canciones para reproducir');
  } catch { toast('No se pudo cargar'); }
  btn?.classList.remove('busy');
}

/* ================= SLIDERS ================= */
const setP = (el, v) => { el.style.setProperty('--p', (v * 100).toFixed(2) + '%'); el.setAttribute('aria-valuenow', Math.round(v * 100)); };
function slider(el, { onInput, onCommit }) {
  let drag = false;
  const val = e => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  el.addEventListener('pointerdown', e => { drag = true; el.setPointerCapture(e.pointerId); el.classList.add('drag'); const v = val(e); setP(el, v); onInput?.(v); });
  el.addEventListener('pointermove', e => { if (!drag) return; const v = val(e); setP(el, v); onInput?.(v); });
  el.addEventListener('pointerup', e => { if (!drag) return; drag = false; el.classList.remove('drag'); onCommit?.(val(e)); });
  el.addEventListener('pointercancel', () => { drag = false; el.classList.remove('drag'); });
  el.addEventListener('keydown', e => {
    const cur = (parseFloat(el.style.getPropertyValue('--p')) || 0) / 100, step = e.shiftKey ? 0.1 : 0.03;
    if (['ArrowRight', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); onCommit?.(Math.min(1, cur + step)); }
    if (['ArrowLeft', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); onCommit?.(Math.max(0, cur - step)); }
  });
  return { get drag() { return drag; } };
}
const seekSliders = ['#isSeek', '#orSeek'].map(sel => ({ el: $(sel), s: slider($(sel), {
  onInput: v => { $$('[data-cur]').forEach(x => { x.textContent = fmt(v * player.duration); }); },
  onCommit: v => player.seek(v * player.duration)
}) }));
['#isVol', '#orVol'].forEach(sel => slider($(sel), { onInput: v => player.setVolume(v), onCommit: v => player.setVolume(v) }));

/* circular seek ring in the Orbit view */
const RING_C = 2 * Math.PI * 104;
let ringDrag = false;
(() => {
  const ring = $('#orRing');
  const frac = e => { const r = ring.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let a = Math.atan2(e.clientY - cy, e.clientX - cx) + Math.PI / 2; if (a < 0) a += 2 * Math.PI; return a / (2 * Math.PI); };
  ring.addEventListener('pointerdown', e => { if (!e.target.closest('.r-hit')) return; ringDrag = true; ring.setPointerCapture(e.pointerId); paintRing(frac(e)); });
  ring.addEventListener('pointermove', e => { if (ringDrag) { const f = frac(e); paintRing(f); $$('[data-cur]').forEach(x => { x.textContent = fmt(f * player.duration); }); } });
  ring.addEventListener('pointerup', e => { if (!ringDrag) return; ringDrag = false; player.seek(frac(e) * player.duration); });
})();
function paintRing(v) {
  $('#orProg').style.strokeDashoffset = RING_C * (1 - v);
  const a = v * 2 * Math.PI - Math.PI / 2;
  $('#orKnob').setAttribute('cx', 110 + 104 * Math.cos(a)); $('#orKnob').setAttribute('cy', 110 + 104 * Math.sin(a));
}

/* ================= PLAYER UI ================= */
function renderTrack() {
  const t = player.current; if (!t) return;
  $('#isCover').src = t.cover || COVER;
  $('#orCover').src = $('#orBg').src = t.coverXL || t.cover || COVER;
  $('#isTitle').textContent = $('#orTitle').textContent = t.title;
  $('#isArtist').textContent = t.artist;
  $('#orArtist').textContent = t.artist; $('#orArtist').href = t.artistId ? `#/artista/${t.artistId}` : '#/cola';
  $('#orCtx').textContent = player.ctx.label || 'Tu música'; $('#orCtx').href = player.ctx.href || '#/cola';
  document.title = `${t.title} · ${t.artist}`;
  $('#island').dataset.state = 'track';
  const marquee = $('#isTitle'); marquee.parentElement.classList.toggle('scroll', marquee.scrollWidth > marquee.parentElement.clientWidth + 4);
  refreshLikes();
  $$('.trow').forEach(r => r.classList.toggle('playing', r.dataset.id === t.id));
  setCover(t.cover);
  loadLyrics(t);
  renderNext();
  notifyTrack(t);
}
function refreshLikes() {
  const t = player.current, on = lib.isLiked(t);
  ['#isLike', '#orLike'].forEach(s => { const b = $(s); b.innerHTML = on ? icons.heartOn : icons.heart; b.classList.toggle('on', on); b.hidden = !t || t.src === 'local'; });
  $$('.trow').forEach(r => { const b = r.querySelector('[data-act="like"]'); const L = getList(r.closest('.tracks')?.dataset.list); const tr = L?.tracks[+r.dataset.i]; if (!b || !tr) return; const l = lib.isLiked(tr); b.classList.toggle('on', l); b.innerHTML = l ? icons.heartOn : icons.heart; });
}
['#isLike', '#orLike'].forEach(s => $(s).onclick = e => { e.stopPropagation(); if (player.current) lib.toggleLike(player.current); });

function renderState() {
  const p = player.paused, ic = p ? icons.play : icons.pause, lbl = p ? 'Reproducir' : 'Pausar';
  ['#isPlay', '#isPlay2', '#orPlay'].forEach(s => { const b = $(s); b.innerHTML = ic; b.setAttribute('aria-label', lbl); b.classList.toggle('loading', player.loading); });
  document.body.classList.toggle('is-playing', !p);
  $$('.bigplay[data-list]').forEach(b => { const L = getList(b.dataset.list); const mine = L && L.href && player.ctx.href === L.href; b.innerHTML = mine && !p ? icons.pause : icons.play; });
  $$('[data-kind][data-id]').forEach(c => { const href = c.getAttribute('href'); const on = !!href && player.ctx.href === href && !p; c.classList.toggle('active-play', on); const f = c.querySelector('.fab'); if (f && c.dataset.kind) f.innerHTML = on ? icons.pause : icons.play; });
}
function renderTime() {
  const d = player.duration, t = player.time, v = d ? Math.min(1, t / d) : 0;
  seekSliders.forEach(({ el, s }) => { if (!s.drag) setP(el, v); });
  if (!ringDrag) paintRing(v);
  if (!seekSliders.some(x => x.s.drag) && !ringDrag) $$('[data-cur]').forEach(x => { x.textContent = fmt(t); });
  $$('[data-dur]').forEach(x => { x.textContent = fmt(d); });
  $('#island').style.setProperty('--prog', v);
  syncLyrics(t);
}
function renderMode() {
  ['#isShuffle', '#orShuffle'].forEach(s => { const b = $(s); b.innerHTML = icons.shuffle; b.classList.toggle('on', player.shuffle); });
  ['#isRepeat', '#orRepeat'].forEach(s => { const b = $(s); b.innerHTML = player.repeat === 2 ? icons.repeat1 : icons.repeat; b.classList.toggle('on', player.repeat > 0); b.title = ['Repetir', 'Repetir todo', 'Repetir canción'][player.repeat]; });
  $$('[data-hero="shuffle"]').forEach(b => b.classList.toggle('on', player.shuffle));
}
const MODE_TXT = { preview: 'Vista previa · 30 s', yt: 'Completa', full: 'Completa' };
function renderEngine() {
  const m = player.mode;
  $$('[data-mode-badge]').forEach(b => { b.textContent = MODE_TXT[m] || ''; b.dataset.m = m; b.hidden = !m; });
  const yt = player.engine === 'yt';
  $('#ytBubble').hidden = !yt;
  document.body.classList.toggle('yt-on', yt);
  placeYT();
}
function renderVolume() {
  const v = player.muted ? 0 : player.volume;
  ['#isVol', '#orVol'].forEach(s => setP($(s), v));
  ['#isMute', '#orMute'].forEach(s => { $(s).innerHTML = v === 0 ? icons.volOff : icons.vol; });
}
player.addEventListener('track', renderTrack);
player.addEventListener('state', renderState);
player.addEventListener('time', renderTime);
player.addEventListener('mode', renderMode);
player.addEventListener('engine', () => { renderEngine(); renderTime(); });
player.addEventListener('volume', renderVolume);
player.addEventListener('queue', () => { renderNext(); if (document.body.dataset.route === 'cola') V.queue(); });
player.addEventListener('sleep', () => $('#orSleep').classList.toggle('on', !!player.sleep));
player.addEventListener('hint', e => {
  const r = e.detail;
  if (r === 'guest') toast('Estás escuchando vistas previas de 30 s. Entra para escuchar canciones completas.', { text: 'Entrar', run: () => { store.set('afterLogin', location.hash); location.hash = '#/cuenta'; } });
  else if (r === 'not_configured') toast(cloud.isAdmin ? 'Reproducción completa desactivada: añade la clave en el panel de admin.' : 'De momento suenan vistas previas de 30 s.', cloud.isAdmin ? { text: 'Abrir panel', run: () => { location.hash = '#/admin'; } } : undefined);
  else if (r === 'quota') toast('Hoy se ha agotado el cupo de canciones nuevas completas. Las ya escuchadas siguen completas.');
  else if (r === 'rate_limited') toast('Has llegado al límite diario de canciones nuevas completas.');
});

const on = (ids, fn) => ids.forEach(s => { $(s).onclick = e => { e.stopPropagation(); fn(e); }; });
on(['#isPlay', '#isPlay2', '#orPlay'], () => player.toggle());
on(['#isNext', '#orNext'], () => player.next());
on(['#isPrev', '#orPrev'], () => player.prev());
on(['#isShuffle', '#orShuffle'], () => player.setShuffle(!player.shuffle));
on(['#isRepeat', '#orRepeat'], () => player.cycleRepeat());
on(['#isMute', '#orMute'], () => player.toggleMute());
on(['#isQueue'], () => { location.hash = document.body.dataset.route === 'cola' ? '#/inicio' : '#/cola'; });
on(['#isOpen', '#isExpand'], () => openOrbit());
$('#orShare').onclick = () => { const t = player.current; if (t) share(`${t.title} · ${t.artist}`, t.albumId ? `#/album/${t.albumId}` : '#/inicio'); };
$('#orMore').onclick = e => { const t = player.current; if (t) trackMenu(t, e.currentTarget); };
$('#orSleep').onclick = e => showMenu([
  { label: 'Temporizador' },
  ...[5, 15, 30, 45, 60].map(m => ({ text: `${m} minutos`, run: () => player.setSleep(m) })),
  { text: 'Al acabar la canción', run: () => player.setSleep('track') },
  ...(player.sleep ? ['-', { text: 'Desactivar', run: () => player.setSleep(0) }] : [])
], e.currentTarget);

/* Island: compact on mobile (tap = open Orbit); expands on hover/focus on desktop */
const island = $('#island');
const desktop = () => matchMedia('(min-width: 821px)').matches;
island.addEventListener('click', e => {
  if (!player.current) { location.hash = '#/explorar'; return; }
  if (e.target.closest('button, .slider')) return;
  if (desktop()) island.classList.toggle('pinned'); else openOrbit();
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('#island')) island.classList.remove('pinned'); });
let sx = null;
island.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
island.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50 && player.current) dx < 0 ? player.next() : player.prev(); });

/* ================= ORBIT (full player) ================= */
const orbitOpen = () => $('#orbit').classList.contains('open');
function openOrbit() {
  if (!player.current) return;
  const o = $('#orbit'); o.hidden = false;
  requestAnimationFrame(() => { o.classList.add('open'); document.body.classList.add('orbit-open'); placeYT(); });
}
function closeOrbit() {
  const o = $('#orbit'); o.classList.remove('open'); document.body.classList.remove('orbit-open');
  setTimeout(() => { if (!orbitOpen()) o.hidden = true; placeYT(); }, 380); placeYT();
}
$('#orClose').onclick = closeOrbit;
$('#orCtx').onclick = () => closeOrbit();
$('#orArtist').onclick = () => closeOrbit();
let sy = null;
$('#orbit').addEventListener('touchstart', e => { if (e.target.closest('.slider, .lyrics, #orRing, .or-panel')) return; sy = e.touches[0].clientY; }, { passive: true });
$('#orbit').addEventListener('touchmove', e => { if (sy === null) return; const dy = e.touches[0].clientY - sy; if (dy > 0) $('#orbit .or-inner').style.transform = `translateY(${dy}px)`; }, { passive: true });
$('#orbit').addEventListener('touchend', e => { if (sy === null) return; const dy = e.changedTouches[0].clientY - sy; $('#orbit .or-inner').style.transform = ''; sy = null; if (dy > 110) closeOrbit(); });
$$('.or-tabs button').forEach(b => b.onclick = () => {
  $$('.or-tabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#orLyrics').hidden = b.dataset.tab !== 'lyrics'; $('#orNextList').hidden = b.dataset.tab !== 'next';
  if (b.dataset.tab === 'lyrics') { lyrIdx = -1; syncLyrics(player.time); }
});
function renderNext() {
  const list = [...player.manual, ...player.upcoming].slice(0, 30);
  $('#orNextList').innerHTML = list.length ? list.map((t, i) => `<button class="next-row" data-ni="${i}"><img src="${esc(t.cover || COVER)}" alt=""><span class="ellipsis"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button>`).join('') : '<p class="muted small pad">No hay nada más en la cola. Con la reproducción automática seguirán canciones parecidas.</p>';
}
$('#orNextList').onclick = e => { const b = e.target.closest('[data-ni]'); if (!b) return; const i = +b.dataset.ni; i < player.manual.length ? player.jumpManual(i) : player.jumpUpcoming(i - player.manual.length); };

/* YouTube player placement: the official player must stay visible (min 200x200 px) */
function placeYT() {
  const b = $('#ytBubble');
  if (b.hidden) return;
  if (orbitOpen()) {
    const r = $('#orVideo').getBoundingClientRect();
    Object.assign(b.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', right: 'auto', bottom: 'auto' });
    b.classList.add('in-orbit');
  } else { b.removeAttribute('style'); b.classList.remove('in-orbit'); }
}
$('#ybMove').onclick = () => { $('#ytBubble').classList.toggle('alt'); };
$('#ybOpen').onclick = () => openOrbit();

/* ================= LYRICS ================= */
let lyr = null, lyrIdx = -1;
async function loadLyrics(t) {
  lyr = null; lyrIdx = -1;
  $('#orLyrics').innerHTML = '<div class="lyr-msg">Buscando la letra…</div>';
  try { lyr = await fetchLyrics(t); } catch { lyr = null; }
  if (player.current !== t) return;
  const el = $('#orLyrics');
  if (!lyr) el.innerHTML = '<div class="lyr-msg">No encontramos la letra de esta canción.</div>';
  else if (lyr.instrumental) el.innerHTML = '<div class="lyr-msg">♪ Instrumental ♪</div>';
  else el.innerHTML = (lyr.synced ? '' : '<div class="lyr-note">Letra sin sincronizar</div>') + lyr.lines.map((l, i) => `<p data-li="${i}" class="${lyr.synced ? '' : 'plain'}">${esc(l.text) || '&nbsp;'}</p>`).join('');
  syncLyrics(player.time);
}
function syncLyrics(t) {
  if (!lyr?.synced || player.mode === 'preview') return;
  let i = -1; for (let k = 0; k < lyr.lines.length; k++) { if (lyr.lines[k].t <= t + 0.3) i = k; else break; }
  if (i === lyrIdx) return; lyrIdx = i;
  const box = $('#orLyrics');
  box.querySelectorAll('p').forEach((p, k) => { p.classList.toggle('on', k === i); p.classList.toggle('past', k < i); });
  const cur = box.querySelector(`p[data-li="${i}"]`);
  if (cur && !box.hidden && orbitOpen()) box.scrollTo({ top: cur.offsetTop - box.clientHeight * 0.38, behavior: 'smooth' });
}
$('#orLyrics').addEventListener('click', e => { const p = e.target.closest('p[data-li]'); if (p && lyr?.synced && player.mode !== 'preview') player.seek(lyr.lines[+p.dataset.li].t); });

/* ================= NOTIFICATIONS (opt-in) ================= */
async function notifyTrack(t) {
  if (!lib.settings.notify || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const reg = await navigator.serviceWorker?.ready; if (!reg) return;
    reg.showNotification(t.title, {
      body: [t.artist, t.album].filter(Boolean).join(' · '), icon: t.cover || 'icons/icon-192.png', badge: 'icons/icon-192.png',
      tag: 'listentoo-now', renotify: false, silent: true,
      actions: [{ action: 'prev', title: '⏮ Anterior' }, { action: 'toggle', title: '⏯ Pausa' }, { action: 'next', title: '⏭ Siguiente' }]
    });
  } catch { /* unsupported */ }
}
navigator.serviceWorker?.addEventListener('message', e => {
  const a = e.data?.media; if (!a) return;
  if (a === 'next') player.next(); else if (a === 'prev') player.prev(); else if (a === 'toggle') player.toggle();
});

/* ================= KEYBOARD ================= */
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key, onSlider = e.target.closest('.slider');
  if (k === ' ' || k === 'k') { e.preventDefault(); player.toggle(); }
  else if (k === 'ArrowRight' && e.shiftKey) player.next();
  else if (k === 'ArrowLeft' && e.shiftKey) player.prev();
  else if (k === 'ArrowRight' && !onSlider) player.seek(player.time + 5);
  else if (k === 'ArrowLeft' && !onSlider) player.seek(player.time - 5);
  else if (k === 'ArrowUp' && !onSlider) { e.preventDefault(); player.setVolume(player.volume + .05); }
  else if (k === 'ArrowDown' && !onSlider) { e.preventDefault(); player.setVolume(player.volume - .05); }
  else if (k === 'm') player.toggleMute();
  else if (k === 's') player.setShuffle(!player.shuffle);
  else if (k === 'r') player.cycleRepeat();
  else if (k === 'l' && player.current) lib.toggleLike(player.current);
  else if (k === 'f' || k === 'o') orbitOpen() ? closeOrbit() : openOrbit();
  else if (k === '/') { e.preventDefault(); desktop() ? sInput.focus() : (location.hash = '#/explorar'); }
  else if (k === 'Escape' && orbitOpen()) closeOrbit();
});

/* ================= FILES / PWA ================= */
$('#filePicker').onchange = async e => { await lib.importFiles([...e.target.files]); e.target.value = ''; };
addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); document.body.classList.add('dragging-files'); } });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging-files'); });
addEventListener('drop', async e => { document.body.classList.remove('dragging-files'); if (e.dataTransfer?.files?.length) { e.preventDefault(); await lib.importFiles([...e.dataTransfer.files]); location.hash = '#/biblioteca'; } });

let deferred;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('¡Listentoo instalada!'); });
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
document.body.classList.toggle('standalone', !!standalone);
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone && !store.get('iosHint')) {
  setTimeout(() => { toast('Instálala: Compartir → «Añadir a pantalla de inicio»'); store.set('iosHint', true); }, 4000);
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Hay una versión nueva', { text: 'Actualizar', run: () => location.reload() }); });
    });
  }).catch(() => {});
}
addEventListener('online', () => toast('Conexión recuperada'));
addEventListener('offline', () => toast('Sin conexión: tus archivos locales siguen sonando'));

/* ================= BOOT ================= */
renderMode(); renderVolume(); renderState(); renderTime(); renderEngine(); renderAccount();
(async () => {
  const hadAuthHash = /access_token=|type=recovery|error_description=/.test(location.hash);
  const isRecovery = /type=recovery/.test(location.hash);
  const authError = (location.hash.match(/error_description=([^&]+)/) || [])[1];
  await Promise.race([cloud.init(), new Promise(r => setTimeout(r, 5000))]);
  if (hadAuthHash || !location.hash || !location.hash.startsWith('#/')) history.replaceState(null, '', isRecovery ? '#/perfil' : '#/inicio');
  renderAccount(); applyTheme();
  route();
  if (authError) toast(decodeURIComponent(authError.replace(/\+/g, ' ')));
  else if (hadAuthHash && !isRecovery && cloud.signedIn) toast('¡Cuenta confirmada! Ya estás dentro.');
  if (isRecovery && cloud.signedIn && !document.querySelector('#np1')) V.changePassword(true);
  document.body.classList.add('ready');
})();
