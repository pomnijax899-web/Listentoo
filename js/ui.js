// Rendering helpers and shared UI widgets (rows, cards, menus, modals).
import { $, esc, fmt, fmtNum, COVER, toast } from './util.js';
import { lib } from './library.js';
import { player } from './player.js';

export const icons = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.7 3.9 12.9A5.3 5.3 0 0 1 12 6.1a5.3 5.3 0 0 1 8.1 6.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  heartOn: '<svg viewBox="0 0 24 24"><path d="M12 20.7 3.9 12.9A5.3 5.3 0 0 1 12 6.1a5.3 5.3 0 0 1 8.1 6.8z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M16 3h5v5l-1.8-1.8-3.6 3.6-1.4-1.4 3.6-3.6zM3 6h4.2c1.6 0 3 .8 3.9 2.1l4.3 6.6c.5.8 1.4 1.3 2.4 1.3H19l-1.6-1.6L18.8 13 22 16.9l-3.2 3.9-1.4-1.4L19 18h-1.2c-1.6 0-3-.8-3.9-2.1l-4.3-6.6C9.1 8.5 8.2 8 7.2 8H3zm0 10h4.2c.8 0 1.5-.3 2-.9l1.2 1.7c-.9.8-2 1.2-3.2 1.2H3z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 7h2v5.4l3.5 2-1 1.7-4.5-2.6z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plusCircle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 7h2v4h4v2h-4v4h-2v-4H7v-2h4z"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18.5a3 3 0 1 1-2-2.83V5.5l12-2.5v12.5a3 3 0 1 1-2-2.83V7.4l-8 1.7z"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.2"/><path d="M3.5 21a8.5 8.5 0 0 1 17 0z"/></svg>'
};

export const eqBars = '<span class="eq"><i></i><i></i><i></i><i></i></span>';
export const explicit = t => t.explicit ? '<span class="badge-e" title="Explícito">E</span>' : '';
export const img = (src, cls = '', alt = '') => `<img class="${cls}" src="${esc(src || COVER)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${COVER}'">`;

/* registry so delegated clicks can find the track array behind a rendered list */
const lists = new Map(); let listSeq = 0;
export function registerList(tracks, meta = {}) { const k = 'L' + (++listSeq); lists.set(k, { tracks, ...meta }); if (lists.size > 60) lists.delete(lists.keys().next().value); return k; }
export const getList = k => lists.get(k);

export function trackList(tracks, { label = '', href = '', album = true, cover = true, playlistId = null, numbers = true, added = false, draggable = false } = {}) {
  if (!tracks.length) return '';
  const k = registerList(tracks, { label, href, playlistId });
  const curId = player.current?.id;
  const cls = ['tracks', album ? 'with-album' : '', added ? 'with-added' : ''].join(' ');
  return `<div class="${cls}" data-list="${k}">
  <div class="trow head"><div class="c-num">#</div><div>Título</div>${album ? '<div class="c-album">Álbum</div>' : ''}${added ? '<div class="c-added">Añadida</div>' : ''}<div></div><div class="c-dur">${icons.clock}</div><div></div></div>
  ${tracks.map((t, i) => {
    const liked = lib.isLiked(t), playing = curId === t.id;
    return `<div class="trow${playing ? ' playing' : ''}" data-i="${i}" data-id="${esc(t.id)}"${draggable ? ' draggable="true"' : ''} tabindex="0">
      <div class="c-num">${numbers ? `<span class="n">${i + 1}</span>` : ''}<span class="eqw">${eqBars}</span><button class="rowplay" aria-label="Reproducir">${icons.play}</button></div>
      <div class="c-title">${cover ? img(t.cover, 'tcover') : ''}<div class="tt"><div class="tname ellipsis">${esc(t.title)}</div><div class="tart ellipsis">${explicit(t)}${t.artistId ? `<a href="#/artist/${t.artistId}">${esc(t.artist)}</a>` : esc(t.artist)}</div></div></div>
      ${album ? `<div class="c-album ellipsis">${t.albumId ? `<a href="#/album/${t.albumId}">${esc(t.album)}</a>` : esc(t.album || '')}</div>` : ''}
      ${added ? `<div class="c-added">${t.added ? new Date(t.added).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</div>` : ''}
      <div class="c-like"><button class="likebtn${liked ? ' on' : ''}" data-act="like" aria-label="Me gusta">${liked ? icons.heartOn : icons.heart}</button></div>
      <div class="c-dur">${t.dur ? fmt(t.dur) : ''}</div>
      <div class="c-more"><button data-act="more" aria-label="Más opciones">${icons.more}</button></div>
    </div>`;
  }).join('')}</div>`;
}

export function card(item, { sub } = {}) {
  const k = item.kind;
  const href = k === 'artist' ? `#/artist/${item.id}` : k === 'album' ? `#/album/${item.id}` : k === 'dzplaylist' ? `#/dzplaylist/${item.id}` : k === 'playlist' ? `#/playlist/${item.id}` : k === 'liked' ? '#/liked' : '#/';
  const title = item.name || item.title;
  const s = sub ?? (k === 'artist' ? 'Artista' : k === 'album' ? [item.year, item.artist].filter(Boolean).join(' · ') : k === 'dzplaylist' ? `De ${item.by}` : k === 'playlist' ? `${item.tracks?.length || 0} canciones` : '');
  const art = k === 'playlist' ? mosaic(item.tracks || []) : k === 'liked' ? '<div class="art liked-art">' + icons.heartOn + '</div>' : img(item.cover || item.pic, 'art' + (k === 'artist' ? ' round' : ''));
  return `<a class="card${k === 'artist' ? ' artist' : ''}" href="${href}" data-kind="${k}" data-id="${esc(item.id)}">
    <div class="art-wrap">${art}<button class="fab" data-act="playcoll" aria-label="Reproducir ${esc(title)}">${icons.play}</button></div>
    <div class="ct ellipsis">${esc(title)}</div><div class="cs ellipsis2">${esc(s)}</div></a>`;
}
export const shelf = (title, items, opts = {}) => items?.length ? `<section class="shelf"><div class="shelf-head"><h2>${opts.href ? `<a href="${opts.href}">${esc(title)}</a>` : esc(title)}</h2>${opts.more ? `<a class="more" href="${opts.more}">Mostrar todo</a>` : ''}</div><div class="${opts.wrap ? 'cgrid' : 'hscroll'}">${items.map(i => card(i, opts)).join('')}</div></section>` : '';

export function mosaic(tracks, cls = 'art') {
  const covers = [...new Set(tracks.map(t => t.cover).filter(Boolean))].slice(0, 4);
  if (covers.length >= 4) return `<div class="${cls} mosaic">${covers.map(c => img(c)).join('')}</div>`;
  if (covers.length) return img(covers[0], cls);
  return `<div class="${cls} empty-art">${icons.music}</div>`;
}

export const skeleton = (rows = 8) => `<div class="skel-hero"><div class="sk sk-img"></div><div class="sk-col"><div class="sk sk-l1"></div><div class="sk sk-l2"></div><div class="sk sk-l3"></div></div></div>` + Array.from({ length: rows }, () => '<div class="sk-row"><div class="sk sk-sq"></div><div class="sk-col"><div class="sk sk-t"></div><div class="sk sk-s"></div></div></div>').join('');
export const skeletonShelves = (n = 3) => Array.from({ length: n }, () => `<div class="sk sk-h2"></div><div class="hscroll">${Array.from({ length: 7 }, () => '<div class="card sk-card"><div class="sk sk-art"></div><div class="sk sk-t"></div><div class="sk sk-s"></div></div>').join('')}</div>`).join('');
export const errorState = (msg = 'No se pudo conectar con el catálogo.') => `<div class="empty"><div class="empty-ico">${icons.music}</div><h3>Algo salió mal</h3><p>${esc(msg)} Comprueba tu conexión; tu biblioteca y archivos locales siguen disponibles.</p><button class="pill" onclick="dispatchEvent(new HashChangeEvent('hashchange'))">Reintentar</button></div>`;

/* ---------- menus ---------- */
export function showMenu(items, at) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.label ? `<div class="mlabel">${esc(it.label)}</div>` : `<button data-i="${i}" ${it.disabled ? 'disabled' : ''}><span class="mi">${it.icon || ''}</span>${esc(it.text)}</button>`).join('');
  m.hidden = false; m.classList.remove('in'); void m.offsetWidth; m.classList.add('in');
  const r = m.getBoundingClientRect();
  let a = at instanceof Element ? at.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y };
  let x = at instanceof Element ? a.right - r.width : a.left, y = a.bottom + 6;
  if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
  if (y + r.height > innerHeight - 8) y = Math.max(8, a.top - r.height - 6);
  m.style.left = Math.max(8, x) + 'px'; m.style.top = y + 'px';
  m.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; hideMenu(); items[b.dataset.i].run(); };
}
export const hideMenu = () => { $('#menu').hidden = true; };

export async function share(title, hash) {
  const url = location.origin + location.pathname + hash;
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
  } catch { /* cancelled */ }
}

export function trackMenu(t, at, { playlistId } = {}) {
  const items = [
    { icon: '⏭', text: 'Reproducir a continuación', run: () => player.playNext(t) },
    { icon: '☰', text: 'Añadir a la cola', run: () => player.addToQueue(t) },
    { icon: lib.isLiked(t) ? '♥' : '♡', text: lib.isLiked(t) ? 'Quitar de Tus me gusta' : 'Guardar en Tus me gusta', run: () => lib.toggleLike(t) },
    '-', { label: 'Añadir a playlist' },
    { icon: '＋', text: 'Nueva playlist', run: async () => { const n = await prompt('Nueva playlist', '', 'Crear'); if (n !== null) { lib.createPlaylist(n, [t]); toast('Playlist creada'); } } },
    ...lib.playlists.slice(0, 12).map(p => ({ icon: '♪', text: p.name, run: () => lib.addToPlaylist(p.id, t) })),
    '-'
  ];
  if (t.artistId) items.push({ icon: '👤', text: 'Ir al artista', run: () => { location.hash = `#/artist/${t.artistId}`; } });
  if (t.albumId) items.push({ icon: '💿', text: 'Ir al álbum', run: () => { location.hash = `#/album/${t.albumId}`; } });
  if (t.artistId) items.push({ icon: '📻', text: 'Ir a la radio de la canción', run: () => startRadio(t) });
  if (t.albumId) items.push({ icon: '↗', text: 'Compartir', run: () => share(`${t.title} · ${t.artist}`, `#/album/${t.albumId}`) });
  if (playlistId) items.push('-', { icon: '✕', text: 'Quitar de esta playlist', run: () => lib.removeFromPlaylist(playlistId, t.id) });
  if (t.src === 'local') items.push('-', { icon: '🗑', text: 'Eliminar archivo', run: () => lib.deleteLocal(t) });
  showMenu(items, at);
}
export async function startRadio(t) {
  const { deezer } = await import('./api.js');
  try { const r = await deezer.artistRadio(t.artistId); player.playList([t, ...r.filter(x => x.id !== t.id)], 0, { label: `Radio de ${t.title}`, href: `#/artist/${t.artistId}` }); toast(`Radio de «${t.title}»`); }
  catch { toast('No se pudo crear la radio'); }
}

/* ---------- modal ---------- */
export function modal(html, onMount) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false; requestAnimationFrame(() => m.classList.add('in'));
  const close = () => { m.classList.remove('in'); setTimeout(() => { m.hidden = true; m.innerHTML = ''; }, 180); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(); };
  onMount?.(m.firstElementChild, close);
  return close;
}
export function prompt(title, value = '', ok = 'Guardar') {
  return new Promise(res => {
    let done = false;
    modal(`<h3>${esc(title)}</h3><input class="field" type="text" maxlength="80" value="${esc(value)}" placeholder="Nombre"><div class="acts"><button class="pill ghost" data-close>Cancelar</button><button class="pill primary" data-ok>${esc(ok)}</button></div>`, (el, close) => {
      const inp = el.querySelector('input'); inp.focus(); inp.select();
      const finish = v => { if (done) return; done = true; close(); res(v); };
      el.querySelector('[data-ok]').onclick = () => finish(inp.value);
      inp.onkeydown = e => { if (e.key === 'Enter') finish(inp.value); };
      const obs = new MutationObserver(() => { if ($('#modal').hidden && !done) { done = true; res(null); obs.disconnect(); } });
      obs.observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });
    });
  });
}
export function confirmBox(title, text, ok = 'Eliminar') {
  return new Promise(res => {
    let done = false;
    modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="acts"><button class="pill ghost" data-close>Cancelar</button><button class="pill danger" data-ok>${esc(ok)}</button></div>`, (el, close) => {
      el.querySelector('[data-ok]').onclick = () => { done = true; close(); res(true); };
      const obs = new MutationObserver(() => { if ($('#modal').hidden && !done) { done = true; res(false); obs.disconnect(); } });
      obs.observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });
    });
  });
}
export const fans = n => n ? `${fmtNum(n)} seguidores` : '';
