/* D2 MOBIUS — game: data, save, hub screens, battle engine (Mobius FF style) */
(function () {
  'use strict';
  const { DT_ELEMENT, ELEMENT_NAME, CLASS_NAME } = Content;
  const BUNGIE = 'https://www.bungie.net';
  const API_KEY = '175c13fb6427478d80c153c6c52ccb9d';
  const CLIENT_ID = '39538';
  const SAVE_KEY = 'd2mobius_save_v1';

  // Armor stats (2026 armor 3.0)
  const STAT = { hp: 392767087, melee: 4244567218, grenade: 1735777505, super: 144602215, cls: 1943323491, weapons: 2996146975 };
  const STAT_LABEL = { hp: '体力', melee: '近接', grenade: 'グレネード', super: 'スーパー', cls: 'クラス', weapons: '武器' };
  const W_IMPACT = 4043523819;
  const BUCKET = { kin: 1498876634, ene: 2465295065, pow: 953998645, head: 3448274439, arms: 3551918588, chest: 14239492, legs: 20886954, cls: 1585787867 };
  const SLOT_ORDER = ['kin', 'ene', 'pow', 'head', 'arms', 'chest', 'legs', 'cls'];
  const SLOT_NAME = { kin: 'キネティック', ene: 'エネルギー', pow: 'パワー', head: '頭', arms: '腕', chest: '胴体', legs: '脚', cls: 'クラス装備' };
  const ARMOR_SLOTS = ['head', 'arms', 'chest', 'legs', 'cls'];
  const SLOT_OF_BUCKET = Object.fromEntries(Object.entries(BUCKET).map(([k, v]) => [v, k]));
  const CLASS_KEY = ['titan', 'hunter', 'warlock'];
  const MAX_ORBS = 16;

  // Logical battle canvas size (rendered at 3x internally)
  const VW = 320, VH = 180, RS = 3;

  /* ===================== helpers ===================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = n => Math.floor(Math.random() * n);
  const pick = arr => arr[rand(arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const img = p => p ? BUNGIE + p : '';
  const app = () => $('#app');
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ===================== manifest ===================== */
  // Shares the IndexedDB cache with the ARMORY page (same origin, same DB/key)
  const DB_NAME = 'd2armory', STORE = 'cache';
  function idbOpen() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    try {
      return await new Promise((res, rej) => {
        const q = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        q.onsuccess = () => res(q.result?.value); q.onerror = () => rej(q.error);
      });
    } finally { db.close(); }
  }
  async function idbReplace(key, value) {
    const db = await idbOpen();
    try {
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        st.clear(); st.put({ key, value });
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } finally { db.close(); }
  }
  async function loadManifest(onMsg) {
    const SCHEMA = D2Trim.SCHEMA;
    const cached = await idbGet('manifest').catch(() => null);
    let remote = null;
    try { const r = await fetch('../data/manifest-version.json', { cache: 'no-store' }); if (r.ok) remote = await r.json(); } catch {}
    if (cached && cached.schema === SCHEMA && (!remote || remote.version === cached.version)) return cached;
    if (!remote) throw new Error('マニフェストを取得できませんでした');
    if (remote.schema !== SCHEMA) throw new Error(`データ形式が古いです(schema ${remote.schema} / 必要 ${SCHEMA})。少し待ってから再読み込みしてください。`);
    onMsg('マニフェスト ダウンロード中...');
    const res = await fetch(`../data/manifest-${remote.lang || 'ja'}.json?v=${encodeURIComponent(remote.version)}`);
    const m = await res.json();
    idbReplace('manifest', m).catch(e => console.warn('cache save failed', e));
    return m;
  }

  const Data = { byHash: new Map(), plugs: new Map(), plugSets: new Map(), sets: {}, acts: new Map(), pool: {}, subclasses: [], glimmerIcon: '', ghosts: [], ghostByHash: new Map() };
  function indexManifest(m) {
    Data.byHash = new Map(m.items.map(i => [i.h, i]));
    Data.plugs = new Map(Object.entries(m.plugs).map(([k, v]) => [+k, v]));
    Data.plugSets = new Map(Object.entries(m.plugSets).map(([k, v]) => [+k, v]));
    Data.sets = m.itemSets || {};
    for (const a of m.activities || []) if (!Data.acts.has(a.n)) Data.acts.set(a.n, a);
    Data.glimmerIcon = m.misc?.glimmer?.i || '';
    const seen = new Set();
    for (const it of m.items) {
      if (!(it.tt >= 2 && it.tt <= 6)) continue;
      const slot = SLOT_OF_BUCKET[it.bk];
      if (!slot || (it.it === 3 && !it.st) || (it.it !== 2 && it.it !== 3)) continue;
      const key = `${it.n}|${it.bk}|${it.cl ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (Data.pool[slot] ||= []).push(it);
    }
    Data.subclasses = m.items.filter(i => i.it === 16 && i.cl >= 0 && i.cl <= 2 && (i.sk || []).length >= 5);
    Data.ghosts = m.ghosts || [];
    Data.ghostByHash = new Map(Data.ghosts.map(gh => [gh.h, gh]));
  }
  function activityFor(name) {
    if (!name) return null;
    return Data.acts.get(name) || [...Data.acts.values()].find(a => a.n.startsWith(name)) || null;
  }

  /* ===================== subclass / jobs ===================== */
  const ABIL_KINDS = [
    { k: 'sup', n: 'スーパー', re: /スーパー/ },
    { k: 'cls', n: 'クラスアビリティ', re: /クラススキル/ },
    { k: 'mov', n: '移動スキル', re: /移動スキル/ },
    { k: 'mel', n: '近接', re: /近接/ },
    { k: 'gre', n: 'グレネード', re: /グレネード/ },
  ];
  function subclassAbilities(sub) {
    const out = {};
    for (const se of sub.sk || []) {
      const hs = Data.plugSets.get(se.ps) || Data.plugSets.get(se.rp) || se.r || (se.s ? [se.s] : []);
      const plugs = hs.map(h => Data.plugs.get(h)).filter(p => p && !p.x);
      if (!plugs.length) continue;
      const kind = ABIL_KINDS.find(k => k.re.test(plugs[0].t || ''));
      if (kind && !out[kind.k]) out[kind.k] = plugs.filter(p => kind.re.test(p.t || ''));
    }
    return out;
  }
  function subElement(sub) {
    if (!sub) return 'light';
    if (/^プリズム/.test(sub.n)) return 'prism';
    return DT_ELEMENT[sub.dt] || 'light';
  }
  function plugElement(p, fallback) {
    const t = (p?.t || '') + (p?.n || '');
    if (/アーク/.test(t)) return 'arc';
    if (/ソーラー/.test(t)) return 'solar';
    if (/ボイド/.test(t)) return 'void';
    if (/ステイシス/.test(t)) return 'stasis';
    if (/ストランド/.test(t)) return 'strand';
    return fallback;
  }
  const jobById = id => S.jobs.find(j => j.id === id);
  const activeJob = () => jobById(S.activeJob) || S.jobs[0];
  // Job rarity: base-stat multiplier, level cap, release refund, pull weight
  const RARITY = {
    3: { mult: 1.0, maxLv: 20, refund: 50, w: 60 },
    4: { mult: 1.1, maxLv: 25, refund: 150, w: 30 },
    5: { mult: 1.25, maxLv: 30, refund: 400, w: 10 },
  };
  const jobMaxLv = j => RARITY[j.r || 3].maxLv;
  function rollRarity(min = 3) {
    const opts = [3, 4, 5].filter(r => r >= min);
    let x = Math.random() * opts.reduce((a, r) => a + RARITY[r].w, 0);
    for (const r of opts) { x -= RARITY[r].w; if (x <= 0) return r; }
    return opts[opts.length - 1];
  }
  // Random job: class -> subclass -> one random option per ability kind (Mobius-style job card)
  /* Job = random combination of SUBCLASS + MELEE + GRENADE + CLASS ABILITY + SUPER
   * (Mobius-style job card). Abilities are picked from the rolled subclass, as in D2.
   * Movement is the subclass default. The name is fixed per combination. */
  function rollJob(cls = rand(3), rarity = rollRarity()) {
    const sub = pick(Data.subclasses.filter(s => s.cl === cls));
    const ab = subclassAbilities(sub);
    const any = k => (ab[k]?.length ? pick(ab[k]) : null);
    const sup = any('sup'), cs = any('cls'), mel = any('mel'), gre = any('gre');
    const j = { id: 'j' + (S.nextId++), cl: cls, sub: sub.h, r: rarity, lv: 1, xp: 0,
      sup: sup?.h || 0, cls: cs?.h || 0, mel: mel?.h || 0, gre: gre?.h || 0, mov: ab.mov?.[0]?.h || 0 };
    j.name = Content.jobNameFor(cls, subElement(sub), sub, [sup, cs, mel, gre]);
    return j;
  }
  const jobKey = j => [j.cl, j.sub, j.sup, j.cls, j.mel, j.gre].join(':');
  // Adds a pulled job; a duplicate combination turns into EXP for the existing job
  function grantJob(j) {
    const dup = S.jobs.find(x => jobKey(x) === jobKey(j));
    if (!dup) { S.jobs.push(j); return { job: j, dup: false }; }
    const xp = 150 * (j.r || 3);
    dup.r = Math.max(dup.r || 3, j.r || 3);
    gainJobXp(dup, xp);
    return { job: dup, dup: true, xp };
  }
  function gainJobXp(job, xp) {
    job.xp = (job.xp || 0) + xp;
    let up = false;
    while (job.lv < jobMaxLv(job) && job.xp >= job.lv * 100) { job.xp -= job.lv * 100; job.lv++; up = true; }
    if (job.lv >= jobMaxLv(job)) job.xp = Math.min(job.xp, job.lv * 100);
    return up;
  }

  /* ===================== item rarity =====================
   * D2 tierType → ★: Basic(2)=★1, Common(3)=★2, Rare(4)=★3, Legendary(5)=★4, Exotic(6)=★5.
   * Duplicates limit-break (+5% each, max 4); an exotic at limit break 4 becomes ★6 (rainbow MAX). */
  const TIER = {
    2: { n: 'ベーシック', star: 1, mult: 0.8, stat: [18, 8] },
    3: { n: 'コモン', star: 2, mult: 0.9, stat: [28, 8] },
    4: { n: 'レア', star: 3, mult: 1.0, stat: [40, 10] },
    5: { n: 'レジェンダリー', star: 4, mult: 1.15, stat: [56, 14] },
    6: { n: 'エキゾチック', star: 5, mult: 1.3, stat: [66, 12] },
  };
  const MAX_LB = 4;
  const itemStars = (def, inv) => (TIER[def?.tt]?.star || 1) + (def?.tt === 6 && (inv?.lb || 0) >= MAX_LB ? 1 : 0);
  const itemMult = (def, inv) => (TIER[def?.tt]?.mult || 1) * (1 + 0.05 * (inv?.lb || 0));
  function weightedTier(weights) {
    let x = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [t, w] of Object.entries(weights)) { x -= w; if (x <= 0) return +t; }
    return +Object.keys(weights).pop();
  }
  // Gacha rates: ★2 45% / ★3 35% / ★4 17% / ★5 3%; minTier (10th pull) re-weights to ★3+
  const GACHA_TIERS = { 3: 45, 4: 35, 5: 17, 6: 3 };
  function rollGearItem(kind, forceExotic, minTier = 0) {
    if (kind === 'ghost') {
      const ex = forceExotic || Math.random() < 0.15;
      const pool = Data.ghosts.filter(gh => gh.tt === (ex ? 6 : 5));
      return pick(pool.length ? pool : Data.ghosts);
    }
    const w = Object.fromEntries(Object.entries(GACHA_TIERS).filter(([t]) => +t >= minTier));
    const tt = forceExotic ? 6 : weightedTier(w);
    const slot = pick(kind === 'weapon' ? ['kin', 'ene', 'pow'] : ARMOR_SLOTS);
    let pool = (Data.pool[slot] || []).filter(it => it.tt === tt);
    if (!pool.length) pool = (Data.pool[slot] || []).filter(it => it.tt >= 3);
    return pick(pool);
  }
  // Stage drop rarity rises with the stage level (no legendaries in the opening stages)
  function dropTable(st) {
    if (st.drop?.pool === 'exotic') return { w: { 6: 1 }, label: '★5' };
    const lv = st.lv;
    if (lv <= 1.5) return { w: { 3: 70, 4: 30 }, label: '★2〜★3' };
    if (lv <= 2.5) return { w: { 3: 40, 4: 50, 5: 10 }, label: '★2〜★4' };
    if (lv <= 4) return { w: { 4: 60, 5: 35, 6: 5 }, label: '★3〜★5' };
    return { w: { 4: 30, 5: 60, 6: 10 }, label: '★3〜★5' };
  }
  function rollDropItem(st) {
    const kind = st.drop.pool === 'exotic' ? (Math.random() < 0.5 ? 'weapon' : 'armor') : st.drop.pool;
    if (kind === 'armor') {   // armor drops are outfits for the current class; rarity rises with the stage
      const o = rollOutfit(activeJob().cl, st.drop.pool === 'exotic' ? 5 : st.lv > 4 ? rollRarity(4) : rollRarity());
      return o ? { outfit: o } : null;
    }
    const tt = weightedTier(dropTable(st).w);
    const slot = pick(kind === 'weapon' ? ['kin', 'ene', 'pow'] : ARMOR_SLOTS);
    const pool = (Data.pool[slot] || []).filter(it => it.tt === tt);
    return pick(pool.length ? pool : (Data.pool[slot] || []));
  }

  /* ===================== save ===================== */
  let S = null;
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { console.warn(e); } }
  function loadSave() {
    try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { S = null; }
    if (!S || S.v !== 1) S = null;
  }
  function newSave(cls) {
    S = { v: 1, glimmer: 1000, nextId: 1, inv: [], jobs: [], activeJob: null, loadout: { 0: {}, 1: {}, 2: {} }, cleared: {}, prologue: false, shards: {}, fav: {} };
    const j = rollJob(cls, 3);
    S.jobs.push(j); S.activeJob = j.id;
    // Starter weapons: primary-ammo kinetic + energy, any power weapon
    // Starter weapons are low rarity (★1〜★2); better gear comes from quests and engrams
    const starter = [
      ['kin', it => it.tt <= 3 && it.am === 1],
      ['ene', it => it.tt <= 3 && it.am === 1],
      ['pow', it => it.tt <= 3],
    ];
    for (const [slot, f] of starter) {
      const it = pick((Data.pool[slot] || []).filter(f)) || pick((Data.pool[slot] || []).filter(x => x.tt <= 4));
      if (it) { const inv = addItem(it, 'start'); equipWeapon(slot, inv.id); }
    }
    // Starter armor: one full legendary armor series per class (jobs of any class can be pulled)
    const starterGhost = pick(Data.ghosts.filter(gh => gh.tt === 5)) || Data.ghosts[0];
    if (starterGhost) S.ghost = addItem(starterGhost, 'start').id;
    ensureOutfits();
    save();
  }
  // Weapons are shared by all classes (as in Destiny 2); armor is per class
  const isWeaponSlot = slot => slot === 'kin' || slot === 'ene' || slot === 'pow';
  function equipWeapon(slot, id) { for (const c of [0, 1, 2]) { if (id) S.loadout[c][slot] = id; else delete S.loadout[c][slot]; } }
  // Starter armor: one ★1〜★2 piece per slot (armor series are legendary → a mid-game goal)
  function starterArmor(cls) {
    return ARMOR_SLOTS.map(slot => pick((Data.pool[slot] || []).filter(d => d.tt <= 3 && (d.cl === cls || d.cl === 3)))).filter(Boolean);
  }
  function starterArmorSet(cls) {
    const candidates = [];
    for (const [hash, set] of Object.entries(Data.sets)) {
      const bySlot = {};
      for (const h of set.items) {
        const d = Data.byHash.get(h);
        if (!d || d.it !== 2 || d.tt !== 5 || (d.cl !== cls && d.cl !== 3)) continue;
        const slot = SLOT_OF_BUCKET[d.bk];
        if (slot && !bySlot[slot]) bySlot[slot] = d;
      }
      if (ARMOR_SLOTS.every(s => bySlot[s])) candidates.push(ARMOR_SLOTS.map(s => bySlot[s]));
    }
    return candidates.length ? pick(candidates) : [];
  }
  function rollArmorStats(tt) {
    const [base, spread] = (TIER[tt] || TIER[4]).stat;
    const total = base + rand(spread);
    const keys = Object.values(STAT);
    const w = keys.map(() => Math.random() ** 2 + 0.08);
    const sum = w.reduce((a, b) => a + b, 0);
    const st = {};
    keys.forEach((k, i) => { st[k] = Math.min(30, Math.round(total * w[i] / sum)); });
    return st;
  }
  function addItem(def, src, extra = {}) {
    const inv = { id: 'i' + (S.nextId++), h: def.h, src, ...extra };
    if (def.it === 2 && !inv.st) inv.st = rollArmorStats(def.tt);
    S.inv.push(inv);
    return inv;
  }
  const invById = id => S.inv.find(x => x.id === id);
  // Gacha / drop: a duplicate of an owned item limit-breaks it instead of adding a copy
  function grantItem(def, src) {
    const own = S.inv.find(x => x.h === def.h && x.src !== 'd2' && (x.lb || 0) < MAX_LB);
    if (own && (def.it === 2 || def.it === 3)) { own.lb = (own.lb || 0) + 1; return { def, inv: own, dup: true }; }
    return { def, inv: addItem(def, src), dup: false };
  }

  /* ===================== outfits (armor) =====================
   * An OUTFIT = class + one legendary armor series (all 5 slots) + one exotic armor piece, drawn as ONE
   * character. Rolled like jobs (fixed name per combination) and replaces the 5 armor slots.
   * The series effect is always active; stats scale with the outfit rarity (★3-5) and limit breaks. */
  const OUTFIT_STAT = { 3: 150, 4: 185, 5: 220 };   // total armor stats before rarity / limit break
  const setCache = {};
  function outfitSets(cls) {
    if (setCache[cls]) return setCache[cls];
    const out = [];
    for (const [hash, set] of Object.entries(Data.sets)) {
      const bySlot = {};
      for (const h of set.items) {
        const d = Data.byHash.get(h);
        if (!d || d.it !== 2 || d.tt !== 5 || (d.cl !== cls && d.cl !== 3)) continue;
        const slot = SLOT_OF_BUCKET[d.bk];
        if (slot && !bySlot[slot]) bySlot[slot] = d;
      }
      if (ARMOR_SLOTS.every(sl => bySlot[sl])) out.push(hash);
    }
    return (setCache[cls] = out);
  }
  const outfitExotics = cls => ARMOR_SLOTS.flatMap(sl => (Data.pool[sl] || []).filter(d => d.tt === 6 && d.cl === cls));
  function rollOutfit(cls = rand(3), r = rollRarity()) {
    const set = pick(outfitSets(cls)), ex = pick(outfitExotics(cls));
    if (!set || !ex) return null;
    const keys = Object.keys(STAT), w = keys.map(() => Math.random() ** 2 + 0.15), sum = w.reduce((a, b) => a + b, 0);
    const st = Object.fromEntries(keys.map((k, i) => [k, Math.round(OUTFIT_STAT[r] * w[i] / sum)]));
    return { id: 'o' + (S.nextId++), cl: cls, set, ex: ex.h, r, lb: 0, st };
  }
  const outfitKey = o => [o.cl, o.set, o.ex].join(':');
  // A duplicate combination limit-breaks the owned outfit (and keeps the higher rarity)
  function grantOutfit(o) {
    S.outfits ||= [];
    const dup = S.outfits.find(x => outfitKey(x) === outfitKey(o));
    if (!dup) { S.outfits.push(o); return { outfit: o, dup: false }; }
    if (o.r > dup.r) { dup.r = o.r; dup.st = o.st; }
    dup.lb = Math.min(MAX_LB, (dup.lb || 0) + 1);
    return { outfit: dup, dup: true };
  }
  const outfitById = id => (S.outfits || []).find(o => o.id === id);
  const equippedOutfit = cls => outfitById(S.outfit?.[cls]);
  function outfitInfo(o) {
    const set = Data.sets[o.set], ex = Data.byHash.get(o.ex);
    const pieces = {};
    for (const h of set?.items || []) {
      const d = Data.byHash.get(h);
      if (d && d.it === 2 && (d.cl === o.cl || d.cl === 3)) { const sl = SLOT_OF_BUCKET[d.bk]; if (sl && !pieces[sl]) pieces[sl] = d; }
    }
    if (ex) pieces[SLOT_OF_BUCKET[ex.bk]] = ex;   // the exotic takes its slot
    return {
      set, ex, pieces, effect: set ? Content.setEffectFor(o.set, set.n) : null,
      name: `${set?.n || '?'}・${ex?.n || '?'}`,
      stars: (o.r || 3) + ((o.lb || 0) >= MAX_LB ? 1 : 0),
      mult: RARITY[o.r || 3].mult * (1 + 0.05 * (o.lb || 0)),
      art: Content.outfitArt ? Content.outfitArt(o, set, ex) : null,
    };
  }
  // Starter outfits (★3) for every class; also migrates saves from the 5-slot armor era
  function ensureOutfits() {
    S.outfits ||= []; S.outfit ||= {};
    for (const c of [0, 1, 2]) {
      if (equippedOutfit(c)) continue;
      const o = rollOutfit(c, 3);
      if (o) { S.outfits.push(o); S.outfit[c] = o.id; }
    }
  }
  const outfitUrls = oi => Object.fromEntries(ARMOR_SLOTS.map(sl => [sl, oi.pieces[sl]?.i ? img(oi.pieces[sl].i) : null]));
  // Guardian sprite in the outfit's colors (async: the colors come from the API armor icons)
  async function outfitSprite(o, element) {
    const oi = outfitInfo(o);
    let pal = {};
    try { pal = await Sprites.guardianSlotPal(o.cl, outfitUrls(oi)); } catch { }
    return Sprites.guardianSprite(o.cl, element, pal);
  }

  /* ===================== player build ===================== */
  function equippedItems(cls) {
    const lo = S.loadout[cls] || {};
    const out = {};
    for (const slot of SLOT_ORDER) {
      const inv = invById(lo[slot]);
      const def = inv && Data.byHash.get(inv.h);
      if (def) out[slot] = { inv, def };
    }
    return out;
  }
  function armorTotals(items) {
    const t = Object.fromEntries(Object.keys(STAT).map(k => [k, 0]));
    for (const s of ARMOR_SLOTS) {
      const x = items[s];
      if (!x) continue;
      for (const k in STAT) t[k] += x.inv.st?.[STAT[k]] || 0;
    }
    return t;
  }
  // Full armor series check: all armor slots the series has for this class must be equipped
  function setStatus(items, cls) {
    const counts = new Map();
    for (const s of ARMOR_SLOTS) {
      const set = items[s]?.def.set;
      if (set) counts.set(set, (counts.get(set) || 0) + 1);
    }
    let best = null;
    for (const [hash, count] of counts) {
      const def = Data.sets[hash];
      if (!def) continue;
      const slots = new Set(def.items.map(h => Data.byHash.get(h)).filter(d => d && (d.cl === cls || d.cl === 3)).map(d => SLOT_OF_BUCKET[d.bk]).filter(Boolean));
      const need = Math.max(slots.size, 1);
      const effect = Content.setEffectFor(hash, def.n);
      const st = { hash, name: def.n, count, need, effect, active: count >= need };
      if (!best || st.count > best.count) best = st;
    }
    return best;
  }
  function buildPlayer() {
    const job = activeJob();
    const cls = job.cl;
    const items = equippedItems(cls);
    const outfit = equippedOutfit(cls), oi = outfit ? outfitInfo(outfit) : null;
    const stats = Object.fromEntries(Object.keys(STAT).map(k => [k, Math.round((outfit?.st?.[k] || 0) * (oi?.mult || 1))]));
    const set = oi?.effect ? { name: oi.set.n, effect: oi.effect, active: true } : null;
    const fx = set ? set.effect.id : null;
    const lv = job.lv || 1;
    const sub = Data.byHash.get(job.sub);
    const element = subElement(sub);
    const ghostInv = invById(S.ghost);
    const ghost = ghostInv ? Data.ghostByHash.get(ghostInv.h) : null;
    const gp = new Set(ghost ? Content.ghostPerksFor(ghost.h, ghost.tt).map(x => x.id) : []);
    const pb = panelBonus(job);
    const aw = 1 + pb.awaken / 100;
    const p = {
      cls, job, items, outfit, oi, stats, set, fx, lv, sub, element, ghost, gp,
      maxHp: Math.round(((1000 + stats.hp * 8 + lv * 30) * RARITY[job.r || 3].mult * (gp.has('hp') ? 1.08 : 1) + (fx === 'hp' ? 100 : 0) + pb.hp) * aw),
      atk: Math.round(((100 + lv * 6) * RARITY[job.r || 3].mult + pb.atk) * aw),
      elBoost: pb.el / 100,
      dr: Math.min(0.3, stats.hp / 400) + (fx === 'dr' ? 0.1 : 0),
      crit: 0.08 + (fx === 'crit' ? 0.1 : 0) + (gp.has('crit') ? 0.05 : 0) + pb.crit / 100,
      evade: job.mov ? 0.06 : 0,
      superRate: (1 + stats.super / 100) * (gp.has('super') ? 1.15 : 1),
      healMult: (fx === 'heal' ? 1.3 : 1) * (gp.has('heal') ? 1.25 : 1),
      brkMult: (fx === 'brk' ? 1.25 : 1) * (gp.has('brk') ? 1.1 : 1) * (1 + pb.brk / 100),
      orbs: [], superG: fx === 'super' ? 30 : 0, buffs: {},
      abil: {},
    };
    for (const k of ABIL_KINDS) p.abil[k.k] = Data.plugs.get(job[k.k]) || null;
    p.hp = p.maxHp;
    return p;
  }
  function weaponImpact(def) { return def?.st?.[W_IMPACT] || 60; }
  /* Firing pattern from the weapon's intrinsic frame description
   * (e.g. パルスライフル「アグレッシブバースト」:「4点バースト」→ 4 shots per attack). */
  const INTRINSIC_CAT = 3956125808;
  function weaponFire(def) {
    if (!def) return { shots: 1, mode: 'single', frame: null };
    let frame = null;
    for (const c of def.sc || []) {
      if (c.h !== INTRINSIC_CAT) continue;
      const se = def.sk?.[c.i[0]];
      frame = Data.plugs.get(se?.s || se?.r?.[0]) || null;
    }
    const text = `${frame?.n || ''} ${frame?.d || ''}`;
    const t = def.is;
    const m = text.match(/([0-9０-９]+)\s*点バースト/) || text.match(/([0-9０-９]+)\s*連射/);
    let shots = 1, mode = 'single';
    if (m) { shots = Math.min(6, +m[1].replace(/[０-９]/g, d => '０１２３４５６７８９'.indexOf(d))); mode = 'burst'; }
    else if (/ダブルファイア|2連/.test(text)) { shots = 2; mode = 'burst'; }
    else if ([6, 8, 24].includes(t)) { shots = 5; mode = 'auto'; }
    else if (t === 13) { shots = 3; mode = 'burst'; }
    else if (t === 25) { shots = 6; mode = 'beam'; }
    else if (t === 7) mode = 'spread';
    else if (t === 11 || t === 22) { shots = t === 11 ? 5 : 3; mode = 'charge'; }
    else if (t === 31) mode = 'arrow';
    else if (t === 18 || t === 33) mode = 'blade';
    else if (t === 10 || t === 23) mode = 'explosive';
    return { shots, mode, frame };
  }
  function buildCards(p) {
    const C = {};
    const costEl = e => (e === 'prism' ? 'any' : e);
    const { gre, mel, cls } = p.abil;
    const kin = p.items.kin?.def;
    C.kin = { id: 'kin', name: kin?.n || '素手', icon: kin?.i, cost: {}, kind: 'normal', el: DT_ELEMENT[kin?.dt] || 'kin', fire: weaponFire(kin) };
    const ene = p.items.ene?.def;
    if (ene) {
      const e = DT_ELEMENT[ene.dt] || 'kin';
      const special = ene.am === 2;
      C.ene = { id: 'ene', name: ene.n, icon: ene.i, el: e, cost: { [e]: special ? 3 : 2 }, kind: 'atk', fire: weaponFire(ene),
        mult: (special ? 2.8 : 1.6) * (0.6 + weaponImpact(ene) / 100) * (1 + p.stats.weapons / 150) * itemMult(ene, p.items.ene.inv), brk: special ? 18 : 12 };
    }
    const pow = p.items.pow?.def;
    if (pow) {
      const e = DT_ELEMENT[pow.dt] || 'kin';
      C.pow = { id: 'pow', name: pow.n, icon: pow.i, el: e, cost: { any: 5 }, kind: 'atk', fire: weaponFire(pow),
        mult: 4.2 * (0.6 + weaponImpact(pow) / 120) * (1 + p.stats.weapons / 150) * itemMult(pow, p.items.pow.inv), brk: 30 };
    }
    if (mel) {
      const e = plugElement(mel, p.element);
      C.mel = { id: 'mel', name: mel.n, icon: mel.i, el: e, cost: { [costEl(e)]: 2 }, kind: 'atk', mult: 2.6 * (1 + p.stats.melee / 100), brk: 22 };
    }
    if (gre) {
      const e = plugElement(gre, p.element);
      C.gre = { id: 'gre', name: gre.n, icon: gre.i, el: e, cost: { [costEl(e)]: 3 }, kind: 'atk', aoe: true, mult: 1.5 * (1 + p.stats.grenade / 100), brk: 14 };
    }
    if (cls) C.cls = { id: 'cls', name: cls.n, icon: cls.i, cost: { prism: 2 }, kind: 'class' };
    return C;
  }

  /* ===================== D2 import (uses ARMORY login) ===================== */
  function oauth() { try { return JSON.parse(localStorage.getItem('d2_oauth')); } catch { return null; } }
  async function accessToken() {
    const o = oauth();
    if (!o) return null;
    const now = Date.now();
    if (o.access && o.accessExp && now < o.accessExp) return o.access;
    if (o.refresh && o.refreshExp && now < o.refreshExp) {
      const res = await fetch(`${BUNGIE}/Platform/App/OAuth/Token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-API-Key': API_KEY },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: o.refresh, client_id: CLIENT_ID }).toString(),
      });
      const d = await res.json().catch(() => null);
      if (!d?.access_token) return null;
      const n = { ...o, access: d.access_token, accessExp: now + (d.expires_in || 3600) * 1000 - 60000 };
      if (d.refresh_token) { n.refresh = d.refresh_token; n.refreshExp = now + (d.refresh_expires_in || 7776000) * 1000 - 60000; }
      localStorage.setItem('d2_oauth', JSON.stringify(n));
      return n.access;
    }
    return null;
  }
  async function bungieApi(path) {
    const t = await accessToken();
    if (!t) throw new Error('ARMORY でログインしてください');
    const r = await fetch(BUNGIE + path, { headers: { 'X-API-Key': API_KEY, Authorization: 'Bearer ' + t } });
    const d = await r.json();
    if (d.ErrorCode !== 1) throw new Error(d.Message || 'API error');
    return d.Response;
  }
  async function importFromD2() {
    const m = await bungieApi('/Platform/User/GetMembershipsForCurrentUser/');
    const dm = m.destinyMemberships.find(x => x.membershipId === m.primaryMembershipId) || m.destinyMemberships[0];
    const prof = await bungieApi(`/Platform/Destiny2/${dm.membershipType}/Profile/${dm.membershipId}/?components=102,200,201,205,304`);
    const statsOf = iid => prof.itemComponents?.stats?.data?.[iid]?.stats;
    const have = new Set(S.inv.filter(x => x.iid).map(x => x.iid));
    let added = 0;
    const take = (it) => {
      if (!it.itemInstanceId) return null;
      const def = Data.byHash.get(it.itemHash);
      if (!def || (def.it !== 2 && def.it !== 3) || !SLOT_OF_BUCKET[def.bk]) return null;
      let inv = S.inv.find(x => x.iid === it.itemInstanceId);
      if (!inv) {
        const extra = { iid: it.itemInstanceId };
        if (def.it === 2) {
          const ls = statsOf(it.itemInstanceId) || {};
          extra.st = Object.fromEntries(Object.values(STAT).map(h => [h, ls[h]?.value || 0]));
        }
        inv = addItem(def, 'd2', extra);
        added++;
      }
      return { inv, def };
    };
    // Equipped gear → loadout of that class
    for (const cid in prof.characterEquipment?.data || {}) {
      const cls = prof.characters?.data?.[cid]?.classType;
      for (const it of prof.characterEquipment.data[cid].items) {
        const x = take(it);
        if (x && cls != null && cls <= 2) S.loadout[cls][SLOT_OF_BUCKET[x.def.bk]] = x.inv.id;
      }
    }
    for (const cid in prof.characterInventories?.data || {}) for (const it of prof.characterInventories.data[cid].items) take(it);
    for (const it of prof.profileInventory?.data?.items || []) take(it);
    save();
    return added;
  }

  /* ===================== screens ===================== */
  async function boot() {
    try {
      const m = await loadManifest(msg => { app().innerHTML = `<div class="loading">${esc(msg)}</div>`; });
      indexManifest(m);
    } catch (e) {
      console.error(e);
      app().innerHTML = `<div class="loading err">読み込み失敗\n${esc(e.message)}</div>`;
      return;
    }
    loadSave();
    if (S && !S.outfits) { ensureOutfits(); save(); }
    renderTop();
  }

  function spriteCanvas(src, scale, cls = '') {
    const c = document.createElement('canvas');
    c.width = src.width * scale; c.height = src.height * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    if (cls) c.className = cls;
    return c;
  }

  function renderTitle() {
    app().innerHTML = `
      <div class="title-screen">
        <div class="sub">DESTINY 2 × MOBIUS</div>
        <h1>D2 MOBIUS</h1>
        <div class="sub">― 光の環 ―</div>
        <p class="muted" style="max-width:420px;line-height:1.7">ベックスが作り出した時間の環「メビウス」。<br>閉じ込められた光の記録を取り戻すため、ガーディアンは再生された戦場へ向かう。</p>
        <div>クラスを選んでください</div>
        <div class="class-pick"></div>
        <a href="../" class="muted" style="font-size:12px">← ARMORY に戻る</a>
      </div>`;
    const wrap = $('.class-pick');
    [0, 1, 2].forEach(cls => {
      const b = el(`<button class="pbtn"></button>`);
      b.appendChild(spriteCanvas(Sprites.guardianSprite(cls, ['arc', 'solar', 'void'][cls]), 3));
      b.appendChild(document.createTextNode(CLASS_NAME[cls]));
      b.onclick = async () => {
        newSave(cls);
        await playDialog(Content.PROLOGUE, null);
        S.prologue = true; save();
        renderHub('story');
      };
      wrap.appendChild(b);
    });
  }

  /* ===================== hub (Mobius-style screens) =====================
   * Status bar on top, a title, the screen body, and vertical tabs on the right edge:
   * QUEST (stages) / JOB (job cards) / EQUIP (deck) / GACHA (engrams) / ETC.
   * Item images in the UI are the Bungie API images; battle uses pixel art. */
  let hubTab = 'home';
  const TABS = [['story', 'QUEST', 'クエスト'], ['job', 'JOB', 'ジョブカード'], ['gear', 'EQUIP', '装備編成'], ['engram', 'GACHA', 'エングラム'], ['menu', 'ETC', 'メニュー']];
  function updateGlimmer() { const g = $('#glim'); if (g) g.textContent = S.glimmer.toLocaleString(); }
  const tierCls = (def, inv) => 'tier' + itemStars(def, inv);
  const starText = (def, inv) => '★' + itemStars(def, inv);
  // An item card (API image) with a rarity frame
  function itemCard(def, inv, opts = {}) {
    const img2 = opts.art && def.s ? def.s : def.i;
    return `<div class="icard ${tierCls(def, inv)} ${opts.cls || ''}" ${opts.attrs || ''}>
      <img src="${img(img2)}" alt="${esc(def.n)}" loading="lazy">
      ${opts.label ? `<span class="tl">${esc(opts.label)}</span>` : ''}
      <span class="st">${starText(def, inv)}${inv?.lb ? `<small>+${inv.lb}</small>` : ''}</span>
      ${opts.badge ? `<span class="badge">${opts.badge}</span>` : ''}
    </div>`;
  }
  // Outfit card: the exotic's API icon with the series chest piece as a badge
  function outfitCardHtml(o, extra = '', attrs = '', badge = '') {
    const oi = outfitInfo(o);
    const others = Object.values(oi.pieces).filter(d => d !== oi.ex);
    const sub = others.find(d => SLOT_OF_BUCKET[d.bk] === 'chest') || others[0];
    return `<div class="icard outfit tier${oi.stars} ${extra}" ${attrs}>
      <img src="${img(oi.ex?.i)}" alt="${esc(oi.name)}">${sub ? `<img class="sub" src="${img(sub.i)}" alt="">` : ''}
      ${/sm/.test(extra) ? '' : `<span class="tl">${CLASS_NAME[o.cl]}</span>`}
      <span class="st">★${oi.stars}${o.lb ? `<small>+${o.lb}</small>` : ''}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</div>`;
  }
  function jobCardHtml(j, extra = '') {
    const e = subElement(Data.byHash.get(j.sub));
    return `<div class="icard job tier${(j.r || 3)} ${extra}" data-job="${j.id}"><canvas data-cls="${j.cl}" data-el="${e}"></canvas>
      <span class="tl">Lv.${j.lv}</span><span class="st">★${j.r || 3}</span></div>`;
  }
  function paintJobCanvases(root) {
    $$('canvas[data-cls]', root).forEach(c => {
      const s = Sprites.guardianSprite(+c.dataset.cls, c.dataset.el);
      c.width = s.width; c.height = s.height;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(s, 0, 0);
    });
  }
  function bigSprite(cls, el) { return spriteCanvas(Sprites.guardianSprite(cls, el), 4, 'mh-hero'); }

  /* ----- QUEST ----- */
  function stageUnlocked(i) {
    const st = Content.STAGES[i];
    if (st.farm) return !!S.cleared.s2;
    if (i === 0) return true;
    const prev = Content.STAGES.slice(0, i).filter(s => !s.farm).pop();
    return !!S.cleared[prev.id];
  }
  const FACTION = { hive: ['ハイヴ', '#5dd94a'], fallen: ['フォールン', '#79bbff'], vex: ['ベックス', '#b08d57'], cabal: ['カバル', '#9a2f2f'], taken: ['テイクン', '#e8f4ff'], holo: ['シミュレーション', '#8fe8ff'] };
  function renderStory(body, filter = () => true) {
    body.appendChild(el(`<div class="mh-chapter">第1章 光の環</div>`));
    Content.STAGES.forEach((st, i) => {
      if (!filter(st)) return;
      const act = activityFor(st.act);
      const open = stageUnlocked(i);
      const boss = Content.enemyDef(st.waves[st.waves.length - 1][0]);
      const [fn, fc] = FACTION[boss.fac] || ['?', '#888'];
      const dt = dropTable(st);
      const d = el(`<article class="quest ${open ? '' : 'locked'}">
        <div class="qb">${act ? `<img src="${img(act.img)}" alt="" loading="lazy">` : '<div class="grid-bg"></div>'}
          <div class="qshade"></div>
          <b class="qn">${esc(st.name)}</b>
          <span class="qf"><i style="background:${fc}"></i>${fn}</span>
          <span class="qt">${st.farm ? '周回' : st.no} ${'★'.repeat(Math.min(5, Math.ceil(st.lv)))}</span>
        </div>
        <div class="qi">
          <dl><dt>推奨Lv</dt><dd>: ${Math.round(st.lv * 3)}</dd><dt>バトル回数</dt><dd>: ${st.waves.length}</dd><dt>ドロップ</dt><dd>: ${dt.label}</dd></dl>
          ${S.cleared[st.id] ? '<span class="clear">CLEAR</span>' : ''}
          ${open ? '<button type="button" class="go">選択する</button>' : `<span class="lockmsg">前のクエストをクリアで解放</span>`}
        </div></article>`);
      if (open) d.querySelector('.go').onclick = () => startStage(st);
      body.appendChild(d);
    });
  }

  /* ----- JOB CARDS ----- */
  let viewJobId = null;
  function renderJobs(body) {
    const sorted = [...S.jobs].sort((a, b) => (b.r || 3) - (a.r || 3) || b.lv - a.lv);
    const view = jobById(viewJobId) || activeJob();
    viewJobId = view.id;
    const grid = el(`<div class="jgrid">${sorted.map(j => jobCardHtml(j, (j.id === view.id ? 'sel ' : '') + (j.id === S.activeJob ? 'act' : ''))).join('')}
      ${Array.from({ length: Math.max(0, 10 - sorted.length) }, () => '<div class="icard empty">?</div>').join('')}</div>`);
    paintJobCanvases(grid);
    $$('[data-job]', grid).forEach(c => c.onclick = () => { viewJobId = c.dataset.job; renderHub('job'); });
    body.appendChild(grid);
    const sub = Data.byHash.get(view.sub);
    const e = subElement(sub);
    body.appendChild(el(`<div class="jname"><b>${esc(view.name)}</b><span class="stars r${view.r || 3}">${'★'.repeat(view.r || 3)}</span><span class="muted">${CLASS_NAME[view.cl]} / ${esc(sub?.n || '?')}</span></div>`));
    const btns = el(`<div class="mh-row">
      ${view.id === S.activeJob ? '<span class="mh-chip on">使用中</span>' : '<button type="button" class="mbtn blue use">このジョブにする</button>'}
      <button type="button" class="mbtn blue info">アビリティ詳細</button>
      <button type="button" class="mbtn teal sp">スキルパネル</button></div>`);
    btns.querySelector('.use')?.addEventListener('click', () => { S.activeJob = view.id; save(); renderHub('job'); });
    btns.querySelector('.info').onclick = () => openJobDetail(view);
    btns.querySelector('.sp').onclick = () => openSkillPanel(view);
    body.appendChild(btns);
    body.appendChild(el(`<div class="jabil">${['sup', 'cls', 'mel', 'gre'].map(k => { const p = Data.plugs.get(view[k]); const kind = ABIL_KINDS.find(x => x.k === k); return p ? `<span><img src="${img(p.i)}" alt="">${kind.n}<b>${esc(p.n)}</b></span>` : ''; }).join('')}</div>`));
    const hero = el(`<div class="mh-stage"></div>`);
    hero.appendChild(outfitHero(equippedOutfit(view.cl), view.cl, e));
    body.appendChild(hero);
  }
  function abilityRow(job, k) {
    const p = Data.plugs.get(job[k]);
    const kind = ABIL_KINDS.find(x => x.k === k);
    return p ? `<div class="opt"><img src="${img(p.i)}"><div><div>${kind.n}: ${esc(p.n)}</div><div class="d">${esc(p.d || '')}</div></div></div>` : '';
  }
  function openJobDetail(job) {
    const m = el(`<div class="modal mob-modal"><div class="panel">
      <div class="row"><b>${esc(job.name)}</b><span class="grow"></span><button type="button" class="mbtn x">閉じる</button></div>
      <div class="muted" style="font-size:12px;margin:6px 0">${CLASS_NAME[job.cl]} · ★${job.r || 3} · Lv.${job.lv}/${jobMaxLv(job)} · EXP ${job.xp || 0}/${job.lv * 100}</div>
      ${['sup', 'cls', 'mel', 'gre', 'mov'].map(k => abilityRow(job, k)).join('')}
      ${S.jobs.length > 1 && job.id !== S.activeJob ? `<button type="button" class="mbtn red del" style="margin-top:10px">ジョブを解放(+${RARITY[job.r || 3].refund} グリマー)</button>` : ''}
    </div></div>`);
    m.querySelector('.x').onclick = () => m.remove();
    m.querySelector('.del')?.addEventListener('click', () => {
      if (!confirm(`ジョブ「${job.name}」を解放しますか?`)) return;
      S.jobs = S.jobs.filter(x => x !== job);
      S.glimmer += RARITY[job.r || 3].refund;
      viewJobId = null;
      save(); m.remove(); renderHub('job');
    });
    document.body.appendChild(m);
  }

  /* ----- SKILL PANEL (per job; unlocked with element shards from battles) ----- */
  const SHARD_NAME = { arc: 'アーク', solar: 'ソーラー', void: 'ボイド', stasis: 'ステイシス', strand: 'ストランド', light: '光' };
  function panelsFor(job) {
    const el0 = subElement(Data.byHash.get(job.sub));
    const sh = el0 === 'prism' || el0 === 'kin' ? 'light' : el0;
    const P = (type, v, cost, shard = sh) => ({ type, v, cost, shard });
    return [
      P('trait', 0, 0), P('atk', 5, 3), P('hp', 50, 3), P('brk', 3, 4, 'light'),
      P('brk', 5, 6), P('el', 5, 6), P('atk', 5, 6), P('crit', 3, 6, 'light'),
      P('hp', 100, 10), P('atk', 10, 10), P('el', 10, 12), P('crit', 5, 10, 'light'),
      P('hp', 150, 16), P('brk', 10, 16), P('el', 15, 20), P('awaken', 10, 30, 'light'),
    ];
  }
  const PANEL_LABEL = { trait: 'ジョブ特性', atk: '攻撃力', hp: 'HP', brk: 'ブレイク力', el: '属性強化', crit: 'クリティカル', awaken: '覚醒' };
  const panelValue = p => p.type === 'hp' || p.type === 'atk' ? `+${p.v}` : p.type === 'trait' ? '' : `+${p.v}%`;
  function panelBonus(job) {
    const b = { hp: 0, atk: 0, brk: 0, el: 0, crit: 0, awaken: 0 };
    const un = new Set(job.sp || [0]);
    panelsFor(job).forEach((p, i) => { if (un.has(i) && b[p.type] != null) b[p.type] += p.v; });
    return b;
  }
  function openSkillPanel(job) {
    S.shards ||= {};
    const m = el(`<div class="modal mob-modal sp-modal"><div class="panel"></div></div>`);
    const draw = () => {
      job.sp ||= [0];
      const un = new Set(job.sp);
      const P = panelsFor(job);
      const unlockedN = un.size;
      const canUnlock = i => !un.has(i) && (S.shards[P[i].shard] || 0) >= P[i].cost && (i !== 15 || unlockedN >= 12);
      const b = panelBonus(job);
      m.querySelector('.panel').innerHTML = `
        <div class="row"><b>スキルパネル</b><span class="muted" style="font-size:12px">${esc(job.name)}</span><span class="grow"></span><button type="button" class="mbtn x">BACK</button></div>
        <div class="shards">${Object.keys(SHARD_NAME).map(k => `<span><i style="background:${Sprites.ELEMENT_COLORS[k]}"></i>${SHARD_NAME[k]} <b>${String(S.shards[k] || 0).padStart(3, '0')}</b></span>`).join('')}</div>
        <div class="spgrid">${P.map((p, i) => un.has(i)
          ? `<button type="button" class="sp-cell on t-${p.type}" disabled><span>${PANEL_LABEL[p.type]}</span><b>${panelValue(p)}</b></button>`
          : `<button type="button" class="sp-cell lock ${canUnlock(i) ? 'can' : ''}" data-i="${i}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>${PANEL_LABEL[p.type]}${panelValue(p)}</span><small>${SHARD_NAME[p.shard]} ×${p.cost}${i === 15 ? ' · 12枚解放後' : ''}</small></button>`).join('')}</div>
        <div class="muted" style="font-size:12px;margin-top:10px">解放 ${unlockedN} / 16 · HP +${b.hp} / 攻撃力 +${b.atk} / ブレイク力 +${b.brk}% / 属性 +${b.el}% / クリティカル +${b.crit}%${b.awaken ? ' / 覚醒' : ''}</div>
        <button type="button" class="mbtn teal auto" style="width:100%;margin-top:10px">おまかせ解放</button>`;
      m.querySelector('.x').onclick = () => { m.remove(); renderHub(hubTab); };
      $$('.sp-cell[data-i]', m).forEach(c => c.onclick = () => {
        const i = +c.dataset.i;
        if (!canUnlock(i)) { toast(i === 15 && unlockedN < 12 ? '先に12枚解放してください' : `${SHARD_NAME[P[i].shard]}の欠片が足りません`); return; }
        S.shards[P[i].shard] -= P[i].cost; job.sp.push(i); save(); draw();
      });
      m.querySelector('.auto').onclick = () => {
        let n = 0, again = true;
        while (again) { again = false; for (let i = 0; i < 16; i++) if (canUnlock(i)) { S.shards[P[i].shard] -= P[i].cost; job.sp.push(i); un.add(i); n++; again = true; } }
        save(); draw(); toast(n ? `${n} 枚のパネルを解放しました` : '解放できるパネルがありません');
      };
    };
    draw();
    document.body.appendChild(m);
  }

  /* ----- EQUIP (deck) ----- */
  function renderGear(body) {
    const job = activeJob();
    const cls = job.cl;
    const items = equippedItems(cls);
    const p = buildPlayer();
    const stats = p.stats, set = p.set, outfit = p.outfit, oi = p.oi;
    const sub = Data.byHash.get(job.sub);
    const e = subElement(sub);
    const ginv = invById(S.ghost), gdef = ginv && Data.ghostByHash.get(ginv.h);
    const sup = Data.plugs.get(job.sup);
    const deck = el(`<section class="deck">
      <div class="dh"><span class="mh-chip">MAIN</span><span class="muted">${CLASS_NAME[cls]}</span><b class="dlv">Lv.${job.lv}</b></div>
      <div class="drow">
        <div class="dlab">ジョブ</div><div class="dlab span3">武器</div><div class="dlab">スーパー</div>
        ${jobCardHtml(job, 'dj')}
        ${['kin', 'ene', 'pow'].map(s => items[s] ? itemCard(items[s].def, items[s].inv, { label: SLOT_NAME[s], attrs: `data-slot="${s}"` }) : `<div class="icard empty" data-slot="${s}">+</div>`).join('')}
        <div class="icard abil">${sup ? `<img src="${img(sup.i)}" alt="${esc(sup.n)}">` : ''}</div>
      </div>
      <div class="arow"><span class="dlab">衣装</span>
        ${outfit ? outfitCardHtml(outfit, 'sm', 'data-slot="outfit"') : '<div class="icard sm empty" data-slot="outfit">+</div>'}
        <span class="oname">${oi ? esc(oi.name) : '衣装なし'}</span>
        <span class="dlab">ゴースト</span>
        ${gdef ? itemCard(gdef, ginv, { cls: 'sm', attrs: 'data-slot="ghost"' }) : '<div class="icard sm empty" data-slot="ghost">+</div>'}
      </div>
      <div class="dfoot">${set ? `シリーズ効果「${esc(set.effect.n)}」<b class="ok">発動中</b> · エキゾチック: ${esc(oi.ex?.n || '-')}` : '衣装を装備するとシリーズ効果が発動'}</div>
    </section>`);
    paintJobCanvases(deck);
    $$('[data-slot]', deck).forEach(c => c.onclick = () => c.dataset.slot === 'ghost' ? openGhostPicker() : c.dataset.slot === 'outfit' ? openOutfitPicker(cls) : openPicker(cls, c.dataset.slot));
    deck.querySelector('.dj').onclick = () => renderHub('job');
    body.appendChild(deck);
    const spb = el(`<div class="mh-row end"><button type="button" class="mbtn teal">スキルパネル</button></div>`);
    spb.querySelector('button').onclick = () => openSkillPanel(job);
    body.appendChild(spb);
    const stage = el(`<div class="mh-stage eq">
      <dl class="stats">
        <dt>メインジョブ</dt><dd>${esc(job.name)}</dd>
        <dt>エレメント</dt><dd><i class="eorb" style="background:${Sprites.ELEMENT_COLORS[e] || '#ccc'}"></i>${ELEMENT_NAME[e]}</dd>
        <dt>HP</dt><dd class="n">${p.maxHp.toLocaleString()}</dd>
        <dt>攻撃力</dt><dd class="n">${p.atk}</dd>
        <dt>ブレイク力</dt><dd class="n">${Math.round(p.brkMult * 100)}%</dd>
        <dt>クリティカル</dt><dd class="n">${Math.round(p.crit * 100)}%</dd>
        <dt>アーマー</dt><dd class="n sm">${Object.keys(STAT).map(k => `${STAT_LABEL[k]}${stats[k]}`).join(' ')}</dd>
      </dl></div>`);
    stage.appendChild(outfitHero(outfit, cls, e));
    body.appendChild(stage);
    const imp = el(`<div class="mh-row"><button type="button" class="mbtn blue">D2 の装備を取り込む</button><a href="../" class="muted" style="font-size:12px">ARMORY でログイン →</a></div>`);
    imp.querySelector('button').onclick = async ev => {
      ev.target.disabled = true; ev.target.textContent = '取り込み中...';
      try { const n = await importFromD2(); toast(`${n} 個のアイテムを取り込みました`); renderHub('gear'); }
      catch (err) { toast('取り込み失敗: ' + err.message); ev.target.disabled = false; ev.target.textContent = 'D2 の装備を取り込む'; }
    };
    body.appendChild(imp);
  }

  // Item list → card picker; tapping a card opens its detail (with 装備する)
  function openPicker(cls, slot) {
    const list = S.inv.map(inv => ({ inv, def: Data.byHash.get(inv.h) }))
      .filter(x => x.def && SLOT_OF_BUCKET[x.def.bk] === slot && (x.def.it === 3 || x.def.cl === cls || x.def.cl === 3))
      .sort((a, b) => (itemStars(b.def, b.inv) - itemStars(a.def, a.inv)) || a.def.n.localeCompare(b.def.n, 'ja'));
    const equip = x => { if (isWeaponSlot(slot)) equipWeapon(slot, x.inv.id); else S.loadout[cls][slot] = x.inv.id; save(); renderHub('gear'); };
    const m = el(`<div class="modal mob-modal"><div class="panel">
      <div class="row"><b>${SLOT_NAME[slot]}</b><span class="muted" style="font-size:12px">所持 ${list.length}</span><span class="grow"></span><button type="button" class="mbtn x">BACK</button></div>
      <div class="picker2">${list.map((x, i) => itemCard(x.def, x.inv, { attrs: `data-i="${i}"`, badge: x.inv.src === 'd2' ? 'D2' : '' })).join('')}</div>
      <div class="row" style="margin-top:10px"><button type="button" class="mbtn red un">外す</button></div></div></div>`);
    m.querySelector('.x').onclick = () => m.remove();
    m.querySelector('.un').onclick = () => { if (isWeaponSlot(slot)) equipWeapon(slot, null); else delete S.loadout[cls][slot]; save(); m.remove(); renderHub('gear'); };
    $$('[data-i]', m).forEach(c => c.onclick = () => openCardDetail(list, +c.dataset.i, x => { m.remove(); equip(x); }));
    document.body.appendChild(m);
  }
  // Hero sprite in the outfit's colors (filled in once the icon colors are known)
  function outfitHero(o, cls, element) {
    const c = bigSprite(cls, element);
    if (o) outfitSprite(o, element).then(sp => { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false; g.drawImage(sp, 0, 0, c.width, c.height); });
    return c;
  }
  function openOutfitPicker(cls) {
    const list = (S.outfits || []).filter(o => o.cl === cls)
      .sort((a, b) => outfitInfo(b).stars - outfitInfo(a).stars || outfitInfo(a).name.localeCompare(outfitInfo(b).name, 'ja'));
    const m = el(`<div class="modal mob-modal"><div class="panel">
      <div class="row"><b>衣装 (${CLASS_NAME[cls]})</b><span class="muted" style="font-size:12px">所持 ${list.length}</span><span class="grow"></span><button type="button" class="mbtn x">BACK</button></div>
      <div class="picker2">${list.map((o, i) => outfitCardHtml(o, o.id === S.outfit[cls] ? 'sel' : '', `data-i="${i}"`)).join('')}</div></div></div>`);
    m.querySelector('.x').onclick = () => m.remove();
    $$('[data-i]', m).forEach(c => c.onclick = () => openOutfitDetail(list, +c.dataset.i, o => { S.outfit[cls] = o.id; save(); m.remove(); renderHub('gear'); }));
    document.body.appendChild(m);
  }
  // Outfit detail: preview in its colors, the 5 pieces (API icons), series effect, exotic, stats
  function openOutfitDetail(list, index, onEquip) {
    let i = index;
    const m = el(`<div class="cdetail"></div>`);
    const draw = () => {
      const o = list[i], oi = outfitInfo(o);
      m.innerHTML = `
        <div class="ccard tier${oi.stars}">
          <div class="ch"><img src="${img(oi.ex?.i)}" alt=""><b>${esc(oi.name)}</b><span class="cs">${'★'.repeat(oi.stars)}</span></div>
          <div class="ca outfit-prev"></div>
          <div class="cb">
            <div class="ct">${CLASS_NAME[o.cl]} · 衣装${o.lb ? ` · 限界突破 ${o.lb}/${MAX_LB}` : ''}</div>
            <div class="opieces">${ARMOR_SLOTS.map(sl => oi.pieces[sl] ? `<span class="${oi.pieces[sl] === oi.ex ? 'isex' : ''}"><img src="${img(oi.pieces[sl].i)}" alt=""><small>${SLOT_NAME[sl]}</small></span>` : '').join('')}</div>
            ${oi.effect ? `<div class="cd set">シリーズ「${esc(oi.set.n)}」: ${esc(oi.effect.n)}</div>` : ''}
            ${oi.ex ? `<div class="cd">エキゾチック「${esc(oi.ex.n)}」${oi.ex.fx ? ' — ' + esc(oi.ex.fx) : ''}</div>` : ''}
            <div class="cgrid">${Object.keys(STAT).map(k => `<span>${esc(STAT_LABEL[k])}<b>${Math.round((o.st?.[k] || 0) * oi.mult)}</b></span>`).join('')}</div>
          </div>
        </div>
        <div class="cfoot">${onEquip ? '<button type="button" class="mbtn teal eq">装備する</button>' : ''}</div>
        <button type="button" class="side back">BACK</button>
        <button type="button" class="side prev" ${i === 0 ? 'disabled' : ''}>Prev Card</button>
        <button type="button" class="side next" ${i === list.length - 1 ? 'disabled' : ''}>Next Card</button>`;
      const prev = m.querySelector('.outfit-prev');
      if (oi.art?.preview) prev.innerHTML = `<img src="${oi.art.preview}" alt="${esc(oi.name)}" style="object-fit:contain">`;
      else prev.appendChild(outfitHero(o, o.cl, 'light'));
      m.querySelector('.back').onclick = () => m.remove();
      m.querySelector('.prev').onclick = () => { if (i > 0) { i--; draw(); } };
      m.querySelector('.next').onclick = () => { if (i < list.length - 1) { i++; draw(); } };
      m.querySelector('.eq')?.addEventListener('click', () => { m.remove(); onEquip(list[i]); });
    };
    draw();
    document.body.appendChild(m);
  }
  function openGhostPicker() {
    const list = S.inv.map(inv => ({ inv, def: Data.ghostByHash.get(inv.h) })).filter(x => x.def)
      .sort((a, b) => (b.def.tt - a.def.tt) || a.def.n.localeCompare(b.def.n, 'ja'));
    const m = el(`<div class="modal mob-modal"><div class="panel">
      <div class="row"><b>ゴースト</b><span class="muted" style="font-size:12px">所持 ${list.length}</span><span class="grow"></span><button type="button" class="mbtn x">BACK</button></div>
      <div class="picker2">${list.map((x, i) => itemCard(x.def, x.inv, { attrs: `data-i="${i}"` })).join('')}</div></div></div>`);
    m.querySelector('.x').onclick = () => m.remove();
    $$('[data-i]', m).forEach(c => c.onclick = () => openCardDetail(list, +c.dataset.i, x => { S.ghost = x.inv.id; save(); m.remove(); renderHub('gear'); }));
    document.body.appendChild(m);
  }
  // Card detail: framed card with the item's API screenshot (or icon), stars, description, stats
  function openCardDetail(list, index, onEquip) {
    S.fav ||= {};
    let i = index;
    const m = el(`<div class="cdetail"></div>`);
    const draw = () => {
      const { def, inv } = list[i];
      const isGhost = !def.it && Data.ghostByHash.has(def.h);
      const el0 = DT_ELEMENT[def.dt];
      const stars = itemStars(def, inv);
      const fire = def.it === 3 ? weaponFire(def) : null;
      const rows = def.it === 3
        ? [['威力', weaponImpact(def)], ['フレーム', fire.frame?.n || '-'], ['発射数', fire.shots], ['倍率', '×' + itemMult(def, inv).toFixed(2)]]
        : def.it === 2 ? Object.keys(STAT).map(k => [STAT_LABEL[k], inv.st?.[STAT[k]] || 0])
        : Content.ghostPerksFor(def.h, def.tt).map(q => ['効果', q.n]);
      const setN = def.set && Data.sets[def.set] ? `シリーズ「${Data.sets[def.set].n}」フルセット: ${Content.setEffectFor(def.set, Data.sets[def.set].n).n}` : '';
      m.innerHTML = `
        <div class="ccard tier${stars}">
          <div class="ch"><img src="${img(def.i)}" alt=""><b>${esc(def.n)}</b><span class="cs">${'★'.repeat(stars)}</span></div>
          <div class="ca"><img src="${img(def.s || def.i)}" alt="${esc(def.n)}">${stars >= 5 ? `<span class="ex">${stars === 6 ? '★6 MAX' : 'EXOTIC'}</span>` : ''}</div>
          <div class="cb">
            <div class="ct">${esc(def.t || (isGhost ? 'ゴーストの外殻' : ''))}${el0 ? ` · <span style="color:${Sprites.ELEMENT_COLORS[el0]}">${ELEMENT_NAME[el0]}</span>` : ''} · ${TIER[def.tt]?.n || ''}${inv?.lb ? ` · 限界突破 ${inv.lb}/${MAX_LB}` : ''}</div>
            ${def.fx || def.d ? `<div class="cd">${esc(def.fx || def.d)}</div>` : ''}
            ${setN ? `<div class="cd set">${esc(setN)}</div>` : ''}
            <div class="cgrid">${rows.map(([k, v]) => `<span>${esc(k)}<b>${esc(v)}</b></span>`).join('')}</div>
          </div>
        </div>
        <div class="cfoot">
          ${onEquip ? '<button type="button" class="mbtn teal eq">装備する</button>' : ''}
          <button type="button" class="fav ${S.fav[inv.id] ? 'on' : ''}" aria-label="お気に入り"><span></span>お気に入り</button>
        </div>
        <button type="button" class="side back">BACK</button>
        <button type="button" class="side prev" ${i === 0 ? 'disabled' : ''}>Prev Card</button>
        <button type="button" class="side next" ${i === list.length - 1 ? 'disabled' : ''}>Next Card</button>`;
      m.querySelector('.back').onclick = () => m.remove();
      m.querySelector('.prev').onclick = () => { if (i > 0) { i--; draw(); } };
      m.querySelector('.next').onclick = () => { if (i < list.length - 1) { i++; draw(); } };
      m.querySelector('.fav').onclick = () => { S.fav[inv.id] = !S.fav[inv.id]; save(); draw(); };
      m.querySelector('.eq')?.addEventListener('click', () => { m.remove(); onEquip(list[i]); });
    };
    draw();
    document.body.appendChild(m);
  }

  /* ----- GACHA (glimmer only, no real money): job / armor / weapon / ghost ----- */
  const GACHA = {
    job:    { n: 'ジョブ', cost: 500, col: ['#c8901e', '#ffd36a'], desc: 'サブクラス・近接・グレネード・クラススキル・スーパーの組み合わせがランダムなジョブ。クラスも混合。', rates: '★5: 10% / ★4: 30% / ★3: 60% · 10回で★4以上1つ確定' },
    armor:  { n: '衣装', cost: 400, col: ['#2f6fc0', '#7ab0f0'], desc: '防具シリーズ×エキゾチック防具の組み合わせがランダムな衣装(クラス混合)。シリーズ効果つき。同じ組み合わせは限界突破。', rates: '★5: 10% / ★4: 30% / ★3: 60% · 10回で★4以上1つ確定' },
    weapon: { n: '武器', cost: 300, col: ['#7a3fc8', '#b07af0'], desc: 'キネティック・エネルギー・パワー武器(全クラス共通)。同じ武器は限界突破で威力アップ。', rates: '★5: 3% / ★4: 17% / ★3: 35% / ★2: 45% · 10回で★3以上1つ確定' },
    ghost:  { n: 'ゴースト', cost: 300, col: ['#2f9a92', '#8ae8e0'], desc: 'ゴーストの外殻。外殻ごとに固定のパッシブ効果(エキゾチックは2つ)。', rates: '★5: 15% / ★4: 85%' },
  };
  let gachaTab = 'job';
  function engramSprite(dark = '#7a3fc8', light = '#b07af0') {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    const rows = ['.......KK.......', '......KPPK......', '.....KPLLPK.....', '....KPLWWLPK....', '...KPLWWWWLPK...', '..KPLLWWWWLLPK..', '.KPPLLLWWLLLPPK.', 'KPPPPLLLLLLPPPPK', '.KPPPPLLLLPPPPK.', '..KPPPPLLPPPPK..', '...KPPPPPPPPK...', '....KPPPPPPK....', '.....KPPPPK.....', '......KPPK......', '.......KK.......', '................'];
    const pal = { K: '#1a0f2a', P: dark, L: light, W: '#f4e9ff' };
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
    return c;
  }
  function renderEngram(body) {
    const tabs = el(`<div class="gtabs">${Object.entries(GACHA).map(([k, v]) => `<button type="button" class="${k === gachaTab ? 'active' : ''}" data-k="${k}">${v.n}</button>`).join('')}</div>`);
    tabs.querySelectorAll('button').forEach(b => b.onclick = () => { gachaTab = b.dataset.k; renderHub('engram'); });
    body.appendChild(tabs);
    const G = GACHA[gachaTab];
    const d = el(`<div class="engram mob-panel">
      <div class="ec"></div>
      <div class="en">${G.n}・エングラム</div>
      <div class="muted" style="font-size:12px;line-height:1.7">${esc(G.desc)}<br>${esc(G.rates)}<br>グリマーのみで解読(課金なし)</div>
      <div class="mh-row" style="justify-content:center">
        <button type="button" class="mbtn blue p1">1回 (${G.cost})</button>
        <button type="button" class="mbtn gold p10">10回 (${G.cost * 9})</button>
      </div></div>`);
    d.querySelector('.ec').appendChild(spriteCanvas(engramSprite(...G.col), 6));
    const pull = n => {
      const cost = n === 10 ? G.cost * 9 : G.cost;
      if (S.glimmer < cost) { toast('グリマーが足りません — クエストをクリアして集めましょう'); return; }
      S.glimmer -= cost;
      const results = [];
      for (let i = 0; i < n; i++) {
        const last = n === 10 && i === 9;
        if (gachaTab === 'job') {
          const r = last ? rollRarity(4) : rollRarity();
          results.push({ job: grantJob(rollJob(rand(3), r)), r });
          continue;
        }
        if (gachaTab === 'armor') {
          const o = rollOutfit(rand(3), last ? rollRarity(4) : rollRarity());
          if (o) results.push(grantOutfit(o));
          continue;
        }
        const it = rollGearItem(gachaTab, false, last ? 4 : 0);
        if (it) results.push(grantItem(it, 'gacha'));
      }
      // 解読のおまけ: element shards
      const bonusEl = pick(Object.keys(SHARD_NAME));
      const bonus = n === 10 ? 10 : 1;
      S.shards ||= {}; S.shards[bonusEl] = (S.shards[bonusEl] || 0) + bonus;
      save(); updateGlimmer();
      showGachaResult(results, { el: bonusEl, n: bonus });
    };
    d.querySelector('.p1').onclick = () => pull(1);
    d.querySelector('.p10').onclick = () => pull(10);
    body.appendChild(d);
  }
  function showGachaResult(results, bonus) {
    const m = el(`<div class="gres">
      <div class="ring1"></div><div class="ring2"></div>
      <div class="gt">ENGRAM DECRYPTED</div>
      <div class="ggrid">${results.map((r, i) => {
        if (r.job) {
          const j = r.job.job;
          return `<div class="gcell" style="animation-delay:${i * 90}ms">${jobCardHtml(j)}${r.job.dup ? `<span class="gb dup">EXP+${r.job.xp}</span>` : '<span class="gb new">NEW!</span>'}</div>`;
        }
        if (r.outfit) return `<div class="gcell" style="animation-delay:${i * 90}ms">${outfitCardHtml(r.outfit)}${r.dup ? `<span class="gb dup">限界突破${r.outfit.lb}</span>` : '<span class="gb new">NEW!</span>'}</div>`;
        return `<div class="gcell" style="animation-delay:${i * 90}ms">${itemCard(r.def, r.inv)}${r.dup ? `<span class="gb dup">限界突破${r.inv.lb}</span>` : '<span class="gb new">NEW!</span>'}</div>`;
      }).join('')}</div>
      <div class="gbonus"><i style="background:${Sprites.ELEMENT_COLORS[bonus.el]}"></i><b>${SHARD_NAME[bonus.el]}の欠片 ×${bonus.n}</b><span>解読のおまけが手に入りました!</span></div>
      <button type="button" class="mbtn gold ok">OK</button></div>`);
    paintJobCanvases(m);
    m.querySelector('.ok').onclick = () => { m.remove(); renderHub('engram'); };
    document.body.appendChild(m);
  }

  async function startStage(st) {
    const act = activityFor(st.act);
    const bgUrl = act ? img(act.img) : null;
    const story = Content.STORY[st.id];
    if (story?.pre) await playDialog(story.pre, bgUrl);
    const result = await runBattle(st, act);
    if (result.win) {
      const first = !S.cleared[st.id];
      S.cleared[st.id] = true;
      save();
      await showResult(st, result, first);
      if (first && story?.post) await playDialog(story.post, bgUrl);
    } else {
      await showResult(st, result, false);
    }
    renderHub('story');
  }

  /* ----- dialog ----- */
  function speakerSprite(name) {
    if (name === 'ゴースト') return Sprites.ghostSprite('arc');
    if (name === 'ガーディアン') return Sprites.guardianSprite(activeJob().cl, 'light');
    return null;
  }
  function playDialog(lines, bgUrl) {
    return new Promise(resolve => {
      const d = el(`<div class="dialog">
        ${bgUrl ? `<img class="bgimg px" src="${bgUrl}" alt="">` : ''}
        <div class="box"><button class="pbtn small skip">SKIP ▶▶</button>
          <div class="spk"></div><div class="txt"></div><div class="next">▼</div></div></div>`);
      document.body.appendChild(d);
      let i = 0, typing = null, full = '';
      const show = () => {
        if (i >= lines.length) { d.remove(); resolve(); return; }
        const [spk, txt] = lines[i];
        const sp = d.querySelector('.spk');
        sp.innerHTML = '';
        const spr = speakerSprite(spk);
        if (spr) sp.appendChild(spriteCanvas(spr, spr.width < 16 ? 4 : 2));
        sp.appendChild(document.createTextNode(spk || ''));
        full = txt;
        const t = d.querySelector('.txt');
        let n = 0;
        clearInterval(typing);
        typing = setInterval(() => { n += 2; t.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); typing = null; } }, 30);
      };
      d.querySelector('.box').onclick = e => {
        if (e.target.classList.contains('skip')) { clearInterval(typing); d.remove(); resolve(); return; }
        if (typing) { clearInterval(typing); typing = null; d.querySelector('.txt').textContent = full; return; }
        i++; show();
      };
      show();
    });
  }

  /* ----- menu ----- */
  function renderMenu(body) {
    body.appendChild(el(`<h2 class="sec">メニュー</h2>`));
    const d = el(`<div class="panel row" style="flex-direction:column;align-items:stretch">
      <button class="pbtn pro">プロローグを見る</button>
      <a class="pbtn" href="../" style="text-align:center;text-decoration:none">ARMORY に戻る</a>
      <button class="pbtn reset" style="border-color:var(--bad)">セーブデータを消去</button>
      <div class="muted" style="font-size:11px;line-height:1.6">セーブはこのブラウザ(localStorage)に保存されます。<br>所持アイテム ${S.inv.length} 個 · ジョブ ${S.jobs.length} 個 · クリア ${Object.keys(S.cleared).length} ステージ</div>
    </div>`);
    d.querySelector('.pro').onclick = () => playDialog(Content.PROLOGUE, null);
    d.querySelector('.reset').onclick = () => {
      if (!confirm('セーブデータを消去してタイトルに戻りますか?')) return;
      localStorage.removeItem(SAVE_KEY); S = null; renderTitle();
    };
    body.appendChild(d);
  }

  /* ===================== hub v2 (landscape, Destiny-style screens) =====================
   * Top bar (player / currencies / settings) · screen · bottom nav HOME / MODES / JOBS / GEAR / SUMMON.
   * Painted art (backgrounds, planets, banners) can be swapped for drawn images later; until then the
   * Bungie API images (activity backgrounds, item screenshots) and CSS spheres stand in. */
  const NAV = [['home', 'HOME', '<path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/>'], ['modes', 'MODES', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'],
    ['jobs', 'JOBS', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>'], ['gear', 'GEAR', '<path d="M12 3l8 4-8 14L4 7z"/><path d="M4 7l8 4 8-4M12 11v10"/>'],
    ['summon', 'SUMMON', '<path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>']];
  const OLD_TAB = { story: 'modes', job: 'jobs', engram: 'summon', menu: 'home' };
  const svgI = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${d}</svg>`;
  const elColor = e => Sprites.ELEMENT_COLORS[e] || '#d8dde6';
  const nextStage = () => Content.STAGES.find((s, i) => !s.farm && stageUnlocked(i) && !S.cleared[s.id]) || Content.STAGES.filter(s => !s.farm).pop();
  function renderHub(tab) {
    hubTab = OLD_TAB[tab] || tab || hubTab;
    if (!NAV.some(n => n[0] === hubTab)) hubTab = 'home';
    const job = activeJob();
    const shardTotal = Object.values(S.shards || {}).reduce((a, b) => a + b, 0);
    const xpPct = Math.min(100, (job.xp || 0) / (job.lv * 100) * 100);
    app().innerHTML = `
      <div class="hub">
        <header class="H-top">
          <span class="H-logo">${svgI('<path d="M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/>')}</span>
          <div class="H-who"><b>${esc(job.name)}</b><span>${CLASS_NAME[job.cl]} · LV ${job.lv}</span><i class="H-xp"><em style="width:${xpPct}%"></em></i></div>
          <div class="H-cur">
            <span title="グリマー">${Data.glimmerIcon ? `<img src="${img(Data.glimmerIcon)}" alt="">` : ''}<b id="glim">${S.glimmer.toLocaleString()}</b><small>グリマー</small></span>
            <span title="エレメントの欠片"><i class="H-shard"></i><b>${shardTotal.toLocaleString()}</b><small>欠片</small></span>
            <button type="button" class="H-set" aria-label="設定">${svgI('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')}</button>
          </div>
        </header>
        <main class="H-body H-${hubTab}"></main>
        <nav class="H-nav" aria-label="メインメニュー">${NAV.map(([k, n, ic]) => `<button type="button" data-t="${k}" class="${k === hubTab ? 'on' : ''}">${svgI(ic)}<span>${n}</span></button>`).join('')}</nav>
      </div>`;
    $$('.H-nav button').forEach(b => b.onclick = () => renderHub(b.dataset.t));
    $('.H-set').onclick = openMenu;
    const body = $('.H-body');
    ({ home: renderHome, modes: renderModes, jobs: renderJobs2, gear: renderGear2, summon: renderSummon })[hubTab](body);
  }
  function openMenu() {
    const m = el(`<div class="modal mob-modal"><div class="panel"><div class="row"><b>メニュー</b><span class="grow"></span><button type="button" class="mbtn x">閉じる</button></div><div class="mbody"></div>
      <button type="button" class="mbtn blue imp" style="width:100%;margin-top:10px">D2 の装備を取り込む</button></div></div>`);
    renderMenu(m.querySelector('.mbody'));
    m.querySelector('.x').onclick = () => m.remove();
    m.querySelector('.imp').onclick = async ev => {
      ev.target.disabled = true; ev.target.textContent = '取り込み中...';
      try { const n = await importFromD2(); toast(`${n} 個のアイテムを取り込みました`); m.remove(); renderHub(hubTab); }
      catch (err) { toast('取り込み失敗: ' + err.message); ev.target.disabled = false; ev.target.textContent = 'D2 の装備を取り込む'; }
    };
    document.body.appendChild(m);
  }
  // The equipped outfit's character, filled into a container (outfit art if registered, else the colored sprite)
  function heroInto(box, cls, element) {
    const o = equippedOutfit(cls);
    const art = o ? outfitInfo(o).art : null;
    if (art?.preview) box.innerHTML = `<img class="H-heroimg" src="${art.preview}" alt="">`;
    else box.appendChild(outfitHero(o, cls, element));
  }

  // TOP: the fixed title art + the outfit's TOP pose (foot up on the rock), looped like idle
  const TOP_BG = 'art/ui/top_bg.webp';
  function heroTopInto(box, cls, element) {
    const o = equippedOutfit(cls);
    const art = o ? outfitInfo(o).art : null;
    if (!art?.top) return heroInto(box, cls, element);
    box.innerHTML = `<img class="H-heroimg" src="${art.top[0]}" alt="">`;
    const im = box.firstChild, seq = [0, 1, 2, 1];
    let i = 0;
    const t = setInterval(() => (im.isConnected ? (im.src = art.top[seq[++i % 4]]) : clearInterval(t)), 320);
  }

  /* ----- TOP (title) ----- */
  function renderTop() {
    const st = S ? nextStage() : Content.STAGES[0];
    const act = activityFor(st.act);
    app().innerHTML = `
      <div class="hub top fixed">
        <div class="T-bg"><img src="${TOP_BG}" alt=""></div>
        <div class="T-moon"></div>
        <div class="T-corner">DESTINY 2 × MOBIUS</div>
        <div class="T-title"><span class="T-crest">${svgI('<circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6"/>')}</span><h1>D 2 &nbsp;M O B I U S</h1><div class="T-sub"><i></i><b>光 の 環</b><i></i></div></div>
        <div class="T-hero"></div>
        <button type="button" class="T-start"><i></i>TAP TO START<i></i></button>
        ${S ? `<button type="button" class="T-news"><div class="H-ptitle">NEWS</div><div class="T-nb">${act ? `<img src="${img(act.img)}" alt="">` : ''}<div><b>${esc(st.name)}</b><small>次のクエスト · 第1章 光の環</small></div></div></button>` : ''}
        <div class="T-ver">— v1.0</div>
      </div>`;
    const job = S ? activeJob() : null;
    $('.T-bg img').onerror = e => {   // no title art yet → activity image + CSS moon
      $('.hub.top').classList.remove('fixed');
      if (act) e.target.src = img(act.img); else e.target.remove();
    };
    if (job) heroTopInto($('.T-hero'), job.cl, subElement(Data.byHash.get(job.sub)));
    else $('.T-hero').appendChild(spriteCanvas(Sprites.guardianSprite(1, 'solar'), 4, 'mh-hero'));
    const go = () => (S ? renderHub('home') : renderTitle());
    $('.hub.top').onclick = go;
  }

  /* ----- HOME ----- */
  function renderHome(body) {
    const job = activeJob(), st = nextStage(), act = activityFor(st.act);
    body.innerHTML = `
      <div class="T-bg">${act ? `<img src="${img(act.img)}" alt="">` : ''}</div>
      <div class="T-moon sm"></div>
      <div class="T-title sm"><h1>D 2 &nbsp;M O B I U S</h1><div class="T-sub"><i></i><b>光 の 環</b><i></i></div></div>
      <div class="T-hero"></div>
      <button type="button" class="T-start H-go"><i></i>MODES<i></i></button>
      <button type="button" class="T-news"><div class="H-ptitle">NEXT QUEST</div><div class="T-nb">${act ? `<img src="${img(act.img)}" alt="">` : ''}<div><b>${esc(st.name)}</b><small>推奨Lv ${Math.round(st.lv * 3)} · ${esc((FACTION[Content.enemyDef(st.waves[st.waves.length - 1][0]).fac] || ['?'])[0])}</small></div></div></button>`;
    heroInto($('.T-hero', body), job.cl, subElement(Data.byHash.get(job.sub)));
    $('.H-go', body).onclick = () => renderHub('modes');
    $('.T-news', body).onclick = () => startStage(st);
  }

  /* ----- MODES (planet select) ----- */
  let hubMode = 'story';
  const MODES = [
    { k: 'story', n: 'STORY', jp: 'ストーリー', x: 27, y: 78, c: ['#3a7bd5', '#9fd3ff', '#1b3b2a'], open: () => true, desc: '第1章「光の環」。ベックスの環に閉じ込められた戦場を巡り、光の記録を取り戻す。', filter: s => !s.farm },
    { k: 'strike', n: 'STRIKE', jp: '周回', x: 19, y: 46, c: ['#cfd3da', '#ffffff', '#55585f'], open: () => !!S.cleared.s2, lock: '第1章 1-2 クリアで解放', desc: '強化素材と装備を集める周回ステージ。何度でも挑戦できる。', filter: s => s.farm },
    { k: 'crucible', n: 'CRUCIBLE', jp: 'クルーシブル', x: 27, y: 17, c: ['#b5432a', '#ffb08a', '#3a120a'], open: () => false, lock: 'COMING SOON' },
    { k: 'gambit', n: 'GAMBIT', jp: 'ギャンビット', x: 60, y: 16, c: ['#2a8a5a', '#c4ffd9', '#5a1a1a'], open: () => false, lock: 'COMING SOON' },
    { k: 'raid', n: 'RAID', jp: 'レイド', x: 78, y: 44, c: ['#6a3fc8', '#d6b8ff', '#1a1040'], open: () => false, lock: 'COMING SOON' },
    { k: 'event', n: 'EVENT', jp: 'イベント', x: 66, y: 80, c: ['#7aa8d8', '#ffffff', '#2a3a5a'], open: () => false, lock: 'COMING SOON' },
  ];
  function renderModes(body) {
    const sel = MODES.find(m => m.k === hubMode) || MODES[0];
    const stages = sel.filter ? Content.STAGES.filter(sel.filter) : [];
    const rec = stages.length ? (stages.find(s => !S.cleared[s.id]) || stages[stages.length - 1]) : null;
    body.innerHTML = `
      <div class="M-bg"><img src="art/ui/modes_bg.webp" alt="" onerror="this.remove()"></div><div class="H-stars"></div>
      <div class="H-ptitle big">${svgI(NAV[1][2])}MODE SELECT</div>
      <div class="M-orbit"><i class="o1"></i><i class="o2"></i>
        <div class="M-traveler"><span>THE TRAVELER</span></div>
        ${MODES.map(m => `<button type="button" class="M-planet ${m.k === sel.k ? 'sel' : ''} ${m.open() ? '' : 'locked'}" data-k="${m.k}" style="left:${m.x}%;top:${m.y}%;--a:${m.c[0]};--b:${m.c[1]};--d:${m.c[2]};--img:url(art/ui/planet_${m.k}.webp)">
          <i></i><b>${m.n}</b><small>${m.open() ? m.jp : m.lock}</small></button>`).join('')}
      </div>
      <aside class="H-panel M-info">
        <div class="M-tag">${sel.open() ? 'AVAILABLE' : 'LOCKED'}</div>
        <h2>${sel.n}</h2><div class="M-jp">${sel.jp}</div>
        <p>${esc(sel.desc || sel.lock || '')}</p>
        ${rec ? `<div class="M-k">RECOMMENDED LEVEL</div><div class="M-pow">◆ ${Math.round(rec.lv * 3)}</div>
        <div class="M-k">NEXT</div><div class="M-next">${esc(rec.name)}</div>
        <div class="M-k">REWARDS</div><div class="M-rew">
          ${Data.glimmerIcon ? `<span><img src="${img(Data.glimmerIcon)}" alt=""><small>グリマー</small></span>` : ''}
          <span><i class="H-shard"></i><small>欠片</small></span>
          <span><i class="M-drop"></i><small>${esc(dropTable(rec).label)}</small></span></div>` : ''}
        <button type="button" class="H-launch" ${sel.open() ? '' : 'disabled'}>${svgI('<path d="M5 19L19 5M9 5h10v10"/>')}LAUNCH</button>
      </aside>`;
    $$('.M-planet', body).forEach(b => b.onclick = () => { hubMode = b.dataset.k; renderHub('modes'); });
    $('.H-launch', body).onclick = () => openQuestList(sel);
  }
  function openQuestList(mode) {
    const m = el(`<div class="modal mob-modal H-quests"><div class="panel"><div class="row"><b>${mode.n} · ${esc(mode.jp)}</b><span class="grow"></span><button type="button" class="mbtn x">BACK</button></div><div class="qlist"></div></div></div>`);
    renderStory(m.querySelector('.qlist'), mode.filter);
    m.querySelector('.x').onclick = () => m.remove();
    $$('.go', m).forEach(b => b.addEventListener('click', () => m.remove()));
    document.body.appendChild(m);
  }

  /* ----- JOBS ----- */
  function jobStats(job) {
    const prev = S.activeJob; S.activeJob = job.id;
    try { return buildPlayer(); } finally { S.activeJob = prev; }
  }
  // painted job-card backgrounds per element (art/ui/job_<element>.webp, 1024x1536 with the frame)
  const EL_ICON = new Set(['solar', 'arc', 'void', 'stasis', 'strand', 'prism']);   // art/ui/el_<element>.webp
  const icAttr = e => (EL_ICON.has(e) ? ` data-ic="${e}"` : '');
  const elIcon = e => (EL_ICON.has(e) ? `<img class="el-ic" src="art/ui/el_${e}.webp" alt="">` : '');
  const JOB_BG = new Set(['solar', 'arc', 'void', 'stasis', 'strand', 'prism']);
  const jobBg = e => (JOB_BG.has(e) ? ` art" style="--art:url(art/ui/job_${e}.webp);` : '');
  function renderJobs2(body) {
    const sorted = [...S.jobs].sort((a, b) => (b.r || 3) - (a.r || 3) || b.lv - a.lv);
    const view = jobById(viewJobId) || activeJob();
    viewJobId = view.id;
    const sub = Data.byHash.get(view.sub), e = subElement(sub), col = elColor(e);
    const ps = jobStats(view);
    const statBar = (k, v, max) => `<div class="J-st"><span>${k}</span><i><em style="width:${Math.min(100, v / max * 100)}%"></em></i><b>${v.toLocaleString()}</b></div>`;
    const ab = k => { const p = Data.plugs.get(view[k]); const kind = ABIL_KINDS.find(x => x.k === k); return p ? `<div class="J-ab"><img src="${img(p.i)}" alt=""><div><b>${esc(p.n)}</b><small>${kind.n}</small></div></div>` : ''; };
    const sup = Data.plugs.get(view.sup);
    body.innerHTML = `
      <div class="J-big${jobBg(e)}" style="--c:${col}"><div class="J-bh"><span class="J-el"${icAttr(e)}><i></i>${ELEMENT_NAME[e] || ''}</span><span class="stars r${view.r || 3}">${'★'.repeat(view.r || 3)}</span></div><div class="J-art"></div><b class="J-bn">${esc(view.name)}</b></div>
      <section class="J-list"><div class="H-ptitle big">${svgI(NAV[2][2])}JOB SELECT <small>${S.jobs.length} JOBS · ジョブを選んで装備</small></div>
        <div class="J-cards">${sorted.map(j => { const ee = subElement(Data.byHash.get(j.sub)); return `<button type="button" class="J-card ${j.id === view.id ? 'sel' : ''} ${j.id === S.activeJob ? 'act' : ''}${jobBg(ee)}" data-job="${j.id}" style="--c:${elColor(ee)}">
          <span class="J-el"${icAttr(ee)}><i></i>${ELEMENT_NAME[ee] || ''}</span><span class="stars r${j.r || 3}">${'★'.repeat(j.r || 3)}</span>
          <canvas data-cls="${j.cl}" data-el="${ee}"></canvas><b>${esc(j.name)}</b><small>${CLASS_NAME[j.cl]} · Lv.${j.lv}</small>${j.id === S.activeJob ? '<em>EQUIPPED</em>' : ''}</button>`; }).join('')}</div></section>
      <aside class="H-panel J-info" style="--c:${col}">
        <h2>${esc(view.name)}</h2><div class="J-sub">${CLASS_NAME[view.cl]} · ${esc(sub?.n || '')}</div>
        <div class="H-k">JOB STATS</div>
        ${statBar('HP', ps.maxHp, 4000)}${statBar('ATTACK', ps.atk, 600)}${statBar('BREAK', Math.round(ps.brkMult * 100), 200)}${statBar('CRIT', Math.round(ps.crit * 100), 50)}
        <div class="H-k">ABILITIES</div><div class="J-abs">${['gre', 'mel', 'cls', 'mov'].map(ab).join('')}</div>
        <div class="H-k">SUPER</div>${sup ? `<div class="J-sup"><img src="${img(sup.i)}" alt=""><div><b>${esc(sup.n)}</b><small>${esc((sup.d || '').slice(0, 60))}</small></div></div>` : ''}
        <div class="J-lv"><span>JOB LEVEL Lv.${view.lv}</span><b>${view.xp || 0} / ${view.lv * 100}</b><i><em style="width:${Math.min(100, (view.xp || 0) / (view.lv * 100) * 100)}%"></em></i></div>
        <div class="J-btns">${view.id === S.activeJob ? '<span class="H-btn on">EQUIPPED</span>' : '<button type="button" class="H-btn gold use">EQUIP JOB</button>'}
          <button type="button" class="H-btn sp">スキルパネル</button><button type="button" class="H-btn info">詳細</button></div>
      </aside>`;
    paintJobCanvases(body);
    $('.J-art', body).appendChild(outfitHero(equippedOutfit(view.cl), view.cl, e));
    $$('.J-card', body).forEach(c => c.onclick = () => { viewJobId = c.dataset.job; renderHub('jobs'); });
    $('.use', body)?.addEventListener('click', () => { S.activeJob = view.id; save(); renderHub('jobs'); });
    $('.sp', body).onclick = () => openSkillPanel(view);
    $('.info', body).onclick = () => openJobDetail(view);
  }

  /* ----- GEAR (loadout) ----- */
  let gearSel = null;
  function renderGear2(body) {
    const job = activeJob(), cls = job.cl;
    const p = buildPlayer(), items = p.items, oi = p.oi, outfit = p.outfit;
    const sub = Data.byHash.get(job.sub), e = subElement(sub);
    const ginv = invById(S.ghost), gdef = ginv && Data.ghostByHash.get(ginv.h);
    const tierName = d => TIER[d?.tt]?.n || '';
    const wRow = k => { const x = items[k]; return `<button type="button" class="G-row ${x ? 'tier' + itemStars(x.def, x.inv) : 'empty'}" data-slot="${k}">
        <span class="G-ic">${x ? `<img src="${img(x.def.i)}" alt="">` : '+'}</span><div><small>${SLOT_NAME[k]}</small><b>${x ? esc(x.def.n) : '未装備'}</b><em>${x ? `${esc(tierName(x.def))} ${esc(x.def.t || '')}` : ''}</em></div></button>`; };
    const pieces = oi ? ARMOR_SLOTS.map(sl => oi.pieces[sl]).filter(Boolean) : [];
    gearSel = pieces.find(d => d.h === gearSel?.h) || oi?.ex || pieces[0] || null;
    const aRow = d => `<button type="button" class="G-row tier${d.tt === 6 ? 5 : 4} ${d === gearSel ? 'sel' : ''}" data-piece="${d.h}">
        <span class="G-ic"><img src="${img(d.i)}" alt=""></span><div><small>${SLOT_NAME[SLOT_OF_BUCKET[d.bk]]}</small><b>${esc(d.n)}</b><em>${esc(tierName(d))} ${esc(d.t || '')}</em></div></button>`;
    const power = Math.round(p.maxHp / 10 + p.atk * 4);
    const st = Object.keys(STAT);
    body.innerHTML = `
      <div class="G-head"><div class="H-ptitle big">${svgI(NAV[3][2])}GEAR / LOADOUT</div><small>${CLASS_NAME[cls]} // ${esc(job.name)} // <span style="color:${elColor(e)}">${ELEMENT_NAME[e] || ''}</span></small></div>
      <section class="G-wpn"><div class="H-k">WEAPONS</div>${['kin', 'ene', 'pow'].map(wRow).join('')}</section>
      <div class="G-hero"><div class="G-char"></div>${gdef ? `<img class="G-ghost" src="${img(gdef.i)}" alt="">` : ''}</div>
      <div class="G-ghostrow"><button type="button" class="G-row ${gdef ? 'tier' + (gdef.tt === 6 ? 5 : 4) : 'empty'}" data-slot="ghost"><span class="G-ic">${gdef ? `<img src="${img(gdef.i)}" alt="">` : '+'}</span><div><small>ゴースト</small><b>${gdef ? esc(gdef.n) : '未装備'}</b><em>${gdef ? esc(Content.ghostPerksFor(gdef.h, gdef.tt).map(q => q.n).join(' / ')) : ''}</em></div></button></div>
      <section class="G-arm"><div class="H-k">ARMOR <small>${oi ? esc(oi.name) : '衣装なし'}</small></div>${pieces.map(aRow).join('') || '<div class="muted">衣装を装備してください</div>'}</section>
      <aside class="H-panel G-detail">${gearSel ? `
        <div class="G-dh tier${gearSel.tt === 6 ? 5 : 4}"><img src="${img(gearSel.i)}" alt=""><div><b>${esc(gearSel.n)}</b><small>${SLOT_NAME[SLOT_OF_BUCKET[gearSel.bk]]}</small></div><em>${esc(tierName(gearSel))}</em></div>
        <div class="G-dpow">◆ ${power.toLocaleString()} <small>衣装 ★${oi.stars}${outfit.lb ? ` +${outfit.lb}` : ''}</small></div>
        ${gearSel.fx ? `<div class="G-perk"><b>${gearSel.tt === 6 ? 'エキゾチック' : '説明'}</b><p>${esc(gearSel.fx)}</p></div>` : ''}
        ${oi.effect ? `<div class="G-perk"><b>シリーズ「${esc(oi.set.n)}」</b><p>${esc(oi.effect.n)}(常に発動)</p></div>` : ''}
        <div class="G-dbtn"><button type="button" class="H-btn chg">衣装を変更</button><button type="button" class="H-btn det">詳細</button></div>` : '<button type="button" class="H-btn chg">衣装を装備</button>'}</aside>
      <section class="H-panel G-stats">${st.map(k => `<div class="J-st"><span>${STAT_LABEL[k]}</span><i><em style="width:${Math.min(100, p.stats[k] / 60 * 100)}%"></em></i><b>${p.stats[k]}</b></div>`).join('')}
        <div class="G-pow"><small>POWER</small><b>◆ ${power.toLocaleString()}</b></div></section>`;
    heroInto($('.G-char', body), cls, e);
    $$('[data-slot]', body).forEach(b => b.onclick = () => (b.dataset.slot === 'ghost' ? openGhostPicker() : openPicker(cls, b.dataset.slot)));
    $$('[data-piece]', body).forEach(b => b.onclick = () => { gearSel = Data.byHash.get(+b.dataset.piece); renderHub('gear'); });
    $('.chg', body).onclick = () => openOutfitPicker(cls);
    $('.det', body)?.addEventListener('click', () => openOutfitDetail([outfit], 0, null));
  }

  /* ----- SUMMON ----- */
  const GACHA_RATES = { job: [[5, 10], [4, 30], [3, 60]], armor: [[5, 10], [4, 30], [3, 60]], weapon: [[5, 3], [4, 17], [3, 35], [2, 45]], ghost: [[5, 15], [4, 85]] };
  const RATE_NAME = { 5: 'エキゾチック ★5', 4: 'レジェンダリー ★4', 3: 'レア ★3', 2: 'コモン ★2' };
  const daySeed = () => Math.floor(Date.now() / 86400000);
  function featured(tab, n = 3) {
    const pool = tab === 'weapon' ? ['kin', 'ene', 'pow'].flatMap(sl => (Data.pool[sl] || []).filter(d => d.tt === 6))
      : tab === 'armor' ? ARMOR_SLOTS.flatMap(sl => (Data.pool[sl] || []).filter(d => d.tt === 6))
      : tab === 'ghost' ? Data.ghosts.filter(gh => gh.tt === 6) : Data.subclasses;
    if (!pool.length) return [];
    const seed = daySeed();
    return Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[(seed * 7919 + i * 104729) % pool.length]);
  }
  function doPull(tab, n) {
    const G = GACHA[tab];
    const cost = n === 10 ? G.cost * 9 : G.cost;
    if (S.glimmer < cost) { toast('グリマーが足りません — クエストをクリアして集めましょう'); return; }
    S.glimmer -= cost;
    const results = [];
    for (let i = 0; i < n; i++) {
      const last = n === 10 && i === 9;
      if (tab === 'job') { const r = last ? rollRarity(4) : rollRarity(); results.push({ job: grantJob(rollJob(rand(3), r)), r }); continue; }
      if (tab === 'armor') { const o = rollOutfit(rand(3), last ? rollRarity(4) : rollRarity()); if (o) results.push(grantOutfit(o)); continue; }
      const it = rollGearItem(tab, false, last ? 4 : 0);
      if (it) results.push(grantItem(it, 'gacha'));
    }
    const bonusEl = pick(Object.keys(SHARD_NAME)), bonus = n === 10 ? 10 : 1;
    S.shards ||= {}; S.shards[bonusEl] = (S.shards[bonusEl] || 0) + bonus;
    save(); updateGlimmer();
    showGachaResult(results, { el: bonusEl, n: bonus });
  }
  function renderSummon(body) {
    if (!GACHA[gachaTab]) gachaTab = 'job';
    const G = GACHA[gachaTab];
    const feat = featured(gachaTab);
    const hero = feat[0];
    const art = hero ? (hero.s || hero.i) : null;
    const cats = [['armor', 'OUTFIT', '衣装'], ['weapon', 'WEAPON', '武器'], ['job', 'JOB', 'ジョブ'], ['ghost', 'GHOST', 'ゴースト']];
    body.innerHTML = `
      <div class="S-head"><div class="H-ptitle big">${svgI(NAV[4][2])}SUMMON</div><small>グリマーのみで解読(課金なし)</small></div>
      <section class="S-cats">${cats.map(([k, en, jp]) => { const f = featured(k, 1)[0]; return `<button type="button" class="S-cat ${k === gachaTab ? 'on' : ''}" data-k="${k}">
        <span class="S-ci">${f ? `<img src="${img(f.i)}" alt="">` : ''}</span><b>${en}<small>${jp}・エングラム</small></b><i>›</i></button>`; }).join('')}</section>
      <section class="S-banner">${art ? `<img src="${img(art)}" alt="">` : ''}<div class="S-shade"></div>
        <div class="S-bt"><small>FEATURED</small><h2>${esc(G.n)}・エングラム</h2><p>${esc(G.desc)}</p></div>
        ${hero ? `<div class="S-fh"><b>${esc(hero.n)}</b><small>${esc(hero.t || (gachaTab === 'ghost' ? 'エキゾチック・ゴースト' : gachaTab === 'job' ? 'サブクラス' : 'エキゾチック'))}</small></div>` : ''}
      </section>
      <div class="S-pulls"><button type="button" class="S-pull p1"><b>SUMMON ×1</b><span>${Data.glimmerIcon ? `<img src="${img(Data.glimmerIcon)}" alt="">` : ''}${G.cost.toLocaleString()}</span></button>
        <button type="button" class="S-pull gold p10"><b>SUMMON ×10</b><span>${Data.glimmerIcon ? `<img src="${img(Data.glimmerIcon)}" alt="">` : ''}${(G.cost * 9).toLocaleString()}</span></button></div>
      <aside class="S-side"><div class="H-k">DROP RATES</div>
        ${GACHA_RATES[gachaTab].map(([r, pct]) => `<div class="S-rate tier${r}"><i></i><span>${RATE_NAME[r]}</span><b>${pct.toFixed(1)}%</b></div>`).join('')}
        <div class="H-k">GUARANTEE</div><div class="S-pity">10回解読で ${gachaTab === 'weapon' ? '★3' : gachaTab === 'ghost' ? '★4' : '★4'} 以上が1つ確定</div>
        <div class="H-k">FEATURED ITEMS</div><div class="S-feat">${feat.map(f => `<span class="tier5"><img src="${img(f.i)}" alt=""><small>${esc(f.n)}</small></span>`).join('')}</div></aside>`;
    $$('.S-cat', body).forEach(b => b.onclick = () => { gachaTab = b.dataset.k; renderHub('summon'); });
    $('.p1', body).onclick = () => doPull(gachaTab, 1);
    $('.p10', body).onclick = () => doPull(gachaTab, 10);
  }

  /* ----- result ----- */
  function showResult(st, r, first) {
    return new Promise(resolve => {
      const m = el(`<div class="result"><div class="panel">
        <h3>${r.win ? 'MISSION CLEAR' : 'MISSION FAILED'}</h3>
        ${r.win ? `
          <div class="glimmer" style="justify-content:center">${Data.glimmerIcon ? `<img src="${img(Data.glimmerIcon)}">` : ''}+${r.glimmer.toLocaleString()} ${first ? '(初回ボーナス込み)' : ''}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">ジョブ経験値 +${r.xp}${r.levelUp ? ` · <span style="color:var(--good)">LEVEL UP! Lv.${r.lv}</span>` : ''}</div>
          <div class="shards" style="justify-content:center;margin-top:8px">${Object.entries(r.shards || {}).map(([k, n]) => `<span><i style="background:${Sprites.ELEMENT_COLORS[k]}"></i>${SHARD_NAME[k]} +${n}</span>`).join('')}</div>
          ${r.drops.length ? `<div style="margin-top:8px">ドロップ</div><div class="drops2">${r.drops.map(d => d.outfit ? outfitCardHtml(d.outfit, '', '', d.dup ? '限界突破' : 'NEW!') : itemCard(d.def, d.inv, { badge: d.dup ? '限界突破' : 'NEW!' })).join('')}</div><div style="font-size:12px">${r.drops.map(d => esc(d.outfit ? outfitInfo(d.outfit).name : d.def.n)).join(' / ')}</div>` : ''}`
          : '<div class="muted">光が尽きた……装備やジョブを見直して再挑戦しよう。</div>'}
        <button class="pbtn primary" style="margin-top:14px;width:100%">OK</button></div></div>`);
      m.querySelector('button').onclick = () => { m.remove(); resolve(); };
      document.body.appendChild(m);
    });
  }

  /* ===================== battle (Mobius-style portrait screen) =====================
   * Camera behind the guardian: player (back view) in the foreground, enemies further away.
   * Top: elements (sorted). Tap screen/enemy = normal attack (kinetic).
   * Left: kinetic / energy / heavy weapons. Right: melee / grenade / class ability.
   * Bottom: HP bar, Super gauge (tap when full), guard ring (long press = spend elements for a defensive buff). */
  const BW = 480, BH = 270, BRS = 3;   // landscape 16:9 battlefield (rendered at 3x)
  const ORB_ORDER = ['arc', 'solar', 'void', 'stasis', 'strand', 'prism'];

  function costPips(cost) {
    return Object.entries(cost).flatMap(([e, n]) => Array.from({ length: n }, () => `<i style="background:${e === 'any' ? '#888' : Sprites.ELEMENT_COLORS[e]}"></i>`)).join('');
  }
  function canPay(orbs, cost) {
    const pool = [...orbs];
    for (const [e, n] of Object.entries(cost)) {
      if (e === 'any') continue;
      for (let i = 0; i < n; i++) { const k = pool.indexOf(e); if (k < 0) return false; pool.splice(k, 1); }
    }
    return pool.length >= (cost.any || 0);
  }
  function pay(p, cost) {
    for (const [e, n] of Object.entries(cost)) {
      if (e === 'any') continue;
      for (let i = 0; i < n; i++) p.orbs.splice(p.orbs.indexOf(e), 1);
    }
    for (let i = 0; i < (cost.any || 0); i++) {
      const counts = {};
      p.orbs.forEach(o => { counts[o] = (counts[o] || 0) + (o === 'prism' ? 0.5 : 1); });
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      p.orbs.splice(p.orbs.indexOf(best), 1);
    }
  }
  function makeEnemy(key, lv) {
    const d = Content.enemyDef(key);
    const k = 1 + (lv - 1) * 0.55;
    return {
      ...d, maxHp: Math.round(d.hp * k), hp: Math.round(d.hp * k), atkV: Math.round(d.atk * (1 + (lv - 1) * 0.3)),
      counter: d.spd, bk: d.brk, broken: 0, sprites: null, x: 0, y: 0, depth: 1, hitT: 0, dieT: 0, atkT: 0, kb: 0,
      scale: d.scale || 1, phase: Math.random() * 6,
    };
  }

  async function runBattle(st, act) {
    const p = buildPlayer();
    const C = buildCards(p);
    const B = {
      st, p, C, wave: 0, enemies: [], target: 0, busy: true, done: null, time: 0,
      fx: [], shake: 0, banner: null, log: [], hurtT: 0, flash: 0,
      pAtkT: 0, pHitT: 0, pDash: 0, pDodge: 0, held: 'kin', heldT: 0, superFx: null, ringHold: 0,
    };
    const bossKey = st.waves[st.waves.length - 1][0];
    const bossDef = Content.enemyDef(bossKey);
    const [facN, facC] = FACTION[bossDef.fac] || ['?', '#888'];
    const weakSet = [...new Set(st.waves.flat().map(k => Content.enemyDef(k).weak))];
    const iconSvg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${d}</svg>`;
    const ICON = {
      tri: '<path d="M12 3l9 16H3z"/><path d="M12 10v4"/>', skull: '<path d="M5 11a7 7 0 0 1 14 0v3l-2 2v3H7v-3l-2-2z"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>',
      target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>', flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    };
    const drive = ORB_ORDER.map(e => `<button type="button" class="L-gem" data-e="${e}"${icAttr(e)} aria-label="${ELEMENT_NAME[e]}で防御" style="--c:${Sprites.ELEMENT_COLORS[e]}"><i></i><b>0</b></button>`).join('');
    app().innerHTML = `
      <div class="bt land">
        <canvas id="bc" width="${BW * BRS}" height="${BH * BRS}"></canvas>
        <section class="L-mission">
          <div class="L-mh"><span class="L-crest">${iconSvg(ICON.flag)}</span><div><b>QUEST · ${esc(st.farm ? '周回' : st.no)}</b><em>${esc(st.name)}</em><small>${esc(facN)}を撃破せよ</small></div></div>
          <div class="L-mods">
            ${st.waves.some(w => w.some(k => Content.BOSSES[k])) ? `<span>${iconSvg(ICON.skull)}ボス</span>` : ''}
            <span style="color:${facC}">${iconSvg(ICON.target)}${esc(facN)}</span>
            ${weakSet.map(w => `<span style="color:${Sprites.ELEMENT_COLORS[w]}">${elIcon(w) || iconSvg(ICON.tri)}${ELEMENT_NAME[w]}弱点</span>`).join('')}
            <span>BATTLE <b class="wv">1/${st.waves.length}</b></span>
          </div>
        </section>
        <div class="m-orbs" aria-label="エレメント"></div>
        <section class="L-boss">
          <div class="L-bh"><span class="L-crest">${iconSvg(ICON.skull)}</span><b class="L-bname">-</b><span class="L-cnt" title="行動まで"><i class="m-dots"></i><b class="m-cnt">-</b></span></div>
          <div class="L-brow"><span>HP</span><div class="L-bar hp"><i class="L-bhp"></i></div><em class="L-bhpv"></em></div>
          <div class="L-brow"><span>BREAK</span><div class="L-bar brk m-brk"><i></i></div><em class="L-bbrk"></em></div>
          <div class="L-bchips m-tinfo"></div>
        </section>
        <div class="L-tools"><span class="L-score">SCORE <b class="score">0</b><em class="m-scoreadd"></em></span>
          <button type="button" class="m-tv">TARGET</button><button type="button" class="m-auto">AUTO</button><button type="button" class="m-help">HELP</button></div>
        <div class="bt-log"></div>
        <div class="m-banner"><span></span></div>
        <section class="L-guard">
          <div class="L-gh"><span class="L-crest">${iconSvg(ICON.flag)}</span><b>GUARDIAN · ${esc(CLASS_NAME[p.cls])}</b><em>${esc(p.job.name)}</em><span class="m-buffs"></span></div>
          <div class="L-grow"><span>HP</span><div class="L-bar php"><i class="m-hpbar-i"></i></div><em class="m-hpv"></em></div>
          <div class="L-grow"><span>SHIELD</span><div class="L-bar shd"><i class="L-shd"></i></div><em class="L-shdv"></em></div>
          <div class="L-wpns bt-left"></div>
          <button type="button" class="m-super sp" aria-label="スーパー"><span class="L-spic">${p.abil.sup ? `<img src="${img(p.abil.sup.i)}" alt="">` : ''}</span><small>SUPER</small></button>
        </section>
        <section class="L-drive"><div class="L-dt">ELEMENT DRIVE</div><div class="L-gems">${drive}</div><div class="L-dh">タップで消費して防御</div></section>
        <section class="L-cards bt-right"></section>
        <div class="L-rotate">横向きにするとプレイしやすくなります</div>
      </div>`;
    const canvas = $('#bc');
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;

    // ---- assets: background (API PGCR, pixelated), guardian colored by equipped armor icons, ghost by shell ----
    try { B.bg = act ? await Sprites.pixelatedBackground(img(act.img), 320, 180) : Sprites.gridBackground(320, 180); }
    catch { B.bg = Sprites.gridBackground(320, 180); }
    const vis = p.element === 'prism' ? 'prism' : p.element;
    // armor look per slot from the equipped armor's API icons (head / arms / chest / legs / class item)
    try { B.slotPal = p.oi ? await Sprites.guardianSlotPal(p.cls, outfitUrls(p.oi)) : {}; }
    catch { B.slotPal = {}; }
    // Super pose pattern + Light weapon / energy prop (drawn by the game in the super's element color)
    B.superPose = Content.superPose(p.abil.sup?.n);
    // One-piece outfit art (pose images) when the outfit has it; otherwise the part rig in the outfit's colors
    // 3 frames per pose (idle loops; actions play through once), all cropped with the same box (meta.json)
    B.poseArt = null;
    if (p.oi?.art) {
      try {
        const art = p.oi.art;
        const meta = await fetch(art.meta).then(r => (r.ok ? r.json() : null)).catch(() => null);
        const load = u => Sprites.loadImage(u, false).catch(() => null);
        const poses = {};
        for (const k of ['idle', 'shoot', 'melee']) poses[k] = (await Promise.all(art[k].map(load))).filter(Boolean);
        // super: the job's super pattern row of the super sheet (falls back to the melee frames)
        poses.super = (await Promise.all(art.superFrames(B.superPose[0]).map(load))).filter(Boolean);
        if (poses.idle.length) {
          for (const k of ['shoot', 'melee']) if (!poses[k].length) poses[k] = poses.idle;
          const f0 = poses.idle[0];
          const base = meta?.base || meta || { w: f0.width, h: f0.height, footY: f0.height, cx: f0.width / 2, figH: f0.height };
          const sup = poses.super.length && meta?.super ? { ...meta.super, figH: base.figH } : null;
          if (!sup) poses.super = poses.melee;
          B.poseArt = { ...poses, meta: base, superMeta: sup || base };
        }
      } catch { B.poseArt = null; }
    }
    B.guardian = Sprites.guardianRig(p.cls, vis, B.slotPal); // part-based rig (animated)
    const gc = p.ghost ? await Sprites.iconColor(img(p.ghost.i)) : null;
    B.ghostSprite = Sprites.ghostSprite(vis, gc ? { A: gc, a: Sprites.shade(gc, -50) } : null);
    B.weapons = {};
    for (const k of ['kin', 'ene', 'pow']) {
      const d = p.items[k]?.def;
      if (d) B.weapons[k] = Sprites.weaponSprite(d.is, DT_ELEMENT[d.dt] || 'kin');
    }

    // ---- geometry ----
    // Player on the lower left facing right, enemies on the right (Mobius-style diagonal)
    const PX = 118, PY = 180, PSC = 1.4; // player feet + sprite scale (64px art) — left of the landscape field
    const pBox = () => {
      const s = B.guardian.sprite;
      const w = s.width * PSC, h = s.height * PSC;
      const dodge = Math.sin(B.pDodge * Math.PI) * 18;
      const dash = Math.sin(B.pDash * Math.PI);
      const cx = PX - dodge + dash * 62;
      return { x: cx - w / 2, y: PY - h - dash * 64, w, h, cx, dash };
    };
    const handPos = () => { if (B.handPt) return { x: B.handPt.x, y: B.handPt.y }; const b = pBox(); const [hx, hy] = B.guardian.hand; return { x: b.x + hx * PSC, y: b.y + hy * PSC }; };
    // Character motions (pixelart.js MOTIONS): shoot / throw / punch / cast / dodge / hit / super
    const setMotion = type => { B.motion = { type, t: 0, dur: PixelArt.MOTIONS[type].dur }; };
    const eBox = e => {
      const s = e.sprites?.[0];
      const sc = (e.holo ? 2.0 : 2.2 * 34 / (s?.width || 34)) * e.scale * e.depth; // same on-screen size for 32px/48px art
      const w = (s?.width || 32) * sc, h = (s?.height || 32) * sc;
      const bob = Sprites.FLOATING.has(e.tpl) || e.holo ? Math.sin(B.time / 500 + e.phase) * 3 - 6 : 0;
      return { x: e.x - w / 2, y: e.y - h + bob, w, h, cy: e.y - h / 2 + bob };
    };

    const log = msg => { B.log.push(msg); B.log = B.log.slice(-2); $('.bt-log').innerHTML = B.log.map(esc).join('<br>'); };
    let bannerT = 0;
    // Brush-stroke banner above the HP bar with the action name (Mobius style)
    const banner = text => {
      const el = $('.m-banner');
      el.querySelector('span').textContent = text;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), 1600);
    };
    const popup = (x, y, text, color, big) => B.fx.push({ type: 'txt', x, y, text, color, t: 0, dur: 1000, big });
    const tracer = (x0, y0, x1, y1, color, w = 1.5) => B.fx.push({ type: 'beam', x0, y0, x1, y1, color, w, t: 0, dur: 180 });
    const burst = (x, y, color, n = 10, sp = 2.5) => { for (let i = 0; i < n; i++) B.fx.push({ type: 'pt', x, y, vx: (Math.random() - 0.5) * sp, vy: -Math.random() * sp, color, t: 0, dur: 450 + rand(350) }); };
    const ringFx = (x, y, color, r = 30, dur = 450) => B.fx.push({ type: 'ring', x, y, color, r, t: 0, dur });
    const lob = (x0, y0, x1, y1, color, dur = 420) => B.fx.push({ type: 'lob', x0, y0, x1, y1, color, t: 0, dur });

    async function loadWave() {
      B.enemies = st.waves[B.wave].map(k => makeEnemy(k, st.lv));
      if (p.fx === 'delay') B.enemies.forEach(e => e.counter++);
      layoutEnemies();
      await Promise.all(B.enemies.map(async e => {
        if (e.holo) {
          try { const s = await Sprites.pixelatedHologram(img(e.holo), 32); e.sprites = [s, s, s]; }
          catch { e.sprites = [0, 1, 2].map(gl => Sprites.enemySprite('servitor', 'fallen', e.weak, null, gl)); }
        } else {
          e.sprites = [0, 1, 2].map(gl => Sprites.enemySprite(e.tpl, e.fac, e.weak, e.pal, gl));
        }
      }));
      B.target = Math.max(0, B.enemies.findIndex(e => e.boss));
      $('.wv').textContent = `${B.wave + 1}/${st.waves.length}`;
      const boss = B.enemies.some(e => e.boss);
      B.banner = { text: boss ? 'WARNING' : `BATTLE ${B.wave + 1}`, t: 0, dur: 1100, color: boss ? '#ff4d4d' : '#ffd28a' };
      await sleep(900);
    }
    function layoutEnemies() {
      const n = B.enemies.length;
      const boss = B.enemies.findIndex(e => e.boss);
      const slots = n === 1 ? [[352, 184]] : n === 2 ? [[318, 174], [404, 190]] : [[296, 168], [366, 182], [436, 196]];
      let order = B.enemies.map((e, i) => i);
      if (boss >= 0 && n === 3) { order = order.filter(i => i !== boss); order.splice(1, 0, boss); }
      order.forEach((ei, si) => {
        const e = B.enemies[ei];
        const [x, y] = slots[si];
        e.x = x; e.y = y; e.depth = 0.86 + (y - 172) / 120;
        const halfW = 34 * (e.holo ? 2.0 : 2.2) * e.scale * e.depth / 2;
        e.x = Math.min(e.x, BW - halfW - 2); // keep the sprite inside the screen
      });
    }
    const alive = () => B.enemies.filter(e => e.hp > 0);
    function retarget() {
      if (B.enemies[B.target]?.hp > 0) return;
      const i = B.enemies.findIndex(e => e.hp > 0);
      B.target = i < 0 ? 0 : i;
    }
    function gainOrbs(n) {
      const pool = p.element === 'prism' ? ['arc', 'solar', 'void', 'stasis', 'strand'] : [p.element, p.element, p.element];
      const ee = DT_ELEMENT[p.items.ene?.def.dt];
      if (ee && ee !== 'kin') pool.push(ee, ee);
      pool.push('prism', 'prism');
      for (let i = 0; i < n && p.orbs.length < MAX_ORBS; i++) p.orbs.push(pick(pool));
    }
    function addSuper(v) { p.superG = clamp(p.superG + v * p.superRate, 0, 100); }

    function hit(e, base, elem, brk, opts = {}) {
      if (e.hp <= 0) return 0;
      let d = base * (0.9 + Math.random() * 0.2);
      const crit = Math.random() < p.crit + (opts.critBonus || 0);
      if (crit) d *= 1.5;
      const weak = elem === e.weak || elem === 'prism';
      if (weak) d *= 1.5;
      if (e.broken > 0) d *= 2;
      if (p.fx === 'atk') d *= 1.1;
      if (elem === p.element || (p.element === 'prism' && elem !== 'kin')) d *= 1 + (p.elBoost || 0); // skill panel 属性強化
      if (opts.ability && p.fx === 'ability') d *= 1.2;
      d = Math.round(d);
      e.hp = Math.max(0, e.hp - d);
      B.score = (B.score || 0) + d;
      B.scoreAdd = (B.scoreAdd || 0) + d;
      e.hitT = 1; e.kb = 1;
      const b = eBox(e);
      if (crit) B.fx.push({ type: 'txt', x: e.x, y: b.y + 2, text: 'CRITICAL', color: '#dff3ff', t: 0, dur: 1000, glow: '#4da3ff', size: 8 });
      popup(e.x + rand(12) - 6, b.y + 16, d.toLocaleString(), weak ? Sprites.ELEMENT_COLORS[elem] : '#ffffff', crit || opts.big);
      burst(e.x, b.cy, Sprites.ELEMENT_COLORS[elem] || '#fff', 7);
      if (e.broken <= 0 && brk > 0) {
        e.bk -= brk * (weak ? 3 : 1) * (elem === 'kin' ? 0.6 : 1) * p.brkMult;
        if (e.bk <= 0) {
          e.bk = 0; e.broken = 3; e.counter += 1;
          popup(e.x, b.y - 10, 'BREAK!', '#ffd84a', true);
          ringFx(e.x, b.cy, '#ffd84a', 34, 500);
          B.shake = 6; addSuper(15);
          log(`${e.n} をブレイク! 3ターンの間ダメージ2倍`);
        }
      }
      if (e.hp <= 0) { e.dieT = 1; burst(e.x, b.cy, '#ffffff', 18, 3.5); (B.kills ||= []).push(e); }
      return d;
    }
    function holdWeapon(k) { B.held = k; B.heldT = 1400; }
    const frameLabel = c => (c.fire?.frame ? `(${c.fire.frame.n}${c.fire.shots > 1 ? ` · ${c.fire.shots}発` : ''})` : '');
    // Fires a weapon following its frame: burst / auto / spread / charge / arrow / blade / explosive
    async function fireWeapon(c, total, brk, opts = {}) {
      const f = c.fire || { shots: 1, mode: 'single' };
      const e = B.enemies[B.target];
      const color = c.el === 'kin' ? '#fff7d0' : (Sprites.ELEMENT_COLORS[c.el] || '#fff');
      holdWeapon(c.id);
      const n = ['spread', 'blade', 'arrow', 'explosive'].includes(f.mode) ? 1 : f.shots;
      const gap = { auto: 55, burst: 70, beam: 40, arrow: 260, explosive: 320, blade: 170, spread: 110, charge: 60 }[f.mode] || 110;
      if (f.mode === 'charge') { B.fx.push({ type: 'charge', color, t: 0, dur: 380 }); await sleep(380); }
      let dealt = 0;
      for (let i = 0; i < n; i++) {
        if (e.hp <= 0) break;
        B.pAtkT = 1;
        if (f.mode !== 'blade') setMotion('shoot');
        const hp0 = handPos(), b = eBox(e);
        const tx = e.x + rand(10) - 5, ty = b.cy + rand(10) - 5;
        if (f.mode === 'spread') { for (let k = 0; k < 7; k++) tracer(hp0.x, hp0.y - 6, tx + rand(28) - 14, ty + rand(22) - 11, color, 1); }
        else if (f.mode === 'arrow' || f.mode === 'explosive') lob(hp0.x, hp0.y, tx, ty, color, gap);
        else if (f.mode === 'blade') setMotion('punch');
        else tracer(hp0.x, hp0.y - 6, tx, ty, color, f.mode === 'beam' ? 2.5 : 1.5);
        await sleep(gap);
        if (f.mode === 'explosive') { ringFx(tx, ty, color, 36, 450); B.shake = 6; }
        if (f.mode === 'blade') B.fx.push({ type: 'slash', x: e.x, y: b.cy, color, t: 0, dur: 300 });
        dealt += hit(e, total / n, c.el, brk / n, { big: opts.big && i === n - 1 });
      }
      if (f.mode === 'blade') await sleep(170);
      return dealt;
    }

    // ---- actions ----
    async function normalAttack() {
      const kin = p.items.kin?.def;
      const special = kin?.am === 2;
      const base = p.atk * (0.6 + weaponImpact(kin) / 100) * (special ? 1.6 : 1) * (1 + p.stats.weapons / 150) * (p.buffs.gunslinger ? 1.8 : 1) * itemMult(kin, p.items.kin?.inv);
      p.buffs.gunslinger = 0;
      await fireWeapon(C.kin, base, 6);
      const n = (special ? 1 : 2) + (p.fx === 'orb' ? 1 : 0);
      gainOrbs(n);
      addSuper(6);
      log(`${C.kin.name}${frameLabel(C.kin)} → エレメント +${n}`);
      banner(C.kin.fire?.frame ? `${C.kin.fire.frame.n}${C.kin.fire.shots > 1 ? ' ×' + C.kin.fire.shots : ''}` : C.kin.name);
    }
    async function useCard(c) {
      pay(p, c.cost);
      banner(c.name);
      const color = Sprites.ELEMENT_COLORS[c.el] || '#fff';
      if (c.id === 'ene' || c.id === 'pow') {
        const e = B.enemies[B.target];
        const d = await fireWeapon(c, p.atk * c.mult, c.brk, { big: c.id === 'pow' });
        if (c.id === 'pow') { const b = eBox(e); ringFx(e.x, b.cy, color, 40, 500); B.shake = 7; B.flash = 0.35; }
        log(`${c.name}${frameLabel(c)}! ${d.toLocaleString()} ダメージ`);
      } else if (c.id === 'mel') {
        const e = B.enemies[B.target], b = eBox(e);
        setMotion('punch');
        await sleep(240);
        ringFx(e.x, b.cy, color, 22, 300);
        B.fx.push({ type: 'slash', x: e.x, y: b.cy, color, t: 0, dur: 300 });
        const d = hit(e, p.atk * c.mult, c.el, c.brk, { ability: true });
        B.shake = 4;
        log(`${c.name}! ${d.toLocaleString()} ダメージ`);
        await sleep(240);
      } else if (c.id === 'gre') {
        setMotion('throw');
        await sleep(320);
        const h = handPos();
        const ts = alive();
        const cx = ts.reduce((a, t) => a + t.x, 0) / ts.length, cy = ts.reduce((a, t) => a + eBox(t).cy, 0) / ts.length;
        lob(h.x, h.y, cx, cy, color);
        await sleep(420);
        ringFx(cx, cy, color, 60, 600);
        burst(cx, cy, color, 24, 4);
        B.shake = 6; B.flash = 0.25;
        let total = 0;
        for (const t of ts) total += hit(t, p.atk * c.mult, c.el, c.brk, { ability: true });
        log(`${c.name}! 合計 ${total.toLocaleString()} ダメージ`);
      } else if (c.id === 'cls') {
        const m = 1 + p.stats.cls / 100;
        setMotion(p.cls === 1 ? 'dodge' : 'cast');
        if (p.cls === 0) {
          p.buffs.barricade = 2;
          B.fx.push({ type: 'wall', t: 0, dur: 99999, color });
          log(`${c.name}: 2ターンの間 被ダメージ 50% カット`);
        } else if (p.cls === 1) {
          p.buffs.evade = 1; p.buffs.gunslinger = 1;
          log(`${c.name}: 次の攻撃を回避 & 次の通常攻撃が強化`);
        } else {
          const v = Math.round(p.maxHp * 0.22 * m * p.healMult);
          p.hp = Math.min(p.maxHp, p.hp + v); p.buffs.regen = 3;
          B.fx.push({ type: 'rift', t: 0, dur: 1600, color });
          popup(PX, PY - 100, '+' + v, '#6ee07a', true);
          log(`${c.name}: HP ${v} 回復 + 3ターン継続回復`);
        }
        addSuper(6);
        await sleep(300);
        return;
      }
      addSuper(10);
    }
    async function useSuper() {
      const s = p.abil.sup;
      const color = Sprites.ELEMENT_COLORS[p.element] || '#fff';
      p.superG = 0;
      banner(s?.n || 'SUPER');
      B.superFx = { t: 0, dur: 2100, color, name: s?.n || 'SUPER', icon: s };
      // cut-in first, then the super pose: charge → release (impact) → hold
      await sleep(850);
      setMotion('super');
      await sleep(600);
      const ts = alive();
      for (const t of ts) { const b = eBox(t); ringFx(t.x, b.cy, color, 70, 700); burst(t.x, b.cy, color, 30, 5); }
      B.shake = 14; B.flash = 1;
      let total = 0;
      for (const t of ts) total += hit(t, p.atk * 6.5 * (1 + p.stats.super / 150), p.element, 40, { big: true });
      log(`スーパー「${s?.n || ''}」! 合計 ${total.toLocaleString()} ダメージ`);
      await sleep(1000);
    }
    // Guard ring: spend all orbs of the most plentiful element (max 8) → defensive buff by element
    async function guard(chosen) {
      const counts = {};
      p.orbs.forEach(o => { counts[o] = (counts[o] || 0) + 1; });
      const el = chosen && counts[chosen] ? chosen : ORB_ORDER.filter(e => counts[e]).sort((a, b) => counts[b] - counts[a])[0];
      if (!el) return;
      const n = Math.min(8, counts[el]);
      for (let i = 0; i < n; i++) p.orbs.splice(p.orbs.indexOf(el), 1);
      const def = Content.GUARD[el];
      banner(def.n);
      const color = Sprites.ELEMENT_COLORS[el];
      if (el === 'arc') p.buffs.evadeUp = { v: Math.min(0.6, 0.1 * n), t: 2 };
      else if (el === 'solar') p.buffs.armor = { v: Math.min(0.5, 0.08 * n), t: 2 };
      else if (el === 'void') p.shield = (p.shield || 0) + Math.round(p.maxHp * 0.06 * n);
      else if (el === 'stasis') { p.buffs.armor = { v: Math.min(0.4, 0.06 * n), t: 2 }; if (n >= 4) alive().forEach(e => e.counter++); }
      else if (el === 'strand') { p.buffs.armor = { v: Math.min(0.35, 0.05 * n), t: 2 }; p.buffs.weave = { v: 0.02 * n, t: 3 }; }
      else { const v = Math.round(p.maxHp * 0.07 * n * p.healMult); p.hp = Math.min(p.maxHp, p.hp + v); popup(PX, PY - 100, '+' + v, '#6ee07a', true); }
      B.fx.push({ type: 'guard', t: 0, dur: 900, color });
      burst(PX, PY - 50, color, 20, 3);
      log(`${def.n}(${ELEMENT_NAME[el]} ×${n}): ${def.d}`);
      await sleep(400);
    }

    // ---- enemy phase ----
    async function enemyPhase() {
      for (const e of alive()) {
        if (e.broken > 0) { e.broken--; if (e.broken === 0) e.bk = Content.enemyDef(e.key).brk; continue; }
        e.counter--;
        if (e.counter > 0) continue;
        e.counter = e.spd;
        e.atkT = 1;
        await sleep(180);
        const b = eBox(e);
        const shotColor = e.holo ? '#8fe8ff' : Sprites.ELEMENT_COLORS[e.weak];
        tracer(e.x, b.cy, PX + rand(16) - 8, PY - 60, shotColor, 2);
        await sleep(120);
        const evade = p.evade + (p.buffs.evadeUp?.v || 0);
        if (p.buffs.evade || Math.random() < evade) {
          p.buffs.evade = 0;
          popup(PX, PY - 90, 'MISS', '#e2c770');
          log(`${e.n} の攻撃を回避した`);
        } else {
          let d = e.atkV * (0.9 + Math.random() * 0.2) * (1 - p.dr) * (e.boss ? 1.25 : 1);
          if (p.buffs.barricade) d *= 0.5;
          if (p.buffs.armor) d *= 1 - p.buffs.armor.v;
          d = Math.round(d);
          if (p.shield) { const ab = Math.min(p.shield, d); p.shield -= ab; d -= ab; if (ab) popup(PX + 14, PY - 104, `-${ab} 🛡`, '#c9a6ff'); }
          p.hp = Math.max(0, p.hp - d);
          B.pHitT = 1; B.shake = 5; B.hurtT = 1;
          if (!B.motion) setMotion('hit');
          if (d) popup(PX, PY - 90, '-' + d, '#ff5d5d', d > p.maxHp * 0.2);
          addSuper(4);
          log(`${e.n} の攻撃! ${d} ダメージ`);
        }
        await sleep(240);
        if (p.hp <= 0) return;
      }
      if (p.buffs.barricade && --p.buffs.barricade <= 0) B.fx = B.fx.filter(f => f.type !== 'wall');
      for (const k of ['armor', 'evadeUp']) if (p.buffs[k] && --p.buffs[k].t <= 0) delete p.buffs[k];
      if (p.buffs.regen) { const v = Math.round(p.maxHp * 0.06 * p.healMult); p.hp = Math.min(p.maxHp, p.hp + v); popup(PX - 16, PY - 110, '+' + v, '#6ee07a'); p.buffs.regen--; }
      if (p.buffs.weave) { const v = Math.round(p.maxHp * p.buffs.weave.v * p.healMult); p.hp = Math.min(p.maxHp, p.hp + v); popup(PX + 16, PY - 110, '+' + v, '#5fd970'); if (--p.buffs.weave.t <= 0) delete p.buffs.weave; }
    }

    // ---- turn driver ----
    async function doAction(fn) {
      if (B.busy || B.done) return;
      B.busy = true; updateHud();
      await fn();
      updateHud();
      await sleep(220);
      if (!alive().length) {
        await sleep(400);
        if (B.wave + 1 < st.waves.length) { B.wave++; await loadWave(); }
        else { B.done = 'win'; B.banner = { text: 'MISSION CLEAR', t: 0, dur: 99999, color: '#ffd28a' }; return finish(); }
      } else {
        retarget();
        await enemyPhase();
        if (p.hp <= 0) { B.done = 'lose'; B.banner = { text: 'DEFEATED', t: 0, dur: 99999, color: '#ff5d5d' }; return finish(); }
      }
      B.busy = false; updateHud();
    }

    let resolveBattle;
    const battleDone = new Promise(r => { resolveBattle = r; });
    let running = true;
    async function finish() {
      updateHud();
      await sleep(1300);
      running = false;
      clearInterval(autoTimer);
      if (B.done !== 'win') return resolveBattle({ win: false });
      const first = !S.cleared[st.id];
      const glimmer = Math.round((Math.round(st.reward * (first || st.farm ? 1 : 0.6)) + (first ? 500 : 0)) * (p.gp.has('glim') ? 1.25 : 1));
      S.glimmer += glimmer;
      const job = jobById(p.job.id);
      const xp = Math.round(30 * st.lv * (p.gp.has('xp') ? 1.25 : 1));
      const levelUp = gainJobXp(job, xp);
      const drops = [];
      if (st.drop && (Math.random() < st.drop.chance || (st.drop.first && first))) {
        const it = rollDropItem(st);
        if (it?.outfit) drops.push(grantOutfit(it.outfit));
        else if (it) drops.push(grantItem(it, 'drop'));
      }
      // Element shards (skill panel currency): each defeated enemy drops its weakness element
      S.shards ||= {};
      const shards = {};
      for (const e of B.kills || []) { const k = e.weak === 'kin' ? 'light' : e.weak; shards[k] = (shards[k] || 0) + (e.boss ? 3 : 1); }
      shards.light = (shards.light || 0) + st.waves.length;
      for (const k in shards) S.shards[k] = (S.shards[k] || 0) + shards[k];
      save();
      resolveBattle({ win: true, glimmer, xp, levelUp, lv: job.lv, drops, shards });
    }

    // ---- HUD (landscape: mission / boss / guardian / element drive / ability cards) ----
    const segs = c => c.kind === 'normal' ? '<span class="lbl">通常</span>'
      : Object.entries(c.cost).flatMap(([e, n]) => Array.from({ length: n }, () => `<i data-e="${e}"></i>`)).join('');
    const WLABEL = { kin: 'キネティック', ene: 'エネルギー', pow: 'パワー' };
    const wpnBtn = k => C[k] ? `<button type="button" class="abtn wpn" data-id="${k}" aria-label="${esc(C[k].name)}">
        <span class="ic">${C[k].icon ? `<img src="${img(C[k].icon)}" alt="">` : ''}</span><span class="segs">${segs(C[k])}</span><small>${WLABEL[k]}</small></button>`
      : `<div class="abtn wpn empty"><small>${WLABEL[k]}</small></div>`;
    $('.bt-left').innerHTML = ['kin', 'ene', 'pow'].map(wpnBtn).join('');
    const ABL = { mel: '近接', gre: 'グレネード', cls: 'クラス' };
    const short = t => { const x = String(t || '').replace(/\s+/g, ' '); return x.length > 34 ? x.slice(0, 33) + '…' : x; };
    const elName = e => (e === 'any' || !e ? '' : ELEMENT_NAME[e] || '');
    const cardHtml = (k, c, plug) => {
      const cost = c?.cost ? Object.values(c.cost).reduce((a2, b2) => a2 + b2, 0) : 0;
      const el2 = c?.el || p.element;
      return `<button type="button" class="abtn skl L-card" data-id="${k}" style="--c:${Sprites.ELEMENT_COLORS[el2] || '#ccc'}" aria-label="${esc(c?.name || '')}">
        <span class="L-gemc">${cost}</span><span class="ic">${c?.icon ? `<img src="${img(c.icon)}" alt="">` : ''}</span>
        <b>${esc(c?.name || '-')}</b><small>${esc(short(plug?.d))}</small><span class="segs">${c ? segs(c) : ''}</span>
        <em>${esc(ABL[k])}${elName(el2) ? ' · ' + elName(el2) : ''}</em></button>`;
    };
    const sup = p.abil.sup;
    $('.bt-right').innerHTML = `<button type="button" class="L-card spcard" style="--c:${Sprites.ELEMENT_COLORS[p.element] || '#ffd36a'}" aria-label="スーパー">
        <span class="L-gemc">S</span><span class="ic">${sup ? `<img src="${img(sup.i)}" alt="">` : ''}</span>
        <b>${esc(sup?.n || 'スーパー')}</b><small>${esc(short(sup?.d))}</small><span class="L-spg"><i></i></span><em>スーパー · ${esc(ELEMENT_NAME[p.element] || '')}</em></button>`
      + ['gre', 'mel', 'cls'].map(k => C[k] ? cardHtml(k, C[k], p.abil[k]) : '<div class="L-card empty"></div>').join('');
    $$('.abtn[data-id]').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      const c = C[b.dataset.id];
      if (c.kind === 'normal') doAction(normalAttack);
      else doAction(() => useCard(c));
    });
    $('.spcard').onclick = ev => { ev.stopPropagation(); if (p.superG >= 100 && p.abil.sup) doAction(useSuper); else toast('スーパーゲージが溜まると使えます'); };
    // Element drive: tap an element = spend it for its defensive effect
    $$('.L-gem').forEach(b => b.onclick = ev => { ev.stopPropagation(); const e = b.dataset.e; if (!p.orbs.includes(e)) { toast(`${ELEMENT_NAME[e]}のエレメントがありません`); return; } doAction(() => guard(e)); });
    const BUFF_ICONS = [
      ['barricade', '#79bbff', 'shield'], ['armor', '#ff8a1e', 'shield'], ['evadeUp', '#79bbff', 'speed'],
      ['weave', '#5fd970', 'heal'], ['regen', '#5fd970', 'heal'], ['gunslinger', '#e2c770', 'up'], ['evade', '#e2c770', 'speed'],
    ];
    const fmt = n => Math.round(n).toLocaleString();
    function updateHud() {
      const busy = B.busy || !!B.done;
      // guardian
      $('.m-hpv').innerHTML = `${fmt(p.hp)} / ${fmt(p.maxHp)}`;
      $('.m-hpbar-i').style.width = (p.hp / p.maxHp * 100) + '%';
      const shMax = Math.max(1, Math.round(p.maxHp * 0.5));
      $('.L-shd').style.width = Math.min(100, (p.shield || 0) / shMax * 100) + '%';
      $('.L-shdv').textContent = `${fmt(p.shield || 0)} / ${fmt(shMax)}`;
      const sp = $('.sp');
      sp.style.setProperty('--g', p.superG + '%');
      sp.disabled = busy || p.superG < 100 || !p.abil.sup;
      sp.classList.toggle('ready', p.superG >= 100 && !busy);
      const spc = $('.spcard');
      spc.querySelector('.L-spg i').style.width = p.superG + '%';
      spc.classList.toggle('ready', p.superG >= 100 && !busy && !!p.abil.sup);
      spc.disabled = busy;
      $('.score').textContent = (B.score || 0).toLocaleString();
      if (B.scoreAdd) { const sa = $('.m-scoreadd'); sa.textContent = '+' + B.scoreAdd.toLocaleString(); sa.classList.remove('show'); void sa.offsetWidth; sa.classList.add('show'); B.scoreAdd = 0; }
      // elements: counts per element (top) and the element drive gems (bottom)
      const cnt = {};
      p.orbs.forEach(o => { cnt[o] = (cnt[o] || 0) + 1; });
      $('.m-orbs').innerHTML = ORB_ORDER.map(e => `<span class="L-oc ${cnt[e] ? '' : 'zero'}"${icAttr(e)} style="--c:${Sprites.ELEMENT_COLORS[e]}"><i></i><b>${cnt[e] || 0}</b></span>`).join('')
        + `<span class="L-ototal">${p.orbs.length}/${MAX_ORBS}</span>`;
      $$('.L-gem').forEach(b => { const n = cnt[b.dataset.e] || 0; b.querySelector('b').textContent = n; b.disabled = busy || !n; });
      // target / boss panel
      const t = B.enemies[B.target];
      if (t && t.hp > 0) {
        const max = Content.enemyDef(t.key).brk;
        $('.L-bname').textContent = t.n;
        $('.L-bhp').style.width = (t.hp / t.maxHp * 100) + '%';
        $('.L-bhpv').textContent = `${fmt(t.hp)} / ${fmt(t.maxHp)}`;
        $('.m-dots').innerHTML = Array.from({ length: t.spd }, (_, i) => `<span class="${i < t.counter ? 'on' : ''}"></span>`).join('');
        $('.m-brk i').style.width = (t.broken > 0 ? 100 : (1 - t.bk / max) * 100) + '%';
        $('.m-brk').classList.toggle('broken', t.broken > 0);
        $('.L-bbrk').textContent = t.broken > 0 ? 'BREAK!' : `${Math.round((1 - t.bk / max) * 100)}%`;
        $('.m-cnt').textContent = t.broken > 0 ? 'B' : t.counter;
        const wc = Sprites.ELEMENT_COLORS[t.weak];
        $('.m-tinfo').innerHTML = `<span style="color:${wc}">${elIcon(t.weak) || `<i style="background:${wc}"></i>`}${ELEMENT_NAME[t.weak]}弱点</span>`
          + (t.boss ? '<span class="bossc">ボス</span>' : '') + (t.broken > 0 ? '<span class="brkc">BREAK中 · ダメージ2倍</span>' : '');
      }
      // ability cards / weapons: lit cost segments, usable state
      $$('.abtn[data-id]').forEach(b => {
        const c = C[b.dataset.id];
        const ok = c.kind === 'normal' || canPay(p.orbs, c.cost);
        b.disabled = busy || !ok;
        b.classList.toggle('ready', ok && !B.busy && c.kind !== 'normal');
        const left = { ...cnt };
        let anyLeft = p.orbs.length;
        b.querySelectorAll('i[data-e]').forEach(seg => {
          const e = seg.dataset.e;
          let lit = false;
          if (e === 'any') { lit = anyLeft-- > 0; seg.style.background = lit ? '#e8e8e8' : ''; }
          else { lit = (left[e] || 0) > 0; if (lit) left[e]--; seg.style.background = lit ? Sprites.ELEMENT_COLORS[e] : ''; }
        });
      });
      $('.m-buffs').innerHTML = BUFF_ICONS.filter(([k]) => p.buffs[k]).map(([, col]) => `<span style="border-color:${col};background:linear-gradient(${Sprites.shade(col, -40)},${Sprites.shade(col, -110)})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M12 20V6M6 12l6-6 6 6"/></svg></span>`).join('')
        + (p.shield ? `<span style="border-color:#b084eb;background:linear-gradient(#5a3a8a,#24143a)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/></svg></span>` : '');
      $('.m-auto').classList.toggle('on', !!B.auto);
    }
    $('.sp').onclick = () => doAction(useSuper);
    const flee = () => { B.done = 'lose'; running = false; clearInterval(autoTimer); resolveBattle({ win: false }); };
    $('.m-help').onclick = () => {
      const m = el(`<div class="modal"><div class="panel">
        <div class="row"><b style="color:var(--accent)">HELP</b><span class="grow"></span><button class="pbtn small x">閉じる</button></div>
        <ul style="line-height:1.9;padding-left:18px;margin:12px 0">
          <li>画面タップ:通常攻撃(キネティック武器)。敵をタップでターゲット切替</li>
          <li>通常攻撃でエレメントが溜まる(画面上部)</li>
          <li>左下:キネティック(通常) / エネルギー / パワー武器、右下カード:スーパー / グレネード / 近接 / クラス(左上の数字=必要エレメント)</li>
          <li>弱点エレメントでブレイクゲージを削り、BREAK でダメージ2倍</li>
          <li>SUPER:ゲージ満タンでタップ / ELEMENT DRIVE:属性をタップしてエレメントを消費、属性ごとの防御効果</li>
          <li>AUTO:自動で戦闘 / TARGET:ターゲット切替</li>
        </ul>
        <button class="pbtn fl" style="border-color:var(--bad);color:var(--bad)">撤退する(報酬なし)</button></div></div>`);
      m.querySelector('.x').onclick = () => m.remove();
      m.querySelector('.fl').onclick = () => { m.remove(); flee(); };
      document.body.appendChild(m);
    };
    $('.m-tv').onclick = () => {
      const al = B.enemies.map((e, i) => i).filter(i => B.enemies[i].hp > 0);
      if (!al.length) return;
      B.target = al[(al.indexOf(B.target) + 1) % al.length];
      updateHud();
    };
    // FULL AUTO: super when ready → guard when low → best affordable card (weakness first) → normal attack
    let autoTimer = 0;
    const autoStep = () => {
      if (!B.auto || B.busy || B.done) return;
      if (p.superG >= 100 && p.abil.sup) return doAction(useSuper);
      if (p.hp < p.maxHp * 0.35 && p.orbs.length >= 3) return doAction(() => guard());
      const t = B.enemies[B.target];
      const cards = ['pow', 'gre', 'mel', 'ene'].map(k => C[k]).filter(c => c && canPay(p.orbs, c.cost));
      const pickC = cards.find(c => t && c.el === t.weak) || cards[0];
      if (pickC) return doAction(() => useCard(pickC));
      return doAction(normalAttack);
    };
    $('.m-auto').onclick = () => {
      B.auto = !B.auto;
      clearInterval(autoTimer);
      if (B.auto) autoTimer = setInterval(autoStep, 250);
      updateHud();
    };
    // Tap: enemy = target + attack, elsewhere = attack current target
    canvas.addEventListener('pointerup', ev => {
      const r = canvas.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width * BW, y = (ev.clientY - r.top) / r.height * BH;
      const idx = B.enemies.findIndex(e => { if (e.hp <= 0) return false; const b = eBox(e); return x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 16 && y <= b.y + b.h + 4; });
      if (idx >= 0) B.target = idx;
      doAction(normalAttack);
    });

    // ---- render ----
    let last = performance.now();
    function frame(now) {
      if (!running) return;
      const dt = Math.min(50, now - last); last = now; B.time += dt;
      try { draw(dt); } catch (err) { console.error(err); g.setTransform(1, 0, 0, 1, 0, 0); }
      requestAnimationFrame(frame);
    }
    function bar(x, y, w, h, v, color, bgc = '#000') {
      g.fillStyle = '#05070a'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = bgc; g.fillRect(x, y, w, h);
      g.fillStyle = color; g.fillRect(x, y, Math.max(0, w * v), h);
    }
    function txt(s, x, y, size, color, align = 'center', serif = false) {
      g.font = serif ? `800 ${size}px Cinzel, serif` : `700 ${size}px 'Noto Sans JP', sans-serif`; g.textAlign = align;
      g.fillStyle = '#000'; g.fillText(s, x + 0.6, y + 0.6);
      g.fillStyle = color; g.fillText(s, x, y);
    }
    function drawEnemy(e, i, dt) {
      if (!e.sprites || (e.hp <= 0 && e.dieT <= 0)) return; // sprites load asynchronously
      const b = eBox(e);
      e.atkT = Math.max(0, e.atkT - dt / 320);
      e.kb = Math.max(0, e.kb - dt / 220);
      const lunge = Math.sin(e.atkT * Math.PI);
      const grow = 1 + lunge * 0.14;
      const w = b.w * grow, h = b.h * grow;
      const feetY = b.y + b.h + lunge * 6 - e.kb * 3;
      g.save();
      if (e.dieT > 0 && e.hp <= 0) { g.globalAlpha = e.dieT; e.dieT = Math.max(0, e.dieT - dt / 600); }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(e.x, e.y + 1, w * 0.32, 3 * e.depth, 0, 0, Math.PI * 2); g.fill();
      if (e.boss) { g.fillStyle = (e.aura || '#ffd28a') + '30'; g.beginPath(); g.ellipse(e.x, b.cy, w * 0.6, h * 0.55, 0, 0, Math.PI * 2); g.fill(); }
      const glow = Math.floor((Math.sin(B.time / 260 + e.phase) + 1) * 1.5) % 3;
      const spr = e.sprites[glow] || e.sprites[0];
      const sink = e.hp <= 0 ? (1 - e.dieT) * 10 : 0;
      if (spr.illus) {
        // smooth illustration: whole-image breathing + top sway (row slicing would band when downscaled)
        const br = 1 + Math.sin(B.time * 0.0028 + e.phase) * 0.025;
        const sw = Math.sin(B.time * 0.0021 + e.phase) * 1.1 / h;
        g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.transform(1, 0, -sw, br, e.x, feetY + sink);
        g.drawImage(spr, -w / 2, -h, w, h);
        g.restore();
      } else Sprites.drawLive(g, spr, e.x, feetY + sink, w, h, B.time, { phase: e.phase, breath: 0.03, sway: 1.1, speed: 0.0028 });
      if (e.hitT > 0) {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = e.hitT * 0.75; g.imageSmoothingEnabled = !!spr.illus;
        g.drawImage(spr, e.x - w / 2, feetY - h, w, h);
        e.hitT = Math.max(0, e.hitT - dt / 180);
      }
      g.restore();
      if (e.hp <= 0) return;
      // HP / break / turn counter
      const bw = Math.max(30, Math.min(58, w * 0.9));
      const top = Math.max(26, b.y - 12);
      const ux = clamp(e.x, bw / 2 + 4, BW - bw / 2 - 12);
      if (i === B.target) txt(e.n, ux, top - 2, e.boss ? 7 : 6, e.boss ? '#ffd28a' : '#ffffff');   // full info is in the boss panel
      bar(ux - bw / 2, top, bw, 3, e.hp / e.maxHp, '#ff5d5d', '#300');
      bar(ux - bw / 2, top + 4.5, bw, 2, e.broken > 0 ? 1 : e.bk / Content.enemyDef(e.key).brk, e.broken > 0 ? '#ffd84a' : Sprites.ELEMENT_COLORS[e.weak], '#111');
      const cx = ux + bw / 2 + 6;
      g.fillStyle = e.broken > 0 ? '#ffd84a' : e.counter <= 1 ? '#ff3b3b' : '#1c2433';
      g.beginPath(); g.arc(cx, top + 2.5, 4.5, 0, Math.PI * 2); g.fill();
      txt(e.broken > 0 ? 'B' : String(e.counter), cx, top + 5, 7, e.broken > 0 || e.counter <= 1 ? '#000' : '#fff');
      if (i === B.target && !B.done) {
        const ty = b.y + b.h * 0.45;
        const k = (Math.sin(B.time / 160) + 1) * 2;
        g.strokeStyle = '#ffd28a'; g.lineWidth = 1;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const x0 = e.x + sx * (w * 0.42 + k), y0 = ty + sy * (h * 0.42 + k);
          g.beginPath(); g.moveTo(x0, y0 - sy * 5); g.lineTo(x0, y0); g.lineTo(x0 - sx * 5, y0); g.stroke();
        }
      }
    }
    function drawPlayer(dt) {
      const b = pBox();
      B.pAtkT = Math.max(0, B.pAtkT - dt / 200);
      B.pHitT = Math.max(0, B.pHitT - dt / 400);
      if (B.pDash > 0) B.pDash = B.pDash + dt / 320 >= 1 ? 0 : B.pDash + dt / 320;
      if (B.pDodge > 0) B.pDodge = B.pDodge + dt / 420 >= 1 ? 0 : B.pDodge + dt / 420;
      if (B.heldT > 0) { B.heldT -= dt; if (B.heldT <= 0) B.held = 'kin'; }
      // Pose = idle (breathing, aim at the target) + current motion. Feet stay planted unless the motion moves the body.
      let mp = {};
      if (B.motion) {
        B.motion.t += dt;
        const k = B.motion.t / B.motion.dur;
        if (k >= 1) B.motion = null; else mp = PixelArt.motionPose(B.motion.type, k);
      }
      const t = B.enemies[B.target];
      let aim = 0;
      if (t && t.hp > 0) {
        const tb = eBox(t);
        const sx = b.x + B.guardian.layers.find(L => L.id === 'nearArm').pivot[0] * PSC, sy = b.y + B.guardian.layers.find(L => L.id === 'nearArm').pivot[1] * PSC;
        aim = clamp(Math.atan2(tb.cy - sy, t.x - sx), -0.95, 0.3);
      }
      const pose = {
        dx: mp.dx || 0, dy: mp.dy || 0, lean: mp.lean || 0,
        breath: Math.sin(B.time / 520) * 0.6,
        na: aim + (mp.na || 0), nadx: mp.nadx || 0,
        fa: Math.sin(B.time / 700) * 0.06 + (mp.fa || 0),
        nl: mp.nl || 0, fl: mp.fl || 0, hd: Math.sin(B.time / 900) * 0.03 + (mp.hd || 0),
      };
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.ellipse(b.cx + pose.dx * PSC, PY + 1, 26 * Math.max(0.5, 1 - Math.abs(pose.dy) / 40), 5, 0, 0, Math.PI * 2); g.fill();
      const wsp = B.weapons[B.held] || B.weapons.kin;
      const weapon = wsp ? { sprite: wsp.sprite, gx: wsp.gx, gy: wsp.gy, scale: 0.85, flash: B.pAtkT > 0.5 ? B.pAtkT : 0 } : null;
      const ox = PX - 33 * PSC, oy = PY - 62 * PSC;
      const blink = B.pHitT > 0 && Math.floor(B.time / 60) % 2;
      if (B.poseArt) {
        // one-piece outfit art: the pose image for the current motion, whole body moved (feet on the ground)
        const A = B.poseArt, mt = B.motion?.type;
        const M = mt === 'super' ? A.superMeta : A.meta;
        const set = mt === 'shoot' ? A.shoot : mt === 'punch' || mt === 'throw' ? A.melee : mt === 'super' ? A.super : null;
        // action: frames 1→2→3 across the motion; idle: 1-2-3-2 loop
        const fi = set ? Math.min(set.length - 1, Math.floor((B.motion.t / B.motion.dur) * set.length)) : [0, 1, 2, 1][Math.floor(B.time / 260) % 4] % A.idle.length;
        const im = (set || A.idle)[fi];
        const sc = (64 * PSC * 1.05) / M.figH;   // idle figure height → on-screen height
        // the frames already contain the motion, so only a little extra body motion is added
        const fx = b.cx + pose.dx * PSC * 0.35, fy = PY + Math.min(0, pose.dy) * PSC * 0.3;
        if (!blink) {
          g.save(); g.translate(fx, fy); g.rotate(pose.lean * 0.3);
          g.imageSmoothingEnabled = true; g.drawImage(im, -M.cx * sc, -M.footY * sc, M.w * sc, M.h * sc); g.imageSmoothingEnabled = false;
          g.restore();
        }
        B.handPt = { x: fx + M.figH * sc * 0.32, y: fy - M.figH * sc * 0.6 };
        if (mt === 'super' && A.superMeta.anchors) {
          const an = A.superMeta.anchors[`${B.superPose[0]}_${fi + 1}`];
          if (an) {
            const P = ([x, y]) => [fx + (x - M.cx) * sc, fy + (y - M.footY) * sc];
            drawSuperProp(fi, B.motion.t / B.motion.dur, P(an.hand), an.ang, P(an.far), [fx, fy], sc);
          }
        }
      } else if (!blink) {
        B.handPt = Sprites.drawRig(g, B.guardian, ox, oy, PSC, pose, weapon);
        if (B.motion?.type === 'super' && B.handPt) {   // rig: the prop in the near hand, pointing at the enemies
          const k = B.motion.t / B.motion.dur, fi = Math.min(2, Math.floor(k * 3));
          drawSuperProp(fi, k, [B.handPt.x, B.handPt.y], fi === 0 && B.superPose[0] !== 'slam' ? 150 : 90, [B.handPt.x - 14, B.handPt.y + 4], [b.cx, PY], 0.35);
        }
      }
      // Ghost
      const gy = b.y + 18 + Math.sin(B.time / 380) * 4;
      g.drawImage(B.ghostSprite, b.x - 2, gy - 14, 16, 16);
      // Defensive visuals
      const col = el => Sprites.ELEMENT_COLORS[el];
      if (p.shield) { g.strokeStyle = col('void'); g.globalAlpha = 0.6 + Math.sin(B.time / 200) * 0.2; g.lineWidth = 1.5; g.beginPath(); g.ellipse(b.cx, b.y + b.h / 2, b.w * 0.55, b.h * 0.55, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if (p.buffs.armor) { g.fillStyle = (p.buffs.weave ? col('strand') : col('solar')) + '28'; g.fillRect(b.x + 6, b.y + 4, b.w - 12, b.h - 8); }
      if (p.buffs.evadeUp && Math.random() < 0.3) burst(b.cx + rand(40) - 20, b.y + rand(b.h), col('arc'), 1, 1);
    }
    /* Super prop: the summoned Light weapon / beam / orb / shockwave drawn over the super pose frames.
     * fi = frame (0..2), k = super progress 0..1, hand = near hand, ang = forearm angle (deg from straight
     * down, + = toward the enemies), far = other hand, foot = feet, sc = art scale (sizes follow the figure). */
    function drawSuperProp(fi, k, hand, ang, far, foot, sc) {
      const [pat, prop] = B.superPose;
      const col = Sprites.ELEMENT_COLORS[p.element] || '#f3ecd0';
      const a = ang * Math.PI / 180, ux = Math.sin(a), uy = Math.cos(a);   // forearm direction
      const S = Math.max(0.6, sc / 0.35);                                    // size factor (≈1 for the rig)
      const [hx, hy] = hand, t = B.time;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.shadowColor = col; g.shadowBlur = 8;
      g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      const line = (x1, y1, x2, y2, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
      const dot = (x, y, r, al = 1) => { g.globalAlpha = al; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };
      const along = d => [hx + ux * d * S, hy + uy * d * S];
      if (pat === 'beam') {
        if (fi === 0) dot(hx, hy, (3 + k * 12) * S);
        else if (prop === 'lightning') {
          g.lineWidth = 2 * S; g.beginPath(); g.moveTo(hx, hy);
          for (let i = 1; i <= 8; i++) { const [x, y] = along(i * 14); g.lineTo(x + (Math.random() - 0.5) * 10 * S, y + (Math.random() - 0.5) * 10 * S); }
          g.stroke(); dot(hx, hy, 4 * S);
        } else {
          const [x2, y2] = along(240);
          line(hx, hy, x2, y2, (7 + Math.sin(t / 40) * 2) * S);
          g.strokeStyle = '#ffffff'; line(hx, hy, x2, y2, 2.5 * S); dot(hx, hy, 6 * S);
        }
      } else if (pat === 'orb') {
        const mx = (hx + far[0]) / 2, my = (hy + far[1]) / 2;
        if (prop === 'needles') {
          for (let i = 0; i < 6; i++) { const d = fi * 24 + i * 7, [x, y] = along(d); line(x, y - 4 * S + i * 1.5 * S, x + ux * 9 * S, y + uy * 9 * S - 4 * S + i * 1.5 * S, 1.5 * S); }
        } else if (fi < 2) {
          const r = (fi === 0 ? 4 + k * 18 : 9) * S, [x, y] = fi === 0 ? [mx, my] : along(18);
          dot(x, y, r); g.fillStyle = '#ffffff'; dot(x, y, r * 0.45, 0.8);
        }
      } else if (pat === 'gun') {
        if (prop === 'bow') {
          const px = -uy, py = ux;   // perpendicular
          g.lineWidth = 2.5 * S; g.beginPath();
          g.moveTo(hx + px * 13 * S, hy + py * 13 * S); g.quadraticCurveTo(hx + ux * 8 * S, hy + uy * 8 * S, hx - px * 13 * S, hy - py * 13 * S); g.stroke();
          g.globalAlpha = 0.7; line(hx + px * 13 * S, hy + py * 13 * S, hx - px * 13 * S, hy - py * 13 * S, 1); g.globalAlpha = 1;
          if (fi >= 1) { const [x2, y2] = along(fi === 2 ? 60 : 16); line(hx - ux * 6 * S, hy - uy * 6 * S, x2, y2, 2 * S); }
        } else {
          const [x2, y2] = along(15);
          line(hx, hy, x2, y2, 5 * S); line(hx, hy, hx + uy * 5 * S, hy - ux * -5 * S, 3 * S);
          if (fi === 2) { const [mx2, my2] = along(22); dot(mx2, my2, 6 * S, 0.9); }
        }
      } else if (pat === 'blade') {
        if (prop === 'shield') {
          const [x, y] = along(8); g.lineWidth = 2.5 * S; g.beginPath();
          for (let i = 0; i <= 6; i++) { const q = i / 6 * Math.PI * 2 + Math.PI / 6; g.lineTo(x + Math.cos(q) * 12 * S, y + Math.sin(q) * 14 * S); }
          g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; g.stroke();
        } else if (prop === 'staff') {
          const [x1, y1] = along(-18), [x2, y2] = along(30); line(x1, y1, x2, y2, 3 * S);
        } else if (prop === 'hammer') {
          const [x2, y2] = along(26); line(hx, hy, x2, y2, 3 * S);
          const px = -uy, py = ux; line(x2 - px * 8 * S, y2 - py * 8 * S, x2 + px * 8 * S, y2 + py * 8 * S, 8 * S);
        } else {   // sword / blades
          const [x2, y2] = along(prop === 'blades' ? 18 : 30); line(hx, hy, x2, y2, 4 * S);
          g.strokeStyle = '#ffffff'; line(hx, hy, x2, y2, 1.5 * S);
          if (prop === 'blades') { g.strokeStyle = col; line(far[0], far[1], far[0] + ux * 16 * S, far[1] + uy * 16 * S, 3 * S); }
        }
        if (fi === 1) { g.globalAlpha = 0.35; g.lineWidth = 3 * S; g.beginPath(); g.arc(foot[0], hy, 34 * S, -1.4, 0.6); g.stroke(); g.globalAlpha = 1; }   // swing arc
      } else if (pat === 'throw') {
        const d = fi === 0 ? 0 : fi === 1 ? 30 : 80, [x, y] = along(d), spin = t / 60;
        const n = prop === 'knives' ? 3 : prop === 'axe' ? 1 : 1;
        for (let i = 0; i < n; i++) {
          const ox = x + (n > 1 ? (i - 1) * 6 * S : 0), oy = y + (n > 1 ? (i - 1) * -5 * S : 0);
          g.save(); g.translate(ox, oy); g.rotate(fi ? spin : a + Math.PI);
          if (prop === 'hammer' || prop === 'axe') { line(0, -10 * S, 0, 8 * S, 2.5 * S); line(-6 * S, -10 * S, 6 * S, -10 * S, (prop === 'axe' ? 4 : 7) * S); }
          else if (prop === 'sickle') { g.lineWidth = 3 * S; g.beginPath(); g.arc(0, 0, 9 * S, 0.3, 3.6); g.stroke(); }
          else if (prop === 'staff') line(0, -18 * S, 0, 18 * S, 3 * S);
          else line(0, -8 * S, 0, 8 * S, 2.5 * S);   // dagger / knives
          g.restore();
        }
      } else if (pat === 'slam') {
        dot(hx, hy, 6 * S, 0.9); dot(far[0], far[1], 6 * S, 0.9);
        if (fi === 2) { const r = (20 + (k - 0.66) * 300) * S; g.lineWidth = 4 * S; g.globalAlpha = Math.max(0, 1 - (k - 0.66) * 3); g.beginPath(); g.ellipse(foot[0], foot[1], r, r * 0.25, 0, 0, Math.PI * 2); g.stroke(); }
      } else {   // field
        if (prop === 'well' && fi >= 1) {
          const sx = foot[0] + 14 * S; line(sx, foot[1] + 2, sx, foot[1] - 34 * S, 4 * S); line(sx - 8 * S, foot[1] - 24 * S, sx + 8 * S, foot[1] - 24 * S, 3 * S);
          g.globalAlpha = 0.25; g.beginPath(); g.ellipse(foot[0], foot[1], 70 * S, 16 * S, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
        } else if (prop === 'bubble' && fi >= 1) {
          g.globalAlpha = 0.3; g.beginPath(); g.ellipse(foot[0], foot[1], 60 * S, 70 * S, 0, Math.PI, 0); g.fill(); g.globalAlpha = 0.8; g.lineWidth = 2 * S; g.stroke();
        } else if (prop === 'implode') {
          const r = (fi === 0 ? 50 - k * 60 : 10 + (k - 0.33) * 150) * S; g.lineWidth = 3 * S; g.beginPath(); g.arc(foot[0], foot[1] - 40 * S, Math.max(4, r), 0, Math.PI * 2); g.stroke();
        } else {   // aura (and the charge frame of every field super)
          for (let i = 0; i < 8; i++) { const q = t / 300 + i * 0.8; dot(foot[0] + Math.cos(q) * 22 * S, foot[1] - 30 * S - ((t / 6 + i * 13) % 50) * S, 2.5 * S, 0.8); }
          dot(hx, hy, 4 * S); dot(far[0], far[1], 4 * S);
        }
      }
      g.restore();
    }
    function drawFx(dt) {
      B.fx = B.fx.filter(f => (f.t += dt) < f.dur);
      for (const f of B.fx) {
        const k = f.t / f.dur;
        g.save();
        if (f.type === 'beam') {
          g.strokeStyle = f.color; g.globalAlpha = 1 - k; g.lineWidth = f.w;
          g.beginPath(); g.moveTo(f.x0, f.y0); g.lineTo(f.x1, f.y1); g.stroke();
        } else if (f.type === 'pt') {
          g.fillStyle = f.color; g.globalAlpha = 1 - k;
          g.fillRect(f.x + f.vx * f.t / 16, f.y + f.vy * f.t / 16 + 0.0025 * f.t * f.t / 16, 1.6, 1.6);
        } else if (f.type === 'ring') {
          g.strokeStyle = f.color; g.globalAlpha = 1 - k; g.lineWidth = 3 * (1 - k) + 0.5;
          g.beginPath(); g.ellipse(f.x, f.y, f.r * k, f.r * k * 0.6, 0, 0, Math.PI * 2); g.stroke();
        } else if (f.type === 'lob') {
          const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 50;
          g.fillStyle = f.color; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 0.4; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
        } else if (f.type === 'slash') {
          g.strokeStyle = f.color; g.globalAlpha = 1 - k; g.lineWidth = 3;
          g.beginPath(); g.moveTo(f.x - 22, f.y - 16 + k * 6); g.lineTo(f.x + 22, f.y + 16 - k * 6); g.stroke();
          g.beginPath(); g.moveTo(f.x + 22, f.y - 16 + k * 6); g.lineTo(f.x - 22, f.y + 16 - k * 6); g.stroke();
        } else if (f.type === 'wall') {
          const b = pBox();
          g.fillStyle = f.color; g.globalAlpha = 0.22 + Math.sin(B.time / 180) * 0.06;
          g.fillRect(b.x + b.w - 4, b.y + 4, 12, b.h - 6);
          g.globalAlpha = 0.7; g.strokeStyle = f.color; g.strokeRect(b.x + b.w - 4, b.y + 4, 12, b.h - 6);
        } else if (f.type === 'rift') {
          g.strokeStyle = f.color; g.globalAlpha = (1 - k) * 0.9; g.lineWidth = 2;
          g.beginPath(); g.ellipse(PX, PY, 40, 9, 0, 0, Math.PI * 2); g.stroke();
          if (Math.random() < 0.5) burst(PX + rand(70) - 35, PY - rand(10), f.color, 1, 1.5);
        } else if (f.type === 'guard') {
          const b = pBox();
          g.strokeStyle = f.color; g.globalAlpha = 1 - k; g.lineWidth = 3;
          g.beginPath(); g.ellipse(b.cx, b.y + b.h / 2, b.w * 0.4 + k * 30, b.h * 0.45 + k * 30, 0, 0, Math.PI * 2); g.stroke();
        } else if (f.type === 'charge') {
          const h = handPos();
          g.fillStyle = f.color; g.globalAlpha = 0.3 + k * 0.6;
          g.beginPath(); g.arc(h.x, h.y - 4, 2 + k * 6, 0, Math.PI * 2); g.fill();
        } else if (f.type === 'txt') {
          const y = f.y - k * 16;
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          if (f.glow) { g.shadowColor = f.glow; g.shadowBlur = 6; }
          txt(f.text, f.x, y, f.size || (f.big ? 17 : 10), f.color, 'center', true);
          g.shadowBlur = 0;
        }
        g.restore();
      }
    }
    // Super cinematic: darken + speed lines + cut-in band with the guardian, then impact
    function drawSuper(dt) {
      const s = B.superFx;
      if (!s) return;
      s.t += dt;
      const t = s.t;
      if (t > s.dur) { B.superFx = null; return; }
      const fadeIn = Math.min(1, t / 250), fadeOut = t > 1100 ? Math.max(0, 1 - (t - 1100) / 300) : 1;
      g.fillStyle = `rgba(0,0,0,${0.65 * fadeIn * (t > 1250 ? Math.max(0, 1 - (t - 1250) / 500) : 1)})`;
      g.fillRect(0, 0, BW, BH);
      if (t < 1400) {
        g.save();
        g.strokeStyle = s.color; g.globalAlpha = 0.6 * fadeOut;
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2 + t / 900;
          const r0 = 40 + ((t / 3 + i * 37) % 120);
          g.lineWidth = 1 + (i % 3);
          g.beginPath(); g.moveTo(BW / 2 + Math.cos(a) * r0, BH / 2 + Math.sin(a) * r0);
          g.lineTo(BW / 2 + Math.cos(a) * (r0 + 40), BH / 2 + Math.sin(a) * (r0 + 40)); g.stroke();
        }
        g.restore();
      }
      if (t < 1150) {
        // diagonal cut-in band
        const slide = Math.min(1, t / 300);
        g.save();
        g.globalAlpha = fadeOut;
        g.translate(BW / 2, BH * 0.42); g.rotate(-0.18);
        g.fillStyle = s.color; g.fillRect(-BW, -34, BW * 2, 68);
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(-BW, -30, BW * 2, 60);
        const cx = -BW * 0.9 + slide * BW * 0.6 + (t / 1150) * 12;
        if (B.poseArt) {   // outfit art: its idle frame, cropped to the upper body
          const im = B.poseArt.idle[0], M = B.poseArt.meta, sc = 150 / M.figH;
          g.save(); g.beginPath(); g.rect(-BW, -30, BW * 2, 60); g.clip();
          g.imageSmoothingEnabled = true; g.drawImage(im, cx + 48 - M.cx * sc, -26 - (M.footY - M.figH) * sc, M.w * sc, M.h * sc);
          g.restore();
        } else {
          const fs = Sprites.guardianSprite(p.cls, p.element === 'prism' ? 'prism' : p.element, B.slotPal);
          g.imageSmoothingEnabled = false;
          g.drawImage(fs, cx, -48, 96, 96);
        }
        g.restore();
        g.save();
        g.globalAlpha = fadeOut;
        txt(s.name, BW / 2 + 16 - (1 - slide) * 60, BH * 0.42 + 4, 15, '#ffffff');
        txt('SUPER', BW / 2 + 16 - (1 - slide) * 60, BH * 0.42 - 14, 8, s.color);
        g.restore();
      }
      if (t > 800 && t < 1250) {
        // charge: particles converge to the player
        for (let i = 0; i < 3; i++) B.fx.push({ type: 'pt', x: PX + rand(160) - 80, y: PY - 60 + rand(120) - 60, vx: 0, vy: 0, color: s.color, t: 0, dur: 250 });
      }
    }
    function draw(dt) {
      g.setTransform(BRS, 0, 0, BRS, 0, 0);
      g.imageSmoothingEnabled = false;
      let sx = 0, sy = 0;
      if (B.shake > 0) { sx = (Math.random() - 0.5) * B.shake; sy = (Math.random() - 0.5) * B.shake; B.shake = Math.max(0, B.shake - dt * 0.03); }
      g.translate(sx, sy);
      if (B.bg) g.drawImage(B.bg, -4, -4, BW + 8, BH + 8);
      const gr = g.createLinearGradient(0, BH * 0.45, 0, BH);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)');
      g.fillStyle = gr; g.fillRect(0, BH * 0.45, BW, BH * 0.55);
      // enemies back-to-front, then the player in the foreground
      B.enemies.map((e, i) => [e, i]).sort((a, b) => a[0].y - b[0].y).forEach(([e, i]) => drawEnemy(e, i, dt));
      drawPlayer(dt);
      drawFx(dt);
      drawSuper(dt);
      if (B.flash > 0) { g.fillStyle = `rgba(255,255,255,${B.flash})`; g.fillRect(-10, -10, BW + 20, BH + 20); B.flash = Math.max(0, B.flash - dt / 400); }
      if (B.hurtT > 0) {
        const vg = g.createRadialGradient(BW / 2, BH / 2, BH * 0.25, BW / 2, BH / 2, BH * 0.7);
        vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, `rgba(255,0,0,${B.hurtT * 0.5})`);
        g.fillStyle = vg; g.fillRect(0, 0, BW, BH); B.hurtT = Math.max(0, B.hurtT - dt / 500);
      }
      if (B.banner) {
        B.banner.t += dt;
        const k = B.banner.t / B.banner.dur;
        if (k >= 1) B.banner = null;
        else { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, BH * 0.36 - 14, BW, 24); txt(B.banner.text, BW / 2, BH * 0.36 + 3, 15, B.banner.color); }
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }

    if (p.gp.has('orbs')) gainOrbs(3);
    requestAnimationFrame(frame);
    updateHud();
    log('画面タップで通常攻撃 / 敵タップでターゲット切替');
    await loadWave();
    B.busy = false;
    updateHud();
    return battleDone;
  }

  boot();
})();
