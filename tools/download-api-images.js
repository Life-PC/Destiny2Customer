#!/usr/bin/env node
/* Download the Bungie API icons used by the game into local folders (reference images for art).
 *   node tools/download-api-images.js [outDir=api-images]
 * Layout (same tree under サムネイル/ = item icons and スクリーンショット/ = item screenshots):
 *   防具/<クラス>/<シリーズ>/<部位>_<名前>.jpg   (exotics → 防具/<クラス>/エキゾチック)
 *   武器/<武器種>_<名前>.jpg
 *   ゴースト/<名前>.jpg   (screenshots by the hash naming rule; missing ones are skipped)
 * Source: data/manifest-ja.json (built by tools/build-manifest.js). Duplicates (same name) are skipped. */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.resolve(process.argv[2] || 'api-images');
const m = require('../data/manifest-ja.json');
const BUNGIE = 'https://www.bungie.net';
const CLASS = ['タイタン', 'ハンター', 'ウォーロック'];
const SLOT = { 3448274439: '頭', 3551918588: '腕', 14239492: '胴', 20886954: '脚', 1585787867: 'クラスアイテム' };
const safe = s => String(s).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);

// armor series name: item set name if any, else the item name without its last "の…" (slot noun)
const setName = h => m.itemSets && m.itemSets[h] && m.itemSets[h].n;
function series(it) {
  if (it.tt === 6) return 'エキゾチック';
  if (it.set && setName(it.set)) return setName(it.set);
  const i = it.n.lastIndexOf('の');
  if (i > 0) return it.n.slice(0, i);
  const sp = it.n.split(/[\s・]/);
  return sp.length > 1 ? sp.slice(0, -1).join(' ') : 'その他';
}

const jobs = [];
const seen = new Set();
const addOne = (kind, dir, name, src, optional) => {
  if (!src) return;
  const ext = path.extname(src) || '.jpg';
  const file = path.join(OUT, kind, ...dir.map(safe), safe(name) + ext);
  if (seen.has(file)) return;
  seen.add(file);
  jobs.push({ url: BUNGIE + src, file, optional });
};
const add = (dir, name, icon, shot, optional) => { addOne('サムネイル', dir, name, icon); addOne('スクリーンショット', dir, name, shot, optional); };

for (const it of m.items) {
  if (it.it === 2 && SLOT[it.bk] && CLASS[it.cl] && it.tt >= 2) {
    add(['防具', CLASS[it.cl], series(it)], `${SLOT[it.bk]}_${it.n}`, it.i, it.s);
  } else if (it.it === 3 && it.tt >= 2) {
    add(['武器'], `${it.t || '武器'}_${it.n}`, it.i, it.s);
  }
}
for (const gh of m.ghosts || []) add(['ゴースト'], gh.n, gh.i, gh.s || `/common/destiny2_content/screenshots/${gh.h}.jpg`, !gh.s);

function get(url, file, tries = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'D2Mobius-art-reference' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(res.statusCode + ' ' + url)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.concat(chunks)); resolve(); });
    }).on('error', reject);
  }).catch(e => (tries > 1 ? get(url, file, tries - 1) : Promise.reject(e)));
}

(async () => {
  const todo = jobs.filter(j => !fs.existsSync(j.file));
  console.log(`${jobs.length} images (${todo.length} to download) → ${OUT}`);
  let done = 0, failed = 0, skipped = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const j = todo[i++];
      try { await get(j.url, j.file); } catch (e) { if (j.optional) skipped++; else { failed++; console.warn('failed', e.message); } }
      if (++done % 200 === 0) console.log(`${done}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  console.log(`done: ${done - failed - skipped} ok, ${failed} failed, ${skipped} not available`);
})();
