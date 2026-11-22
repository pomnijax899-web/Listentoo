// Playback: context + manual queue, shuffle/repeat, autoplay radio, sleep timer and two engines
// (HTML audio, official YouTube IFrame player) behind one interface. Publishes Media Session
// metadata so the OS can show the track in the iOS Dynamic Island / lock screen, HyperOS and
// Android media notifications, and desktop media hubs.
import { store, idb, toast } from './util.js';
import { deezer } from './api.js';
import { lib } from './library.js';
import { cloud } from './cloud.js';

const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');

const yt = {
  ready: null, player: null,
  load() {
    if (this.ready) return this.ready;
    this.ready = new Promise((res, rej) => {
      const t = setTimeout(() => { this.ready = null; rej(new Error('No se pudo cargar el reproductor')); }, 15000);
      window.onYouTubeIframeAPIReady = () => {
        this.player = new YT.Player('ytHost', {
          width: '100%', height: '100%',
          playerVars: { playsinline: 1, controls: 0, rel: 0, iv_load_policy: 3, disablekb: 1, fs: 0, origin: location.origin },
          events: {
            onReady: () => { clearTimeout(t); res(this.player); },
            onStateChange: e => this.onState(e.data),
            onError: e => this.onError(e.data)
          }
        });
      };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { clearTimeout(t); this.ready = null; rej(new Error('No se pudo cargar el reproductor')); };
      document.head.append(s);
    });
    return this.ready;
  },
  onState() {}, onError() {}
};

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
    this.engine = 'audio';
    this.mode = '';              // 'full' | 'preview' | 'yt'
    this.reason = '';            // why a preview is playing: guest | not_configured | quota | not_found | ...
    this.loading = false;
    this.sleep = null;
    this._token = 0; this._blob = null; this._ytPlaying = false; this._hinted = false;
    audio.volume = this.volume;

    audio.addEventListener('ended', () => this.engine === 'audio' && this._ended());
    audio.addEventListener('play', () => this._emit('state'));
    audio.addEventListener('pause', () => this._emit('state'));
    audio.addEventListener('waiting', () => { this.loading = true; this._emit('state'); });
    audio.addEventListener('playing', () => { this.loading = false; this._emit('state'); });
    audio.addEventListener('error', () => {
      if (this.engine !== 'audio' || !audio.getAttribute('src') || !this.current) return;
      toast(`No se pudo reproducir «${this.current.title}»`); setTimeout(() => this.next(true), 900);
    });
    yt.onState = s => {
      if (this.engine !== 'yt') return;
      this._ytPlaying = s === 1; this.loading = s === 3;
      if (s === 0) this._ended();
      this._emit('state');
    };
    yt.onError = () => { if (this.engine === 'yt' && this.current) { toast('Ese vídeo no está disponible aquí: usando la vista previa'); this.reason = 'unavailable'; this._playPreview(this.current, this._token); } };
    setInterval(() => { if (!this.paused) { this._emit('time'); this._checkSleep(); } }, 250);
    this._mediaSession();
  }
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  get paused() { return this.engine === 'yt' ? !this._ytPlaying : audio.paused; }
  get time() { return this.engine === 'yt' ? (yt.player?.getCurrentTime?.() || 0) : audio.currentTime; }
  get duration() {
    const d = this.engine === 'yt' ? yt.player?.getDuration?.() : audio.duration;
    return isFinite(d) && d > 0 ? d : (this.mode === 'preview' ? 30 : this.current?.dur || 0);
  }
  seek(t) {
    t = Math.max(0, Math.min(t, this.duration - 0.25));
    this.engine === 'yt' ? yt.player?.seekTo(t, true) : (audio.currentTime = t);
    this._emit('time');
  }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v)); store.set('volume', this.volume);
    if (this.volume > 0) this.muted = false;
    this._applyVolume(); this._emit('volume');
  }
  toggleMute() { this.muted = !this.muted; this._applyVolume(); this._emit('volume'); }
  _applyVolume() { const v = this.muted ? 0 : this.volume; audio.volume = v; yt.player?.setVolume?.(Math.round(v * 100)); }
  play() {
    if (!this.current) { const seed = lib.recent.length ? lib.recent : lib.liked; if (seed.length) this.playList(seed, 0, { label: 'Escuchado recientemente' }); return; }
    if (this.engine === 'yt') yt.player?.playVideo(); else audio.play().catch(() => {});
  }
  pause() { this.engine === 'yt' ? yt.player?.pauseVideo() : audio.pause(); }
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
    if (auto && this.repeat === 2) { this.seek(0); this.play(); return; }
    if (this.manual.length) return this._load(this.manual.shift());
    const c = this.ctx;
    if (c.pos + 1 < c.order.length) { c.pos++; return this._load(c.tracks[c.order[c.pos]]); }
    if (this.repeat === 1 && c.tracks.length) { if (this.shuffle) { c.pos = -1; this._shuffleOrder(); } c.pos = 0; return this._load(c.tracks[c.order[0]]); }
    if (lib.settings.autoplay && await this._autoplay()) return;
    if (auto) { this.pause(); this.seek(0); } else if (c.tracks.length) { c.pos = 0; this._load(c.tracks[c.order[0]]); }
  }
  prev() {
    if (this.time > 3 || this.ctx.pos <= 0) return this.seek(0);
    this.ctx.pos--; this._load(this.ctx.tracks[this.ctx.order[this.ctx.pos]]);
  }
  async _autoplay() {
    const seed = this.current;
    try {
      let artistId = seed.artistId;
      if (!artistId) { const r = await deezer.search(`${seed.artist} ${seed.title}`, 1); artistId = r[0]?.artistId; }
      if (!artistId) return false;
      const played = new Set([...lib.recent.slice(0, 30), ...this.ctx.tracks].map(t => t.id));
      const radio = (await deezer.artistRadio(artistId)).filter(t => !played.has(t.id));
      if (!radio.length) return false;
      toast('Reproducción automática: canciones parecidas');
      this.playList(radio, 0, { label: `Radio de ${seed.artist}`, href: `#/artista/${artistId}` });
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
    this.current = t; this.loading = true; this.mode = ''; this.reason = '';
    this._emit('track'); this._emit('queue'); this._emit('state');
    lib.pushRecent(t); cloud.logPlay(t);
    try {
      if (t.src === 'local') {
        const blob = await idb.get(t.id); if (!blob) throw new Error('Archivo no encontrado en este dispositivo');
        if (this._blob) URL.revokeObjectURL(this._blob);
        this._blob = URL.createObjectURL(blob);
        return this._playAudio(this._blob, 'full', token);
      }
      if (t.src === 'audius' || t.full) return this._playAudio(t.url, 'full', token);
      const r = await cloud.resolve(t);
      if (token !== this._token) return;
      if (r.videoId) return this._playYT(r.videoId, token);
      this.reason = r.error || 'network';
      if (!this._hinted || r.error === 'quota' || r.error === 'rate_limited') { this._hinted = true; this._emit('hint', this.reason); }
      return this._playPreview(t, token);
    } catch (e) {
      if (token !== this._token) return;
      this.loading = false; this._emit('state');
      toast(e.message || 'Error de reproducción'); setTimeout(() => token === this._token && this.next(true), 1200);
    }
  }
  async _playPreview(t, token) {
    let url = '';
    try { url = await deezer.freshPreview(t.dz); } catch { url = t.preview; }
    if (token !== this._token) return;
    if (!url) throw new Error(`«${t.title}» no tiene audio disponible`);
    return this._playAudio(url, 'preview', token);
  }
  async _playAudio(url, mode, token) {
    if (this.engine === 'yt') { yt.player?.stopVideo?.(); this._ytPlaying = false; }
    this.engine = 'audio'; this.mode = mode; this._emit('engine');
    audio.src = url;
    try { await audio.play(); }
    catch (e) {
      if (e.name === 'NotAllowedError' && token === this._token) { this.loading = false; this._emit('state'); return; }
      if (e.name !== 'AbortError') throw e;
    }
    if (token === this._token) { this.loading = false; this._emit('state'); }
  }
  async _playYT(vid, token) {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    this.engine = 'yt'; this.mode = 'yt'; this._emit('engine');
    try {
      const p = await yt.load();
      if (token !== this._token) return;
      this._applyVolume();
      p.loadVideoById(vid);
    } catch (e) {
      if (token !== this._token) return;
      toast(e.message + ' · usando vista previa'); this.reason = 'unavailable';
      this._playPreview(this.current, token);
    }
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
    [['play', () => this.play()], ['pause', () => this.pause()], ['stop', () => this.pause()],
     ['previoustrack', () => this.prev()], ['nexttrack', () => this.next()],
     ['seekto', e => this.seek(e.seekTime)], ['seekbackward', e => this.seek(this.time - (e.seekOffset || 10))], ['seekforward', e => this.seek(this.time + (e.seekOffset || 10))]
    ].forEach(([a, h]) => { try { ms.setActionHandler(a, h); } catch { /* unsupported on this platform */ } });
    const art = t => {
      const base = t.cover || '';
      if (/dzcdn\.net\/images\/cover/.test(base)) return [96, 128, 256, 512, 1000].map(s => ({ src: base.replace(/\/\d+x\d+-/, `/${s}x${s}-`), sizes: `${s}x${s}`, type: 'image/jpeg' }));
      return [base && { src: base, sizes: '480x480' }, t.coverXL && { src: t.coverXL, sizes: '1000x1000' }, { src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }].filter(Boolean);
    };
    this.addEventListener('track', () => {
      const t = this.current;
      try { ms.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album || 'Listentoo', artwork: art(t) }); } catch { /* */ }
    });
    this.addEventListener('state', () => { ms.playbackState = this.paused ? 'paused' : 'playing'; });
    this.addEventListener('time', () => {
      const d = this.duration; if (!d) return;
      try { ms.setPositionState({ duration: d, position: Math.min(this.time, d), playbackRate: 1 }); } catch { /* */ }
    });
  }
})();
