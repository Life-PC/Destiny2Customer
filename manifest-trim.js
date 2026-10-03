/* Shared manifest trimming logic.
 * Loaded by the browser (<script src="manifest-trim.js">) as a fallback path,
 * and by tools/build-manifest.js (Node) to produce data/manifest-ja.json.
 * Output format = "compact manifest" consumed by installManifest() in index.html.
 */
(function (root) {
  const SCHEMA = 8; // bump when output format changes (forces browser cache rebuild)

  // Plug category for weapon "frames" (perk columns). Enhanced perks = Frames + tierType 3 (Common)
  const PLUG_CAT_FRAMES = 7906839;

  function trimItem(it) {
    if (it.redacted || it.blacklisted) return null;
    const dp = it.displayProperties;
    if (!dp || !dp.name) return null;
    const isPlug = it.itemType === 19;
    const isMain = it.itemType === 2 || it.itemType === 3 || it.itemType === 16;
    if (!isPlug && !isMain) return null;
    if (!dp.icon) return null;
    const t = { h: it.hash, n: dp.name, i: dp.icon, it: it.itemType };
    if (dp.description) t.d = dp.description;
    if (it.iconWatermark || it.iconWatermarkFeatured) t.w = it.iconWatermark || it.iconWatermarkFeatured;
    if (it.itemTypeDisplayName) t.t = it.itemTypeDisplayName;
    if (it.inventory && it.inventory.tierType) t.tt = it.inventory.tierType;
    if (isPlug) {
      const pc = it.plug && it.plug.plugCategoryHash;
      const pid = (it.plug && it.plug.plugCategoryIdentifier) || '';
      // Enhanced perk: tierType 3 (Common) + trait frame / "強化版〇〇" type (barrel, magazine, ...)
      if (t.tt === 3 && (pc === PLUG_CAT_FRAMES || /強化|Enhanced/i.test(t.t || ''))) t.en = 1;
      // Not a real perk: trackers / memento trackers / empty placeholder sockets
      if (/trackers|empty_socket|(^|\.)empty(\.|$)/.test(pid)) t.x = 1;
      // Stat bonuses granted by the plug (used to show enhanced-perk differences)
      if (it.investmentStats && it.investmentStats.length) {
        const s = {};
        for (const x of it.investmentStats) if (x.value && !x.isConditionallyActive) s[x.statTypeHash] = x.value;
        if (Object.keys(s).length) t.ps = s;
      }
      return t;
    }
    if (it.itemSubType) t.is = it.itemSubType;
    if (it.classType != null) t.cl = it.classType;
    if (it.defaultDamageType) t.dt = it.defaultDamageType;
    if (it.inventory && it.inventory.tierTypeName) t.ttn = it.inventory.tierTypeName;
    if (it.flavorText) t.fx = it.flavorText;
    if (it.screenshot) t.s = it.screenshot;
    if (it.inventory && it.inventory.bucketTypeHash) t.bk = it.inventory.bucketTypeHash;
    if (it.equippingBlock && it.equippingBlock.equipmentSlotTypeHash) t.eq = it.equippingBlock.equipmentSlotTypeHash;
    if (it.equippingBlock && it.equippingBlock.ammoType) t.am = it.equippingBlock.ammoType;
    if (it.stats && it.stats.stats) {
      const s = {};
      for (const k in it.stats.stats) {
        const v = it.stats.stats[k].value;
        if (v != null && v !== 0) s[k] = v;
      }
      if (Object.keys(s).length) t.st = s;
    }
    if (it.sockets && it.sockets.socketEntries) {
      t.sk = it.sockets.socketEntries.map(se => {
        const o = {};
        if (se.singleInitialItemHash) o.s = se.singleInitialItemHash;
        if (se.reusablePlugItems && se.reusablePlugItems.length) o.r = se.reusablePlugItems.map(p => p.plugItemHash);
        if (se.randomizedPlugSetHash) o.rp = se.randomizedPlugSetHash;
        if (se.reusablePlugSetHash) o.ps = se.reusablePlugSetHash;
        if (se.socketTypeHash) o.st = se.socketTypeHash;
        return o;
      });
      if (it.sockets.socketCategories) {
        t.sc = it.sockets.socketCategories.map(c => ({ h: c.socketCategoryHash, i: c.socketIndexes }));
      }
    }
    return t;
  }

  // PlugSet → array of plug hashes. Perks that can no longer roll (currentlyCanRoll=false)
  // are dropped, unless that would empty the set. Duplicates removed.
  function trimPlugSet(ps) {
    const r = ps.reusablePlugItems;
    if (!r || !r.length) return null;
    const uniq = arr => Array.from(new Set(arr));
    const rollable = uniq(r.filter(p => p.currentlyCanRoll !== false).map(p => p.plugItemHash));
    return rollable.length ? rollable : uniq(r.map(p => p.plugItemHash));
  }

  /* raw = { items, plugSets, stats, socketTypes, ldName, ldIcon, ldColor } (Bungie world component tables) */
  function buildCompact(version, raw) {
    const items = [];
    const allPlugs = {};
    for (const k in raw.items) {
      const t = trimItem(raw.items[k]);
      if (!t) continue;
      if (t.it === 19) allPlugs[t.h] = t; else items.push(t);
    }
    const plugSets = {};
    for (const k in raw.plugSets) {
      const t = trimPlugSet(raw.plugSets[k]);
      if (t) plugSets[k] = t;
    }
    // Keep only plugs reachable from some item socket or plug set
    const used = new Set();
    const usedSets = new Set();
    for (const it of items) {
      for (const se of it.sk || []) {
        if (se.s) used.add(se.s);
        if (se.r) se.r.forEach(h => used.add(h));
        if (se.rp) usedSets.add(se.rp);
        if (se.ps) usedSets.add(se.ps);
      }
    }
    for (const k in plugSets) {
      // keep every plug set (live items may reference plugs via sets we didn't see)
      plugSets[k].forEach(h => used.add(h));
    }
    const plugs = {};
    for (const h of used) if (allPlugs[h]) plugs[h] = allPlugs[h];
    // Drop plug sets not referenced by any item (saves space)
    for (const k in plugSets) if (!usedSets.has(+k)) delete plugSets[k];

    const statDefs = {};
    for (const k in raw.stats) {
      const s = raw.stats[k];
      if (s.redacted || !s.displayProperties || !s.displayProperties.name) continue;
      statDefs[k] = { n: s.displayProperties.name, d: s.displayProperties.description || '', idx: s.index || 0 };
    }
    const loadoutDefs = { names: {}, icons: {}, colors: {} };
    for (const k in raw.ldName || {}) { const n = raw.ldName[k] && raw.ldName[k].name; if (n) loadoutDefs.names[k] = n; }
    for (const k in raw.ldIcon || {}) { const p = raw.ldIcon[k] && raw.ldIcon[k].iconImagePath; if (p) loadoutDefs.icons[k] = p; }
    for (const k in raw.ldColor || {}) { const p = raw.ldColor[k] && raw.ldColor[k].colorImagePath; if (p) loadoutDefs.colors[k] = p; }
    // Pre-sort items (tier desc → name) so the browser doesn't have to sort 8000+ items on every filter
    const collator = new Intl.Collator('ja');
    items.sort((a, b) => ((b.tt || 0) - (a.tt || 0)) || collator.compare(a.n, b.n));
    return { schema: SCHEMA, version, items, plugs, plugSets, statDefs, loadoutDefs };
  }

  // Component tables needed from jsonWorldComponentContentPaths
  const TABLES = {
    items: 'DestinyInventoryItemDefinition',
    plugSets: 'DestinyPlugSetDefinition',
    stats: 'DestinyStatDefinition',
    ldName: 'DestinyLoadoutNameDefinition',
    ldIcon: 'DestinyLoadoutIconDefinition',
    ldColor: 'DestinyLoadoutColorDefinition',
  };

  const api = { SCHEMA, PLUG_CAT_FRAMES, TABLES, trimItem, trimPlugSet, buildCompact };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.D2Trim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
