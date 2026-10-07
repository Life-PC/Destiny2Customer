#!/usr/bin/env node
/* Generate an image with the local ComfyUI (API at 127.0.0.1:8188) and save it.
 *   node tools/comfy-gen.js <out.png> "<prompt>" [--neg "..."] [--w 512] [--h 768] [--seed N] [--steps 26]
 *                           [--cfg 7] [--lora 0.8] [--ckpt DreamShaper_8_pruned.safetensors]
 *                           [--init base.png --denoise 0.6]   (img2img: redraw an existing image)
 *   GPT Image via ComfyUI API nodes (Comfy.org credits; key in env COMFY_API_KEY or .env):
 *   node tools/comfy-gen.js <out.png> "<prompt>" --engine gpt [--ref a.jpg --ref b.jpg ...]
 *                           [--model gpt-image-2] [--quality low|medium|high] [--size 1024x1536] [--bg transparent]
 * Uses SD1.5 (DreamShaper 8) + PixelArtRedmond LoRA by default.
 *   SDXL presets (--preset <name>; any explicit option still wins):
 *     xl       DreamShaper XL Lightning, 6 steps, no LoRA          (fast fantasy / game art)
 *     xlpixel  DreamShaper XL Lightning + Pixel Art XL LoRA        (detailed pixel art)
 *     jugg     Juggernaut XL v9, 30 steps, no LoRA                 (painterly / realistic, slow)
 *   [--sampler dpmpp_2m] [--scheduler karras] [--lora 0 = no LoRA]
 *   Likeness from reference images (IP-Adapter, SDXL presets only; needs ComfyUI_IPAdapter_plus):
 *     --ipref <img> [--ipref <img2> ...] [--ipw 0.8] [--ipend 0.9]   the refs' look is copied into the result
 *     --ipmask <img>:<mask.png> ...   per-region references: each ref only influences where its mask is white
 *                                     (armor pieces: helmet → head area, chest → torso area, ...) */
const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
const PRESETS = {
  xlpixel8: { ckpt: 'DreamShaperXL_Lightning.safetensors', unet: 'DreamShaperXL_Lightning_unet_fp8.safetensors', steps: 8, cfg: 2, sampler: 'dpmpp_sde', scheduler: 'karras', loraName: 'pixel-art-xl.safetensors', lora: 1, w: 1024, h: 1024 },   // same look as xlpixel, fp8 UNet
  xl: { ckpt: 'DreamShaperXL_Lightning.safetensors', steps: 6, cfg: 2, sampler: 'dpmpp_sde', scheduler: 'karras', lora: 0, w: 1344, h: 768 },
  xlpixel: { ckpt: 'DreamShaperXL_Lightning.safetensors', steps: 8, cfg: 2, sampler: 'dpmpp_sde', scheduler: 'karras', loraName: 'pixel-art-xl.safetensors', lora: 1, w: 1344, h: 768 },
  // SD1.5 fits entirely in 4GB VRAM: ~20x faster than SDXL on a GTX 1650. Pixel LoRA + a few-step speed LoRA.
  sd15hyper: { ckpt: 'DreamShaper_8_pruned.safetensors', steps: 8, cfg: 1, sampler: 'euler', scheduler: 'sgm_uniform', loraName: 'PixelArtRedmond15V-PixelArt-PIXARFK.safetensors', lora: 0.8, lora2Name: 'Hyper-SD15-8steps-lora.safetensors', lora2: 1, w: 768, h: 768 },
  sd15lcm: { ckpt: 'DreamShaper_8_pruned.safetensors', steps: 8, cfg: 1.2, sampler: 'lcm', scheduler: 'sgm_uniform', loraName: 'PixelArtRedmond15V-PixelArt-PIXARFK.safetensors', lora: 0.8, lora2Name: 'lcm-lora-sdv1-5.safetensors', lora2: 1, w: 768, h: 768 },
  jugg: { ckpt: 'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors', steps: 30, cfg: 4.5, sampler: 'dpmpp_2m_sde', scheduler: 'karras', lora: 0, w: 1344, h: 768 },
};
const preset = (() => { const i = args.indexOf('--preset'); return i >= 0 ? PRESETS[args[i + 1]] || {} : {}; })();
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : (k in preset ? preset[k] : d); };
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
const iprefs = args.flatMap((a, i) => (a === '--ipref' ? [args[i + 1]] : []));
const ipmasks = args.flatMap((a, i) => (a === '--ipmask' ? [args[i + 1].split(/:(?=[^:]*$)/)] : []));   // [ref, mask]
const ipW = +opt('ipw', 0.8), ipEnd = +opt('ipend', 0.9);
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
const lora2 = opt('lora2Name', null), lora2W = +opt('lora2', 0);
// --unet <file in diffusion_models> [--unetDtype fp8_e4m3fn]: load the denoiser separately (fp8 halves VRAM so SDXL fits in 4GB);
// text encoders and VAE still come from the checkpoint
const unet = opt('unet', null);
const BASE = unet ? '1u' : '1';
const MC = lora2 && lora2W ? '2b' : loraW ? '2' : '1';   // clip source
const MM = lora2 && lora2W ? '2b' : loraW ? '2' : BASE;  // model source
const ipRegional = opt('ipmode', 'chain') === 'regional';   // one adapter patch with per-region params (lighter than chaining)
const MODEL = ipmasks.length ? (ipRegional ? 'ipfp' : 'ipm' + (ipmasks.length - 1)) : iprefs.length ? 'ipa' : MM;   // the sampler takes the IP-Adapter-patched model when refs are given
const wf = engine === 'gpt' ? gptWf() : {
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
  ...(unet ? { '1u': { class_type: 'UNETLoader', inputs: { unet_name: unet, weight_dtype: opt('unetDtype', 'fp8_e4m3fn') } } } : {}),
  // --lora 0 → no LoRA node (an SD1.5 LoRA cannot be applied to an SDXL checkpoint)
  ...(loraW ? { 2: { class_type: 'LoraLoader', inputs: { model: [BASE, 0], clip: ['1', 1], lora_name: lora, strength_model: loraW, strength_clip: loraW } } } : {}),
  ...(lora2 && lora2W ? { '2b': { class_type: 'LoraLoader', inputs: { model: [loraW ? '2' : BASE, 0], clip: [loraW ? '2' : '1', 1], lora_name: lora2, strength_model: lora2W, strength_clip: lora2W } } } : {}),
  3: { class_type: 'CLIPTextEncode', inputs: { clip: [MC, 1], text: prompt } },
  4: { class_type: 'CLIPTextEncode', inputs: { clip: [MC, 1], text: neg } },
  5: { class_type: 'EmptyLatentImage', inputs: { width: W, height: H, batch_size: 1 } },
  6: { class_type: 'KSampler', inputs: { model: [MODEL, 0], positive: ['3', 0], negative: ['4', 0], latent_image: init ? ['10', 0] : ['5', 0],
    seed, steps: +opt('steps', 26), cfg: +opt('cfg', 7), sampler_name: opt('sampler', 'dpmpp_2m'), scheduler: opt('scheduler', 'karras'), denoise: init ? +opt('denoise', 0.6) : 1 } },
  7: { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
  ...(ipmasks.length ? (() => {
    // chained IP-Adapters, each limited to its region by an attention mask
    const w = { ipl: { class_type: 'IPAdapterUnifiedLoader', inputs: { model: [MM, 0], preset: opt('ippreset', 'PLUS (high strength)') } } };   // --ippreset "STANDARD (medium strength)" = lighter, faster
    if (ipRegional) {
      const params = {};
      ipmasks.forEach(([ref, mask], i) => {
        w['ipmr' + i] = { class_type: 'LoadImage', inputs: { image: toInput(ref) } };
        w['ipmm' + i] = { class_type: 'LoadImageMask', inputs: { image: toInput(mask), channel: 'red' } };
        w['iprc' + i] = { class_type: 'IPAdapterRegionalConditioning', inputs: { image: ['ipmr' + i, 0], mask: ['ipmm' + i, 0], image_weight: ipW, prompt_weight: 1.0, weight_type: 'linear', start_at: 0, end_at: ipEnd } };
        params['params_' + (i + 1)] = ['iprc' + i, 0];
      });
      w.ipcp = { class_type: 'IPAdapterCombineParams', inputs: params };
      w.ipfp = { class_type: 'IPAdapterFromParams', inputs: { model: ['ipl', 0], ipadapter: ['ipl', 1], ipadapter_params: ['ipcp', 0], combine_embeds: 'concat', embeds_scaling: 'V only' } };
      return w;
    }
    let model = ['ipl', 0];
    ipmasks.forEach(([ref, mask], i) => {
      w['ipmr' + i] = { class_type: 'LoadImage', inputs: { image: toInput(ref) } };
      w['ipmm' + i] = { class_type: 'LoadImageMask', inputs: { image: toInput(mask), channel: 'red' } };
      w['ipm' + i] = { class_type: 'IPAdapterAdvanced', inputs: { model, ipadapter: ['ipl', 1], image: ['ipmr' + i, 0], attn_mask: ['ipmm' + i, 0],
        weight: ipW, weight_type: 'linear', combine_embeds: 'concat', start_at: 0, end_at: ipEnd, embeds_scaling: 'V only' } };
      model = ['ipm' + i, 0];
    });
    return w;
  })() : {}),
  ...(iprefs.length && !ipmasks.length ? (() => {
    const w = { ipl: { class_type: 'IPAdapterUnifiedLoader', inputs: { model: [MM, 0], preset: 'PLUS (high strength)' } } };
    iprefs.forEach((f, i) => { w['ipr' + i] = { class_type: 'LoadImage', inputs: { image: toInput(f) } }; });
    let img = ['ipr0', 0];
    for (let i = 1; i < iprefs.length; i++) { w['ipb' + i] = { class_type: 'ImageBatch', inputs: { image1: img, image2: ['ipr' + i, 0] } }; img = ['ipb' + i, 0]; }
    w.ipa = { class_type: 'IPAdapter', inputs: { model: ['ipl', 0], ipadapter: ['ipl', 1], image: img, weight: ipW, start_at: 0, end_at: ipEnd, weight_type: 'standard' } };
    return w;
  })() : {}),
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
