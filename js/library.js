// User library: likes, playlists, saved albums/artists/playlists, history, local files, settings.
// Local storage is the working copy; when signed in, cloud.js mirrors every change to Supabase
// through `lib.sync(op, payload)` and replaces the arrays with the server state on login.
import { store, uuid, idb, toast } from './util.js';

export const slim = t => {
  const { preview, added, ...rest } = t;
  return rest;
};

export const DEFAULT_SETTINGS = { theme: 'aurora', dynamic: true, motion: true, spin: true, autoplay: true, notify: false };

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
    this.settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
    if ('ytKey' in this.settings) { delete this.settings.ytKey; store.set('settings', this.settings); } // old YouTube setup
    this.sync = null; // set by cloud.js while signed in
  }
  save(k) { store.set(k, this[k]); this.dispatchEvent(new CustomEvent('change', { detail: k })); }
  _sync(op, payload) { try { this.sync?.(op, payload); } catch { /* cloud handles its own errors */ } }

  /* ---- likes ---- */
  isLiked(t) { return !!t && this.liked.some(x => x.id === t.id); }
  get songs() { return this.liked.filter(x => !x.live); }
  get stations() { return this.liked.filter(x => x.live); }
  toggleLike(t) {
    if (!t) return;
    if (t.src === 'local') { toast('Los archivos locales no se pueden guardar en Me gusta'); return; }
    if (this.isLiked(t)) {
      this.liked = this.liked.filter(x => x.id !== t.id); toast(t.live ? 'Emisora eliminada' : 'Eliminada de Me gusta');
      this._sync('like:remove', t.id);
    } else {
      const item = { ...slim(t), added: Date.now() };
      this.liked.unshift(item); toast(t.live ? 'Emisora guardada en Tu radio' : 'Añadida a Me gusta');
      this._sync('like:add', item);
    }
    this.save('liked');
  }

  /* ---- playlists ---- */
  playlist(id) { return this.playlists.find(p => p.id === id); }
  createPlaylist(name, tracks = [], desc = '') {
    const p = { id: uuid(), name: (name || '').trim().slice(0, 100) || `Mi playlist n.º ${this.playlists.length + 1}`, desc, isPublic: false,
      tracks: tracks.filter(t => t.src !== 'local').map(t => ({ ...slim(t), added: Date.now() })), created: Date.now() };
    this.playlists.unshift(p); this.save('playlists'); this._sync('playlist:upsert', p); return p;
  }
  _touch(p) { this.save('playlists'); this._sync('playlist:upsert', p); }
  addToPlaylist(pid, tracks) {
    const p = this.playlist(pid); if (!p) return;
    const fresh = [].concat(tracks).filter(t => t.src !== 'local' && !p.tracks.some(x => x.id === t.id));
    if (!fresh.length) return toast(`Ya está en «${p.name}»`);
    p.tracks.push(...fresh.map(t => ({ ...slim(t), added: Date.now() }))); this._touch(p);
    toast(fresh.length > 1 ? `${fresh.length} canciones añadidas a «${p.name}»` : `Añadida a «${p.name}»`);
  }
  removeFromPlaylist(pid, tid) { const p = this.playlist(pid); if (!p) return; p.tracks = p.tracks.filter(x => x.id !== tid); this._touch(p); }
  movePlaylistTrack(pid, from, to) { const p = this.playlist(pid); if (!p) return; const [x] = p.tracks.splice(from, 1); p.tracks.splice(to, 0, x); this._touch(p); }
  updatePlaylist(pid, patch) { const p = this.playlist(pid); if (!p) return; Object.assign(p, patch); this._touch(p); }
  deletePlaylist(pid) { this.playlists = this.playlists.filter(p => p.id !== pid); this.save('playlists'); this._sync('playlist:delete', pid); }

  /* ---- saved albums / artists / public playlists ---- */
  isSaved(kind, id) { return this[kind + 's'].some(x => String(x.id) === String(id)); }
  toggleSaved(kind, item) {
    const k = kind + 's';
    if (this.isSaved(kind, item.id)) {
      this[k] = this[k].filter(x => String(x.id) !== String(item.id));
      toast(kind === 'artist' ? `Ya no sigues a ${item.name}` : 'Eliminado de tu biblioteca');
      this._sync('saved:remove', { kind, id: String(item.id) });
    } else {
      const { tracks, ...meta } = item; const row = { ...meta, kind, added: Date.now() };
      this[k].unshift(row);
      toast(kind === 'artist' ? `Ahora sigues a ${item.name}` : 'Guardado en tu biblioteca');
      this._sync('saved:add', { kind, item: row });
    }
    this.save(k);
  }

  /* ---- history ---- */
  pushRecent(t) { this.recent = [slim(t), ...this.recent.filter(x => x.id !== t.id)].slice(0, 50); this.save('recent'); }
  pushVisited(item) {
    const key = item.kind + ':' + item.id;
    this.visited = [item, ...this.visited.filter(x => x.kind + ':' + x.id !== key)].slice(0, 12); this.save('visited');
  }
  setSetting(k, v) { this.settings[k] = v; this.save('settings'); this._sync('settings', this.settings); }
  setSettings(obj) { Object.assign(this.settings, obj); this.save('settings'); }

  /* ---- bulk replace (cloud pull / sign out) ---- */
  replaceAll(data) {
    for (const k of ['liked', 'playlists', 'albums', 'artists', 'dzplaylists', 'recent']) {
      if (data[k]) { this[k] = data[k]; store.set(k, this[k]); }
    }
    this.dispatchEvent(new CustomEvent('change', { detail: 'all' }));
  }
  clearPersonal() {
    this.replaceAll({ liked: [], playlists: [], albums: [], artists: [], dzplaylists: [], recent: [] });
    this.visited = []; this.save('visited');
  }

  /* ---- local files ---- */
  async importFiles(files) {
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|flac|wav|ogg|opus|weba)$/i.test(f.name)) continue;
      const id = 'lo:' + uuid();
      const base = f.name.replace(/\.[^.]+$/, ''), parts = base.split(/\s+-\s+/);
      const [artist, title] = parts.length > 1 ? [parts[0], parts.slice(1).join(' - ')] : ['Mi dispositivo', base];
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
    this.save('local'); toast('Archivo eliminado');
  }

  /* ---- export / import (backup) ---- */
  export() {
    const { liked, playlists, albums, artists, dzplaylists, settings } = this;
    return JSON.stringify({ app: 'listentoo', v: 3, at: new Date().toISOString(), liked, playlists, albums, artists, dzplaylists, settings }, null, 1);
  }
  import(json) {
    const d = JSON.parse(json); if (d.app !== 'listentoo') throw new Error('Archivo no válido');
    const add = (k, op) => {
      const have = new Set(this[k].map(x => String(x.id)));
      const fresh = (d[k] || []).filter(x => !have.has(String(x.id)));
      if (k === 'playlists') fresh.forEach(p => { p.id = uuid(); });
      this[k].push(...fresh); this.save(k);
      fresh.forEach(x => op(x));
    };
    add('liked', x => this._sync('like:add', x));
    add('playlists', p => this._sync('playlist:upsert', p));
    add('albums', x => this._sync('saved:add', { kind: 'album', item: x }));
    add('artists', x => this._sync('saved:add', { kind: 'artist', item: x }));
    add('dzplaylists', x => this._sync('saved:add', { kind: 'dzplaylist', item: x }));
  }
})();
