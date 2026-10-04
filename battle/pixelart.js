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
    return shadeRows(partRows(key, id), guardianMats(key, elementColor, slotPal && slotPal[part.slot]));
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

  const api = { ramp, shadeHex, hexToHsl, hslToHex, shadeRows, rasterize, GUARDIANS, CLASS_KEYS, ARMOR_PART_SLOTS, guardianRows, guardianMats, shadePart, composeGuardian, MOTIONS, motionPose, OUTLINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PixelArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
