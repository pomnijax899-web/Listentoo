// Theme engine. Each theme defines surface/text/accent tokens plus three "aurora" colours that
// drive the animated background. With dynamic colour on, the aurora follows the cover art.
import { $, imagePalette, rgb } from './util.js';
import { lib } from './library.js';

export const THEMES = {
  aurora:     { name: 'Aurora',     mode: 'dark',  bg: '#08070f', ink: '#f6f4ff', sub: '#a7a2c4', accent: '#a78bfa', accent2: '#22d3ee', aur: ['#6d28d9', '#0891b2', '#be185d'] },
  medianoche: { name: 'Medianoche', mode: 'dark',  bg: '#000000', ink: '#fafafa', sub: '#9a9a9a', accent: '#f5f5f5', accent2: '#a3a3a3', aur: ['#1c1c1c', '#141414', '#262626'] },
  neon:       { name: 'Neón',       mode: 'dark',  bg: '#05030a', ink: '#fdf4ff', sub: '#c4a8d8', accent: '#f0abfc', accent2: '#a3e635', aur: ['#c026d3', '#4f46e5', '#16a34a'] },
  oceano:     { name: 'Océano',     mode: 'dark',  bg: '#020b16', ink: '#eaf6ff', sub: '#8fb0c8', accent: '#38bdf8', accent2: '#2dd4bf', aur: ['#0c4a6e', '#0e7490', '#1d4ed8'] },
  bosque:     { name: 'Bosque',     mode: 'dark',  bg: '#050d08', ink: '#effaf2', sub: '#9bb8a4', accent: '#4ade80', accent2: '#facc15', aur: ['#14532d', '#3f6212', '#065f46'] },
  atardecer:  { name: 'Atardecer',  mode: 'dark',  bg: '#110608', ink: '#fff4ee', sub: '#d1a99c', accent: '#fb923c', accent2: '#f472b6', aur: ['#c2410c', '#be123c', '#7e22ce'] },
  nube:       { name: 'Nube',       mode: 'light', bg: '#f5f4fb', ink: '#17151f', sub: '#5d5872', accent: '#7c3aed', accent2: '#0891b2', aur: ['#c4b5fd', '#a5f3fc', '#fbcfe8'] },
  sakura:     { name: 'Sakura',     mode: 'light', bg: '#fff6f8', ink: '#2a1520', sub: '#7d5566', accent: '#e11d74', accent2: '#8b5cf6', aur: ['#fbcfe8', '#fecdd3', '#e9d5ff'] },
  arena:      { name: 'Arena',      mode: 'light', bg: '#faf6ef', ink: '#231c12', sub: '#6e604c', accent: '#c2410c', accent2: '#0f766e', aur: ['#fde68a', '#fed7aa', '#bbf7d0'] },
  sistema:    { name: 'Sistema',    mode: 'auto' }
};

const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const sysDark = matchMedia('(prefers-color-scheme: dark)');
let coverPalette = null;

export function resolveTheme(id = lib.settings.theme) {
  if (id === 'sistema') return THEMES[sysDark.matches ? 'aurora' : 'nube'];
  return THEMES[id] || THEMES.aurora;
}

export function applyTheme() {
  const s = lib.settings, t = resolveTheme(s.theme), root = document.documentElement, st = root.style;
  root.dataset.mode = t.mode;
  root.dataset.motion = s.motion ? 'on' : 'off';
  root.dataset.spin = s.spin ? 'on' : 'off';
  st.setProperty('--bg', t.bg);
  st.setProperty('--ink', t.ink);
  st.setProperty('--sub', t.sub);
  const useCover = s.dynamic && coverPalette;
  const aur = useCover ? coverPalette.map(c => t.mode === 'light' ? c.map(v => Math.round(v + (255 - v) * 0.55)) : c) : t.aur.map(hex);
  aur.forEach((c, i) => st.setProperty(`--a${i + 1}`, rgb(c)));
  const acc = useCover && t.mode === 'dark' ? coverPalette[0].map(v => Math.round(v + (255 - v) * 0.35)) : hex(t.accent);
  st.setProperty('--accent', rgb(acc));
  st.setProperty('--accent-rgb', acc.join(','));
  st.setProperty('--accent2', t.accent2);
  const meta = $('meta[name=theme-color]'); if (meta) meta.content = t.bg;
}

export async function setCover(url) {
  coverPalette = url ? await imagePalette(url) : null;
  if (lib.settings.dynamic) applyTheme();
}

sysDark.addEventListener?.('change', () => { if (lib.settings.theme === 'sistema') applyTheme(); });
