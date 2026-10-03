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

  const Data = { byHash: new Map(), plugs: new Map(), plugSets: new Map(), sets: {}, acts: new Map(), pool: {}, subclasses: [], glimmerIcon: '' };
  function indexManifest(m) {
    Data.byHash = new Map(m.items.map(i => [i.h, i]));
    Data.plugs = new Map(Object.entries(m.plugs).map(([k, v]) => [+k, v]));
    Data.plugSets = new Map(Object.entries(m.plugSets).map(([k, v]) => [+k, v]));
    Data.sets = m.itemSets || {};
    for (const a of m.activities || []) if (!Data.acts.has(a.n)) Data.acts.set(a.n, a);
    Data.glimmerIcon = m.misc?.glimmer?.i || '';
    const seen = new Set();
    for (const it of m.items) {
      if (it.tt !== 5 && it.tt !== 6) continue;
      const slot = SLOT_OF_BUCKET[it.bk];
      if (!slot || (it.it === 3 && !it.st) || (it.it !== 2 && it.it !== 3)) continue;
      const key = `${it.n}|${it.bk}|${it.cl ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (Data.pool[slot] ||= []).push(it);
    }
    Data.subclasses = m.items.filter(i => i.it === 16 && i.cl >= 0 && i.cl <= 2 && (i.sk || []).length >= 5);
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
  function rollJob(cls = rand(3), rarity = rollRarity()) {
    const sub = pick(Data.subclasses.filter(s => s.cl === cls));
    const ab = subclassAbilities(sub);
    const j = { id: 'j' + (S.nextId++), cl: cls, sub: sub.h, r: rarity, lv: 1, xp: 0 };
    for (const k of ABIL_KINDS) j[k.k] = ab[k.k]?.length ? pick(ab[k.k]).h : 0;
    j.name = Content.suggestJobName(cls, subElement(sub), sub.h + j.sup + j.gre);
    return j;
  }
  const jobKey = j => [j.cl, j.sub, ...ABIL_KINDS.map(k => j[k.k])].join(':');
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

  /* ===================== save ===================== */
  let S = null;
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { console.warn(e); } }
  function loadSave() {
    try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { S = null; }
    if (!S || S.v !== 1) S = null;
  }
  function newSave(cls) {
    S = { v: 1, glimmer: 1000, nextId: 1, inv: [], jobs: [], activeJob: null, loadout: { 0: {}, 1: {}, 2: {} }, cleared: {}, prologue: false };
    const j = rollJob(cls, 3);
    S.jobs.push(j); S.activeJob = j.id;
    // Starter weapons: primary-ammo kinetic + energy, any power weapon
    const starter = [
      ['kin', it => it.tt === 5 && it.am === 1],
      ['ene', it => it.tt === 5 && it.am === 1],
      ['pow', it => it.tt === 5],
    ];
    for (const [slot, f] of starter) {
      const it = pick((Data.pool[slot] || []).filter(f));
      if (it) { const inv = addItem(it, 'start'); equipWeapon(slot, inv.id); }
    }
    // Starter armor: one full legendary armor series per class (jobs of any class can be pulled)
    for (const c of [0, 1, 2]) {
      for (const piece of starterArmorSet(c)) {
        const inv = addItem(piece, 'start');
        S.loadout[c][SLOT_OF_BUCKET[piece.bk]] = inv.id;
      }
    }
    save();
  }
  // Weapons are shared by all classes (as in Destiny 2); armor is per class
  const isWeaponSlot = slot => slot === 'kin' || slot === 'ene' || slot === 'pow';
  function equipWeapon(slot, id) { for (const c of [0, 1, 2]) { if (id) S.loadout[c][slot] = id; else delete S.loadout[c][slot]; } }
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
    const total = tt === 6 ? 66 + rand(12) : 56 + rand(14);
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
    const stats = armorTotals(items);
    const set = setStatus(items, cls);
    const fx = set?.active ? set.effect.id : null;
    const lv = job.lv || 1;
    const sub = Data.byHash.get(job.sub);
    const element = subElement(sub);
    const p = {
      cls, job, items, stats, set, fx, lv, sub, element,
      maxHp: Math.round((1000 + stats.hp * 8 + lv * 30) * RARITY[job.r || 3].mult + (fx === 'hp' ? 100 : 0)),
      atk: Math.round((100 + lv * 6) * RARITY[job.r || 3].mult),
      dr: Math.min(0.3, stats.hp / 400) + (fx === 'dr' ? 0.1 : 0),
      crit: 0.08 + (fx === 'crit' ? 0.1 : 0),
      evade: job.mov ? 0.06 : 0,
      superRate: 1 + stats.super / 100,
      orbs: [], superG: fx === 'super' ? 30 : 0, buffs: {},
      abil: {},
    };
    for (const k of ABIL_KINDS) p.abil[k.k] = Data.plugs.get(job[k.k]) || null;
    p.hp = p.maxHp;
    return p;
  }
  function weaponImpact(def) { return def?.st?.[W_IMPACT] || 60; }
  function buildCards(p) {
    const cards = [];
    const costEl = e => (e === 'prism' ? 'any' : e);
    const { gre, mel, cls } = p.abil;
    if (gre) {
      const e = plugElement(gre, p.element);
      cards.push({ id: 'gre', name: gre.n, icon: gre.i, el: e, cost: { [costEl(e)]: 3 }, kind: 'atk', aoe: true, mult: 1.5 * (1 + p.stats.grenade / 100), brk: 14 });
    }
    if (mel) {
      const e = plugElement(mel, p.element);
      cards.push({ id: 'mel', name: mel.n, icon: mel.i, el: e, cost: { [costEl(e)]: 2 }, kind: 'atk', mult: 2.6 * (1 + p.stats.melee / 100), brk: 22 });
    }
    if (cls) cards.push({ id: 'cls', name: cls.n, icon: cls.i, cost: { light: 2 }, kind: 'class' });
    const ene = p.items.ene?.def;
    if (ene) {
      const e = DT_ELEMENT[ene.dt] || 'kin';
      const special = ene.am === 2;
      cards.push({ id: 'ene', name: ene.n, icon: ene.i, el: e, cost: { [e]: special ? 3 : 2 }, kind: 'atk',
        mult: (special ? 2.8 : 1.6) * (0.6 + weaponImpact(ene) / 100) * (1 + p.stats.weapons / 150), brk: special ? 18 : 12 });
    }
    const pow = p.items.pow?.def;
    if (pow) {
      const e = DT_ELEMENT[pow.dt] || 'kin';
      cards.push({ id: 'pow', name: pow.n, icon: pow.i, el: e, cost: { any: 5 }, kind: 'atk',
        mult: 4.2 * (0.6 + weaponImpact(pow) / 120) * (1 + p.stats.weapons / 150), brk: 30 });
    }
    cards.push({ id: 'heal', name: 'ゴースト・リバイブ', icon: null, cost: { light: 3 }, kind: 'heal' });
    return cards;
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
    if (!S) return renderTitle();
    renderHub('story');
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

  let hubTab = 'story';
  function renderHub(tab) {
    hubTab = tab || hubTab;
    const job = activeJob();
    app().innerHTML = `
      <div class="hub-head">
        <span class="logo">D2 MOBIUS</span>
        <span class="grow"></span>
        <span class="glimmer">${Data.glimmerIcon ? `<img src="${img(Data.glimmerIcon)}" alt="">` : '◆'}<span id="glim">${S.glimmer.toLocaleString()}</span></span>
      </div>
      <div class="tabs">
        ${[['story', 'ストーリー'], ['job', 'ジョブ'], ['gear', '装備'], ['engram', 'エングラム'], ['menu', 'メニュー']]
          .map(([k, n]) => `<button data-t="${k}" class="${k === hubTab ? 'active' : ''}">${n}</button>`).join('')}
      </div>
      <div class="hub-body"></div>`;
    $$('.tabs button').forEach(b => b.onclick = () => renderHub(b.dataset.t));
    const body = $('.hub-body');
    body.appendChild(jobBanner(job));
    ({ story: renderStory, job: renderJobs, gear: renderGear, engram: renderEngram, menu: renderMenu })[hubTab](body);
  }
  function updateGlimmer() { const g = $('#glim'); if (g) g.textContent = S.glimmer.toLocaleString(); }

  function jobBanner(job) {
    const sub = Data.byHash.get(job.sub);
    const e = subElement(sub);
    const d = el(`<div class="panel job-banner">
      <div class="sp"></div>
      <div class="grow">
        <div><span class="stars r${job.r || 3}">${stars(job.r)}</span> <span style="color:var(--${e})">${esc(job.name)}</span> <span class="muted" style="font-size:12px">Lv.${job.lv}</span></div>
        <div class="muted" style="font-size:12px">${CLASS_NAME[job.cl]} / ${esc(sub?.n || '?')} (${ELEMENT_NAME[e]})</div>
        <div class="row" style="margin-top:4px;gap:3px">${ABIL_KINDS.map(k => { const p = Data.plugs.get(job[k.k]); return p ? `<img src="${img(p.i)}" title="${esc(k.n + ': ' + p.n)}" style="width:22px;height:22px;background:#000">` : ''; }).join('')}</div>
      </div></div>`);
    d.querySelector('.sp').appendChild(spriteCanvas(Sprites.guardianSprite(job.cl, e), 3));
    return d;
  }

  /* ----- story ----- */
  function stageUnlocked(i) {
    const st = Content.STAGES[i];
    if (st.farm) return !!S.cleared.s2;
    if (i === 0) return true;
    const prev = Content.STAGES.slice(0, i).filter(s => !s.farm).pop();
    return !!S.cleared[prev.id];
  }
  function renderStory(body) {
    body.appendChild(el(`<h2 class="sec">第1章 光の環</h2>`));
    Content.STAGES.forEach((st, i) => {
      const act = activityFor(st.act);
      const open = stageUnlocked(i);
      const enemiesN = st.waves.flat().length;
      const d = el(`<div class="stage ${open ? '' : 'locked'}">
        <canvas class="thumb" width="96" height="54"></canvas>
        <div class="grow">
          <div class="no">${esc(st.no)} ${st.farm ? '(周回)' : ''}</div>
          <div class="nm">${esc(st.name)}</div>
          <div class="info">${esc(act?.dest || 'タワー演習場')} · ${st.waves.length}ウェーブ · 敵${enemiesN}体 · 推奨Lv${Math.round(st.lv * 3)}</div>
          ${S.cleared[st.id] ? '<div class="clear">★ CLEAR</div>' : ''}
        </div></div>`);
      const cv = d.querySelector('canvas');
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      const bgP = act ? Sprites.pixelatedBackground(img(act.img), 48, 27) : Promise.resolve(Sprites.gridBackground(48, 27));
      bgP.then(c => g.drawImage(c, 0, 0, 96, 54)).catch(() => g.drawImage(Sprites.gridBackground(48, 27), 0, 0, 96, 54));
      if (open) d.onclick = () => startStage(st);
      body.appendChild(d);
    });
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

  /* ----- jobs (obtained from the job engram; not freely creatable) ----- */
  const stars = r => '★'.repeat(r || 3);
  function renderJobs(body) {
    body.appendChild(el(`<h2 class="sec">ジョブ一覧(${S.jobs.length})</h2>`));
    const sorted = [...S.jobs].sort((a, b) => (b.id === S.activeJob) - (a.id === S.activeJob) || (b.r || 3) - (a.r || 3) || b.lv - a.lv);
    for (const j of sorted) {
      const sub = Data.byHash.get(j.sub);
      const e = subElement(sub);
      const d = el(`<div class="job-card ${j.id === S.activeJob ? 'active' : ''}">
        <div class="sp"></div>
        <div class="grow">
          <div><span class="stars r${j.r || 3}">${stars(j.r)}</span> <span style="color:var(--${e})">${esc(j.name)}</span> <span class="muted" style="font-size:11px">Lv.${j.lv}/${jobMaxLv(j)}</span></div>
          <div class="muted" style="font-size:11px">${CLASS_NAME[j.cl]} / ${esc(sub?.n || '?')}</div>
          <div class="abil">${ABIL_KINDS.map(k => { const p = Data.plugs.get(j[k.k]); return p ? `<img src="${img(p.i)}" title="${esc(k.n + ': ' + p.n)}">` : ''; }).join('')}</div>
        </div>
        <div class="row" style="flex-direction:column;gap:4px">
          ${j.id === S.activeJob ? '<span class="muted" style="font-size:11px">使用中</span>' : '<button class="pbtn small use">使用</button>'}
          <button class="pbtn small info">詳細</button>
        </div></div>`);
      d.querySelector('.sp').appendChild(spriteCanvas(Sprites.guardianSprite(j.cl, e), 2));
      d.querySelector('.use')?.addEventListener('click', () => { S.activeJob = j.id; save(); renderHub('job'); });
      d.querySelector('.info').onclick = () => openJobDetail(j);
      body.appendChild(d);
    }
    const nb = el(`<button class="pbtn primary" style="width:100%;margin-top:6px">◆ エングラムでジョブを召喚</button>`);
    nb.onclick = () => renderHub('engram');
    body.appendChild(nb);
    body.appendChild(el(`<p class="muted" style="font-size:11px;line-height:1.6">ジョブはグリマーを使った「ジョブ・エングラム」で手に入ります。サブクラス・スーパー・クラスアビリティ・移動スキル・近接・グレネードの組み合わせはランダム。★が高いほど基礎能力とレベル上限が上がります。同じジョブが出たら経験値に変換されます。</p>`));
  }

  function openJobDetail(job) {
    const sub = Data.byHash.get(job.sub);
    const e = subElement(sub);
    const m = el(`<div class="modal"><div class="panel">
      <div class="row"><b style="color:var(--accent)">ジョブ詳細</b><span class="grow"></span><button class="pbtn small x">✕</button></div>
      <div class="row" style="margin:8px 0"><div class="sp"></div><div class="grow">
        <div><span class="stars r${job.r || 3}">${stars(job.r)}</span> Lv.${job.lv}/${jobMaxLv(job)} <span class="muted" style="font-size:11px">EXP ${job.xp || 0}/${job.lv * 100}</span></div>
        <div class="muted" style="font-size:12px">${CLASS_NAME[job.cl]} / ${esc(sub?.n || '?')}(${ELEMENT_NAME[e]})· 能力倍率 ×${RARITY[job.r || 3].mult}</div>
      </div></div>
      <h2 class="sec">ジョブ名</h2>
      <div class="row"><input class="txt grow nm" maxlength="16" value="${esc(job.name)}"><button class="pbtn small sug">名前を提案</button><button class="pbtn small primary ok">変更</button></div>
      <h2 class="sec">アビリティ</h2>
      ${ABIL_KINDS.map(k => { const p = Data.plugs.get(job[k.k]); return p ? `<div class="opt" style="cursor:default;margin-bottom:4px"><img src="${img(p.i)}"><div><div>${k.n}: ${esc(p.n)}</div><div class="d" style="-webkit-line-clamp:4">${esc(p.d || '')}</div></div></div>` : ''; }).join('')}
      ${S.jobs.length > 1 ? `<div class="row" style="margin-top:10px"><span class="grow"></span><button class="pbtn small del" style="border-color:var(--bad)">ジョブを解放(+${RARITY[job.r || 3].refund} グリマー)</button></div>` : ''}
    </div></div>`);
    m.querySelector('.sp').appendChild(spriteCanvas(Sprites.guardianSprite(job.cl, e), 3));
    m.querySelector('.x').onclick = () => m.remove();
    m.querySelector('.sug').onclick = () => { m.querySelector('.nm').value = Content.suggestJobName(job.cl, e, rand(1e6)); };
    m.querySelector('.ok').onclick = () => { job.name = m.querySelector('.nm').value.trim() || job.name; save(); m.remove(); renderHub('job'); };
    m.querySelector('.del')?.addEventListener('click', () => {
      if (!confirm(`ジョブ「${job.name}」を解放しますか?`)) return;
      S.jobs = S.jobs.filter(x => x !== job);
      if (S.activeJob === job.id) S.activeJob = S.jobs[0].id;
      S.glimmer += RARITY[job.r || 3].refund;
      save(); m.remove(); renderHub('job');
    });
    document.body.appendChild(m);
  }

  /* ----- gear ----- */
  function renderGear(body) {
    const job = activeJob();
    const cls = job.cl;
    const items = equippedItems(cls);
    const stats = armorTotals(items);
    const set = setStatus(items, cls);
    body.appendChild(el(`<h2 class="sec">${CLASS_NAME[cls]} の装備</h2>`));
    const grid = el(`<div class="slots"></div>`);
    for (const slot of SLOT_ORDER) {
      const x = items[slot];
      const d = el(`<div class="slot">
        ${x ? `<img src="${img(x.def.i)}">` : '<div style="width:44px;height:44px;border:2px dashed var(--line)"></div>'}
        <div class="grow"><div class="lbl">${SLOT_NAME[slot]}${slot === 'kin' ? ' · 通常攻撃' : slot === 'ene' || slot === 'pow' ? ' · エレメント消費' : ''}</div>
        <div class="nm t${x?.def.tt || 0}">${x ? esc(x.def.n) : '(なし)'}</div>
        ${x ? `<div class="lbl">${esc(x.def.t || '')}${x.def.dt && x.def.it === 3 ? ' · ' + ELEMENT_NAME[DT_ELEMENT[x.def.dt]] : ''}${x.def.set && Data.sets[x.def.set] ? ' · ' + esc(Data.sets[x.def.set].n) : ''}${x.inv.src === 'd2' ? ' · D2' : ''}</div>` : ''}
        </div></div>`);
      d.onclick = () => openPicker(cls, slot);
      grid.appendChild(d);
    }
    body.appendChild(grid);
    body.appendChild(el(`<h2 class="sec">アーマーステータス</h2>`));
    body.appendChild(el(`<div class="panel statline">${Object.keys(STAT).map(k => `<div>${STAT_LABEL[k]} <span class="v">${stats[k]}</span></div>`).join('')}</div>`));
    body.appendChild(el(`<div class="setfx ${set?.active ? 'on' : ''}">${set
      ? `シリーズ「${esc(set.name)}」 ${set.count}/${set.need} ― フルセット効果: ${esc(set.effect.n)} ${set.active ? '(発動中)' : '(未発動)'}`
      : 'シリーズ防具をフルセットで装備すると特殊効果が発動します'}</div>`));
    body.appendChild(el(`<h2 class="sec">Destiny 2 から取り込み</h2>`));
    const imp = el(`<div class="panel"><div class="muted" style="font-size:12px;line-height:1.6;margin-bottom:6px">ARMORY でログイン済みなら、所持している武器・防具(ステータス込み)と、各キャラの現在の装備をそのまま取り込めます。</div><button class="pbtn">D2 の装備を取り込む</button> <a href="../" class="muted" style="font-size:12px">ARMORY でログイン →</a></div>`);
    imp.querySelector('button').onclick = async ev => {
      ev.target.disabled = true; ev.target.textContent = '取り込み中...';
      try { const n = await importFromD2(); toast(`${n} 個のアイテムを取り込みました`); renderHub('gear'); }
      catch (e) { toast('取り込み失敗: ' + e.message); ev.target.disabled = false; ev.target.textContent = 'D2 の装備を取り込む'; }
    };
    body.appendChild(imp);
  }

  function openPicker(cls, slot) {
    const list = S.inv.map(inv => ({ inv, def: Data.byHash.get(inv.h) }))
      .filter(x => x.def && SLOT_OF_BUCKET[x.def.bk] === slot && (x.def.it === 3 || x.def.cl === cls || x.def.cl === 3))
      .sort((a, b) => (b.def.tt - a.def.tt) || a.def.n.localeCompare(b.def.n, 'ja'));
    const m = el(`<div class="modal"><div class="panel">
      <div class="row"><b style="color:var(--accent)">${SLOT_NAME[slot]} を選択</b><span class="grow"></span><button class="pbtn small x">✕</button></div>
      <div class="muted" style="font-size:11px;margin:4px 0 8px">所持 ${list.length} 個 · エングラムやステージドロップ、D2取り込みで増えます</div>
      <div class="picker"></div><div class="detail" style="margin-top:8px;font-size:12px"></div>
      <div class="row" style="margin-top:8px"><button class="pbtn small unequip">外す</button></div>
    </div></div>`);
    const pk = m.querySelector('.picker');
    const detail = m.querySelector('.detail');
    for (const x of list) {
      const d = el(`<div class="it t${x.def.tt}" title="${esc(x.def.n)}"><img src="${img(x.def.i)}" loading="lazy">${x.inv.src === 'd2' ? '<span class="src">D2</span>' : ''}</div>`);
      d.onmouseenter = () => {
        const st = x.def.it === 2 ? Object.keys(STAT).map(k => `${STAT_LABEL[k]} ${x.inv.st?.[STAT[k]] || 0}`).join(' / ') : `威力 ${weaponImpact(x.def)}`;
        const setN = x.def.set && Data.sets[x.def.set] ? ` · シリーズ: ${Data.sets[x.def.set].n}（${Content.setEffectFor(x.def.set, Data.sets[x.def.set].n).n}）` : '';
        detail.innerHTML = `<b class="t${x.def.tt}">${esc(x.def.n)}</b> <span class="muted">${esc(x.def.t || '')}</span><br>${esc(st)}${esc(setN)}`;
      };
      d.onclick = () => { if (isWeaponSlot(slot)) equipWeapon(slot, x.inv.id); else S.loadout[cls][slot] = x.inv.id; save(); m.remove(); renderHub('gear'); };
      pk.appendChild(d);
    }
    m.querySelector('.x').onclick = () => m.remove();
    m.querySelector('.unequip').onclick = () => { if (isWeaponSlot(slot)) equipWeapon(slot, null); else delete S.loadout[cls][slot]; save(); m.remove(); renderHub('gear'); };
    document.body.appendChild(m);
  }

  /* ----- engram (gacha with glimmer only) ----- */
  const ENGRAM_COST = 300;
  function rollEngramItem(cls, forceExotic) {
    const exotic = forceExotic || Math.random() < 0.06;
    const slots = Math.random() < 0.55 ? ['kin', 'ene', 'pow'] : ARMOR_SLOTS;
    const slot = pick(slots);
    let pool = (Data.pool[slot] || []).filter(it => it.tt === (exotic ? 6 : 5) && (it.it === 3 || it.cl === cls || it.cl === 3));
    if (!pool.length) pool = (Data.pool[slot] || []).filter(it => it.it === 3 || it.cl === cls);
    return pick(pool);
  }
  function engramSprite(dark = '#7a3fc8', light = '#b07af0') {
    // Small pixel engram (diamond) drawn procedurally
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    const rows = ['.......KK.......', '......KPPK......', '.....KPLLPK.....', '....KPLWWLPK....', '...KPLWWWWLPK...', '..KPLLWWWWLLPK..', '.KPPLLLWWLLLPPK.', 'KPPPPLLLLLLPPPPK', '.KPPPPLLLLPPPPK.', '..KPPPPLLPPPPK..', '...KPPPPPPPPK...', '....KPPPPPPK....', '.....KPPPPK.....', '......KPPK......', '.......KK.......', '................'];
    const pal = { K: '#1a0f2a', P: dark, L: light, W: '#f4e9ff' };
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
    return c;
  }
  const JOB_ENGRAM_COST = 500;
  function renderJobEngram(body) {
    const d = el(`<div class="panel engram">
      <div class="ec"></div>
      <div style="margin:6px 0">ジョブ・エングラム召喚</div>
      <div class="muted" style="font-size:12px;line-height:1.6">サブクラスとアビリティの組み合わせがランダムなジョブを召喚。<br>★5: 10% / ★4: 30% / ★3: 60% · 10回召喚は★4以上を1つ確定</div>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="pbtn j1">1回 (${JOB_ENGRAM_COST})</button>
        <button class="pbtn primary j10">10回 (${JOB_ENGRAM_COST * 9})</button>
      </div>
      <div class="job-res" style="margin-top:10px;text-align:left"></div></div>`);
    d.querySelector('.ec').appendChild(spriteCanvas(engramSprite('#c8901e', '#ffd36a'), 6));
    const pull = n => {
      const cost = n === 10 ? JOB_ENGRAM_COST * 9 : JOB_ENGRAM_COST;
      if (S.glimmer < cost) { toast('グリマーが足りません — ステージをクリアして集めましょう'); return; }
      S.glimmer -= cost;
      const res = d.querySelector('.job-res');
      res.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const r = n === 10 && i === 9 ? rollRarity(4) : rollRarity();
        const g = grantJob(rollJob(rand(3), r));
        const j = g.job;
        const sub = Data.byHash.get(j.sub);
        const e = subElement(sub);
        const row = el(`<div class="job-card" style="animation:pop 300ms ease-out both;animation-delay:${i * 80}ms">
          <div class="sp"></div><div class="grow">
            <div><span class="stars r${r}">${stars(r)}</span> <span style="color:var(--${e})">${esc(j.name)}</span> ${g.dup ? `<span class="muted" style="font-size:11px">重複 → EXP+${g.xp}</span>` : '<span style="color:var(--good);font-size:11px">NEW</span>'}</div>
            <div class="muted" style="font-size:11px">${CLASS_NAME[j.cl]} / ${esc(sub?.n || '?')}</div>
            <div class="abil">${ABIL_KINDS.map(k => { const p = Data.plugs.get(j[k.k]); return p ? `<img src="${img(p.i)}" title="${esc(k.n + ': ' + p.n)}">` : ''; }).join('')}</div>
          </div></div>`);
        row.querySelector('.sp').appendChild(spriteCanvas(Sprites.guardianSprite(j.cl, e), 2));
        res.appendChild(row);
      }
      save(); updateGlimmer();
    };
    d.querySelector('.j1').onclick = () => pull(1);
    d.querySelector('.j10').onclick = () => pull(10);
    body.appendChild(d);
  }
  function renderEngram(body) {
    renderJobEngram(body);
    body.appendChild(el(`<div style="height:10px"></div>`));
    const cls = activeJob().cl;
    const d = el(`<div class="panel engram">
      <div class="ec"></div>
      <div style="margin:6px 0">レジェンダリー・エングラム解読</div>
      <div class="muted" style="font-size:12px;line-height:1.6">グリマーで解読。課金はありません。<br>エキゾチック排出率 6% · ${CLASS_NAME[cls]} 用の防具が出ます</div>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="pbtn p1">1回 (${ENGRAM_COST})</button>
        <button class="pbtn primary p10">10回 (${ENGRAM_COST * 9}) ※1回分お得</button>
      </div>
      <div class="pull-res"></div></div>`);
    d.querySelector('.ec').appendChild(spriteCanvas(engramSprite(), 6));
    const doPull = n => {
      const cost = n === 10 ? ENGRAM_COST * 9 : ENGRAM_COST;
      if (S.glimmer < cost) { toast('グリマーが足りません — ステージをクリアして集めましょう'); return; }
      S.glimmer -= cost;
      const res = d.querySelector('.pull-res');
      res.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const it = rollEngramItem(cls, n === 10 && i === 9 && Math.random() < 0.3);
        if (!it) continue;
        addItem(it, 'gacha');
        const c = el(`<div class="it t${it.tt}" style="animation-delay:${i * 80}ms" title="${esc(it.n)}"><img src="${img(it.i)}"><div class="n">${esc(it.n)}</div></div>`);
        res.appendChild(c);
      }
      save(); updateGlimmer();
    };
    d.querySelector('.p1').onclick = () => doPull(1);
    d.querySelector('.p10').onclick = () => doPull(10);
    body.appendChild(d);
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

  /* ----- result ----- */
  function showResult(st, r, first) {
    return new Promise(resolve => {
      const m = el(`<div class="result"><div class="panel">
        <h3>${r.win ? 'MISSION CLEAR' : 'MISSION FAILED'}</h3>
        ${r.win ? `
          <div class="glimmer" style="justify-content:center">${Data.glimmerIcon ? `<img src="${img(Data.glimmerIcon)}">` : ''}+${r.glimmer.toLocaleString()} ${first ? '(初回ボーナス込み)' : ''}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">ジョブ経験値 +${r.xp}${r.levelUp ? ` · <span style="color:var(--good)">LEVEL UP! Lv.${r.lv}</span>` : ''}</div>
          ${r.drops.length ? `<div style="margin-top:8px">ドロップ</div><div class="drops">${r.drops.map(d => `<img class="t${d.tt}" src="${img(d.i)}" title="${esc(d.n)}">`).join('')}</div><div style="font-size:12px">${r.drops.map(d => esc(d.n)).join(' / ')}</div>` : ''}`
          : '<div class="muted">光が尽きた……装備やジョブを見直して再挑戦しよう。</div>'}
        <button class="pbtn primary" style="margin-top:14px;width:100%">OK</button></div></div>`);
      m.querySelector('button').onclick = () => { m.remove(); resolve(); };
      document.body.appendChild(m);
    });
  }

  /* ===================== battle ===================== */
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
      // spend the most plentiful non-light element first
      const counts = {};
      p.orbs.forEach(o => { counts[o] = (counts[o] || 0) + (o === 'light' ? 0.5 : 1); });
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      p.orbs.splice(p.orbs.indexOf(best), 1);
    }
  }

  function makeEnemy(key, lv) {
    const d = Content.enemyDef(key);
    const k = 1 + (lv - 1) * 0.55;
    return {
      ...d, maxHp: Math.round(d.hp * k), hp: Math.round(d.hp * k), atkV: Math.round(d.atk * (1 + (lv - 1) * 0.3)),
      counter: d.spd, bk: d.brk, broken: 0, sprite: null, x: 0, y: 0, hitT: 0, dieT: 0, scale: d.scale || 1,
    };
  }

  async function runBattle(st, act) {
    const p = buildPlayer();
    const cards = buildCards(p);
    const B = {
      st, p, cards, wave: 0, enemies: [], target: 0, busy: true, done: null,
      fx: [], shake: 0, banner: null, log: [], playerAtkT: 0, playerHitT: 0, superFlash: 0, time: 0,
      bg: null,
    };
    app().innerHTML = `
      <div class="battle">
        <div class="bhead"><span style="color:var(--accent)">${esc(st.no)}</span> ${esc(st.name)}<span class="grow"></span><span class="wv"></span><button class="pbtn small flee">撤退</button></div>
        <canvas id="bc" width="${VW * RS}" height="${VH * RS}"></canvas>
        <div class="hud">
          <div class="row" style="gap:6px"><span style="font-size:11px;width:24px">HP</span><div class="bar grow hp"><i></i><span></span></div></div>
          <div class="row" style="gap:6px"><span style="font-size:11px;width:24px">SP</span><div class="bar super grow sg"><i></i><span></span></div></div>
          <div class="orbs"></div>
          <div class="cards"></div>
          <div class="row" style="gap:6px">
            <button class="pbtn grow atk">🔫 通常攻撃 (${esc(p.items.kin?.def.n || '素手')})</button>
          </div>
          <button class="pbtn superbtn">SUPER: ${esc(p.abil.sup?.n || 'なし')}</button>
          <div class="blog"></div>
        </div>
      </div>`;
    const canvas = $('#bc');
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;

    // Background (API PGCR image, pixelated)
    try { B.bg = act ? await Sprites.pixelatedBackground(img(act.img), 160, 90) : Sprites.gridBackground(160, 90); }
    catch { B.bg = Sprites.gridBackground(160, 90); }
    B.playerSprite = Sprites.guardianSprite(p.cls, p.element === 'prism' ? 'prism' : p.element);
    B.ghostSprite = Sprites.ghostSprite(p.element === 'prism' ? 'prism' : p.element);

    const log = msg => { B.log.push(msg); B.log = B.log.slice(-2); $('.blog').innerHTML = B.log.map(esc).join('<br>'); };
    const popup = (x, y, text, color, big) => B.fx.push({ type: 'txt', x, y, text, color, t: 0, dur: 900, big });
    const beam = (x0, y0, x1, y1, color) => B.fx.push({ type: 'beam', x0, y0, x1, y1, color, t: 0, dur: 220 });
    const burst = (x, y, color, n = 10) => { for (let i = 0; i < n; i++) B.fx.push({ type: 'pt', x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, color, t: 0, dur: 500 + rand(300) }); };

    async function loadWave() {
      const keys = st.waves[B.wave];
      B.enemies = keys.map(k => makeEnemy(k, st.lv));
      if (p.fx === 'delay') B.enemies.forEach(e => e.counter++);
      layoutEnemies();
      await Promise.all(B.enemies.map(async e => {
        if (e.holo) {
          try { e.sprite = await Sprites.pixelatedHologram(img(e.holo), 32); }
          catch { e.sprite = Sprites.enemySprite('orb', 'fallen', e.weak); }
        } else {
          e.sprite = Sprites.enemySprite(e.tpl, e.fac, e.weak);
        }
      }));
      B.target = B.enemies.findIndex(e => e.boss);
      if (B.target < 0) B.target = 0;
      $('.wv').textContent = `WAVE ${B.wave + 1}/${st.waves.length}`;
      B.banner = { text: B.enemies.some(e => e.boss) ? 'WARNING' : `WAVE ${B.wave + 1}`, t: 0, dur: 1100, color: B.enemies.some(e => e.boss) ? '#ff4d4d' : '#ffd28a' };
      await sleep(900);
    }
    function layoutEnemies() {
      const n = B.enemies.length;
      const boss = B.enemies.findIndex(e => e.boss);
      const slots = n === 1 ? [[240, 134]] : n === 2 ? [[210, 128], [272, 142]] : [[190, 124], [240, 144], [284, 120]];
      let order = B.enemies.map((e, i) => i);
      if (boss >= 0 && n > 1) { order = order.filter(i => i !== boss); order.splice(1, 0, boss); }
      order.forEach((ei, si) => { const [x, y] = slots[si] || slots[0]; B.enemies[ei].x = x; B.enemies[ei].y = y; });
    }
    const alive = () => B.enemies.filter(e => e.hp > 0);
    function retarget() {
      if (B.enemies[B.target]?.hp > 0) return;
      const i = B.enemies.findIndex(e => e.hp > 0);
      B.target = i < 0 ? 0 : i;
    }
    function gainOrbs(n) {
      const pool = [];
      if (p.element === 'prism') pool.push('arc', 'solar', 'void', 'stasis', 'strand');
      else pool.push(p.element, p.element, p.element);
      const ee = DT_ELEMENT[p.items.ene?.def.dt];
      if (ee && ee !== 'kin') pool.push(ee, ee);
      pool.push('light', 'light');
      for (let i = 0; i < n && p.orbs.length < MAX_ORBS; i++) p.orbs.push(pick(pool));
    }
    function addSuper(v) { p.superG = clamp(p.superG + v * p.superRate, 0, 100); }
    function spriteBox(e) {
      const s = e.sprite;
      const sc = (e.holo ? 1.5 : 2) * e.scale;
      const w = (s?.width || 24) * sc, h = (s?.height || 24) * sc;
      return { x: e.x - w / 2, y: e.y - h, w, h, sc };
    }

    // Deal damage to one enemy; returns dealt amount
    function hit(e, base, elem, brk, opts = {}) {
      if (e.hp <= 0) return 0;
      let d = base * (0.9 + Math.random() * 0.2);
      const crit = Math.random() < p.crit + (opts.critBonus || 0);
      if (crit) d *= 1.5;
      const weak = elem === e.weak || elem === 'prism';
      if (weak) d *= 1.5;
      if (e.broken > 0) d *= 2;
      if (p.fx === 'atk') d *= 1.1;
      if (opts.ability && p.fx === 'ability') d *= 1.2;
      d = Math.round(d);
      e.hp = Math.max(0, e.hp - d);
      e.hitT = 1;
      const bx = spriteBox(e);
      popup(e.x + rand(10) - 5, bx.y + 6, (crit ? '!' : '') + d.toLocaleString(), weak ? Sprites.ELEMENT_COLORS[elem] : '#ffffff', crit || opts.big);
      burst(e.x, e.y - bx.h / 2, Sprites.ELEMENT_COLORS[elem] || '#fff', 6);
      // Break gauge (D2 elemental shield)
      if (e.broken <= 0 && brk > 0) {
        e.bk -= brk * (weak ? 3 : 1) * (elem === 'kin' ? 0.6 : 1) * (p.fx === 'brk' ? 1.25 : 1);
        if (e.bk <= 0) {
          e.bk = 0; e.broken = 3; e.counter += 1;
          popup(e.x, bx.y - 6, 'BREAK!', '#ffd84a', true);
          B.shake = 6; addSuper(15);
          log(`${e.n} をブレイク! 3ターンの間ダメージ2倍`);
        }
      }
      if (e.hp <= 0) { e.dieT = 1; burst(e.x, e.y - bx.h / 2, '#ffffff', 16); }
      return d;
    }

    async function playerAttackAnim(target, color) {
      B.playerAtkT = 1;
      const tb = spriteBox(target);
      beam(84, 118, target.x, tb.y + tb.h / 2, color);
      await sleep(180);
    }

    // ---- actions ----
    async function normalAttack() {
      const e = B.enemies[B.target];
      const kin = p.items.kin?.def;
      const special = kin?.am === 2;
      const base = p.atk * (0.6 + weaponImpact(kin) / 100) * (special ? 1.6 : 1) * (1 + p.stats.weapons / 150) * (p.buffs.gunslinger ? 1.8 : 1);
      p.buffs.gunslinger = 0;
      await playerAttackAnim(e, '#ffffff');
      hit(e, base, DT_ELEMENT[kin?.dt] || 'kin', 6);
      const n = (special ? 1 : 2) + (p.fx === 'orb' ? 1 : 0);
      gainOrbs(n);
      addSuper(6);
      log(`${kin?.n || '素手'} で攻撃 → エレメント +${n}`);
    }
    async function useCard(c) {
      pay(p, c.cost);
      if (c.kind === 'atk') {
        const targets = c.aoe ? alive() : [B.enemies[B.target]];
        const color = Sprites.ELEMENT_COLORS[c.el] || '#fff';
        B.playerAtkT = 1;
        for (const t of targets) { const tb = spriteBox(t); beam(84, 118, t.x, tb.y + tb.h / 2, color); }
        await sleep(200);
        let total = 0;
        for (const t of targets) total += hit(t, p.atk * c.mult, c.el, c.brk, { ability: c.id === 'gre' || c.id === 'mel', big: c.id === 'pow' });
        if (c.id === 'pow') B.shake = 5;
        addSuper(10);
        log(`${c.name}! ${total.toLocaleString()} ダメージ`);
      } else if (c.kind === 'class') {
        const m = 1 + p.stats.cls / 100;
        if (p.cls === 0) { p.buffs.barricade = 2; log(`${c.name}: 2ターンの間 被ダメージ ${Math.round(50 * Math.min(1.4, m))}% カット`); popup(60, 70, 'BARRICADE', '#79bbff', true); }
        else if (p.cls === 1) { p.buffs.evade = 1; p.buffs.gunslinger = 1; log(`${c.name}: 次の攻撃を回避 & 次の通常攻撃が強化`); popup(60, 70, 'DODGE', '#e2c770', true); }
        else { const v = Math.round(p.maxHp * 0.22 * m * (p.fx === 'heal' ? 1.3 : 1)); p.hp = Math.min(p.maxHp, p.hp + v); p.buffs.regen = 3; popup(60, 70, '+' + v, '#6ee07a', true); log(`${c.name}: HP ${v} 回復 + 3ターン継続回復`); }
        addSuper(6);
      } else if (c.kind === 'heal') {
        const v = Math.round(p.maxHp * 0.3 * (p.fx === 'heal' ? 1.3 : 1));
        p.hp = Math.min(p.maxHp, p.hp + v);
        popup(60, 70, '+' + v, '#6ee07a', true);
        log(`ゴーストが光を注ぐ: HP ${v} 回復`);
      }
    }
    async function useSuper() {
      const s = p.abil.sup;
      p.superG = 0;
      B.superFlash = 1;
      B.banner = { text: s?.n || 'SUPER', t: 0, dur: 1000, color: Sprites.ELEMENT_COLORS[p.element] || '#fff' };
      await sleep(700);
      B.shake = 10;
      const elem = p.element;
      let total = 0;
      for (const t of alive()) total += hit(t, p.atk * 6.5 * (1 + p.stats.super / 150), elem, 40, { big: true });
      log(`スーパー「${s?.n || ''}」! 合計 ${total.toLocaleString()} ダメージ`);
      await sleep(300);
    }

    // ---- enemy phase ----
    async function enemyPhase() {
      for (const e of alive()) {
        if (e.broken > 0) {
          e.broken--;
          if (e.broken === 0) e.bk = Content.enemyDef(e.key).brk;
          continue;
        }
        e.counter--;
        if (e.counter > 0) continue;
        e.counter = e.spd;
        e.atkT = 1;
        await sleep(200);
        if (p.buffs.evade || Math.random() < p.evade) {
          p.buffs.evade = 0;
          popup(60, 80, 'MISS', '#e2c770');
          log(`${e.n} の攻撃を回避した`);
        } else {
          let d = e.atkV * (0.9 + Math.random() * 0.2) * (1 - p.dr);
          if (p.buffs.barricade) d *= 0.5;
          d = Math.round(d * (e.boss ? 1.25 : 1));
          p.hp = Math.max(0, p.hp - d);
          B.playerHitT = 1; B.shake = 4;
          popup(60, 80, '-' + d, '#ff5d5d', d > p.maxHp * 0.2);
          addSuper(4);
          log(`${e.n} の攻撃! ${d} ダメージ`);
        }
        await sleep(260);
        if (p.hp <= 0) return;
      }
      if (p.buffs.barricade) p.buffs.barricade--;
      if (p.buffs.regen) { const v = Math.round(p.maxHp * 0.06); p.hp = Math.min(p.maxHp, p.hp + v); popup(60, 64, '+' + v, '#6ee07a'); p.buffs.regen--; }
    }

    // ---- turn driver ----
    async function doAction(fn) {
      if (B.busy || B.done) return;
      B.busy = true; updateHud();
      await fn();
      updateHud();
      await sleep(250);
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
    async function finish() {
      updateHud();
      await sleep(1300);
      running = false;
      if (B.done !== 'win') return resolveBattle({ win: false });
      // Rewards
      const first = !S.cleared[st.id];
      const glimmer = Math.round(st.reward * (first || st.farm ? 1 : 0.6)) + (first ? 500 : 0);
      S.glimmer += glimmer;
      const job = jobById(p.job.id);
      const xp = Math.round(30 * st.lv);
      const levelUp = gainJobXp(job, xp);
      const drops = [];
      if (st.drop && (Math.random() < st.drop.chance || (st.drop.first && first))) {
        let it = null;
        if (st.drop.pool === 'exotic') it = rollEngramItem(p.cls, true);
        else {
          const slot = st.drop.pool === 'armor' ? pick(ARMOR_SLOTS) : pick(['kin', 'ene', 'pow']);
          it = pick((Data.pool[slot] || []).filter(x => x.tt === (Math.random() < 0.05 ? 6 : 5) && (x.it === 3 || x.cl === p.cls || x.cl === 3)));
        }
        if (it) { addItem(it, 'drop'); drops.push(it); }
      }
      save();
      resolveBattle({ win: true, glimmer, xp, levelUp, lv: job.lv, drops });
    }

    // ---- HUD ----
    function updateHud() {
      $('.hp i').style.width = (p.hp / p.maxHp * 100) + '%';
      $('.hp span').textContent = `${p.hp} / ${p.maxHp}`;
      $('.sg i').style.width = p.superG + '%';
      $('.sg span').textContent = `${Math.floor(p.superG)}%`;
      $('.orbs').innerHTML = Array.from({ length: MAX_ORBS }, (_, i) => {
        const o = p.orbs[i];
        return o ? `<span class="orb" style="background:${Sprites.ELEMENT_COLORS[o]};color:${Sprites.ELEMENT_COLORS[o]}" title="${ELEMENT_NAME[o]}"></span>` : '<span class="orb empty"></span>';
      }).join('');
      const cw = $('.cards');
      if (!cw.children.length) {
        for (const c of cards) {
          const b = el(`<button class="card" data-id="${c.id}">
            ${c.icon ? `<img src="${img(c.icon)}">` : '<canvas width="8" height="8" style="width:32px;height:32px;background:#000"></canvas>'}
            <div><div class="cn">${esc(c.name)}</div><div class="cost">${costPips(c.cost)}</div></div></button>`);
          if (!c.icon) { const cv = b.querySelector('canvas'); cv.getContext('2d').drawImage(B.ghostSprite, 0, 0); }
          b.onclick = () => doAction(() => useCard(c));
          cw.appendChild(b);
        }
      }
      for (const b of cw.children) {
        const c = cards.find(x => x.id === b.dataset.id);
        const ok = canPay(p.orbs, c.cost);
        b.disabled = B.busy || !!B.done || !ok;
        b.classList.toggle('ready', ok && !B.busy);
      }
      $('.atk').disabled = B.busy || !!B.done;
      const sb = $('.superbtn');
      sb.disabled = B.busy || !!B.done || p.superG < 100 || !p.abil.sup;
      sb.classList.toggle('ready', p.superG >= 100 && !B.busy);
    }
    $('.atk').onclick = () => doAction(normalAttack);
    $('.superbtn').onclick = () => doAction(useSuper);
    $('.flee').onclick = () => { if (confirm('撤退しますか?(報酬なし)')) { B.done = 'lose'; running = false; resolveBattle({ win: false }); } };
    canvas.addEventListener('click', ev => {
      const r = canvas.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width * VW, y = (ev.clientY - r.top) / r.height * VH;
      const idx = B.enemies.findIndex(e => { if (e.hp <= 0) return false; const b = spriteBox(e); return x >= b.x && x <= b.x + b.w && y >= b.y - 14 && y <= b.y + b.h; });
      if (idx < 0) return;
      if (idx === B.target) doAction(normalAttack); // tap the current target again = attack (Mobius style)
      else { B.target = idx; log(`ターゲット: ${B.enemies[idx].n}(もう一度タップで攻撃)`); }
    });

    // ---- render loop ----
    let running = true, last = performance.now();
    function frame(now) {
      if (!running) return;
      const dt = Math.min(50, now - last); last = now; B.time += dt;
      draw(dt);
      requestAnimationFrame(frame);
    }
    function bar(x, y, w, h, v, color, bgc = '#000') {
      g.fillStyle = '#05070a'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = bgc; g.fillRect(x, y, w, h);
      g.fillStyle = color; g.fillRect(x, y, Math.max(0, w * v), h);
    }
    function draw(dt) {
      g.setTransform(RS, 0, 0, RS, 0, 0);
      g.imageSmoothingEnabled = false;
      let sx = 0, sy = 0;
      if (B.shake > 0) { sx = (Math.random() - 0.5) * B.shake; sy = (Math.random() - 0.5) * B.shake; B.shake = Math.max(0, B.shake - dt * 0.03); }
      g.translate(sx, sy);
      if (B.bg) g.drawImage(B.bg, 0, 0, VW, VH);
      // ground darkening
      const gr = g.createLinearGradient(0, VH * 0.55, 0, VH);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = gr; g.fillRect(0, VH * 0.55, VW, VH * 0.45);
      if (B.superFlash > 0) { g.fillStyle = `rgba(255,255,255,${B.superFlash * 0.6})`; g.fillRect(0, 0, VW, VH); B.superFlash = Math.max(0, B.superFlash - dt / 600); }

      // Player
      const bob = Math.sin(B.time / 300) * 1;
      const lunge = B.playerAtkT > 0 ? Math.sin(B.playerAtkT * Math.PI) * 8 : 0;
      B.playerAtkT = Math.max(0, B.playerAtkT - dt / 250);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(36, 148, 40, 4);
      if (!(B.playerHitT > 0 && Math.floor(B.time / 50) % 2)) g.drawImage(B.playerSprite, 32 + lunge, 102 + bob, 48, 48);
      B.playerHitT = Math.max(0, B.playerHitT - dt / 400);
      if (p.buffs.barricade) { g.fillStyle = 'rgba(121,187,255,0.35)'; g.fillRect(84, 100, 6, 48); }
      g.drawImage(B.ghostSprite, 78, 86 + Math.sin(B.time / 220) * 3, 16, 16);

      // Enemies
      B.enemies.forEach((e, i) => {
        if (e.hp <= 0 && e.dieT <= 0) return;
        const b = spriteBox(e);
        const fb = Math.sin(B.time / 400 + i) * (e.tpl === 'float' || e.tpl === 'orb' || e.holo ? 2 : 0.6);
        const ax = e.atkT > 0 ? -Math.sin(e.atkT * Math.PI) * 10 : 0;
        e.atkT = Math.max(0, (e.atkT || 0) - dt / 300);
        g.save();
        if (e.dieT > 0 && e.hp <= 0) { g.globalAlpha = e.dieT; e.dieT = Math.max(0, e.dieT - dt / 500); }
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(e.x - b.w * 0.35, e.y - 2, b.w * 0.7, 3);
        if (e.boss && e.aura) { g.fillStyle = e.aura + '44'; g.fillRect(b.x - 2, b.y - 2 + fb, b.w + 4, b.h + 4); }
        if (e.sprite) g.drawImage(e.sprite, b.x + ax, b.y + fb, b.w, b.h);
        if (e.hitT > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = e.hitT * 0.8; if (e.sprite) g.drawImage(e.sprite, b.x + ax, b.y + fb, b.w, b.h); e.hitT = Math.max(0, e.hitT - dt / 200); }
        g.restore();
        if (e.hp <= 0) return;
        // UI above enemy
        const top = Math.max(18, b.y - 16);
        const w = Math.max(36, Math.min(70, b.w));
        const ux = clamp(e.x, w / 2 + 8, VW - w / 2 - 14); // keep labels inside the canvas
        g.font = '6px DotGothic16, monospace'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillStyle = '#000'; g.fillText(e.n, ux + 0.5, top - 1.5);
        g.fillStyle = e.boss ? '#ffd28a' : '#fff'; g.fillText(e.n, ux, top - 2);
        bar(ux - w / 2, top, w, 3, e.hp / e.maxHp, '#ff5d5d', '#300');
        const bkMax = Content.enemyDef(e.key).brk;
        bar(ux - w / 2, top + 5, w, 2, e.broken > 0 ? 1 : e.bk / bkMax, e.broken > 0 ? '#ffd84a' : Sprites.ELEMENT_COLORS[e.weak], '#111');
        // turn counter (Mobius style)
        const cx = ux + w / 2 + 6, cy = top + 1;
        g.fillStyle = e.broken > 0 ? '#ffd84a' : e.counter <= 1 ? '#ff3b3b' : '#1c2433';
        g.fillRect(cx - 5, cy - 3, 10, 10);
        g.fillStyle = e.broken > 0 || e.counter <= 1 ? '#000' : '#fff';
        g.font = '8px DotGothic16, monospace';
        g.fillText(e.broken > 0 ? 'B' : String(e.counter), cx, cy + 5);
        // weak element dot
        g.fillStyle = Sprites.ELEMENT_COLORS[e.weak]; g.fillRect(ux - w / 2 - 6, top, 4, 4);
        if (i === B.target && !B.done) {
          const ty = b.y + b.h + 4 + Math.sin(B.time / 150) * 1.5;
          g.fillStyle = '#ffd28a';
          g.beginPath(); g.moveTo(e.x, ty); g.lineTo(e.x - 4, ty + 5); g.lineTo(e.x + 4, ty + 5); g.fill();
        }
      });

      // Effects
      B.fx = B.fx.filter(f => (f.t += dt) < f.dur);
      for (const f of B.fx) {
        const k = f.t / f.dur;
        if (f.type === 'beam') {
          g.strokeStyle = f.color; g.globalAlpha = 1 - k; g.lineWidth = 2;
          g.beginPath(); g.moveTo(f.x0, f.y0); g.lineTo(f.x1, f.y1); g.stroke(); g.globalAlpha = 1;
        } else if (f.type === 'pt') {
          g.fillStyle = f.color; g.globalAlpha = 1 - k;
          g.fillRect(f.x + f.vx * f.t / 16, f.y + f.vy * f.t / 16 + 0.002 * f.t * f.t / 16, 2, 2); g.globalAlpha = 1;
        } else if (f.type === 'txt') {
          g.font = (f.big ? '11px' : '8px') + ' DotGothic16, monospace'; g.textAlign = 'center';
          const y = f.y - k * 14;
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          g.fillStyle = '#000'; g.fillText(f.text, f.x + 1, y + 1);
          g.fillStyle = f.color; g.fillText(f.text, f.x, y); g.globalAlpha = 1;
        }
      }
      // Banner
      if (B.banner) {
        B.banner.t += dt;
        const k = B.banner.t / B.banner.dur;
        if (k >= 1) B.banner = null;
        else {
          g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, VH / 2 - 14, VW, 24);
          g.font = '16px DotGothic16, monospace'; g.textAlign = 'center';
          g.fillStyle = '#000'; g.fillText(B.banner.text, VW / 2 + 1, VH / 2 + 4);
          g.fillStyle = B.banner.color; g.fillText(B.banner.text, VW / 2, VH / 2 + 3);
        }
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }

    requestAnimationFrame(frame);
    updateHud();
    log('敵をタップでターゲット、もう一度タップ(または通常攻撃)で攻撃');
    await loadWave();
    B.busy = false;
    updateHud();
    return battleDone;
  }

  boot();
})();
