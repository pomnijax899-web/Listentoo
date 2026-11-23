// Plans and the 24 h listening window.
//  free  : 5 h of listening and 5 skips per window      pro  : unlimited time, 100 skips, gold frame
//  max   : unlimited, profile photo, diamond frame       ultra: unlimited, photo, obsidian frame, own uploads
//  admin : everything unlimited + crown
// Signed-in users are metered by the server (track_usage RPC); guests get the Free plan metered locally.
import { store } from './util.js';
import { cloud } from './cloud.js';

export const PLANS = {
  free:  { id: 'free',  name: 'Free',  tagline: 'Para descubrir',        seconds: 5 * 3600, skips: 5,    photo: false, upload: false, frame: 'Sin marco' },
  pro:   { id: 'pro',   name: 'Pro',   tagline: 'Escucha sin reloj',     seconds: null,     skips: 100,  photo: false, upload: false, frame: 'Marco de oro' },
  max:   { id: 'max',   name: 'Max',   tagline: 'Sin límites, con estilo', seconds: null,   skips: null, photo: true,  upload: false, frame: 'Marco de diamante' },
  ultra: { id: 'ultra', name: 'Ultra', tagline: 'Tu propio escenario',   seconds: null,     skips: null, photo: true,  upload: true,  frame: 'Marco de obsidiana' }
};
const DAY = 864e5;
const FREE = { seconds: PLANS.free.seconds, skips: PLANS.free.skips };

export const quota = new (class extends EventTarget {
  constructor() {
    super();
    this.state = { plan: 'free', listen: 0, skips: 0, resetsAt: Date.now() + DAY, limits: FREE };
    this.pending = 0; this._flushing = null; this._lastSave = 0;
    this._loadGuest();
    cloud.addEventListener('auth', () => this.refresh());
    setInterval(() => this._rollover(), 30e3);
  }
  emit(type) { this.dispatchEvent(new Event(type)); }

  /* ---- reading ---- */
  get plan() { return this.state.plan; }
  get isAdmin() { return this.state.plan === 'admin'; }
  get unlimitedTime() { return this.state.limits.seconds == null; }
  get unlimitedSkips() { return this.state.limits.skips == null; }
  get secondsLeft() { return this.unlimitedTime ? Infinity : Math.max(0, this.state.limits.seconds - this.state.listen - this.pending); }
  get skipsLeft() { return this.unlimitedSkips ? Infinity : Math.max(0, this.state.limits.skips - this.state.skips); }
  get exhausted() { return this.secondsLeft <= 0; }
  get resetsIn() { return Math.max(0, this.state.resetsAt - Date.now()); }
  can(feature) { const p = this.isAdmin ? PLANS.ultra : PLANS[this.state.plan] || PLANS.free; return !!p[feature]; }

  /* ---- server sync ---- */
  _apply(r) {
    if (!r) return;
    this.state = { plan: r.plan || 'free', listen: r.listen_seconds || 0, skips: r.skips || 0, resetsAt: Date.parse(r.resets_at) || Date.now() + DAY, limits: r.limits || FREE };
    this.emit('change');
  }
  async refresh() {
    if (!cloud.signedIn) { this._loadGuest(); this.emit('change'); return; }
    try { this._apply(await cloud.trackUsage(0, false)); } catch { /* offline: keep the last known state */ }
  }
  async _flush() {
    if (!cloud.signedIn || this.pending < 1 || this._flushing) return;
    const secs = Math.min(120, Math.round(this.pending));
    this._flushing = cloud.trackUsage(secs, false).then(r => { this.pending = Math.max(0, this.pending - secs); this._apply(r); }).catch(() => {}).finally(() => { this._flushing = null; });
  }

  /* ---- guests ---- */
  _loadGuest() {
    if (cloud.signedIn) return;
    const g = store.get('quota', null);
    const fresh = !g || Date.now() - g.start >= DAY;
    const w = fresh ? { start: Date.now(), listen: 0, skips: 0 } : g;
    if (fresh) store.set('quota', w);
    this.state = { plan: 'free', listen: w.listen, skips: w.skips, resetsAt: w.start + DAY, limits: FREE };
  }
  _saveGuest() { store.set('quota', { start: this.state.resetsAt - DAY, listen: Math.round(this.state.listen), skips: this.state.skips }); }
  _rollover() {
    if (Date.now() >= this.state.resetsAt) { cloud.signedIn ? this.refresh() : (store.del('quota'), this._loadGuest(), this.emit('change')); }
  }

  /* ---- metering, called by the player ---- */
  tick(dt) {
    if (this.unlimitedTime) return true; // nothing to meter
    if (cloud.signedIn) { this.pending += dt; if (this.pending >= 30) this._flush(); }
    else { this.state.listen += dt; if (Date.now() - this._lastSave > 5000) { this._lastSave = Date.now(); this._saveGuest(); } }
    if (Date.now() - (this._lastEmit || 0) > 5000) { this._lastEmit = Date.now(); this.emit('change'); }
    if (this.exhausted) { this._flush(); this.emit('limit'); return false; }
    return true;
  }
  async trySkip() {
    if (this.unlimitedSkips) return true;
    if (this.skipsLeft <= 0) return false;
    if (!cloud.signedIn) { this.state.skips++; this._saveGuest(); this.emit('change'); return true; }
    try { const r = await cloud.trackUsage(0, true); this._apply(r); return !!r.allowed; }
    catch { return this.skipsLeft > 0; } // offline: trust the cached counter
  }
})();

export const fmtLeft = ms => { const m = Math.ceil(ms / 60000), h = Math.floor(m / 60); return h ? (m % 60 ? `${h} h ${m % 60} min` : `${h} h`) : `${m} min`; };
export const fmtSecs = s => s === Infinity ? 'Ilimitado' : fmtLeft(s * 1000);
