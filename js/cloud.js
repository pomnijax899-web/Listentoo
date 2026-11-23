// Supabase integration: auth, cross-device library sync (with realtime), play history,
// admin API, announcements and full-length track resolution through the edge function.
// The Supabase SDK is loaded lazily so the app paints before it arrives.
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL } from './config.js';
import { lib, slim } from './library.js';
import { store, toast, debounce, uuid, isUuid } from './util.js';
import { trackFromRef, jamendo } from './api.js';

export let sb = null;
let sbLoading = null;
export const getSb = () => sbLoading || (sbLoading = import(SDK).then(({ createClient }) => (sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'lt-auth' }
}))));
// quick hint (no network) so the UI can show "signed in" styling before the SDK loads
export const hasStoredSession = () => { try { return !!localStorage.getItem('lt-auth'); } catch { return false; } };

const ERR = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.',
  'User already registered': 'Ya existe una cuenta con ese correo.',
  'Password should be at least 6 characters.': 'La contraseña debe tener al menos 6 caracteres.',
  'email rate limit exceeded': 'Se han enviado demasiados correos. Inténtalo más tarde.',
  'For security purposes, you can only request this after': 'Por seguridad, espera unos segundos antes de volver a intentarlo.',
  'New password should be different from the old password.': 'La nueva contraseña debe ser distinta de la actual.'
};
export const friendly = e => {
  const m = e?.message || String(e || 'Error');
  const k = Object.keys(ERR).find(k => m.includes(k));
  return k ? ERR[k] : m;
};

const toRow = (kind, item) => ({ kind, item_id: String(item.id).slice(0, 100), data: kind === 'liked' ? slim(item) : item, added_at: new Date(item.added || Date.now()).toISOString() });
const fromPlaylist = r => ({ id: r.id, name: r.name, desc: r.description || '', tracks: r.tracks || [], isPublic: r.is_public, created: Date.parse(r.created_at), updated: Date.parse(r.updated_at) });

export const cloud = new (class extends EventTarget {
  constructor() {
    super();
    this.user = null; this.profile = null; this.isAdmin = false; this.ready = false;
    this.announcement = null; this.jamendoId = ''; this.pending = 0; this._channel = null; this._uid = null;
    this._plTimers = new Map();
    this.pullSoon = debounce(() => this.pull(), 1200);
    this.saveSettingsSoon = debounce(s => this._saveSettings(s), 1500);
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  get signedIn() { return !!this.user; }
  get plan() { return this.isAdmin ? 'admin' : (this.profile?.plan || 'free'); }
  get card() { return { name: this.profile?.display_name || this.user?.email || '?', hue: this.profile?.avatar_hue ?? 275, url: this.profile?.avatar_url || '', plan: this.profile?.plan || 'free', admin: this.isAdmin }; }

  async init() {
    await getSb();
    sb.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') { this.recovering = true; setTimeout(() => this.emit('recovery'), 0); }
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) setTimeout(() => this._apply(s, event), 0);
    });
    let session = null;
    try { ({ data: { session } } = await sb.auth.getSession()); } catch { /* offline */ }
    await this._apply(session);
    store.del('ytmap'); // memory from the old YouTube-based player
    await this.loadAnnouncement();
    sb.channel('app-config').on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, () => this.loadAnnouncement()).subscribe();
    this.ready = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.user) this.pullSoon(); });
  }

  async _apply(session, event) {
    const user = session?.user || null;
    if (user && this._uid === user.id) { this.user = user; if (event === 'USER_UPDATED') this.emit('auth'); return; }
    if (!user) {
      const wasIn = !!this._uid;
      this.user = null; this.profile = null; this.isAdmin = false; this._uid = null;
      lib.sync = null; this._unsubscribe();
      if (wasIn && event === 'SIGNED_OUT') lib.clearPersonal();
      this.emit('auth'); return;
    }
    this.user = user; this._uid = user.id;
    let profile = null, adm = null;
    try {
      [{ data: profile }, { data: adm }] = await Promise.all([
        sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
      ]);
    } catch { /* offline: keep going with defaults */ }
    this.profile = profile || { display_name: user.email.split('@')[0], avatar_hue: 275, settings: {} };
    this.isAdmin = !!adm;
    if (this.profile.settings && Object.keys(this.profile.settings).length) lib.setSettings(this.profile.settings);
    else this._saveSettings(lib.settings);
    await this.firstSync();
    lib.sync = (op, payload) => this._push(op, payload);
    this._subscribe();
    this.emit('auth');
  }

  /* ---------------- auth ---------------- */
  async signUp(email, password, name) {
    await getSb();
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: APP_URL } });
    if (error) throw new Error(friendly(error));
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error(ERR['User already registered']);
    return { needsConfirm: !data.session };
  }
  async signIn(email, password) { await getSb(); const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new Error(friendly(error)); }
  async signOut() { await getSb(); await sb.auth.signOut(); }
  async resetPassword(email) { await getSb(); const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL }); if (error) throw new Error(friendly(error)); }
  async updatePassword(password) { await getSb(); const { error } = await sb.auth.updateUser({ password }); if (error) throw new Error(friendly(error)); }
  async updateProfile(patch) {
    await getSb();
    const { data, error } = await sb.from('profiles').update(patch).eq('id', this.user.id).select().single();
    if (error) throw new Error(friendly(error));
    this.profile = data; this.emit('auth');
  }
  async deleteAccount() {
    await getSb();
    const { error } = await sb.rpc('delete_my_account'); if (error) throw new Error(friendly(error));
    store.del('synced:' + this._uid);
    await sb.auth.signOut().catch(() => {});
    this._apply(null, 'SIGNED_OUT');
  }
  async _saveSettings(settings) {
    if (!this.user) return;
    const { error } = await sb.from('profiles').update({ settings }).eq('id', this.user.id);
    if (!error && this.profile) this.profile.settings = settings;
  }

  /* ---------------- sync ---------------- */
  async fetchAll() {
    const [items, pls, plays] = await Promise.all([
      sb.from('library_items').select('kind,item_id,data,added_at').order('added_at', { ascending: false }).limit(5000),
      sb.from('playlists').select('*').eq('user_id', this.user.id).order('created_at', { ascending: false }),
      sb.from('plays').select('track_id,title,artist,cover,played_at').order('played_at', { ascending: false }).limit(150)
    ]);
    for (const r of [items, pls, plays]) if (r.error) throw r.error;
    const out = { liked: [], albums: [], artists: [], dzplaylists: [] };
    for (const r of items.data) {
      const row = { ...r.data, added: Date.parse(r.added_at) };
      if (r.kind === 'liked') out.liked.push({ ...row, id: r.item_id });
      else out[r.kind + 's']?.push({ ...row, kind: r.kind });
    }
    out.playlists = pls.data.map(fromPlaylist);
    const seen = new Set(); out.recent = [];
    for (const p of plays.data) { if (seen.has(p.track_id)) continue; seen.add(p.track_id); const t = trackFromRef(p); if (t) out.recent.push(t); if (out.recent.length >= 50) break; }
    return out;
  }
  async firstSync() {
    const key = 'synced:' + this.user.id;
    try {
      const remote = await this.fetchAll();
      if (!store.get(key, false)) {
        // first sign-in on this device: upload anything the guest saved locally
        const have = { liked: new Set(remote.liked.map(x => x.id)), album: new Set(remote.albums.map(x => String(x.id))), artist: new Set(remote.artists.map(x => String(x.id))), dzplaylist: new Set(remote.dzplaylists.map(x => String(x.id))) };
        const rows = [
          ...lib.liked.filter(t => !have.liked.has(t.id)).map(t => toRow('liked', t)),
          ...lib.albums.filter(a => !have.album.has(String(a.id))).map(a => toRow('album', a)),
          ...lib.artists.filter(a => !have.artist.has(String(a.id))).map(a => toRow('artist', a)),
          ...lib.dzplaylists.filter(a => !have.dzplaylist.has(String(a.id))).map(a => toRow('dzplaylist', a))
        ];
        if (rows.length) await sb.from('library_items').upsert(rows);
        const remoteIds = new Set(remote.playlists.map(p => p.id));
        const newPls = lib.playlists.filter(p => !remoteIds.has(p.id)).map(p => ({ id: isUuid(p.id) ? p.id : uuid(), name: p.name, description: p.desc || '', tracks: p.tracks, is_public: !!p.isPublic }));
        if (newPls.length) await sb.from('playlists').insert(newPls);
        const n = rows.length + newPls.length;
        if (n) toast(`Se subieron ${n} elementos de este dispositivo a tu cuenta`);
        store.set(key, true);
        const merged = await this.fetchAll();
        merged.recent = mergeRecent(merged.recent, lib.recent);
        lib.replaceAll(merged);
      } else {
        remote.recent = mergeRecent(remote.recent, lib.recent);
        lib.replaceAll(remote);
      }
    } catch (e) { console.warn('sync', e); toast('No se pudo sincronizar tu biblioteca. Se usará la copia local.'); }
  }
  async pull() {
    if (!this.user || this.pending > 0) { if (this.user) this.pullSoon(); return; }
    try { const r = await this.fetchAll(); r.recent = mergeRecent(r.recent, lib.recent); lib.replaceAll(r); this.emit('synced'); } catch { /* offline */ }
  }
  async _push(op, payload) {
    if (!this.user) return;
    if (op === 'settings') { this.saveSettingsSoon({ ...payload }); return; }
    if (op === 'playlist:upsert') { // coalesce rapid edits (reorders, renames)
      clearTimeout(this._plTimers.get(payload.id));
      this.pending++;
      this._plTimers.set(payload.id, setTimeout(() => {
        this._plTimers.delete(payload.id);
        this._run(() => sb.from('playlists').upsert({ id: payload.id, name: payload.name.slice(0, 100), description: (payload.desc || '').slice(0, 300), tracks: payload.tracks, is_public: !!payload.isPublic }));
        this.pending--;
      }, 700));
      return;
    }
    const q = {
      'like:add': () => sb.from('library_items').upsert(toRow('liked', payload)),
      'like:remove': () => sb.from('library_items').delete().match({ kind: 'liked', item_id: payload }),
      'saved:add': () => sb.from('library_items').upsert(toRow(payload.kind, payload.item)),
      'saved:remove': () => sb.from('library_items').delete().match({ kind: payload.kind, item_id: payload.id }),
      'playlist:delete': () => sb.from('playlists').delete().eq('id', payload)
    }[op];
    if (q) this._run(q);
  }
  async _run(fn) {
    this.pending++;
    try { const { error } = await fn(); if (error) throw error; }
    catch (e) { console.warn(e); toast('No se pudo guardar en la nube. Se reintentará al volver.'); this.pullSoon(); }
    finally { this.pending--; }
  }
  _subscribe() {
    this._unsubscribe();
    const f = `user_id=eq.${this.user.id}`;
    this._channel = sb.channel('lib-' + this.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'library_items', filter: f }, () => this.pullSoon())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlists', filter: f }, () => this.pullSoon())
      .subscribe();
  }
  _unsubscribe() { if (this._channel) { sb.removeChannel(this._channel); this._channel = null; } }

  /* ---------------- history ---------------- */
  logPlay(t) {
    if (!sb || !this.user || !t || t.src === 'local') return;
    sb.from('plays').insert({ track_id: t.id.slice(0, 100), title: (t.title || '').slice(0, 300), artist: (t.artist || '').slice(0, 300), cover: (t.cover || '').slice(0, 500) }).then(() => {}, () => {});
  }
  async stats() {
    await getSb();
    const { data } = await sb.from('plays').select('artist,title,track_id,cover,played_at').order('played_at', { ascending: false }).limit(1000);
    return data || [];
  }
  async clearHistory() { await getSb(); if (this.user) await sb.from('plays').delete().eq('user_id', this.user.id); }

  /* ---------------- public playlists ---------------- */
  async publicPlaylist(id) {
    await getSb();
    const { data, error } = await sb.from('playlists').select('id,name,description,tracks,is_public,created_at,updated_at,user_id').eq('id', id).maybeSingle();
    if (error) throw error; return data ? fromPlaylist(data) : null;
  }

  /* ---------------- full-length playback via YouTube's official embedded player ---------------- */
  async resolve(t, exclude = []) {
    const map = store.get('ytmap2', {});
    if (!exclude.length && map[t.id]) return { videoId: map[t.id] };
    if (lib.settings.youtube === false) return { error: 'disabled' };
    const remember = v => { map[t.id] = v; const ks = Object.keys(map); if (ks.length > 4000) delete map[ks[0]]; store.set('ytmap2', map); };
    await getSb();
    if (!exclude.length) { // shared cache: songs anyone already resolved play complete for everyone, guests included
      try { const { data } = await sb.from('yt_matches').select('video_id').eq('track_id', t.id).maybeSingle(); if (data?.video_id) { remember(data.video_id); return { videoId: data.video_id }; } } catch { /* offline */ }
    }
    if (!this.user) return { error: 'guest' };
    const { data, error } = await sb.functions.invoke('resolve-track', { body: { id: t.id, title: t.title, artist: t.artist, dur: Math.round(t.dur || 0), exclude } });
    if (error) {
      let body = {};
      try { body = await error.context.json(); } catch { /* network */ }
      return { error: body.error || 'network', message: body.message };
    }
    if (data?.videoId) remember(data.videoId);
    return data || { error: 'network' };
  }
  forgetVideo(t) { const map = store.get('ytmap2', {}); delete map[t.id]; store.set('ytmap2', map); }

  /* ---------------- plans & 24 h usage ---------------- */
  async trackUsage(seconds = 0, skip = false) {
    await getSb();
    const { data, error } = await sb.rpc('track_usage', { p_seconds: Math.round(seconds), p_skip: !!skip });
    if (error) throw new Error(friendly(error));
    return data;
  }
  async myRequest() {
    await getSb(); if (!this.user) return null;
    const { data } = await sb.from('plan_requests').select('*').eq('user_id', this.user.id).eq('status', 'pending').maybeSingle();
    return data;
  }
  async requestPlan(plan, note = '') {
    await getSb();
    const { error } = await sb.from('plan_requests').insert({ plan, note: note.slice(0, 300) });
    if (error) throw new Error(error.code === '23505' ? 'Ya tienes una solicitud pendiente.' : friendly(error));
  }
  async cancelRequest(id) { await getSb(); const { error } = await sb.from('plan_requests').delete().eq('id', id); if (error) throw new Error(friendly(error)); }

  /* ---------------- profile photo (Max, Ultra, admin) ---------------- */
  async uploadAvatar(blob) {
    await getSb();
    const path = `${this.user.id}/avatar.webp`;
    const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp', cacheControl: '3600' });
    if (error) throw new Error(/row-level|security|policy/i.test(error.message) ? 'Tu plan no permite foto de perfil.' : friendly(error));
    const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
    await this.updateProfile({ avatar_url: url });
  }
  async removeAvatar() { await this.updateProfile({ avatar_url: null }); }

  /* ---------------- Ultra uploads ---------------- */
  uploadToTrack(r, owner) {
    return { id: 'up:' + r.id, uploadId: r.id, src: 'upload', full: true, path: r.path, title: r.title, artist: r.artist || owner || 'Subida', album: 'Subidas',
      cover: r.cover_url || '', coverXL: r.cover_url || '', dur: r.duration || 0, isPublic: r.is_public !== false, owner: r.uploader || owner || '', ownerId: r.user_id || null,
      ownerPlan: r.uploader_plan || this.profile?.plan, ownerAdmin: r.uploader_admin ?? (r.user_id === this.user?.id && this.isAdmin), ownerAvatar: r.uploader_avatar ?? (r.user_id === this.user?.id ? this.profile?.avatar_url : ''), ownerHue: r.uploader_hue ?? this.profile?.avatar_hue ?? 275 };
  }
  async myUploads() {
    await getSb(); if (!this.user) return [];
    const { data, error } = await sb.from('user_tracks').select('*').eq('user_id', this.user.id).order('created_at', { ascending: false });
    if (error) throw new Error(friendly(error));
    return data.map(r => this.uploadToTrack(r, this.profile?.display_name));
  }
  async publicUploads(q = null, limit = 40) {
    await getSb();
    const { data } = await sb.rpc('public_uploads', { p_limit: limit, p_query: q || null });
    return (data || []).map(r => this.uploadToTrack(r));
  }
  async uploadById(id) {
    await getSb();
    const { data } = await sb.from('user_tracks').select('*').eq('id', id).maybeSingle();
    return data ? this.uploadToTrack(data) : null;
  }
  async uploadTrack(file, { title, artist, isPublic, cover, duration }, onProgress) {
    await getSb();
    const id = uuid(), ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp3';
    const path = `${this.user.id}/${id}.${ext}`;
    onProgress?.(0.1);
    const up = await sb.storage.from('user-audio').upload(path, file, { contentType: file.type || 'audio/mpeg', cacheControl: '86400' });
    if (up.error) throw new Error(/row-level|security|policy/i.test(up.error.message) ? 'Solo el plan Ultra puede subir canciones.' : /size|large/i.test(up.error.message) ? 'El archivo supera los 50 MB.' : friendly(up.error));
    onProgress?.(0.8);
    let cover_url = null;
    if (cover) {
      const cp = `${this.user.id}/covers/${id}.webp`;
      const c = await sb.storage.from('avatars').upload(cp, cover, { upsert: true, contentType: cover.type || 'image/webp' });
      if (!c.error) cover_url = sb.storage.from('avatars').getPublicUrl(cp).data.publicUrl;
    }
    const { data, error } = await sb.from('user_tracks').insert({ id, title: title.slice(0, 120), artist: (artist || '').slice(0, 120), path, cover_url, duration: duration || 0, is_public: !!isPublic }).select().single();
    if (error) { await sb.storage.from('user-audio').remove([path]); throw new Error(friendly(error)); }
    onProgress?.(1);
    return this.uploadToTrack(data, this.profile?.display_name);
  }
  async updateUpload(id, patch) {
    await getSb();
    const { error } = await sb.from('user_tracks').update(patch).eq('id', id);
    if (error) throw new Error(friendly(error));
  }
  async deleteUpload(t) {
    await getSb();
    await sb.storage.from('user-audio').remove([t.path]).catch(() => {});
    if (t.cover && t.cover.includes('/covers/')) await sb.storage.from('avatars').remove([`${this.user.id}/covers/${t.uploadId}.webp`]).catch(() => {});
    const { error } = await sb.from('user_tracks').delete().eq('id', t.uploadId);
    if (error) throw new Error(friendly(error));
  }
  async signedUrl(path) {
    await getSb();
    const { data, error } = await sb.storage.from('user-audio').createSignedUrl(path, 4 * 3600);
    if (error || !data?.signedUrl) throw new Error('Esta canción ya no está disponible');
    return data.signedUrl;
  }

  /* ---------------- announcements ---------------- */
  async loadAnnouncement() {
    await getSb();
    let rows = [];
    try { ({ data: rows } = await sb.from('app_config').select('key,value,updated_at').in('key', ['announcement', 'jamendo'])); } catch { /* offline */ }
    const get = k => (rows || []).find(r => r.key === k);
    const ann = get('announcement');
    this.announcement = ann?.value?.active && ann.value.text ? { ...ann.value, at: ann.updated_at } : null;
    const jm = get('jamendo')?.value?.client_id || '';
    if (jm !== this.jamendoId) { this.jamendoId = jm; jamendo.setClient(jm); this.emit('sources'); }
    this.emit('announcement');
  }

  /* ---------------- admin ---------------- */
  admin = {
    overview: async () => { await getSb(); const { data, error } = await sb.rpc('admin_overview'); if (error) throw new Error(friendly(error)); return data; },
    users: async () => { await getSb(); const { data, error } = await sb.rpc('admin_list_users', { p_limit: 300, p_offset: 0 }); if (error) throw new Error(friendly(error)); return data; },
    setYoutubeKey: async key => { await getSb(); const { error } = await sb.rpc('admin_set_secret', { p_key: 'youtube_api_key', p_value: key }); if (error) throw new Error(friendly(error)); },
    setJamendo: async clientId => { await getSb(); const { error } = clientId ? await sb.from('app_config').upsert({ key: 'jamendo', value: { client_id: clientId } }) : await sb.from('app_config').delete().eq('key', 'jamendo'); if (error) throw new Error(friendly(error)); await this.loadAnnouncement(); },
    setAnnouncement: async value => { await getSb(); const { error } = await sb.from('app_config').upsert({ key: 'announcement', value }); if (error) throw new Error(friendly(error)); },
    setPlan: async (userId, plan) => { await getSb(); const { error } = await sb.rpc('admin_set_plan', { p_user: userId, p_plan: plan }); if (error) throw new Error(friendly(error)); if (userId === this.user?.id) { this.profile.plan = plan; this.emit('auth'); } },
    requests: async () => { await getSb(); const { data, error } = await sb.from('plan_requests').select('*').eq('status', 'pending').order('created_at'); if (error) throw new Error(friendly(error)); return data; },
    rejectRequest: async id => { await getSb(); const { error } = await sb.rpc('admin_reject_request', { p_id: id }); if (error) throw new Error(friendly(error)); },
    getAnnouncement: async () => { await getSb(); const { data } = await sb.from('app_config').select('value').eq('key', 'announcement').maybeSingle(); return data?.value || { text: '', active: false, tone: 'info' }; }
  };
})();

function mergeRecent(remote, local) {
  const seen = new Set(), out = [];
  for (const t of [...local, ...remote]) { if (!t || seen.has(t.id)) continue; seen.add(t.id); out.push(t); }
  return out.slice(0, 50);
}
