// User library: likes, playlists, saved albums/artists/playlists, history, local files, settings.
import { store, uid, idb, toast } from './util.js';

const slim = t => { const { preview, ...rest } = t; return rest; }; // never persist expiring URLs

export const lib = new (class extends EventTarget {
  constructor() {
    super();
    this.liked = store.get('liked', []);
    this.playlists = store.get('playlists', []);
    this.albums = store.get('albums', []);
    this.artists = store.get('artists', []);
    this.dzplaylists = store.get('dzplaylists', []);
    this.recent = store.get('recent', []);
    this.visited = store.get('visited', []);
    this.local = store.get('local', []);
    this.settings = { autoplay: true, crossfade: 0, ytKey: '', normalize: false, ...store.get('settings', {}) };
  }
  save(k) { store.set(k, this[k]); this.dispatchEvent(new CustomEvent('change', { detail: k })); }

  isLiked(t) { return !!t && this.liked.some(x => x.id === t.id); }
  toggleLike(t) {
    if (this.isLiked(t)) { this.liked = this.liked.filter(x => x.id !== t.id); toast('Eliminada de Tus me gusta'); }
    else { this.liked.unshift({ ...slim(t), added: Date.now() }); toast('Añadida a Tus me gusta'); }
    this.save('liked');
  }

  createPlaylist(name, tracks = [], desc = '') {
    const p = { id: uid(), name: (name || '').trim() || `Mi playlist n.º ${this.playlists.length + 1}`, desc, tracks: tracks.map(slim), created: Date.now() };
    this.playlists.unshift(p); this.save('playlists'); return p;
  }
  playlist(id) { return this.playlists.find(p => p.id === id); }
  addToPlaylist(pid, tracks) {
    const p = this.playlist(pid); if (!p) return;
    const fresh = [].concat(tracks).filter(t => !p.tracks.some(x => x.id === t.id));
    if (!fresh.length) return toast(`Ya está en «${p.name}»`);
    p.tracks.push(...fresh.map(t => ({ ...slim(t), added: Date.now() }))); this.save('playlists');
    toast(fresh.length > 1 ? `${fresh.length} canciones añadidas a «${p.name}»` : `Añadida a «${p.name}»`);
  }
  removeFromPlaylist(pid, tid) { const p = this.playlist(pid); if (!p) return; p.tracks = p.tracks.filter(x => x.id !== tid); this.save('playlists'); }
  movePlaylistTrack(pid, from, to) { const p = this.playlist(pid); if (!p) return; const [x] = p.tracks.splice(from, 1); p.tracks.splice(to, 0, x); this.save('playlists'); }
  updatePlaylist(pid, patch) { const p = this.playlist(pid); if (!p) return; Object.assign(p, patch); this.save('playlists'); }
  deletePlaylist(pid) { this.playlists = this.playlists.filter(p => p.id !== pid); this.save('playlists'); }

  isSaved(kind, id) { return this[kind + 's'].some(x => x.id == id); }
  toggleSaved(kind, item) {
    const k = kind + 's';
    if (this.isSaved(kind, item.id)) { this[k] = this[k].filter(x => x.id != item.id); toast(kind === 'artist' ? 'Has dejado de seguir' : 'Eliminado de tu biblioteca'); }
    else { const { tracks, ...meta } = item; this[k].unshift({ ...meta, added: Date.now() }); toast(kind === 'artist' ? `Siguiendo a ${item.name}` : 'Guardado en tu biblioteca'); }
    this.save(k);
  }

  pushRecent(t) { this.recent = [slim(t), ...this.recent.filter(x => x.id !== t.id)].slice(0, 50); this.save('recent'); }
  pushVisited(item) {
    const key = item.kind + ':' + item.id;
    this.visited = [item, ...this.visited.filter(x => x.kind + ':' + x.id !== key)].slice(0, 12); this.save('visited');
  }
  setSetting(k, v) { this.settings[k] = v; this.save('settings'); }

  async importFiles(files) {
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|flac|wav|ogg|opus|weba)$/i.test(f.name)) continue;
      const id = 'lo:' + uid();
      const [artist, title] = f.name.replace(/\.[^.]+$/, '').split(/\s+-\s+/).length > 1 ? f.name.replace(/\.[^.]+$/, '').split(/\s+-\s+/, 2) : ['Mi dispositivo', f.name.replace(/\.[^.]+$/, '')];
      try {
        await idb.put(id, f);
        const dur = await new Promise(res => { const a = new Audio(), u = URL.createObjectURL(f); a.preload = 'metadata'; a.onloadedmetadata = () => { res(a.duration || 0); URL.revokeObjectURL(u); }; a.onerror = () => res(0); a.src = u; });
        this.local.push({ id, src: 'local', title, artist, album: 'Archivos locales', cover: '', dur, full: true }); n++;
      } catch { toast(`No hay espacio para «${f.name}»`); break; }
    }
    this.save('local'); if (n) toast(`${n} archivo(s) importado(s)`);
    return n;
  }
  async deleteLocal(t) {
    this.local = this.local.filter(x => x.id !== t.id); idb.del(t.id).catch(() => {});
    this.liked = this.liked.filter(x => x.id !== t.id);
    this.playlists.forEach(p => { p.tracks = p.tracks.filter(x => x.id !== t.id); });
    ['local', 'liked', 'playlists'].forEach(k => this.save(k)); toast('Archivo eliminado');
  }

  export() {
    const { liked, playlists, albums, artists, dzplaylists, settings } = this;
    const { ytKey, ...safe } = settings;
    return JSON.stringify({ app: 'listentoo', v: 2, at: new Date().toISOString(), liked, playlists, albums, artists, dzplaylists, settings: safe }, null, 1);
  }
  import(json) {
    const d = JSON.parse(json); if (d.app !== 'listentoo') throw new Error('Archivo no válido');
    const merge = (k, key = 'id') => { const have = new Set(this[k].map(x => x[key])); this[k].push(...(d[k] || []).filter(x => !have.has(x[key]))); this.save(k); };
    ['liked', 'playlists', 'albums', 'artists', 'dzplaylists'].forEach(k => merge(k));
  }
})();
