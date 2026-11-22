// Catalog providers: Deezer (full commercial catalog via JSONP), Audius (full indie tracks),
// LRCLIB (synced lyrics) and YouTube Data API (optional, resolves full-length versions).
import { store } from './util.js';

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

/* ---------------- YouTube (optional full-length playback) ---------------- */
const ytCache = store.get('ytmap', {});
export const youtube = {
  key: () => store.get('settings', {}).ytKey || '',
  async resolve(t) {
    if (ytCache[t.id]) return ytCache[t.id];
    const key = this.key(); if (!key) return null;
    const q = new URLSearchParams({
      part: 'snippet', type: 'video', maxResults: '5', videoEmbeddable: 'true', videoCategoryId: '10',
      q: `${t.artist} ${t.title} audio`, key
    });
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + q);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error?.errors?.[0]?.reason === 'quotaExceeded' ? 'Cuota diaria de YouTube agotada' : 'YouTube: clave no válida o sin acceso');
    }
    const items = (await r.json()).items || [];
    const want = t.title.toLowerCase().split(/\s+/)[0];
    const pick = items.find(i => /topic|vevo|official/i.test(i.snippet.channelTitle) && i.snippet.title.toLowerCase().includes(want)) || items[0];
    const vid = pick?.id?.videoId || null;
    if (vid) { ytCache[t.id] = vid; const keys = Object.keys(ytCache); if (keys.length > 3000) delete ytCache[keys[0]]; store.set('ytmap', ytCache); }
    return vid;
  },
  async test(key) {
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({ part: 'id', q: 'test', maxResults: '1', type: 'video', key }));
    return r.ok;
  }
};
