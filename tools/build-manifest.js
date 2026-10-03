#!/usr/bin/env node
/* Build a compact Destiny 2 manifest for the web app.
 *   node tools/build-manifest.js [--force]
 * Writes data/manifest-ja.json and data/manifest-version.json.
 * Skips work if the Bungie manifest version is unchanged (unless --force).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const D2Trim = require('../manifest-trim.js');

const BUNGIE = 'https://www.bungie.net';
const LANG = process.env.D2_LANG || 'ja';
const API_KEY = process.env.BUNGIE_API_KEY || '175c13fb6427478d80c153c6c52ccb9d';
const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, `manifest-${LANG}.json`);
const VER_FILE = path.join(OUT_DIR, 'manifest-version.json');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept-Encoding': 'gzip', ...headers } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), headers));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} ${url}`)); }
      const stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(zlib.createGunzip()) : res;
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    }).on('error', reject);
  });
}
async function getJson(url, headers) {
  return JSON.parse((await get(url, headers)).toString('utf8'));
}

async function main() {
  const force = process.argv.includes('--force');
  const meta = (await getJson(`${BUNGIE}/Platform/Destiny2/Manifest/`, { 'X-API-Key': API_KEY })).Response;
  const version = meta.version;
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(VER_FILE, 'utf8')); } catch {}
  if (!force && prev && prev.version === version && prev.schema === D2Trim.SCHEMA && fs.existsSync(OUT_FILE)) {
    console.log(`Up to date: ${version} (schema ${D2Trim.SCHEMA})`);
    return;
  }
  const paths = meta.jsonWorldComponentContentPaths[LANG];
  const raw = {};
  for (const [key, table] of Object.entries(D2Trim.TABLES)) {
    console.log(`Downloading ${table}...`);
    raw[key] = await getJson(BUNGIE + paths[table]);
  }
  console.log('Trimming...');
  const compact = D2Trim.buildCompact(version, raw);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(compact);
  fs.writeFileSync(OUT_FILE, json);
  // bytes = uncompressed UTF-8 size; the browser uses it for the download progress bar
  fs.writeFileSync(VER_FILE, JSON.stringify({ version, schema: D2Trim.SCHEMA, lang: LANG, bytes: Buffer.byteLength(json), built: new Date().toISOString() }));
  const gz = zlib.gzipSync(json).length;
  console.log(`Wrote ${OUT_FILE}: ${(json.length / 1e6).toFixed(1)} MB (gzip ${(gz / 1e6).toFixed(1)} MB)`);
  console.log(`items=${compact.items.length} plugs=${Object.keys(compact.plugs).length} plugSets=${Object.keys(compact.plugSets).length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
