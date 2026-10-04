/* D2 MOBIUS — pixel sprites
 * - Guardians: small front sprites (menus) + back-view battle sprites (camera behind the player)
 * - Enemies: 32x32 front-view pixel maps per unit, faction palettes (referenced from Destiny art)
 * - Weapons: per weapon type, drawn in the guardian's hand
 * - API images (stage backgrounds, hologram enemies, armor/ghost icon colors) processed at runtime
 * - drawLive(): Live2D-like idle deformation (breathing / sway / cloth hem) by row slicing
 */
(function (root) {
  'use strict';

  const pad = (rows, w, h) => {
    const out = rows.map(r => (r + '.'.repeat(w)).slice(0, w));
    while (out.length < h) out.push('.'.repeat(w));
    return out.slice(0, h);
  };

  // ---------------- Guardians: built from shapes by pixelart.js (64px, 3/4 view facing right) ----------------
  const GHOST = ['....KK....', '...KAAK...', '..KAAAAK..', '.KAAMMAAK.', 'KAAMVVMAAK', '.KAAMMAAK.', '..KAAAAK..', '...KAAK...', '....KK....'];

  // ---------------- Enemies (front view, 32x32) ----------------
  // K outline, B body, b shade, H highlight, D dark/inner, E eye glow, W weapon/element glow,
  // S secondary armor (plates), s shade, C cloth, c cloth shade, G gun metal
  const ENEMY = {
    thrall: pad([
      '................................',
      '.............KKKKK..............',
      '...........KKHBBBHKK............',
      '..........KHBBBBBBBHK...........',
      '..........KBBDDDDDBBK...........',
      '..........KBDEDDDEDBK...........',
      '...........KBBDDDBBK............',
      '............KbBBBbK.............',
      '..........KKKBBBBBKKK...........',
      '........KKBBBBHBBBBBBKK.........',
      '.......KBBBKBBBBBBBKBBBK........',
      '......KBBK.KBbBBBbBK.KBBK.......',
      '.....KBBK..KBbBBBbBK..KBBK......',
      '.....KBK...KBBbbbBBK...KBK......',
      '....KBK.....KBBBBBK.....KBK.....',
      '....KbK.....KBbBbBK.....KbK.....',
      '...KbK......KBBBBBK......KbK....',
      '...KHK.......KBBBK.......KHK....',
      '..KH.HK.....KBBKBBK.....KH.HK...',
      '..H...H....KBBK.KBBK....H...H...',
      '..........KBBK...KBBK...........',
      '..........KBK.....KBK...........',
      '.........KBbK.....KbBK..........',
      '.........KbK.......KbK..........',
      '........KbK.........KbK.........',
      '........KBK.........KBK.........',
      '.......KBBK.........KBBK........',
      '.......KDDK.........KDDK........',
      '......KDDDK.........KDDDK.......',
      '......KKKKK.........KKKKK.......',
    ], 32, 32),
    acolyte: pad([
      '................................',
      '..............KKKK..............',
      '............KKHHHHKK............',
      '...........KHBBBBBBHK...........',
      '..........KHBBBBBBBBHK..........',
      '..........KBBBKEEKBBBK..........',
      '..........KBBBKEEKBBBK..........',
      '...........KBBBBBBBBK...........',
      '............KKbBBbKK............',
      '.........KKKBBBBBBBBKKK.........',
      '.......KKHBBBBBHHBBBBBHKK.......',
      '......KHBBBKBBBBBBBBKBBBHK......',
      '......KBBBK.KBBBBBBK.KBBBK......',
      '.....KBBBK..KBbBBbBK..KBBBK.....',
      '.....KBBK...KBBbbBBK...KBBK.....',
      '....KGGGGK..KBBBBBBK...KBbK.....',
      '....KGWWGK...KBBBBK....KBK......',
      '....KGGGGK..KBBKKBBK...KHK......',
      '.....KKKK..KBBK..KBBK..KHK......',
      '..........KBBK....KBBK..........',
      '..........KBbK....KbBK..........',
      '.........KBBK......KBBK.........',
      '.........KBbK......KbBK.........',
      '.........KbK........KbK.........',
      '........KBBK........KBBK........',
      '........KDDK........KDDK........',
      '.......KDDDK........KDDDK.......',
      '.......KKKKK........KKKKK.......',
    ], 32, 32),
    knight: pad([
      '................................',
      '.........K....KKKK....K.........',
      '.........KK.KKHHHHKK.KK.........',
      '..........KKHBBBBBBHKK..........',
      '.........KHBBBBBBBBBBHK.........',
      '.........KBBBKEEEEKBBBK.........',
      '.........KBBBBKEEKBBBBK.........',
      '..........KBBBBBBBBBBK..........',
      '.......KKKKKbBBBBBBbKKKKK.......',
      '.....KKHHBBBKbbbbbbKBBBHHKK.....',
      '....KHBBBBBBBBBBBBBBBBBBBBHK....',
      '...KHBBBKBBBBBHHHHBBBBBKBBBHK...',
      '...KBBBK.KBBBBBBBBBBBBK.KBBBK...',
      '..KBBBK..KBBBbBBBBbBBBK..KBBBK..',
      '..KBBK...KBBBBbbbbBBBBK...KBBK..',
      '.KGGGGGGK.KBBBBBBBBBBK...KBbbK..',
      '.KGWWWWGGK.KBBBBBBBBK....KBbK...',
      '.KGGGGGGK..KDDDDDDDDK....KHHK...',
      '..KKKKKK..KBBBBKKBBBBK...KKK....',
      '..........KBBBK..KBBBK..........',
      '.........KBBBbK..KbBBBK.........',
      '.........KBBbK....KbBBK.........',
      '.........KBBBK....KBBBK.........',
      '........KBBBbK....KbBBBK........',
      '........KBBbK......KbBBK........',
      '........KBBBK......KBBBK........',
      '.......KDDDDK......KDDDDK.......',
      '.......KDDDDK......KDDDDK.......',
      '.......KKKKKK......KKKKKK.......',
    ], 32, 32),
    wizard: pad([
      '..........K.K..KK..K.K..........',
      '..........KHK.KHHK.KHK..........',
      '...........KHKHBBHKHK...........',
      '...........KHBBBBBBHK...........',
      '............KBBBBBBK............',
      '...........KBBEBBEBBK...........',
      '...........KBBBDDBBBK...........',
      '............KBBBBBBK............',
      '.....KK......KbBBbK......KK.....',
      '....KWWK...KKBBBBBBKK...KWWK....',
      '....KWWWKKKBBBBHHBBBBKKKWWWK....',
      '.....KKKBBBBBBBBBBBBBBBBKKK.....',
      '........KKBBBBBBBBBBBBKK........',
      '..........KBBBDDDDBBBK..........',
      '..........KBBDDDDDDBBK..........',
      '.........KBBBDDDDDDBBBK.........',
      '.........KBBDDDDDDDDBBK.........',
      '........KBBBDDDDDDDDBBBK........',
      '........KBBDDDDDDDDDDBBK........',
      '.......KBBBDDDDDDDDDDBBBK.......',
      '.......KbBBDDDDDDDDDDBBbK.......',
      '......KbbBBBDDDDDDDDBBBbbK......',
      '......KbbBbBBDDDDDDBBbBbbK......',
      '.....KbbK.KbBBDDDDBBbK.KbbK.....',
      '.....KbK..KbbBBDDBBbbK..KbK.....',
      '......K...KbK.KbbK.KbK...K......',
      '...........K..KbbK..K...........',
      '...............KK...............',
    ], 32, 32),
    dreg: pad([
      '................................',
      '...........K........K...........',
      '...........KK......KK...........',
      '............KKKKKKKK............',
      '...........KSSSSSSSSK...........',
      '..........KSSSsSSsSSSK..........',
      '..........KSEEsSSsEESK..........',
      '..........KSSDDDDDDSSK..........',
      '...........KSDKDDKDSK...........',
      '............KSSDDSSK............',
      '..........KKKCCCCCCKKK..........',
      '........KKSSCCCCCCCCSSKK........',
      '.......KSSKKCCSSSSCCKKSSK.......',
      '......KSSK.KCCSSSSCCK.KSSK......',
      '.....KWSK..KCCSSSSCCK..KSSK.....',
      '....KWWK...KCCCCCCCCK...KSK.....',
      '...KWWK....KSKCCCCKSK...KSSK....',
      '..KWWK....KSSK.KK.KSSK...KK.....',
      '..KKK.....KSK......KSK..........',
      '..........KCCCKKKKCCCK..........',
      '..........KCCK....KCCK..........',
      '.........KSSK......KSSK.........',
      '.........KSK........KSK.........',
      '........KSSK........KSSK........',
      '........KsK..........KsK........',
      '.......KsK............KsK.......',
      '.......KSK............KSK.......',
      '......KSSK............KSSK......',
      '......KDDK............KDDK......',
      '......KKKK............KKKK......',
    ], 32, 32),
    vandal: pad([
      '...........K........K...........',
      '...........KK......KK...........',
      '............KKKKKKKK............',
      '...........KSSSSSSSSK...........',
      '..........KSSSsSSsSSSK..........',
      '..........KSEEsSSsEESK..........',
      '..........KSSDDDDDDSSK..........',
      '...........KSDKDDKDSK...........',
      '...........KKSSDDSSKK...........',
      '.........KKCCCCCCCCCCKK.........',
      '.......KKCCCSSSSSSSSCCCKK.......',
      '......KCCCKSSSSSSSSSSKCCCK......',
      '.....KCCCK.KSSsSSsSSK.KCCCK.....',
      '.....KCCK..KSSSSSSSSK..KSSK.....',
      '....KCCCK..KCSSSSSSCK...KSK.....',
      '....KCcK...KCCSSSSCCK..KSSK.....',
      '...KCCcK...KCCCCCCCCK..KGGGGGGGK',
      '...KCcK....KSKCCCCKSK..KGWWWWWWK',
      '...KCcK...KSSK.KK.KSSK.KGGGGGGGK',
      '...KCK....KSK......KSK..KK......',
      '...KCK....KCCCKKKKCCCK..........',
      '...KCK....KCCK....KCCK..........',
      '...KK....KSSK......KSSK.........',
      '.........KSK........KSK.........',
      '........KSSK........KSSK........',
      '........KsK..........KsK........',
      '.......KsK............KsK.......',
      '.......KSK............KSK.......',
      '......KSSK............KSSK......',
      '......KDDK............KDDK......',
      '......KKKK............KKKK......',
    ], 32, 32),
    captain: pad([
      '.........KK..........KK.........',
      '.........KSK........KSK.........',
      '..........KSK.KKKK.KSK..........',
      '...........KSKSSSSKSK...........',
      '..........KSSSSSSSSSSK..........',
      '.........KSSSsSSSSsSSSK.........',
      '.........KSEEsSSSSsEESK.........',
      '.........KSSDDDDDDDDSSK.........',
      '..........KSDKDDDDKDSK..........',
      '.....K....KKSSDDDDSSKK..........',
      '....KWK.KKCCCCCCCCCCCCKK........',
      '....KWKKCCSSSSSSSSSSSSCCKK......',
      '....KWKCCSSSSSSSSSSSSSSSCCK.....',
      '....KWKCKSSSSsSSSSsSSSSKCCK.....',
      '....KWKSK.KSSSSSSSSSSSK.KCCK....',
      '....KWSSK.KSSSSSSSSSSSK.KSSCK...',
      '....KKSK..KCCSSSSSSSSCK..KSSK...',
      '.....KK...KCCCSSSSSSCCK...KSK...',
      '..........KCCCCCCCCCCCK...KSSK..',
      '.........KSSKCCCCCCCKSSK..KCCK..',
      '.........KSK.KKKKKKK.KSK..KCCK..',
      '.........KCCCK.....KCCCK..KCK...',
      '.........KCCK.......KCCK..KCK...',
      '........KSSSK.......KSSSK..K....',
      '........KSSK.........KSSK.......',
      '........KSsK.........KsSK.......',
      '.......KSsK...........KsSK......',
      '.......KSSK...........KSSK......',
      '......KSSSK...........KSSSK.....',
      '......KDDDK...........KDDDK.....',
      '......KKKKK...........KKKKK.....',
    ], 32, 32),
    servitor: pad([
      '................................',
      '...............KK...............',
      '.........K....KHHK....K.........',
      '.........KK.KKBBBBKK.KK.........',
      '..........KKBBBBBBBBKK..........',
      '.........KBBHHBBBBBBBBK.........',
      '........KBBHBBBBBBBBBBBK........',
      '.......KBBHBBBKKKKKKBBBBK.......',
      '......KBBBBBKKDDDDDDKKBBBK......',
      '......KBBBBKDDEEEEEEDDKBBK......',
      '.....KBBBBKDDEDDDDDDEDDKBBK.....',
      '...KKKBBBBKDEDDWWWWDDEDKBBKKK...',
      '..KBBKBBBKDDEDDWWWWDDEDDKBKBBK..',
      '...KKKBBBKDDEDDWWWWDDEDDKBKKK...',
      '.....KBBBKDDEDDWWWWDDEDDKBK.....',
      '.....KBBBBKDDEDDDDDDEDDKBBK.....',
      '......KBBBBKDDEEEEEEDDKBBK......',
      '......KbBBBBKKDDDDDDKKBBbK......',
      '.......KbBBBBBKKKKKKBBBbK.......',
      '........KbbBBBBBBBBBBbbK........',
      '.........KbbbBBBBBBbbbK.........',
      '..........KKbbbbbbbbKK..........',
      '.........KK.KKbbbbKK.KK.........',
      '.........K....KbbK....K.........',
      '...............KK...............',
    ], 32, 32),
    goblin: pad([
      '...........KKKKKKKKKK...........',
      '..........KBHBHBHBHBBK..........',
      '..........KBBBBBBBBBBK..........',
      '...........KKBBBBBBKK...........',
      '.............KBEEBK.............',
      '.............KBEEBK.............',
      '.............KbBBbK.............',
      '..............KBBK..............',
      '..........KKKKBBBBKKKK..........',
      '........KKBBBBHHHHBBBBKK........',
      '.......KBBBKBBHHHHBBKBBBK.......',
      '......KBBK.KBBBHHBBBK.KBBK......',
      '......KBK..KDBBBBBBDK..KBK......',
      '.....KBBK..KDDBBBBDDK..KBBK.....',
      '.....KBK....KDDDDDDK....KBK.....',
      '....KBBK....KBBBBBBK...KGGGGK...',
      '....KHHK.....KDDDDK....KGWWGK...',
      '....KHK.....KBBKKBBK...KGGK.....',
      '............KBK..KBK............',
      '...........KBBK..KBBK...........',
      '...........KBK....KBK...........',
      '...........KDK....KDK...........',
      '..........KDDK....KDDK..........',
      '..........KBK......KBK..........',
      '.........KBBK......KBBK.........',
      '.........KBK........KBK.........',
      '........KBBK........KBBK........',
      '........KDDK........KDDK........',
      '.......KDDDK........KDDDK.......',
      '.......KKKKK........KKKKK.......',
    ], 32, 32),
    harpy: pad([
      '................................',
      '................................',
      '....KK....................KK....',
      '....KBKK....KKKKKKKK....KKBK....',
      '.....KBBKKKKBBBBBBBBKKKKBBK.....',
      '......KBBBBBBHHBBBBBBBBBBK......',
      '.......KKBBBHBBBBBBBBBBKK.......',
      '.........KBBBBKKKKBBBBK.........',
      '.........KBBBKDEEDKBBBK.........',
      '.........KBBBKEWWEKBBBK.........',
      '.........KBBBKDEEDKBBBK.........',
      '.........KbBBBKKKKBBBbK.........',
      '..........KbbBBBBBBbbK..........',
      '...........KKbbbbbbKK...........',
      '..........KBK.KKKK.KBK..........',
      '.........KBK..KBBK..KBK.........',
      '.........KBK..KBBK..KBK.........',
      '........KBK...KBBK...KBK........',
      '........KDK....KK....KDK........',
      '.......KDK............KDK.......',
      '.......KK..............KK.......',
    ], 32, 32),
    minotaur: pad([
      '..........KKKKKKKKKKKK..........',
      '.........KBHBHBHBHBHBBK.........',
      '.........KBBBBBBBBBBBBK.........',
      '..........KKBBBBBBBBKK..........',
      '...........KBBBEEBBBK...........',
      '...........KBBBEEBBBK...........',
      '...........KbBBBBBBbK...........',
      '.....KKKK...KKBBBBKK...KKKK.....',
      '....KBHHBKKKKDDDDDDKKKKBHHBK....',
      '...KBHBBBBBDDDDHHDDDDBBBBBHBK...',
      '...KBBBBKDDDDHHHHHHDDDDKBBBBK...',
      '...KBBBK.KDDDDHHHHDDDDK.KBBBK...',
      '...KBBK..KDDDDDHHDDDDDK..KBBK...',
      '..KBBBK..KBDDDDDDDDDDBK..KBBBK..',
      '..KDDDK...KBBDDDDDDBBK...KDDDK..',
      '..KDDK....KBBBBBBBBBBK....KDDK..',
      '..KBBK....KDDDDDDDDDDK....KBBK..',
      '..KWWK...KBBBBKKKKBBBBK...KWWK..',
      '..KWWK...KBBBK....KBBBK...KWWK..',
      '...KK....KDDDK....KDDDK....KK...',
      '.........KBBBK....KBBBK.........',
      '........KBBDK......KDBBK........',
      '........KBBDK......KDBBK........',
      '........KDDDK......KDDDK........',
      '.......KBBBBK......KBBBBK.......',
      '.......KBBBK........KBBBK.......',
      '......KDDDDK........KDDDDK......',
      '......KKKKKK........KKKKKK......',
    ], 32, 32),
    hydra: pad([
      '..............KKKK..............',
      '.............KBHHBK.............',
      '............KBBBBBBK............',
      '............KBBEEBBK............',
      '............KBBEEBBK............',
      '..KKK.......KbBBBBbK.......KKK..',
      '.KBHBK.....KKKBBBBKKK.....KBHBK.',
      '.KBBBBK...KBBBDDDDBBBK...KBBBBK.',
      '.KBBBBBK.KBBDDHHHHDDBBK.KBBBBBK.',
      '.KBBBBBK.KBDDHHWWHHDDBK.KBBBBBK.',
      '.KBBBBBK.KBDDHWWWWHDDBK.KBBBBBK.',
      '.KBBBBBK.KBDDHHWWHHDDBK.KBBBBBK.',
      '.KbBBBBK.KBBDDHHHHDDBBK.KBBBBbK.',
      '.KbbBBK...KBBBDDDDBBBK...KBBbbK.',
      '..KbbK.....KKKBBBBKKK.....KbbK..',
      '...KK.......KBBDDBBK.......KK...',
      '............KBDDDDBK............',
      '...........KBBBDDBBBK...........',
      '..........KBBK.KK.KBBK..........',
      '..........KBK......KBK..........',
      '.........KBK........KBK.........',
      '.........KK..........KK.........',
    ], 32, 32),
    legionary: pad([
      '................................',
      '............KKKKKKKK............',
      '..........KKBBBBBBBBKK..........',
      '.........KBBHHBBBBBBBBK.........',
      '.........KBHBBBBBBBBBBK.........',
      '.........KBBBBBBBBBBBBK.........',
      '.........KBKEEEEEEEEKBK.........',
      '.........KBBKKKKKKKKBBK.........',
      '..........KBBBBBBBBBBK..........',
      '.....KKKKKKKBbbbbbbBKKKKKKK.....',
      '....KBHHHHBKBBBBBBBBKBHHHHBK....',
      '...KBHBBBBBKBBBBBBBBKBBBBBHBK...',
      '...KBBBBBBBKBBBHHBBBKBBBBBBBK...',
      '...KBBBBBBKBBBBHHBBBBKBBBBBBK...',
      '...KbBBBBK.KBBBBBBBBK.KBBBBbK...',
      '...KbbBBK..KDDDDDDDDK..KBBbbK...',
      '...KGGGGGGGGGGK.DDDK...KBBBK....',
      '...KGWWGGGGGGGGK.KK....KBBBK....',
      '...KGGGGGGGGGGK........KBBK.....',
      '....KKKKKKKKKK..........KK......',
      '..........KBBBBKKBBBBK..........',
      '.........KBBBBBKKBBBBBK.........',
      '.........KBBBBK..KBBBBK.........',
      '.........KbBBBK..KBBBbK.........',
      '.........KbbBK....KBbbK.........',
      '.........KBBBK....KBBBK.........',
      '........KBBBBK....KBBBBK........',
      '........KDDDDK....KDDDDK........',
      '........KKKKKK....KKKKKK........',
    ], 32, 32),
    phalanx: pad([
      '................................',
      '............KKKKKKKK............',
      '..........KKBBBBBBBBKK..........',
      '.........KBBHHBBBBBBBBK.........',
      '.........KBHBBBBBBBBBBK.........',
      '.........KBBBBBBBBBBBBK.........',
      '.........KBKEEEEEEEEKBK.........',
      '.........KBBKKKKKKKKBBK.........',
      '.KKKKKKKK.KBBBBBBBBBBK..........',
      '.KSSSSSSKKKKBbbbbbbBKKKKKKK.....',
      '.KSHSSSSSKBKBBBBBBBBKBHHHHBK....',
      '.KSHSSSSSKBKBBBBBBBBKBBBBBHBK...',
      '.KSSSWWSSKBKBBBHHBBBKBBBBBBBK...',
      '.KSSWWWWSKBBBBBHHBBBBKBBBBBBK...',
      '.KSSSWWSSKK.KBBBBBBBBK.KBBBBbK..',
      '.KSSSSSSSK..KDDDDDDDDK..KBBbbK..',
      '.KsSSSSSsK...KDDDDDDK...KBBBK...',
      '.KssSSSssK...KDDDDDDK...KBBBK...',
      '..KsssssK...............KBBK....',
      '...KKKKK.................KK.....',
      '..........KBBBBKKBBBBK..........',
      '.........KBBBBBKKBBBBBK.........',
      '.........KBBBBK..KBBBBK.........',
      '.........KbBBBK..KBBBbK.........',
      '.........KbbBK....KBbbK.........',
      '.........KBBBK....KBBBK.........',
      '........KBBBBK....KBBBBK........',
      '........KDDDDK....KDDDDK........',
      '........KKKKKK....KKKKKK........',
    ], 32, 32),
    psion: pad([
      '................................',
      '................................',
      '................................',
      '................................',
      '..............KKKK..............',
      '............KKBBBBKK............',
      '...........KBBBBBBBBK...........',
      '...........KBBEEEEBBK...........',
      '...........KBEEWWEEBK...........',
      '...........KBBEEEEBBK...........',
      '............KBBBBBBK............',
      '.............KbbbbK.............',
      '...........KKKBBBBKKK...........',
      '..........KBBBBHHBBBBK..........',
      '.........KBBKBBBBBBKBBK.........',
      '.........KBK.KBBBBK.KBK.........',
      '........KBBK.KBbbBK.KGGGGK......',
      '........KBK..KDDDDK..KGWWK......',
      '........KHK..KBBBBK..KGGK.......',
      '.............KBKKBK.............',
      '............KBBK.KBBK...........',
      '............KBK...KBK...........',
      '............KBK...KBK...........',
      '...........KBBK...KBBK..........',
      '...........KbK.....KbK..........',
      '...........KBK.....KBK..........',
      '..........KDDK.....KDDK.........',
      '..........KKKK.....KKKK.........',
    ], 32, 32),
    centurion: pad([
      '.......KK..............KK.......',
      '.......KHK............KHK.......',
      '........KHK..KKKKKK..KHK........',
      '.........KHKKBBBBBBKKHK.........',
      '..........KBBHHBBBBBBK..........',
      '.........KBBHBBBBBBBBBK.........',
      '.........KBBBBBBBBBBBBK.........',
      '.........KBKEEEEEEEEKBK.........',
      '.........KBBKKKKKKKKBBK.........',
      '....KKKKKKKBBBBBBBBBBKKKKKKK....',
      '...KBHHHHBBKBbbbbbbBKBBHHHHBK...',
      '..KBHBBBBBBKBBBBBBBBKBBBBBBHBK..',
      '..KBBBBBBBBKBBBHHBBBKBBBBBBBBK..',
      '..KBBBBBBBKBBBBHHBBBBKBBBBBBBK..',
      '..KbBBBBBK.KBBBBBBBBK.KBBBBBbK..',
      '..KbbBBBK..KDDDDDDDDK..KBBBbbK..',
      '..KGGGGGGGGGGGK.DDDK...KBBBBK...',
      '..KGWWWGGGGGGGGK.KK....KBBBBK...',
      '..KGGGGGGGGGGGK........KBBBK....',
      '...KKKKKKKKKKK..........KKK.....',
      '..........KBBBBKKBBBBK..........',
      '.........KBBBBBKKBBBBBK.........',
      '.........KBBBBK..KBBBBK.........',
      '.........KbBBBK..KBBBbK.........',
      '.........KbbBK....KBbbK.........',
      '........KBBBBK....KBBBBK........',
      '........KBBBBK....KBBBBK........',
      '.......KDDDDDK....KDDDDDK.......',
      '.......KKKKKKK....KKKKKKK.......',
    ], 32, 32),
  };
  // Floating units bob up and down
  const FLOATING = new Set(['wizard', 'servitor', 'harpy', 'hydra']);

  // ---------------- Weapons (pointing right; [map, gripX, gripY]) ----------------
  const WEAPON = {
    rifle: [['.KKKKKKKKK......', 'KgggggggggKKKKKK', 'KGGGGGGGGGGGGGGK', 'KGGWWGGGGKKKKKKK', '.KGGKGGK........', '..KK.KK.........'], 3, 4],
    hand: [['.KKKKKKK.', 'KgggggggK', 'KGGWWGGGK', '.KGGKKKK.', '.KGK.....', '.KK......'], 2, 4],
    shotgun: [['KKKKKKKKKKKKKKK', 'KgggggggggggggK', 'KGGGWWGGGGGGGGK', '.KGGKKKKKKKKKK.', '.KKK...........'], 2, 3],
    sniper: [['..KKKK..............', 'KKggggKKKKKKKKKKKKKK', 'KGGGGGGGGGGGGGGGGGGK', 'KGGWWGGKKKKKKKKKKKKK', '.KGK................'], 2, 3],
    smg: [['.KKKKKKKK.', 'KggggggggK', 'KGGWWGGGGK', '.KGKKGKKK.', '.KGK.KGK..', '.KK..KK...'], 2, 4],
    rocket: [['..KKKKKKKKKKKK..', '.KggggggggggggK.', 'KGGGGGGGGGGGGGGK', 'KGGWWWGGGGGGGGGK', '.KGGGGGGGGGGGGK.', '..KGKKKKKKKKKK..', '..KK............'], 3, 5],
    fusion: [['.KKKKKKKKKKK....', 'KgggggggggggKKKK', 'KGWWGWWGWWGGGGGK', 'KGGGGGGGGKKKKKKK', '.KGGKGGK........', '..KK.KK.........'], 3, 4],
    sword: [['.............K..', 'KKKKKHHHHHHHHHK.', 'KGWGKWWWWWWWWWWK', 'KKKKKHHHHHHHHHK.'], 2, 2],
    bow: [['KK..........KK', '.KgK......KgK.', '..KgKKKKKKgK..', '...KGGWWGGK...', '....KKKKKK....'], 7, 3],
    glaive: [['..................K.', 'KKKKKKKKKKKKKKKKHHK.', 'KGGGGGGGWGGGGGGWWWHK', 'KKKKKKKKKKKKKKKKHHK.'], 4, 2],
  };
  // itemSubType → weapon map
  const WEAPON_OF_SUBTYPE = { 6: 'rifle', 7: 'shotgun', 8: 'rifle', 9: 'hand', 10: 'rocket', 11: 'fusion', 12: 'sniper', 13: 'rifle', 14: 'rifle', 17: 'hand', 18: 'sword', 22: 'fusion', 23: 'rocket', 24: 'smg', 25: 'fusion', 31: 'bow', 33: 'glaive' };

  // ---------------- Palettes ----------------
  // Guardian base colors (A armor, B accent, M undersuit, D dark, C cloth, L leather). Ramps are generated.
  const GUARDIAN_PALETTES = {
    titan:   { W: '#e6e8ee', R: '#c8323c', N: '#3c4456', U: '#2a2f3c', G: '#d8a830', B: '#8a94a8', C: '#b02c34', L: '#6a4a32' },
    hunter:  { W: '#aeb6c4', R: '#c8323c', N: '#232a3e', U: '#1b1f2c', G: '#c9ced8', B: '#3aa0e8', C: '#2b3550', L: '#6a5038' },
    warlock: { W: '#f0b42a', R: '#c8323c', N: '#1d1d29', U: '#2a2a38', G: '#ffe08a', B: '#2f78e0', C: '#232236', L: '#7a5a30' },
    ghost:   { A: '#dfe3ea', M: '#7e8796' },
  };
  const OUTLINE = '#141626';
  const FACTION_PALETTES = {
    hive:   { B: '#b9b39b', b: '#7c7764', H: '#e6e1cc', D: '#2f2b22', E: '#7dff6a', W: '#5dd94a', S: '#b9b39b', s: '#7c7764', C: '#3a2f2a', c: '#241d19', G: '#3b3a2c' },
    fallen: { B: '#6a6f8a', b: '#454a62', H: '#a8acc6', D: '#22232e', E: '#79c8ff', W: '#79bbff', S: '#d8d4c8', s: '#9a968a', C: '#b39a6a', c: '#7a6a48', G: '#2a2a2a' },
    vex:    { B: '#c09050', b: '#7a5a30', H: '#efe2c0', D: '#2a2a3a', E: '#ff3b3b', W: '#ff8a6a', S: '#c09050', s: '#7a5a30', C: '#2a2a3a', c: '#1a1a24', G: '#3a2c18' },
    cabal:  { B: '#8a2a24', b: '#5a1a16', H: '#c06048', D: '#2a1c1a', E: '#ffb347', W: '#ff9a3c', S: '#b08a3a', s: '#7a5e26', C: '#3a2a20', c: '#24180f', G: '#3a3030' },
    taken:  { K: '#e8f4ff', B: '#1a1a24', b: '#101016', H: '#2e3650', D: '#05050a', E: '#ffffff', W: '#cfe8ff', S: '#1c1c28', s: '#111118', C: '#181822', c: '#0e0e14', G: '#14141c' },
    scorn:  { B: '#2f4a48', b: '#1e3130', H: '#5f8a85', D: '#0f1a1a', E: '#6bffe0', W: '#6bd3c4', S: '#3a5a58', s: '#243a38', C: '#203030', c: '#142020', G: '#1a2626' },
  };
  const ELEMENT_COLORS = {
    kin: '#d4d4d4', arc: '#79bbff', solar: '#ff8a1e', void: '#b084eb',
    stasis: '#4d88ff', strand: '#5fd970', light: '#f3ecd0', prism: '#ff6bd5',
  };

  // ---------------- color helpers ----------------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, v + amt));
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  const lighten = shade;
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const f = t => {
      t = (t + 1) % 1;
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const hx = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return '#' + hx(f(h + 1 / 3)) + hx(f(h)) + hx(f(h - 1 / 3));
  }
  // 5-step ramp with hue shifting: shadows cooler & more saturated, highlights warmer
  const rampCache = new Map();
  function ramp(base) {
    if (rampCache.has(base)) return rampCache.get(base);
    const [h, s, l] = hexToHsl(base);
    const toward = (target, k) => h + ((((target - h) % 360) + 540) % 360 - 180) * k;
    const r = [
      hslToHex(toward(240, 0.18), s * 1.05 + 0.05, l * 0.42),
      hslToHex(toward(240, 0.09), s * 1.02 + 0.03, l * 0.68),
      base,
      hslToHex(toward(55, 0.08), s * 0.95, l + (1 - l) * 0.28),
      hslToHex(toward(55, 0.14), s * 0.85, l + (1 - l) * 0.55),
    ];
    rampCache.set(base, r);
    return r;
  }

  /* ---------------- shaded pixel-art renderer ----------------
   * rows: pixel map. mats: char → { c: base color, g: group (for edge detection), glow: bool, tone: offset }.
   * - auto outline: transparent pixels touching the figure become the outline color
   * - "K" pixels inside the figure are softened to the darkest tone of a neighbor (selective outline)
   * - bevel lighting from the top-left: edge facing up/left +1 tone, facing down/right -1 tone
   * The result is padded by 1px on each side. */
  function renderShaded(rows, mats, key, outline = OUTLINE) {
    if (key && cache.has(key)) return cache.get(key);
    const img = PixelArt.shadeRows(rows, mats, outline);
    const c = document.createElement('canvas');
    c.width = img.w; c.height = img.h;
    c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
    if (key) cache.set(key, c);
    return c;
  }
  const cache = new Map();

  const CLASS_KEYS = ['titan', 'hunter', 'warlock'];
  function imgToCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.w; c.height = img.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
    return c;
  }
  // Menu / cut-in sprite: all parts composited at rest. slotPal re-skins armor slots (future set looks).
  function guardianSprite(cls, element, slotPal) {
    const key = PixelArt.CLASS_KEYS[cls] || 'titan';
    const el = ELEMENT_COLORS[element] || ELEMENT_COLORS.light;
    const ck = `gf:${key}:${element}:${JSON.stringify(slotPal || {})}`;
    if (!cache.has(ck)) cache.set(ck, imgToCanvas(PixelArt.composeGuardian(key, el, slotPal)));
    return cache.get(ck);
  }
  /* Battle rig: one shaded layer per part (own outline) + joints, for animation.
   * Layers are 66px (1px pad): draw at (-1, -1) so part coordinates match the shapes. */
  function guardianRig(cls, element, slotPal) {
    const key = PixelArt.CLASS_KEYS[cls] || 'titan';
    const el = ELEMENT_COLORS[element] || ELEMENT_COLORS.light;
    const ck = `rig:${key}:${element}:${JSON.stringify(slotPal || {})}`;
    if (cache.has(ck)) return cache.get(ck);
    const G = PixelArt.GUARDIANS[key];
    const rig = {
      key, hand: G.hand, hip: G.hip, w: 66, h: 66,
      layers: G.parts.map(p => ({ ...p, canvas: imgToCanvas(PixelArt.shadePart(key, p.id, el, slotPal)) })),
      sprite: guardianSprite(cls, element, slotPal),
    };
    cache.set(ck, rig);
    return rig;
  }
  /* Pose = { dx, dy, lean, breath, na, nadx, fa, nl, fl, hd } (sprite px / radians).
   * Draws the rig with its feet origin at (ox, oy) top-left of the 64px frame, scaled by `scale`.
   * `weapon` { sprite, gx, gy, scale } is held in the near hand. Returns the hand position in canvas space. */
  function drawRig(g, rig, ox, oy, scale, pose, weapon) {
    const [hx, hy] = rig.hip;
    const partPose = {
      nearArm: { r: pose.na || 0, dx: pose.nadx || 0 }, farArm: { r: pose.fa || 0 },
      nearLeg: { r: pose.nl || 0 }, farLeg: { r: pose.fl || 0 }, head: { r: pose.hd || 0 },
    };
    let handPt = null;
    for (const L of rig.layers) {
      let M = new DOMMatrix().translate(ox, oy).scale(scale).translate(pose.dx || 0, pose.dy || 0);
      if (L.body) M = M.translate(hx, hy).rotate((pose.lean || 0) * 57.2958).translate(-hx, -hy).translate(0, pose.breath || 0);
      const pp = partPose[L.follow || L.id] || {};
      const [px, py] = L.pivot;
      M = M.translate(pp.dx || 0, 0).translate(px, py).rotate((pp.r || 0) * 57.2958).translate(-px, -py);
      g.save();
      g.transform(M.a, M.b, M.c, M.d, M.e, M.f);
      g.drawImage(L.canvas, -1, -1);
      if (L.id === 'nearArm') {
        const [ax, ay] = rig.hand;
        handPt = M.transformPoint(new DOMPoint(ax, ay));
        if (weapon) {
          const ws = weapon.scale || 0.5;
          g.translate(ax, ay);
          g.drawImage(weapon.sprite, -weapon.gx * ws, -weapon.gy * ws, weapon.sprite.width * ws, weapon.sprite.height * ws);
          if (weapon.flash) {
            g.globalAlpha = weapon.flash; g.fillStyle = '#fff6c0';
            g.beginPath(); g.arc((weapon.sprite.width - weapon.gx) * ws + 1.5, 0, 2 + weapon.flash * 2, 0, Math.PI * 2); g.fill();
          }
        }
      }
      g.restore();
    }
    return handPt;
  }
  function ghostSprite(element, override) {
    const el = ELEMENT_COLORS[element] || '#79bbff';
    const p = { ...GUARDIAN_PALETTES.ghost, ...(override || {}) };
    return renderShaded(GHOST, { A: { c: p.A }, M: { c: p.M }, V: { c: el, glow: true } }, `ghost:${element}:${JSON.stringify(override || {})}`);
  }
  /* ---------------- Illustrated (non-pixel) rendering ----------------
   * Draws a shape list (pixelart.js format, 48-unit grid) as a smooth, high-resolution illustration:
   * per-shape volume gradients lit from the top-left, a rim light, soft contact shadows cast onto the
   * shapes behind, dark line art and bloom on glowing materials. The result is shown downscaled. */
  const ILLUS_SCALE = 6;
  const LIGHT = [-0.55, -0.83]; // key light direction (toward the light)
  function shapePath(s) {
    const P = new Path2D();
    const [t] = s;
    if (t === 'e') P.ellipse(s[2], s[3], s[4], s[5], 0, 0, Math.PI * 2);
    else if (t === 'r') P.rect(s[2], s[3], s[4] - s[2] + 1, s[5] - s[3] + 1);
    else if (t === 'p') { s[2].forEach(([x, y], i) => i ? P.lineTo(x, y) : P.moveTo(x, y)); P.closePath(); }
    else if (t === 'l' || t === 'k') {
      const [x0, y0, x1, y1] = [s[2], s[3], s[4], s[5]], r = (s[6] || 1) / 2;
      const a = Math.atan2(y1 - y0, x1 - x0);
      P.arc(x0, y0, r, a + Math.PI / 2, a - Math.PI / 2);
      P.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
      P.closePath();
    }
    return P;
  }
  function shapeBox(s) {
    const [t] = s;
    if (t === 'e') return [s[2] - s[4], s[3] - s[5], s[2] + s[4], s[3] + s[5]];
    if (t === 'r') return [s[2], s[3], s[4] + 1, s[5] + 1];
    if (t === 'p') { const xs = s[2].map(q => q[0]), ys = s[2].map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
    const r = (s[6] || 1) / 2;
    return [Math.min(s[2], s[4]) - r, Math.min(s[3], s[5]) - r, Math.max(s[2], s[4]) + r, Math.max(s[3], s[5]) + r];
  }
  function volumeFill(g, s, rp) {
    const [t] = s, [x0, y0, x1, y1] = shapeBox(s);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    let grad;
    if (t === 'e') {
      // sphere: off-center highlight
      grad = g.createRadialGradient(cx + LIGHT[0] * hw * 0.45, cy + LIGHT[1] * hh * 0.45, 0, cx, cy, Math.max(hw, hh) * 1.15);
      grad.addColorStop(0, rp[4]); grad.addColorStop(0.35, rp[3]); grad.addColorStop(0.7, rp[2]); grad.addColorStop(1, rp[0]);
    } else if (t === 'l') {
      // cylinder: shade across the limb, lit side toward the light
      const dx = s[4] - s[2], dy = s[5] - s[3], len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      if (nx * LIGHT[0] + ny * LIGHT[1] < 0) { nx = -nx; ny = -ny; }
      const r = (s[6] || 1) / 2, mx = (s[2] + s[4]) / 2, my = (s[3] + s[5]) / 2;
      grad = g.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
      grad.addColorStop(0, rp[4]); grad.addColorStop(0.3, rp[3]); grad.addColorStop(0.65, rp[2]); grad.addColorStop(1, rp[0]);
    } else {
      // plates: diagonal falloff from the lit corner
      const d = Math.max(hw, hh);
      grad = g.createLinearGradient(cx + LIGHT[0] * d, cy + LIGHT[1] * d, cx - LIGHT[0] * d, cy - LIGHT[1] * d);
      grad.addColorStop(0, rp[4]); grad.addColorStop(0.35, rp[3]); grad.addColorStop(0.7, rp[2]); grad.addColorStop(1, rp[1]);
    }
    return grad;
  }
  /* Realistic shading for one shape: rasterize its mask, build a height field from the distance to its
   * edge (domes for ellipses/limbs, bevelled plates for flat parts), derive normals and light them
   * (Blinn-Phong + cool rim/back light + material grain). Written into `t` at the shape's bounding box. */
  const L3 = (() => { const v = [-0.5, -0.7, 0.75], n = Math.hypot(...v); return v.map(x => x / n); })();
  const H3 = (() => { const v = [L3[0], L3[1], L3[2] + 1], n = Math.hypot(...v); return v.map(x => x / n); })();
  const hash = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  function litShape(t, mg, mc, P, s, m, S, unit) {
    const W = mc.width, Hh = mc.height;
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, W, Hh); unit(mg);
    mg.fillStyle = '#fff'; mg.fill(P);
    const [bx0, by0, bx1, by1] = shapeBox(s);
    const x0 = Math.max(0, Math.floor((bx0 + 1) * S) - 2), y0 = Math.max(0, Math.floor((by0 + 1) * S) - 2);
    const x1 = Math.min(W, Math.ceil((bx1 + 1) * S) + 2), y1 = Math.min(Hh, Math.ceil((by1 + 1) * S) + 2);
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const A = mg.getImageData(x0, y0, w, h).data;
    // chamfer distance to the outside
    const D = new Float32Array(w * h), INF = 1e6;
    for (let i = 0; i < w * h; i++) D[i] = A[i * 4 + 3] > 127 ? INF : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!D[i]) continue;
      D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
    }
    let maxD = 0;
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; if (!D[i]) continue;
      D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
      if (D[i] > maxD) maxD = D[i];
    }
    const round = s[0] === 'e' || s[0] === 'l';
    const R = round ? Math.max(1, maxD) : Math.min(Math.max(1, maxD), S * 1.7);
    const Hf = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { const q = Math.min(D[i] / R, 1); Hf[i] = R * Math.sqrt(1 - (1 - q) * (1 - q)); }
    const hv = (x, y) => Hf[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    const cn = parseInt(m.c.slice(1), 16), br = cn >> 16, bg = (cn >> 8) & 255, bb = cn & 255;
    const spec = m.spec ?? 0.45, shin = m.shin ?? 18, grain = m.grain ?? 0.07;
    const img = t.createImageData(w, h), o = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, a = A[i * 4 + 3]; if (!a) continue;
      let nx = -(hv(x + 1, y) - hv(x - 1, y)) * 0.5, ny = -(hv(x, y + 1) - hv(x, y - 1)) * 0.5, nz = 1;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const dif = Math.max(0, nx * L3[0] + ny * L3[1] + nz * L3[2]);
      const sp = Math.pow(Math.max(0, nx * H3[0] + ny * H3[1] + nz * H3[2]), shin) * spec;
      const rimL = Math.pow(1 - nz, 2.2) * Math.max(0, nx * 0.7 + ny * 0.2) * 0.55; // cool back light from the right
      const gx = x0 + x, gy = y0 + y;
      const n = (vnoise(gx / (S * 1.2), gy / (S * 1.2)) - 0.5) * 2 * grain + (hash(gx, gy) - 0.5) * grain * 0.6;
      const lv = (0.3 + dif * 0.85) * (1 + n) * (1 - (gy / Hh) * 0.18);
      const cool = (1 - dif) * 0.18;
      o[i * 4] = Math.min(255, br * lv * (1 - cool) + 40 * cool + 255 * sp + 150 * rimL);
      o[i * 4 + 1] = Math.min(255, bg * lv * (1 - cool) + 55 * cool + 250 * sp + 190 * rimL);
      o[i * 4 + 2] = Math.min(255, bb * lv * (1 - cool) + 85 * cool + 240 * sp + 255 * rimL);
      o[i * 4 + 3] = a;
    }
    t.save(); t.setTransform(1, 0, 0, 1, 0, 0);
    mc.width = mc.width; // reuse the rim canvas as scratch for the lit tile
    mc.getContext('2d').putImageData(img, x0, y0);
    t.drawImage(mc, 0, 0);
    t.restore();
  }
  function illustrate(shapes, mats, outline, key) {
    if (key && cache.has(key)) return cache.get(key);
    const S = ILLUS_SCALE, N = 50;
    const mk = () => { const c = document.createElement('canvas'); c.width = N * S; c.height = N * S; return c; };
    const out = mk(), g = out.getContext('2d');
    const tmp = mk(), t = tmp.getContext('2d');
    const rim = mk(), r = rim.getContext('2d');
    const glows = [];
    const unit = c => { c.setTransform(S, 0, 0, S, S, S); }; // 1-unit padding
    for (const s of shapes) {
      const ch = s[0] === 'k' ? 'K' : s[1];
      const m = mats[ch] || (ch === 'K' ? { c: outline, line: true } : null);
      if (!m) continue;
      const P = shapePath(s);
      if (m.glow) { glows.push([P, m.c]); continue; }
      const rp = PixelArt.ramp(m.c);
      // 1) contact shadow cast by this shape onto what is already drawn (only on existing pixels)
      g.save(); unit(g);
      g.globalCompositeOperation = 'source-atop';
      g.filter = `blur(${S * 0.9}px)`;
      g.translate(0.9, 1.2); g.fillStyle = 'rgba(8,6,16,0.55)'; g.fill(P);
      g.restore();
      // 2) the shape itself, lit per pixel from its height field (realistic mode), plus soft line art
      t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, tmp.width, tmp.height); unit(t);
      if (m.line) { t.fillStyle = outline; t.fill(P); }
      else {
        litShape(t, r, rim, P, s, m, S, unit);
        unit(t); t.lineJoin = 'round'; t.lineWidth = 0.3; t.globalAlpha = 0.7;
        t.strokeStyle = outline === OUTLINE ? PixelArt.shadeHex(rp[0], -50) : outline; t.stroke(P); t.globalAlpha = 1;
      }
      g.drawImage(tmp, 0, 0);
    }
    // 3) glowing eyes / cores / weapon emitters with bloom
    for (const [P, c] of glows) {
      g.save(); unit(g);
      g.shadowColor = c; g.shadowBlur = S * 3;
      g.fillStyle = c; g.fill(P);
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.65)'; g.save(); g.clip(P); g.translate(-0.3, -0.3); g.fill(P); g.restore();
      g.restore();
    }
    out.illus = true;
    if (key) cache.set(key, out);
    return out;
  }
  // glow: 0..2 — eye brightness step (cycled for a pulsing glow)
  function enemySprite(tpl, faction, element, palOverride, glow = 0) {
    const p = { ...FACTION_PALETTES[faction], ...(palOverride || {}) };
    const W = element && ELEMENT_COLORS[element] ? ELEMENT_COLORS[element] : p.W;
    const mats = {
      B: { c: p.B }, b: { c: p.b, g: 'B' }, H: { c: p.H }, D: { c: p.D },
      S: { c: p.S }, s: { c: p.s, g: 'S' }, C: { c: p.C }, c: { c: p.c, g: 'C' }, G: { c: p.G },
      E: { c: glow ? shade(p.E, glow * 40) : p.E, glow: true }, W: { c: W, glow: true },
    };
    // surface response for the realistic renderer: metal shines, cloth is matte and grainy
    const metal = faction === 'vex';
    for (const k of ['B', 'b', 'S', 's', 'H']) Object.assign(mats[k], metal ? { spec: 0.95, shin: 34, grain: 0.05 } : faction === 'hive' ? { spec: 0.3, shin: 14, grain: 0.1 } : { spec: 0.55, shin: 22, grain: 0.06 });
    Object.assign(mats.G, { spec: 0.9, shin: 42, grain: 0.04 });
    Object.assign(mats.D, { spec: 0.25, shin: 12 });
    for (const k of ['C', 'c']) Object.assign(mats[k], { spec: 0.05, shin: 6, grain: 0.16 });
    const key = `e:${tpl}:${faction}:${element}:${glow}:${JSON.stringify(palOverride || {})}`;
    // Illustrated high-res art from pixelart.js ENEMY_SHAPES (shown downscaled); legacy 32px maps as fallback
    if (PixelArt.ENEMY_SHAPES[tpl]) return illustrate(PixelArt.ENEMY_SHAPES[tpl], mats, p.K || OUTLINE, 'r' + key);
    return renderShaded(PixelArt.enemyRows(tpl) || ENEMY[tpl] || ENEMY.thrall, mats, `e:${tpl}:${faction}:${element}:${glow}:${JSON.stringify(palOverride || {})}`, p.K || OUTLINE);
  }
  function weaponSprite(subType, element) {
    const key = WEAPON_OF_SUBTYPE[subType] || 'rifle';
    const [rows, gx, gy] = WEAPON[key];
    const mats = { G: { c: '#2e3440' }, g: { c: '#6c7484', g: 'G' }, H: { c: '#cfd5de' }, W: { c: ELEMENT_COLORS[element] || '#c8ccd4', glow: true } };
    return { sprite: renderShaded(rows, mats, `w:${key}:${element}`), gx: gx + 1, gy: gy + 1, key };
  }

  // ---------------- Live2D-like drawing ----------------
  /* Draws `src` with its feet at (cx, by), size w×h, deformed row by row:
   *   breath: vertical stretch amplitude (fraction), sway: horizontal sway at the top (px),
   *   hem: cloth hem wave below fraction o.hemFrom, lean: static top offset (px),
   *   squash: extra vertical scale (attack/hit), phase/speed: per-entity timing. */
  function drawLive(g, src, cx, by, w, h, t, o = {}) {
    const H = src.height, W = src.width;
    const ph = o.phase || 0;
    const breath = Math.sin(t * (o.speed || 0.0032) + ph);
    const sy = 1 + breath * (o.breath ?? 0.025) + (o.squash || 0);
    const dh = h * sy, top = by - dh;
    const rh = dh / H;
    for (let r = 0; r < H; r++) {
      const k = 1 - r / H;
      let dx = Math.sin(t * (o.swaySpeed || 0.0021) + ph + r * 0.11) * (o.sway ?? 0.8) * k * k + (o.lean || 0) * k;
      const hf = r / H - (o.hemFrom ?? 1);
      if (hf > 0 && o.hem) dx += Math.sin(t * 0.005 + ph + r * 0.45) * o.hem * hf * 3;
      g.drawImage(src, 0, r, W, 1, cx - w / 2 + dx, top + r * rh, w, rh + 0.6);
    }
  }

  // ---------------- API images ----------------
  const imgCache = new Map();
  function loadImage(url, cors) {
    const key = url + (cors ? '#c' : '');
    if (imgCache.has(key)) return imgCache.get(key);
    const p = new Promise((resolve, reject) => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image load failed: ' + url));
      im.src = url;
    });
    imgCache.set(key, p);
    return p;
  }

  // Background: downscale + cover-crop to w×h (no pixel reads → works with non-CORS PGCR images)
  async function pixelatedBackground(url, w, h, focusX = 0.5) {
    const im = await loadImage(url, false);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    const s = Math.max(w / im.width, h / im.height);
    const dw = im.width * s, dh = im.height * s;
    g.drawImage(im, (w - dw) * focusX, (h - dh) / 2, dw, dh);
    return c;
  }

  // Hologram enemy from an API icon (CORS): pixelate, keep the cyan hologram, drop the background
  async function pixelatedHologram(url, size) {
    const im = await loadImage(url, true);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(im, 0, 0, size, size);
    const data = g.getImageData(0, 0, size, size);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if ((gg + b) / 2 - r < 40 || b < 140) { d[i + 3] = 0; continue; }
      const lum = (r + gg + b) / 3;
      const tone = lum > 200 ? [230, 255, 255] : lum > 160 ? [150, 235, 255] : lum > 120 ? [80, 190, 240] : [40, 120, 200];
      d[i] = tone[0]; d[i + 1] = tone[1]; d[i + 2] = tone[2]; d[i + 3] = 235;
    }
    g.putImageData(data, 0, 0);
    const o = document.createElement('canvas');
    o.width = size + 2; o.height = size + 2;
    const og = o.getContext('2d');
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) og.drawImage(c, dx, dy);
    og.globalCompositeOperation = 'source-in';
    og.fillStyle = '#06121c';
    og.fillRect(0, 0, o.width, o.height);
    og.globalCompositeOperation = 'source-over';
    og.drawImage(c, 1, 1);
    return o;
  }

  // Dominant non-background color of an item icon (used to color armor / ghost sprites
  // after the equipped items). Corners are treated as the icon background.
  const colorCache = new Map();
  async function iconColor(url) {
    if (colorCache.has(url)) return colorCache.get(url);
    const p = (async () => {
      const im = await loadImage(url, true);
      const S = 24;
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0, S, S);
      const d = g.getImageData(0, 0, S, S).data;
      const px = (x, y) => { const i = (y * S + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      const corners = [px(0, 0), px(S - 1, 0), px(0, S - 1), px(S - 1, S - 1)];
      const bg = [0, 1, 2].map(k => corners.reduce((a, c2) => a + c2[k], 0) / 4);
      const buckets = new Map();
      for (let y = 4; y < S - 4; y++) for (let x = 4; x < S - 4; x++) {
        const [r, gg, b] = px(x, y);
        const dist = Math.abs(r - bg[0]) + Math.abs(gg - bg[1]) + Math.abs(b - bg[2]);
        const lum = (r + gg + b) / 3;
        if (dist < 60 || lum < 28 || lum > 235) continue;
        const key = (r >> 5) << 6 | (gg >> 5) << 3 | (b >> 5);
        const bk = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        bk.n++; bk.r += r; bk.g += gg; bk.b += b;
        buckets.set(key, bk);
      }
      let best = null;
      for (const bk of buckets.values()) if (!best || bk.n > best.n) best = bk;
      if (!best) return null;
      const hex = v => Math.round(v).toString(16).padStart(2, '0');
      const raw = '#' + hex(best.r / best.n) + hex(best.g / best.n) + hex(best.b / best.n);
      // keep sprites readable: clamp lightness into a mid range
      const [h, sat, l] = hexToHsl(raw);
      return hslToHex(h, Math.min(sat, 0.75), Math.max(0.42, Math.min(0.78, l)));
    })().catch(() => null);
    colorCache.set(url, p);
    return p;
  }
  // Guardian palette override from equipped armor icons { head, chest, cls }
  async function armorPalette(urls) {
    const [head, chest, cls] = await Promise.all([urls.head, urls.chest, urls.cls].map(u => (u ? iconColor(u) : null)));
    const o = {};
    const base = chest || head;
    if (base) o.A = base;
    if (head && head !== base) o.B = head;
    if (cls) o.C = cls;
    return o;
  }

  /* Per-slot look from the equipped armor icons (API images): each slot's dominant icon color re-skins
   * that slot's main material on the rig. Dark materials (hoods / coats) keep a dark value. */
  const SLOT_MAT = {
    titan: { head: 'W', arms: 'W', chest: 'W', legs: 'W', cls: 'C' },
    hunter: { head: 'N', arms: 'W', chest: 'N', legs: 'W', cls: 'C' },
    warlock: { head: 'W', arms: 'W', chest: 'N', legs: 'U' },
  };
  async function guardianSlotPal(cls, urls) {
    const map = SLOT_MAT[PixelArt.CLASS_KEYS[cls] || 'titan'];
    const out = {};
    await Promise.all(Object.entries(map).map(async ([slot, mat]) => {
      const c = urls[slot] ? await iconColor(urls[slot]) : null;
      if (!c) return;
      const [hh, ss] = hexToHsl(c);
      out[slot] = { [mat]: mat === 'N' || mat === 'U' ? hslToHex(hh, Math.min(ss, 0.45), 0.2) : c };
    }));
    return out;
  }

  function gridBackground(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#071420'); grad.addColorStop(1, '#0d2a3a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(80,190,240,0.18)';
    const hz = Math.floor(h * 0.45);
    for (let x = 0; x < w; x += 6) { g.beginPath(); g.moveTo(w / 2 + (x - w / 2) * 0.3, hz); g.lineTo(x, h); g.strokeStyle = 'rgba(80,190,240,0.18)'; g.stroke(); }
    for (let y = hz, s = 2; y < h; y += s, s *= 1.25) g.fillRect(0, Math.floor(y), w, 1);
    return c;
  }

  root.Sprites = {
    ELEMENT_COLORS, FLOATING, guardianSprite, guardianRig, drawRig, ghostSprite, enemySprite, weaponSprite,
    drawLive, loadImage, pixelatedBackground, pixelatedHologram, iconColor, armorPalette, guardianSlotPal, gridBackground, lighten, shade,
  };
})(window);
