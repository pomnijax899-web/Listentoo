// Page views for the Orbit UI. Each view writes into #view.
import { $, $$, esc, fmt, fmtLong, fmtNum, plural, imageColor, rgb, debounce, store, toast } from './util.js';
import { deezer, audius, MOODS, radio, RADIO_TAGS, jamendo } from './api.js';
import { lib } from './library.js';
import { player } from './player.js';
import { cloud } from './cloud.js';
import { THEMES, applyTheme, resolveTheme } from './themes.js';
import { fx } from './fx.js';
import { icons, img, trackList, card, shelf, mosaic, skeleton, skeletonShelves, errorState, registerList, prompt, confirmBox, share, showMenu, modal, trackCards, avatar, avatarOf, planChip, PLANS_UI, burst, hrefOf, stationCards, communityCards } from './ui.js';
import { PLANS, quota, fmtLeft, fmtSecs } from './plans.js';

const view = () => $('#view');
let seqN = 0;
const begin = () => ++seqN;
const stale = s => s !== seqN;
const setTint = c => document.documentElement.style.setProperty('--tint', rgb(c));
const greeting = () => { const h = new Date().getHours(); return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; };
const typeLabel = t => t === 'single' ? 'Sencillo' : t === 'ep' ? 'EP' : t === 'compile' ? 'Recopilatorio' : 'Álbum';

function actions({ listKey, saved, saveKind, follow, extra = '' }) {
  return `<div class="actions">
    <button class="bigplay" data-hero="play" data-list="${listKey}" aria-label="Reproducir">${icons.play}</button>
    <button class="iconbtn lg${player.shuffle ? ' on' : ''}" data-hero="shuffle" aria-label="Aleatorio" title="Aleatorio">${icons.shuffle}</button>
    ${follow !== undefined ? `<button class="pill ghost${follow ? ' on' : ''}" data-hero="save">${follow ? 'Siguiendo' : 'Seguir'}</button>` : ''}
    ${saveKind ? `<button class="iconbtn lg save${saved ? ' on' : ''}" data-hero="save" aria-label="Guardar" title="${saved ? 'Quitar de tu biblioteca' : 'Guardar en tu biblioteca'}">${saved ? icons.check : icons.plusCircle}</button>` : ''}
    ${extra}
    <button class="iconbtn lg" data-hero="more" aria-label="Más opciones">${icons.more}</button>
  </div>`;
}
function bindActions(root, { tracks, label, href, onSave, onMore }) {
  root.querySelector('[data-hero="play"]')?.addEventListener('click', () => {
    if (player.ctx.href === href && player.current) player.toggle();
    else player.playList(tracks, 0, { label, href, shuffle: false });
  });
  root.querySelector('[data-hero="shuffle"]')?.addEventListener('click', () => player.playList(tracks, 0, { label, href, shuffle: true }));
  root.querySelector('[data-hero="save"]')?.addEventListener('click', onSave || (() => {}));
  root.querySelector('[data-hero="more"]')?.addEventListener('click', e => onMore ? onMore(e.currentTarget) : showMenu([
    { icon: icons.addq, text: 'Añadir a la cola', run: () => player.addToQueue(tracks) },
    { icon: icons.plus, text: 'Guardar como playlist', run: async () => { const n = await prompt('Nueva playlist', label, 'Crear'); if (n !== null) { lib.createPlaylist(n, tracks); toast('Playlist creada'); } } },
    ...lib.playlists.slice(0, 8).map(p => ({ icon: icons.music, text: `Añadir a «${p.name}»`, run: () => lib.addToPlaylist(p.id, tracks) })),
    '-', { icon: icons.share, text: 'Compartir', run: () => share(label, href) }
  ], e.currentTarget));
}
const poster = ({ c, art, kind, title, meta = '', desc = '', cls = '' }) => `
  <header class="poster ${cls}" style="--c:${rgb(c)}">
    <div class="poster-art">${art}</div>
    <div class="poster-meta"><div class="eyebrow">${esc(kind)}</div><h1 class="title-xl">${esc(title)}</h1>${desc ? `<p class="desc">${esc(desc)}</p>` : ''}<p class="byline">${meta}</p></div>
  </header>`;
const sleeve = (src, alt = '') => `<div class="sleeve-wrap"><span class="vinyl big" style="--lbl:url('${esc(src)}')"></span>${img(src, 'sleeve', alt)}</div>`;

/* ======================= INICIO ======================= */
export async function home() {
  const s = begin(); setTint([90, 60, 160]);
  const name = cloud.profile?.display_name;
  const today = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const counts = {};
  [...lib.recent, ...lib.liked].forEach(t => { if (t.artistId) counts[t.artistId] = { n: (counts[t.artistId]?.n || 0) + 1, name: t.artist, cover: t.cover }; });
  const fav = Object.entries(counts).sort((a, b) => b[1].n - a[1].n)[0];
  const ann = cloud.announcement;
  view().innerHTML = `
    <section class="hello-wrap">
      <div class="hello">
        <div class="hud-tag"><span class="blink"></span>${esc(today)}</div>
        <h1 class="greet">${greeting()}${name ? `,<br><span class="grad">${esc(name)}</span>` : ''}</h1>
        <p class="muted">¿Qué te apetece escuchar hoy?</p>
        ${usageChip()}
      </div>
      <section class="ring3d" aria-label="Álbumes del momento">
        <div class="ring-track" style="--n:12">${Array.from({ length: 12 }, (_, i) => `<div class="ring-item sk" style="--i:${i}"></div>`).join('')}</div>
        <div class="ring-floor"></div><div class="ring-hint">Arrastra para girar</div>
      </section>
    </section>
    ${ann ? `<div class="announce ${esc(ann.tone || 'info')}"><span class="dot"></span><p>${esc(ann.text)}</p></div>` : ''}
    <div class="moods">${MOODS.map(m => `<a class="mood" href="#/mood/${m.id}" style="--m1:${m.c[0]};--m2:${m.c[1]}"><span>${icons[m.icon]}</span>${esc(m.name)}</a>`).join('')}</div>
    ${cloud.signedIn ? '' : `<a class="cta" href="#/cuenta"><div><b>Crea tu cuenta gratis</b><p>Tu biblioteca y tus emisoras en todos tus dispositivos, y playlists para compartir.</p></div><span class="pill primary">Empezar</span></a>`}
    <div class="bento" id="bento">
      <a class="tile t-top" data-tilt href="#/top"><div class="t-collage" id="topCollage">${Array.from({ length: 6 }, () => '<i class="sk"></i>').join('')}</div><div class="t-body"><div class="eyebrow">Lista del día</div><h2>Top 50 Global</h2><p id="topSub" class="muted">Lo más escuchado ahora mismo</p></div><button class="fab show" id="topPlay" aria-label="Reproducir Top 50">${icons.play}</button></a>
      <button class="tile t-mix" data-tilt id="mixTile" style="--img:url('${esc(fav?.[1].cover || '')}')"><div class="t-glow"></div><div class="t-body"><div class="eyebrow">${fav ? 'Tu mezcla' : 'Descubre'}</div><h2>${fav ? `${esc(fav[1].name)} y más` : 'Algo nuevo para ti'}</h2><p class="muted">${fav ? 'Una radio infinita a partir de lo que más escuchas' : 'Una radio sorpresa con artistas en tendencia'}</p></div><span class="fab show">${icons.radio}</span></button>
      <a class="tile t-liked" data-tilt href="#/megusta"><div class="liked-art">${icons.heartOn}</div><div><h3>Me gusta</h3><p class="muted">${plural(lib.songs.length, 'canción', 'canciones')}</p></div></a>
      <div class="tile t-recent"><div class="eyebrow">Vuelve a escuchar</div><div id="recentMini">${lib.recent.slice(0, 4).map((t, i) => `<button class="mini-row" data-ri="${i}">${img(t.cover)}<span class="ellipsis"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button>`).join('') || '<p class="muted small">Lo que escuches aparecerá aquí.</p>'}</div></div>
    </div>
    ${lib.recent.length > 4 ? `<section class="shelf"><div class="shelf-head"><h2>Escuchado recientemente</h2></div>${trackCards(lib.recent.slice(0, 16), 'Escuchado recientemente')}</section>` : ''}
    <div id="homeRadio"></div>
    <div id="homeMore">${skeletonShelves(3)}</div>`;
  homeRadio(s);
  const recentK = registerList(lib.recent, { label: 'Escuchado recientemente' });
  $('#recentMini').onclick = e => { const b = e.target.closest('[data-ri]'); if (b) player.playList(lib.recent, +b.dataset.ri, { label: 'Escuchado recientemente' }); };
  void recentK;
  $('#mixTile').onclick = async () => {
    try {
      let tracks;
      if (fav) tracks = await deezer.artistRadio(fav[0]);
      else { const top = await deezer.chartArtists(0, 20); const a = top[Math.floor(Math.random() * top.length)]; tracks = await deezer.artistRadio(a.id); }
      player.playList(tracks, 0, { label: fav ? `Tu mezcla · ${fav[1].name}` : 'Descubre' });
    } catch { toast('No se pudo crear la mezcla'); }
  };
  try {
    const [tracks, albums, artists, playlists] = await Promise.all([deezer.chartTracks(0, 50), deezer.chartAlbums(), deezer.chartArtists(), deezer.chartPlaylists()]);
    if (stale(s)) return;
    $('#topCollage').innerHTML = tracks.slice(0, 6).map(t => img(t.cover)).join('');
    const ringAlbums = albums.slice(0, 12);
    const rt = view().querySelector('.ring-track');
    if (rt && ringAlbums.length) {
      rt.style.setProperty('--n', ringAlbums.length);
      rt.innerHTML = ringAlbums.map((a, i) => `<a class="ring-item" href="#/album/${a.id}" style="--i:${i}" draggable="false"><img src="${esc((a.coverXL || a.cover || '').replace('1000x1000', '500x500'))}" alt="" draggable="false" decoding="async"><span class="ri-meta"><b class="ellipsis">${esc(a.title)}</b><small class="ellipsis">${esc(a.artist)}</small></span></a>`).join('');
      const ring = rt.closest('.ring3d'); ring._front = -1;
    }
    $('#topSub').textContent = tracks.slice(0, 3).map(t => t.artist).join(', ') + ' y más';
    $('#topPlay').onclick = e => { e.preventDefault(); e.stopPropagation(); player.playList(tracks, 0, { label: 'Top 50 Global', href: '#/top' }); };
    const followed = lib.artists.slice(0, 2);
    $('#homeMore').innerHTML = `${shelf('Álbumes del momento', albums)}${shelf('Artistas en órbita', artists)}${shelf('Playlists destacadas', playlists)}<div id="homeFollow"></div><div id="homeIndie"></div><div id="homeFree"></div>`;
    if (jamendo.enabled) jamendo.popular().then(jm => { if (!stale(s) && jm.length) $('#homeFree').innerHTML = `<section class="shelf"><div class="shelf-head"><h2>Música libre · siempre completa</h2></div>${trackCards(jm.slice(0, 16), 'Música libre')}</section>`; }).catch(() => {});
    const per = await Promise.allSettled(followed.map(a => deezer.artistRelated(a.id)));
    if (stale(s)) return;
    $('#homeFollow').innerHTML = per.map((r, i) => r.value?.length ? shelf(`Porque sigues a ${followed[i].name}`, r.value) : '').join('');
    audius.trending().then(au => {
      if (stale(s) || !au.length) return;
      $('#homeIndie').innerHTML = `<section class="shelf"><div class="shelf-head"><h2>Independiente · siempre completa</h2></div>${trackCards(au.slice(0, 16), 'Independiente en tendencia')}</section>`;
    }).catch(() => {});
  } catch { if (!stale(s)) $('#homeMore').innerHTML = errorState(); }
}

/* ======================= EXPLORAR ======================= */
let lastFilter = 'all';
export async function explore(q = '') {
  const s = begin(); setTint([50, 50, 90]);
  const top = $('#searchInput'); if (top && top.value !== q && document.activeElement !== top) top.value = q;
  if (!q) {
    view().innerHTML = `<div class="page-search"><input id="pageSearch" type="search" placeholder="Artistas, canciones, álbumes…" autocomplete="off" enterkeyhint="search"></div>
      <h1>Explorar</h1>
      <h2>Para cada momento</h2><div class="mood-grid">${MOODS.map(m => `<a class="mood-card" data-tilt href="#/mood/${m.id}" style="--m1:${m.c[0]};--m2:${m.c[1]}"><span class="mi">${icons[m.icon]}</span><b>${esc(m.name)}</b></a>`).join('')}</div>
      <section class="shelf" id="community" hidden></section>
      <h2>Géneros</h2><div class="genres" id="genres">${Array.from({ length: 12 }, () => '<div class="genre sk"></div>').join('')}</div>`;
    bindPageSearch();
    cloud.publicUploads(null, 18).then(list => { if (stale(s) || !list.length) return; const c = $('#community'); c.hidden = false; c.innerHTML = `<div class="shelf-head"><h2>Comunidad</h2><span class="more muted">Subidas por cuentas Ultra</span></div>${communityCards(list, 'Comunidad')}`; }).catch(() => {});
    try {
      const gs = await deezer.genres(); if (stale(s)) return;
      $('#genres').innerHTML = `<a class="genre" href="#/top" style="--g1:#7c3aed;--g2:#db2777"><span>Top 100</span></a>` + gs.map((g, i) => `<a class="genre" href="#/genero/${g.id}" style="--g1:hsl(${(i * 37) % 360} 70% 45%);--g2:hsl(${(i * 37 + 50) % 360} 75% 35%)"><span>${esc(g.name)}</span>${img(g.picture_medium, 'gimg')}</a>`).join('');
    } catch { if (!stale(s)) $('#genres').outerHTML = errorState(); }
    return;
  }
  view().innerHTML = `<div class="page-search"><input id="pageSearch" type="search" value="${esc(q)}" autocomplete="off" enterkeyhint="search"></div>
    <div class="chips" id="sfilters">${[['all', 'Todo'], ['tracks', 'Canciones'], ['artists', 'Artistas'], ['albums', 'Álbumes'], ['playlists', 'Playlists'], ['radio', 'Radio'], ['indie', 'Completas']].map(([k, l]) => `<button class="chip${k === lastFilter ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div><div id="sres">${skeleton(6)}</div>`;
  bindPageSearch();
  const [tr, ar, al, pl, au, rd, jm, cm] = await Promise.allSettled([deezer.search(q, 40), deezer.searchArtists(q, 18), deezer.searchAlbums(q, 18), deezer.searchPlaylists(q, 18), audius.search(q), radio.search(q, 18), jamendo.search(q), cloud.publicUploads(q, 18)]);
  if (stale(s)) return;
  const T = tr.value || [], A = ar.value || [], AL = al.value || [], PL = pl.value || [], RD = rd.value || [], CM = cm.value || [], AU = [...(jm.value || []), ...(au.value || [])];
  const mine = [...lib.local, ...lib.liked].filter((t, i, a) => a.findIndex(x => x.id === t.id) === i).filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(q.toLowerCase()));
  const render = f => {
    lastFilter = f;
    $$('#sfilters .chip').forEach(c => c.classList.toggle('on', c.dataset.f === f));
    const box = $('#sres');
    if (!T.length && !A.length && !AL.length && !AU.length && !RD.length && !CM.length) { box.innerHTML = tr.status === 'rejected' ? errorState() : `<div class="empty"><h3>Nada para «${esc(q)}»</h3><p>Prueba con otras palabras o revisa la ortografía.</p></div>`; return; }
    const lbl = `Resultados de «${q}»`;
    if (f === 'tracks') box.innerHTML = trackList(T, { label: lbl });
    else if (f === 'artists') box.innerHTML = `<div class="cgrid bubbles">${A.map(a => card(a)).join('')}</div>`;
    else if (f === 'albums') box.innerHTML = `<div class="cgrid">${AL.map(a => card(a)).join('')}</div>`;
    else if (f === 'playlists') box.innerHTML = `<div class="cgrid">${PL.map(a => card(a)).join('')}</div>`;
    else if (f === 'indie') box.innerHTML = AU.length || CM.length ? trackList([...CM, ...AU], { label: `Completas: «${q}»` }) : '<div class="empty"><p>No hay canciones completas para esta búsqueda. Prueba la radio en directo.</p></div>';
    else if (f === 'radio') box.innerHTML = RD.length ? stationCards(RD, `Radio: «${q}»`, { wrap: true }) : '<div class="empty"><p>No hay emisoras con ese nombre.</p></div>';
    else {
      const exact = A.find(a => a.name.toLowerCase() === q.toLowerCase());
      const topIsArtist = !!exact || (!T.length && A.length);
      const tp = exact || (T[0] && !topIsArtist ? T[0] : A[0]);
      box.innerHTML = `<div class="top-grid">
        <section><h2>Lo más destacado</h2>${tp ? `<a class="topres" data-tilt href="${topIsArtist ? '#/artista/' + tp.id : tp.albumId ? '#/album/' + tp.albumId : '#/explorar'}" ${topIsArtist ? `data-kind="artist" data-id="${tp.id}"` : ''}>
          ${img(topIsArtist ? tp.picXL || tp.pic : tp.coverXL || tp.cover, topIsArtist ? 'round' : '')}<div><div class="tag">${topIsArtist ? 'Artista' : 'Canción'}</div><div class="tr-name ellipsis2">${esc(tp.name || tp.title)}</div><div class="muted">${topIsArtist ? fmtNum(tp.fans) + ' fans' : esc(tp.artist)}</div></div>
          <button class="fab show" data-act="${topIsArtist ? 'playcoll' : 'playtop'}" aria-label="Reproducir">${icons.play}</button></a>` : ''}</section>
        <section><h2>Canciones</h2>${trackList(T.slice(0, 5), { label: lbl, album: false, numbers: false })}</section>
      </div>
      ${mine.length ? `<section class="shelf"><h2>En tu biblioteca</h2>${trackList(mine.slice(0, 6), { label: 'Tu biblioteca' })}</section>` : ''}
      ${CM.length ? `<section class="shelf"><div class="shelf-head"><h2>De la comunidad</h2></div>${communityCards(CM, `Comunidad: «${q}»`)}</section>` : ''}
      ${shelf('Artistas', A)}${shelf('Álbumes', AL)}${shelf('Playlists', PL)}
      ${AU.length ? `<section class="shelf"><h2>Canciones completas</h2>${trackList(AU.slice(0, 6), { label: `Completas: «${q}»` })}</section>` : ''}
      ${RD.length ? `<section class="shelf"><div class="shelf-head"><h2>Emisoras</h2></div>${stationCards(RD, `Radio: «${q}»`)}</section>` : ''}`;
      box.querySelector('[data-act="playtop"]')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); player.playList(T, 0, { label: lbl }); });
    }
  };
  $('#sfilters').onclick = e => { const c = e.target.closest('.chip'); if (c) render(c.dataset.f); };
  render(lastFilter);
}
function bindPageSearch() {
  const inp = $('#pageSearch'); if (!inp) return;
  const go = debounce(v => { history.replaceState(null, '', '#/explorar' + (v ? '?q=' + encodeURIComponent(v) : '')); explore(v); }, 380);
  inp.addEventListener('input', () => go(inp.value.trim()));
  if (!inp.value && matchMedia('(max-width: 820px)').matches) setTimeout(() => inp.focus(), 60);
}

/* ======================= MOOD ======================= */
export async function mood(id) {
  const s = begin(); const m = MOODS.find(x => x.id === id);
  if (!m) { location.hash = '#/explorar'; return; }
  view().innerHTML = skeleton(4);
  try {
    const [pls, tracks] = await Promise.all([deezer.searchPlaylists(m.q, 18), deezer.search(m.q, 30)]);
    if (stale(s)) return;
    const c = await imageColor(pls[0]?.cover); setTint(c);
    const label = `Mood · ${m.name}`, href = `#/mood/${id}`;
    const k = registerList(tracks, { label, href });
    view().innerHTML = `<header class="poster mood-poster" style="--m1:${m.c[0]};--m2:${m.c[1]};--c:${rgb(c)}"><div class="poster-art"><div class="mood-orb"><span>${icons[m.icon]}</span></div></div><div class="poster-meta"><div class="eyebrow">Estado de ánimo</div><h1 class="title-xl">${esc(m.name)}</h1><p class="byline">${plural(pls.length, 'playlist', 'playlists')} · ${plural(tracks.length, 'canción', 'canciones')}</p></div></header>
      <div class="page-body">${actions({ listKey: k })}<div id="moodRadio"></div>${shelf('Playlists para este momento', pls)}<h2>Canciones</h2>${trackList(tracks, { label, href })}</div>`;
    bindActions(view(), { tracks, label, href });
    radio.byTag(m.tag, 16).then(st => { if (!stale(s) && st.length) $('#moodRadio').innerHTML = `<section class="shelf"><div class="shelf-head"><h2>Radio en directo para este momento</h2><a class="more" href="#/radio/${encodeURIComponent(m.tag)}">Ver todo</a></div>${stationCards(st, `Radio · ${m.name}`)}</section>`; }).catch(() => {});
  } catch { if (!stale(s)) view().innerHTML = errorState(); }
}

/* ======================= TOP / GÉNERO ======================= */
export async function top(genreId = 0) {
  const s = begin(); view().innerHTML = skeleton();
  try {
    const [tracks, g] = await Promise.all([deezer.chartTracks(genreId, 100), genreId ? deezer.genre(genreId) : Promise.resolve({ name: 'Global' })]);
    if (stale(s)) return;
    const c = await imageColor(tracks[0]?.cover); setTint(c);
    const label = `Top ${g.name}`, href = genreId ? `#/genero/${genreId}` : '#/top';
    const k = registerList(tracks, { label, href });
    view().innerHTML = poster({ c, art: mosaic(tracks, 'cover-art'), kind: 'Lista', title: label, meta: `Se actualiza a diario · ${plural(tracks.length, 'canción', 'canciones')}` })
      + `<div class="page-body">${actions({ listKey: k })}${trackList(tracks, { label, href })}</div>`;
    bindActions(view(), { tracks, label, href });
  } catch { if (!stale(s)) view().innerHTML = errorState(); }
}
export async function genre(id) {
  const s = begin(); view().innerHTML = skeleton(4);
  try {
    const [g, tracks, artists, albums] = await Promise.all([deezer.genre(id), deezer.chartTracks(id, 50), deezer.genreArtists(id), deezer.chartAlbums(id, 20).catch(() => [])]);
    if (stale(s)) return;
    const c = await imageColor(g.picture_medium); setTint(c);
    const label = `Lo mejor de ${g.name}`, href = `#/genero/${id}`;
    const k = registerList(tracks, { label, href });
    view().innerHTML = poster({ c, art: img(g.picture_xl || g.picture_big, 'cover-art round'), kind: 'Género', title: g.name })
      + `<div class="page-body">${actions({ listKey: k })}<h2>Suena ahora</h2>${trackList(tracks.slice(0, 20), { label, href })}${shelf('Artistas', artists)}${shelf('Álbumes populares', albums)}</div>`;
    bindActions(view(), { tracks, label, href });
  } catch { if (!stale(s)) view().innerHTML = errorState(); }
}

/* ======================= ARTISTA ======================= */
export async function artist(id) {
  const s = begin(); view().innerHTML = skeleton();
  try {
    const [a, topT, albums, related] = await Promise.all([deezer.artist(id), deezer.artistTop(id, 10), deezer.artistAlbums(id), deezer.artistRelated(id).catch(() => [])]);
    if (stale(s)) return;
    lib.pushVisited({ kind: 'artist', id: a.id, title: a.name, pic: a.pic });
    const c = await imageColor(a.pic); setTint(c);
    const label = a.name, href = `#/artista/${id}`;
    const k = registerList(topT, { label, href });
    const disc = albums.filter(x => x.type !== 'compile');
    const latest = [...albums].sort((x, y) => (y.year || '').localeCompare(x.year || ''))[0];
    const render = () => {
      const following = lib.isSaved('artist', a.id);
      view().innerHTML = `<header class="artist-hero" style="--c:${rgb(c)}"><div class="ah-photo"><img src="${esc(a.picXL)}" alt=""></div><div class="ah-meta"><div class="eyebrow">Artista</div><h1 class="title-xl">${esc(a.name)}</h1><p class="byline">${fmtNum(a.fans)} seguidores${a.albums ? ` · ${a.albums} lanzamientos` : ''}</p></div></header>
        <div class="page-body">${actions({ listKey: k, follow: following, extra: `<button class="pill ghost" id="artistRadio">${icons.radio} Radio</button>` })}
        <div class="artist-grid"><section><h2>Populares</h2><div id="popular">${trackList(topT.slice(0, 5), { label, href, album: false })}</div>${topT.length > 5 ? '<button class="linkbtn" id="morePop">Ver más</button>' : ''}</section>
        ${latest ? `<section><h2>Lo último</h2><a class="pickcard" href="#/album/${latest.id}">${sleeve(latest.cover)}<div><div class="tag">Nuevo</div><div class="ct">${esc(latest.title)}</div><div class="cs">${esc(latest.year)} · ${typeLabel(latest.type)}</div></div></a></section>` : ''}</div>
        <section class="shelf"><div class="shelf-head"><h2>Discografía</h2></div><div class="chips" id="discf">${[['all', 'Todo'], ['album', 'Álbumes'], ['single', 'Sencillos y EP']].map(([v, l], i) => `<button class="chip${i ? '' : ' on'}" data-f="${v}">${l}</button>`).join('')}</div><div class="hscroll" id="disc">${disc.map(al => card(al, { sub: `${al.year} · ${typeLabel(al.type)}` })).join('')}</div></section>
        ${shelf('Otros artistas en su órbita', related)}</div>`;
      bindActions(view(), { tracks: topT, label, href, onSave: () => { lib.toggleSaved('artist', { kind: 'artist', id: a.id, name: a.name, pic: a.pic }); render(); } });
      $('#morePop')?.addEventListener('click', e => { $('#popular').innerHTML = trackList(topT, { label, href, album: false }); e.target.remove(); });
      $('#discf').onclick = e => { const ch = e.target.closest('.chip'); if (!ch) return; $$('#discf .chip').forEach(x => x.classList.toggle('on', x === ch)); const f = ch.dataset.f; $('#disc').innerHTML = disc.filter(al => f === 'all' || (f === 'album' ? al.type === 'album' : al.type !== 'album')).map(al => card(al, { sub: `${al.year} · ${typeLabel(al.type)}` })).join(''); };
      $('#artistRadio').onclick = async () => { try { player.playList(await deezer.artistRadio(id), 0, { label: `Radio de ${a.name}`, href }); } catch { toast('No se pudo crear la radio'); } };
    };
    render();
  } catch { if (!stale(s)) view().innerHTML = errorState(); }
}

/* ======================= ÁLBUM ======================= */
export async function album(id) {
  const s = begin(); view().innerHTML = skeleton();
  try {
    const a = await deezer.album(id);
    if (stale(s)) return;
    lib.pushVisited({ kind: 'album', id: a.id, title: a.title, cover: a.cover });
    const c = await imageColor(a.cover); setTint(c);
    const label = a.title, href = `#/album/${id}`;
    const k = registerList(a.tracks, { label, href });
    const total = a.duration || a.tracks.reduce((x, t) => x + t.dur, 0);
    const render = () => {
      view().innerHTML = poster({ c, art: sleeve(a.coverXL, a.title), kind: typeLabel(a.type), title: a.title, cls: 'album-poster',
        meta: `<a href="#/artista/${a.artistId}"><b>${esc(a.artist)}</b></a> · ${esc(a.year)} · ${plural(a.tracks.length, 'canción', 'canciones')} · ${fmtLong(total)}` })
        + `<div class="page-body">${actions({ listKey: k, saveKind: 'album', saved: lib.isSaved('album', a.id) })}
        ${trackList(a.tracks, { label, href, album: false, cover: false })}
        <p class="fine">${a.date ? new Date(a.date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}${a.label ? '<br>℗ ' + esc(a.label) : ''}</p><div id="moreBy"></div></div>`;
      bindActions(view(), { tracks: a.tracks, label, href, onSave: () => { lib.toggleSaved('album', { ...a, kind: 'album' }); render(); } });
      deezer.artistAlbums(a.artistId).then(list => { if (!stale(s)) $('#moreBy').innerHTML = shelf(`Más de ${a.artist}`, list.filter(x => x.id !== a.id).slice(0, 14), { more: `#/artista/${a.artistId}` }); }).catch(() => {});
    };
    render();
  } catch { if (!stale(s)) view().innerHTML = errorState(); }
}

/* ======================= PLAYLIST PÚBLICA (Deezer) ======================= */
export async function dzplaylist(id) {
  const s = begin(); view().innerHTML = skeleton();
  try {
    const p = await deezer.playlist(id);
    if (stale(s)) return;
    lib.pushVisited({ kind: 'dzplaylist', id: p.id, title: p.title, cover: p.cover });
    const c = await imageColor(p.cover); setTint(c);
    const label = p.title, href = `#/lista/${id}`;
    const k = registerList(p.tracks, { label, href });
    const render = () => {
      view().innerHTML = poster({ c, art: img(p.coverXL, 'cover-art'), kind: 'Playlist', title: p.title, desc: p.description,
        meta: `<b>${esc(p.by)}</b> · ${p.fans ? fmtNum(p.fans) + ' guardados · ' : ''}${plural(p.tracks.length, 'canción', 'canciones')} · ${fmtLong(p.duration)}` })
        + `<div class="page-body">${actions({ listKey: k, saveKind: 'dzplaylist', saved: lib.isSaved('dzplaylist', p.id) })}${trackList(p.tracks, { label, href })}</div>`;
      bindActions(view(), { tracks: p.tracks, label, href, onSave: () => { lib.toggleSaved('dzplaylist', { ...p, kind: 'dzplaylist' }); render(); } });
    };
    render();
  } catch { if (!stale(s)) view().innerHTML = errorState(); }
}

/* ======================= PLAYLIST PROPIA ======================= */
export async function playlist(id) {
  const s = begin();
  const p = lib.playlist(id);
  if (!p) { view().innerHTML = `<div class="empty"><h3>Playlist no encontrada</h3><p>Puede que se haya eliminado en otro dispositivo.</p><a class="pill" href="#/biblioteca">Ir a tu biblioteca</a></div>`; return; }
  const c = await imageColor(p.tracks[0]?.cover); if (stale(s)) return; setTint(c);
  const label = p.name, href = `#/playlist/${id}`;
  const k = registerList(p.tracks, { label, href, playlistId: id });
  const total = p.tracks.reduce((x, t) => x + (t.dur || 0), 0);
  const who = cloud.profile?.display_name || 'Tú';
  view().innerHTML = poster({ c, art: `<button class="art-edit" id="editPl" title="Editar">${mosaic(p.tracks, 'cover-art')}</button>`, kind: p.isPublic ? 'Playlist pública' : 'Playlist', title: p.name, desc: p.desc,
    meta: `<b>${esc(who)}</b> · ${plural(p.tracks.length, 'canción', 'canciones')}${total ? ' · ' + fmtLong(total) : ''}` })
    + `<div class="page-body">${actions({ listKey: k })}
    ${p.tracks.length ? trackList(p.tracks, { label, href, playlistId: id, added: true, draggable: true }) : ''}
    <section class="recommend"><h2>${p.tracks.length ? 'Recomendadas para esta playlist' : 'Vamos a llenarla'}</h2>
      <div class="search-inline">${icons.music}<input id="plSearch" type="search" placeholder="Busca canciones para añadir" autocomplete="off"></div><div id="plRec"></div></section></div>`;
  bindActions(view(), { tracks: p.tracks, label, href, onMore: at => showMenu([
    { icon: icons.edit, text: 'Editar detalles', run: () => editPlaylist(p) },
    { icon: p.isPublic ? icons.lock : icons.globe, text: p.isPublic ? 'Hacer privada' : 'Hacer pública', run: () => { if (!cloud.signedIn) return toast('Inicia sesión para compartir playlists'); lib.updatePlaylist(id, { isPublic: !p.isPublic }); toast(p.isPublic ? 'Ahora cualquiera con el enlace puede verla' : 'Ahora es privada'); } },
    ...(p.isPublic ? [{ icon: icons.link, text: 'Copiar enlace para compartir', run: () => share(p.name, `#/p/${id}`) }] : []),
    { icon: icons.addq, text: 'Añadir a la cola', run: () => player.addToQueue(p.tracks) },
    '-', { icon: icons.trash, text: 'Eliminar playlist', run: async () => { if (await confirmBox('¿Eliminar playlist?', `Se eliminará «${p.name}» de todos tus dispositivos.`)) { lib.deletePlaylist(id); location.hash = '#/biblioteca'; } } }
  ], at) });
  $('#editPl').onclick = () => editPlaylist(p);
  const recBox = $('#plRec');
  const showAdd = tracks => {
    recBox.innerHTML = tracks.length ? `<div class="addlist">${tracks.slice(0, 10).map((t, i) => `<div class="add-row">${img(t.cover, 'tcover')}<div class="tt"><div class="tname ellipsis">${esc(t.title)}</div><div class="tart ellipsis">${esc(t.artist)}</div></div><button class="pill ghost sm" data-add="${i}">Añadir</button></div>`).join('')}</div>` : '';
    recBox.onclick = e => { const b = e.target.closest('[data-add]'); if (b) { lib.addToPlaylist(id, tracks[+b.dataset.add]); playlist(id); } };
  };
  $('#plSearch').oninput = debounce(async e => { const q = e.target.value.trim(); if (!q) return loadRec(); try { showAdd(await deezer.search(q, 10)); } catch { /* */ } }, 300);
  async function loadRec() {
    const seed = [...p.tracks].reverse().find(t => t.artistId);
    try { const rec = seed ? await deezer.artistRadio(seed.artistId) : await deezer.chartTracks(0, 20); if (!stale(s)) showAdd(rec.filter(t => !p.tracks.some(x => x.id === t.id))); } catch { /* offline */ }
  }
  loadRec();
  let from = null;
  $$('.tracks[data-list] .trow[draggable]', view()).forEach(row => {
    row.addEventListener('dragstart', () => { from = +row.dataset.i; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('dropover'); });
    row.addEventListener('dragleave', () => row.classList.remove('dropover'));
    row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('dropover'); if (from !== null && from !== +row.dataset.i) { lib.movePlaylistTrack(id, from, +row.dataset.i); playlist(id); } from = null; });
  });
}
function editPlaylist(p) {
  modal(`<h3>Editar playlist</h3><div class="edit-grid">${mosaic(p.tracks, 'edit-art')}<div><input class="field" id="epName" maxlength="100" value="${esc(p.name)}" placeholder="Nombre"><textarea class="field" id="epDesc" maxlength="300" placeholder="Descripción (opcional)">${esc(p.desc || '')}</textarea></div></div><div class="acts"><button class="pill ghost" data-close>Cancelar</button><button class="pill primary" data-ok>Guardar</button></div>`, (el, close) => {
    el.querySelector('[data-ok]').onclick = () => { lib.updatePlaylist(p.id, { name: el.querySelector('#epName').value.trim() || p.name, desc: el.querySelector('#epDesc').value.trim() }); close(); playlist(p.id); };
  });
}

/* shared public playlist from another user */
export async function shared(id) {
  const s = begin(); view().innerHTML = skeleton();
  if (lib.playlist(id)) { location.replace('#/playlist/' + id); return; }
  try {
    const p = await cloud.publicPlaylist(id);
    if (stale(s)) return;
    if (!p) { view().innerHTML = '<div class="empty"><h3>Esta playlist es privada o no existe</h3></div>'; return; }
    const c = await imageColor(p.tracks[0]?.cover); setTint(c);
    const label = p.name, href = `#/p/${id}`;
    const k = registerList(p.tracks, { label, href });
    view().innerHTML = poster({ c, art: mosaic(p.tracks, 'cover-art'), kind: 'Playlist compartida', title: p.name, desc: p.desc, meta: plural(p.tracks.length, 'canción', 'canciones') })
      + `<div class="page-body">${actions({ listKey: k, extra: '<button class="pill ghost" id="copyPl">Guardar una copia</button>' })}${trackList(p.tracks, { label, href })}</div>`;
    bindActions(view(), { tracks: p.tracks, label, href });
    $('#copyPl').onclick = () => { const n = lib.createPlaylist(p.name, p.tracks, p.desc); toast('Copia guardada en tu biblioteca'); location.hash = '#/playlist/' + n.id; };
  } catch { if (!stale(s)) view().innerHTML = errorState(); }
}

export function liked() {
  begin(); setTint([110, 70, 240]);
  const label = 'Me gusta', href = '#/megusta';
  const songs = lib.songs;
  const k = registerList(songs, { label, href });
  view().innerHTML = poster({ c: [110, 70, 240], art: `<div class="cover-art liked-art">${icons.heartOn}</div>`, kind: 'Playlist', title: 'Me gusta', meta: `<b>${esc(cloud.profile?.display_name || 'Tú')}</b> · ${plural(songs.length, 'canción', 'canciones')}` })
    + `<div class="page-body">${actions({ listKey: k })}${songs.length ? trackList(songs, { label, href, added: true }) : `<div class="empty"><div class="empty-ico">${icons.heart}</div><h3>Aquí vivirán tus favoritas</h3><p>Toca el corazón de cualquier canción para guardarla.</p><a class="pill primary" href="#/explorar">Explorar música</a></div>`}</div>`;
  bindActions(view(), { tracks: songs, label, href });
}

/* ======================= BIBLIOTECA ======================= */
let libFilter = store.get('libFilter', 'all'), libSort = store.get('libSort', 'recent');
export function library() {
  begin(); setTint([60, 50, 110]);
  const items = [
    { kind: 'liked', id: 'liked', title: 'Me gusta', sub: plural(lib.songs.length, 'canción', 'canciones'), added: Infinity, pin: 1 },
    ...lib.playlists.map(p => ({ ...p, kind: 'playlist', title: p.name, sub: `Playlist${p.isPublic ? ' pública' : ''} · ${p.tracks.length}`, added: p.created })),
    ...lib.dzplaylists.map(p => ({ ...p, kind: 'dzplaylist', sub: `Playlist · ${p.by}` })),
    ...lib.albums.map(a => ({ ...a, kind: 'album', sub: `Álbum · ${a.artist}` })),
    ...lib.artists.map(a => ({ ...a, kind: 'artist', title: a.name, sub: 'Artista' }))
  ];
  const f = { all: () => true, playlists: i => ['liked', 'playlist', 'dzplaylist'].includes(i.kind), artists: i => i.kind === 'artist', albums: i => i.kind === 'album', files: () => false, radio: () => false }[libFilter] || (() => true);
  const sorted = items.filter(f).sort((a, b) => (b.pin || 0) - (a.pin || 0) || (libSort === 'alpha' ? (a.title || '').localeCompare(b.title || '') : (b.added || 0) - (a.added || 0)));
  view().innerHTML = `<div class="lib-head"><h1>Tu biblioteca</h1><div class="lib-actions"><button class="pill primary" id="newPl">${icons.plus} Nueva playlist</button><button class="pill ghost" id="importBtn">Importar archivos</button></div></div>
    ${cloud.signedIn ? '' : `<a class="cta slim" href="#/cuenta"><div><b>Guárdalo todo en tu cuenta</b><p>Inicia sesión para sincronizar tu biblioteca entre dispositivos.</p></div><span class="pill primary">Entrar</span></a>`}
    <div class="chips"><span class="chips-l">${[['all', 'Todo'], ['playlists', 'Playlists'], ['albums', 'Álbumes'], ['artists', 'Artistas'], ['radio', 'Radio'], ['uploads', 'Subidas'], ['files', 'Archivos']].map(([v, l]) => `<button class="chip${v === libFilter ? ' on' : ''}" data-lf="${v}">${l}</button>`).join('')}</span>
      <button class="chip ghost" id="libSort">${icons.sort}${libSort === 'alpha' ? 'A-Z' : 'Recientes'}</button></div>
    ${(libFilter === 'all' || libFilter === 'radio') && lib.stations.length ? `<section class="shelf"><div class="shelf-head"><h2>Tus emisoras</h2><a class="more" href="#/radio">Más radio</a></div>${stationCards(lib.stations, 'Tus emisoras', { wrap: libFilter === 'radio' })}</section>` : ''}
    ${libFilter === 'radio' && !lib.stations.length ? `<div class="empty"><h3>Aún no tienes emisoras</h3><p>Guarda tus favoritas con el corazón y aparecerán aquí.</p><a class="pill primary" href="#/radio">Descubrir radio</a></div>` : ''}
    ${libFilter === 'all' || libFilter === 'uploads' ? `<section class="shelf uploads-shelf" id="upShelf"></section>` : ''}
    ${!['files', 'radio', 'uploads'].includes(libFilter) ? `<div class="cgrid lib-grid">${sorted.map(i => card(i, { sub: i.sub })).join('')}</div>` : ''}
    ${(libFilter === 'all' || libFilter === 'files') ? `<section class="shelf"><div class="shelf-head"><h2>Archivos de este dispositivo</h2></div>${lib.local.length ? trackList(lib.local, { label: 'Archivos locales', href: '#/biblioteca' }) : `<button class="dropzone" id="dropzone">${icons.music}<div><b>Suelta aquí tu música</b><br><span class="muted">MP3, M4A, FLAC, WAV, OGG… Suena completa y sin conexión.</span></div></button>`}</section>` : ''}`;
  $('#newPl').onclick = async () => { const n = await prompt('Nueva playlist', '', 'Crear'); if (n !== null) location.hash = '#/playlist/' + lib.createPlaylist(n).id; };
  $('#importBtn').onclick = () => $('#filePicker').click();
  $('#dropzone')?.addEventListener('click', () => $('#filePicker').click());
  $$('[data-lf]', view()).forEach(b => b.onclick = () => { libFilter = b.dataset.lf; store.set('libFilter', libFilter); library(); });
  $('#libSort').onclick = () => { libSort = libSort === 'alpha' ? 'recent' : 'alpha'; store.set('libSort', libSort); library(); };
  const up = $('#upShelf'); if (!up) return;
  const canUp = cloud.signedIn && (cloud.isAdmin || cloud.profile?.plan === 'ultra');
  if (!canUp) {
    up.innerHTML = libFilter === 'uploads' || cloud.signedIn ? `<a class="locked-teaser tier-ultra" href="#/planes" data-tilt><div class="lt-gem">${icons.prism}</div><div><div class="eyebrow">${icons.lock} Ultra</div><b>Sube tus propias canciones</b><p class="muted small">Con Ultra subes audios y canciones, y decides si son públicas para la comunidad o solo para ti.</p></div><span class="pill ghost">Ver planes</span></a>` : '';
    return;
  }
  up.innerHTML = `<div class="shelf-head"><h2>Tus subidas</h2><button class="pill primary sm" id="upBtn">${icons.upload} Subir canción</button></div><div id="upList">${skeleton(3)}</div>`;
  const list = $('#upList');
  $('#upBtn').onclick = () => uploadModal(() => renderMyUploads(list));
  renderMyUploads(list);
}
addEventListener('uploads', () => { const l = $('#upList'); if (l) renderMyUploads(l); });

/* ======================= COLA ======================= */
export function queue() {
  begin(); setTint([60, 50, 110]);
  const cur = player.current, man = player.manual, up = player.upcoming;
  view().innerHTML = `<h1>Cola</h1>
    ${cur ? `<h2 class="qh">Sonando</h2>${trackList([cur], { label: player.ctx.label, href: player.ctx.href, numbers: false, flag: 'data-now="1"' })}` : `<div class="empty"><h3>La cola está vacía</h3><p>Busca música y usa «Añadir a la cola».</p><a class="pill primary" href="#/explorar">Explorar</a></div>`}
    ${man.length ? `<div class="qhead"><h2 class="qh">Siguiente en tu cola</h2><button class="linkbtn" id="clearQ">Vaciar</button></div>${trackList(man, { numbers: false, flag: 'data-manual="1"' })}` : ''}
    ${up.length ? `<h2 class="qh">Después, de <a href="${esc(player.ctx.href || '#/cola')}">${esc(player.ctx.label || 'tu selección')}</a></h2>${trackList(up.slice(0, 80), { numbers: false, flag: 'data-upcoming="1"' })}` : ''}`;
  $('#clearQ')?.addEventListener('click', () => player.clearManual());
}

/* ======================= CUENTA (acceso / registro) ======================= */
export function account(mode = 'entrar') {
  begin(); setTint([110, 60, 200]);
  if (cloud.signedIn) { location.replace('#/perfil'); return; }
  view().innerHTML = `<div class="auth">
    <div class="auth-art"><div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
      <div class="auth-copy"><img src="icons/icon.svg" alt="" width="56" height="56"><h1>Tu música,<br>en órbita.</h1>
      <ul><li>Miles de emisoras en directo y música completa</li><li>Tu biblioteca sincronizada en todos tus dispositivos</li><li>Playlists para compartir con un enlace</li><li>Temas, letras y mucho más</li></ul></div></div>
    <div class="auth-card">
      <div class="seg" role="tablist"><button data-m="entrar" class="${mode === 'entrar' ? 'on' : ''}">Entrar</button><button data-m="registro" class="${mode === 'registro' ? 'on' : ''}">Crear cuenta</button></div>
      <form id="authForm" novalidate>
        <label class="fl" data-only="registro"><span>Nombre</span><input class="field" name="name" autocomplete="nickname" maxlength="60" placeholder="¿Cómo te llamamos?"></label>
        <label class="fl"><span>Correo</span><input class="field" name="email" type="email" autocomplete="email" required placeholder="tu@correo.com"></label>
        <label class="fl" data-hide="recuperar"><span>Contraseña</span><div class="pw"><input class="field" name="password" type="password" autocomplete="current-password" minlength="8" placeholder="Mínimo 8 caracteres"><button type="button" class="pw-eye" aria-label="Mostrar contraseña">${icons.eye}</button></div></label>
        <div class="pw-meter" data-only="registro"><i></i></div>
        <p class="form-msg" id="authMsg" role="alert"></p>
        <button class="pill primary block" type="submit" id="authSubmit"></button>
        <button class="linkbtn" type="button" id="forgot" data-only="entrar">¿Olvidaste tu contraseña?</button>
        <button class="linkbtn" type="button" id="backLogin" data-only="recuperar">Volver a entrar</button>
      </form>
      <p class="fine center">Puedes seguir explorando sin cuenta: escucharás vistas previas de 30 s.</p>
    </div></div>`;
  const form = $('#authForm'), msg = $('#authMsg');
  const setMode = m => {
    mode = m;
    $$('.seg button', view()).forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $$('[data-only]', form).forEach(el => { el.hidden = el.dataset.only !== m; });
    $$('[data-hide]', form).forEach(el => { el.hidden = el.dataset.hide === m; });
    form.password.autocomplete = m === 'registro' ? 'new-password' : 'current-password';
    $('#authSubmit').textContent = { entrar: 'Entrar', registro: 'Crear cuenta', recuperar: 'Enviar enlace de recuperación' }[m];
    msg.textContent = ''; msg.className = 'form-msg';
    history.replaceState(null, '', '#/cuenta' + (m === 'registro' ? '/registro' : ''));
  };
  $$('.seg button', view()).forEach(b => b.onclick = () => setMode(b.dataset.m));
  $('#forgot').onclick = () => setMode('recuperar');
  $('#backLogin').onclick = () => setMode('entrar');
  $('.pw-eye', form).onclick = () => { form.password.type = form.password.type === 'password' ? 'text' : 'password'; };
  form.password.oninput = () => {
    const v = form.password.value; let sc = 0;
    if (v.length >= 8) sc++; if (v.length >= 12) sc++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) sc++; if (/\d/.test(v)) sc++; if (/[^A-Za-z0-9]/.test(v)) sc++;
    $('.pw-meter i', form).style.width = (sc / 5 * 100) + '%'; $('.pw-meter', form).dataset.s = sc;
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const email = form.email.value.trim(), pw = form.password.value, name = form.name.value.trim();
    const fail = t => { msg.textContent = t; msg.className = 'form-msg err'; };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Escribe un correo válido.');
    if (mode !== 'recuperar' && pw.length < (mode === 'registro' ? 8 : 6)) return fail(mode === 'registro' ? 'La contraseña debe tener al menos 8 caracteres.' : 'Escribe tu contraseña.');
    const btn = $('#authSubmit'); btn.disabled = true; btn.classList.add('busy');
    try {
      if (mode === 'entrar') { await cloud.signIn(email, pw); toast('¡Hola de nuevo!'); location.hash = store.get('afterLogin', '#/inicio'); store.del('afterLogin'); }
      else if (mode === 'registro') {
        const r = await cloud.signUp(email, pw, name || email.split('@')[0]);
        if (r.needsConfirm) { setMode('entrar'); form.email.value = email; msg.className = 'form-msg ok'; msg.textContent = 'Te hemos enviado un correo para confirmar tu cuenta. Ábrelo y después entra aquí.'; }
        else { toast('¡Bienvenido a Listentoo!'); location.hash = '#/inicio'; }
      } else { await cloud.resetPassword(email); msg.className = 'form-msg ok'; msg.textContent = 'Si existe una cuenta con ese correo, recibirás un enlace para crear una nueva contraseña.'; }
    } catch (err) { fail(err.message); }
    finally { btn.disabled = false; btn.classList.remove('busy'); }
  };
  setMode(mode);
}

/* ======================= PERFIL ======================= */
const meter = (frac, big, small, cls = '') => `<div class="meter ${cls}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="m-track" cx="60" cy="60" r="52"/><circle class="m-fill" cx="60" cy="60" r="52" style="stroke-dashoffset:${(326.7 * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1)}"/></svg><div class="m-txt"><b>${big}</b><small>${small}</small></div></div>`;
export function usageMeters() {
  const st = quota.state, lim = st.limits;
  const hrs = quota.unlimitedTime ? meter(1, icons.infinity, 'escucha ilimitada', 'inf') : meter(quota.secondsLeft / lim.seconds, fmtSecs(quota.secondsLeft), 'de escucha hoy');
  const sk = quota.unlimitedSkips ? meter(1, icons.infinity, 'saltos ilimitados', 'inf') : meter(quota.skipsLeft / lim.skips, String(quota.skipsLeft), quota.skipsLeft === 1 ? 'salto restante' : 'saltos restantes');
  const reset = (quota.unlimitedTime && quota.unlimitedSkips) ? '' : meter(1 - quota.resetsIn / 864e5, fmtLeft(quota.resetsIn), 'para renovarse', 'clock');
  return hrs + sk + reset;
}
export function usageChip() {
  if (cloud.isAdmin || (quota.unlimitedTime && quota.unlimitedSkips)) return '<span id="usageChip" hidden></span>';
  const parts = [];
  if (!quota.unlimitedTime) parts.push(`<b>${fmtSecs(quota.secondsLeft)}</b> de escucha`);
  if (!quota.unlimitedSkips) parts.push(`<b>${quota.skipsLeft}</b> ${quota.skipsLeft === 1 ? 'salto' : 'saltos'}`);
  const frac = quota.unlimitedTime ? quota.skipsLeft / quota.state.limits.skips : quota.secondsLeft / quota.state.limits.seconds;
  return `<a class="usage-chip${frac < 0.15 ? ' low' : ''}" id="usageChip" href="#/planes" style="--f:${Math.max(0, Math.min(1, frac)).toFixed(3)}"><i class="uc-ring"></i><span>${parts.join(' · ')} hoy</span>${icons.next2}</a>`;
}
async function squareImage(file, size = 512) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise(res => c.toBlob(b => res(b), 'image/webp', 0.86));
}

export async function profile() {
  const s = begin(); setTint([90, 60, 180]);
  if (!cloud.signedIn) { store.set('afterLogin', '#/perfil'); location.replace('#/cuenta'); return; }
  const pr = cloud.profile || {}, email = cloud.user.email, plan = pr.plan || 'free', admin = cloud.isAdmin;
  const P = PLANS[admin ? 'ultra' : plan] || PLANS.free, tier = admin ? 'ultra' : plan;
  const canPhoto = admin || P.photo;
  view().innerHTML = `<header class="profile-hero tier-${tier}">
      <div class="pf-av">${avatarOf(cloud.card, 'xl')}${canPhoto ? `<button class="pf-cam" id="pfPhoto" title="Cambiar foto" aria-label="Cambiar foto">${icons.camera}</button><input type="file" id="pfPhotoFile" accept="image/*" hidden>` : ''}</div>
      <div class="pf-meta"><div class="eyebrow">Perfil</div><h1 class="title-xl">${esc(pr.display_name || email.split('@')[0])}</h1>
      <div class="pf-badges">${planChip(plan, admin)}<span class="byline">${esc(email)}</span></div>
      <div class="stats-row"><span><b>${lib.songs.length}</b> me gusta</span><span><b>${lib.stations.length}</b> emisoras</span><span><b>${lib.playlists.length}</b> playlists</span><span><b>${lib.artists.length}</b> artistas</span><span id="playsCount"><b>…</b> escuchas</span></div></div></header>
    <div class="page-body">
      <section class="plan-panel tier-${tier}" data-tilt>
        <div class="pp-head"><div class="pp-emblem">${icons[admin ? 'crown' : (PLANS_UI[plan]?.icon || 'wave')]}</div><div><div class="eyebrow">Tu plan</div><h2>${admin ? 'Administrador' : P.name}</h2><p class="muted">${admin ? 'Todas las funciones, sin límites' : esc(P.tagline)}</p></div>
          <a class="pill ${plan === 'ultra' || admin ? 'ghost' : 'primary'}" href="#/planes">${plan === 'ultra' || admin ? 'Ver planes' : 'Mejorar plan'}</a></div>
        <div class="meters" id="pfMeters">${usageMeters()}</div><p class="muted small" id="pfReq"></p>
      </section>
      <section class="panel-grid">
        <div class="glass-card"><h3>Tus artistas del mes</h3><div id="topArtists" class="rank"><div class="sk sk-t"></div></div></div>
        <div class="glass-card"><h3>Cuenta</h3>
          <label class="fl"><span>Nombre visible</span><div class="row"><input class="field" id="pfName" maxlength="60" value="${esc(pr.display_name || '')}"><button class="pill" id="pfSave">Guardar</button></div></label>
          <label class="fl"><span>Color del avatar</span><input type="range" id="pfHue" min="0" max="360" value="${pr.avatar_hue ?? 275}" class="hue"></label>
          ${canPhoto ? `<div class="row-btns"><button class="pill ghost" id="pfPhoto2">${icons.camera} Subir foto</button>${pr.avatar_url ? '<button class="pill ghost" id="pfPhotoDel">Quitar foto</button>' : ''}</div>` : `<p class="muted small">La foto de perfil está incluida en Max y Ultra.</p>`}
          <div class="row-btns"><button class="pill ghost" id="pfPw">Cambiar contraseña</button><a class="pill ghost" href="#/temas">Temas</a>${admin ? '<a class="pill ghost" href="#/admin">Panel de admin</a>' : ''}</div></div>
        <div class="glass-card"><h3>Reproducción</h3>
          <label class="switch"><span><b>Reproducción automática</b><small>Al terminar, sigue con canciones parecidas.</small></span><input type="checkbox" id="pfAuto" ${lib.settings.autoplay ? 'checked' : ''}><i></i></label>
          <label class="switch"><span><b>Canciones completas vía YouTube</b><small>Usa el reproductor oficial, aislado: nunca abre pestañas ni ventanas.</small></span><input type="checkbox" id="pfYt" ${lib.settings.youtube !== false ? 'checked' : ''}><i></i></label>
          <label class="switch"><span><b>Notificaciones de canción</b><small>Aviso con controles al cambiar de canción cuando la app está en segundo plano.</small></span><input type="checkbox" id="pfNotify" ${lib.settings.notify ? 'checked' : ''}><i></i></label></div>
        <div class="glass-card"><h3>Datos</h3><p class="muted small">Tu biblioteca se guarda en tu cuenta y se sincroniza en tiempo real.</p>
          <div class="row-btns"><button class="pill ghost" id="pfExp">Exportar copia</button><button class="pill ghost" id="pfImp">Importar copia</button><button class="pill ghost" id="pfHist">Borrar historial</button></div>
          <input type="file" id="pfImpFile" accept="application/json" hidden></div>
      </section>
      <div class="danger-zone"><button class="pill ghost" id="pfOut">Cerrar sesión</button><button class="linkbtn danger-t" id="pfDel">Eliminar mi cuenta</button></div>
    </div>`;
  quota.refresh();
  cloud.myRequest().then(r => { if (!stale(s) && r) $('#pfReq').innerHTML = `Solicitud de plan <b>${esc(PLANS[r.plan]?.name || r.plan)}</b> pendiente de aprobación.`; }).catch(() => {});
  cloud.stats().then(plays => {
    if (stale(s)) return;
    $('#playsCount').innerHTML = `<b>${plays.length >= 1000 ? '1000+' : plays.length}</b> escuchas`;
    const monthAgo = Date.now() - 30 * 864e5, cnt = {};
    plays.filter(p => Date.parse(p.played_at) > monthAgo).forEach(p => { cnt[p.artist] = { n: (cnt[p.artist]?.n || 0) + 1, cover: cnt[p.artist]?.cover || p.cover }; });
    const top = Object.entries(cnt).sort((a, b) => b[1].n - a[1].n).slice(0, 5);
    $('#topArtists').innerHTML = top.length ? top.map(([a, v], i) => `<div class="rank-row"><span class="rk">${String(i + 1).padStart(2, '0')}</span>${img(v.cover)}<b class="ellipsis">${esc(a)}</b><span class="muted">${plural(v.n, 'escucha', 'escuchas')}</span></div>`).join('') : '<p class="muted small">Escucha música y aquí aparecerá tu ranking.</p>';
  }).catch(() => {});
  const pick = () => $('#pfPhotoFile')?.click();
  $('#pfPhoto')?.addEventListener('click', pick); $('#pfPhoto2')?.addEventListener('click', pick);
  $('#pfPhotoFile')?.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { toast('Subiendo foto…'); await cloud.uploadAvatar(await squareImage(f)); toast('Foto actualizada'); profile(); } catch (err) { toast(err.message); }
  });
  $('#pfPhotoDel')?.addEventListener('click', async () => { await cloud.removeAvatar().catch(e => toast(e.message)); profile(); });
  $('#pfSave').onclick = async () => { try { await cloud.updateProfile({ display_name: $('#pfName').value.trim().slice(0, 60) || null }); toast('Perfil actualizado'); profile(); } catch (e) { toast(e.message); } };
  const hue = $('#pfHue'); hue.oninput = () => $$('.pf-av .av', view()).forEach(a => a.style.setProperty('--h', hue.value));
  hue.onchange = () => cloud.updateProfile({ avatar_hue: +hue.value }).catch(e => toast(e.message));
  $('#pfPw').onclick = () => changePassword();
  $('#pfAuto').onchange = e => lib.setSetting('autoplay', e.target.checked);
  $('#pfYt').onchange = e => lib.setSetting('youtube', e.target.checked);
  $('#pfNotify').onchange = async e => {
    if (e.target.checked) {
      if (!('Notification' in window)) { toast('Este dispositivo no admite notificaciones web'); e.target.checked = false; return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Permiso de notificaciones denegado'); e.target.checked = false; return; }
    }
    lib.setSetting('notify', e.target.checked);
  };
  $('#pfExp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lib.export()], { type: 'application/json' })); a.download = `listentoo-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#pfImp').onclick = () => $('#pfImpFile').click();
  $('#pfImpFile').onchange = async e => { try { lib.import(await e.target.files[0].text()); toast('Copia importada'); } catch (err) { toast(err.message || 'Archivo no válido'); } };
  $('#pfHist').onclick = async () => { if (await confirmBox('¿Borrar historial?', 'Se borrará tu historial de escucha en todos tus dispositivos.', 'Borrar')) { await cloud.clearHistory(); lib.replaceAll({ recent: [] }); toast('Historial borrado'); profile(); } };
  $('#pfOut').onclick = async () => { await cloud.signOut(); toast('Has cerrado sesión'); location.hash = '#/inicio'; };
  $('#pfDel').onclick = async () => {
    if (!await confirmBox('¿Eliminar tu cuenta?', 'Se borrarán para siempre tu perfil, tu biblioteca, tus playlists y tu historial. No se puede deshacer.', 'Eliminar cuenta')) return;
    try { await cloud.deleteAccount(); toast('Tu cuenta se ha eliminado'); location.hash = '#/inicio'; } catch (e) { toast(e.message); }
  };
}
export function changePassword(recovery = false) {
  modal(`<h3>${recovery ? 'Crea una nueva contraseña' : 'Cambiar contraseña'}</h3><label class="fl"><span>Nueva contraseña</span><input class="field" id="np1" type="password" autocomplete="new-password" minlength="8" placeholder="Mínimo 8 caracteres"></label><label class="fl"><span>Repítela</span><input class="field" id="np2" type="password" autocomplete="new-password"></label><p class="form-msg" id="npMsg"></p><div class="acts"><button class="pill ghost" data-close>Cancelar</button><button class="pill primary" data-ok>Guardar</button></div>`, (el, close) => {
    el.querySelector('#np1').focus();
    el.querySelector('[data-ok]').onclick = async () => {
      const a = el.querySelector('#np1').value, b = el.querySelector('#np2').value, m = el.querySelector('#npMsg');
      if (a.length < 8) { m.textContent = 'Mínimo 8 caracteres.'; m.className = 'form-msg err'; return; }
      if (a !== b) { m.textContent = 'Las contraseñas no coinciden.'; m.className = 'form-msg err'; return; }
      try { await cloud.updatePassword(a); close(); toast('Contraseña actualizada'); } catch (e) { m.textContent = e.message; m.className = 'form-msg err'; }
    };
  });
}

/* ======================= TEMAS ======================= */
export function themes() {
  begin(); setTint([90, 60, 180]);
  const s = lib.settings;
  const swatch = (id, t) => {
    const r = id === 'sistema' ? null : t;
    const style = r ? `--pb:${r.bg};--pi:${r.ink};--ps:${r.sub};--pa:${r.accent};--p1:${r.aur[0]};--p2:${r.aur[1]};--p3:${r.aur[2]}` : '';
    return `<button data-tilt class="theme-card${s.theme === id ? ' on' : ''}${id === 'sistema' ? ' sys' : ''}" data-theme="${id}" style="${style}">
      <div class="tc-prev"><i class="tb1"></i><i class="tb2"></i><i class="tb3"></i><div class="tc-ui"><span class="tc-isle"></span><span class="tc-line l1"></span><span class="tc-line l2"></span><span class="tc-cards"><b></b><b></b><b></b></span><span class="tc-dock"></span></div></div>
      <div class="tc-name">${esc(t.name)}${s.theme === id ? ` ${icons.check}` : ''}</div><small>${id === 'sistema' ? 'Claro u oscuro según tu dispositivo' : t.mode === 'light' ? 'Claro' : 'Oscuro'}</small></button>`;
  };
  view().innerHTML = `<h1>Temas</h1><p class="muted lead">Elige cómo se ve Listentoo. Se aplica en la app instalada y en la web${cloud.signedIn ? ', y se sincroniza con tu cuenta' : ''}.</p>
    <div class="theme-grid">${Object.entries(THEMES).map(([id, t]) => swatch(id, t)).join('')}</div>
    <section class="glass-card opts"><h3>Ajustes visuales</h3>
      <label class="switch"><span><b>Color dinámico</b><small>El fondo y el acento toman el color de la portada que suena.</small></span><input type="checkbox" data-opt="dynamic" ${s.dynamic ? 'checked' : ''}><i></i></label>
      <label class="switch"><span><b>Efectos 3D</b><small>Nebulosa en tiempo real, tarjetas con relieve y transiciones. Se apaga sola en equipos modestos.</small></span><input type="checkbox" data-opt="effects" ${s.effects !== false ? 'checked' : ''}><i></i></label>
      <label class="switch"><span><b>Vinilo girando</b><small>La portada gira en el reproductor mientras suena.</small></span><input type="checkbox" data-opt="spin" ${s.spin ? 'checked' : ''}><i></i></label>
    </section>`;
  $$('.theme-card', view()).forEach(b => b.onclick = () => { lib.setSetting('theme', b.dataset.theme); applyTheme(); themes(); });
  $$('[data-opt]', view()).forEach(i => i.onchange = () => { if (i.dataset.opt === 'effects' && i.checked) fx.reset(); lib.setSetting(i.dataset.opt, i.checked); applyTheme(); });
  void resolveTheme;
}

/* ======================= PLANES ======================= */
export async function plansPage() {
  const s = begin(); setTint([150, 110, 40]);
  const cur = cloud.signedIn ? (cloud.isAdmin ? 'admin' : cloud.profile?.plan || 'free') : null;
  const yes = `<i class="f-yes">${icons.check}</i>`, no = `<i class="f-no">${icons.close}</i>`;
  const row = (label, v) => `<li><span>${label}</span><b>${v}</b></li>`;
  const card = p => {
    const ui = PLANS_UI[p.id];
    const time = p.seconds ? `${p.seconds / 3600} h al día` : 'Ilimitada';
    const skips = p.skips == null ? 'Ilimitados' : `${p.skips} al día`;
    return `<article class="plan-card tier-${p.id}${cur === p.id ? ' current' : ''}" data-tilt data-plan="${p.id}">
      <div class="pc-shine"></div>
      <header><div class="pc-emblem">${icons[ui.icon]}</div><div><h2>${p.name}</h2><p>${esc(p.tagline)}</p></div></header>
      <div class="pc-frame">${avatarOf({ name: cloud.profile?.display_name || 'Tú', hue: cloud.profile?.avatar_hue ?? 275, url: cloud.profile?.avatar_url || '', plan: p.id }, 'lg')}<small>${p.frame}</small></div>
      <ul class="pc-feats">
        ${row('Escucha', time)}${row('Saltos', skips)}${row('Sin anuncios', yes)}
        ${row('Foto de perfil', p.photo ? yes : no)}${row('Sube tus canciones', p.upload ? yes : no)}
      </ul>
      <div class="pc-cta" data-cta="${p.id}"></div>
    </article>`;
  };
  view().innerHTML = `<header class="plans-hero"><div class="eyebrow">Planes</div><h1 class="title-xl">Elige tu órbita</h1>
      <p class="muted lead">Todos los planes son sin anuncios. El tiempo y los saltos se renuevan cada 24 horas desde que empiezas a escuchar.${cloud.signedIn ? '' : ' Crea una cuenta para solicitar un plan.'}</p>
      ${cloud.signedIn && !cloud.isAdmin ? `<div class="meters mini">${usageMeters()}</div>` : ''}</header>
    <div class="plan-grid">${Object.values(PLANS).map(card).join('')}</div>
    <p class="fine center">Las mejoras de plan las aprueba la administración. Recibirás el cambio en todos tus dispositivos al instante.</p>`;
  let req = null;
  try { req = cloud.signedIn ? await cloud.myRequest() : null; } catch { /* offline */ }
  if (stale(s)) return;
  const order = ['free', 'pro', 'max', 'ultra'];
  $$('[data-cta]', view()).forEach(box => {
    const id = box.dataset.cta;
    if (!cloud.signedIn) { box.innerHTML = `<a class="pill primary block" href="#/cuenta/registro">Crear cuenta</a>`; return; }
    if (cur === 'admin') { box.innerHTML = `<span class="pc-note">${icons.crown} Incluido como administrador</span>`; return; }
    if (cur === id) { box.innerHTML = `<span class="pc-note">${icons.check} Tu plan actual</span>`; return; }
    if (id === 'free') { box.innerHTML = `<span class="pc-note muted">Plan básico</span>`; return; }
    if (req?.plan === id) { box.innerHTML = `<button class="pill ghost block" data-cancel="${req.id}">Solicitud enviada · cancelar</button>`; return; }
    box.innerHTML = `<button class="pill ${order.indexOf(id) > order.indexOf(cur) ? 'primary' : 'ghost'} block" data-req="${id}" data-magnet>Solicitar ${PLANS[id].name}</button>`;
  });
  view().onclick = async e => {
    const b = e.target.closest('[data-req]'), c = e.target.closest('[data-cancel]');
    if (c) { try { await cloud.cancelRequest(+c.dataset.cancel); toast('Solicitud cancelada'); plansPage(); } catch (err) { toast(err.message); } return; }
    if (!b) return;
    const id = b.dataset.req;
    modal(`<h3>Solicitar plan ${PLANS[id].name}</h3><p class="muted">La administración revisará tu solicitud y activará el plan en tu cuenta.</p><textarea class="field" id="reqNote" maxlength="300" placeholder="Mensaje opcional"></textarea><div class="acts"><button class="pill ghost" data-close>Cancelar</button><button class="pill primary" data-ok>Enviar solicitud</button></div>`, (el, close) => {
      el.querySelector('[data-ok]').onclick = async () => {
        try { await cloud.requestPlan(id, el.querySelector('#reqNote').value.trim()); close(); const r = b.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, { n: 22 }); toast('Solicitud enviada'); plansPage(); }
        catch (err) { toast(err.message); }
      };
    });
  };
}

/* ======================= ADMIN ======================= */
export async function admin() {
  const s = begin(); setTint([200, 60, 120]);
  if (!cloud.signedIn) { store.set('afterLogin', '#/admin'); location.replace('#/cuenta'); return; }
  if (!cloud.isAdmin) { view().innerHTML = '<div class="empty"><h3>Acceso restringido</h3><p>Esta sección es solo para la administración.</p></div>'; return; }
  view().innerHTML = `<div class="lib-head"><div><div class="eyebrow">${icons.crown} Administración</div><h1>Panel de control</h1></div><button class="pill ghost" id="admRefresh">Actualizar</button></div><div id="adm">${skeleton(4)}</div>`;
  $('#admRefresh').onclick = () => admin();
  try {
    const [o, users, ann, reqs] = await Promise.all([cloud.admin.overview(), cloud.admin.users(), cloud.admin.getAnnouncement(), cloud.admin.requests().catch(() => [])]);
    if (stale(s)) return;
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    const card = u => ({ name: u.display_name || u.email, hue: u.avatar_hue, url: u.avatar_url, plan: u.plan, admin: u.is_admin });
    const max = Math.max(1, ...o.daily.map(d => d.n));
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return { d, n: o.daily.find(x => x.day === d)?.n || 0 }; });
    const kpi = (v, l) => `<div class="kpi"><b>${fmtNum(v)}</b><span>${l}</span></div>`;
    const counts = users.reduce((a, u) => (a[u.is_admin ? 'admin' : u.plan] = (a[u.is_admin ? 'admin' : u.plan] || 0) + 1, a), {});
    const usage = u => {
      if (u.is_admin || u.plan !== 'free' && u.plan !== 'pro') return '<span class="muted">Ilimitado</span>';
      const fresh = u.window_start && Date.now() - Date.parse(u.window_start) < 864e5;
      const secs = fresh ? u.listen_seconds : 0, sk = fresh ? u.skips : 0;
      return `${u.plan === 'free' ? `${(secs / 3600).toFixed(1)} / 5 h · ` : ''}${sk} / ${u.plan === 'free' ? 5 : 100} saltos`;
    };
    $('#adm').innerHTML = `
      <div class="kpis">${kpi(o.users, 'usuarios')}${kpi(o.users_7d, 'nuevos (7 días)')}${kpi(o.active_24h, 'activos hoy')}${kpi(o.plays_24h, 'escuchas hoy')}${kpi(o.plays, 'escuchas totales')}${kpi(o.playlists, 'playlists')}${kpi(reqs.length, 'solicitudes pendientes')}${kpi((counts.pro || 0) + (counts.max || 0) + (counts.ultra || 0), 'cuentas de pago')}</div>
      <section class="glass-card accounts" id="accounts"><div class="acc-head"><h3>Cuentas y planes</h3><div class="plan-mix">${['free', 'pro', 'max', 'ultra'].map(p => `<span class="plan-chip tier-${p}">${icons[PLANS_UI[p].icon]}${PLANS_UI[p].name} · ${counts[p] || 0}</span>`).join('')}</div></div>
        ${reqs.length ? `<div class="requests"><h4>Solicitudes pendientes</h4>${reqs.map(r => { const u = byId[r.user_id] || { email: 'Usuario', plan: 'free' }; return `<div class="req-row" data-req="${r.id}" data-user="${r.user_id}" data-plan="${r.plan}">${avatarOf(card(u), 'sm')}<div class="rq-who"><b class="ellipsis">${esc(u.display_name || u.email)}</b><small class="ellipsis">${esc(u.email)} · ${new Date(r.created_at).toLocaleDateString('es')}</small>${r.note ? `<small class="rq-note">${esc(r.note)}</small>` : ''}</div><div class="rq-plan">${planChip(u.plan, false)}${icons.next2}${planChip(r.plan, false)}</div><div class="rq-act"><button class="pill primary sm" data-approve>Aprobar</button><button class="pill ghost sm" data-reject>Rechazar</button></div></div>`; }).join('')}</div>` : '<p class="muted small">No hay solicitudes pendientes.</p>'}
        <div class="acc-tools"><input class="field" id="accFilter" type="search" placeholder="Buscar por nombre o correo"></div>
        <div class="table-wrap"><table class="utable"><thead><tr><th>Cuenta</th><th>Plan</th><th>Uso (24 h)</th><th>Escuchas</th><th>Alta</th><th>Último acceso</th></tr></thead><tbody id="accRows">
        ${users.map(u => `<tr data-q="${esc((u.display_name || '') + ' ' + u.email).toLowerCase()}"><td><div class="acc-who">${avatarOf(card(u), 'sm')}<div><b>${esc(u.display_name || '—')}</b><small>${esc(u.email)}${u.confirmed ? '' : ' · sin confirmar'}</small></div></div></td>
          <td>${u.is_admin ? planChip('ultra', true) : `<div class="plan-set"><select class="field sm" data-user="${u.id}">${['free', 'pro', 'max', 'ultra'].map(p => `<option value="${p}" ${u.plan === p ? 'selected' : ''}>${PLANS_UI[p].name}</option>`).join('')}</select><button class="pill sm" data-apply="${u.id}" hidden>Aplicar</button></div>`}</td>
          <td>${usage(u)}</td><td>${u.plays}</td><td>${new Date(u.created_at).toLocaleDateString('es')}</td><td>${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="panel-grid">
        <div class="glass-card wide"><h3>Escuchas · últimos 14 días</h3><div class="bars">${days.map(d => `<div class="bar" style="--v:${d.n / max}" title="${d.d}: ${d.n}"><i></i><small>${d.d.slice(8)}</small></div>`).join('')}</div></div>
        <div class="glass-card"><h3>Canciones completas · YouTube</h3>
          <p class="status ${o.youtube_configured ? 'ok' : 'warn'}"><i class="dot"></i>${o.youtube_configured ? 'Activo para todos los usuarios' : 'Falta la clave: el catálogo suena como vista previa'}</p>
          <p class="muted small">Las canciones comerciales suenan completas con el reproductor oficial de YouTube, aislado dentro de la app: no puede abrir pestañas ni ventanas. La clave se guarda solo en el servidor. Cada canción nueva cuesta ~101 unidades de cuota (10.000/día gratis, unas 99 canciones nuevas al día) y las ya encontradas se reutilizan para todos.</p>
          <ol class="steps"><li><a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Activa «YouTube Data API v3»</a> en Google Cloud.</li><li>En <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credenciales</a>, crea una clave de API y restríngela a esa API.</li><li>Pégala aquí y pulsa «Probar».</li></ol>
          <div class="row"><input class="field" id="ytKey" type="password" placeholder="AIza..." autocomplete="off" spellcheck="false"><button class="pill primary" id="ytSave">Guardar</button></div>
          <div class="row-btns"><button class="pill ghost sm" id="ytTest">Probar con una canción</button>${o.youtube_configured ? '<button class="pill ghost sm" id="ytDel">Quitar clave</button>' : ''}</div>
          <p class="small muted" id="ytMsg">${fmtNum(o.matches)} canciones completas en caché · ${fmtNum(o.lookups_today)} búsquedas hoy</p></div>
        <div class="glass-card"><h3>Fuentes de audio</h3>
          <ul class="sources">
            <li><b>Catálogo (Deezer)</b><span class="status ok"><i class="dot"></i>Activo</span><small>Búsqueda, artistas, álbumes y vistas previas de 30 s.</small></li>
            <li><b>Versiones completas (Audius)</b><span class="status ok"><i class="dot"></i>Activo</span><small>Si el propio artista subió la canción, suena completa en vez de la vista previa.</small></li>
            <li><b>Radio en directo</b><span class="status ok"><i class="dot"></i>Activo</span><small>Miles de emisoras con licencia, música completa 24/7.</small></li>
            <li><b>Subidas Ultra</b><span class="status ok"><i class="dot"></i>Activo</span><small>Canciones subidas por cuentas Ultra, públicas o privadas.</small></li>
            <li><b>Música libre (Jamendo)</b><span class="status ${cloud.jamendoId ? 'ok' : 'warn'}"><i class="dot"></i>${cloud.jamendoId ? 'Activo' : 'Opcional'}</span><small>Canciones completas con licencia Creative Commons.</small></li>
          </ul>
          <p class="muted small">Para activar Jamendo, crea una app gratis en <a href="https://devportal.jamendo.com/" target="_blank" rel="noopener">devportal.jamendo.com</a> y pega su <b>Client ID</b>.</p>
          <div class="row"><input class="field" id="jmId" placeholder="Client ID de Jamendo" value="${esc(cloud.jamendoId)}" autocomplete="off" spellcheck="false"><button class="pill primary" id="jmSave">Guardar</button></div>
          ${cloud.jamendoId ? '<div class="row-btns"><button class="pill ghost sm" id="jmDel">Desactivar Jamendo</button></div>' : ''}<p class="small muted" id="jmMsg"></p></div>
        <div class="glass-card"><h3>Anuncio para todos</h3><p class="muted small">Aparece en el inicio de todos los usuarios al instante.</p>
          <textarea class="field" id="annText" maxlength="280" placeholder="Ej.: Nuevos temas disponibles">${esc(ann.text || '')}</textarea>
          <div class="row"><select class="field" id="annTone">${[['info', 'Información'], ['ok', 'Novedad'], ['warn', 'Aviso']].map(([v, l]) => `<option value="${v}" ${ann.tone === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <label class="switch inline"><input type="checkbox" id="annOn" ${ann.active ? 'checked' : ''}><i></i><span>Visible</span></label></div>
          <button class="pill primary" id="annSave">Publicar</button></div>
        <div class="glass-card"><h3>Más escuchadas · 30 días</h3><div class="rank">${o.top_tracks.length ? o.top_tracks.map((t, i) => `<div class="rank-row"><span class="rk">${String(i + 1).padStart(2, '0')}</span>${img(t.cover)}<span class="ellipsis"><b>${esc(t.title)}</b><small class="muted"> · ${esc(t.artist)}</small></span><span class="muted">${t.n}</span></div>`).join('') : '<p class="muted small">Aún no hay escuchas.</p>'}</div></div>
      </section>`;
    // accounts: change plans, approve / reject requests, filter
    const acc = $('#accounts');
    acc.addEventListener('change', e => { const sel = e.target.closest('select[data-user]'); if (sel) acc.querySelector(`[data-apply="${sel.dataset.user}"]`).hidden = sel.value === byId[sel.dataset.user].plan; });
    acc.addEventListener('click', async e => {
      const ap = e.target.closest('[data-apply]'), row = e.target.closest('.req-row');
      try {
        if (ap) { const uid = ap.dataset.apply, plan = acc.querySelector(`select[data-user="${uid}"]`).value; await cloud.admin.setPlan(uid, plan); const r = ap.getBoundingClientRect(); burst(r.left + r.width / 2, r.top, { n: 18 }); toast(`Plan ${PLANS_UI[plan].name} asignado`); admin(); }
        else if (row && e.target.closest('[data-approve]')) { await cloud.admin.setPlan(row.dataset.user, row.dataset.plan); toast(`Plan ${PLANS_UI[row.dataset.plan].name} aprobado`); admin(); }
        else if (row && e.target.closest('[data-reject]')) { await cloud.admin.rejectRequest(+row.dataset.req); toast('Solicitud rechazada'); admin(); }
      } catch (err) { toast(err.message); }
    });
    $('#accFilter').oninput = e => { const q = e.target.value.trim().toLowerCase(); $$('#accRows tr').forEach(tr => { tr.hidden = q && !tr.dataset.q.includes(q); }); };
    const ytMsg = $('#ytMsg');
    $('#ytSave').onclick = async () => {
      const k = $('#ytKey').value.trim(); if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(k)) { ytMsg.textContent = 'Esa clave no parece válida (empieza por «AIza»).'; return; }
      try { await cloud.admin.setYoutubeKey(k); toast('Clave guardada en el servidor'); admin(); } catch (e) { ytMsg.textContent = e.message; }
    };
    $('#ytDel')?.addEventListener('click', async () => { if (await confirmBox('¿Quitar la clave?', 'Las canciones nuevas volverán a sonar como vista previa; las ya encontradas seguirán completas.', 'Quitar')) { await cloud.admin.setYoutubeKey(''); admin(); } });
    $('#ytTest').onclick = async () => {
      ytMsg.textContent = 'Probando...'; store.del('ytmap2');
      const r = await cloud.resolve({ id: 'dz:3135553', title: 'One More Time', artist: 'Daft Punk', dur: 320 });
      ytMsg.textContent = r.videoId ? `Funciona: vídeo ${r.videoId} listo para sonar completo.` : `No funciona: ${({ not_configured: 'no hay clave configurada.', quota: 'cuota de YouTube agotada por hoy.', youtube: 'YouTube rechazó la clave; revisa que la API esté activada.', not_found: 'no se encontró la canción.', disabled: 'tienes YouTube desactivado en tu perfil.' })[r.error] || r.message || r.error}`;
    };
    const jmMsg = $('#jmMsg');
    $('#jmSave').onclick = async () => {
      const id = $('#jmId').value.trim(); if (!/^[a-z0-9]{6,40}$/i.test(id)) { jmMsg.textContent = 'Ese Client ID no parece válido.'; return; }
      jmMsg.textContent = 'Comprobando...';
      if (!await jamendo.test(id).catch(() => false)) { jmMsg.textContent = 'Jamendo no acepta ese Client ID.'; return; }
      try { await cloud.admin.setJamendo(id); toast('Jamendo activado para todos'); admin(); } catch (e) { jmMsg.textContent = e.message; }
    };
    $('#jmDel')?.addEventListener('click', async () => { await cloud.admin.setJamendo(''); toast('Jamendo desactivado'); admin(); });
    $('#annSave').onclick = async () => {
      try { await cloud.admin.setAnnouncement({ text: $('#annText').value.trim(), tone: $('#annTone').value, active: $('#annOn').checked && !!$('#annText').value.trim() }); toast('Anuncio actualizado'); } catch (e) { toast(e.message); }
    };
  } catch (e) { if (!stale(s)) view().innerHTML = errorState(e.message); }
}

/* ======================= SUBIDAS ULTRA ======================= */
export function uploadModal(onDone) {
  modal(`<h3>Subir una canción</h3><p class="muted small">MP3, M4A, FLAC, WAV u OGG de hasta 50 MB. Decide si la escuchas solo tú o toda la comunidad.</p>
    <label class="drop-in" id="upDrop">${icons.upload}<span id="upFileName">Elige o suelta un archivo de audio</span><input type="file" id="upFile" accept="audio/*" hidden></label>
    <div class="row"><label class="fl grow"><span>Título</span><input class="field" id="upTitle" maxlength="120"></label><label class="fl grow"><span>Artista</span><input class="field" id="upArtist" maxlength="120" value="${esc(cloud.profile?.display_name || '')}"></label></div>
    <label class="fl"><span>Portada (opcional)</span><input class="field" id="upCover" type="file" accept="image/*"></label>
    <label class="switch"><span><b>Pública</b><small>Aparecerá en Comunidad y en las búsquedas. Si la desactivas, solo tú podrás escucharla.</small></span><input type="checkbox" id="upPublic"><i></i></label>
    <div class="up-progress" hidden><i></i></div><p class="form-msg" id="upMsg"></p>
    <div class="acts"><button class="pill ghost" data-close>Cancelar</button><button class="pill primary" data-ok>Subir</button></div>`, (el, close) => {
    let file = null;
    const fileIn = el.querySelector('#upFile');
    el.querySelector('#upDrop').onclick = () => fileIn.click();
    const setFile = f => { if (!f) return; file = f; el.querySelector('#upFileName').textContent = `${f.name} · ${(f.size / 1048576).toFixed(1)} MB`; const t = el.querySelector('#upTitle'); if (!t.value) t.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120); };
    fileIn.onchange = () => setFile(fileIn.files[0]);
    el.querySelector('#upDrop').addEventListener('dragover', e => e.preventDefault());
    el.querySelector('#upDrop').addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); setFile(e.dataTransfer.files[0]); });
    el.querySelector('[data-ok]').onclick = async () => {
      const msg = el.querySelector('#upMsg'), bar = el.querySelector('.up-progress');
      if (!file) { msg.textContent = 'Elige un archivo de audio.'; msg.className = 'form-msg err'; return; }
      if (file.size > 50 * 1048576) { msg.textContent = 'El archivo supera los 50 MB.'; msg.className = 'form-msg err'; return; }
      const title = el.querySelector('#upTitle').value.trim(); if (!title) { msg.textContent = 'Ponle un título.'; msg.className = 'form-msg err'; return; }
      const btn = el.querySelector('[data-ok]'); btn.disabled = true; bar.hidden = false;
      try {
        const duration = await new Promise(res => { const a = new Audio(), u = URL.createObjectURL(file); a.preload = 'metadata'; a.onloadedmetadata = () => { res(a.duration || 0); URL.revokeObjectURL(u); }; a.onerror = () => res(0); a.src = u; });
        const coverFile = el.querySelector('#upCover').files[0];
        const cover = coverFile ? await squareImage(coverFile, 600) : null;
        const t = await cloud.uploadTrack(file, { title, artist: el.querySelector('#upArtist').value.trim(), isPublic: el.querySelector('#upPublic').checked, cover, duration }, p => bar.style.setProperty('--p', (p * 100) + '%'));
        close(); toast('Canción subida'); onDone?.(t);
      } catch (e) { msg.textContent = e.message; msg.className = 'form-msg err'; btn.disabled = false; }
    };
  });
}
export async function renderMyUploads(box) {
  try {
    const list = await cloud.myUploads();
    box.innerHTML = list.length ? trackList(list.map(t => ({ ...t, mine: true })), { label: 'Tus subidas', href: '#/biblioteca' }) : `<button class="dropzone" id="upEmpty">${icons.upload}<div><b>Sube tu primera canción</b><br><span class="muted">Pública para la comunidad o privada solo para ti.</span></div></button>`;
    box.querySelector('#upEmpty')?.addEventListener('click', () => uploadModal(() => renderMyUploads(box)));
  } catch (e) { box.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
}
/* ======================= RADIO EN DIRECTO ======================= */
const countryOf = () => { const m = (navigator.languages?.[0] || navigator.language || '').match(/-([A-Z]{2})$/i); return m ? m[1].toUpperCase() : ''; };
const COUNTRY = { ES: 'España', MX: 'México', AR: 'Argentina', CO: 'Colombia', CL: 'Chile', PE: 'Perú', US: 'Estados Unidos', VE: 'Venezuela', EC: 'Ecuador', UY: 'Uruguay', GB: 'Reino Unido', FR: 'Francia', DE: 'Alemania', IT: 'Italia', BR: 'Brasil', PT: 'Portugal' };
export async function radioPage(tag = '') {
  const s = begin(); setTint([200, 50, 90]);
  const tg = RADIO_TAGS.find(x => x[0] === tag);
  view().innerHTML = `<header class="radio-hero"><div class="rh-waves"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div><div class="eyebrow">En directo · música completa</div><h1 class="title-xl">${tg ? esc(tg[1]) : 'Radio'}</h1><p class="muted">${tg ? 'Emisoras de todo el mundo, sonando ahora.' : 'Miles de emisoras con licencia de todo el mundo, 24 horas. Funciona con la pantalla bloqueada.'}</p></div></header>
    <div class="search-inline wide">${icons.radio}<input id="rdSearch" type="search" placeholder="Busca una emisora (Los 40, BBC, Cadena SER…)" autocomplete="off"></div>
    <div class="chips scroll">${tg ? `<a class="chip" href="#/radio">${icons.back}Todas</a>` : ''}${RADIO_TAGS.map(([v, l, c]) => `<a class="chip tagchip${v === tag ? ' on' : ''}" href="#/radio/${encodeURIComponent(v)}" style="--tc:${c}">${l}</a>`).join('')}</div>
    <div id="rdResults"></div>
    ${!tag && lib.stations.length ? `<section class="shelf"><div class="shelf-head"><h2>Tus emisoras</h2></div>${stationCards(lib.stations, 'Tus emisoras')}</section>` : ''}
    <div id="rdMain">${skeletonShelves(2)}</div>`;
  const box = $('#rdResults');
  $('#rdSearch').oninput = debounce(async e => {
    const q = e.target.value.trim(); if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="sk sk-h2"></div>';
    try { const r = await radio.search(q, 24); if (!stale(s)) box.innerHTML = r.length ? `<section class="shelf"><h2>Resultados</h2>${stationCards(r, `Radio: «${q}»`, { wrap: true })}</section>` : '<p class="muted pad">No encontramos emisoras con ese nombre.</p>'; } catch { box.innerHTML = errorState('No se pudo conectar con el directorio de radio.'); }
  }, 350);
  try {
    if (tag) {
      const list = await radio.byTag(tag, 60); if (stale(s)) return;
      $('#rdMain').innerHTML = list.length ? stationCards(list, `Radio · ${tg ? tg[1] : tag}`, { wrap: true }) : '<div class="empty"><p>No hay emisoras de este estilo ahora mismo.</p></div>';
      return;
    }
    const cc = countryOf();
    const [top, near] = await Promise.all([radio.top(30), cc ? radio.byCountry(cc, 24).catch(() => []) : Promise.resolve([])]);
    if (stale(s)) return;
    const picks = await Promise.allSettled(['pop', 'latin', 'electronic', 'lofi'].map(t => radio.byTag(t, 16)));
    if (stale(s)) return;
    const names = { pop: 'Pop sin parar', latin: 'Ritmo latino', electronic: 'Electrónica', lofi: 'Lo-fi para concentrarte' };
    $('#rdMain').innerHTML = `
      ${near.length ? `<section class="shelf"><div class="shelf-head"><h2>Cerca de ti${COUNTRY[cc] ? ' · ' + COUNTRY[cc] : ''}</h2></div>${stationCards(near, 'Radio cerca de ti')}</section>` : ''}
      <section class="shelf"><div class="shelf-head"><h2>Las más escuchadas del mundo</h2></div>${stationCards(top, 'Radio · más escuchadas')}</section>
      ${['pop', 'latin', 'electronic', 'lofi'].map((t, i) => picks[i].value?.length ? `<section class="shelf"><div class="shelf-head"><h2>${names[t]}</h2><a class="more" href="#/radio/${t}">Ver todo</a></div>${stationCards(picks[i].value, names[t])}</section>` : '').join('')}
      <p class="fine">Directorio de emisoras: radio-browser.info. Cada emisora es responsable de sus licencias de emisión.</p>`;
  } catch { if (!stale(s)) $('#rdMain').innerHTML = errorState('No se pudo conectar con el directorio de radio.'); }
}

async function homeRadio(s) {
  try {
    const top = await radio.top(16); if (stale(s) || !top.length) return;
    $('#homeRadio').innerHTML = `${lib.stations.length ? `<section class="shelf"><div class="shelf-head"><h2>Tus emisoras</h2><a class="more" href="#/radio">Radio</a></div>${stationCards(lib.stations, 'Tus emisoras')}</section>` : ''}
      <section class="shelf"><div class="shelf-head"><h2>Radio en directo · música completa</h2><a class="more" href="#/radio">Ver todo</a></div>${stationCards(top, 'Radio · más escuchadas')}</section>`;
  } catch { /* radio directory unreachable: home still works */ }
}
void fmt; void hrefOf; void audius;
