// Catalog providers: Deezer (full commercial catalog via JSONP), Audius (full indie tracks),
// LRCLIB (synced lyrics), Radio Browser (live radio) and Jamendo (optional CC music). No YouTube.

const APP = 'Listentoo';
const mem = new Map();
const cached = (key, fn, ttl = 10 * 60e3) => {
  const c = mem.get(key);
  if (c && Date.now() - c.t < ttl) return c.p;
  const p = fn().catch(e => { mem.delete(key); throw e; });
  mem.set(key, { t: Date.now(), p }); return p;
};

/* ---------------- Deezer ---------------- */
let n = 0;
function jsonp(path, params = {}) {
  return new Promise((res, rej) => {
    const cb = `__dz${++n}_${Date.now().toString(36)}`;
    const q = new URLSearchParams({ ...params, output: 'jsonp', callback: cb });
    const s = document.createElement('script');
    const timer = setTimeout(() => done(new Error('Tiempo de espera agotado')), 12000);
    function done(err, data) {
      clearTimeout(timer); window[cb] = () => {}; s.remove();
      setTimeout(() => { delete window[cb]; }, 30000);
      err ? rej(err) : res(data);
    }
    window[cb] = d => d && d.error ? done(new Error(d.error.message || 'Deezer')) : done(null, d);
    s.onerror = () => done(new Error('Sin conexión'));
    s.src = `https://api.deezer.com/${path}${path.includes('?') ? '&' : '?'}${q}`;
    document.head.appendChild(s);
  });
}
const dz = (path, params, ttl) => cached('dz:' + path + JSON.stringify(params || {}), () => jsonp(path, params), ttl);

export const map = {
  track(t, alb = {}) {
    const a = t.album || alb;
    return {
      id: 'dz:' + t.id, src: 'deezer', dz: t.id, title: t.title, artist: t.artist?.name || alb.artist?.name || '',
      artistId: t.artist?.id || alb.artist?.id, album: a.title || '', albumId: a.id,
      cover: a.cover_medium || alb.cover_medium || '', coverXL: a.cover_xl || alb.cover_xl || a.cover_big || '',
      dur: t.duration || 0, explicit: !!t.explicit_lyrics, preview: t.preview || ''
    };
  },
  artist: a => ({ kind: 'artist', id: a.id, name: a.name, pic: a.picture_medium, picXL: a.picture_xl || a.picture_big, fans: a.nb_fan, albums: a.nb_album }),
  album: a => ({ kind: 'album', id: a.id, title: a.title, cover: a.cover_medium, coverXL: a.cover_xl || a.cover_big, artist: a.artist?.name || '', artistId: a.artist?.id, year: (a.release_date || '').slice(0, 4), type: a.record_type || 'album' }),
  playlist: p => ({ kind: 'dzplaylist', id: p.id, title: p.title, cover: p.picture_medium, coverXL: p.picture_xl || p.picture_big, by: p.user?.name || p.creator?.name || 'Deezer', count: p.nb_tracks })
};
const data = r => r?.data || [];

export const deezer = {
  chartTracks: (g = 0, limit = 50) => dz(`chart/${g}/tracks`, { limit }).then(r => data(r).map(t => map.track(t))),
  chartAlbums: (g = 0, limit = 20) => dz(`chart/${g}/albums`, { limit }).then(r => data(r).map(map.album)),
  chartArtists: (g = 0, limit = 20) => dz(`chart/${g}/artists`, { limit }).then(r => data(r).map(map.artist)),
  chartPlaylists: (g = 0, limit = 20) => dz(`chart/${g}/playlists`, { limit }).then(r => data(r).map(map.playlist)),
  genres: () => dz('genre', {}, 864e5).then(r => data(r).filter(g => g.id)),
  genre: id => dz(`genre/${id}`, {}, 864e5),
  genreArtists: id => dz(`genre/${id}/artists`, { limit: 30 }).then(r => data(r).map(map.artist)),
  search: (q, limit = 30) => dz('search', { q, limit }, 3e5).then(r => data(r).map(t => map.track(t))),
  searchArtists: (q, limit = 12) => dz('search/artist', { q, limit }, 3e5).then(r => data(r).map(map.artist)),
  searchAlbums: (q, limit = 12) => dz('search/album', { q, limit }, 3e5).then(r => data(r).map(map.album)),
  searchPlaylists: (q, limit = 12) => dz('search/playlist', { q, limit }, 3e5).then(r => data(r).map(map.playlist)),
  artist: id => dz(`artist/${id}`).then(map.artist),
  artistTop: (id, limit = 10) => dz(`artist/${id}/top`, { limit }).then(r => data(r).map(t => map.track(t))),
  artistAlbums: id => dz(`artist/${id}/albums`, { limit: 100 }).then(r => data(r).map(map.album)),
  artistRelated: id => dz(`artist/${id}/related`, { limit: 14 }).then(r => data(r).map(map.artist)),
  artistRadio: id => dz(`artist/${id}/radio`, { limit: 40 }, 6e4).then(r => data(r).map(t => map.track(t))),
  async album(id) {
    const a = await dz(`album/${id}`);
    let tracks = data(a.tracks);
    if (a.nb_tracks > tracks.length) tracks = data(await dz(`album/${id}/tracks`, { limit: 500 }));
    return { ...map.album(a), label: a.label, fans: a.fans, duration: a.duration, date: a.release_date, genres: (a.genres?.data || []).map(g => g.name), tracks: tracks.map(t => map.track(t, a)) };
  },
  async playlist(id) {
    const p = await dz(`playlist/${id}`);
    let tracks = data(p.tracks);
    if (p.nb_tracks > tracks.length) tracks = data(await dz(`playlist/${id}/tracks`, { limit: 400 }));
    return { ...map.playlist(p), description: p.description, fans: p.fans, duration: p.duration, tracks: tracks.filter(t => t.readable !== false).map(t => map.track(t)) };
  },
  // Preview URLs are signed and expire, so always fetch a fresh one at play time.
  freshPreview: id => jsonp(`track/${id}`).then(t => t.preview || '')
};

/* ---------------- Audius ---------------- */
const AUD = 'https://api.audius.co/v1';
async function aud(path) {
  const r = await fetch(`${AUD}${path}${path.includes('?') ? '&' : '?'}app_name=${APP}`);
  if (!r.ok) throw new Error('Audius ' + r.status);
  return (await r.json()).data || [];
}
const audTrack = t => ({
  id: 'au:' + t.id, src: 'audius', title: t.title, artist: t.user?.name || '', album: 'Audius',
  cover: t.artwork?.['480x480'] || t.artwork?.['150x150'] || '', coverXL: t.artwork?.['1000x1000'] || t.artwork?.['480x480'] || '',
  dur: t.duration || 0, url: `${AUD}/tracks/${t.id}/stream?app_name=${APP}`, full: true
});
export const audius = {
  trending: () => cached('au:tr', () => aud('/tracks/trending?time=week&limit=30').then(r => r.map(audTrack))),
  search: q => cached('au:s:' + q, () => aud(`/tracks/search?limit=20&query=${encodeURIComponent(q)}`).then(r => r.map(audTrack)), 3e5)
};

/* ---------------- Lyrics (LRCLIB) ---------------- */
export async function lyrics(t) {
  const key = 'ly:' + t.id;
  return cached(key, async () => {
    const q = new URLSearchParams({ artist_name: t.artist, track_name: t.title.replace(/\s*[([].*?(feat|with|remaster|version|edit).*?[)\]]/gi, '') });
    if (t.album) q.set('album_name', t.album);
    if (t.dur) q.set('duration', Math.round(t.dur));
    let r = await fetch('https://lrclib.net/api/get?' + q);
    if (!r.ok) { // fall back to fuzzy search
      const s = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ q: `${t.artist} ${t.title}` }));
      const list = s.ok ? await s.json() : [];
      const best = list.find(x => x.syncedLyrics) || list[0];
      if (!best) return null; r = { json: async () => best };
    }
    const j = await r.json();
    if (j.instrumental) return { instrumental: true, lines: [] };
    if (j.syncedLyrics) {
      const lines = [];
      for (const ln of j.syncedLyrics.split('\n')) {
        const m = ln.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
        if (m) lines.push({ t: +m[1] * 60 + +m[2], text: m[3] || '♪' });
      }
      return { synced: true, lines };
    }
    if (j.plainLyrics) return { synced: false, lines: j.plainLyrics.split('\n').map(text => ({ t: -1, text })) };
    return null;
  }, 36e5);
}

/* ---------------- Full-length versions on Audius ----------------
   When the catalog artist has uploaded the same song to Audius themselves, play that full
   version instead of the 30 s preview. Matching is strict (same artist, same title, similar
   length, no remixes/covers) so we never swap in someone else's upload. */
const normTxt = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s*[([](feat|ft|with|w\/|con|prod)[^)\]]*[)\]]/g, '')
  .replace(/\s+(feat\.?|ft\.?|w\/|featuring)\s.*$/, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const ALT = /\b(remix|flip|edit|bootleg|cover|tribute|mashup|rework|vip|live|acoustic|instrumental|sped up|slowed|nightcore|karaoke)\b/;
export async function findFull(t) {
  if (t.src !== 'deezer' || !t.title || !t.artist) return null;
  const key = 'lt:full:' + t.id;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < 7 * 864e5) return c.t; } catch { /* */ }
  let hit = null;
  try {
    const want = normTxt(t.title), artist = normTxt(t.artist.split(/,|&| x | feat\.? /i)[0]);
    const list = await aud(`/tracks/search?limit=12&query=${encodeURIComponent(`${t.artist} ${t.title}`)}`);
    hit = list.find(x => {
      const ua = normTxt(x.user?.name), uh = normTxt(x.user?.handle), title = normTxt(x.title.replace(new RegExp('^' + t.artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-–—]\\s*', 'i'), ''));
      if (!(ua === artist || uh === artist.replace(/ /g, ''))) return false;
      if (title !== want) return false;
      if (ALT.test(normTxt(x.title)) && !ALT.test(want)) return false;
      if (t.dur && x.duration && Math.abs(t.dur - x.duration) > 15) return false;
      return true;
    }) || null;
  } catch { return null; } // network problem: don't cache
  const full = hit ? { ...audTrack(hit), id: t.id, title: t.title, artist: t.artist, artistId: t.artistId, album: t.album, albumId: t.albumId, cover: t.cover, coverXL: t.coverXL, explicit: t.explicit } : null;
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), t: full })); } catch { /* */ }
  return full;
}

/* ---------------- Live radio (Radio Browser, community directory of licensed stations) ---------------- */
const RB = ['de1', 'fi1', 'at1', 'nl1'];
let rbHost = 0;
async function rb(path, params = {}) {
  const q = new URLSearchParams({ hidebroken: 'true', ...params });
  for (let i = 0; i < RB.length; i++) {
    const host = RB[(rbHost + i) % RB.length];
    try {
      const r = await fetch(`https://${host}.api.radio-browser.info/json/${path}?${q}`);
      if (r.ok) { rbHost = (rbHost + i) % RB.length; return r.json(); }
    } catch { /* try next mirror */ }
  }
  throw new Error('Radio no disponible');
}
const canHls = !!document.createElement('audio').canPlayType('application/vnd.apple.mpegurl');
const station = s => ({
  id: 'rd:' + s.stationuuid, src: 'radio', live: true, full: true,
  title: s.name.trim().replace(/\s+/g, ' ').slice(0, 80),
  artist: [s.tags?.split(',').slice(0, 2).join(' · '), s.countrycode].filter(Boolean).join(' · ') || 'Radio en directo',
  album: 'Radio en directo', cover: s.favicon && s.favicon.startsWith('https://') ? s.favicon : '', coverXL: '',
  url: s.url_resolved || s.url, codec: s.codec, bitrate: s.bitrate, country: s.country, votes: s.votes, dur: 0
});
const usable = list => list.filter(s => (s.url_resolved || '').startsWith('https://') && (canHls || !s.hls)).map(station);
const NOT_MUSIC = /\b(news|noticias|talk|sports?|deportes|religio|christian|cristiana|gospel|church|iglesia|bible|politic|podcast|comedy|weather|traffic|police|scanner)/i;
const musicOnly = list => list.filter(s => !NOT_MUSIC.test(s.artist));
const dedupe = list => { const seen = new Set(); return list.filter(s => { const k = s.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };
export const radio = {
  top: (limit = 40) => cached('rd:top', () => rb('stations/topclick', { limit: limit * 3, is_https: 'true' }).then(r => dedupe(musicOnly(usable(r))).slice(0, limit)), 30 * 60e3),
  byTag: (tag, limit = 40) => cached('rd:t:' + tag, () => rb('stations/search', { tag, order: 'clickcount', reverse: 'true', limit: limit * 2, is_https: 'true' }).then(r => dedupe(usable(r)).slice(0, limit)), 30 * 60e3),
  byCountry: (cc, limit = 40) => cached('rd:c:' + cc, () => rb('stations/search', { countrycode: cc, order: 'clickcount', reverse: 'true', limit: limit * 3, is_https: 'true' }).then(r => dedupe(musicOnly(usable(r))).slice(0, limit)), 30 * 60e3),
  search: (name, limit = 24) => cached('rd:s:' + name, () => rb('stations/search', { name, order: 'clickcount', reverse: 'true', limit: limit * 2, is_https: 'true' }).then(r => dedupe(usable(r)).slice(0, limit)), 5 * 60e3),
  async byUuid(id) { const r = await rb('stations/byuuid', { uuids: id.replace(/^rd:/, '') }); return usable(r)[0] || null; },
  click(id) { rb(`url/${id.replace(/^rd:/, '')}`).catch(() => {}); } // directory asks clients to count plays
};
export const RADIO_TAGS = [
  ['pop', 'Pop', '#ec4899'], ['rock', 'Rock', '#ef4444'], ['hip hop', 'Hip hop', '#f97316'], ['reggaeton', 'Reggaetón', '#eab308'],
  ['latin', 'Latina', '#f43f5e'], ['dance', 'Dance', '#8b5cf6'], ['electronic', 'Electrónica', '#06b6d4'], ['80s', 'Años 80', '#a855f7'],
  ['jazz', 'Jazz', '#d97706'], ['classical', 'Clásica', '#64748b'], ['lofi', 'Lo-fi', '#14b8a6'], ['chillout', 'Chill', '#3b82f6'],
  ['indie', 'Indie', '#22c55e'], ['metal', 'Metal', '#52525b'], ['kpop', 'K-pop', '#e879f9'], ['salsa', 'Salsa', '#fb923c']
];

/* ---------------- Jamendo (optional, Creative Commons full tracks; client id set by the admin) ---------------- */
let jmId = '';
export const jamendo = {
  setClient(id) { jmId = (id || '').trim(); },
  get enabled() { return !!jmId; },
  map: t => ({ id: 'jm:' + t.id, src: 'jamendo', full: true, title: t.name, artist: t.artist_name, album: t.album_name || 'Jamendo', cover: t.image || t.album_image || '', coverXL: (t.image || '').replace(/width=\d+/, 'width=600'), dur: t.duration || 0, url: t.audio, license: t.license_ccurl }),
  async q(params) {
    if (!jmId) return [];
    const r = await fetch('https://api.jamendo.com/v3.0/tracks/?' + new URLSearchParams({ client_id: jmId, format: 'json', audioformat: 'mp32', imagesize: '300', include: 'licenses', ...params }));
    const j = await r.json(); if (j.headers?.status !== 'success') throw new Error(j.headers?.error_message || 'Jamendo');
    return (j.results || []).filter(x => x.audio).map(jamendo.map);
  },
  popular: () => cached('jm:pop', () => jamendo.q({ order: 'popularity_week', limit: '30' }), 30 * 60e3),
  search: q => cached('jm:s:' + q, () => jamendo.q({ search: q, limit: '20' }), 5 * 60e3),
  test: async id => { const r = await fetch('https://api.jamendo.com/v3.0/tracks/?' + new URLSearchParams({ client_id: id, format: 'json', limit: '1' })); const j = await r.json(); return j.headers?.status === 'success'; }
};

/* ---------------- references -> playable track (cloud history) ---------------- */
export function trackFromRef(r) {
  const id = r.track_id || r.id || '';
  if (id.startsWith('dz:')) return { id, src: 'deezer', dz: +id.slice(3), title: r.title, artist: r.artist, cover: r.cover || '', coverXL: (r.cover || '').replace(/\/\d+x\d+-/, '/1000x1000-'), dur: 0 };
  if (id.startsWith('au:')) return { id, src: 'audius', title: r.title, artist: r.artist, cover: r.cover || '', coverXL: r.cover || '', dur: 0, url: `${AUD}/tracks/${id.slice(3)}/stream?app_name=${APP}`, full: true };
  if (id.startsWith('rd:')) return { id, src: 'radio', live: true, full: true, title: r.title, artist: r.artist, album: 'Radio en directo', cover: r.cover || '', dur: 0 };
  if (id.startsWith('jm:')) return { id, src: 'jamendo', full: true, title: r.title, artist: r.artist, cover: r.cover || '', dur: 0, url: `https://prod-1.storage.jamendo.com/?trackid=${id.slice(3)}&format=mp32` };
  return null;
}

/* ---------------- moods ---------------- */
export const MOODS = [
  { id: 'energia', name: 'Energía', icon: '⚡', q: 'workout', tag: 'dance', c: ['#ff7a18', '#ff2d55'] },
  { id: 'calma', name: 'Calma', icon: '🌙', q: 'chill', tag: 'chillout', c: ['#3a7bd5', '#6dd5ed'] },
  { id: 'fiesta', name: 'Fiesta', icon: '🪩', q: 'party hits', tag: 'party', c: ['#f953c6', '#b91d73'] },
  { id: 'enfoque', name: 'Enfoque', icon: '🎧', q: 'focus', tag: 'lofi', c: ['#11998e', '#38ef7d'] },
  { id: 'romance', name: 'Romance', icon: '💜', q: 'love songs', tag: 'romantic', c: ['#c471f5', '#fa71cd'] },
  { id: 'nostalgia', name: 'Nostalgia', icon: '📼', q: '80s hits', tag: '80s', c: ['#f7971e', '#ffd200'] },
  { id: 'latino', name: 'Latino', icon: '🔥', q: 'reggaeton', tag: 'reggaeton', c: ['#ee0979', '#ff6a00'] },
  { id: 'lluvia', name: 'Día de lluvia', icon: '🌧️', q: 'rainy day', tag: 'jazz', c: ['#536976', '#292e49'] },
  { id: 'indie', name: 'Indie', icon: '🌿', q: 'indie', tag: 'indie', c: ['#56ab2f', '#a8e063'] },
  { id: 'dormir', name: 'Dormir', icon: '😴', q: 'sleep', tag: 'ambient', c: ['#141e30', '#243b55'] }
];
