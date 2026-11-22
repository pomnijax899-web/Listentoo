// Page views. Each returns after writing into #view; `setHeader` tints the top bar.
import { $, $$, esc, fmtLong, fmtNum, plural, imageColor, rgb, debounce, store } from './util.js';
import { deezer, audius } from './api.js';
import { lib } from './library.js';
import { player } from './player.js';
import { icons, img, trackList, card, shelf, mosaic, skeleton, skeletonShelves, errorState, fans, registerList, prompt, confirmBox, share, showMenu } from './ui.js';

const view = () => $('#view');
let renderSeq = 0;
const stale = seq => seq !== renderSeq;

export function setTint(c) {
  document.documentElement.style.setProperty('--tint', rgb(c));
  document.documentElement.style.setProperty('--tint-a', rgb(c, 0.55));
}
const greeting = () => { const h = new Date().getHours(); return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; };

function heroActions({ listKey, saved, saveKind, extra = '', follow }) {
  return `<div class="actions">
    <button class="bigplay" data-hero="play" data-list="${listKey}" aria-label="Reproducir">${icons.play}</button>
    <button class="iconbtn lg${player.shuffle ? ' on' : ''}" data-hero="shuffle" data-list="${listKey}" aria-label="Aleatorio" title="Aleatorio">${icons.shuffle}</button>
    ${follow !== undefined ? `<button class="pill ghost" data-hero="save">${follow ? 'Siguiendo' : 'Seguir'}</button>` : ''}
    ${saveKind ? `<button class="iconbtn lg save${saved ? ' on' : ''}" data-hero="save" aria-label="Guardar" title="${saved ? 'Quitar de tu biblioteca' : 'Guardar en tu biblioteca'}">${saved ? icons.check : icons.plusCircle}</button>` : ''}
    ${extra}
    <button class="iconbtn lg" data-hero="more" aria-label="Más opciones">${icons.more}</button>
  </div>`;
}
function bindHero(root, { tracks, label, href, onSave, onMore }) {
  root.querySelector('[data-hero="play"]')?.addEventListener('click', () => {
    const same = player.ctx.href === href && player.current;
    same ? player.toggle() : player.playList(tracks, 0, { label, href, shuffle: false });
  });
  root.querySelector('[data-hero="shuffle"]')?.addEventListener('click', () => player.playList(tracks, 0, { label, href, shuffle: true }));
  root.querySelector('[data-hero="save"]')?.addEventListener('click', onSave || (() => {}));
  root.querySelector('[data-hero="more"]')?.addEventListener('click', e => onMore ? onMore(e.currentTarget) : showMenu([
    { icon: '☰', text: 'Añadir a la cola', run: () => player.addToQueue(tracks) },
    { icon: '＋', text: 'Añadir a playlist nueva', run: async () => { const n = await prompt('Nueva playlist', label, 'Crear'); if (n !== null) lib.createPlaylist(n, tracks); } },
    ...lib.playlists.slice(0, 8).map(p => ({ icon: '♪', text: `Añadir a «${p.name}»`, run: () => lib.addToPlaylist(p.id, tracks) })),
    '-', { icon: '↗', text: 'Compartir', run: () => share(label, href) }
  ], e.currentTarget));
}

async function tintFrom(url) { const c = await imageColor(url); setTint(c); return c; }

/* ================= HOME ================= */
export async function home() {
  const seq = ++renderSeq;
  setTint([70, 40, 120]);
  const quick = [{ kind: 'liked', id: 'liked', title: 'Tus me gusta' }, ...lib.visited, ...lib.playlists.map(p => ({ ...p, kind: 'playlist', title: p.name }))].slice(0, 8);
  const recentK = lib.recent.length ? registerList(lib.recent, { label: 'Escuchado recientemente' }) : '';
  view().innerHTML = `
    <h1 class="greet">${greeting()}</h1>
    <div class="quick">${quick.map(q => `<a class="qtile" href="${q.kind === 'liked' ? '#/liked' : q.kind === 'playlist' ? '#/playlist/' + q.id : `#/${q.kind}/${q.id}`}" data-kind="${q.kind}" data-id="${esc(q.id)}">
      ${q.kind === 'liked' ? `<div class="qart liked-art">${icons.heartOn}</div>` : q.kind === 'playlist' ? mosaic(q.tracks || [], 'qart') : img(q.cover || q.pic, 'qart' + (q.kind === 'artist' ? ' round' : ''))}
      <span class="ellipsis2">${esc(q.title || q.name)}</span><button class="fab sm" data-act="playcoll" aria-label="Reproducir">${icons.play}</button></a>`).join('')}</div>
    ${recentK ? `<section class="shelf"><div class="shelf-head"><h2>Escuchado recientemente</h2></div><div class="hscroll" data-list="${recentK}">${lib.recent.slice(0, 14).map((t, i) => `<div class="card" data-track-i="${i}"><div class="art-wrap">${img(t.cover)}<button class="fab" aria-label="Reproducir">${icons.play}</button></div><div class="ct ellipsis">${esc(t.title)}</div><div class="cs ellipsis">${esc(t.artist)}</div></div>`).join('')}</div></section>` : ''}
    <div id="homeMore">${skeletonShelves(3)}</div>`;
  try {
    const [tracks, albums, artists, playlists] = await Promise.all([deezer.chartTracks(0, 50), deezer.chartAlbums(), deezer.chartArtists(), deezer.chartPlaylists()]);
    if (stale(seq)) return;
    const topK = registerList(tracks, { label: 'Top 50 Global', href: '#/chart' });
    const followed = lib.artists.slice(0, 3);
    $('#homeMore').innerHTML = `
      <section class="shelf feature">
        <a class="feat" href="#/chart" style="--c:${rgb(await imageColor(tracks[0]?.cover))}">
          ${mosaic(tracks, 'feat-art')}<div><div class="eyebrow">Lista</div><h2>Top 50 · Global</h2><p>Las canciones más escuchadas ahora mismo: ${esc(tracks.slice(0, 3).map(t => t.artist).join(', '))} y más.</p>
          <button class="bigplay" data-hero="play" data-list="${topK}" aria-label="Reproducir Top 50">${icons.play}</button></div></a>
      </section>
      ${shelf('Álbumes del momento', albums)}
      ${shelf('Artistas populares', artists)}
      ${shelf('Playlists destacadas', playlists)}
      <div id="homeArtists"></div>
      <div id="homeIndie"></div>`;
    $('#homeMore [data-hero="play"]').onclick = e => { e.preventDefault(); player.playList(tracks, 0, { label: 'Top 50 Global', href: '#/chart' }); };
    // personalised shelves from followed artists
    const per = await Promise.allSettled(followed.map(a => deezer.artistRelated(a.id)));
    if (stale(seq)) return;
    $('#homeArtists').innerHTML = per.map((r, i) => r.value?.length ? shelf(`Porque sigues a ${followed[i].name}`, r.value) : '').join('');
    audius.trending().then(au => {
      if (stale(seq) || !au.length) return;
      const k = registerList(au, { label: 'Independiente en tendencia' });
      $('#homeIndie').innerHTML = `<section class="shelf"><div class="shelf-head"><h2>Independiente · canciones completas</h2></div><div class="hscroll" data-list="${k}">${au.slice(0, 16).map((t, i) => `<div class="card" data-track-i="${i}"><div class="art-wrap">${img(t.cover)}<button class="fab" aria-label="Reproducir">${icons.play}</button></div><div class="ct ellipsis">${esc(t.title)}</div><div class="cs ellipsis">${esc(t.artist)}</div></div>`).join('')}</div></section>`;
    }).catch(() => {});
  } catch { if (!stale(seq)) $('#homeMore').innerHTML = errorState(); }
}

/* ================= CHART ================= */
export async function chart(genreId = 0) {
  const seq = ++renderSeq; view().innerHTML = skeleton();
  try {
    const [tracks, g] = await Promise.all([deezer.chartTracks(genreId, 100), genreId ? deezer.genre(genreId) : Promise.resolve({ name: 'Global' })]);
    if (stale(seq)) return;
    const c = await tintFrom(tracks[0]?.cover);
    const label = `Top ${genreId ? g.name : 'Global'}`, href = genreId ? `#/genre/${genreId}` : '#/chart';
    const k = registerList(tracks, { label, href });
    view().innerHTML = `<header class="hero" style="--c:${rgb(c)}">${mosaic(tracks, 'hero-art')}<div class="hero-meta"><div class="eyebrow">Lista</div><h1 class="fit">${esc(label)}</h1><p class="muted">Actualizada a diario · ${plural(tracks.length, 'canción', 'canciones')}</p></div></header>
      <div class="page-body">${heroActions({ listKey: k })}${trackList(tracks, { label, href })}</div>`;
    bindHero(view(), { tracks, label, href });
  } catch { if (!stale(seq)) view().innerHTML = errorState(); }
}

/* ================= SEARCH ================= */
let lastFilter = 'all';
export async function search(q = '') {
  const seq = ++renderSeq;
  setTint([40, 40, 60]);
  const input = $('#searchInput');
  if (input && input.value !== q) input.value = q;
  if (!q) {
    view().innerHTML = `${lib.recent.length ? '' : ''}<h2 class="mt0">Explorar todo</h2><div class="genres" id="genres">${Array.from({ length: 12 }, () => '<div class="genre sk"></div>').join('')}</div>`;
    try {
      const gs = await deezer.genres(); if (stale(seq)) return;
      const palette = ['#e13300', '#1e3264', '#8400e7', '#e8115b', '#148a08', '#bc5900', '#509bf5', '#dc148c', '#477d95', '#ba5d07', '#8d67ab', '#27856a', '#e91429', '#503750', '#0d73ec', '#af2896'];
      $('#genres').innerHTML = `<a class="genre" href="#/chart" style="--g:#7c3aed"><span>Top 100</span></a>` + gs.map((g, i) => `<a class="genre" href="#/genre/${g.id}" style="--g:${palette[i % palette.length]}"><span>${esc(g.name)}</span>${img(g.picture_medium, 'gimg')}</a>`).join('');
    } catch { if (!stale(seq)) $('#genres').outerHTML = errorState(); }
    return;
  }
  view().innerHTML = `<div class="chips" id="sfilters">${[['all', 'Todo'], ['tracks', 'Canciones'], ['artists', 'Artistas'], ['albums', 'Álbumes'], ['playlists', 'Playlists'], ['indie', 'Independiente']].map(([k, l]) => `<button class="chip${k === lastFilter ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div><div id="sres">${skeleton(6)}</div>`;
  const [tr, ar, al, pl, au] = await Promise.allSettled([deezer.search(q, 40), deezer.searchArtists(q, 18), deezer.searchAlbums(q, 18), deezer.searchPlaylists(q, 18), audius.search(q)]);
  if (stale(seq)) return;
  const T = tr.value || [], A = ar.value || [], AL = al.value || [], PL = pl.value || [], AU = au.value || [];
  const localHits = [...lib.local, ...lib.liked].filter((t, i, a) => a.findIndex(x => x.id === t.id) === i).filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(q.toLowerCase()));
  const render = f => {
    lastFilter = f;
    $$('#sfilters .chip').forEach(c => c.classList.toggle('on', c.dataset.f === f));
    const box = $('#sres');
    if (!T.length && !A.length && !AL.length && !AU.length) { box.innerHTML = tr.status === 'rejected' ? errorState() : `<div class="empty"><h3>No hay resultados para «${esc(q)}»</h3><p>Revisa la ortografía o prueba con otras palabras.</p></div>`; return; }
    if (f === 'tracks') box.innerHTML = trackList(T, { label: `Resultados de «${q}»` });
    else if (f === 'artists') box.innerHTML = `<div class="cgrid">${A.map(a => card(a)).join('')}</div>`;
    else if (f === 'albums') box.innerHTML = `<div class="cgrid">${AL.map(a => card(a)).join('')}</div>`;
    else if (f === 'playlists') box.innerHTML = `<div class="cgrid">${PL.map(a => card(a)).join('')}</div>`;
    else if (f === 'indie') box.innerHTML = AU.length ? trackList(AU, { label: `Independiente: «${q}»` }) : '<div class="empty"><p>Sin resultados independientes.</p></div>';
    else {
      // choose top result: exact artist name match wins, otherwise first track
      const topArtist = A.find(a => a.name.toLowerCase() === q.toLowerCase());
      const top = topArtist || (T[0] ? { kind: 'track', ...T[0] } : A[0]);
      const tk = registerList(T, { label: `Resultados de «${q}»` });
      box.innerHTML = `<div class="top-grid">
        <section><h2>Resultado principal</h2>${top ? `<a class="topres" href="${top.kind === 'artist' ? '#/artist/' + top.id : top.albumId ? '#/album/' + top.albumId : '#/'}" data-kind="${top.kind === 'artist' ? 'artist' : 'track'}" data-id="${esc(top.id)}">
          ${img(top.kind === 'artist' ? top.pic : top.cover, top.kind === 'artist' ? 'round' : '')}<div class="tr-name ellipsis">${esc(top.name || top.title)}</div>
          <div class="tr-sub">${top.kind === 'artist' ? '<span class="tag">Artista</span>' : `<span class="tag">Canción</span> ${esc(top.artist)}`}</div>
          <button class="fab show" data-act="${top.kind === 'artist' ? 'playcoll' : 'playtop'}" aria-label="Reproducir">${icons.play}</button></a>` : ''}</section>
        <section><h2>Canciones</h2>${trackList(T.slice(0, 5), { label: `Resultados de «${q}»`, album: false, numbers: false })}</section>
      </div>
      ${localHits.length ? `<section class="shelf"><h2>En tu biblioteca</h2>${trackList(localHits.slice(0, 6), { label: 'Tu biblioteca' })}</section>` : ''}
      ${shelf('Artistas', A)}${shelf('Álbumes', AL)}${shelf('Playlists', PL)}
      ${AU.length ? `<section class="shelf"><h2>Independiente · canciones completas</h2>${trackList(AU.slice(0, 6), { label: `Independiente: «${q}»` })}</section>` : ''}`;
      box.querySelector('[data-act="playtop"]')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); player.playList(T, 0, { label: `Resultados de «${q}»` }); });
      void tk;
    }
  };
  $('#sfilters').onclick = e => { const c = e.target.closest('.chip'); if (c) render(c.dataset.f); };
  render(lastFilter);
}

/* ================= GENRE ================= */
export async function genre(id) {
  const seq = ++renderSeq; view().innerHTML = skeleton(4);
  try {
    const [g, tracks, artists, albums] = await Promise.all([deezer.genre(id), deezer.chartTracks(id, 50), deezer.genreArtists(id), deezer.chartAlbums(id, 20).catch(() => [])]);
    if (stale(seq)) return;
    const c = await tintFrom(g.picture_medium);
    const label = `Lo mejor de ${g.name}`, href = `#/genre/${id}`;
    const k = registerList(tracks, { label, href });
    view().innerHTML = `<header class="hero compact" style="--c:${rgb(c)}">${img(g.picture_xl || g.picture_big, 'hero-art')}<div class="hero-meta"><div class="eyebrow">Género</div><h1 class="fit">${esc(g.name)}</h1></div></header>
      <div class="page-body">${heroActions({ listKey: k })}
      <h2>Canciones populares</h2>${trackList(tracks.slice(0, 20), { label, href })}
      ${shelf('Artistas', artists)}${shelf('Álbumes populares', albums)}</div>`;
    bindHero(view(), { tracks, label, href });
  } catch { if (!stale(seq)) view().innerHTML = errorState(); }
}

/* ================= ARTIST ================= */
export async function artist(id) {
  const seq = ++renderSeq; view().innerHTML = skeleton();
  try {
    const [a, top, albums, related] = await Promise.all([deezer.artist(id), deezer.artistTop(id, 10), deezer.artistAlbums(id), deezer.artistRelated(id).catch(() => [])]);
    if (stale(seq)) return;
    lib.pushVisited({ kind: 'artist', id: a.id, title: a.name, pic: a.pic });
    const c = await tintFrom(a.pic);
    const label = a.name, href = `#/artist/${id}`;
    const k = registerList(top, { label, href });
    const groups = { album: [], single: [], ep: [], compile: [] };
    albums.forEach(al => (groups[al.type] || groups.album).push(al));
    const disc = [...groups.album, ...groups.ep, ...groups.single];
    const latest = [...albums].sort((x, y) => (y.year || '').localeCompare(x.year || ''))[0];
    const render = () => {
      const following = lib.isSaved('artist', a.id);
      view().innerHTML = `<header class="hero artist-hero" style="--c:${rgb(c)};--bg:url('${esc(a.picXL)}')"><div class="hero-bg"></div><div class="hero-meta"><div class="verified">✔ Artista verificado</div><h1 class="fit xl">${esc(a.name)}</h1><p>${fmtNum(a.fans)} seguidores</p></div></header>
        <div class="page-body">${heroActions({ listKey: k, follow: following })}
        <div class="artist-grid"><section><h2>Populares</h2><div id="popular">${trackList(top.slice(0, 5), { label, href, album: false })}</div>${top.length > 5 ? '<button class="linkbtn" id="morePop">Mostrar más</button>' : ''}</section>
        ${latest ? `<section class="pick"><h2>Lanzamiento destacado</h2><a class="pickcard" href="#/album/${latest.id}">${img(latest.cover)}<div><div class="tag">Más reciente</div><div class="ct">${esc(latest.title)}</div><div class="cs">${esc(latest.year)} · ${latest.type === 'single' ? 'Sencillo' : latest.type === 'ep' ? 'EP' : 'Álbum'}</div></div></a></section>` : ''}</div>
        <section class="shelf"><div class="shelf-head"><h2>Discografía</h2></div><div class="chips" id="discf">${[['all', 'Todo'], ['album', 'Álbumes'], ['single', 'Sencillos y EP']].map(([v, l], i) => `<button class="chip${i ? '' : ' on'}" data-f="${v}">${l}</button>`).join('')}</div><div class="hscroll" id="disc">${disc.map(al => card(al, { sub: `${al.year} · ${al.type === 'single' ? 'Sencillo' : al.type === 'ep' ? 'EP' : 'Álbum'}` })).join('')}</div></section>
        ${shelf('A los fans también les gusta', related)}
        ${a.albums ? `<section class="about" style="--bg:url('${esc(a.picXL)}')"><h2>Información</h2><div class="about-card"><div><b>${fmtNum(a.fans)}</b> seguidores</div><div><b>${a.albums}</b> lanzamientos</div><button class="pill" id="artistRadio">📻 Radio del artista</button></div></section>` : ''}</div>`;
      bindHero(view(), { tracks: top, label, href, onSave: () => { lib.toggleSaved('artist', { kind: 'artist', id: a.id, name: a.name, pic: a.pic }); render(); } });
      $('#morePop')?.addEventListener('click', e => { $('#popular').innerHTML = trackList(top, { label, href, album: false }); e.target.remove(); });
      $('#discf').onclick = e => { const ch = e.target.closest('.chip'); if (!ch) return; $$('#discf .chip').forEach(x => x.classList.toggle('on', x === ch)); const f = ch.dataset.f; $('#disc').innerHTML = disc.filter(al => f === 'all' || (f === 'album' ? al.type === 'album' : al.type !== 'album')).map(al => card(al, { sub: `${al.year} · ${al.type === 'single' ? 'Sencillo' : al.type === 'ep' ? 'EP' : 'Álbum'}` })).join(''); };
      $('#artistRadio')?.addEventListener('click', async () => { const r = await deezer.artistRadio(id); player.playList(r, 0, { label: `Radio de ${a.name}`, href }); });
    };
    render();
  } catch { if (!stale(seq)) view().innerHTML = errorState(); }
}

/* ================= ALBUM ================= */
export async function album(id) {
  const seq = ++renderSeq; view().innerHTML = skeleton();
  try {
    const a = await deezer.album(id);
    if (stale(seq)) return;
    lib.pushVisited({ kind: 'album', id: a.id, title: a.title, cover: a.cover });
    const c = await tintFrom(a.cover);
    const label = a.title, href = `#/album/${id}`;
    const k = registerList(a.tracks, { label, href });
    const total = a.duration || a.tracks.reduce((s, t) => s + t.dur, 0);
    const render = () => {
      view().innerHTML = `<header class="hero" style="--c:${rgb(c)}">${img(a.coverXL, 'hero-art shadow')}<div class="hero-meta"><div class="eyebrow">${a.type === 'single' ? 'Sencillo' : a.type === 'ep' ? 'EP' : 'Álbum'}</div><h1 class="fit">${esc(a.title)}</h1>
        <p class="byline"><a href="#/artist/${a.artistId}"><b>${esc(a.artist)}</b></a> · ${esc(a.year)} · ${plural(a.tracks.length, 'canción', 'canciones')}, <span class="muted">${fmtLong(total)}</span></p></div></header>
        <div class="page-body">${heroActions({ listKey: k, saveKind: 'album', saved: lib.isSaved('album', a.id) })}
        ${trackList(a.tracks, { label, href, album: false, cover: false })}
        <p class="fine">${a.date ? new Date(a.date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}<br>${a.label ? '℗ ' + esc(a.label) : ''}</p>
        <div id="moreBy"></div></div>`;
      bindHero(view(), { tracks: a.tracks, label, href, onSave: () => { lib.toggleSaved('album', a); render(); } });
      deezer.artistAlbums(a.artistId).then(list => { if (!stale(seq)) $('#moreBy').innerHTML = shelf(`Más de ${a.artist}`, list.filter(x => x.id !== a.id).slice(0, 14), { more: `#/artist/${a.artistId}` }); }).catch(() => {});
    };
    render();
  } catch { if (!stale(seq)) view().innerHTML = errorState(); }
}

/* ================= DEEZER PLAYLIST ================= */
export async function dzplaylist(id) {
  const seq = ++renderSeq; view().innerHTML = skeleton();
  try {
    const p = await deezer.playlist(id);
    if (stale(seq)) return;
    lib.pushVisited({ kind: 'dzplaylist', id: p.id, title: p.title, cover: p.cover });
    const c = await tintFrom(p.cover);
    const label = p.title, href = `#/dzplaylist/${id}`;
    const k = registerList(p.tracks, { label, href });
    const render = () => {
      view().innerHTML = `<header class="hero" style="--c:${rgb(c)}">${img(p.coverXL, 'hero-art shadow')}<div class="hero-meta"><div class="eyebrow">Playlist pública</div><h1 class="fit">${esc(p.title)}</h1>
        ${p.description ? `<p class="muted desc">${esc(p.description)}</p>` : ''}<p class="byline"><b>${esc(p.by)}</b> · ${p.fans ? fmtNum(p.fans) + ' guardados · ' : ''}${plural(p.tracks.length, 'canción', 'canciones')}, <span class="muted">${fmtLong(p.duration)}</span></p></div></header>
        <div class="page-body">${heroActions({ listKey: k, saveKind: 'dzplaylist', saved: lib.isSaved('dzplaylist', p.id) })}${trackList(p.tracks, { label, href })}</div>`;
      bindHero(view(), { tracks: p.tracks, label, href, onSave: () => { lib.toggleSaved('dzplaylist', p); render(); } });
    };
    render();
  } catch { if (!stale(seq)) view().innerHTML = errorState(); }
}

/* ================= USER PLAYLIST / LIKED ================= */
export async function playlist(id) {
  const seq = ++renderSeq;
  const p = lib.playlist(id);
  if (!p) { view().innerHTML = '<div class="empty"><h3>Playlist no encontrada</h3></div>'; return; }
  const c = await imageColor(p.tracks[0]?.cover); if (stale(seq)) return; setTint(c);
  const label = p.name, href = `#/playlist/${id}`;
  const k = registerList(p.tracks, { label, href, playlistId: id });
  const total = p.tracks.reduce((s, t) => s + (t.dur || 0), 0);
  view().innerHTML = `<header class="hero" style="--c:${rgb(c)}"><button class="hero-art-btn" id="editPl" title="Editar detalles">${mosaic(p.tracks, 'hero-art shadow')}</button><div class="hero-meta"><div class="eyebrow">Playlist</div><h1 class="fit editable" id="plName">${esc(p.name)}</h1>
    ${p.desc ? `<p class="muted desc">${esc(p.desc)}</p>` : ''}<p class="byline"><b>Tú</b> · ${plural(p.tracks.length, 'canción', 'canciones')}${total ? `, <span class="muted">${fmtLong(total)}</span>` : ''}</p></div></header>
    <div class="page-body">${heroActions({ listKey: k })}
    ${p.tracks.length ? trackList(p.tracks, { label, href, playlistId: id, added: true, draggable: true }) : ''}
    <section class="recommend"><h2>${p.tracks.length ? 'Recomendadas' : 'Busquemos algo para tu playlist'}</h2><p class="muted">${p.tracks.length ? 'Basadas en las canciones de esta playlist' : ''}</p>
      <div class="search-inline">${icons.music}<input id="plSearch" type="search" placeholder="Busca canciones o episodios" autocomplete="off"></div><div id="plRec"></div></section></div>`;
  bindHero(view(), { tracks: p.tracks, label, href, onMore: at => showMenu([
    { icon: '✎', text: 'Editar detalles', run: () => editPlaylist(p) },
    { icon: '☰', text: 'Añadir a la cola', run: () => player.addToQueue(p.tracks) },
    { icon: '↗', text: 'Compartir', run: () => share(p.name, href) },
    '-', { icon: '🗑', text: 'Eliminar', run: async () => { if (await confirmBox('¿Eliminar de Tu biblioteca?', `Se eliminará «${p.name}».`)) { lib.deletePlaylist(id); location.hash = '#/library'; } } }
  ], at) });
  $('#editPl').onclick = $('#plName').onclick = () => editPlaylist(p);
  // add-songs helper: search or recommendations
  const recBox = $('#plRec');
  const showAdd = (tracks, title) => {
    recBox.innerHTML = tracks.length ? `<div class="tracks addlist">${tracks.slice(0, 10).map((t, i) => `<div class="trow" data-i="${i}">
      <div class="c-title">${img(t.cover, 'tcover')}<div class="tt"><div class="tname ellipsis">${esc(t.title)}</div><div class="tart ellipsis">${esc(t.artist)}</div></div></div><div class="c-album ellipsis muted">${esc(t.album)}</div><div><button class="pill ghost sm" data-add="${i}">Añadir</button></div></div>`).join('')}</div>` : `<p class="muted">${title || ''}</p>`;
    recBox.onclick = e => { const b = e.target.closest('[data-add]'); if (b) { lib.addToPlaylist(id, tracks[+b.dataset.add]); playlist(id); } };
  };
  $('#plSearch').oninput = debounce(async e => { const q = e.target.value.trim(); if (!q) return loadRec(); try { showAdd(await deezer.search(q, 10)); } catch { /* */ } }, 300);
  async function loadRec() {
    const seed = p.tracks[p.tracks.length - 1];
    try {
      const rec = seed?.artistId ? (await deezer.artistRadio(seed.artistId)) : await deezer.chartTracks(0, 20);
      if (!stale(seq)) showAdd(rec.filter(t => !p.tracks.some(x => x.id === t.id)));
    } catch { /* offline */ }
  }
  loadRec();
  // drag & drop reorder
  let from = null;
  view().querySelectorAll('.tracks[data-list] .trow[draggable]').forEach(row => {
    row.addEventListener('dragstart', () => { from = +row.dataset.i; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('dropover'); });
    row.addEventListener('dragleave', () => row.classList.remove('dropover'));
    row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('dropover'); if (from !== null && from !== +row.dataset.i) { lib.movePlaylistTrack(id, from, +row.dataset.i); playlist(id); } from = null; });
  });
}
function editPlaylist(p) {
  import('./ui.js').then(({ modal }) => modal(`<h3>Editar detalles</h3><div class="edit-grid">${mosaic(p.tracks, 'edit-art')}<div><input class="field" id="epName" maxlength="80" value="${esc(p.name)}" placeholder="Nombre"><textarea class="field" id="epDesc" maxlength="300" placeholder="Añade una descripción opcional">${esc(p.desc || '')}</textarea></div></div><div class="acts"><button class="pill primary" data-ok>Guardar</button></div>`, (el, close) => {
    el.querySelector('[data-ok]').onclick = () => { lib.updatePlaylist(p.id, { name: el.querySelector('#epName').value.trim() || p.name, desc: el.querySelector('#epDesc').value.trim() }); close(); playlist(p.id); };
  }));
}

export function liked() {
  ++renderSeq; setTint([80, 56, 237]);
  const label = 'Tus me gusta', href = '#/liked';
  const k = registerList(lib.liked, { label, href });
  view().innerHTML = `<header class="hero" style="--c:rgb(80,56,237)"><div class="hero-art shadow liked-art big">${icons.heartOn}</div><div class="hero-meta"><div class="eyebrow">Playlist</div><h1 class="fit">Tus me gusta</h1><p class="byline"><b>Tú</b> · ${plural(lib.liked.length, 'canción', 'canciones')}</p></div></header>
    <div class="page-body">${heroActions({ listKey: k })}${lib.liked.length ? trackList(lib.liked, { label, href, added: true }) : `<div class="empty"><div class="empty-ico">${icons.heart}</div><h3>Las canciones que te gustan aparecerán aquí</h3><p>Guarda canciones tocando el icono del corazón.</p><a class="pill primary" href="#/search">Buscar canciones</a></div>`}</div>`;
  bindHero(view(), { tracks: lib.liked, label, href });
}

/* ================= LIBRARY ================= */
let libFilter = store.get('libFilter', 'all'), libSort = store.get('libSort', 'recent');
export function library() {
  ++renderSeq; setTint([40, 40, 60]);
  const items = [
    { kind: 'liked', id: 'liked', title: 'Tus me gusta', sub: `Playlist · ${plural(lib.liked.length, 'canción', 'canciones')}`, added: Infinity, pin: true },
    ...lib.playlists.map(p => ({ ...p, kind: 'playlist', title: p.name, sub: `Playlist · Tú`, added: p.created })),
    ...lib.dzplaylists.map(p => ({ ...p, title: p.title, sub: `Playlist · ${p.by}` })),
    ...lib.albums.map(a => ({ ...a, sub: `Álbum · ${a.artist}` })),
    ...lib.artists.map(a => ({ ...a, title: a.name, sub: 'Artista' }))
  ];
  const f = { all: () => true, playlists: i => ['liked', 'playlist', 'dzplaylist'].includes(i.kind), artists: i => i.kind === 'artist', albums: i => i.kind === 'album' }[libFilter] || (() => true);
  const sorted = items.filter(f).sort((a, b) => b.pin - a.pin || (libSort === 'alpha' ? (a.title || '').localeCompare(b.title || '') : (b.added || 0) - (a.added || 0)));
  const localK = lib.local.length ? registerList(lib.local, { label: 'Archivos locales', href: '#/library' }) : '';
  void localK;
  view().innerHTML = `<div class="lib-head"><h1>Tu biblioteca</h1><div class="lib-actions"><button class="pill primary" id="newPl">＋ Crear playlist</button><button class="pill ghost" id="importBtn">Importar archivos</button></div></div>
    <div class="chips"><span class="chips-l">${[['all', 'Todo'], ['playlists', 'Playlists'], ['artists', 'Artistas'], ['albums', 'Álbumes']].map(([v, l]) => `<button class="chip${v === libFilter ? ' on' : ''}" data-lf="${v}">${l}</button>`).join('')}</span>
      <button class="chip ghost" id="libSort">${libSort === 'alpha' ? 'Alfabético' : 'Recientes'} ⇅</button></div>
    <div class="cgrid lib-grid">${sorted.map(i => card(i.kind === 'liked' ? { ...i } : i, { sub: i.sub })).join('')}</div>
    ${sorted.length <= 1 && libFilter !== 'all' ? '<div class="empty"><p>Todavía no hay nada aquí. Guarda álbumes, sigue artistas o crea playlists.</p></div>' : ''}
    <section class="shelf"><div class="shelf-head"><h2>Archivos locales</h2></div>${lib.local.length ? trackList(lib.local, { label: 'Archivos locales', href: '#/library' }) : `<div class="dropzone" id="dropzone">${icons.music}<div><b>Arrastra aquí tu música</b><br><span class="muted">MP3, M4A, FLAC, WAV, OGG… Se guarda en este dispositivo y funciona sin conexión.</span></div></div>`}</section>`;
  $('#newPl').onclick = async () => { const n = await prompt('Nueva playlist', '', 'Crear'); if (n !== null) { const p = lib.createPlaylist(n); location.hash = '#/playlist/' + p.id; } };
  $('#importBtn').onclick = () => $('#filePicker').click();
  $('#dropzone')?.addEventListener('click', () => $('#filePicker').click());
  view().querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { libFilter = b.dataset.lf; store.set('libFilter', libFilter); library(); });
  $('#libSort').onclick = () => { libSort = libSort === 'alpha' ? 'recent' : 'alpha'; store.set('libSort', libSort); library(); };
}

/* ================= QUEUE ================= */
export function queue() {
  ++renderSeq; setTint([40, 40, 60]);
  const cur = player.current, man = player.manual, up = player.upcoming;
  const nowK = cur ? registerList([cur], { label: 'now' }) : '';
  view().innerHTML = `<h1>Cola</h1>
    ${cur ? `<h2 class="qh">Sonando ahora</h2>${trackList([cur], { label: player.ctx.label, href: player.ctx.href, numbers: false }).replace(/data-list="L\d+"/, `data-list="${nowK}" data-now="1"`)}` : '<div class="empty"><h3>Añade algo a tu cola</h3><p>Busca música y toca «Añadir a la cola».</p></div>'}
    ${man.length ? `<div class="qhead"><h2 class="qh">Siguiente en la cola</h2><button class="linkbtn" id="clearQ">Borrar cola</button></div>${trackList(man, { numbers: false }).replace(/data-list="(L\d+)"/, 'data-list="$1" data-manual="1"')}` : ''}
    ${up.length ? `<h2 class="qh">A continuación de: <a href="${esc(player.ctx.href || '#/queue')}">${esc(player.ctx.label || 'tu selección')}</a></h2>${trackList(up.slice(0, 80), { numbers: false }).replace(/data-list="(L\d+)"/, 'data-list="$1" data-upcoming="1"')}` : ''}`;
  $('#clearQ')?.addEventListener('click', () => player.clearManual());
}
