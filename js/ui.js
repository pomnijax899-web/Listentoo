// Rendering helpers and shared widgets for the "Orbit" design language.
import { $, esc, fmt, fmtNum, COVER, toast } from './util.js';
import { lib } from './library.js';
import { player } from './player.js';
import { cloud } from './cloud.js';

export const icons = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4.2" height="15" rx="1.4"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 5.6v12.8a1 1 0 0 0 1.53.85L16 13.1V18a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v4.9L6.53 4.75A1 1 0 0 0 5 5.6z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M19 5.6v12.8a1 1 0 0 1-1.53.85L8 13.1V18a1 1 0 0 1-2 0V6a1 1 0 0 1 2 0v4.9l9.47-6.15A1 1 0 0 1 19 5.6z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.3 4.3 12.9a4.9 4.9 0 0 1 7.7-6 4.9 4.9 0 0 1 7.7 6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  heartOn: '<svg viewBox="0 0 24 24"><path d="M12 20.3 4.3 12.9a4.9 4.9 0 0 1 7.7-6 4.9 4.9 0 0 1 7.7 6z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M16 3.5h4.5V8M20.5 3.5 14 10M4 20l16-16M16 20.5h4.5V16M20.5 20.5 15 15M4 4l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M17 2.5 20.5 6 17 9.5M3.5 11V9a3 3 0 0 1 3-3h14M7 21.5 3.5 18 7 14.5M20.5 13v2a3 3 0 0 1-3 3h-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  repeat1: '<svg viewBox="0 0 24 24"><path d="M17 2.5 20.5 6 17 9.5M3.5 11V9a3 3 0 0 1 3-3h14M7 21.5 3.5 18 7 14.5M20.5 13v2a3 3 0 0 1-3 3h-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 10.2 12.6 9v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="var(--bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  plusCircle: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18.5a3 3 0 1 1-2-2.83V5.5l12-2.5v12.5a3 3 0 1 1-2-2.83V7.4l-8 1.7z"/></svg>',
  queue: '<svg viewBox="0 0 24 24"><path d="M4 6h11M4 11h11M4 16h7M15.5 14.5v6l5-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lyrics: '<svg viewBox="0 0 24 24"><path d="M4 5.5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 9.5h8M8 12.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6.5h14V13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  volOff: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="m16 9.5 5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="4"/><path d="M4 21a8 8 0 0 1 16 0z"/></svg>',
  radio: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.4"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 19a10 10 0 0 1 0-14M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  // ---- moods ----
  bolt: '<svg viewBox="0 0 24 24"><path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  crescent: '<svg viewBox="0 0 24 24"><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 3.5v3M15.5 5h3M20.5 8.5v2M19.5 9.5h2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  disco: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13h14M12 6v14M7.2 8.2c3 1.6 6.6 1.6 9.6 0M7.2 17.8c3-1.6 6.6-1.6 9.6 0M12 2.5V6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  headphones: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><rect x="3.5" y="14" width="4.5" height="6.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><rect x="16" y="14" width="4.5" height="6.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hearts: '<svg viewBox="0 0 24 24"><path d="M10 19 3.8 13a4.1 4.1 0 0 1 6.2-5.3A4.1 4.1 0 0 1 16.2 13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 21 13 17.6a2.3 2.3 0 0 1 3.5-3 2.3 2.3 0 0 1 3.5 3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cassette: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="11" r="2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15.5" cy="11" r="2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 11h3M6.5 19l1.5-3.5h8L17.5 19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 21.5c-4 0-6.5-2.7-6.5-6.2 0-4.6 4.6-6.3 4.2-11.8 3.3 1.8 5.4 4.4 5.6 7.6.7-.7 1.1-1.7 1.2-2.8 1.5 1.5 2.5 3.8 2.5 6.2 0 4-3 7-7 7z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 21.5c-1.8 0-3-1.2-3-2.9 0-2.2 2.1-3 2-5.6 1.9 1 3.8 2.9 3.8 5.4 0 1.8-1.1 3.1-2.8 3.1z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  rain: '<svg viewBox="0 0 24 24"><path d="M7 15.5a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.3 9 3.3 3.3 0 0 1 18.5 15.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="m8 18.5-1 2.5M12.5 18.5l-1 2.5M17 18.5l-1 2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  leaf: '<svg viewBox="0 0 24 24"><path d="M5 19c0-8 5.5-14 15-14 0 9.5-6 15-14 15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20c3.5-5 7-8 10.5-10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sleep: '<svg viewBox="0 0 24 24"><path d="M14 4h5l-5 6h5M4.5 11h6L4.5 19h6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // ---- actions ----
  next2: '<svg viewBox="0 0 24 24"><path d="m6 6 7 6-7 6M13 6l7 6-7 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  addq: '<svg viewBox="0 0 24 24"><path d="M4 6h12M4 11h12M4 16h7M17 14v6M14 17h6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  disc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 4.6l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12h18M12 3c2.6 2.7 3.8 5.7 3.8 9s-1.2 6.3-3.8 9c-2.6-2.7-3.8-5.7-3.8-9S9.4 5.7 12 3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4.5 15v4.5h15V15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l1.8-2.5h6.4L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sort: '<svg viewBox="0 0 24 24"><path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z"/><path d="M19 15.5c.25 1.9 1.1 2.75 3 3-1.9.25-2.75 1.1-3 3-.25-1.9-1.1-2.75-3-3 1.9-.25 2.75-1.1 3-3z"/></svg>',
  infinity: '<svg viewBox="0 0 24 24"><path d="M12 12c-2-3-3.6-4.5-5.5-4.5a4.5 4.5 0 0 0 0 9c1.9 0 3.5-1.5 5.5-4.5zm0 0c2 3 3.6 4.5 5.5 4.5a4.5 4.5 0 0 0 0-9c-1.9 0-3.5 1.5-5.5 4.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hourglass: '<svg viewBox="0 0 24 24"><path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6-4.5 9s4.5 4 4.5 9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  crown: '<svg viewBox="0 0 24 24"><path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19.2 18H4.8z"/><rect x="4.6" y="19" width="14.8" height="2.2" rx="1"/></svg>',
  gem: '<svg viewBox="0 0 24 24"><path d="M6 3.5h12l3.5 5L12 21 2.5 8.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 8.5h19M9 3.5 7.5 8.5 12 21l4.5-12.5L15 3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  prism: '<svg viewBox="0 0 24 24"><path d="M12 2.5 21 19.5H3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2.5v17M7.5 11l4.5 8.5 4.5-8.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  medal: '<svg viewBox="0 0 24 24"><circle cx="12" cy="14.5" r="6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 9.5 6 2.5h4l2 5 2-5h4l-2.5 7M12 12l.9 1.8 2 .3-1.45 1.4.35 2L12 16.6l-1.8.9.35-2L9.1 14.1l2-.3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2.8 19.5 6v6c0 4.6-3.2 8-7.5 9.2C7.7 20 4.5 16.6 4.5 12V6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="m8.8 12 2.2 2.2 4.4-4.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

export const eqBars = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
export const explicit = t => t.explicit ? '<span class="badge-e" title="Explícito">E</span>' : '';
export const img = (src, cls = '', alt = '') => `<img class="${cls}" src="${esc(src || COVER)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${COVER}'">`;

/* registry so delegated clicks can find the track array behind a rendered list */
const lists = new Map(); let listSeq = 0;
export function registerList(tracks, meta = {}) { const k = 'L' + (++listSeq); lists.set(k, { tracks, ...meta }); if (lists.size > 80) lists.delete(lists.keys().next().value); return k; }
export const getList = k => lists.get(k);

export function trackList(tracks, { label = '', href = '', album = true, cover = true, playlistId = null, numbers = true, added = false, draggable = false, flag = '' } = {}) {
  if (!tracks.length) return '';
  const k = registerList(tracks, { label, href, playlistId });
  const curId = player.current?.id;
  return `<div class="tracks${album ? ' with-album' : ''}${added ? ' with-added' : ''}" data-list="${k}" ${flag}>
  ${tracks.map((t, i) => {
    const liked = lib.isLiked(t), playing = curId === t.id;
    return `<div class="trow${playing ? ' playing' : ''}" data-i="${i}" data-id="${esc(t.id)}"${draggable ? ' draggable="true"' : ''} tabindex="0" style="--d:${Math.min(i, 14) * 22}ms">
      <div class="c-num">${numbers ? `<span class="n">${String(i + 1).padStart(2, '0')}</span>` : ''}<span class="eqw">${eqBars}</span><span class="rowplay">${icons.play}</span></div>
      <div class="c-title">${cover ? img(t.cover, 'tcover') : ''}<div class="tt"><div class="tname ellipsis">${esc(t.title)}</div><div class="tart ellipsis">${explicit(t)}${t.artistId ? `<a href="#/artista/${t.artistId}">${esc(t.artist)}</a>` : esc(t.artist)}${t.live ? '<span class="badge-live">En directo</span>' : t.src === 'upload' ? `<span class="badge-up${t.isPublic ? '' : ' priv'}">${t.isPublic ? icons.globe + 'Comunidad' : icons.lock + 'Privada'}</span>` : (t.src === 'audius' || t.src === 'jamendo') ? '<span class="badge-full" title="Canción completa">Completa</span>' : ''}</div></div></div>
      ${album ? `<div class="c-album ellipsis">${t.albumId ? `<a href="#/album/${t.albumId}">${esc(t.album)}</a>` : esc(t.album || '')}</div>` : ''}
      ${added ? `<div class="c-added">${t.added ? new Date(t.added).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : ''}</div>` : ''}
      <div class="c-like"><button class="likebtn${liked ? ' on' : ''}" data-act="like" aria-label="Me gusta">${liked ? icons.heartOn : icons.heart}</button></div>
      <div class="c-dur">${t.dur ? fmt(t.dur) : ''}</div>
      <div class="c-more"><button data-act="more" aria-label="Más opciones">${icons.more}</button></div>
    </div>`;
  }).join('')}</div>`;
}

export const hrefOf = item => ({ artist: `#/artista/${item.id}`, album: `#/album/${item.id}`, dzplaylist: `#/lista/${item.id}`, playlist: `#/playlist/${item.id}`, liked: '#/megusta' }[item.kind] || '#/inicio');

export function card(item, { sub } = {}) {
  const k = item.kind, title = item.name || item.title, href = hrefOf(item);
  const fab = `<button class="fab" data-act="playcoll" aria-label="Reproducir ${esc(title)}">${icons.play}</button>`;
  if (k === 'artist') return `<a class="bubble" data-tilt href="${href}" data-kind="artist" data-id="${esc(item.id)}">
    <div class="bub-art"><span class="orbit-ring"></span>${img(item.pic || item.cover, 'round')}${fab}</div>
    <div class="ct ellipsis">${esc(title)}</div><div class="cs">${esc(sub ?? (item.fans ? fmtNum(item.fans) + ' fans' : 'Artista'))}</div></a>`;
  if (k === 'album') return `<a class="vcard" data-tilt href="${href}" data-kind="album" data-id="${esc(item.id)}">
    <div class="v-art"><span class="vinyl" style="--lbl:url('${esc(item.cover)}')"></span>${img(item.cover, 'sleeve')}${fab}</div>
    <div class="ct ellipsis">${esc(title)}</div><div class="cs ellipsis">${esc(sub ?? [item.year, item.artist].filter(Boolean).join(' · '))}</div></a>`;
  const art = k === 'playlist' ? mosaic(item.tracks || []) : k === 'liked' ? `<div class="art liked-art">${icons.heartOn}</div>` : img(item.cover, 'art');
  const s = sub ?? (k === 'dzplaylist' ? `Por ${item.by}` : k === 'playlist' ? `${item.tracks?.length || 0} canciones` : '');
  return `<a class="pcard" data-tilt href="${href}" data-kind="${k}" data-id="${esc(item.id)}"><div class="p-art">${art}${fab}</div>
    <div class="ct ellipsis">${esc(title)}</div><div class="cs ellipsis2">${esc(s)}</div></a>`;
}
export const shelf = (title, items, opts = {}) => items?.length ? `<section class="shelf"><div class="shelf-head"><h2>${esc(title)}</h2>${opts.more ? `<a class="more" href="${opts.more}">Ver todo</a>` : ''}</div><div class="${opts.wrap ? 'cgrid' : 'hscroll'}">${items.map(i => card(i, opts)).join('')}</div></section>` : '';

export function trackCards(tracks, label) {
  const k = registerList(tracks, { label });
  return `<div class="hscroll" data-list="${k}">${tracks.map((t, i) => `<div class="tcard" data-tilt data-track-i="${i}" tabindex="0"><div class="p-art">${img(t.cover, 'art')}<span class="fab">${icons.play}</span></div><div class="ct ellipsis">${esc(t.title)}</div><div class="cs ellipsis">${esc(t.artist)}</div></div>`).join('')}</div>`;
}

/* songs uploaded by Ultra members, with the uploader's framed avatar */
export function communityCards(tracks, label) {
  if (!tracks.length) return '';
  const k = registerList(tracks, { label });
  return `<div class="hscroll community" data-list="${k}">${tracks.map((t, i) => `<div class="tcard ccard" data-tilt data-track-i="${i}" tabindex="0">
    <div class="p-art">${t.cover ? img(t.cover, 'art') : `<div class="art gen-art" style="--h:${hueOf(t.title + t.artist)}">${icons.wave}</div>`}<span class="fab">${icons.play}</span></div>
    <div class="ct ellipsis">${esc(t.title)}</div><div class="cs ellipsis">${esc(t.artist || t.owner)}</div>
    <div class="cc-by">${avatarOf({ name: t.owner, hue: t.ownerHue, url: t.ownerAvatar, plan: t.ownerPlan, admin: t.ownerAdmin }, 'xs')}<span class="ellipsis">${esc(t.owner)}</span></div></div>`).join('')}</div>`;
}

/* live radio stations as playable cards */
const initials = n => (n || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'FM';
export const stationArt = (s, cls = '') => `<div class="st-art ${cls}" style="--h:${hueOf(s.title)}"><b>${esc(initials(s.title))}</b>${s.cover ? `<img class="st-logo" src="${esc(s.cover)}" alt="" loading="lazy" decoding="async" onload="if(this.naturalWidth<24)this.hidden=true" onerror="this.hidden=true">` : ''}</div>`;
export const hueOf = str => [...(str || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export function stationCards(list, label, { wrap = false } = {}) {
  if (!list.length) return '';
  const k = registerList(list, { label, href: '#/radio' });
  return `<div class="${wrap ? 'cgrid' : 'hscroll'} stations" data-list="${k}">${list.map((s, i) => `<div class="scard" data-tilt data-track-i="${i}" data-id="${esc(s.id)}" tabindex="0">
    <div class="p-art">${stationArt(s)}<span class="live-dot">EN DIRECTO</span><span class="fab">${icons.play}</span></div>
    <div class="ct ellipsis">${esc(s.title)}</div><div class="cs ellipsis">${esc(s.artist)}</div></div>`).join('')}</div>`;
}

export function mosaic(tracks, cls = 'art') {
  const covers = [...new Set(tracks.map(t => t.cover).filter(Boolean))].slice(0, 4);
  if (covers.length >= 4) return `<div class="${cls} mosaic">${covers.map(c => img(c)).join('')}</div>`;
  if (covers.length) return img(covers[0], cls);
  return `<div class="${cls} empty-art">${icons.music}</div>`;
}

export const skeleton = (rows = 8) => `<div class="skel-hero"><div class="sk sk-img"></div><div class="sk-col"><div class="sk sk-l1"></div><div class="sk sk-l2"></div><div class="sk sk-l3"></div></div></div>` + Array.from({ length: rows }, () => '<div class="sk-row"><div class="sk sk-sq"></div><div class="sk-col"><div class="sk sk-t"></div><div class="sk sk-s"></div></div></div>').join('');
export const skeletonShelves = (n = 3) => Array.from({ length: n }, () => `<div class="sk sk-h2"></div><div class="hscroll">${Array.from({ length: 7 }, () => '<div class="pcard"><div class="sk sk-art"></div><div class="sk sk-t"></div><div class="sk sk-s"></div></div>').join('')}</div>`).join('');
export const errorState = (msg = 'No se pudo conectar con el catálogo.') => `<div class="empty"><div class="empty-ico">${icons.music}</div><h3>Algo se ha desafinado</h3><p>${esc(msg)} Tu biblioteca y tus archivos locales siguen disponibles.</p><button class="pill" onclick="dispatchEvent(new HashChangeEvent('hashchange'))">Reintentar</button></div>`;

/* ---------- menus ---------- */
export function showMenu(items, at) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.label ? `<div class="mlabel">${esc(it.label)}</div>` : `<button data-i="${i}" ${it.disabled ? 'disabled' : ''}><span class="mi">${it.icon || ''}</span>${esc(it.text)}</button>`).join('');
  m.hidden = false; m.classList.remove('in'); void m.offsetWidth; m.classList.add('in');
  const r = m.getBoundingClientRect();
  const a = at instanceof Element ? at.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y };
  let x = at instanceof Element ? a.right - r.width : a.left, y = a.bottom + 8;
  if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
  if (y + r.height > innerHeight - 8) y = Math.max(8, a.top - r.height - 8);
  m.style.left = Math.max(8, x) + 'px'; m.style.top = y + 'px';
  m.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; hideMenu(); items[b.dataset.i].run(); };
}
export const hideMenu = () => { const m = $('#menu'); if (m) m.hidden = true; };

export async function share(title, hash) {
  const url = location.origin + location.pathname + hash;
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
  } catch { /* cancelled */ }
}

export function trackMenu(t, at, { playlistId } = {}) {
  if (t.live) {
    return showMenu([
      { icon: lib.isLiked(t) ? icons.heartOn : icons.heart, text: lib.isLiked(t) ? 'Quitar de tus emisoras' : 'Guardar emisora', run: () => lib.toggleLike(t) },
      { icon: icons.addq, text: 'Añadir a la cola', run: () => player.addToQueue(t) },
      { icon: icons.radio, text: 'Ir a la radio', run: () => { location.hash = '#/radio'; } }
    ], at);
  }
  const items = [
    { icon: icons.next2, text: 'Que suene a continuación', run: () => player.playNext(t) },
    { icon: icons.addq, text: 'Añadir a la cola', run: () => player.addToQueue(t) },
    ...(t.src !== 'local' ? [{ icon: lib.isLiked(t) ? icons.heartOn : icons.heart, text: lib.isLiked(t) ? 'Quitar de Me gusta' : 'Guardar en Me gusta', run: () => lib.toggleLike(t) }] : []),
    '-', { label: 'Añadir a playlist' },
    { icon: icons.plus, text: 'Nueva playlist', run: async () => { const n = await prompt('Nueva playlist', '', 'Crear'); if (n !== null) { lib.createPlaylist(n, [t]); toast('Playlist creada'); } } },
    ...lib.playlists.slice(0, 12).map(p => ({ icon: icons.music, text: p.name, run: () => lib.addToPlaylist(p.id, t) })),
    '-'
  ];
  if (t.artistId) items.push({ icon: icons.person, text: 'Ir al artista', run: () => { location.hash = `#/artista/${t.artistId}`; } });
  if (t.albumId) items.push({ icon: icons.disc, text: 'Ir al álbum', run: () => { location.hash = `#/album/${t.albumId}`; } });
  if (t.artistId) items.push({ icon: icons.radio, text: 'Radio de esta canción', run: () => startRadio(t) });
  if (t.albumId) items.push({ icon: icons.share, text: 'Compartir', run: () => share(`${t.title} · ${t.artist}`, `#/album/${t.albumId}`) });
  if (playlistId) items.push('-', { icon: icons.close, text: 'Quitar de esta playlist', run: () => lib.removeFromPlaylist(playlistId, t.id) });
  if (t.src === 'local') items.push('-', { icon: icons.trash, text: 'Eliminar archivo', run: () => lib.deleteLocal(t) });
  if (t.src === 'upload' && cloud.user && t.ownerId === cloud.user.id) items.push('-', { label: 'Tu subida' },
    { icon: t.isPublic ? icons.lock : icons.globe, text: t.isPublic ? 'Hacer privada' : 'Publicar en Comunidad', run: async () => { try { await cloud.updateUpload(t.uploadId, { is_public: !t.isPublic }); t.isPublic = !t.isPublic; toast(t.isPublic ? 'Ahora es pública' : 'Ahora solo tú puedes escucharla'); dispatchEvent(new Event('uploads')); } catch (e) { toast(e.message); } } },
    { icon: icons.trash, text: 'Eliminar subida', run: async () => { if (!await confirmBox('¿Eliminar esta canción?', `Se borrará «${t.title}» para siempre.`, 'Eliminar')) return; try { await cloud.deleteUpload(t); toast('Subida eliminada'); dispatchEvent(new Event('uploads')); } catch (e) { toast(e.message); } } });
  showMenu(items, at);
}
export async function startRadio(t) {
  const { deezer } = await import('./api.js');
  try { const r = await deezer.artistRadio(t.artistId); player.playList([t, ...r.filter(x => x.id !== t.id)], 0, { label: `Radio de ${t.title}`, href: `#/artista/${t.artistId}` }); toast(`Radio de «${t.title}»`); }
  catch { toast('No se pudo crear la radio'); }
}

/* ---------- modal ---------- */
export function modal(html, onMount, { wide = false } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false; requestAnimationFrame(() => m.classList.add('in'));
  const close = () => { m.classList.remove('in'); setTimeout(() => { m.hidden = true; m.innerHTML = ''; m.dispatchEvent(new Event('closed')); }, 200); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(); };
  onMount?.(m.firstElementChild, close);
  return close;
}
const onClosed = fn => $('#modal').addEventListener('closed', fn, { once: true });
export function prompt(title, value = '', ok = 'Guardar') {
  return new Promise(res => {
    let done = false;
    modal(`<h3>${esc(title)}</h3><input class="field" type="text" maxlength="100" value="${esc(value)}" placeholder="Nombre"><div class="acts"><button class="pill ghost" data-close>Cancelar</button><button class="pill primary" data-ok>${esc(ok)}</button></div>`, (el, close) => {
      const inp = el.querySelector('input'); inp.focus(); inp.select();
      const finish = v => { if (done) return; done = true; close(); res(v); };
      el.querySelector('[data-ok]').onclick = () => finish(inp.value);
      inp.onkeydown = e => { if (e.key === 'Enter') finish(inp.value); };
      onClosed(() => { if (!done) { done = true; res(null); } });
    });
  });
}
export function confirmBox(title, text, ok = 'Eliminar') {
  return new Promise(res => {
    let done = false;
    modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="acts"><button class="pill ghost" data-close>Cancelar</button><button class="pill danger" data-ok>${esc(ok)}</button></div>`, (el, close) => {
      el.querySelector('[data-ok]').onclick = () => { done = true; close(); res(true); };
      onClosed(() => { if (!done) { done = true; res(false); } });
    });
  });
}
export const fans = n => n ? `${fmtNum(n)} seguidores` : '';
export const PLANS_UI = {
  free: { name: 'Free', icon: 'wave' }, pro: { name: 'Pro', icon: 'medal' },
  max: { name: 'Max', icon: 'gem' }, ultra: { name: 'Ultra', icon: 'prism' }
};
// Avatar with the plan's frame: gold (Pro), diamond (Max), polished obsidian (Ultra); the admin also wears a crown.
export function avatarOf({ name = '?', hue = 275, url = '', plan = 'free', admin = false } = {}, size = 'md') {
  const tier = admin ? 'ultra' : (PLANS_UI[plan] ? plan : 'free');
  const photo = url && (admin || plan === 'max' || plan === 'ultra');
  const ch = esc((name || '?').trim().charAt(0).toUpperCase() || '?');
  return `<span class="av av-${size} tier-${tier}${admin ? ' is-admin' : ''}" style="--h:${hue}"><span class="av-ring"></span><span class="av-core">${photo ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : `<b>${ch}</b>`}</span>${admin ? `<span class="av-crown" title="Administrador">${icons.crown}</span>` : ''}</span>`;
}
export const planChip = (plan, admin) => admin
  ? `<span class="plan-chip tier-admin">${icons.crown}Admin</span>`
  : `<span class="plan-chip tier-${plan}">${icons[PLANS_UI[plan]?.icon || 'wave']}${PLANS_UI[plan]?.name || 'Free'}</span>`;
export const avatar = (name = '?', hue = 275, cls = '') => avatarOf({ name, hue }, cls === 'sm' ? 'sm' : 'md');

/* little particle burst (likes, plan upgrades) */
export function burst(x, y, { n = 14, colors = ['var(--accent)', 'var(--accent2)', '#fff'] } = {}) {
  if (document.documentElement.dataset.fx !== 'on' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'burst'; box.style.left = x + 'px'; box.style.top = y + 'px';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * .4, d = 26 + Math.random() * 34, sp = document.createElement('i');
    sp.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px'); sp.style.setProperty('--dy', (Math.sin(a) * d).toFixed(1) + 'px');
    sp.style.background = colors[i % colors.length]; sp.style.animationDelay = (Math.random() * 60) + 'ms';
    box.appendChild(sp);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 900);
}
