// Visual effects for the "Nebula" design: a WebGL nebula + holographic horizon grid behind the app,
// 3D pointer tilt with specular glare, magnetic buttons and scroll reveals.
// Built for low cost: the shader renders at a fraction of screen resolution, is capped at 30 fps,
// stops while the tab is hidden, and falls back to a static CSS gradient on weak devices,
// without WebGL, with "reduce motion", or when the user turns effects off.

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec3 c1,c2,c3;uniform float pulse;uniform float light;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.07+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/r; vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
 float tt=t*.035;
 vec2 q=vec2(fbm(p*1.5+tt),fbm(p*1.5-tt+5.2));
 float f=fbm(p*2.+q*1.7+vec2(tt*.6,-tt*.8));
 vec3 neb=mix(c1,c2,smoothstep(.25,.85,f));
 neb=mix(neb,c3,smoothstep(.5,.95,q.y)*.75);
 float glow=smoothstep(.15,1.,f)*(1.05+pulse*.35);
 vec3 base=mix(vec3(.018,.014,.04),vec3(.965,.958,.985),light);
 vec3 col=mix(base,neb,glow*mix(.95,.55,light));
 // stars (dark themes)
 vec2 sp=floor(gl_FragCoord.xy*.9); float s=h(sp);
 col+=(1.-light)*step(.9985,s)*(.55+.45*sin(t*1.7+s*90.));
 // holographic horizon grid
 float y=uv.y;
 if(y<.36){
  float d=.36-y; float z=.55/d;
  vec2 g=vec2(p.x*z,z+t*(.25+pulse*.35));
  vec2 gl=abs(fract(g)-.5);
  float line=smoothstep(.44,.5,max(gl.x,gl.y));
  float fade=smoothstep(0.,.14,d)*smoothstep(.36,.02,y*.9);
  col+=mix(c2,c3,uv.x)*line*fade*mix(.32,.18,light);
 }
 col*=1.-.38*pow(length(uv-.5)*1.2,2.);
 gl_FragColor=vec4(col,1.);
}`;

export const fx = {
  enabled: false, gl: null, canvas: null, raf: 0, last: 0, start: performance.now(),
  // adaptive quality: 0 = full (40 % res, 30 fps), 1 = light (25 % res, 20 fps), 2 = off (static gradient)
  level: (() => { try { return +localStorage.getItem('lt:fxlevel') || 0; } catch { return 0; } })(),
  probe: null,
  colors: [[.42, .16, .85], [.03, .57, .7], [.75, .1, .36]], target: null, light: 0, pulse: 0, playing: false,

  capable() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
    return !(mem <= 2 || cores <= 2) && this.level < 2;
  },

  init(canvas) {
    this.canvas = canvas;
    document.addEventListener('visibilitychange', () => { document.hidden ? this.stop() : this.enabled && !this.held && this.loop(); });
    addEventListener('resize', () => this.resize(), { passive: true });
  },

  reset() { this.level = 0; try { localStorage.removeItem('lt:fxlevel'); } catch { /* */ } },
  setEnabled(on) {
    if (!this.canvas) return;
    on = !!on && this.capable();
    document.documentElement.dataset.fx = on ? 'on' : 'off';
    if (on === this.enabled) return;
    this.enabled = on;
    if (on && this.setupGL()) { this.resize(); this.loop(); }
    else { this.enabled = false; document.documentElement.dataset.fx = 'off'; this.stop(); }
  },

  setupGL() {
    if (this.gl) return true;
    const gl = this.canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = Object.fromEntries(['r', 't', 'c1', 'c2', 'c3', 'pulse', 'light'].map(k => [k, gl.getUniformLocation(pr, k)]));
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.stop(); this.gl = null; }, false);
    return true;
  },

  resize() {
    if (!this.gl) return;
    const scale = (this.level ? 0.25 : innerWidth < 820 ? 0.33 : 0.4); // render small, let the GPU upscale: the nebula is soft anyway
    this.canvas.width = Math.max(160, Math.round(innerWidth * scale));
    this.canvas.height = Math.max(120, Math.round(innerHeight * scale));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  },

  setPalette(cols, light) {
    this.target = cols.map(c => c.map(v => v / 255));
    this.light = light ? 1 : 0;
  },
  setPlaying(v) { this.playing = v; },
  // freeze the background (keeps the last frame) while a video plays: saves GPU/battery for video decoding
  hold(v) { this.held = !!v; document.documentElement.toggleAttribute('data-fxhold', this.held); if (v) this.stop(); else if (this.enabled) this.loop(); },

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.probe = null; },
  // Governor: watch real frame pacing for ~2 s; if the whole UI drops under ~45 fps, step quality down.
  _measure(now) {
    const pr = this.probe || (this.probe = { n: 0, t0: now, prev: now, sum: 0 });
    if (pr.done) return;
    const d = now - pr.prev; pr.prev = now;
    if (d > 0 && d < 250) { pr.sum += d; pr.n++; }
    if (now - pr.t0 < 2200 || pr.n < 30) return;
    pr.done = true;
    const avg = pr.sum / pr.n;
    if (avg > 22 && this.level < 2) {
      this.level++;
      try { localStorage.setItem('lt:fxlevel', this.level); } catch { /* private mode */ }
      if (this.level >= 2) { this.setEnabled(false); return; }
      this.resize(); this.probe = null;
    }
  },
  loop() {
    if (this.raf || !this.gl || document.hidden || this.held) return;
    const frame = now => {
      this.raf = requestAnimationFrame(frame);
      this._measure(now);
      if (now - this.last < (this.level ? 50 : 33)) return; // 30 fps (20 in light mode) is plenty for a slow background
      this.last = now;
      const gl = this.gl, u = this.u;
      if (this.target) this.colors = this.colors.map((c, i) => c.map((v, k) => v + (this.target[i][k] - v) * 0.04));
      const t = (now - this.start) / 1000;
      const beat = this.playing ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.9)), 6) : 0; // gentle ~114 bpm breathing
      this.pulse += (beat - this.pulse) * 0.25;
      gl.uniform2f(u.r, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.t, t);
      gl.uniform3fv(u.c1, this.colors[0]); gl.uniform3fv(u.c2, this.colors[1]); gl.uniform3fv(u.c3, this.colors[2]);
      gl.uniform1f(u.pulse, this.pulse);
      gl.uniform1f(u.light, this.light);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    this.raf = requestAnimationFrame(frame);
  }
};

/* ---------- 3D tilt + glare and magnetic buttons (pointer devices only) ---------- */
export function initPointerFx() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let tiltEl = null, magEl = null, pend = null;
  const reset = el => { if (el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--mx'); el.style.removeProperty('--my'); el.style.removeProperty('--tx'); el.style.removeProperty('--ty'); el.classList.remove('tilting'); } };
  const apply = () => {
    const e = pend; pend = null;
    if (!e || document.documentElement.dataset.fx !== 'on') return;
    const t = e.target.closest?.('[data-tilt]');
    if (t !== tiltEl) { reset(tiltEl); tiltEl = t; }
    if (t) {
      const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      t.classList.add('tilting');
      t.style.setProperty('--ry', ((x - .5) * 16).toFixed(2) + 'deg');
      t.style.setProperty('--rx', ((.5 - y) * 14).toFixed(2) + 'deg');
      t.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      t.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    }
    const m = e.target.closest?.('[data-magnet]');
    if (m !== magEl) { reset(magEl); magEl = m; }
    if (m) {
      const r = m.getBoundingClientRect();
      m.style.setProperty('--tx', ((e.clientX - (r.left + r.width / 2)) * 0.25).toFixed(1) + 'px');
      m.style.setProperty('--ty', ((e.clientY - (r.top + r.height / 2)) * 0.25).toFixed(1) + 'px');
    }
  };
  addEventListener('pointermove', e => { if (!pend) requestAnimationFrame(apply); pend = e; }, { passive: true });
  addEventListener('pointerleave', () => { reset(tiltEl); reset(magEl); tiltEl = magEl = null; });
}

/* ---------- reveal on scroll ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -6% 0px' }) : null;
export function reveal(root) {
  const els = root.querySelectorAll('.shelf, .tile, .glass-card, .kpi, .theme-card, .bento, .radio-hero, .ring3d');
  els.forEach(el => { if (el.classList.contains('in')) return; if (!io) { el.classList.add('in'); return; } el.classList.add('rv'); io.observe(el); });
}

/* ---------- 3D album ring (coverflow carousel): drag / swipe to spin ---------- */
export function initRing(el) {
  const track = el.querySelector('.ring-track'); if (!track) return;
  let angle = 0, vel = -0.06, dragging = false, lastX = 0, raf = 0, visible = true, moved = 0;
  const tick = () => {
    const n = track.children.length || 1, step = 360 / n;
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    if (!dragging) { angle += vel; vel += (-0.06 - vel) * 0.02; }
    track.style.transform = `translateZ(calc(var(--rad) * -1)) rotateY(${angle}deg)`;
    const front = ((Math.round(-angle / step) % n) + n) % n;
    if (front !== el._front) { el._front = front; [...track.children].forEach((c, i) => c.classList.toggle('front', i === front)); }
  };
  el.addEventListener('pointerdown', e => { dragging = true; moved = 0; lastX = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); angle += dx * 0.25; vel = dx * 0.25; });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(el);
  if (document.documentElement.dataset.fx === 'on') tick();
  else { track.style.transform = 'translateZ(calc(var(--rad) * -1))'; [...track.children][0]?.classList.add('front'); }
  el._stop = () => cancelAnimationFrame(raf);
}
