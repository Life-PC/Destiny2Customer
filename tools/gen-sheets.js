#!/usr/bin/env node
/* Generate art sheets with GPT Image (via ComfyUI API nodes) from a layout template + real API images.
 *   node tools/gen-sheets.js armor <クラス> <シリーズ>        e.g. armor ハンター 雷雲
 *   node tools/gen-sheets.js weapons <名前1> [<名前2> ... up to 6]   (file names in api-images/…/武器 without extension, or a substring)
 *   node tools/gen-sheets.js ghost <名前>
 *   node tools/gen-sheets.js poses <クラス> <シリーズ> [<エキゾチック名>]   → pose sheet for one outfit (then tools/import-poses.py)
 * Options: --quality low|medium|high (default low) --model gpt-image-2 --dry (print prompt + refs only)
 * Output: art/sheets/<type>/<name>.png  (then: python tools/pixelize.py / the rig assembler)
 * Needs COMFY_API_KEY (environment variable or .env) and ComfyUI running at 127.0.0.1:8188. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api-images');
const TPL = path.join(ROOT, 'art', 'templates');
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--dry'));
const [type, ...names] = pos;
const dry = args.includes('--dry');

const STYLE = 'High quality 2D pixel art game asset sheet, Destiny-inspired sci-fi armor, crisp dark outlines, rich cel shading lit from the top-left, '
  + 'plain pure white background, no text except the cell labels, no shadows on the ground.';
const SLOT_FILE = { head: '頭', arms: '腕', chest: '胴', legs: '脚', cls: 'クラスアイテム' };

function find(dir, needle) {
  const all = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : all.push(p); } })(dir);
  return all.filter(p => path.basename(p, path.extname(p)).includes(needle));
}

function job() {
  if (type === 'armor') {
    const [cls, series] = names;
    const dir = path.join(API, 'スクリーンショット', '防具', cls, series);
    if (!fs.existsSync(dir)) throw new Error('not found: ' + dir);
    const shots = fs.readdirSync(dir).map(f => path.join(dir, f));
    const order = Object.values(SLOT_FILE).map(s => shots.find(f => path.basename(f).startsWith(s + '_'))).filter(Boolean);
    return {
      out: path.join(ROOT, 'art', 'sheets', 'armor', `${cls}_${series}.png`),
      refs: [path.join(TPL, 'armor_set.png'), ...order],
      prompt: `${STYLE}\nImage 1 is the LAYOUT TEMPLATE: reproduce exactly this sheet layout, cell order, labels, part shapes, proportions and the dark round joint sockets `
        + `(each limb segment starts with a dark round socket at its joint, like ball-jointed doll parts). Front view, small chibi-proportioned guardian.\n`
        + `Images 2-${order.length + 1} are the real armor pieces of the "${series}" set for the ${cls === 'ハンター' ? 'Hunter' : cls === 'タイタン' ? 'Titan' : 'Warlock'} class `
        + `(${order.map(f => path.basename(f, '.jpg')).join(', ')}). Dress the guardian in exactly these armor designs, colors and materials (helmet, chest, gauntlets, legs, class item). `
        + `Draw the FULL BODY on the left and every separated part in its labeled cell, all at the same scale, so the parts can be reassembled.`,
    };
  }
  if (type === 'weapons') {
    const files = names.slice(0, 6).map(n => { const f = find(path.join(API, 'スクリーンショット', '武器'), n)[0]; if (!f) throw new Error('weapon not found: ' + n); return f; });
    return {
      out: path.join(ROOT, 'art', 'sheets', 'weapons', `${names.slice(0, 6).join('_').slice(0, 60)}.png`),
      refs: [path.join(TPL, 'weapons.png'), ...files],
      prompt: `${STYLE}\nImage 1 is the LAYOUT TEMPLATE: ${files.length} weapon cells, each weapon in pure side view, horizontal, muzzle pointing RIGHT, grip below, same scale. `
        + `Images 2-${files.length + 1} are the real weapons: ${files.map((f, i) => `cell ${i + 1} = ${path.basename(f, '.jpg')}`).join('; ')}. `
        + `Reproduce each weapon's real shape, colors and details. Replace "WEAPON n (name)" with the weapon name. Leave unused cells empty.`,
    };
  }
  if (type === 'ghost') {
    const f = find(path.join(API, 'スクリーンショット', 'ゴースト'), names[0])[0] || find(path.join(API, 'サムネイル', 'ゴースト'), names[0])[0];
    if (!f) throw new Error('ghost not found: ' + names[0]);
    return {
      out: path.join(ROOT, 'art', 'sheets', 'ghost', `${path.basename(f, '.jpg')}.png`),
      refs: [path.join(TPL, 'ghost.png'), f],
      prompt: `${STYLE}\nImage 1 is the LAYOUT TEMPLATE for a Ghost robot companion: full ghost (front), the glowing eye core alone, the four shell pieces separately `
        + `(top-left, top-right, bottom-left, bottom-right, split at the eye so they can open and spin), and a side view facing right. `
        + `Image 2 is the real ghost shell "${path.basename(f, '.jpg')}": reproduce its shape, colors and details on every piece.`,
    };
  }
  if (type === 'poses') {
    const [cls, series, exName] = names;
    const dir = path.join(API, 'スクリーンショット', '防具', cls, series);
    if (!fs.existsSync(dir)) throw new Error('not found: ' + dir);
    const shots = fs.readdirSync(dir).map(f => path.join(dir, f));
    const ex = exName ? find(path.join(API, 'スクリーンショット', '防具', cls, 'エキゾチック'), exName)[0] : null;
    const refs = [path.join(TPL, 'pose_sheet.png'), ...shots.slice(0, ex ? 4 : 5), ...(ex ? [ex] : [])];
    return {
      out: path.join(ROOT, 'art', 'sheets', 'poses', `${cls}_${series}${exName ? '_' + exName : ''}.png`),
      refs,
      prompt: `${STYLE}
Image 1 is the POSE TEMPLATE: 4 rows (IDLE, SHOOT, MELEE, SUPER) x 3 frames. Draw ONE guardian character in all 12 cells, `
        + `copying each mannequin's pose, position and size exactly (same scale, feet on the same ground position, facing right in 3/4 view). `
        + `Chibi proportions (head about 1/4 of the height), holding a hand cannon. Keep the character identical in every frame.
`
        + `The other images are the real armor of the "${series}" set${ex ? ` and the exotic "${path.basename(ex, '.jpg')}"` : ''} for the ${cls === 'ハンター' ? 'Hunter' : cls === 'タイタン' ? 'Titan' : 'Warlock'}: `
        + `dress the character in exactly these armor designs, colors and materials. The black starry body in the photos is NOT part of the design (use a plain dark gray undersuit). `
        + `No mannequin, no labels, no ground line, plain white background.`,
    };
  }
  throw new Error('usage: gen-sheets.js armor <クラス> <シリーズ> | weapons <名前...> | ghost <名前>');
}

const j = job();
console.log('refs:\n  ' + j.refs.map(r => path.relative(ROOT, r)).join('\n  ') + '\nprompt:\n' + j.prompt + '\n→ ' + path.relative(ROOT, j.out));
if (!dry) {
  fs.mkdirSync(path.dirname(j.out), { recursive: true });
  execFileSync('node', [path.join(__dirname, 'comfy-gen.js'), j.out, j.prompt, '--engine', 'gpt', '--model', flag('model', 'gpt-image-2'),
    '--quality', flag('quality', 'low'), '--size', type === 'poses' ? 'Custom' : '1536x1024', ...(type === 'poses' ? ['--cw', '1536', '--ch', '2048'] : []), '--bg', 'opaque', ...j.refs.flatMap(r => ['--ref', r])], { stdio: 'inherit' });
}
