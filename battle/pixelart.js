/* D2 MOBIUS — pixel-art core (pure JS: works in the browser and in Node)
 * - rasterize(): build a sprite from layered shapes (ellipse / rect / polygon / thick line) into
 *   material rows — smooth curves and tapers that are hard to hand-type as ASCII
 * - shadeRows(): material rows → RGBA with hue-shifted 5-tone ramps, top-left bevel light,
 *   auto outline and selective (internal) outlines
 * - GUARDIANS: 64px chibi Titan / Hunter / Warlock (3/4 view facing right),
 *   after spyKles' Destiny pixel art
 */
(function (root) {
  'use strict';

  // ---------------- color ----------------
  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function shadeHex(hex, amt) {
    const f = v => Math.max(0, Math.min(255, v + amt));
    const [r, g, b] = hexToRgb(hex);
    return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
  }
  function hexToHsl(hex) {
    const [R, G, B] = hexToRgb(hex).map(v => v / 255);
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const f = t => {
      t = (t + 1) % 1;
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const hx = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return '#' + hx(f(h + 1 / 3)) + hx(f(h)) + hx(f(h - 1 / 3));
  }
  // 5-step ramp: shadows cooler & more saturated, highlights warmer & lighter
  const rampCache = new Map();
  function ramp(base) {
    if (rampCache.has(base)) return rampCache.get(base);
    const [h, s, l] = hexToHsl(base);
    const toward = (target, k) => h + ((((target - h) % 360) + 540) % 360 - 180) * k;
    const r = [
      hslToHex(toward(240, 0.2), s * 1.05 + 0.05, l * 0.4),
      hslToHex(toward(240, 0.1), s * 1.02 + 0.03, l * 0.68),
      base,
      hslToHex(toward(55, 0.08), s * 0.95, l + (1 - l) * 0.3),
      hslToHex(toward(55, 0.14), s * 0.8, l + (1 - l) * 0.6),
    ];
    rampCache.set(base, r);
    return r;
  }

  const OUTLINE = '#141626';

  /* rows: array of strings (material chars, '.' transparent, 'K' outline)
   * mats: char → { c: base, g: group, glow: bool, tone: offset }
   * Returns { w, h, data: Uint8ClampedArray RGBA } padded by 1px for the outline. */
  function shadeRows(rows, mats, outline = OUTLINE) {
    const H = rows.length, W = Math.max(...rows.map(r => r.length));
    const at = (x, y) => (y < 0 || y >= H || x < 0 || x >= W) ? '.' : (rows[y][x] || '.');
    const solid = ch => ch !== '.' && ch !== ' ';
    const group = ch => (mats[ch] && mats[ch].g) || ch;
    const parts = rows.parts;
    const partAt = (x, y) => (parts && y >= 0 && y < H && x >= 0 && x < W ? parts[y][x] : -1);
    const w = W + 2, h = H + 2;
    const data = new Uint8ClampedArray(w * h * 4);
    const put = (x, y, hex) => { const i = ((y + 1) * w + (x + 1)) * 4; const [r, g, b] = hexToRgb(hex); data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = -1; y <= H; y++) {
      for (let x = -1; x <= W; x++) {
        const ch = at(x, y);
        if (!solid(ch)) {
          if (N4.some(([dx, dy]) => { const n = at(x + dx, y + dy); return solid(n) && n !== 'K'; })) put(x, y, outline);
          continue;
        }
        if (ch === 'K') {
          const nb = N4.map(([dx, dy]) => at(x + dx, y + dy));
          const inside = nb.every(solid);
          const mat = nb.map(n => mats[n]).find(m => m && !m.glow);
          put(x, y, inside && mat && outline === OUTLINE ? ramp(mat.c)[0] : outline);
          continue;
        }
        const m = mats[ch];
        if (!m) continue;
        if (m.glow) { put(x, y, m.c); continue; }
        const gr = group(ch);
        const pt = partAt(x, y);
        // an edge = different material group, or (same group) a different shape part
        const differsAt = (nx, ny) => { const n = at(nx, ny); return !solid(n) || n === 'K' || group(n) !== gr || (parts && partAt(nx, ny) !== pt && !(mats[n] && mats[n].glow)); };
        let tone = 2 + (m.tone || 0);
        const up = differsAt(x, y - 1), left = differsAt(x - 1, y);
        if (up) tone += 1;
        if (left) tone += 0.6;
        if (up && left) tone += 0.6; // specular corner
        if (differsAt(x, y + 1)) tone -= 1;
        if (differsAt(x + 1, y)) tone -= 0.6;
        // contact shadow: a part drawn in front (higher index) right next to this pixel
        if (parts) for (const [dx, dy] of N4) { const q = partAt(x + dx, y + dy); if (q > pt && solid(at(x + dx, y + dy)) && !(mats[at(x + dx, y + dy)] || {}).glow) { tone -= 0.9; break; } }
        // ambient occlusion: two pixels below is another (front) part
        if (solid(at(x, y + 2)) && group(at(x, y + 2)) !== gr && !differsAt(x, y + 1)) tone -= 0.4;
        tone += (0.5 - y / H) * 0.5;
        put(x, y, ramp(m.c)[Math.max(0, Math.min(4, Math.round(tone)))]);
      }
    }
    // Internal edges between different non-glow materials → darker seam (selective outline)
    return { w, h, data };
  }

  /* ---------------- shape rasterizer ----------------
   * shapes (drawn in order, later wins):
   *   ['e', mat, cx, cy, rx, ry]          ellipse
   *   ['r', mat, x0, y0, x1, y1]          rect (inclusive)
   *   ['p', mat, [[x,y], ...]]            polygon
   *   ['l', mat, x0, y0, x1, y1, width]   thick line (capsule)
   *   ['k', ...same as l]                 an explicit outline seam (material 'K') */
  function rasterize(W, H, shapes) {
    const grid = Array.from({ length: H }, () => Array(W).fill('.'));
    const parts = Array.from({ length: H }, () => Array(W).fill(-1));
    const inPoly = (pts, x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const distSeg = (px, py, x0, y0, x1, y1) => {
      const dx = x1 - x0, dy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
    };
    for (let si = 0; si < shapes.length; si++) {
      const s = shapes[si];
      const [t, m] = s;
      const mat = t === 'k' ? 'K' : m;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const px = x + 0.5, py = y + 0.5;
        let hit = false;
        if (t === 'e') hit = ((px - s[2]) / s[4]) ** 2 + ((py - s[3]) / s[5]) ** 2 <= 1;
        else if (t === 'r') hit = x >= s[2] && x <= s[4] && y >= s[3] && y <= s[5];
        else if (t === 'p') hit = inPoly(s[2], px, py);
        else if (t === 'l' || t === 'k') hit = distSeg(px, py, s[2], s[3], s[4], s[5]) <= (s[6] || 1) / 2;
        if (hit) { grid[y][x] = mat; parts[y][x] = si; }
      }
    }
    const rows = grid.map(r => r.join(''));
    rows.parts = parts; // shape index per pixel → per-part bevel and contact shadows in shadeRows
    return rows;
  }

  /* ---------------- lit pixel shading ----------------
   * Hand-shaded look from shapes: each part is rasterized at k× resolution, given a height field
   * (domes for ellipses / limbs, bevelled plates for polygons / rects), lit from the top-left, and
   * reduced to the material's 5-tone ramp at 1×. Adds specular pixels on shiny materials (mat.spec),
   * dark seams where a part sits behind another, and the outer outline. Same output as shadeRows. */
  const LV = (() => { const v = [-0.55, -0.75, 0.62], n = Math.hypot(...v); return v.map(x => x / n); })();
  const HV = (() => { const v = [LV[0], LV[1], LV[2] + 1], n = Math.hypot(...v); return v.map(x => x / n); })();
  function scaleShape(s, k) {
    const [t, m] = s;
    if (t === 'e') return [t, m, s[2] * k, s[3] * k, s[4] * k, s[5] * k];
    if (t === 'r') return [t, m, s[2] * k, s[3] * k, (s[4] + 1) * k - 1, (s[5] + 1) * k - 1];
    if (t === 'p') return [t, m, s[2].map(([x, y]) => [x * k, y * k])];
    return [t, m, (s[2] + 0.5) * k, (s[3] + 0.5) * k, (s[4] + 0.5) * k, (s[5] + 0.5) * k, (s[6] || 1) * k];
  }
  function shadeLit(W, H, shapes, mats, outline = OUTLINE, k = 4) {
    const HW = W * k, HH = H * k;
    const hi = rasterize(HW, HH, shapes.map(s => scaleShape(s, k)));
    const P = hi.parts;
    const solidCh = ch => ch !== '.' && ch !== ' ';
    // distance to the edge of the own shape (chamfer)
    const D = new Float32Array(HW * HH);
    for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) D[y * HW + x] = solidCh(hi[y][x]) ? 1e6 : 0;
    const dv = (x, y, p) => (x < 0 || y < 0 || x >= HW || y >= HH || P[y][x] !== p ? 0 : D[y * HW + x]);
    for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
      const i = y * HW + x; if (!D[i]) continue; const p = P[y][x];
      D[i] = Math.min(D[i], dv(x - 1, y, p) + 1, dv(x, y - 1, p) + 1, dv(x - 1, y - 1, p) + 1.41, dv(x + 1, y - 1, p) + 1.41);
    }
    const maxD = new Float32Array(shapes.length);
    for (let y = HH - 1; y >= 0; y--) for (let x = HW - 1; x >= 0; x--) {
      const i = y * HW + x; if (!D[i]) continue; const p = P[y][x];
      D[i] = Math.min(D[i], dv(x + 1, y, p) + 1, dv(x, y + 1, p) + 1, dv(x + 1, y + 1, p) + 1.41, dv(x - 1, y + 1, p) + 1.41);
      if (D[i] > maxD[p]) maxD[p] = D[i];
    }
    const Hf = new Float32Array(HW * HH);
    for (let i = 0; i < HW * HH; i++) {
      if (!D[i]) continue;
      const p = P[Math.floor(i / HW)][i % HW], t = shapes[p][0];
      const round = t === 'e' || t === 'l';
      const R = Math.max(1, round ? maxD[p] : Math.min(maxD[p], 2.4 * k));
      const q = Math.min(D[i] / R, 1);
      Hf[i] = R * Math.sqrt(1 - (1 - q) * (1 - q)) * (round ? 1 : 0.85);
    }
    const hAt = (x, y, p, own) => (x < 0 || y < 0 || x >= HW || y >= HH || P[y][x] !== p ? own : Hf[y * HW + x]);
    // light every hi-res pixel, then reduce k×k blocks (majority material / part, mean light)
    const lo = Array.from({ length: H }, () => Array(W).fill(null));
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
      const cnt = new Map();
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
        const x = X * k + xx, y = Y * k + yy, ch = hi[y][x];
        if (!solidCh(ch)) continue;
        const p = P[y][x], own = Hf[y * HW + x];
        let nx = -(hAt(x + 1, y, p, own) - hAt(x - 1, y, p, own)) / 2, ny = -(hAt(x, y + 1, p, own) - hAt(x, y - 1, p, own)) / 2, nz = 1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const dif = Math.max(0, nx * LV[0] + ny * LV[1] + nz * LV[2]);
        const sp = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 24);
        const key = ch + '|' + p;
        const c = cnt.get(key) || { ch, p, n: 0, dif: 0, sp: 0 };
        c.n++; c.dif += dif; c.sp = Math.max(c.sp, sp);
        cnt.set(key, c);
      }
      let best = null, tot = 0;
      for (const c of cnt.values()) { tot += c.n; if (!best || c.n > best.n || (c.n === best.n && c.p > best.p)) best = c; }
      if (best && tot >= k * k * 0.45) lo[Y][X] = { ch: best.ch, p: best.p, dif: best.dif / best.n, sp: best.sp };
    }
    const w = W + 2, h = H + 2, data = new Uint8ClampedArray(w * h * 4);
    const put = (x, y, hex) => { const i = ((y + 1) * w + (x + 1)) * 4; const n = parseInt(hex.slice(1), 16); data[i] = n >> 16; data[i + 1] = (n >> 8) & 255; data[i + 2] = n & 255; data[i + 3] = 255; };
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : lo[y][x]);
    const group = ch => (mats[ch] && mats[ch].g) || ch;
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
      const c = at(x, y);
      if (!c) { if (N4.some(([dx, dy]) => { const n = at(x + dx, y + dy); return n && n.ch !== 'K'; })) put(x, y, outline); continue; }
      if (c.ch === 'K') {
        const nb = N4.map(([dx, dy]) => at(x + dx, y + dy));
        const mat = nb.map(n => n && mats[n.ch]).find(m => m && !m.glow);
        put(x, y, nb.every(Boolean) && mat && outline === OUTLINE ? ramp(mat.c)[0] : outline);
        continue;
      }
      const m = mats[c.ch];
      if (!m) continue;
      if (m.glow) { put(x, y, m.c); continue; }
      const rp = ramp(m.c);
      let tone = 0.35 + c.dif * 4.1 + (0.5 - y / H) * 0.5;
      // a part in front (later shape) right next to this pixel: seam / contact shadow
      for (const [dx, dy] of N4) {
        const n = at(x + dx, y + dy);
        if (!n || n.p <= c.p || (mats[n.ch] || {}).glow) continue;
        tone = group(n.ch) !== group(c.ch) ? Math.min(tone, 0.6) : tone - 1.1;
        break;
      }
      const ti = Math.max(0, Math.min(4, Math.round(tone)));
      if ((m.spec || 0) > 0 && c.sp * m.spec > 0.5 && ti >= 3) put(x, y, shadeHex(rp[4], 34));
      else put(x, y, rp[ti]);
    }
    return { w, h, data };
  }

  /* ---------------- guardians (64x64, facing right; ground at y≈62) ----------------
   * Built from PARTS so they can be animated (rotated around a joint) and re-skinned per
   * armor slot later (set bonuses). Each part:
   *   id, slot (head / chest / arms / legs / cls), pivot [x, y] (joint, sprite coords),
   *   body: true → moves with the torso (lean / breathing), follow: id → uses that part's pose,
   *   shapes (see rasterize). Parts are listed back to front.
   * Materials: W main armor, R red/accent, N dark armor/hood/coat, U undersuit, G gold/light trim,
   * B secondary accent (blue/grey), C cloth (cape/mark), c cloth shade, S steel, V visor/eyes (glow), E emblem (glow) */
  const GUARDIANS = {
    titan: {
      pal: { W: '#e8eaf0', R: '#c8323c', N: '#3a4254', U: '#262b38', G: '#d8a830', B: '#9aa4b8', C: '#b02c34', S: '#cfd6e2' },
      hand: [58, 38.5], hip: [32, 44],
      parts: [
        { id: 'farArm', slot: 'arms', pivot: [18, 31], body: true, shapes: [
          ['r', 'U', 13, 34, 19, 44], ['e', 'W', 16, 45, 4, 3.5], ['e', 'W', 18, 31, 8, 6.5], ['e', 'R', 18, 29, 5, 2]] },
        { id: 'farLeg', slot: 'legs', pivot: [24, 44], shapes: [
          ['p', 'W', [[21, 44], [29, 44], [28, 53], [20, 53]]], ['p', 'W', [[19, 53], [28, 53], [28, 59], [18, 59]]],
          ['e', 'R', 23, 52, 2.5, 2], ['l', 'R', 21, 56, 26, 56, 1], ['r', 'N', 16, 58, 28, 62]] },
        { id: 'nearLeg', slot: 'legs', pivot: [39, 44], shapes: [
          ['p', 'W', [[35, 44], [43, 44], [45, 53], [36, 53]]], ['p', 'W', [[36, 53], [46, 53], [47, 59], [36, 59]]],
          ['e', 'R', 41, 52, 2.5, 2], ['l', 'R', 39, 56, 44, 56, 1], ['r', 'N', 35, 58, 48, 62]] },
        { id: 'torso', slot: 'chest', pivot: [32, 44], body: true, shapes: [
          ['r', 'U', 28, 44, 36, 49],
          ['p', 'W', [[21, 26], [43, 26], [45, 36], [41, 44], [23, 44], [19, 36]]],
          ['r', 'U', 24, 38, 40, 43], ['r', 'N', 22, 42, 42, 44], ['r', 'G', 31, 42, 33, 44],
          ['p', 'R', [[26, 29], [38, 29], [32, 36]]], ['r', 'E', 31, 30, 33, 31]] },
        { id: 'mark', slot: 'cls', pivot: [32, 44], body: true, shapes: [
          ['p', 'C', [[29, 44], [35, 44], [36, 53], [28, 53]]], ['l', 'c', 31, 46, 31, 52, 1], ['l', 'c', 34, 46, 34, 52, 1]] },
        { id: 'head', slot: 'head', pivot: [32, 25], body: true, shapes: [
          ['r', 'U', 27, 22, 37, 27],
          ['e', 'N', 32, 14, 13.5, 12], ['r', 'B', 28, 3, 32, 12],
          ['p', 'W', [[30, 12], [46, 12], [45, 24], [33, 25]]],
          ['r', 'V', 34, 16, 45, 18], ['k', 'K', 33, 15, 46, 15, 1], ['k', 'K', 33, 19, 46, 19, 1],
          ['r', 'N', 35, 21, 44, 24]] },
        { id: 'nearArm', slot: 'arms', pivot: [44, 31], body: true, shapes: [
          ['e', 'W', 45, 29, 9.5, 7.5], ['e', 'R', 45, 27, 6.5, 2.2], ['l', 'B', 38, 33, 52, 33, 1],
          ['r', 'U', 43, 34, 50, 39], ['p', 'W', [[48, 33], [56, 34], [57, 41], [48, 41]]], ['l', 'R', 51, 34, 51, 41, 1], ['e', 'U', 58.5, 38.5, 3, 3]] },
      ],
    },
    hunter: {
      pal: { W: '#b4bccb', R: '#c8323c', N: '#222a3e', U: '#181c28', G: '#c9ced8', B: '#3aa6ee', C: '#2a3450', L: '#6a5038' },
      hand: [57, 38], hip: [32, 45],
      parts: [
        { id: 'cloak', slot: 'cls', pivot: [24, 28], body: true, shapes: [
          ['p', 'C', [[17, 26], [31, 26], [29, 56], [8, 61], [12, 44]]],
          ['p', 'B', [[12, 44], [17, 28], [20, 29], [15, 54], [9, 60]]],
          ['l', 'c', 20, 34, 15, 58, 1], ['l', 'c', 25, 32, 22, 56, 1]] },
        { id: 'farArm', slot: 'arms', pivot: [21, 32], body: true, shapes: [
          ['r', 'U', 19, 32, 24, 44], ['e', 'W', 21.5, 45, 3, 2.5]] },
        { id: 'farLeg', slot: 'legs', pivot: [27, 46], shapes: [
          ['r', 'W', 24, 46, 31, 54], ['r', 'W', 23, 54, 31, 60], ['e', 'U', 27, 53, 2.5, 1.8], ['r', 'N', 22, 59, 32, 62]] },
        { id: 'nearLeg', slot: 'legs', pivot: [36, 46], shapes: [
          ['r', 'W', 33, 46, 40, 54], ['r', 'W', 33, 54, 41, 60], ['e', 'U', 37, 53, 2.5, 1.8], ['r', 'N', 32, 59, 43, 62]] },
        { id: 'torso', slot: 'chest', pivot: [32, 45], body: true, shapes: [
          ['p', 'N', [[22, 29], [42, 29], [43, 46], [23, 46]]],
          ['p', 'U', [[25, 30], [41, 30], [40, 39], [26, 39]]],
          ['p', 'B', [[26, 32], [33, 36], [40, 32], [40, 34], [33, 38], [26, 34]]],
          ['r', 'L', 23, 43, 42, 45], ['r', 'G', 31, 43, 34, 45], ['r', 'L', 38, 45, 41, 49],
          ['e', 'C', 32, 28, 11, 4.5], ['l', 'B', 23, 29, 41, 29, 1]] },
        { id: 'head', slot: 'head', pivot: [32, 27], body: true, shapes: [
          ['e', 'N', 32, 17, 13, 12.5], ['p', 'N', [[25, 9], [33, 2], [41, 9]]],
          ['l', 'c', 22, 12, 24, 25, 1],
          ['e', 'U', 36.5, 19, 7.5, 6.5],
          ['r', 'V', 34, 18, 35, 19], ['r', 'V', 39, 18, 40, 19]] },
        { id: 'nearArm', slot: 'arms', pivot: [42, 32], body: true, shapes: [
          ['e', 'W', 42, 32, 5.5, 4.5], ['r', 'U', 43, 34, 49, 39], ['p', 'W', [[48, 34], [55, 35], [56, 41], [48, 41]]], ['e', 'U', 57.5, 38, 3, 3]] },
      ],
    },
    warlock: {
      pal: { W: '#f2b62c', R: '#c8323c', N: '#1c1c28', U: '#2a2a38', G: '#ffe38f', B: '#2f7ae2', C: '#20202e', L: '#7a5a30' },
      hand: [57, 37], hip: [32, 44],
      parts: [
        { id: 'coatTails', slot: 'chest', pivot: [32, 40], body: true, shapes: [
          ['p', 'N', [[19, 40], [29, 40], [27, 62], [12, 62]]], ['p', 'N', [[35, 40], [45, 40], [52, 62], [37, 62]]],
          ['l', 'B', 18, 44, 13, 61, 1], ['l', 'B', 46, 44, 51, 61, 1]] },
        { id: 'boots', slot: 'legs', pivot: [32, 58], shapes: [
          ['r', 'U', 26, 58, 31, 62], ['r', 'U', 33, 58, 38, 62]] },
        { id: 'farArm', slot: 'arms', pivot: [18, 33], body: true, shapes: [
          ['r', 'N', 15, 33, 21, 44], ['e', 'U', 18, 46, 3, 2.5]] },
        { id: 'bond', slot: 'cls', pivot: [18, 33], body: true, follow: 'farArm', shapes: [
          ['r', 'E', 15, 42, 21, 43]] },
        { id: 'torso', slot: 'chest', pivot: [32, 44], body: true, shapes: [
          ['p', 'N', [[22, 28], [42, 28], [44, 45], [20, 45]]],
          ['p', 'N', [[21, 44], [43, 44], [47, 59], [17, 59]]],
          ['l', 'B', 29, 30, 27, 58, 1], ['l', 'B', 35, 30, 37, 58, 1],
          ['l', 'G', 23, 31, 33, 41, 1.4], ['l', 'G', 41, 31, 31, 41, 1.4], ['e', 'E', 32, 35, 2, 2],
          ['r', 'G', 22, 44, 42, 45]] },
        { id: 'head', slot: 'head', pivot: [32, 27], body: true, shapes: [
          ['p', 'W', [[22, 27], [25, 14], [31, 2], [38, 10], [43, 22], [42, 28], [23, 28]]],
          ['l', 'G', 30, 4, 26, 21, 1.2], ['l', 'G', 33, 6, 39, 19, 1],
          ['e', 'N', 35, 19, 6.5, 5.5], ['r', 'V', 32, 18, 40, 19]] },
        { id: 'farShoulder', slot: 'arms', pivot: [18, 33], body: true, follow: 'farArm', shapes: [
          ['e', 'W', 20, 31, 6.5, 4.5]] },
        { id: 'nearArm', slot: 'arms', pivot: [44, 32], body: true, shapes: [
          ['e', 'W', 44, 31, 7.5, 5], ['l', 'G', 39, 29, 49, 29, 1],
          ['r', 'N', 43, 34, 50, 39], ['r', 'W', 49, 33, 51, 40], ['p', 'U', [[51, 34], [56, 35], [56, 40], [51, 40]]], ['e', 'U', 57.5, 37, 2.8, 2.8]] },
      ],
    },
  };
  const CLASS_KEYS = ['titan', 'hunter', 'warlock'];
  const ARMOR_PART_SLOTS = ['head', 'chest', 'arms', 'legs', 'cls'];
  function guardianMats(key, elementColor, override) {
    const p = { ...GUARDIANS[key].pal, ...(override || {}) };
    const m = { V: { c: shadeHex(elementColor, 50), glow: true }, E: { c: elementColor, glow: true }, c: { c: shadeHex(p.C, -30), g: 'C' } };
    for (const k of ['W', 'R', 'N', 'U', 'G', 'B', 'C', 'L', 'S']) if (p[k]) m[k] = { c: p[k] };
    // shiny armor plates / trim get specular pixels; cloth and undersuit stay matte
    for (const k of ['W', 'G', 'S', 'B', 'R']) if (m[k]) m[k].spec = k === 'G' || k === 'S' ? 1 : 0.8;
    return m;
  }
  const partCache = new Map();
  function partRows(key, id) {
    const ck = key + ':' + id;
    if (!partCache.has(ck)) partCache.set(ck, rasterize(64, 64, GUARDIANS[key].parts.find(p => p.id === id).shapes));
    return partCache.get(ck);
  }
  /* One part, shaded with its own outline. slotPal: { head: {W:..}, arms: {...}, ... } re-skins a slot
   * (future armor-set looks) without touching the others. */
  function shadePart(key, id, elementColor, slotPal) {
    const part = GUARDIANS[key].parts.find(p => p.id === id);
    return shadeLit(64, 64, part.shapes, guardianMats(key, elementColor, slotPal && slotPal[part.slot]));
  }
  // Whole guardian at rest: parts overlaid back to front
  function composeGuardian(key, elementColor, slotPal) {
    let out = null;
    for (const part of GUARDIANS[key].parts) {
      const img = shadePart(key, part.id, elementColor, slotPal);
      if (!out) out = { w: img.w, h: img.h, data: new Uint8ClampedArray(img.data.length) };
      for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) out.data.set(img.data.subarray(i, i + 4), i);
    }
    return out;
  }
  // Legacy: all shapes in one raster (single-part shading)
  function guardianRows(key) {
    const ck = key + ':*';
    if (!partCache.has(ck)) partCache.set(ck, rasterize(64, 64, GUARDIANS[key].parts.flatMap(p => p.shapes)));
    return partCache.get(ck);
  }

  /* ---------------- enemies (48x48, facing left toward the player; ground at y≈46) ----------------
   * Shape-built like the guardians (see rasterize), drawn back to front. Materials follow the faction
   * palettes in sprites.js: B body, b far/shadowed limbs (B group), H light plates, D dark/inner,
   * S secondary plates, C cloth, c cloth shade, G gun metal, E eye glow, W element glow. */
  const ENEMY_SHAPES = {
    // Hive — lanky, hunched, clawed; glowing head slits
    thrall: [
      ['l', 'b', 26, 31, 30, 39, 3], ['l', 'b', 30, 39, 27, 46, 3],
      ['l', 'b', 22, 18, 14, 27, 3], ['l', 'b', 14, 27, 9, 35, 2], ['l', 'D', 9, 35, 6, 39, 1], ['l', 'D', 9, 35, 9, 40, 1],
      ['p', 'B', [[16, 15], [30, 13], [35, 21], [31, 30], [21, 31], [15, 24]]],
      ['l', 'D', 21, 20, 29, 19, 1], ['l', 'D', 21, 23, 30, 22, 1], ['l', 'D', 22, 26, 30, 25, 1],
      ['e', 'B', 27, 31, 5, 3],
      ['l', 'B', 24, 32, 20, 39, 4], ['l', 'B', 20, 39, 23, 45, 3], ['p', 'D', [[18, 44], [26, 44], [26, 46], [17, 46]]],
      ['e', 'H', 13, 15, 6.5, 5], ['p', 'D', [[7, 15], [13, 17], [12, 20], [8, 19]]],
      ['l', 'E', 9, 13, 13, 12, 1], ['l', 'E', 9, 16, 12, 16, 1],
      ['l', 'B', 19, 18, 12, 26, 3], ['l', 'B', 12, 26, 6, 32, 3],
      ['l', 'D', 6, 32, 2, 35, 1], ['l', 'D', 6, 32, 4, 38, 1], ['l', 'D', 6, 32, 7, 38, 1],
    ],
    // Hive — bone armor, crested carapace, three green eyes, shredder
    acolyte: [
      ['l', 'b', 26, 31, 28, 39, 4], ['l', 'b', 28, 39, 27, 46, 4],
      ['l', 'b', 29, 16, 33, 26, 4], ['l', 'b', 33, 26, 30, 31, 3],
      ['l', 'B', 21, 31, 19, 39, 5], ['l', 'B', 19, 39, 20, 45, 4], ['p', 'D', [[15, 44], [24, 44], [24, 46], [14, 46]]],
      ['p', 'B', [[15, 13], [32, 13], [31, 25], [27, 32], [19, 32], [16, 24]]],
      ['l', 'H', 18, 17, 29, 17, 1], ['l', 'H', 18, 20, 29, 20, 1], ['l', 'H', 19, 23, 28, 23, 1],
      ['r', 'D', 18, 27, 29, 30],
      ['p', 'C', [[19, 30], [28, 30], [27, 41], [23, 38], [20, 41]]],
      ['p', 'H', [[11, 9], [17, 1], [25, 4], [26, 10], [21, 14], [13, 13]]], ['p', 'D', [[10, 9], [17, 8], [18, 14], [11, 13]]],
      ['r', 'E', 12, 9, 13, 9], ['r', 'E', 15, 10, 16, 10], ['r', 'E', 12, 12, 13, 12],
      ['l', 'B', 20, 16, 14, 24, 4],
      ['p', 'G', [[3, 21], [16, 20], [17, 26], [4, 27]]], ['l', 'G', 11, 26, 13, 30, 2], ['r', 'W', 5, 22, 8, 23], ['r', 'W', 4, 25, 6, 25],
    ],
    // Hive — hulking, spiked pauldrons, horned crest, glowing core, boomer
    knight: [
      ['l', 'b', 28, 30, 31, 38, 6], ['l', 'b', 31, 38, 30, 46, 6],
      ['e', 'b', 35, 13, 7, 5.5], ['p', 'b', [[32, 10], [38, 1], [41, 11]]], ['l', 'b', 36, 17, 37, 28, 5],
      ['p', 'C', [[17, 30], [32, 30], [30, 45], [25, 41], [19, 45]]], ['l', 'c', 24, 32, 24, 42, 1],
      ['l', 'B', 19, 30, 16, 38, 7], ['l', 'B', 16, 38, 17, 45, 6], ['p', 'D', [[10, 44], [23, 44], [23, 46], [9, 46]]],
      ['p', 'B', [[12, 12], [36, 12], [38, 22], [32, 32], [16, 32], [11, 22]]],
      ['p', 'S', [[16, 15], [32, 15], [30, 25], [18, 25]]], ['e', 'E', 24, 19, 2.5, 2.5], ['l', 'D', 24, 22, 24, 31, 1],
      ['e', 'H', 12, 14, 8, 6], ['p', 'H', [[6, 12], [5, 3], [12, 9]]], ['p', 'H', [[11, 9], [13, 1], [17, 9]]],
      ['e', 'D', 19, 9, 5.5, 5], ['p', 'H', [[14, 8], [19, -1], [27, 2], [25, 8]]], ['l', 'H', 21, 3, 30, 0, 2],
      ['r', 'E', 14, 9, 17, 10],
      ['l', 'B', 12, 18, 9, 28, 6],
      ['p', 'G', [[0, 26], [16, 25], [17, 32], [1, 33]]], ['r', 'W', 2, 28, 6, 30], ['e', 'B', 11, 30, 3, 3],
    ],
    // Hive — floating, spiked crown, tattered robes, casting orb
    wizard: [
      ['p', 'c', [[13, 26], [35, 26], [37, 44], [32, 40], [28, 47], [24, 41], [20, 47], [16, 40], [11, 44]]],
      ['l', 'b', 31, 15, 39, 22, 3], ['l', 'b', 39, 22, 42, 15, 2], ['l', 'D', 42, 15, 44, 12, 1],
      ['p', 'B', [[16, 13], [32, 13], [33, 27], [15, 27]]],
      ['l', 'H', 19, 17, 29, 17, 1], ['l', 'H', 19, 20, 29, 20, 1], ['l', 'H', 20, 23, 28, 23, 1],
      ['p', 'C', [[17, 26], [31, 26], [30, 40], [27, 36], [24, 44], [21, 36], [18, 40]]],
      ['e', 'B', 22, 9, 5.5, 5.5],
      ['p', 'H', [[16, 8], [14, -1], [19, 5], [22, -2], [25, 5], [30, -1], [28, 8]]],
      ['e', 'D', 21, 11, 3.5, 3], ['r', 'E', 19, 10, 19, 10], ['r', 'E', 22, 10, 22, 10],
      ['l', 'B', 17, 15, 9, 21, 3], ['l', 'B', 9, 21, 5, 15, 2],
      ['e', 'W', 5, 11, 3.5, 3.5],
    ],
    // Fallen — slim, cloaked, four-eyed mask, shock pistol
    dreg: [
      ['p', 'C', [[22, 12], [33, 13], [36, 37], [31, 34], [26, 39], [22, 31]]],
      ['l', 'b', 27, 29, 31, 37, 3], ['l', 'b', 31, 37, 29, 46, 3],
      ['l', 'b', 27, 15, 31, 23, 3], ['l', 'b', 31, 23, 27, 29, 2],
      ['l', 'B', 22, 29, 19, 37, 4], ['l', 'B', 19, 37, 22, 45, 3], ['p', 'D', [[16, 44], [25, 44], [25, 46], [15, 46]]],
      ['p', 'B', [[17, 13], [29, 13], [28, 23], [25, 30], [19, 30], [17, 22]]],
      ['r', 'H', 19, 15, 25, 18], ['r', 'D', 19, 26, 26, 28],
      ['l', 'b', 20, 22, 16, 26, 2],
      ['l', 'S', 18, 6, 22, 1, 2],
      ['p', 'S', [[12, 5], [20, 4], [22, 10], [19, 14], [13, 13], [10, 9]]],
      ['e', 'D', 13, 10, 3, 2.5], ['r', 'E', 11, 8, 11, 8], ['r', 'E', 14, 8, 14, 8], ['r', 'E', 12, 10, 12, 10], ['r', 'E', 15, 10, 15, 10],
      ['l', 'B', 18, 15, 12, 21, 3], ['l', 'B', 12, 21, 8, 19, 3],
      ['p', 'G', [[2, 16], [9, 16], [9, 20], [4, 20]]], ['r', 'W', 2, 17, 3, 18],
    ],
    // Fallen — tall, house cloak, horned helm, four arms, wire rifle
    vandal: [
      ['p', 'C', [[21, 9], [34, 10], [37, 41], [31, 37], [27, 43], [22, 35]]], ['l', 'c', 30, 14, 33, 38, 1],
      ['l', 'b', 27, 28, 31, 36, 4], ['l', 'b', 31, 36, 28, 46, 3],
      ['l', 'b', 27, 13, 32, 20, 3], ['l', 'b', 32, 20, 28, 24, 2],
      ['l', 'B', 21, 28, 18, 36, 4], ['l', 'B', 18, 36, 21, 45, 4], ['p', 'D', [[15, 44], [25, 44], [25, 46], [14, 46]]],
      ['p', 'B', [[16, 11], [29, 11], [29, 22], [26, 29], [18, 29], [16, 20]]],
      ['p', 'H', [[18, 13], [27, 13], [26, 19], [19, 19]]], ['r', 'D', 18, 25, 27, 27],
      ['l', 'b', 19, 21, 14, 24, 2], ['l', 'B', 22, 22, 17, 27, 2],
      ['l', 'S', 17, 4, 23, -1, 2], ['l', 'S', 19, 6, 25, 3, 2],
      ['p', 'S', [[11, 3], [19, 2], [21, 8], [18, 12], [12, 11], [9, 7]]],
      ['e', 'D', 12, 8, 3, 2.5], ['r', 'E', 10, 6, 10, 6], ['r', 'E', 13, 6, 13, 6], ['r', 'E', 11, 8, 11, 8], ['r', 'E', 14, 8, 14, 8],
      ['l', 'B', 17, 13, 11, 18, 3],
      ['p', 'G', [[0, 15], [18, 14], [18, 17], [1, 18]]], ['r', 'G', 8, 12, 12, 14], ['r', 'W', 1, 16, 2, 16], ['r', 'W', 9, 12, 10, 12],
    ],
    // Fallen — bulky, caped, crested helm, shock rifle
    captain: [
      ['p', 'C', [[18, 8], [38, 9], [42, 44], [34, 40], [29, 46], [21, 38]]], ['l', 'c', 34, 12, 38, 40, 1],
      ['l', 'b', 29, 28, 33, 36, 6], ['l', 'b', 33, 36, 30, 46, 5],
      ['e', 'b', 33, 11, 6, 4.5], ['l', 'b', 34, 14, 36, 24, 4],
      ['l', 'B', 21, 28, 17, 36, 6], ['l', 'B', 17, 36, 20, 45, 5], ['p', 'D', [[13, 44], [25, 44], [25, 46], [12, 46]]],
      ['p', 'B', [[13, 10], [33, 10], [34, 22], [29, 30], [17, 30], [13, 20]]],
      ['p', 'H', [[16, 12], [30, 12], [29, 20], [17, 20]]], ['r', 'D', 16, 26, 30, 29], ['r', 'S', 22, 26, 24, 29],
      ['l', 'b', 18, 21, 13, 26, 3],
      ['l', 'S', 15, 2, 27, -2, 3], ['l', 'S', 18, 4, 28, 3, 2],
      ['p', 'S', [[10, 1], [22, 0], [24, 7], [20, 13], [12, 12], [8, 6]]],
      ['e', 'D', 13, 8, 4, 3], ['r', 'E', 10, 6, 11, 6], ['r', 'E', 14, 6, 15, 6], ['r', 'E', 11, 9, 11, 9], ['r', 'E', 15, 9, 15, 9],
      ['l', 'B', 12, 15, 7, 23, 4],
      ['p', 'G', [[0, 20], [16, 19], [16, 24], [1, 25]]], ['r', 'W', 1, 21, 3, 22], ['l', 'G', 9, 24, 10, 28, 2],
    ],
    // Fallen — floating sphere, spiked crown, great eye
    servitor: [
      ['l', 'b', 24, 1, 24, 9, 3], ['l', 'b', 11, 9, 15, 14, 3], ['l', 'b', 37, 9, 33, 14, 3],
      ['l', 'b', 6, 24, 11, 24, 3], ['l', 'b', 42, 24, 37, 24, 3],
      ['l', 'b', 20, 37, 18, 46, 2], ['l', 'b', 28, 37, 30, 46, 2], ['l', 'b', 24, 38, 24, 47, 2],
      ['e', 'B', 24, 24, 15, 15],
      ['e', 'H', 24, 24, 12, 12], ['e', 'D', 24, 24, 10, 10],
      ['e', 'E', 23, 24, 7, 7], ['e', 'W', 22, 23, 3, 3],
    ],
    // Vex — bronze frame, red head eye, glowing chest core
    goblin: [
      ['l', 'b', 27, 27, 30, 36, 3], ['l', 'b', 30, 36, 27, 46, 3],
      ['l', 'b', 27, 13, 30, 22, 3], ['l', 'b', 30, 22, 28, 29, 2],
      ['l', 'B', 21, 27, 18, 36, 4], ['l', 'B', 18, 36, 21, 45, 3], ['p', 'D', [[15, 44], [24, 44], [23, 46], [14, 46]]],
      ['e', 'D', 24, 27, 5, 3],
      ['p', 'B', [[16, 12], [31, 12], [29, 21], [25, 26], [21, 26], [18, 21]]],
      ['e', 'W', 23, 17, 3, 3], ['l', 'D', 24, 21, 24, 26, 2],
      ['p', 'B', [[17, 1], [27, 1], [28, 8], [26, 11], [18, 11], [16, 8]]], ['l', 'H', 18, 1, 26, 1, 1],
      ['e', 'D', 19, 6, 3, 3], ['e', 'E', 19, 6, 1.6, 1.6],
      ['l', 'B', 17, 13, 12, 20, 3], ['l', 'B', 12, 20, 8, 18, 3],
      ['p', 'G', [[1, 15], [10, 15], [10, 19], [2, 19]]], ['r', 'W', 1, 16, 2, 17],
    ],
    // Vex — floating shell with fins and a red eye
    harpy: [
      ['p', 'b', [[7, 9], [18, 17], [10, 27]]], ['p', 'b', [[41, 9], [30, 17], [38, 27]]], ['p', 'b', [[18, 29], [30, 29], [24, 43]]],
      ['l', 'D', 14, 28, 12, 37, 1], ['l', 'D', 34, 28, 36, 37, 1],
      ['e', 'B', 24, 20, 11, 10],
      ['p', 'H', [[15, 12], [33, 12], [29, 16], [19, 16]]],
      ['e', 'D', 22, 21, 4.5, 4.5], ['e', 'E', 22, 21, 2.2, 2.2],
    ],
    // Vex — massive frame, flat crested head, white core, torch-hammer cannon
    minotaur: [
      ['l', 'b', 29, 28, 33, 37, 6], ['l', 'b', 33, 37, 30, 46, 5],
      ['e', 'b', 35, 14, 6, 5], ['l', 'b', 36, 16, 38, 27, 5],
      ['l', 'B', 20, 28, 16, 37, 7], ['l', 'B', 16, 37, 19, 45, 6], ['p', 'D', [[11, 44], [25, 44], [25, 46], [10, 46]]],
      ['e', 'D', 23, 29, 6, 3],
      ['p', 'B', [[10, 9], [36, 9], [35, 20], [29, 29], [18, 29], [11, 20]]],
      ['e', 'W', 21, 16, 4, 4], ['l', 'D', 17, 22, 29, 22, 1], ['l', 'D', 18, 25, 28, 25, 1],
      ['p', 'B', [[14, 0], [30, 0], [30, 6], [26, 9], [18, 9], [13, 5]]], ['l', 'H', 12, 1, 31, 1, 2],
      ['e', 'D', 18, 5, 2.5, 2.5], ['e', 'E', 18, 5, 1.4, 1.4],
      ['e', 'H', 11, 12, 7, 6],
      ['l', 'B', 11, 16, 7, 26, 6],
      ['p', 'G', [[0, 24], [14, 23], [14, 30], [0, 31]]], ['r', 'W', 1, 26, 4, 28],
    ],
    // Vex — floating core with orbiting shields
    hydra: [
      ['p', 'S', [[30, 4], [44, 10], [42, 31], [34, 27]]],
      ['l', 'b', 20, 33, 18, 46, 2], ['l', 'b', 28, 33, 30, 46, 2], ['l', 'b', 24, 34, 24, 47, 2],
      ['e', 'B', 24, 22, 13, 12],
      ['p', 'H', [[18, 10], [30, 10], [24, 3]]], ['l', 'D', 11, 23, 37, 23, 2],
      ['e', 'D', 18, 19, 5, 5], ['e', 'E', 18, 19, 2.8, 2.8],
      ['p', 'H', [[1, 8], [11, 6], [13, 33], [3, 35]]], ['l', 'D', 6, 10, 8, 31, 1], ['e', 'W', 7, 20, 1.6, 2.5],
    ],
    // Cabal — bulky armor, jetpack, tubed helmet, slug rifle
    legionary: [
      ['p', 'D', [[28, 8], [40, 10], [40, 26], [30, 26]]], ['r', 'G', 34, 5, 37, 9],
      ['l', 'b', 28, 28, 31, 37, 6], ['l', 'b', 31, 37, 30, 46, 6],
      ['e', 'b', 34, 13, 6, 5], ['l', 'b', 34, 16, 34, 26, 5],
      ['l', 'B', 19, 28, 17, 37, 7], ['l', 'B', 17, 37, 18, 45, 7], ['p', 'D', [[11, 44], [25, 44], [25, 46], [10, 46]]],
      ['p', 'B', [[10, 9], [34, 9], [35, 20], [30, 29], [16, 29], [11, 19]]],
      ['p', 'S', [[14, 12], [30, 12], [28, 20], [16, 20]]], ['r', 'D', 15, 25, 31, 28],
      ['e', 'H', 12, 13, 7, 5],
      ['e', 'B', 18, 8, 7, 6], ['p', 'D', [[10, 6], [17, 6], [17, 12], [11, 12]]], ['r', 'E', 10, 7, 15, 9],
      ['l', 'G', 18, 12, 22, 16, 2], ['l', 'G', 14, 13, 16, 17, 2],
      ['l', 'B', 12, 16, 8, 24, 5],
      ['p', 'G', [[0, 21], [16, 20], [16, 25], [1, 26]]], ['r', 'W', 1, 22, 3, 23],
    ],
    // Cabal — tower shield bearer
    phalanx: [
      ['p', 'D', [[28, 8], [40, 10], [40, 26], [30, 26]]], ['r', 'G', 34, 5, 37, 9],
      ['l', 'b', 28, 28, 31, 37, 6], ['l', 'b', 31, 37, 30, 46, 6],
      ['e', 'b', 34, 13, 6, 5], ['l', 'b', 34, 16, 34, 26, 5],
      ['l', 'B', 20, 28, 18, 37, 7], ['l', 'B', 18, 37, 19, 45, 7], ['p', 'D', [[12, 44], [26, 44], [26, 46], [11, 46]]],
      ['p', 'B', [[11, 9], [34, 9], [35, 20], [30, 29], [16, 29], [12, 19]]],
      ['p', 'S', [[15, 12], [30, 12], [28, 20], [17, 20]]], ['r', 'D', 16, 25, 31, 28],
      ['e', 'H', 13, 13, 7, 5],
      ['e', 'B', 20, 8, 7, 6], ['p', 'D', [[12, 6], [19, 6], [19, 12], [13, 12]]], ['r', 'E', 12, 7, 17, 9],
      ['l', 'B', 13, 16, 9, 24, 5],
      ['p', 'S', [[0, 7], [13, 9], [14, 41], [0, 43]]], ['l', 'H', 1, 9, 1, 41, 1], ['l', 's', 12, 11, 12, 39, 1],
      ['p', 'E', [[6, 20], [9, 24], [6, 29], [3, 24]]],
    ],
    // Cabal — small, thin; dome helm with visor; sidearm
    psion: [
      ['l', 'b', 26, 30, 28, 38, 3], ['l', 'b', 28, 38, 27, 46, 3],
      ['l', 'b', 26, 18, 29, 26, 2],
      ['l', 'B', 21, 30, 19, 38, 3], ['l', 'B', 19, 38, 21, 45, 3], ['p', 'D', [[16, 44], [24, 44], [24, 46], [15, 46]]],
      ['p', 'B', [[18, 16], [29, 16], [28, 26], [25, 31], [20, 31], [18, 25]]],
      ['r', 'S', 20, 18, 26, 21], ['r', 'D', 19, 27, 27, 29],
      ['e', 'S', 22, 10, 6, 6], ['l', 'H', 20, 5, 26, 5, 1],
      ['r', 'D', 15, 8, 21, 12], ['r', 'E', 16, 9, 20, 10],
      ['l', 'B', 19, 18, 13, 23, 3],
      ['p', 'G', [[6, 20], [14, 20], [14, 23], [7, 23]]], ['r', 'W', 6, 21, 7, 21],
    ],
    // Cabal — heavy officer: twin-nozzle jetpack, crested helm, big shoulders
    centurion: [
      ['p', 'D', [[28, 6], [42, 8], [42, 26], [30, 26]]], ['r', 'G', 33, 2, 36, 8], ['r', 'G', 38, 3, 41, 9],
      ['l', 'b', 29, 28, 33, 37, 7], ['l', 'b', 33, 37, 31, 46, 6],
      ['e', 'b', 36, 12, 7, 6], ['l', 'b', 36, 15, 36, 27, 5],
      ['l', 'B', 19, 28, 16, 37, 8], ['l', 'B', 16, 37, 18, 45, 7], ['p', 'D', [[9, 44], [26, 44], [26, 46], [8, 46]]],
      ['p', 'B', [[8, 8], [36, 8], [37, 20], [31, 30], [15, 30], [9, 19]]],
      ['p', 'S', [[12, 11], [32, 11], [30, 20], [14, 20]]], ['r', 'D', 14, 26, 32, 29], ['r', 'S', 21, 26, 24, 29],
      ['l', 'S', 19, 3, 27, -1, 2], ['l', 'S', 16, 2, 20, -2, 2],
      ['e', 'H', 10, 12, 8, 6], ['l', 'H', 6, 8, 3, 4, 2],
      ['e', 'B', 17, 7, 7, 6], ['p', 'D', [[9, 5], [17, 5], [17, 11], [10, 11]]], ['r', 'E', 9, 6, 15, 8],
      ['l', 'G', 17, 11, 21, 15, 2],
      ['l', 'B', 10, 16, 7, 25, 6],
      ['p', 'G', [[0, 22], [18, 21], [18, 27], [0, 28]]], ['r', 'W', 1, 23, 4, 25], ['l', 'G', 10, 27, 11, 31, 2],
    ],
  };
  const enemyCache = new Map();
  function enemyRows(tpl) {
    if (!ENEMY_SHAPES[tpl]) return null;
    if (!enemyCache.has(tpl)) enemyCache.set(tpl, rasterize(48, 48, ENEMY_SHAPES[tpl]));
    return enemyCache.get(tpl);
  }

  /* ---------------- motions ----------------
   * Keyframes [k (0..1), pose offsets]. Offsets (sprite px / radians):
   *   dx, dy: whole body · lean: torso rotation around the hip · na / fa: near / far arm rotation
   *   nadx: near arm reach · nl / fl: near / far leg rotation · hd: head rotation */
  const MOTIONS = {
    shoot: { dur: 150, keys: [[0, {}], [0.25, { dx: -1.5, na: -0.22, lean: -0.04 }], [1, {}]] },
    throw: { dur: 560, keys: [[0, {}], [0.38, { lean: -0.18, na: -2.6, fa: 0.4, dx: -2, hd: -0.08 }], [0.58, { lean: 0.22, na: 0.55, fa: -0.35, dx: 4, nl: -0.12, hd: 0.06 }], [1, {}]] },
    punch: { dur: 480, keys: [[0, {}], [0.28, { lean: -0.1, na: 0.6, nadx: -5, dx: -3 }], [0.5, { lean: 0.24, na: -0.05, nadx: 7, dx: 30, dy: -10, fa: 0.5, nl: -0.25, fl: 0.2 }], [0.72, { lean: 0.15, dx: 26, dy: -8, nadx: 4 }], [1, {}]] },
    cast: { dur: 640, keys: [[0, {}], [0.35, { na: -1.7, fa: -1.5, dy: -2, hd: -0.1 }], [0.7, { na: -1.6, fa: -1.4, dy: -2, hd: -0.1 }], [1, {}]] },
    dodge: { dur: 420, keys: [[0, {}], [0.45, { dx: -18, lean: -0.15, dy: -2 }], [1, {}]] },
    hit: { dur: 320, keys: [[0, {}], [0.2, { dx: -4, lean: -0.16, hd: -0.1 }], [1, {}]] },
    super: { dur: 1500, keys: [[0, {}], [0.2, { dy: 4, lean: 0.12, na: 0.6, fa: 0.6, nl: 0.15, fl: -0.15 }], [0.42, { dy: -24, lean: -0.12, na: -2.3, fa: -2.1, hd: -0.15 }], [0.62, { dy: -26, lean: -0.1, na: -2.4, fa: -2.2, hd: -0.15 }], [0.76, { dy: 2, lean: 0.26, na: 0.45, fa: 0.35, nl: -0.2, fl: 0.2 }], [1, {}]] },
  };
  const ease = k => k * k * (3 - 2 * k);
  function motionPose(type, k) {
    const m = MOTIONS[type];
    if (!m) return {};
    const keys = m.keys;
    let i = 0;
    while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
    const [k0, a] = keys[i], [k1, b] = keys[i + 1];
    const t = ease(Math.max(0, Math.min(1, (k - k0) / ((k1 - k0) || 1))));
    const out = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * t;
    return out;
  }

  const api = { ramp, shadeHex, hexToHsl, hslToHex, shadeRows, rasterize, shadeLit, GUARDIANS, CLASS_KEYS, ARMOR_PART_SLOTS, guardianRows, guardianMats, shadePart, composeGuardian, ENEMY_SHAPES, enemyRows, MOTIONS, motionPose, OUTLINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PixelArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
