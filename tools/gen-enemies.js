#!/usr/bin/env node
/* Batch-generate enemy sprites: Destinypedia reference look (IP-Adapter) on the game's own underdrawing pose.
 *   node tools/gen-enemies.js [keys...] [--seeds 1,2] [--ipw 0.6] [--denoise 0.55] [--dry]
 *     refs:   art/refs/enemies/<key>/ref1.jpg, ref2.jpg   (likeness)
 *     under:  art/refs/under/<key>.png                     (pose, facing left — exported from the game)
 *     out:    art/gen/enemies/<key>_<seed>.png             → pick one, then tools/import-enemy.py <png> <key>
 * Settings chosen with the user on the Dreg test: --preset xlpixel, IP-Adapter 0.6, img2img denoise 0.55. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const dry = args.includes('--dry');
const seeds = flag('seeds', '1').split(',').map(Number);
const ipw = flag('ipw', '0.6'), denoise = flag('denoise', '0.55');

const STYLE = 'pixel art, game sprite, full body, facing left, side view, battle stance, detailed pixel shading, dark sci-fi, destiny 2 enemy, plain flat gray background';
const NEG = 'text, watermark, blurry, multiple characters, human face, cute, chibi, background scenery, realistic, photo, 3d render';
const TAKEN = 'taken version: pitch black smoky body, white-blue glowing eyes and cracks, swirling white energy wisps';
const ENEMIES = {
  thrall: 'hive thrall, lanky skeletal undead creature, pale bone chitin, long clawed arms, hunched, no weapon',
  acolyte: 'hive acolyte, undead soldier with three glowing green eyes, bone and cloth armor, holding a shredder rifle',
  knight: 'hive knight, hulking undead warrior, thick bone plate armor, glowing green eyes, holding a heavy boomer cannon',
  wizard: 'hive wizard, floating undead witch, tattered robes, tall bone headdress, glowing green hands',
  dreg: 'fallen dreg, alien pirate with four arms, white crested helmet with glowing blue eyes, tattered cloak, holding a shock pistol',
  vandal: 'fallen vandal, tall four-armed alien with horned helmet, glowing blue eyes, house cloak, holding a long wire rifle',
  captain: 'fallen captain, large four-armed alien warlord, big spiked helmet, glowing eyes, long cape, holding a shrapnel launcher',
  servitor: 'fallen servitor, floating dark metal sphere machine with a single huge glowing purple eye, segmented plates',
  goblin: 'vex goblin, faceless bronze machine, flat wide head with one red eye, glowing white core in the chest, slender metal legs, slap rifle',
  harpy: 'vex harpy, floating bronze machine drone with fin-like wings and a single red eye, no legs',
  minotaur: 'vex minotaur, huge bronze robot, massive shoulders, single red eye, white radiolaria core, torch hammer',
  hydra: 'vex hydra, large floating bronze machine, rotating armor shields, single red eye core, no legs',
  legionary: 'cabal legionary, massive armored rhino-like soldier, bulky red and grey armor, glowing visor, jetpack, slug rifle',
  phalanx: 'cabal phalanx, massive armored soldier holding a huge energy shield in front, red armor, slug pistol',
  psion: 'cabal psion, short slender alien in a cone helmet, grey and red light armor, holding a slug pistol',
  centurion: 'cabal centurion, huge armored commander, ornate red and gold armor, jetpack, glowing visor, projection rifle',
  t_thrall: 'hive thrall, lanky skeletal creature, ' + TAKEN,
  t_psion: 'cabal psion, short slender alien in a cone helmet, ' + TAKEN,
  t_knight: 'hive knight, hulking armored warrior with a boomer cannon, ' + TAKEN,
  t_wizard: 'hive wizard, floating robed witch, ' + TAKEN,
};
const keys = args.filter(a => ENEMIES[a]);
const todo = keys.length ? keys : Object.keys(ENEMIES);
fs.mkdirSync(path.join(ROOT, 'art', 'gen', 'enemies'), { recursive: true });
for (const k of todo) {
  const refDir = path.join(ROOT, 'art', 'refs', 'enemies', k);
  const refs = fs.existsSync(refDir) ? fs.readdirSync(refDir).filter(f => /^ref[12]\./.test(f)).map(f => path.join(refDir, f)) : [];
  const under = path.join(ROOT, 'art', 'refs', 'under', k + '.png');
  if (!refs.length || !fs.existsSync(under)) { console.warn(`skip ${k}: missing refs or underdrawing`); continue; }
  for (const seed of seeds) {
    const out = path.join(ROOT, 'art', 'gen', 'enemies', `${k}_${seed}.png`);
    if (fs.existsSync(out)) { console.log('exists', path.relative(ROOT, out)); continue; }
    const prompt = `${STYLE.replace('full body', 'full body ' + ENEMIES[k])}`;
    const cmd = [path.join(__dirname, 'comfy-gen.js'), out, prompt, '--preset', 'xlpixel', '--w', '1024', '--h', '1024',
      ...refs.flatMap(r => ['--ipref', r]), '--ipw', ipw, '--init', under, '--denoise', denoise, '--neg', NEG, '--seed', String(1000 + seed * 7919)];
    console.log(`▶ ${k} seed ${seed}`);
    if (!dry) execFileSync('node', cmd, { stdio: 'inherit' });
  }
}
