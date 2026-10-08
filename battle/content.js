/* D2 MOBIUS — game content: enemies, stages, story, armor set effects, job naming */
(function (root) {
  'use strict';

  // Damage type hash → element key
  const DT_ELEMENT = { 1: 'kin', 2: 'arc', 3: 'solar', 4: 'void', 6: 'stasis', 7: 'strand' };
  const ELEMENT_NAME = {
    kin: 'キネティック', arc: 'アーク', solar: 'ソーラー', void: 'ボイド',
    stasis: 'ステイシス', strand: 'ストランド', light: '光', prism: 'プリズム', any: '任意',
  };
  const CLASS_NAME = ['タイタン', 'ハンター', 'ウォーロック'];

  /* ---------- Enemies ----------
   * tpl: 32x32 pixel map (sprites.js ENEMY) or holo (API icon path, pixelated at runtime)
   * pal: palette overrides on top of the faction palette (colors referenced from Destiny art)
   * hp/atk are base values (scaled by stage level). spd = turns between attacks.
   * brk = break gauge. weak = element whose hits break 3x faster (D2 elemental shield). */
  const HOUSE_DEVILS = { C: '#b02a2a', c: '#6e1a1a', E: '#ff5050' };
  const ENEMIES = {
    // Hologram training enemies — images from the Bungie API (pixelated)
    holo_drone:  { n: 'ホロ・ドローン', fac: 'holo', holo: '/common/destiny2_content/icons/624dff6dc506e217c4126576c96451b8.jpg', hp: 380, atk: 40, spd: 3, brk: 30, weak: 'arc' },
    holo_brig:   { n: 'ホロ・ブリッグ', fac: 'holo', holo: '/common/destiny2_content/icons/351af3b52a13d16f74b7007006e46dc9.jpg', hp: 1100, atk: 75, spd: 4, brk: 60, weak: 'solar', scale: 1.3 },
    holo_mino:   { n: 'ホロ・ミノタウロス', fac: 'holo', holo: '/common/destiny2_content/icons/4397c7eff0751bdcd6eb17b5bde93bb1.jpg', hp: 900, atk: 70, spd: 3, brk: 50, weak: 'void', scale: 1.2 },
    // Hive — bone chitin, green glow
    thrall:   { n: 'スラル', fac: 'hive', tpl: 'thrall', hp: 420, atk: 45, spd: 2, brk: 20, weak: 'solar', scale: 0.9 },
    acolyte:  { n: 'アコライト', fac: 'hive', tpl: 'acolyte', hp: 620, atk: 60, spd: 3, brk: 35, weak: 'arc', pal: { B: '#a99a7c', b: '#6e6250', H: '#d8ccb0' } },
    knight:   { n: 'ナイト', fac: 'hive', tpl: 'knight', hp: 1500, atk: 95, spd: 4, brk: 70, weak: 'solar', scale: 1.15, pal: { B: '#5a5866', b: '#3a3844', H: '#a8a69a', S: '#8a8678' } },
    wizard:   { n: 'ウィザード', fac: 'hive', tpl: 'wizard', hp: 1200, atk: 90, spd: 3, brk: 60, weak: 'void', pal: { B: '#c8b48a', b: '#8a7a58', D: '#3a2a3a', E: '#b6ff9a' } },
    // Fallen — white plates, tan/red cloth, four arms
    dreg:     { n: 'ドレッグ', fac: 'fallen', tpl: 'dreg', hp: 400, atk: 45, spd: 2, brk: 20, weak: 'arc', scale: 0.9 },
    vandal:   { n: 'ヴァンダル', fac: 'fallen', tpl: 'vandal', hp: 650, atk: 65, spd: 3, brk: 35, weak: 'arc', pal: HOUSE_DEVILS },
    captain:  { n: 'キャプテン', fac: 'fallen', tpl: 'captain', hp: 1600, atk: 100, spd: 4, brk: 75, weak: 'arc', scale: 1.15, pal: HOUSE_DEVILS },
    servitor: { n: 'サーヴィター', fac: 'fallen', tpl: 'servitor', hp: 1300, atk: 80, spd: 4, brk: 60, weak: 'void', pal: { B: '#3a3a4c', b: '#24242f', H: '#6a6a88', D: '#120f1c', E: '#9b5cff' } },
    // Vex — brass, milky white, red eye
    goblin:   { n: 'ゴブリン', fac: 'vex', tpl: 'goblin', hp: 480, atk: 50, spd: 2, brk: 25, weak: 'void' },
    fanatic:  { n: 'ファナティック', fac: 'vex', tpl: 'goblin', hp: 600, atk: 90, spd: 3, brk: 35, weak: 'arc', scale: 1.05 },   // long-range sniper
    hobgoblin:{ n: 'ホブゴブリン', fac: 'vex', tpl: 'goblin', hp: 750, atk: 75, spd: 3, brk: 45, weak: 'solar', scale: 1.05 },   // clawed brute
    harpy:    { n: 'ハーピー', fac: 'vex', tpl: 'harpy', hp: 420, atk: 55, spd: 2, brk: 20, weak: 'solar', scale: 0.85 },
    minotaur: { n: 'ミノタウロス', fac: 'vex', tpl: 'minotaur', hp: 1700, atk: 105, spd: 4, brk: 80, weak: 'void', scale: 1.15, pal: { D: '#1f2a4a' } },
    hydra:    { n: 'ハイドラ', fac: 'vex', tpl: 'hydra', hp: 2000, atk: 110, spd: 4, brk: 90, weak: 'arc', scale: 1.2 },
    // Cabal (Red Legion) — heavy armor, visor glow
    legionary:{ n: 'レギオネア', fac: 'cabal', tpl: 'legionary', hp: 800, atk: 65, spd: 3, brk: 40, weak: 'solar' },
    phalanx:  { n: 'ファランクス', fac: 'cabal', tpl: 'phalanx', hp: 1300, atk: 70, spd: 4, brk: 90, weak: 'arc', scale: 1.05 },
    psion:    { n: 'サイオン', fac: 'cabal', tpl: 'psion', hp: 450, atk: 60, spd: 2, brk: 20, weak: 'void', pal: { B: '#9a3a30', b: '#622420', E: '#ffe066' } },
    centurion:{ n: 'センチュリオン', fac: 'cabal', tpl: 'centurion', hp: 1900, atk: 115, spd: 4, brk: 85, weak: 'solar', scale: 1.2, pal: { B: '#c07a2a', b: '#7e4e1a', H: '#e8b060' } },
    // Taken — black silhouettes with white glow
    t_thrall: { n: 'テイクン・スラル', fac: 'taken', tpl: 'thrall', hp: 520, atk: 55, spd: 2, brk: 25, weak: 'void', scale: 0.9 },
    t_psion:  { n: 'テイクン・サイオン', fac: 'taken', tpl: 'psion', hp: 560, atk: 70, spd: 2, brk: 25, weak: 'stasis' },
    t_knight: { n: 'テイクン・ナイト', fac: 'taken', tpl: 'knight', hp: 1800, atk: 110, spd: 4, brk: 80, weak: 'void', scale: 1.15 },
    t_wizard: { n: 'テイクン・ウィザード', fac: 'taken', tpl: 'wizard', hp: 1500, atk: 105, spd: 3, brk: 70, weak: 'strand' },
  };

  // Bosses: base enemy + overrides (always scale 1.6, boss flag)
  const BOSSES = {
    b_zahn:    { base: 'centurion', n: '武器商人ブラカス・ザーン', hp: 6000, atk: 150, brk: 160, weak: 'solar' },
    b_navota:  { base: 'wizard', n: '辱められしウィザード ナボタ', hp: 6500, atk: 155, brk: 170, weak: 'void' },
    b_thaviks: { base: 'captain', n: '堕落したキャプテン サビクス', hp: 7500, atk: 165, brk: 180, weak: 'arc' },
    b_protheon:{ base: 'minotaur', n: 'モジュラー・マインド プロテオン', hp: 8500, atk: 175, brk: 200, weak: 'void' },
    b_mind:    { base: 'hydra', n: '暴走したベックス・マインド', hp: 9500, atk: 185, brk: 220, weak: 'arc' },
    b_sedia:   { base: 't_wizard', n: '堕ちた相談役 セディア', hp: 10500, atk: 195, brk: 230, weak: 'strand' },
    b_vorgeth: { base: 'knight', n: '飽くなき飢え ヴォルゲス', hp: 12000, atk: 210, brk: 250, weak: 'solar' },
    b_mobius:  { base: 'hydra', n: 'メビウス・マインド', hp: 16000, atk: 240, brk: 300, weak: 'void', aura: '#ff3b3b' },
    b_holo:    { base: 'holo_brig', n: '演習用ブリッグ「GHOST-07」', hp: 2600, atk: 90, brk: 90, weak: 'solar' },
  };

  function enemyDef(key) {
    if (ENEMIES[key]) return { key, ...ENEMIES[key] };
    const b = BOSSES[key];
    if (!b) throw new Error('unknown enemy ' + key);
    return { key, ...ENEMIES[b.base], ...b, boss: true, scale: 1.6 };
  }

  /* ---------- Stages (Chapter 1) ----------
   * act: activity name in the manifest (background = its PGCR image, pixelated)
   * waves: arrays of enemy keys. lv: difficulty multiplier.
   * drop: special drop on clear { chance, pool: 'weapon'|'armor'|'exotic' } */
  const STAGES = [
    { id: 's0', no: '0', name: 'ホログラム演習', act: null, lv: 1,
      waves: [['holo_drone', 'holo_drone'], ['holo_mino', 'holo_drone'], ['b_holo']],
      reward: 300, drop: { chance: 1, pool: 'weapon', first: true } },
    { id: 's1', no: '1-1', name: '武器商人', act: '武器商人', lv: 1.4,
      waves: [['legionary', 'psion', 'psion'], ['phalanx', 'legionary'], ['b_zahn', 'psion']],
      reward: 400, drop: { chance: 0.3, pool: 'weapon' } },
    { id: 's2', no: '1-2', name: '不名誉', act: '不名誉', lv: 1.8,
      waves: [['thrall', 'thrall', 'acolyte'], ['knight', 'acolyte'], ['b_navota', 'thrall']],
      reward: 450, drop: { chance: 0.3, pool: 'armor' } },
    { id: 's3', no: '1-3', name: 'エクソダスの墜落', act: 'エクソダスの墜落', lv: 2.3,
      waves: [['dreg', 'vandal', 'goblin'], ['servitor', 'vandal'], ['b_thaviks', 'dreg', 'goblin']],
      reward: 500, drop: { chance: 0.3, pool: 'weapon' } },
    { id: 's4', no: '1-4', name: '反転したスパイア', act: '反転したスパイア', lv: 2.8,
      waves: [['legionary', 'goblin', 'goblin'], ['minotaur', 'harpy'], ['b_protheon', 'harpy']],
      reward: 550, drop: { chance: 0.3, pool: 'armor' } },
    { id: 's5', no: '1-5', name: '庭園の世界', act: '庭園の世界', lv: 3.4,
      waves: [['goblin', 'harpy', 'fanatic'], ['hydra', 'hobgoblin'], ['b_mind', 'harpy', 'harpy']],
      reward: 600, drop: { chance: 0.35, pool: 'weapon' } },
    { id: 's6', no: '1-6', name: '汚染', act: '汚染', lv: 4.0,
      waves: [['t_thrall', 't_thrall', 't_psion'], ['t_knight', 't_psion'], ['b_sedia', 't_thrall']],
      reward: 700, drop: { chance: 0.35, pool: 'armor' } },
    { id: 's7', no: '1-7', name: '真紅の砦', act: '真紅の砦', lv: 4.7,
      waves: [['thrall', 'acolyte', 'wizard'], ['knight', 'knight'], ['b_vorgeth', 'acolyte']],
      reward: 800, drop: { chance: 0.4, pool: 'weapon' } },
    { id: 's8', no: '1-8', name: 'ガラスの間', act: 'ガラスの間', lv: 5.5,
      waves: [['goblin', 'fanatic', 'harpy'], ['hobgoblin', 'minotaur', 'hydra'], ['b_mobius', 'harpy', 'minotaur']],
      reward: 1200, drop: { chance: 0.5, pool: 'exotic' } },
    // Farming stage (repeatable, glimmer-rich)
    { id: 'f1', no: 'EX', name: '戦場: 雹(グリマー回収)', act: '戦場: 雹', lv: 2.5, farm: true,
      waves: [['legionary', 'psion', 'psion'], ['centurion', 'legionary']],
      reward: 900, drop: { chance: 0.15, pool: 'weapon' } },
  ];

  /* ---------- Story (speculative original) ----------
   * Each line: [speaker, text]. Speakers: ゴースト / ガーディアン / ザヴァラ / イコラ / ??? */
  const PROLOGUE = [
    ['', '──太陽系の各地で、過去の戦いが「再生」されている。'],
    ['', '消えたはずの敵、終わったはずの戦場。ベックスのネットワークが、時間そのものを環のようにねじり、何度も何度も同じ瞬間を繰り返していた。'],
    ['イコラ', 'ベックスはこれを「メビウス」と呼んでいるようね。始まりも終わりもない、裏表のない一本の帯。'],
    ['ザヴァラ', '環の中には、倒れたガーディアンたちの光の記録が閉じ込められている。このまま放置すれば、光そのものが書き換えられるかもしれん。'],
    ['ゴースト', '……ガーディアン。僕たちが行くしかないみたいだ。環の中なら、記録された戦場をもう一度歩ける。'],
    ['ゴースト', 'まずはタワーの演習場で、ホログラム相手に感覚を取り戻そう。エレメントの扱い方、覚えてるよね?'],
  ];
  const STORY = {
    s0: {
      pre: [
        ['ゴースト', '演習プログラム、起動。敵はホログラムだけど、手加減はしないよ。'],
        ['ゴースト', 'キネティック武器で撃てば、エレメントが溜まる。それを使ってグレネードやエネルギー武器を撃つんだ。'],
        ['ゴースト', '敵の弱点エレメントで攻撃すると、シールドゲージがぐっと削れる。ゲージを割れば「ブレイク」──大ダメージのチャンスだ!'],
      ],
      post: [
        ['ゴースト', 'いい動きだ! 光の扱い、ちゃんと体が覚えてる。'],
        ['ザヴァラ', '準備は整ったようだな。最初の歪みはEDZだ。レッドリージョンの補給線が「再生」されている。'],
      ],
    },
    s1: {
      pre: [
        ['ゴースト', 'ここがEDZ……でも空の色がおかしい。景色の端が、同じ映像を繰り返してるみたいだ。'],
        ['ザヴァラ', '武器商人ブラカス・ザーン。かつて倒した男だが、環の中では何度でも蘇る。補給を断て。'],
      ],
      post: [
        ['ゴースト', 'ザーンの体から、光の粒子が……これが閉じ込められていた「光の記録」だ。回収したよ。'],
        ['イコラ', '記録の断片に座標が刻まれているわ。次はコスモドローム。ハイヴの気配がする。'],
      ],
    },
    s2: {
      pre: [
        ['ゴースト', 'コスモドローム……僕が君を見つけた場所だ。懐かしい、なんて言ってる場合じゃないか。'],
        ['???', '……光ノ者……再ビ……来タカ……'],
        ['ゴースト', 'ウィザードのナボタ! 環の中で、ハイヴの呪詛まで再生されてる!'],
      ],
      post: [
        ['ゴースト', 'ナボタの呪詛が消えた。でも、あの声……ナボタは「再び」って言ってた。僕たちがここに来ることを、知っていたみたいだ。'],
      ],
    },
    s3: {
      pre: [
        ['イコラ', 'ネッススのエクソダスブラック墜落地点。フォールンとベックスが入り乱れているわ。'],
        ['ゴースト', 'キャプテンのサビクスがベックスの機械を漁ってる。環の仕組みを盗むつもりだ!'],
      ],
      post: [
        ['ゴースト', 'サビクスが持っていたデータ……環の「継ぎ目」の位置だ。ベックスのスパイアに繋がってる。'],
      ],
    },
    s4: {
      pre: [
        ['ザヴァラ', '反転したスパイア。レッドリージョンが掘り進めた先に、ベックスの中枢があった場所だ。'],
        ['ゴースト', 'モジュラー・マインド、プロテオン。環の継ぎ目を守っているのはこいつだ!'],
      ],
      post: [
        ['ゴースト', '継ぎ目が開いた……向こう側に見えるのは、水星? 庭園の世界だ。'],
        ['イコラ', 'オシリスが言っていた「無限の森」の一部かもしれないわね。気をつけて。'],
      ],
    },
    s5: {
      pre: [
        ['ゴースト', '庭園の世界。ベックスが無限に未来をシミュレートしている場所……環の心臓部に近い。'],
        ['ゴースト', '暴走したベックス・マインドが、シミュレーションを書き換え続けてる。止めないと!'],
      ],
      post: [
        ['ゴースト', 'マインドの記録を解析した。環を作ったのは、もっと上位の存在……「メビウス・マインド」。'],
        ['ゴースト', 'それと、気になるログがある。テイクンの反応……夢見る都市?'],
      ],
    },
    s6: {
      pre: [
        ['ゴースト', '夢見る都市。ここは元々、時間がループする呪いを抱えた場所だ。環と共鳴してる。'],
        ['???', '……女王の為に……全テハ……'],
        ['ゴースト', 'セディア……女王の相談役だった人が、テイクンに堕とされたまま再生されてる。解放してあげよう。'],
      ],
      post: [
        ['ゴースト', 'セディアの光の記録……最後に「ありがとう」って聞こえた気がする。'],
        ['イコラ', '月から強いハイヴの反応。真紅の砦が環に取り込まれたわ。'],
      ],
    },
    s7: {
      pre: [
        ['ゴースト', '真紅の砦。ハイヴの城が、まるで脈打つみたいに再生と崩壊を繰り返してる。'],
        ['ゴースト', '飽くなき飢え、ヴォルゲス。環のエネルギーを食べて巨大化してる!'],
      ],
      post: [
        ['ゴースト', 'ヴォルゲスが溜め込んでいた光の記録、全部回収したよ。これで環の中心座標が割り出せる。'],
        ['ザヴァラ', '場所は金星、ガラスの間。ベックスが時間を支配するための聖域だ。……決着をつけてこい、ガーディアン。'],
      ],
    },
    s8: {
      pre: [
        ['ゴースト', 'ガラスの間……環の中心だ。ここで全ての時間が折り返されてる。'],
        ['???', '──観測。光ノ個体。予測済ミ。全テノ結末ハ、既ニ計算サレテイル。'],
        ['ゴースト', 'メビウス・マインド! 君の計算に、僕たちの「次の一手」は入ってるかな?'],
      ],
      post: [
        ['ゴースト', 'メビウス・マインドの停止を確認……環がほどけていく。閉じ込められていた光の記録が、みんな還っていくよ。'],
        ['イコラ', 'よくやったわ。でも……マインドの最後のログに、こうあったの。「第二ノ環、展開中」。'],
        ['ゴースト', '……まだ終わりじゃない、ってことか。とりあえず今は、タワーに帰って休もう、ガーディアン。'],
        ['', '── 第1章「光の環」完 ──'],
      ],
    },
  };

  /* ---------- Armor series full-set effects (original) ----------
   * Every armor series (DestinyEquipableItemSetDefinition) gets one effect, chosen
   * deterministically from the set hash. Only active with the FULL set equipped. */
  const SET_EFFECTS = [
    { id: 'hp', n: '体力 +100' },
    { id: 'atk', n: '与ダメージ +10%' },
    { id: 'brk', n: 'ブレイク力 +25%' },
    { id: 'super', n: '戦闘開始時スーパー +30%' },
    { id: 'orb', n: '通常攻撃のエレメント +1' },
    { id: 'dr', n: '被ダメージ -10%' },
    { id: 'heal', n: '回復量 +30%' },
    { id: 'crit', n: 'クリティカル率 +10%' },
    { id: 'ability', n: 'アビリティ与ダメージ +20%' },
    { id: 'delay', n: '敵の初回行動 +1ターン' },
  ];
  // A few hand-picked series get a fixed effect (by name), the rest by hash
  const SET_EFFECT_BY_NAME = { '勝利の賛歌': 'hp' };
  function setEffectFor(setHash, setName) {
    const id = SET_EFFECT_BY_NAME[setName];
    if (id) return SET_EFFECTS.find(e => e.id === id);
    return SET_EFFECTS[Number(setHash) % SET_EFFECTS.length];
  }

  /* ---------- Job naming ---------- */
  const ELEMENT_PREFIX = {
    arc: ['雷霆', '迅雷', '紫電'], solar: ['焔', '陽炎', '紅蓮'], void: ['虚空', '深淵', '冥影'],
    stasis: ['氷晶', '凍土', '霜刃'], strand: ['紡糸', '翠縛', '織命'], prism: ['虹光', '極彩', '万華'], kin: ['鋼'],
  };
  const CLASS_NOUN = [
    ['守護騎士', '重装闘士', '城塞兵'],
    ['狩人', '影追い', '双刃士'],
    ['術士', '賢者', '星詠み'],
  ];
  function suggestJobName(cls, element, seed) {
    const p = ELEMENT_PREFIX[element] || ELEMENT_PREFIX.kin;
    const n = CLASS_NOUN[cls] || CLASS_NOUN[0];
    const s = Math.abs(seed | 0);
    return `${p[s % p.length]}の${n[(s >> 3) % n.length]}`;
  }
  // Job name fixed per combination: element prefix (subclass) + noun chosen by the class ability,
  // varied by a hash of the whole combination
  const CLASS_SKILL_NOUN = [
    [/バリケード/, ['城塞騎士', '盾守護者', '防壁兵']],
    [/スラスター/, ['強襲兵', '突撃騎士']],
    [/リフト/, ['結界術士', '陣術士', '泉賢者']],
    [/フェニックス|ダイブ/, ['不死鳥術士', '翔天士']],
    [/回避|ドッジ|ステップ/, ['影踏み', '疾風狩人', '舞刃士']],
  ];
  function hashStr(str) { let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
  function jobNameFor(cls, element, sub, plugs) {
    const [sup, cs] = plugs;
    const seed = hashStr([sub?.n, ...plugs.map(p => p?.n)].join('|'));
    const p = ELEMENT_PREFIX[element] || ELEMENT_PREFIX.kin;
    const row = CLASS_SKILL_NOUN.find(([re]) => re.test(cs?.n || ''));
    const nouns = row ? row[1] : (CLASS_NOUN[cls] || CLASS_NOUN[0]);
    return `${p[seed % p.length]}の${nouns[(seed >> 4) % nouns.length]}`;
  }

  /* ---------- Ghost shells: passive perks (fixed per shell, exotic shells get two) ---------- */
  const GHOST_PERKS = [
    { id: 'hp', n: '体力 +8%' },
    { id: 'orbs', n: '戦闘開始時エレメント +3' },
    { id: 'glim', n: 'グリマー獲得 +25%' },
    { id: 'super', n: 'スーパー獲得量 +15%' },
    { id: 'heal', n: '回復量 +25%' },
    { id: 'brk', n: 'ブレイク力 +10%' },
    { id: 'crit', n: 'クリティカル率 +5%' },
    { id: 'xp', n: 'ジョブ経験値 +25%' },
  ];
  function ghostPerksFor(hash, tt) {
    const n = GHOST_PERKS.length;
    const a = Number(hash) % n;
    if (tt !== 6) return [GHOST_PERKS[a]];
    let b = Math.floor(Number(hash) / 7) % n;
    if (b === a) b = (a + 3) % n;
    return [GHOST_PERKS[a], GHOST_PERKS[b]];
  }

  /* ---------- Guard ring (long press): consumed element → defensive buff ---------- */
  const GUARD = {
    arc:    { n: 'アーク・リフレックス', d: '回避率アップ(2ターン)' },
    solar:  { n: 'ソーラー・アーマー', d: '被ダメージ軽減(2ターン)' },
    void:   { n: 'ボイド・オーバーシールド', d: 'シールドを付与' },
    stasis: { n: 'ステイシス・クリスタル', d: '被ダメージ軽減+敵の行動を遅らせる' },
    strand: { n: 'ストランド・ウィーブ', d: '被ダメージ軽減+継続回復' },
    prism:  { n: 'プリズム・ライト', d: 'HPを回復' },
  };

  /* ---------- Super pose patterns ----------
   * Each super uses one of 7 body poses (3 frames each, art/templates/pose_super.png) and a Light
   * weapon / energy that the game draws in the super's element color: [pattern, prop]. */
  const SUPER_POSE = {
    'カオスの混沌': ['beam', 'beam'], 'ストームトランス': ['beam', 'lightning'],
    'ノヴァボム: 大変動': ['orb', 'orb'], 'ノヴァボム: ボルテックス': ['orb', 'orb'], 'ニードルストーム': ['orb', 'needles'],
    'ゴールデンガン: デッドショット': ['gun', 'gun'], 'ゴールデンガン: マークスマン': ['gun', 'gun'],
    'シャドウショット: メビウスの矢筒': ['gun', 'bow'], 'シャドウショット: 落罠': ['gun', 'bow'],
    'アークポール': ['blade', 'staff'], '亡霊の刃': ['blade', 'blades'], 'ブレードフューリー': ['blade', 'sword'], 'デイブレイク': ['blade', 'sword'],
    'モールバーニング': ['blade', 'hammer'], 'センティネルシールド': ['blade', 'shield'], 'シルクストライク': ['blade', 'staff'], '冬の怒り': ['blade', 'staff'],
    'サンハンマー': ['throw', 'hammer'], 'トワイライトアーセナル': ['throw', 'axe'], '沈黙と悲鳴': ['throw', 'sickle'],
    '嵐の集積': ['throw', 'staff'], '嵐の鋭刃': ['throw', 'dagger'], '刃の雨': ['throw', 'knives'],
    'ハボックフィスト': ['slam', 'fists'], '氷河の揺れ': ['slam', 'fists'], 'サンダークラッシュ': ['slam', 'fists'],
    '輝く泉': ['field', 'well'], 'ドーン・ウォード': ['field', 'bubble'], '炎のさえずり': ['field', 'aura'], 'ノヴァワープ': ['field', 'implode'],
  };
  function superPose(name) {
    if (SUPER_POSE[name]) return SUPER_POSE[name];
    const n = name || '';   // unknown (future) supers: guess from the name
    if (/ガン|ショット|弓/.test(n)) return ['gun', 'gun'];
    if (/ボム|球/.test(n)) return ['orb', 'orb'];
    if (/フィスト|揺れ|クラッシュ/.test(n)) return ['slam', 'fists'];
    if (/刃|ブレード|剣|ポール|杖/.test(n)) return ['blade', 'sword'];
    return ['field', 'aura'];
  }

  /* ---------- Outfit art (one-piece pose frames) ----------
   * Register drawn outfits here. battle/art/outfits/<dir>/ holds idle/shoot/melee_{1,2,3}.png (base sheet),
   * <pattern>_{1,2,3}.png for the 7 super patterns (super sheet) and meta.json — made by tools/import-poses.py
   * from sheets drawn on art/templates/pose_base.png and pose_super.png.
   * Match by class + series name, and exotic name (or '*' for any exotic).
   * Outfits without art use the part rig in their colors. */
  const OUTFIT_ART = [
    // { cl: 1, set: '雷雲', ex: '*', dir: 'hunter_raiun' },
  ];
  function outfitArt(o, set, ex) {
    const a = OUTFIT_ART.find(x => x.cl === o.cl && x.set === set?.n && (x.ex === '*' || x.ex === ex?.n));
    if (!a) return null;
    const base = `art/outfits/${a.dir}/`;
    const frames = pose => [1, 2, 3].map(i => `${base}${pose}_${i}.png`);
    return { base, meta: base + 'meta.json', preview: base + 'idle_1.png', idle: frames('idle'), shoot: frames('shoot'), melee: frames('melee'), top: frames('top'), superFrames: frames };
  }

  root.Content = {
    DT_ELEMENT, ELEMENT_NAME, CLASS_NAME, ENEMIES, BOSSES, enemyDef, STAGES, PROLOGUE, STORY,
    SET_EFFECTS, setEffectFor, suggestJobName, jobNameFor, GHOST_PERKS, ghostPerksFor, GUARD, OUTFIT_ART, outfitArt, SUPER_POSE, superPose,
  };
})(window);
