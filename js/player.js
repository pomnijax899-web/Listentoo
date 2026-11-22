// Playback engine: one native <audio> element for every source (catalog previews, full Audius
// and Jamendo tracks, live radio and local files). Native audio keeps playing with the screen
// locked and publishes Media Session metadata, so the OS shows it in the iOS Dynamic Island /
// lock screen, HyperOS & Android media notifications and desktop media hubs.
// Also: context + manual queue, shuffle/repeat, autoplay radio and a sleep timer.
import { store, idb, toast } from './util.js';
import { deezer, findFull, radio } from './api.js';
import { lib } from './library.js';
import { cloud } from './cloud.js';

const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');

export const player = new (class extends EventTarget {
  constructor() {
    super();
    this.current = null;
    this.ctx = { tracks: [], order: [], pos: -1, label: '', href: '' };
    this.manual = [];
    this.shuffle = store.get('shuffle', false);
    this.repeat = store.get('repeat', 0);
    this.volume = store.get('volume', 0.85);
    this.muted = false;
    this.mode = '';              // 'full' | 'preview' | 'live'
    this.loading = false;
    this.sleep = null;
    this._token = 0; this._blob = null; this._hinted = false; this._retries = 0;
    audio.volume = this.volume;

    audio.addEventListener('ended', () => this._ended());
    audio.addEventListener('play', () => this._emit('state'));
    audio.addEventListener('pause', () => this._emit('state'));
    audio.addEventListener('waiting', () => { this.loading = true; this._emit('state'); });
    audio.addEventListener('playing', () => { this.loading = false; this._retries = 0; this._emit('state'); });
    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src') || !this.current) return;
      const t = this.current;
      if (t.live && this._retries < 1) { this._retries++; audio.load(); audio.play().catch(() => {}); return; } // radio hiccup: reconnect once
      toast(t.live ? `La emisora «${t.title}» no responde` : `No se pudo reproducir «${t.title}»`);
      setTimeout(() => this.current === t && this.next(true), 900);
    });
    setInterval(() => { if (!this.paused) { this._emit('time'); this._checkSleep(); } }, 250);
    this._mediaSession();
  }
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  get paused() { return audio.paused; }
  get live() { return !!this.current?.live; }
  get time() { return audio.currentTime || 0; }
  get duration() {
    if (this.live) return 0;
    const d = audio.duration;
    return isFinite(d) && d > 0 ? d : (this.mode === 'preview' ? 30 : this.current?.dur || 0);
  }
  seek(t) {
    if (this.live) return;
    t = Math.max(0, Math.min(t, this.duration - 0.25));
    audio.currentTime = t; this._emit('time');
  }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v)); store.set('volume', this.volume);
    if (this.volume > 0) this.muted = false;
    audio.volume = this.muted ? 0 : this.volume; this._emit('volume');
  }
  toggleMute() { this.muted = !this.muted; audio.volume = this.muted ? 0 : this.volume; this._emit('volume'); }
  play() {
    if (!this.current) { const seed = lib.recent.length ? lib.recent : lib.liked; if (seed.length) this.playList(seed, 0, { label: 'Escuchado recientemente' }); return; }
    if (this.live && audio.paused) { audio.load(); } // jump back to the live edge instead of resuming stale buffer
    audio.play().catch(() => {});
  }
  pause() { audio.pause(); }
  toggle() { this.paused ? this.play() : this.pause(); }

  /* ---- queue ---- */
  playList(tracks, start = 0, { label = '', href = '', shuffle } = {}) {
    if (!tracks?.length) return;
    if (shuffle !== undefined) { this.shuffle = shuffle; store.set('shuffle', shuffle); this._emit('mode'); }
    if (this.shuffle && shuffle) start = Math.floor(Math.random() * tracks.length);
    this.ctx = { tracks: tracks.slice(), order: [...tracks.keys()], pos: start, label, href };
    if (this.shuffle) this._shuffleOrder();
    this._load(this.ctx.tracks[this.ctx.order[this.ctx.pos]]);
  }
  _shuffleOrder() {
    const c = this.ctx, curIdx = c.order[c.pos], rest = c.order.filter(i => i !== curIdx);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    c.order = curIdx === undefined ? rest : [curIdx, ...rest]; c.pos = curIdx === undefined ? -1 : 0;
  }
  setShuffle(v) {
    this.shuffle = v; store.set('shuffle', v);
    const c = this.ctx;
    if (c.tracks.length) {
      if (v) this._shuffleOrder();
      else { const curIdx = c.order[c.pos]; c.order = [...c.tracks.keys()]; c.pos = Math.max(0, curIdx ?? 0); }
    }
    this._emit('mode'); this._emit('queue');
  }
  cycleRepeat() { this.repeat = (this.repeat + 1) % 3; store.set('repeat', this.repeat); this._emit('mode'); }
  get upcoming() { const c = this.ctx; return c.order.slice(c.pos + 1).map(i => c.tracks[i]); }
  addToQueue(tracks) {
    tracks = [].concat(tracks);
    if (!this.current) return this.playList(tracks, 0, { label: 'Cola' });
    this.manual.push(...tracks); this._emit('queue');
    toast(tracks.length > 1 ? `${tracks.length} canciones añadidas a la cola` : 'Añadida a la cola');
  }
  playNext(t) { if (!this.current) return this.playList([t]); this.manual.unshift(t); this._emit('queue'); toast('Sonará a continuación'); }
  removeManual(i) { this.manual.splice(i, 1); this._emit('queue'); }
  clearManual() { this.manual = []; this._emit('queue'); }
  jumpManual(i) { const [t] = this.manual.splice(i, 1); this.manual.splice(0, i); this._load(t); }
  jumpUpcoming(i) { this.ctx.pos += i + 1; this._load(this.ctx.tracks[this.ctx.order[this.ctx.pos]]); }

  async next(auto = false) {
    if (!this.current) return;
    if (auto && this.repeat === 2 && !this.live) { this.seek(0); this.play(); return; }
    if (this.manual.length) return this._load(this.manual.shift());
    const c = this.ctx;
    if (c.pos + 1 < c.order.length) { c.pos++; return this._load(c.tracks[c.order[c.pos]]); }
    if ((this.repeat === 1 || this.live) && c.tracks.length > 1) { if (this.shuffle) { c.pos = -1; this._shuffleOrder(); } c.pos = 0; return this._load(c.tracks[c.order[0]]); }
    if (!this.live && lib.settings.autoplay && await this._autoplay()) return;
    if (auto) { this.pause(); if (!this.live) this.seek(0); } else if (c.tracks.length) { c.pos = 0; this._load(c.tracks[c.order[0]]); }
  }
  prev() {
    if (!this.live && (this.time > 3 || this.ctx.pos <= 0)) return this.seek(0);
    if (this.ctx.pos <= 0) return;
    this.ctx.pos--; this._load(this.ctx.tracks[this.ctx.order[this.ctx.pos]]);
  }
  async _autoplay() {
    const seed = this.current;
    try {
      let artistId = seed.artistId;
      if (!artistId) { const r = await deezer.search(`${seed.artist} ${seed.title}`, 1); artistId = r[0]?.artistId; }
      if (!artistId) return false;
      const played = new Set([...lib.recent.slice(0, 30), ...this.ctx.tracks].map(t => t.id));
      const list = (await deezer.artistRadio(artistId)).filter(t => !played.has(t.id));
      if (!list.length) return false;
      toast('Reproducción automática: canciones parecidas');
      this.playList(list, 0, { label: `Radio de ${seed.artist}`, href: `#/artista/${artistId}` });
      return true;
    } catch { return false; }
  }
  _ended() {
    if (this.sleep?.endOfTrack) { this.sleep = null; this.pause(); this._emit('sleep'); toast('Temporizador: música detenida'); return; }
    this.next(true);
  }

  /* ---- loading ---- */
  async _load(t) {
    if (!t) return;
    const token = ++this._token;
    this.current = t; this.loading = true; this.mode = ''; this._retries = 0;
    this._emit('track'); this._emit('queue'); this._emit('state');
    lib.pushRecent(t); cloud.logPlay(t);
    try {
      if (t.src === 'local') {
        const blob = await idb.get(t.id); if (!blob) throw new Error('Archivo no encontrado en este dispositivo');
        if (this._blob) URL.revokeObjectURL(this._blob);
        this._blob = URL.createObjectURL(blob);
        return await this._play(this._blob, 'full', token);
      }
      if (t.src === 'radio') {
        let url = t.url;
        if (!url) { const s = await radio.byUuid(t.id); if (!s) throw new Error('Esta emisora ya no está disponible'); url = t.url = s.url; }
        radio.click(t.id);
        return await this._play(url, 'live', token);
      }
      if (t.full && t.url) return await this._play(t.url, 'full', token);
      // catalog track: use the artist's own full upload when it exists, otherwise the 30 s preview
      const full = await findFull(t);
      if (token !== this._token) return;
      if (full) return await this._play(full.url, 'full', token);
      if (!this._hinted) { this._hinted = true; this._emit('hint', 'preview'); }
      let url = '';
      try { url = await deezer.freshPreview(t.dz); } catch { url = t.preview; }
      if (token !== this._token) return;
      if (!url) throw new Error(`«${t.title}» no tiene audio disponible`);
      return await this._play(url, 'preview', token);
    } catch (e) {
      if (token !== this._token) return;
      this.loading = false; this._emit('state');
      toast(e.message || 'Error de reproducción'); setTimeout(() => token === this._token && this.next(true), 1200);
    }
  }
  async _play(url, mode, token) {
    this.mode = mode; this._emit('engine');
    audio.src = url;
    try { await audio.play(); }
    catch (e) {
      if (e.name === 'NotAllowedError' && token === this._token) { this.loading = false; this._emit('state'); return; }
      if (e.name !== 'AbortError') throw e;
    }
    if (token === this._token) { this.loading = false; this._emit('state'); }
  }

  /* ---- sleep timer ---- */
  setSleep(minutes) {
    if (minutes === 'track') this.sleep = { endOfTrack: true };
    else if (minutes) this.sleep = { until: Date.now() + minutes * 60e3 };
    else this.sleep = null;
    this._emit('sleep');
    toast(this.sleep ? (this.sleep.endOfTrack ? 'Se detendrá al acabar la canción' : `Se detendrá en ${minutes} min`) : 'Temporizador desactivado');
  }
  _checkSleep() { if (this.sleep?.until && Date.now() >= this.sleep.until) { this.sleep = null; this.pause(); this._emit('sleep'); toast('Temporizador: música detenida'); } }

  /* ---- OS media controls: Dynamic Island, lock screen, HyperOS / Android notification, desktop hubs ---- */
  _mediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers = {
      play: () => this.play(), pause: () => this.pause(), stop: () => this.pause(),
      previoustrack: () => this.prev(), nexttrack: () => this.next(),
      seekto: e => this.seek(e.seekTime), seekbackward: e => this.seek(this.time - (e.seekOffset || 10)), seekforward: e => this.seek(this.time + (e.seekOffset || 10))
    };
    const setHandlers = live => Object.entries(handlers).forEach(([a, h]) => {
      try { ms.setActionHandler(a, live && a.startsWith('seek') ? null : h); } catch { /* unsupported on this platform */ }
    });
    setHandlers(false);
    const art = t => {
      const base = t.cover || '';
      if (/dzcdn\.net\/images\/cover/.test(base)) return [96, 128, 256, 512, 1000].map(s => ({ src: base.replace(/\/\d+x\d+-/, `/${s}x${s}-`), sizes: `${s}x${s}`, type: 'image/jpeg' }));
      const fallback = { src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' };
      return base ? [{ src: base, sizes: '300x300' }, ...(t.coverXL ? [{ src: t.coverXL, sizes: '1000x1000' }] : []), fallback] : [fallback];
    };
    this.addEventListener('track', () => {
      const t = this.current;
      try { ms.metadata = new MediaMetadata({ title: t.title, artist: t.live ? 'Radio en directo · Listentoo' : t.artist, album: t.live ? t.artist : (t.album || 'Listentoo'), artwork: art(t) }); } catch { /* */ }
      setHandlers(!!t.live);
    });
    this.addEventListener('state', () => { ms.playbackState = this.paused ? 'paused' : 'playing'; });
    this.addEventListener('time', () => {
      const d = this.duration; if (!d) return;
      try { ms.setPositionState({ duration: d, position: Math.min(this.time, d), playbackRate: 1 }); } catch { /* */ }
    });
  }
})();
