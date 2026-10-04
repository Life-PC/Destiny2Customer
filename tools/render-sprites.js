#!/usr/bin/env node
/* Render the 64px guardian sprites to PNG (nearest-neighbour upscaled).
 *   node tools/render-sprites.js <outDir> [scale=8]
 * Uses battle/pixelart.js (same code as the game) and a tiny PNG encoder (zlib only). */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const PixelArt = require('../battle/pixelart.js');

const outDir = process.argv[2] || '.';
const scale = +(process.argv[3] || 8);
const ELEMENT = { titan: '#79bbff', hunter: '#7ff0ff', warlock: '#ff8a1e' };

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function upscale({ w, h, data }, s) {
  const out = new Uint8Array(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
    const si = ((Math.floor(y / s) * w) + Math.floor(x / s)) * 4, di = (y * w * s + x) * 4;
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
  }
  return { w: w * s, h: h * s, data: out };
}

fs.mkdirSync(outDir, { recursive: true });
for (const key of PixelArt.CLASS_KEYS) {
  const img = PixelArt.shadeRows(PixelArt.guardianRows(key), PixelArt.guardianMats(key, ELEMENT[key]));
  for (const s of [1, scale]) {
    const u = s === 1 ? { ...img, data: new Uint8Array(img.data) } : upscale(img, s);
    const file = path.join(outDir, `${key}${s === 1 ? '' : '@' + s + 'x'}.png`);
    fs.writeFileSync(file, png(u.w, u.h, u.data));
    console.log('wrote', file, u.w + 'x' + u.h);
  }
}
