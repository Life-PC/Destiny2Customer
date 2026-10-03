/* D2 MOBIUS — pixel sprites
 * Guardians / Ghost / enemies are hand-made pixel maps (24x24) drawn with palettes.
 * API images (stage backgrounds, hologram enemies) are pixelated at runtime.
 */
(function (root) {
  'use strict';

  // ---------- Pixel maps (each row padded to 24) ----------
  // Palette keys — guardians: K outline, A armor, a armor shade, M metal light, V visor,
  // E element accent, C cloth, c cloth shade, G gun, g gun light
  const MAPS = {
    titan: [
      '..........KKKKK.........',
      '.........KAAAAAK........',
      '........KAMAAAAAK.......',
      '........KAAVVVVAK.......',
      '........KaAKKKKaK.......',
      '.........KaAAAaK........',
      '......KKKKKaaaKKKKK.....',
      '.....KMMMAKAAAKAMMMK....',
      '....KMMMAAAAAAAAAMMMK...',
      '....KMAAAAAEEEAAAAAMK...',
      '....KaAKAAAEEEAAAKAaK...',
      '....KaaKAAAAAAAAAKKKKKKK',
      '.....KKKAAAAAAAAKgGGGGGK',
      '.....KaKaAAAAAAaKGKKKKK.',
      '.....KKKCCCCCCCCK.......',
      '........KCCEECCK........',
      '........KCCEECCK........',
      '........KAAKKAAK........',
      '.......KAAK..KAAK.......',
      '.......KAaK..KaAK.......',
      '.......KAaK..KaAK.......',
      '......KMMMK..KMMMK......',
      '......KKKKK..KKKKK......',
      '........................',
    ],
    hunter: [
      '.........KKKKK..........',
      '........KCCCCCK.........',
      '.......KCCAAACCK........',
      '.......KCAAVVVAK........',
      '.......KCAKKKKAK........',
      '......KCCKaAAaK.........',
      '.....KCCKKaaaKKK........',
      '.....KCKAAAAAAAAK.......',
      '....KCcKAAEEAAAAK.......',
      '....KCcKAAEEAAAAKK......',
      '....KCcKaAAAAAAKaK......',
      '....KCcKaAAAAAAKaKKKKK..',
      '....KCcKKAAAAAKKgGGGGK..',
      '....KCcK.KAAAAKKGKKKK...',
      '....KCcK.KCCCCK.........',
      '....KCcK.KAAAAK.........',
      '....KCK.KAAKKAAK........',
      '.....KK.KAAK.KAAK.......',
      '.......KAaK...KAaK......',
      '.......KAaK...KAaK......',
      '.......KAaK...KAaK......',
      '......KMMMK..KMMMK......',
      '......KKKKK..KKKKK......',
      '........................',
    ],
    warlock: [
      '..........KKKK..........',
      '.........KAAAAK.........',
      '........KAMAAAAK........',
      '........KAVVVVAK........',
      '........KAKKKKaK........',
      '.........KAAAAK.........',
      '.......KKKaaaaKKK.......',
      '......KAAKCCCCKAAK......',
      '.....KAAKCCEECCKAAK.....',
      '.....KAaKCCEECCKKKKKK...',
      '.....KEEKCCCCCCKgGGGK...',
      '.....KEEKCCCCCCKGKKK....',
      '.....KKKCCCCCCCCK.......',
      '.......KCCCcCCCCK.......',
      '.......KCCCcCCCCCK......',
      '......KCCCCcCCCCCK......',
      '......KCCCKcKCCCCK......',
      '.....KCCCCKcKCCCCCK.....',
      '.....KCCCK.K.KCCCCK.....',
      '.....KcccK...KcccK......',
      '......KAAK...KAAK.......',
      '......KMMK...KMMK.......',
      '......KKKK...KKKK.......',
      '........................',
    ],
    ghost: [
      '...KK...',
      '..KMMK..',
      '.KMAAMK.',
      'KMAVVAMK',
      '.KAaaAK.',
      '..KaaK..',
      '...KK...',
      '........',
    ],
    // Enemies (facing left). K outline, B body, b body shade, D dark, H highlight, E eye, W weapon/glow
    hum: [
      '........................',
      '..........KKKK..........',
      '.........KBBBBK.........',
      '........KBEBEBK.........',
      '........KBBBBBK.........',
      '.........KbbbK..........',
      '.......KKBBBBBKK........',
      '......KBBHBBBBBBK.......',
      '.....KBBKBBBBBKBBK......',
      '...KKWKKBBBBBBK.KBK.....',
      '..KWWWWKKBbBBK..KBK.....',
      '...KKKK.KBbBBK...KbK....',
      '........KBBBBK....K.....',
      '.......KBBKKBBK.........',
      '.......KBK..KBK.........',
      '......KBK....KBK........',
      '......KbK....KbK........',
      '.....KbK......KbK.......',
      '.....KDK......KDK.......',
      '....KDDK......KDDK......',
      '....KKKK......KKKK......',
      '........................',
      '........................',
      '........................',
    ],
    big: [
      '........................',
      '.........KKKKKK.........',
      '........KBBBBBBK........',
      '.......KBHBBBBBBK.......',
      '.......KBEEBBEEBK.......',
      '.......KbBBBBBBbK.......',
      '.....KKKKbbbbbbKKKK.....',
      '....KBBBBKBBBBKBBBBK....',
      '...KBHBBBBBBBBBBBBBBK...',
      '..KBBBBBBBBBBBBBBBBBBK..',
      'KKKKKKKBBBBBBBBBBBbbBK..',
      'KWWWWWWKBBBHHBBBBKbbBK..',
      'KKKKKKKBBBBBBBBBBKbbK...',
      '...KbbKBBBBBBBBBBKKK....',
      '...KKKKbbbbbbbbbbK......',
      '......KDDDDDDDDDDK......',
      '......KBBBK..KBBBK......',
      '......KBBBK..KBBBK......',
      '.....KBBbK....KbBBK.....',
      '.....KBBbK....KbBBK.....',
      '.....KbbbK....KbbbK.....',
      '....KDDDDK....KDDDDK....',
      '....KKKKKK....KKKKKK....',
      '........................',
    ],
    float: [
      '..........KKKK..........',
      '.........KHBBBK.........',
      '....KK..KBBBBBBK..KK....',
      '...KHBK.KBEEEEBK.KBHK...',
      '...KBBBKKbBBBBbKKBBBK...',
      '....KBBBBKbbbbKBBBBK....',
      '.....KKBBBBBBBBBBKK.....',
      '......KBBBBHHBBBBK......',
      '..KKK.KBBBBBBBBBBK......',
      '.KWWWKKBBBBBBBBBBK......',
      '.KWWWKKbBBBBBBBBbK......',
      '..KKK..KbBBBBBBbK.......',
      '.......KDbBBBBbDK.......',
      '........KDbBBbDK........',
      '........KDDbbDDK........',
      '.........KDDDDK.........',
      '.........KDDDDK.........',
      '..........KDDK..........',
      '..........KDDK..........',
      '...........KK...........',
      '........................',
      '........................',
      '........................',
      '........................',
    ],
    orb: [
      '........................',
      '........KKKKKKKK........',
      '......KKBBBBBBBBKK......',
      '.....KBBHHBBBBBBBBK.....',
      '....KBBHBBBBBBBBBBBK....',
      '...KBBBBBKKKKKKBBBBBK...',
      '...KBBBBKDDDDDDKBBBBK...',
      '..KBBBBKDDEEEEDDKBBBBK..',
      '..KBBBBKDEEWWEEDKBBBBK..',
      '..KBBBBKDEEWWEEDKBBBBK..',
      '..KBBBBKDDEEEEDDKBBBBK..',
      '...KBBBBKDDDDDDKBBBBK...',
      '...KbBBBBKKKKKKBBBBbK...',
      '....KbBBBBBBBBBBBBbK....',
      '.....KbbBBBBBBBBbbK.....',
      '......KKbbbbbbbbKK......',
      '........KKKKKKKK........',
      '..........KDDK..........',
      '.........KDKKDK.........',
      '........KDK..KDK........',
      '........KK....KK........',
      '........................',
      '........................',
      '........................',
    ],
  };

  const GUARDIAN_PALETTES = {
    titan:   { K: '#10131a', A: '#8d96a3', a: '#5d6573', M: '#c9d1db', C: '#7a2e2e', c: '#521d1d', G: '#262b33', g: '#5a6270' },
    hunter:  { K: '#10131a', A: '#6f7a6e', a: '#475046', M: '#b7c0b5', C: '#3d4652', c: '#262c34', G: '#262b33', g: '#5a6270' },
    warlock: { K: '#10131a', A: '#8a8274', a: '#5e5749', M: '#cfc6b4', C: '#4a3f5c', c: '#2f2840', G: '#262b33', g: '#5a6270' },
    ghost:   { K: '#10131a', A: '#d9dde4', a: '#8d939e', M: '#ffffff' },
  };
  const FACTION_PALETTES = {
    hive:   { K: '#0d0d0a', B: '#b9b39b', b: '#7c7764', D: '#2f2b22', H: '#e6e1cc', E: '#7dff6a', W: '#5dd94a' },
    fallen: { K: '#0b0c14', B: '#5b6089', b: '#3c4062', D: '#262838', H: '#9ea3c6', E: '#c8b6ff', W: '#79bbff' },
    vex:    { K: '#120d06', B: '#b08d57', b: '#7a5f36', D: '#3a2c18', H: '#e9e2cf', E: '#ff3b3b', W: '#ff6b4a' },
    cabal:  { K: '#120a08', B: '#9a4a2f', b: '#6b2f1d', D: '#3a2a20', H: '#d0a070', E: '#ffcc55', W: '#ff9a3c' },
    taken:  { K: '#f2f6ff', B: '#15151c', b: '#0b0b10', D: '#000000', H: '#3a3f55', E: '#ffffff', W: '#d9ecff' },
    scorn:  { K: '#0a1212', B: '#2f4a48', b: '#1e3130', D: '#0f1a1a', H: '#5f8a85', E: '#6bffe0', W: '#6bd3c4' },
  };
  const ELEMENT_COLORS = {
    kin: '#d4d4d4', arc: '#79bbff', solar: '#ff8a1e', void: '#b084eb',
    stasis: '#4d88ff', strand: '#5fd970', light: '#f3ecd0', prism: '#ff6bd5',
  };

  function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (n >> 16) + amt), g = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // Render a pixel map into an offscreen canvas (1px per cell)
  const cache = new Map();
  function renderMap(mapKey, palette, cacheKey) {
    const key = cacheKey || mapKey + JSON.stringify(palette);
    if (cache.has(key)) return cache.get(key);
    const rows = MAPS[mapKey];
    const w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = palette[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    });
    cache.set(key, c);
    return c;
  }

  function guardianSprite(cls, element) {
    const map = ['titan', 'hunter', 'warlock'][cls] || 'titan';
    const el = ELEMENT_COLORS[element] || ELEMENT_COLORS.light;
    const pal = { ...GUARDIAN_PALETTES[map], E: el, V: lighten(el, 60) };
    return renderMap(map, pal, `g:${map}:${element}`);
  }
  function ghostSprite(element) {
    const el = ELEMENT_COLORS[element] || '#79bbff';
    return renderMap('ghost', { ...GUARDIAN_PALETTES.ghost, V: el }, `ghost:${element}`);
  }
  function enemySprite(tpl, faction, element) {
    const pal = { ...FACTION_PALETTES[faction] };
    // Shield element tints the weapon/glow pixels so the weakness is readable at a glance
    if (element && ELEMENT_COLORS[element]) pal.W = ELEMENT_COLORS[element];
    return renderMap(tpl, pal, `e:${tpl}:${faction}:${element}`);
  }

  // ---------- API image pixelation ----------
  const imgCache = new Map();
  function loadImage(url, cors) {
    const key = url + (cors ? '#c' : '');
    if (imgCache.has(key)) return imgCache.get(key);
    const p = new Promise((resolve, reject) => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image load failed: ' + url));
      im.src = url;
    });
    imgCache.set(key, p);
    return p;
  }

  // Background: downscale (no pixel reads → works with non-CORS PGCR images), cover-crop to w×h
  async function pixelatedBackground(url, w, h) {
    const im = await loadImage(url, false);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    const s = Math.max(w / im.width, h / im.height);
    const dw = im.width * s, dh = im.height * s;
    g.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return c;
  }

  // Hologram enemy from an API icon (CORS-enabled): pixelate to size×size, keep bright cyan
  // hologram pixels, drop the purple/dark background, quantize colors.
  async function pixelatedHologram(url, size) {
    const im = await loadImage(url, true);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(im, 0, 0, size, size);
    const data = g.getImageData(0, 0, size, size);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const cyan = (gg + b) / 2 - r;
      if (cyan < 40 || b < 140) { d[i + 3] = 0; continue; }
      // Quantize to 4 hologram tones
      const lum = (r + gg + b) / 3;
      const tone = lum > 200 ? [230, 255, 255] : lum > 160 ? [150, 235, 255] : lum > 120 ? [80, 190, 240] : [40, 120, 200];
      d[i] = tone[0]; d[i + 1] = tone[1]; d[i + 2] = tone[2]; d[i + 3] = 235;
    }
    g.putImageData(data, 0, 0);
    // 1px dark outline for readability
    const o = document.createElement('canvas');
    o.width = size + 2; o.height = size + 2;
    const og = o.getContext('2d');
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) og.drawImage(c, dx, dy);
    og.globalCompositeOperation = 'source-in';
    og.fillStyle = '#06121c';
    og.fillRect(0, 0, o.width, o.height);
    og.globalCompositeOperation = 'source-over';
    og.drawImage(c, 1, 1);
    return o;
  }

  // Simulation grid background (training stage / fallback)
  function gridBackground(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#071420'); grad.addColorStop(1, '#0d2a3a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(80,190,240,0.18)';
    for (let x = 0; x < w; x += 8) g.fillRect(x, Math.floor(h * 0.55), 1, h);
    for (let y = Math.floor(h * 0.55); y < h; y += 6) g.fillRect(0, y, w, 1);
    return c;
  }

  root.Sprites = {
    MAPS, ELEMENT_COLORS, guardianSprite, ghostSprite, enemySprite,
    loadImage, pixelatedBackground, pixelatedHologram, gridBackground, lighten,
  };
})(window);
