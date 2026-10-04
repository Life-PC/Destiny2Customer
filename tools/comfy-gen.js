#!/usr/bin/env node
/* Generate an image with the local ComfyUI (API at 127.0.0.1:8188) and save it.
 *   node tools/comfy-gen.js <out.png> "<prompt>" [--neg "..."] [--w 512] [--h 768] [--seed N] [--steps 26]
 *                           [--cfg 7] [--lora 0.8] [--ckpt DreamShaper_8_pruned.safetensors]
 *                           [--init base.png --denoise 0.6]   (img2img: redraw an existing image)
 *   GPT Image via ComfyUI API nodes (Comfy.org credits; key in env COMFY_API_KEY or .env):
 *   node tools/comfy-gen.js <out.png> "<prompt>" --engine gpt [--ref a.jpg --ref b.jpg ...]
 *                           [--model gpt-image-2] [--quality low|medium|high] [--size 1024x1536] [--bg transparent]
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

const engine = opt('engine', 'sd');
const refs = args.flatMap((a, i) => (a === '--ref' ? [args[i + 1]] : []));
function comfyKey() {
  if (process.env.COMFY_API_KEY) return process.env.COMFY_API_KEY;
  const env = path.join(__dirname, '..', '.env');
  if (fs.existsSync(env)) { const m = fs.readFileSync(env, 'utf8').match(/^COMFY_API_KEY=(.+)$/m); if (m) return m[1].trim(); }
  return null;
}
const init = opt('init', null);
const INPUT_DIR = opt('inputDir', 'D:/Comfy-Desktop/ComfyUI-Shared/input');
let initName = null;
if (init) {
  initName = 'd2m_' + path.basename(init);
  fs.copyFileSync(init, path.join(INPUT_DIR, initName)); // ComfyUI LoadImage reads its input folder
}
const toInput = f => { const n = 'd2m_' + path.basename(f); fs.copyFileSync(f, path.join(INPUT_DIR, n)); return n; };
const gptWf = () => {
  const w = {};
  refs.forEach((f, i) => { w['r' + i] = { class_type: 'LoadImage', inputs: { image: toInput(f) } }; });
  // chain reference images into one batch (the node sends them all to the model)
  let img = refs.length ? ['r0', 0] : null;
  for (let i = 1; i < refs.length; i++) { w['b' + i] = { class_type: 'ImageBatch', inputs: { image1: img, image2: ['r' + i, 0] } }; img = ['b' + i, 0]; }
  w.g = { class_type: 'OpenAIGPTImage1', inputs: { prompt, model: opt('model', 'gpt-image-2'), quality: opt('quality', 'low'),
    background: opt('bg', 'transparent'), size: opt('size', '1024x1536'), n: 1, seed,
    ...(opt('size') === 'Custom' ? { custom_width: +opt('cw', 1536), custom_height: +opt('ch', 2048) } : {}), ...(img ? { image: img } : {}) } };
  w.s = { class_type: 'SaveImage', inputs: { images: ['g', 0], filename_prefix: 'd2mobius/' + path.basename(out, path.extname(out)) } };
  return w;
};
const wf = engine === 'gpt' ? gptWf() : {
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
  2: { class_type: 'LoraLoader', inputs: { model: ['1', 0], clip: ['1', 1], lora_name: lora, strength_model: loraW, strength_clip: loraW } },
  3: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 1], text: prompt } },
  4: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 1], text: neg } },
  5: { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
  6: { class_type: 'KSampler', inputs: { model: ['2', 0], positive: ['3', 0], negative: ['4', 0], latent_image: init ? ['10', 0] : ['5', 0],
    seed, steps: +opt('steps', 26), cfg: +opt('cfg', 7), sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: init ? +opt('denoise', 0.6) : 1 } },
  7: { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
  ...(init ? {
    9: { class_type: 'LoadImage', inputs: { image: initName } },
    10: { class_type: 'VAEEncode', inputs: { pixels: ['9', 0], vae: ['1', 2] } },
  } : {}),
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
  const body = { prompt: wf };
  if (engine === 'gpt') {
    const key = comfyKey();
    if (!key) throw new Error('COMFY_API_KEY is not set (environment variable or .env)');
    body.extra_data = { api_key_comfy_org: key };
  }
  const { prompt_id } = JSON.parse(await req('POST', '/prompt', body));
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
