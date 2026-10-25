// Throw Hands demo-video-v2 motion graphics.
// Every scene is a pure function of time: build() lays out the DOM once, seek(t) sets every style for time t.
// No CSS transitions/animations and no wall clock, so frame N always renders identically (render-graphics.ts seeks per frame).
(() => {
  const W = 1920, H = 1080;
  const SAFE = { x0: 192, x1: 1728, y0: 108, y1: 972 }; // 10% title-safe
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const E = {
    lin: (p) => p,
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    outQuart: (p) => 1 - Math.pow(1 - p, 4),
    outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inCubic: (p) => p * p * p,
    inQuart: (p) => p * p * p * p,
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outBack: (p) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  };
  const COL = { w: '#eef2ff', white: '#ffffff', muted: '#9aa6c8', p1: '#ff3d6e', p2: '#33b5ff', gold: '#ffc53d', good: '#3dff9a', orange: '#ff7a3d', bg: '#070912' };
  const GLOW = { w: 'rgba(255,255,255,0.25)', white: 'rgba(255,255,255,0.25)', muted: 'rgba(0,0,0,0)', p1: 'rgba(255,61,110,0.7)', p2: 'rgba(51,181,255,0.7)', gold: 'rgba(255,140,60,0.75)', good: 'rgba(61,255,154,0.6)' };
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /** Decaying deterministic shake that starts at t0. Returns [dx, dy]. */
  function shake(t, t0, dur, amp, seed = 1) {
    const p = (t - t0) / dur;
    if (p < 0 || p > 1) return [0, 0];
    const d = Math.pow(1 - p, 2) * amp, k = (t - t0) * 60;
    return [d * Math.sin(k * 1.7 + seed) * Math.cos(k * 0.9), d * Math.cos(k * 2.3 + seed * 2) * Math.sin(k * 1.1 + 1)];
  }
  function el(tag, attrs, parent, html) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'style') e.style.cssText = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v); }
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; }
  function fullSvg(parent, z = 1) { return sv('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: `position:absolute;left:0;top:0;z-index:${z}` }, parent); }
  function octagonPts(cx, cy, r, rot = Math.PI / 8) { const p = []; for (let i = 0; i < 8; i++) { const a = rot + (i * Math.PI) / 4; p.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`); } return p.join(' '); }

  /** Word slam: scale/blur in over `dur`, landing exactly at tl, with a small decaying bounce after. */
  function slam(e, t, tl, o = {}) {
    const dur = o.dur ?? 0.13;
    if (t < tl - dur) { e.style.opacity = '0'; return 0; }
    const p = seg(t, tl - dur, tl), q = E.outCubic(p);
    const s = lerp(o.s0 ?? 2.1, 1, q), x = lerp(o.x0 ?? 0, 0, q), y = lerp(o.y0 ?? 0, 0, q);
    const b = t > tl ? Math.exp(-(t - tl) * 13) * Math.sin((t - tl) * 38) * (o.bounce ?? 0.045) : 0;
    e.style.opacity = String(clamp(p * 2.2));
    e.style.transform = `translate(${x}px,${y}px) scale(${(s * (1 + b)).toFixed(4)})`;
    e.style.filter = p < 1 ? `blur(${((1 - q) * (o.blur ?? 12)).toFixed(2)}px)` : 'none';
    return p;
  }
  /** Shrink an element's font until it fits maxW. */
  function fit(e, maxW) { let fs = parseFloat(getComputedStyle(e).fontSize); let guard = 60; while (e.scrollWidth > maxW && guard-- > 0) { fs *= 0.96; e.style.fontSize = fs + 'px'; } }

  /** Opaque branded background: deep navy, pink and blue glows, a slowly turning octagon (the cage), drifting light streaks, vignette. */
  function background(stage, o = {}) {
    document.body.classList.add('opaque');
    const tintA = o.a ?? 'rgba(255,61,110,0.26)', tintB = o.b ?? 'rgba(51,181,255,0.22)';
    const base = el('div', { class: 'abs', style: `inset:0;background:radial-gradient(ellipse at 78% 18%, ${tintA}, transparent 55%), radial-gradient(ellipse at 14% 88%, ${tintB}, transparent 55%), radial-gradient(ellipse at 50% 30%, rgba(40,20,70,0.55), rgba(5,7,15,0) 70%), #070912` }, stage);
    const svg = fullSvg(stage, 0);
    const oct1 = sv('polygon', { points: octagonPts(0, 0, 640), fill: 'none', stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 3 }, svg);
    const oct2 = sv('polygon', { points: octagonPts(0, 0, 820), fill: 'none', stroke: 'rgba(255,61,110,0.07)', 'stroke-width': 2 }, svg);
    const oct3 = sv('polygon', { points: octagonPts(0, 0, 460), fill: 'none', stroke: 'rgba(51,181,255,0.06)', 'stroke-width': 2, 'stroke-dasharray': '14 18' }, svg);
    const r = rng(o.seed ?? 7);
    const streaks = [];
    for (let i = 0; i < 9; i++) {
      const s = el('div', { class: 'abs', style: `top:${(r() * 1180 - 50).toFixed(0)}px;left:0;width:${(320 + r() * 520).toFixed(0)}px;height:${(2 + r() * 3).toFixed(1)}px;border-radius:3px;background:linear-gradient(90deg,transparent,${r() < 0.5 ? 'rgba(255,61,110,0.35)' : 'rgba(51,181,255,0.35)'},transparent)` }, stage);
      streaks.push({ e: s, x0: r() * 2400 - 300, v: 260 + r() * 520 });
    }
    el('div', { class: 'abs', style: 'inset:0;background:radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%);z-index:0' }, stage);
    return (t) => {
      oct1.setAttribute('transform', `translate(960 540) rotate(${(t * 6).toFixed(2)})`);
      oct2.setAttribute('transform', `translate(960 540) rotate(${(-t * 4).toFixed(2)})`);
      oct3.setAttribute('transform', `translate(960 540) rotate(${(t * 10).toFixed(2)})`);
      for (const s of streaks) { const x = ((s.x0 + s.v * t) % 2600) - 500; s.e.style.transform = `translateX(${x.toFixed(1)}px) rotate(-12deg)`; }
    };
  }

  /** Impact kit: white flash, shockwave ring, radial sparks around (cx, cy) at t0. */
  function impact(stage, cx, cy, o = {}) {
    const svg = fullSvg(stage, 20);
    const ring = sv('circle', { cx, cy, r: 10, fill: 'none', stroke: o.color ?? '#ffffff', 'stroke-width': 10 }, svg);
    const ring2 = sv('circle', { cx, cy, r: 10, fill: 'none', stroke: COL.p1, 'stroke-width': 5 }, svg);
    const r = rng(o.seed ?? 3), sparks = [];
    for (let i = 0; i < (o.sparks ?? 36); i++) {
      const a = r() * Math.PI * 2, len = 30 + r() * 70, sp = 600 + r() * 1100;
      sparks.push({ a, len, sp, e: sv('line', { stroke: r() < 0.5 ? COL.gold : r() < 0.5 ? '#fff' : COL.p1, 'stroke-width': 3 + r() * 4, 'stroke-linecap': 'round' }, svg) });
    }
    const flash = el('div', { class: 'abs', style: 'inset:0;background:#fff;opacity:0;z-index:30' }, stage);
    return (t, t0) => {
      const dt = t - t0;
      const fl = dt < 0 ? 0 : dt < 1 / 30 ? (o.flash ?? 0.85) : (o.flash ?? 0.85) * Math.max(0, 1 - (dt - 1 / 30) / 0.12);
      flash.style.opacity = String(fl);
      const p = seg(t, t0, t0 + 0.55), pr = E.outCubic(p);
      ring.setAttribute('r', String(40 + pr * (o.ring ?? 900)));
      ring.setAttribute('opacity', String(dt < 0 ? 0 : (1 - p) * 0.8));
      ring.setAttribute('stroke-width', String(2 + 14 * (1 - p)));
      const p2 = seg(t, t0 + 0.05, t0 + 0.65);
      ring2.setAttribute('r', String(30 + E.outCubic(p2) * (o.ring ?? 900) * 0.7));
      ring2.setAttribute('opacity', String(dt < 0.05 ? 0 : (1 - p2) * 0.7));
      for (const s of sparks) {
        if (dt < 0 || dt > 0.5) { s.e.setAttribute('opacity', '0'); continue; }
        const d = 120 + s.sp * E.outCubic(seg(dt, 0, 0.5)) * 0.6, d2 = d + s.len * (1 - dt / 0.5);
        s.e.setAttribute('x1', cx + Math.cos(s.a) * d); s.e.setAttribute('y1', cy + Math.sin(s.a) * d);
        s.e.setAttribute('x2', cx + Math.cos(s.a) * d2); s.e.setAttribute('y2', cy + Math.sin(s.a) * d2);
        s.e.setAttribute('opacity', String(1 - dt / 0.5));
      }
    };
  }

  /** Chromatic-split glitch text shadow: offset decays after landing, with deterministic re-glitch bursts. */
  function glitchShadow(t, tl, color, bursts = []) {
    let dx = t < tl ? 18 : 18 * Math.exp(-(t - tl) * 7);
    for (const b of bursts) if (t >= b && t < b + 0.067) dx = Math.max(dx, 14);
    const g = GLOW[color] ?? 'rgba(0,0,0,0)';
    return `${dx.toFixed(1)}px 0 rgba(255,61,110,0.85), ${(-dx).toFixed(1)}px 0 rgba(51,181,255,0.85), 0 0 38px ${g}, 0 8px 0 rgba(0,0,0,0.55)`;
  }

  // ------------------------------------------------------------------ logo
  function logoBlock(stage, size, top) {
    const wrap = el('div', { class: 'center', style: `top:${top}px;line-height:0.92;z-index:5` }, stage);
    const l1 = el('div', { class: 'bungee', style: `font-size:${size}px;letter-spacing:6px;color:#fff;text-shadow:0 0 34px rgba(255,61,110,0.45),0 10px 0 rgba(0,0,0,0.5)` }, wrap, 'THROW');
    const l2 = el('div', { class: 'bungee', style: `font-size:${size}px;letter-spacing:6px;color:${COL.p1};text-shadow:0 0 44px rgba(255,61,110,0.75),0 10px 0 rgba(0,0,0,0.5)` }, wrap, 'HANDS');
    return { wrap, l1, l2 };
  }
  function logoIn(L, t, tl, dist = 1500) {
    for (const [e, dir] of [[L.l1, -1], [L.l2, 1]]) {
      const p = seg(t, tl - 0.2, tl), q = E.outExpo(p);
      e.style.opacity = t < tl - 0.2 ? '0' : '1';
      const b = t > tl ? Math.exp(-(t - tl) * 12) * Math.sin((t - tl) * 34) * 14 * -dir : 0;
      e.style.transform = `translateX(${(dir * dist * (1 - q) + b).toFixed(1)}px) skewX(${(dir * -28 * (1 - q)).toFixed(2)}deg)`;
      e.style.filter = p < 1 ? `blur(${(10 * (1 - q)).toFixed(2)}px)` : 'none';
    }
  }

  function sceneLogoOpen(stage, P) {
    const B = P.beat, tl = 0.26, dur = 2.0;
    const bg = background(stage);
    const L = logoBlock(stage, 236, 300);
    const kick = el('div', { class: 'center kicker', style: 'top:226px;z-index:5;font-size:34px' }, stage);
    const letters = [...'HACKTX 2026'].map((c) => el('span', { class: 'word', style: 'opacity:0' }, kick, c === ' ' ? '&nbsp;' : c));
    const bar = el('div', { class: 'abs', style: `left:660px;width:600px;top:770px;height:12px;border-radius:6px;background:linear-gradient(90deg,${COL.p1},${COL.orange},${COL.gold});transform-origin:50% 50%;z-index:5;box-shadow:0 0 24px rgba(255,61,110,0.6)` }, stage);
    const imp = impact(stage, 960, 520, { seed: 11 });
    return {
      dur, hits: [tl, tl + B],
      seek(t) {
        bg(t);
        logoIn(L, t, tl);
        const [sx, sy] = shake(t, tl, 0.4, 26);
        const push = 1 + 0.035 * E.inOutCubic(seg(t, tl, dur));
        L.wrap.style.transform = `translate(${sx}px,${sy}px) scale(${push})`;
        letters.forEach((s, i) => { const p = E.outCubic(seg(t, tl + B - 0.12 + i * 0.022, tl + B + 0.1 + i * 0.022)); s.style.opacity = String(p); s.style.transform = `translateY(${(1 - p) * 26}px)`; });
        const pb = E.outExpo(seg(t, tl + B - 0.1, tl + B + 0.25));
        bar.style.transform = `translate(${sx}px,${sy}px) scaleX(${pb})`;
        imp(t, tl);
      },
    };
  }

  function sceneEndCard(stage, P) {
    const B = P.beat, tl = 0.35, dur = 4.0;
    const bg = background(stage, { seed: 21 });
    const L = logoBlock(stage, 170, 205);
    const urlWrap = el('div', { class: 'center', style: 'top:585px;z-index:6' }, stage);
    const url = el('div', { class: 'bungee', style: `display:inline-block;font-size:124px;color:${COL.gold};text-shadow:0 0 40px rgba(255,140,60,0.65),0 8px 0 rgba(0,0,0,0.55);letter-spacing:2px;position:relative;padding:0 10px` }, urlWrap, 'throwhands.tech');
    const caret = el('div', { class: 'abs', style: 'top:12px;bottom:12px;width:12px;background:#fff;box-shadow:0 0 20px #fff;left:0' }, url);
    const under = el('div', { class: 'abs', style: `left:560px;width:800px;top:752px;height:8px;border-radius:4px;background:linear-gradient(90deg,transparent,${COL.gold},transparent);z-index:6` }, stage);
    const tag = el('div', { class: 'center', style: `top:790px;font-weight:800;font-size:36px;letter-spacing:0.18em;color:${COL.w};z-index:6` }, stage, 'PLAY FREE IN YOUR BROWSER. JUST A WEBCAM.');
    const built = el('div', { class: 'center kicker', style: 'top:858px;font-size:24px;z-index:6' }, stage, 'Built at HackTX 2026');
    const imp = impact(stage, 960, 380, { seed: 5, flash: 0.7, ring: 800 });
    const tu = tl + B; // url reveal lands
    return {
      dur, hits: [tl, tu, tl + 2 * B, tl + 3 * B],
      seek(t) {
        bg(t);
        logoIn(L, t, tl, 1300);
        const [sx, sy] = shake(t, tl, 0.35, 20);
        L.wrap.style.transform = `translate(${sx}px,${sy}px) scale(${1 + 0.02 * seg(t, tl, dur)})`;
        imp(t, tl);
        const pr = E.outCubic(seg(t, tu - 0.3, tu));
        url.style.clipPath = `inset(-30px ${((1 - pr) * 100).toFixed(2)}% -30px -10px)`;
        url.style.opacity = t < tu - 0.3 ? '0' : '1';
        caret.style.left = `calc(${(pr * 100).toFixed(2)}% - 12px)`;
        caret.style.opacity = String(t < tu - 0.3 ? 0 : t < tu ? 1 : Math.max(0, 1 - (t - tu) / 0.15));
        const zoom = t > tu ? 1 + Math.exp(-(t - tu) * 10) * 0.06 : 1;
        urlWrap.style.transform = `scale(${zoom})`;
        under.style.opacity = String(E.outCubic(seg(t, tu, tu + 0.3)));
        under.style.transform = `scaleX(${E.outExpo(seg(t, tu, tu + 0.4))})`;
        const pt = E.outCubic(seg(t, tl + 2 * B - 0.15, tl + 2 * B + 0.1));
        tag.style.opacity = String(pt); tag.style.transform = `translateY(${(1 - pt) * 30}px)`; tag.style.letterSpacing = `${0.18 + (1 - pt) * 0.2}em`;
        const pb = E.outCubic(seg(t, tl + 3 * B - 0.15, tl + 3 * B + 0.1));
        built.style.opacity = String(pb); built.style.transform = `translateY(${(1 - pb) * 20}px)`;
      },
    };
  }

  // ------------------------------------------------------------------ kinetic type cards
  /** lines: [[{t, c, size, hit, glitch}]]; words slam on beat-spaced hits. */
  function kinetic(stage, P, spec) {
    const B = P.beat, t0 = 0.12;
    const hitT = (k) => t0 + k * B;
    const bg = background(stage, spec.bg);
    const extra = spec.extra ? spec.extra(stage, hitT) : null;
    const box = el('div', { class: 'center', style: 'top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;z-index:5' }, stage);
    const words = [], lines = [];
    let maxHit = 0;
    for (const line of spec.lines) {
      const le = el('div', { style: 'white-space:nowrap;line-height:1.02;position:relative' }, box);
      lines.push(le);
      line.forEach((w, i) => {
        const e = el('span', { class: 'word bungee', style: `font-size:${w.size}px;color:${COL[w.c]};margin:0 ${i < line.length - 1 ? 0.3 : 0}em 0 0;text-shadow:0 0 36px ${GLOW[w.c] ?? 'transparent'},0 8px 0 rgba(0,0,0,0.55)` }, le, w.t);
        words.push({ e, w, line: le });
        maxHit = Math.max(maxHit, w.hit);
      });
    }
    for (const le of lines) {
      // fit the whole line inside title safe by scaling its words uniformly
      const wpx = le.scrollWidth, maxW = SAFE.x1 - SAFE.x0;
      if (wpx > maxW) for (const { e, line } of words) if (line === le) e.style.fontSize = parseFloat(e.style.fontSize) * (maxW / wpx) * 0.98 + 'px';
    }
    const last = hitT(maxHit);
    const dur = Math.min(3.0, +(last + 1.15).toFixed(3));
    const hits = [...new Set(words.map((x) => +hitT(x.w.hit).toFixed(3)))];
    return {
      dur, hits,
      seek(t) {
        bg(t);
        let sx = 0, sy = 0;
        for (const h of hits) { const [a, b] = shake(t, h, 0.28, h === +last.toFixed(3) ? 18 : 8, h * 10); sx += a; sy += b; }
        box.style.transform = `translate(${sx}px,${sy}px) scale(${1 + 0.03 * seg(t, last, dur)})`;
        for (const { e, w } of words) {
          const tl = hitT(w.hit);
          slam(e, t, tl, { s0: w.s0 ?? 2.0, y0: w.y0 ?? 0 });
          if (w.glitch) e.style.textShadow = glitchShadow(t, tl, w.c, [tl + 0.5, tl + 0.9]);
        }
        if (extra) extra(t, { last, dur });
      },
    };
  }
  function underlineExtra(color, yOff) {
    return (stage, hitT) => null;
  }

  function sceneCardBody(stage, P) {
    return kinetic(stage, P, {
      lines: [
        [{ t: 'YOUR', c: 'w', size: 150, hit: 0 }, { t: 'BODY', c: 'w', size: 150, hit: 1 }],
        [{ t: 'IS THE', c: 'muted', size: 92, hit: 2, s0: 1.6 }],
        [{ t: 'CONTROLLER', c: 'p1', size: 196, hit: 3, glitch: true, s0: 2.6 }],
      ],
      extra: (stage, hitT) => {
        const bar = el('div', { class: 'abs', style: `left:330px;width:1260px;top:792px;height:14px;border-radius:7px;background:linear-gradient(90deg,${COL.p1},${COL.orange});box-shadow:0 0 26px rgba(255,61,110,0.7);transform-origin:0 50%;z-index:4` }, stage);
        const imp = impact(stage, 960, 690, { seed: 9, flash: 0.45, ring: 700, sparks: 26 });
        return (t) => { bar.style.transform = `scaleX(${E.outExpo(seg(t, hitT(3) + 0.02, hitT(3) + 0.35))})`; imp(t, hitT(3)); };
      },
    });
  }

  function sceneCardFriends(stage, P) {
    return kinetic(stage, P, {
      bg: { seed: 31 },
      lines: [
        [{ t: 'FIGHT', c: 'gold', size: 200, hit: 0, s0: 2.4 }],
        [{ t: 'YOUR', c: 'w', size: 124, hit: 1 }, { t: 'FRIENDS', c: 'w', size: 124, hit: 1 }],
        [{ t: 'FROM', c: 'muted', size: 110, hit: 2 }, { t: 'ANYWHERE', c: 'p2', size: 150, hit: 3, glitch: true, s0: 2.5 }],
      ],
      extra: (stage, hitT) => {
        // Two diagonal "screens" (player 1 pink, player 2 blue) slide in and meet at a slanted seam.
        const a = el('div', { class: 'abs', style: `top:-100px;bottom:-100px;left:-200px;width:1180px;background:linear-gradient(90deg,rgba(255,61,110,0.0),rgba(255,61,110,0.20));transform-origin:100% 50%;z-index:1;border-right:6px solid rgba(255,61,110,0.7)` }, stage);
        const b = el('div', { class: 'abs', style: `top:-100px;bottom:-100px;right:-200px;width:1180px;background:linear-gradient(270deg,rgba(51,181,255,0.0),rgba(51,181,255,0.20));z-index:1;border-left:6px solid rgba(51,181,255,0.7)` }, stage);
        const imp = impact(stage, 960, 700, { seed: 13, flash: 0.4, ring: 700, sparks: 24, color: COL.p2 });
        return (t) => {
          const p = E.outExpo(seg(t, hitT(0) - 0.12, hitT(0) + 0.2));
          a.style.transform = `translateX(${(-1300 * (1 - p)).toFixed(1)}px) skewX(-14deg)`;
          b.style.transform = `translateX(${(1300 * (1 - p)).toFixed(1)}px) skewX(-14deg)`;
          imp(t, hitT(3));
        };
      },
    });
  }

  function sceneCardNoController(stage, P) {
    const spec = {
      bg: { seed: 41, a: 'rgba(255,197,61,0.18)' },
      lines: [
        [{ t: 'NO', c: 'w', size: 132, hit: 0 }, { t: 'CONTROLLER.', c: 'w', size: 132, hit: 0 }],
        [{ t: 'NO', c: 'w', size: 132, hit: 1 }, { t: 'DOWNLOAD.', c: 'w', size: 132, hit: 1 }],
        [{ t: 'JUST A', c: 'gold', size: 140, hit: 2, s0: 1.7 }, { t: 'WEBCAM.', c: 'gold', size: 200, hit: 3, glitch: true, s0: 2.6 }],
      ],
    };
    const k = kinetic(stage, P, spec);
    // Strike-through slashes on the first two lines, half a beat after each lands; the struck line dims.
    const B = P.beat, lines = [...stage.querySelectorAll('.center > div')];
    const slashes = [0, 1].map((i) => {
      const s = el('div', { class: 'abs', style: `left:-3%;width:106%;top:50%;height:16px;margin-top:-4px;border-radius:8px;background:${COL.p1};box-shadow:0 0 22px rgba(255,61,110,0.8);transform-origin:0 50%;z-index:2` }, lines[i]);
      return { s, line: lines[i], t: 0.12 + i * B + B * 0.5 };
    });
    const imp = impact(stage, 960, 760, { seed: 17, flash: 0.45, ring: 760, sparks: 28 });
    const seek0 = k.seek;
    k.seek = (t) => {
      seek0(t);
      for (const { s, line, t: ts } of slashes) {
        const p = E.outExpo(seg(t, ts - 0.06, ts + 0.12));
        s.style.transform = `rotate(-4deg) scaleX(${p})`;
        s.style.opacity = t < ts - 0.06 ? '0' : '1';
        for (const w of line.querySelectorAll('.word')) if (t >= ts) w.style.opacity = String(lerp(1, 0.42, seg(t, ts, ts + 0.15)));
      }
      imp(t, 0.12 + 3 * B);
    };
    k.hits = [...k.hits, ...slashes.map((x) => +x.t.toFixed(3))].sort((a, b) => a - b);
    return k;
  }

  /** Section title: a color bar wipes across, then retracts to reveal the title; part number above. */
  function section(stage, P, o) {
    const B = P.beat, dur = 2.0, tA = 0.18, tB = tA + B * 0.5;
    const bg = background(stage, { seed: o.seed, a: o.tint });
    const color = COL[o.color];
    const wrap = el('div', { class: 'abs', style: `left:0;right:0;top:0;bottom:0;z-index:5` }, stage);
    const ghost = el('div', { class: 'abs bungee', style: `right:120px;top:50%;margin-top:-330px;font-size:600px;line-height:1;color:transparent;-webkit-text-stroke:4px ${color};opacity:0.22;z-index:2` }, wrap, o.num);
    const block = el("div", { class: "abs", style: `left:${SAFE.x0}px;top:0px;z-index:3` }, wrap);
    const num = el('div', { class: 'bungee', style: `font-size:64px;color:${color};text-shadow:0 0 30px ${GLOW[o.color]};position:absolute;top:-90px;left:0;letter-spacing:4px;white-space:nowrap` }, block, `${o.num}<span style="font-family:Inter;font-weight:800;font-size:26px;letter-spacing:0.3em;color:${COL.muted};margin-left:22px;vertical-align:middle">${o.kicker}</span>`);
    const title = el('div', { class: 'bungee', style: `font-size:210px;line-height:0.98;color:#fff;text-shadow:0 0 40px rgba(255,255,255,0.18),0 10px 0 rgba(0,0,0,0.55);white-space:nowrap;position:relative` }, block, o.lines.join('<br>'));
    fit(title, SAFE.x1 - SAFE.x0);
    const bar = el('div', { class: 'abs', style: `left:-60px;right:-60px;top:-10px;bottom:-10px;background:${color};box-shadow:0 0 50px ${GLOW[o.color]};z-index:3` }, title);
    const rule = el('div', { class: 'abs', style: `left:0;height:10px;width:520px;border-radius:5px;background:${color};box-shadow:0 0 24px ${GLOW[o.color]};transform-origin:0 50%` }, block);
    const ruleTop = () => title.offsetHeight + 30;
    rule.style.top = ruleTop() + 'px';
    block.style.top = Math.round(540 - (title.offsetHeight + 40) / 2 + 20) + 'px';
    return {
      dur, hits: [+tA.toFixed(3), +tB.toFixed(3)],
      seek(t) {
        bg(t);
        // bar grows from the left until tA, then its left edge sweeps right until tB, revealing the title behind it
        const g = E.outExpo(seg(t, 0, tA)), r = E.inOutCubic(seg(t, tA, tB));
        const left = r * 100, right = (1 - g) * 100;
        bar.style.clipPath = `inset(0 ${right.toFixed(2)}% 0 ${left.toFixed(2)}%)`;
        title.style.color = '#fff';
        title.style.clipPath = t < tA ? 'inset(0 100% 0 0)' : `inset(-40px -40px -40px -40px)`;
        // title rides in slightly from the left as it's revealed
        title.style.transform = `translateX(${(-40 * (1 - E.outCubic(seg(t, tA, tB + 0.2)))).toFixed(1)}px)`;
        const pn = slam(num, t, tA, { s0: 1.8, x0: -60 });
        num.style.transformOrigin = '0 50%';
        rule.style.transform = `scaleX(${E.outExpo(seg(t, tB, tB + 0.4))})`;
        const [sx, sy] = shake(t, tB, 0.3, 10);
        wrap.style.transform = `translate(${sx}px,${sy}px) scale(${1 + 0.025 * seg(t, tB, dur)})`;
        wrap.style.transformOrigin = '30% 50%';
        const pg = E.outExpo(seg(t, 0, 0.5));
        ghost.style.transform = `translateX(${(260 * (1 - pg) - 60 * t).toFixed(1)}px)`;
        ghost.style.opacity = String(0.22 * pg);
      },
    };
  }

  // ------------------------------------------------------------------ AI pipeline diagram
  const ICON = {
    webcam: `<svg width="86" height="70" viewBox="0 0 86 70"><rect x="8" y="6" width="70" height="46" rx="12" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="43" cy="29" r="13" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="43" cy="29" r="4" fill="currentColor"/><path d="M30 64h26M43 52v12" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="68" cy="15" r="3.5" fill="#ff3d6e"/></svg>`,
    gesture: `<svg width="86" height="70" viewBox="0 0 86 70"><path d="M14 40c0-12 8-20 20-20h18c9 0 16 7 16 16v4c0 12-9 22-21 22H32C22 62 14 54 14 44z" fill="none" stroke="currentColor" stroke-width="5"/><path d="M34 20v20M46 20v20M58 23v17" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M4 30h6M2 42h8M6 54h6" stroke="#ffc53d" stroke-width="4" stroke-linecap="round"/></svg>`,
    sim: `<svg width="86" height="70" viewBox="0 0 86 70"><rect x="14" y="4" width="58" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="4.5"/><rect x="14" y="26" width="58" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="4.5"/><rect x="14" y="48" width="58" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="4.5"/><circle cx="24" cy="12.5" r="3" fill="#3dff9a"/><circle cx="24" cy="34.5" r="3" fill="#3dff9a"/><circle cx="24" cy="56.5" r="3" fill="#3dff9a"/></svg>`,
    screen: `<svg width="86" height="70" viewBox="0 0 86 70"><rect x="6" y="4" width="74" height="48" rx="7" fill="none" stroke="currentColor" stroke-width="5"/><path d="M30 66h26M43 52v14" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="30" cy="22" r="5" fill="#ff3d6e"/><path d="M30 27v12M30 31l8-4" stroke="#ff3d6e" stroke-width="4" stroke-linecap="round"/><circle cx="56" cy="22" r="5" fill="#33b5ff"/><path d="M56 27v12M56 31l-8 3" stroke="#33b5ff" stroke-width="4" stroke-linecap="round"/></svg>`,
  };
  // A pose skeleton (MediaPipe-style joints) for the pose node; dots light up one by one.
  const POSE_PTS = [[43, 8], [36, 6], [50, 6], [43, 14], [30, 22], [56, 22], [20, 34], [70, 30], [12, 24], [80, 20], [34, 44], [52, 44], [32, 56], [54, 56], [30, 68], [56, 68]];
  const POSE_LINES = [[4, 5], [4, 6], [6, 8], [5, 7], [7, 9], [4, 10], [5, 11], [10, 11], [10, 12], [11, 13], [12, 14], [13, 15], [3, 4], [3, 5]];

  function scenePipeline(stage, P) {
    const dur = 9.0;
    const bg = background(stage, { seed: 51, a: 'rgba(51,181,255,0.22)', b: 'rgba(255,61,110,0.16)' });
    const head = el('div', { class: 'center', style: 'top:118px;z-index:6' }, stage);
    const kick = el('div', { class: 'kicker', style: `font-size:26px;color:${COL.p2}` }, head, 'How the AI works');
    const title = el('div', { class: 'bungee', style: 'font-size:56px;margin-top:8px;color:#fff;text-shadow:0 0 30px rgba(51,181,255,0.45),0 6px 0 rgba(0,0,0,0.5)' }, head, 'From your body to their screen');
    const svg = fullSvg(stage, 3);
    const defs = sv('defs', {}, svg);
    for (const [id, c] of Object.entries({ gp2: COL.p2, ggold: COL.gold, ggood: COL.good, gp1: COL.p1 })) {
      const g = sv('radialGradient', { id }, defs);
      sv('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': 1 }, g);
      sv('stop', { offset: '35%', 'stop-color': c, 'stop-opacity': 0.95 }, g);
      sv('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': 0 }, g);
    }
    const NW = 262, NH = 214, NY = 418; // main row centre y
    const xs = [232, 596, 960, 1324, 1688];
    const MAIN = [
      { icon: 'webcam', t: 'WEBCAM', s: "your laptop's camera", c: 'p2' },
      { icon: 'pose', t: 'MEDIAPIPE POSE', s: '33 body points, run in your browser', c: 'p2' },
      { icon: 'gesture', t: 'GESTURE RULES', s: 'punches, guard and supers from joint angles', c: 'p2' },
      { icon: 'sim', t: 'GAME SIM', s: 'one shared sim; online, the server decides every hit', c: 'p1' },
      { icon: 'screen', t: "OPPONENT'S SCREEN", s: 'same tick, same state', c: 'p2' },
    ];
    const nodeEl = (x, y, w, h, n, small) => {
      const d = el('div', { class: 'abs', style: `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;border-radius:22px;background:rgba(14,18,34,0.92);border:3px solid ${COL[n.c]};box-shadow:0 0 34px ${GLOW[n.c]}, inset 0 0 30px rgba(255,255,255,0.03);z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${small ? '10px 18px' : '14px 14px'};color:${COL[n.c]}` }, stage);
      if (n.icon) { const ic = el('div', { style: 'height:74px;display:flex;align-items:center;justify-content:center' }, d, n.icon === 'pose' ? '' : ICON[n.icon]); n.iconEl = ic; }
      el('div', { class: 'bungee', style: `font-size:${small ? 32 : 27}px;line-height:1.05;color:${small ? COL[n.c] : '#fff'};margin-top:${n.icon ? 6 : 0}px` }, d, n.t);
      el('div', { style: `font-size:${small ? 21 : 19.5}px;line-height:1.25;font-weight:600;color:${COL.muted};margin-top:7px` }, d, n.s);
      return d;
    };
    const nodes = MAIN.map((n, i) => ({ ...n, e: nodeEl(xs[i], NY, NW, NH, n), x: xs[i], tIn: 0.5 + i * 0.55 }));
    // pose skeleton inside the MediaPipe node
    const poseSvg = sv('svg', { width: 92, height: 74, viewBox: '0 0 92 76' }, MAIN[1].iconEl);
    const poseLines = POSE_LINES.map(([a, b]) => sv('line', { x1: POSE_PTS[a][0], y1: POSE_PTS[a][1], x2: POSE_PTS[b][0], y2: POSE_PTS[b][1], stroke: COL.p2, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0 }, poseSvg));
    const poseDots = POSE_PTS.map(([x, y], i) => sv('circle', { cx: x, cy: y, r: i < 3 ? 3 : 4, fill: i % 3 === 0 ? COL.p1 : '#fff', opacity: 0 }, poseSvg));

    // arrows between main nodes
    const paths = [];
    const addPath = (d, color, grad, tDraw, tEnd, n, period) => {
      const glow = sv('path', { d, fill: 'none', stroke: COL[color], 'stroke-width': 12, opacity: 0.18, 'stroke-linecap': 'round' }, svg);
      const p = sv('path', { d, fill: 'none', stroke: COL[color], 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
      const len = p.getTotalLength();
      p.setAttribute('stroke-dasharray', `${len} ${len}`); glow.setAttribute('stroke-dasharray', `${len} ${len}`);
      const end = p.getPointAtLength(len), pre = p.getPointAtLength(len - 6);
      const ang = (Math.atan2(end.y - pre.y, end.x - pre.x) * 180) / Math.PI;
      const head = sv('polygon', { points: '0,0 -22,-13 -22,13', fill: COL[color], transform: `translate(${end.x} ${end.y}) rotate(${ang})` }, svg);
      const parts = [];
      for (let i = 0; i < n; i++) parts.push({ halo: sv('circle', { r: 16, fill: `url(#${grad})`, opacity: 0 }, svg), dot: sv('circle', { r: 5, fill: '#fff', opacity: 0 }, svg), ph: i / n });
      paths.push({ p, glow, head, len, tDraw, tEnd, parts, period });
    };
    const ax = (i) => [xs[i] + NW / 2 + 4, xs[i + 1] - NW / 2 - 8];
    for (let i = 0; i < 4; i++) { const [a, b] = ax(i); addPath(`M${a} ${NY} L${b} ${NY}`, 'p2', 'gp2', nodes[i].tIn + 0.2, nodes[i + 1].tIn, 3, 0.62); }
    // label on the gestures -> sim arrow: what actually travels
    const pill = el('div', { class: 'abs', style: `left:${(xs[2] + xs[3]) / 2 - 220}px;width:440px;top:${NY - NH / 2 - 58}px;text-align:center;z-index:6` }, stage, `<span style="display:inline-block;background:rgba(61,255,154,0.12);border:2px solid rgba(61,255,154,0.55);color:${COL.good};border-radius:999px;padding:6px 16px;font-weight:800;font-size:19px;letter-spacing:0.06em;white-space:nowrap">JOINTS + ACTIONS, NO VIDEO</span>`);

    // branches
    const BY = 778, BW = 400, BH = 156;
    const BR = [
      { t: 'META MUSE', s: 'Fighter Forge: Muse Spark writes the name and backstory, Muse Image paints the card', c: 'gold', x: 640, tIn: 3.3 },
      { t: 'GEMINI', s: 'writes live roasts from the fight, shown as captions', c: 'good', x: 1120, tIn: 3.95 },
      { t: 'ELEVENLABS', s: 'the announcer voice: pre-recorded calls and roasts', c: 'p1', x: 1580, tIn: 4.6 },
    ];
    const branches = BR.map((b) => ({ ...b, e: nodeEl(b.x, BY, BW, BH, b, true) }));
    const simX = xs[3], simB = NY + NH / 2;
    addPath(`M${BR[0].x + 60} ${BY - BH / 2 - 4} C${BR[0].x + 60} ${BY - 170}, ${simX - 70} ${simB + 110}, ${simX - 70} ${simB + 14}`, 'gold', 'ggold', 3.3, 3.85, 4, 1.1);
    addPath(`M${simX - 10} ${simB + 4} C${simX - 10} ${simB + 90}, ${BR[1].x + 40} ${BY - 170}, ${BR[1].x + 40} ${BY - BH / 2 - 14}`, 'good', 'ggood', 3.95, 4.45, 4, 1.0);
    addPath(`M${simX + 60} ${simB + 4} C${simX + 60} ${simB + 100}, ${BR[2].x - 60} ${BY - 180}, ${BR[2].x - 60} ${BY - BH / 2 - 14}`, 'p1', 'gp1', 4.6, 5.1, 4, 1.0);
    const evLabel = el('div', { class: 'abs', style: `left:${simX + 40 - 110}px;width:220px;top:${simB + 92}px;text-align:center;font-weight:800;font-size:16px;line-height:1.3;letter-spacing:0.2em;color:${COL.muted};z-index:6` }, stage, 'FIGHT<br>EVENTS');
    const muLabel = el('div', { class: 'abs', style: `left:${BR[0].x + 80}px;width:300px;top:${simB + 58}px;font-weight:800;font-size:18px;letter-spacing:0.22em;color:${COL.gold};z-index:6` }, stage, 'BEFORE THE FIGHT');

    const nodeIn = (e, t, tIn) => {
      const p = seg(t, tIn - 0.05, tIn + 0.3);
      e.style.opacity = String(clamp(p * 3));
      e.style.transform = `scale(${t < tIn - 0.05 ? 0.6 : lerp(0.6, 1, E.outBack(p))})`;
    };
    return {
      dur, hits: nodes.map((n) => n.tIn).concat(BR.map((b) => b.tIn)),
      seek(t) {
        bg(t);
        const ph = E.outCubic(seg(t, 0, 0.4));
        head.style.opacity = String(ph); head.style.transform = `translateY(${(1 - ph) * -30}px)`;
        // pulse: a highlight that runs along the main row every 1.6 s once the row is built
        const pulseX = t > 3.0 ? ((t - 3.0) % 1.6) / 1.6 : -1;
        nodes.forEach((n, i) => {
          nodeIn(n.e, t, n.tIn);
          const near = pulseX >= 0 ? Math.max(0, 1 - Math.abs(pulseX * 4.6 - i) * 1.5) : 0;
          n.e.style.boxShadow = `0 0 ${34 + near * 40}px ${GLOW[n.c]}, inset 0 0 ${30 + near * 30}px rgba(255,255,255,${0.03 + near * 0.08})`;
        });
        branches.forEach((b) => nodeIn(b.e, t, b.tIn));
        // pose dots light up after the node lands, then breathe
        poseDots.forEach((d, i) => { const tt = nodes[1].tIn + 0.15 + i * 0.03; d.setAttribute('opacity', String(seg(t, tt, tt + 0.08))); d.setAttribute('transform', t > tt ? `translate(${Math.sin(t * 3 + i) * 0.8} ${Math.cos(t * 2.4 + i) * 0.8})` : ''); });
        poseLines.forEach((l, i) => l.setAttribute('opacity', String(0.7 * seg(t, nodes[1].tIn + 0.35 + i * 0.02, nodes[1].tIn + 0.5 + i * 0.02))));
        for (const P_ of paths) {
          const dp = E.inOutCubic(seg(t, P_.tDraw, P_.tEnd));
          const off = P_.len * (1 - dp);
          P_.p.setAttribute('stroke-dashoffset', off); P_.glow.setAttribute('stroke-dashoffset', off);
          P_.head.setAttribute('opacity', String(seg(dp, 0.9, 1)));
          const live = seg(t, P_.tEnd, P_.tEnd + 0.3);
          for (const q of P_.parts) {
            const f = (((t - P_.tEnd) / P_.period + q.ph) % 1 + 1) % 1;
            const pt = P_.p.getPointAtLength(f * P_.len);
            const fade = Math.min(1, f * 6, (1 - f) * 6) * live;
            q.halo.setAttribute('cx', pt.x); q.halo.setAttribute('cy', pt.y); q.halo.setAttribute('opacity', String(fade));
            q.dot.setAttribute('cx', pt.x); q.dot.setAttribute('cy', pt.y); q.dot.setAttribute('opacity', String(fade));
          }
        }
        const pp = E.outCubic(seg(t, 2.25, 2.55));
        pill.style.opacity = String(pp); pill.style.transform = `translateY(${(1 - pp) * 14}px) scale(${lerp(0.8, 1, pp)})`;
        evLabel.style.opacity = String(seg(t, 4.0, 4.3));
        muLabel.style.opacity = String(seg(t, 3.6, 3.9));
      },
    };
  }

  // ------------------------------------------------------------------ stat counters
  function sceneStats(stage, P) {
    const B = P.beat, dur = 6.0;
    const bg = background(stage, { seed: 61, a: 'rgba(255,197,61,0.16)' });
    const head = el('div', { class: 'center', style: 'top:150px;z-index:6' }, stage);
    el('div', { class: 'kicker', style: 'font-size:26px' }, head, 'Measured, not claimed');
    el('div', { class: 'bungee', style: 'font-size:62px;margin-top:10px;color:#fff;text-shadow:0 0 30px rgba(255,197,61,0.35),0 6px 0 rgba(0,0,0,0.5)' }, head, 'Tested like a real player');
    const STATS = P.stats;
    const TW = 360, GAP = 32, x0 = SAFE.x0;
    const tiles = STATS.map((s, i) => {
      const d = el('div', { class: 'abs', style: `left:${x0 + i * (TW + GAP)}px;top:330px;width:${TW}px;height:470px;border-radius:26px;background:rgba(14,18,34,0.9);border:3px solid ${COL[s.c]};box-shadow:0 0 34px ${GLOW[s.c]};z-index:5;display:flex;flex-direction:column;align-items:center;padding:34px 22px 0;text-align:center` }, stage);
      const num = el('div', { class: 'bungee', style: `font-size:176px;line-height:1;color:${COL[s.c]};text-shadow:0 0 40px ${GLOW[s.c]},0 8px 0 rgba(0,0,0,0.5);height:190px;white-space:nowrap` }, d, '0');
      el('div', { style: 'font-weight:800;font-size:31px;letter-spacing:0.06em;color:#fff;margin-top:22px;line-height:1.15' }, d, s.label);
      const sub = el('div', { style: `font-weight:600;font-size:24px;color:${COL.muted};margin-top:14px;line-height:1.3` }, d, '');
      num.textContent = s.countSub ? s.value : (s.dec ? s.value.toFixed(s.dec) : String(s.value)) + (s.suffix ?? '');
      fit(num, TW - 44);
      return { s, d, num, sub, tIn: 0.35 + i * B, tLand: 0.35 + i * B + 1.0 };
    });
    const fmt = (v, dec) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const imps = tiles.map((tl, i) => impact(stage, x0 + i * (TW + GAP) + TW / 2, 460, { seed: 70 + i, flash: 0, ring: 260, sparks: 16 }));
    return {
      dur, hits: tiles.map((x) => +x.tLand.toFixed(3)),
      seek(t) {
        bg(t);
        tiles.forEach((T, i) => {
          const p = E.outCubic(seg(t, T.tIn - 0.15, T.tIn + 0.2));
          const pop = t > T.tLand ? 1 + Math.exp(-(t - T.tLand) * 12) * 0.08 : 1;
          T.d.style.opacity = String(p);
          T.d.style.transform = `translateY(${((1 - p) * 80).toFixed(1)}px) scale(${pop})`;
          const c = E.outExpo(seg(t, T.tIn, T.tLand));
          const s = T.s;
          if (s.countSub) {
            // big number is fixed (0 mismatches); the tick count runs up underneath
            T.num.textContent = s.value;
            T.sub.innerHTML = s.sub.replace('{n}', fmt(Math.round(s.countSub * c), 0));
          } else {
            T.num.textContent = fmt(s.value * c, s.dec ?? 0) + (s.suffix ?? '');
            T.sub.innerHTML = s.sub;
          }
          T.num.style.transform = t > T.tLand ? `scale(${1 + Math.exp(-(t - T.tLand) * 10) * 0.18})` : 'scale(1)';
          T.d.style.boxShadow = `0 0 ${34 + (t > T.tLand ? Math.exp(-(t - T.tLand) * 6) * 60 : 0)}px ${GLOW[s.c]}`;
          imps[i](t, T.tLand);
        });
      },
    };
  }

  // ------------------------------------------------------------------ overlays (alpha)
  const ARROW_SVG = (c) => `<svg width="118" height="64" viewBox="0 0 118 64"><path class="ashaft" d="M6 32 H92" stroke="${c}" stroke-width="12" stroke-linecap="round" fill="none"/><path class="ahead" d="M74 8 L104 32 L74 56" stroke="${c}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

  function sceneCallout(stage, P) {
    const dur = P.dur ?? 2.5, color = COL[P.color ?? 'p1'];
    const root = el('div', { class: 'abs', style: `left:${SAFE.x0}px;top:${P.y ?? 742}px;z-index:5` }, stage);
    const grp = el('div', { style: 'display:flex;align-items:stretch;transform-origin:0 50%' }, root);
    const mv = el('div', { style: `background:${color};padding:0 34px;height:108px;display:flex;align-items:center;transform:skewX(-12deg);box-shadow:0 10px 30px rgba(0,0,0,0.45), 0 0 34px ${GLOW[P.color ?? 'p1']}` }, grp);
    const mvT = el('div', { class: 'bungee', style: 'font-size:54px;color:#fff;transform:skewX(12deg);white-space:nowrap;text-shadow:0 4px 0 rgba(0,0,0,0.35)' }, mv, P.move);
    const ar = el('div', { style: 'width:150px;height:108px;display:flex;align-items:center;justify-content:center;transform:skewX(-12deg);background:rgba(7,9,18,0.82)' }, grp, `<div style="transform:skewX(12deg)">${ARROW_SVG(COL.gold)}</div>`);
    const ef = el('div', { style: `background:rgba(7,9,18,0.86);border:3px solid ${COL.gold};border-left:none;padding:0 38px 0 22px;height:108px;display:flex;align-items:center;transform:skewX(-12deg);box-shadow:0 10px 30px rgba(0,0,0,0.45)` }, grp);
    const efT = el('div', { class: 'bungee', style: `font-size:50px;color:${COL.gold};transform:skewX(12deg);white-space:nowrap;text-shadow:0 0 22px rgba(255,140,60,0.6),0 4px 0 rgba(0,0,0,0.4)` }, ef, P.effect);
    const rule = el('div', { style: `height:8px;margin-top:10px;margin-left:-12px;border-radius:4px;background:linear-gradient(90deg,${color},${COL.gold},transparent);transform-origin:0 50%` }, root);
    const maxW = SAFE.x1 - SAFE.x0;
    if (grp.scrollWidth > maxW) { const k = maxW / grp.scrollWidth; mvT.style.fontSize = 54 * k + 'px'; efT.style.fontSize = 50 * k + 'px'; }
    const shaft = ar.querySelector('.ashaft'), headA = ar.querySelector('.ahead');
    const sl = shaft.getTotalLength(), hl = headA.getTotalLength();
    shaft.setAttribute('stroke-dasharray', `${sl} ${sl}`); headA.setAttribute('stroke-dasharray', `${hl} ${hl}`);
    // optional pointer from the bar to a body part in the footage
    let ptr = null;
    if (P.target) {
      const svg = fullSvg(stage, 4);
      const r = grp.getBoundingClientRect();
      const sx = r.left + r.width * 0.55, sy = r.top - 6, [tx, ty] = P.target;
      const d = `M${sx} ${sy} Q${sx} ${ty}, ${tx - Math.sign(tx - sx) * 40} ${ty}`;
      const path = sv('path', { d, fill: 'none', stroke: COL.gold, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': '1 1' }, svg);
      const len = path.getTotalLength(); path.setAttribute('stroke-dasharray', `${len} ${len}`);
      const ring = sv('circle', { cx: tx, cy: ty, r: 30, fill: 'none', stroke: COL.gold, 'stroke-width': 6 }, svg);
      const dot = sv('circle', { cx: tx, cy: ty, r: 9, fill: COL.gold }, svg);
      ptr = { path, len, ring, dot };
    }
    const tM = 0.22, tE = 0.46, tOut = dur - 0.32;
    return {
      dur, hits: [tM, tE], alpha: true,
      seek(t) {
        const pm = E.outExpo(seg(t, 0, tM));
        mv.style.clipPath = `inset(-40px ${((1 - pm) * 100).toFixed(2)}% -40px -40px)`;
        mvT.style.transform = `skewX(12deg) translateX(${((1 - pm) * -60).toFixed(1)}px)`;
        const pa = E.outCubic(seg(t, 0.12, 0.36));
        ar.style.opacity = t < 0.1 ? '0' : '1';
        shaft.setAttribute('stroke-dashoffset', sl * (1 - pa));
        headA.setAttribute('stroke-dashoffset', hl * (1 - E.outCubic(seg(t, 0.26, 0.42))));
        // arrow nudges right on a loop while held
        const nud = t > 0.5 && t < tOut ? Math.max(0, Math.sin((t - 0.5) * Math.PI * 2 * 1.3)) * 9 : 0;
        ar.firstChild.style.transform = `skewX(12deg) translateX(${nud.toFixed(1)}px)`;
        const pe = E.outExpo(seg(t, 0.28, tE));
        ef.style.clipPath = `inset(-40px ${((1 - pe) * 100).toFixed(2)}% -40px -40px)`;
        const pop = t > tE ? 1 + Math.exp(-(t - tE) * 11) * 0.14 : lerp(1.3, 1, pe);
        efT.style.transform = `skewX(12deg) scale(${pop.toFixed(4)})`;
        rule.style.transform = `scaleX(${E.outExpo(seg(t, 0.3, 0.7))})`;
        // out: slide left and wipe away
        const po = E.inCubic(seg(t, tOut, dur));
        root.style.transform = `translateX(${(-po * 140).toFixed(1)}px)`;
        root.style.opacity = String(1 - po);
        root.style.clipPath = po > 0 ? `inset(-60px -60px -60px ${(po * 100).toFixed(1)}%)` : 'none';
        if (ptr) {
          const pp = E.outCubic(seg(t, 0.4, 0.75));
          ptr.path.setAttribute('stroke-dashoffset', ptr.len * (1 - pp));
          ptr.path.setAttribute('opacity', String(1 - po));
          const rp = ((t - 0.75) % 0.8) / 0.8;
          ptr.ring.setAttribute('r', String(t > 0.75 ? 20 + rp * 40 : 0));
          ptr.ring.setAttribute('opacity', String(t > 0.75 ? (1 - rp) * (1 - po) : 0));
          ptr.dot.setAttribute('opacity', String(seg(t, 0.7, 0.78) * (1 - po)));
        }
      },
    };
  }

  /** "REAL PUNCH" label for the webcam picture-in-picture: corner brackets around the PiP rect, a tag, and chevrons pointing at the fighter. */
  function scenePip(stage, P) {
    const dur = P.dur ?? 2.5;
    const R = P.rect ?? { x: 1288, y: 150, w: 480, h: 360 };
    const svg = fullSvg(stage, 4);
    const frame = sv('rect', { x: R.x, y: R.y, width: R.w, height: R.h, rx: 10, fill: 'none', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 3 }, svg);
    const A = 54;
    const corners = [[R.x, R.y, 1, 1], [R.x + R.w, R.y, -1, 1], [R.x, R.y + R.h, 1, -1], [R.x + R.w, R.y + R.h, -1, -1]].map(([x, y, dx, dy]) => ({ x, y, dx, dy, e: sv('path', { d: `M0 ${dy * A} L0 0 L${dx * A} 0`, fill: 'none', stroke: '#fff', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'filter:drop-shadow(0 0 10px rgba(255,61,110,0.9))' }, svg) }));
    const tag = el('div', { class: 'abs', style: `left:${R.x - 14}px;top:${R.y + R.h - 34}px;z-index:6;display:flex;align-items:center;gap:0;transform-origin:0 50%` }, stage);
    const t1 = el('div', { style: `background:${COL.p1};padding:6px 24px;transform:skewX(-12deg);box-shadow:0 8px 24px rgba(0,0,0,0.45),0 0 28px rgba(255,61,110,0.6)` }, tag, `<div class="bungee" style="font-size:46px;color:#fff;transform:skewX(12deg);white-space:nowrap">${P.label ?? 'REAL PUNCH'}</div>`);
    const sub = el('div', { class: 'abs', style: `left:${R.x}px;top:${R.y + R.h + 34}px;z-index:6;font-weight:800;font-size:22px;letter-spacing:0.16em;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,0.9);display:flex;align-items:center;gap:10px;white-space:nowrap` }, stage, `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#ff2a3a;box-shadow:0 0 10px #ff2a3a"></span>${P.sub ?? "THE PLAYER'S WEBCAM"}`);
    // chevrons pointing from the PiP toward the fighter (left by default)
    const dir = P.dir ?? -1, cy = R.y + R.h / 2, cx0 = dir < 0 ? R.x - 30 : R.x + R.w + 30;
    const chev = [0, 1, 2].map((i) => sv('path', { d: `M${dir * -18} -30 L${dir * 14} 0 L${dir * -18} 30`, fill: 'none', stroke: COL.gold, 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'filter:drop-shadow(0 0 8px rgba(255,140,60,0.8))' }, svg));
    const tL = 0.3;
    return {
      dur, hits: [tL], alpha: true,
      seek(t) {
        const pc = E.outExpo(seg(t, 0, 0.3));
        for (const c of corners) c.e.setAttribute('transform', `translate(${c.x - c.dx * 60 * (1 - pc)} ${c.y - c.dy * 60 * (1 - pc)})`), c.e.setAttribute('opacity', String(clamp(pc * 2)));
        frame.setAttribute('opacity', String(seg(t, 0.15, 0.4)));
        const pt = E.outExpo(seg(t, 0.12, tL));
        tag.style.clipPath = `inset(-30px ${((1 - pt) * 100).toFixed(1)}% -30px -30px)`;
        tag.style.transform = t > tL ? `scale(${1 + Math.exp(-(t - tL) * 11) * 0.1})` : 'scale(1)';
        sub.style.opacity = String(E.outCubic(seg(t, 0.35, 0.6)));
        sub.style.transform = `translateY(${(1 - E.outCubic(seg(t, 0.35, 0.6))) * 12}px)`;
        chev.forEach((c, i) => {
          const f = t < 0.45 ? -1 : (((t - 0.45) * 1.4 + i / 3) % 1);
          const x = cx0 + dir * f * 120;
          c.setAttribute('transform', `translate(${x} ${cy})`);
          c.setAttribute('opacity', f < 0 ? '0' : String(Math.min(1, f * 4, (1 - f) * 3)));
        });
      },
    };
  }

  /** Whip: dark bands with bright leading edges sweep right-to-left; the frame is fully covered at the middle frame (cut there). */
  function sceneWhip(stage, P) {
    const frames = P.frames ?? 9, dur = frames / 30, mid = (frames - 1) / 2;
    const r = rng(P.seed ?? 99);
    const bands = [];
    let y = 0;
    while (y < H) {
      const h = Math.min(H - y, Math.round(18 + r() * 90));
      const edge = [COL.p1, COL.p2, '#ffffff', COL.gold][Math.floor(r() * 4)];
      const e = el('div', { class: 'abs', style: `top:${y}px;height:${h}px;left:0;width:0;background:linear-gradient(90deg,rgba(7,9,18,0.98),rgba(16,14,40,0.98));z-index:2` }, stage);
      const lead = el('div', { class: 'abs', style: `top:0;bottom:0;width:${Math.round(8 + r() * 36)}px;background:${edge};box-shadow:0 0 24px ${edge}` }, e);
      bands.push({ e, lead, d1: r() * 0.22, d2: r() * 0.2 });
      y += h;
    }
    const streaks = Array.from({ length: 26 }, () => ({ y: r() * H, h: 2 + r() * 5, len: 300 + r() * 900, o: r(), c: r() < 0.5 ? '#ffffff' : r() < 0.5 ? COL.p2 : COL.p1 }))
      .map((s) => ({ ...s, e: el('div', { class: 'abs', style: `top:${s.y}px;height:${s.h}px;width:${s.len}px;left:0;background:linear-gradient(90deg,transparent,${s.c},transparent);z-index:3` }, stage) }));
    return {
      dur, hits: [+(mid / 30).toFixed(3)], alpha: true, cutFrame: mid,
      seek(t) {
        const p = clamp((t * 30) / (frames - 1));
        for (const b of bands) {
          const e1 = E.outCubic(clamp((p - b.d1) / (0.5 - b.d1)));
          const x1 = E.inCubic(clamp((p - 0.5) / (0.5 - b.d2)));
          const L = W * (1 - e1), R = W * (1 - x1);
          b.e.style.left = L + 'px'; b.e.style.width = Math.max(0, R - L) + 'px';
          b.lead.style.left = p <= 0.5 ? '0' : 'auto'; b.lead.style.right = p <= 0.5 ? 'auto' : '0';
          b.lead.style.opacity = p === 0.5 ? '0.35' : '1';
        }
        for (const s of streaks) {
          const x = W + 200 - (p * 1.6 + s.o * 0.3) * (W + s.len + 600);
          s.e.style.transform = `translateX(${x}px)`;
          s.e.style.opacity = p > 0 && p < 1 ? '0.9' : '0';
        }
      },
    };
  }

  /** Glitch: displaced RGB slices build to a full cover on the middle frame, then break apart. */
  function sceneGlitch(stage, P) {
    const frames = P.frames ?? 9, dur = frames / 30, mid = (frames - 1) / 2;
    const cover = el('div', { class: 'abs', style: 'inset:0;background:#070912;z-index:1' }, stage);
    const layer = el('div', { class: 'abs', style: 'inset:0;z-index:2' }, stage);
    const scan = el('div', { class: 'abs', style: 'inset:0;z-index:3;background:repeating-linear-gradient(0deg,rgba(255,255,255,0.07) 0 2px,transparent 2px 6px)' }, stage);
    const COLS = [COL.p1, COL.p2, '#ffffff', '#070912', '#1a1440', COL.gold];
    return {
      dur, hits: [+(mid / 30).toFixed(3)], alpha: true, cutFrame: mid,
      seek(t) {
        const f = Math.round(t * 30);
        const k = 1 - Math.abs(f - mid) / (mid + 1); // 0..1, peaks at mid
        cover.style.opacity = f === mid ? '1' : String(Math.max(0, k - 0.45) * 1.4);
        scan.style.opacity = String(k);
        layer.innerHTML = '';
        const r = rng(1000 + f * 17);
        const n = Math.round(10 + k * 60);
        for (let i = 0; i < n; i++) {
          const h = 6 + r() * 110 * k + 4, y = r() * H, w = 200 + r() * 1600, x = r() * W - w / 2;
          const c = COLS[Math.floor(r() * COLS.length)];
          el('div', { class: 'abs', style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${c};opacity:${(0.45 + r() * 0.55).toFixed(2)};mix-blend-mode:${r() < 0.4 ? 'screen' : 'normal'}` }, layer);
        }
        // RGB offset bars
        for (let i = 0; i < 6; i++) {
          const y = r() * H, h = 20 + r() * 60, off = (r() - 0.5) * 120 * k;
          el('div', { class: 'abs', style: `left:${off}px;top:${y}px;width:${W}px;height:${h}px;background:linear-gradient(90deg,rgba(255,61,110,0.5),rgba(51,181,255,0.5));mix-blend-mode:screen;opacity:${k.toFixed(2)}` }, layer);
        }
      },
    };
  }

  function sceneFlash(stage, P) {
    const levels = P.levels ?? [1, 0.55, 0.2];
    const f = el('div', { class: 'abs', style: 'inset:0;background:#fff' }, stage);
    return { dur: levels.length / 30, hits: [0], alpha: true, seek(t) { f.style.opacity = String(levels[Math.min(levels.length - 1, Math.round(t * 30))]); } };
  }

  const SCENES = {
    logo_open: sceneLogoOpen,
    end_card: sceneEndCard,
    card_body: sceneCardBody,
    card_friends: sceneCardFriends,
    card_nocontroller: sceneCardNoController,
    title_demo: (s, P) => section(s, P, { num: '02', kicker: 'PART TWO', lines: ['THE DEMO'], color: 'p1', seed: 81 }),
    title_ai: (s, P) => section(s, P, { num: '03', kicker: 'PART THREE', lines: ['HOW THE', 'AI WORKS'], color: 'p2', seed: 82, tint: 'rgba(51,181,255,0.24)' }),
    title_built: (s, P) => section(s, P, { num: '04', kicker: 'PART FOUR', lines: ['HOW WE', 'BUILT IT'], color: 'gold', seed: 83, tint: 'rgba(255,197,61,0.2)' }),
    pipeline: scenePipeline,
    stats: sceneStats,
    callout: sceneCallout,
    pip: scenePip,
    whip: sceneWhip,
    glitch: sceneGlitch,
    flash: sceneFlash,
  };

  let current = null;
  window.__build = (kind, params) => {
    const stage = document.getElementById('stage');
    stage.innerHTML = '';
    document.body.classList.remove('opaque');
    current = SCENES[kind](stage, params);
    current.seek(0);
    return { dur: current.dur, hits: current.hits, alpha: !!current.alpha, cutFrame: current.cutFrame ?? null };
  };
  window.__seek = (t) => { current.seek(t); };
  // Browser preview: index.html?scene=pipeline&t=3.2
  const q = new URLSearchParams(location.search);
  if (q.get('scene')) document.fonts.ready.then(() => { window.__build(q.get('scene'), { beat: 0.469, ...(q.get('p') ? JSON.parse(q.get('p')) : {}) }); window.__seek(+(q.get('t') ?? 1)); });
})();
