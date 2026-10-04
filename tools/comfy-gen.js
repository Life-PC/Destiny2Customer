#!/usr/bin/env node
/* Generate an image with the local ComfyUI (API at 127.0.0.1:8188) and save it.
 *   node tools/comfy-gen.js <out.png> "<prompt>" [--neg "..."] [--w 512] [--h 768] [--seed N] [--steps 26]
 *                           [--cfg 7] [--lora 0.8] [--ckpt DreamShaper_8_pruned.safetensors]
 * Uses SD1.5 (DreamShaper 8) + PixelArtRedmond LoRA by default. */
const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const out = args[0], prompt = args[1];
if (!out || !prompt) { console.error('usage: comfy-gen.js <out.png> "<prompt>" [options]'); process.exit(1); }
const HOST = { host: '127.0.0.1', port: +opt('port', 8188) };

const neg = opt('neg', 'blurry, lowres, jpeg artifacts, text, watermark, signature, frame, border, cropped, multiple characters, extra limbs, deformed, photo, realistic, 3d render, background scenery, ground, shadow');
const W = +opt('w', 512), H = +opt('h', 768), seed = +opt('seed', Math.floor(Math.random() * 2 ** 31));
const ckpt = opt('ckpt', 'DreamShaper_8_pruned.safetensors');
const lora = opt('loraName', 'PixelArtRedmond15V-PixelArt-PIXARFK.safetensors');
const loraW = +opt('lora', 0.8);

const wf = {
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
  2: { class_type: 'LoraLoader', inputs: { model: ['1', 0], clip: ['1', 1], lora_name: lora, strength_model: loraW, strength_clip: loraW } },
  3: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 1], text: prompt } },
  4: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 1], text: neg } },
  5: { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
  6: { class_type: 'KSampler', inputs: { model: ['2', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0],
    seed, steps: +opt('steps', 26), cfg: +opt('cfg', 7), sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1 } },
  7: { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
  8: { class_type: 'SaveImage', inputs: { images: ['7', 0], filename_prefix: 'd2mobius/' + path.basename(out, path.extname(out)) } },
};

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ ...HOST, method, path: p, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const b = Buffer.concat(chunks); res.statusCode >= 400 ? reject(new Error(res.statusCode + ' ' + b)) : resolve(b); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const t0 = Date.now();
  const { prompt_id } = JSON.parse(await req('POST', '/prompt', { prompt: wf }));
  for (;;) {
    await sleep(1500);
    const h = JSON.parse(await req('GET', '/history/' + prompt_id))[prompt_id];
    if (!h) continue;
    if (h.status && h.status.status_str === 'error') throw new Error(JSON.stringify(h.status.messages).slice(0, 800));
    const img = Object.values(h.outputs || {}).flatMap(o => o.images || [])[0];
    if (!img) continue;
    const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, await req('GET', '/view?' + q));
    console.log(`saved ${out} (seed ${seed}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    return;
  }
})().catch(e => { console.error(e.message); process.exit(1); });
