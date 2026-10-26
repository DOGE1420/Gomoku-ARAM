// 맵(자연재해) · 자기장 · 시작 능력 · 카드 다시 뽑기 · 새 카드(저격·1+1·엿보기·거대한 돌·투명한 돌·기상 이변) 보조
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

// ================= 맵: 판마다 무작위 하나 =================
// 라운드 = 흑·백이 한 번씩 둔 것 (백의 턴이 끝날 때 1 증가)
const MAP_POOL = [
  { id: 'classic', icon: '🏞️', name: '평원', short: '자연재해 없음', desc: '아무 일도 일어나지 않는 기본 맵입니다.' },
  { id: 'summer', icon: '☀️', name: '여름', short: '5라운드마다 흑·백 돌 1개씩 녹음',
    desc: '날씨가 더워 5라운드마다 흑돌과 백돌이 하나씩 무작위로 녹아 사라집니다. (1라운드 = 흑·백이 한 수씩)' },
  { id: 'winter', icon: '❄️', name: '겨울', short: '5라운드마다 돌 1개가 2라운드 동안 얼음',
    desc: '5라운드마다 무작위 돌 하나가 얼어붙어 2라운드 동안 누구의 돌도 아닌 얼음이 됩니다 (줄이 끊기고 그 칸에 둘 수 없음). 2라운드 뒤 녹아 원래 주인에게 돌아옵니다.' },
  { id: 'space', icon: '🌌', name: '우주', short: '웜홀: 판의 양 끝이 반대편과 연결',
    desc: '웜홀로 판의 왼쪽·오른쪽 끝, 위쪽·아래쪽 끝이 서로 이어져 있습니다. 가장자리에서 끊긴 줄도 반대편으로 넘어가 이어지면 승리 줄이 됩니다.' },
  { id: 'desert', icon: '🏜️', name: '사막', short: '8라운드부터 4라운드마다 모래폭풍',
    desc: '8라운드부터 4라운드마다 모래폭풍이 무작위 방향으로 불어, 모든 돌이 그 방향으로 한 칸씩 밀립니다. (막힌 돌은 제자리, 승리 줄이 완성되는 이동은 일어나지 않음)' },
  { id: 'rain', icon: '🌧️', name: '장마', short: '알까기 미끄러움 · 지진 때 쓰나미',
    desc: '판이 젖어 알까기 돌이 더 멀리 미끄러집니다. 지진 카드가 두 배로 자주 나오고, 지진이 나면 쓰나미가 덮쳐 무작위 한쪽 가장자리 3줄의 돌이 휩쓸려 사라집니다.' },
];
const MAP_EN = {
  classic: { name: 'Plains', short: 'No disasters', desc: 'The plain map — nothing happens.' },
  summer: { name: 'Summer', short: 'A black and a white stone melt every 5 rounds', desc: 'It is hot: every 5 rounds one random black stone and one random white stone melt away. (1 round = one move by each side)' },
  winter: { name: 'Winter', short: 'A stone freezes for 2 rounds every 5 rounds', desc: "Every 5 rounds a random stone freezes into ice that belongs to nobody for 2 rounds (it breaks lines and nobody can play there). Then it thaws back to its owner." },
  space: { name: 'Space', short: 'Wormholes: opposite edges are connected', desc: 'Wormholes connect the left and right edges, and the top and bottom edges. A line that runs off one edge continues on the other side and can win.' },
  desert: { name: 'Desert', short: 'Sandstorm every 4 rounds from round 8', desc: 'From round 8, every 4 rounds a sandstorm blows in a random direction and pushes every stone one cell that way. (Blocked stones stay; moves that would complete a winning line do not happen.)' },
  rain: { name: 'Monsoon', short: 'Slippery flicks · tsunami on earthquakes', desc: 'The wet board makes flicked stones slide farther. Earthquake cards show up twice as often, and every earthquake brings a tsunami that sweeps away the stones on the 3 lines next to a random edge.' },
};
const ZONE_START = 15, ZONE_EVERY = 5, ZONE_MAX = 3; // 자기장: 15라운드부터 5라운드마다 바깥 한 줄씩, 최대 3줄 (9×9까지)

// ================= 시작 능력: 게임 시작 때 전설 카드 다음에 1개 (판 내내 자동 적용) =================
const ABILITY_POOL = [
  { id: 'pickpocket', icon: '🖐️', name: '손버릇', short: '상대의 첫 카드를 똑같이 1장 받음', desc: '상대가 처음으로 카드를 받으면, 같은 카드 1장이 내 패에도 들어옵니다.' },
  { id: 'umbrella', icon: '☂️', name: '자연재해 면역', short: '맵 자연재해가 내 돌을 건드리지 않음', desc: '여름에 녹기·겨울 얼음·사막 모래폭풍·장마 쓰나미가 내 돌에는 일어나지 않습니다. (자기장은 피할 수 없음)' },
  { id: 'pouch', icon: '🎒', name: '넉넉한 주머니', short: '패를 5장까지', desc: '패를 4장이 아니라 5장까지 쥘 수 있습니다.' },
  { id: 'clover', icon: '🍀', name: '행운', short: '카드 고를 때 4장 중 선택', desc: '3수마다 하는 카드 선택에서 3장이 아니라 4장 중에 고릅니다.' },
  { id: 'sturdy', icon: '🏰', name: '단단한 시작', short: '처음 둔 돌 3개는 영구 보호', desc: '내가 처음 둔 돌 3개는 판 내내 폭파·저격·감염·맞교환·운석·전세 역전에 당하지 않습니다.' },
  { id: 'retry', icon: '🔁', name: '재도전', short: '카드 다시 뽑기 3회', desc: '카드 선택 화면의 [다시 뽑기]를 1번이 아니라 3번까지 쓸 수 있습니다.' },
];
const ABILITY_EN = {
  pickpocket: { name: 'Pickpocket', short: "Get a copy of the opponent's first card", desc: 'When your opponent gets their first card, a copy of it goes into your hand too.' },
  umbrella: { name: 'Disaster-proof', short: "Map disasters don't touch your stones", desc: "Summer melting, winter ice, desert sandstorms and monsoon tsunamis never affect your stones. (The closing zone still does.)" },
  pouch: { name: 'Big Pouch', short: 'Hold up to 5 cards', desc: 'Your hand holds up to 5 cards instead of 4.' },
  clover: { name: 'Lucky Clover', short: 'Pick from 4 cards', desc: 'Card picks every 3 stones offer you 4 cards instead of 3.' },
  sturdy: { name: 'Sturdy Start', short: 'Your first 3 stones are protected forever', desc: 'Your first 3 stones are immune to Bomb, Snipe, Infection, Swap, Meteor and Reversal for the whole game.' },
  retry: { name: 'Second Chance', short: '3 card rerolls', desc: 'You can use [Reroll] on the card pick screen 3 times instead of once.' },
};
ABILITY_POOL.forEach(c => { c.ability = true; c.type = 'ability'; });

Object.assign(I18N.ko, {
  'map.badge': '{icon} {map}', 'map.round': '{n}라운드', 'map.title': '이번 판 맵', 'log.mapIs': '🗺️ 이번 판 맵: {icon} {map} — {mapShort}',
  'map.zoneNote': '자기장: {start}라운드부터 {every}라운드마다 바깥 한 줄씩 닫힘 (최대 {max}줄)', 'map.zoneNow': '지금 자기장 {n}줄',
  'log.melt': '☀️ 더위로 돌 {n}개가 녹아 사라짐', 'log.freeze': '❄️ {color}의 돌 하나가 얼어붙음 (2라운드)', 'log.thaw': '❄️ 얼음이 녹아 {color}의 돌로 돌아옴',
  'log.sandstorm': '🏜️ 모래폭풍! 돌 {n}개가 {dir}으로 밀림', 'dir.up': '위쪽', 'dir.down': '아래쪽', 'dir.left': '왼쪽', 'dir.right': '오른쪽',
  'log.tsunami': '🌊 쓰나미! {dir} 가장자리 3줄의 돌 {n}개가 휩쓸려 감',
  'log.zoneWarn': '⚡ 다음 라운드에 자기장이 줄어듭니다 (바깥 한 줄)', 'log.zone': '⚡ 자기장이 줄어듦 — 바깥 줄의 돌 {n}개가 사라짐',
  'ab.draftTitle': '{color} — 시작 능력 선택', 'ab.draftSub': '판 내내 자동으로 적용되는 능력 1개를 고르세요', 'ab.badge': '시작 능력',
  'ab.picked': '{color}: 시작 능력 {icon} {card} 선택', 'log.pickpocket': '{color}: 🖐️ 손버릇 — 상대의 첫 카드 {card}를 똑같이 받음',
  'draft.refresh': '🔄 다시 뽑기 ({n}회 남음)', 'log.refresh': '{color}: 🔄 카드 다시 뽑기',
  'log.snipeDone': '{color}: 🎯 저격 — 상대 돌 {n}개 제거 (턴 종료)', 'log.doubleDone': '{color}: 🎁 1+1 — 카드 2장 획득',
  'log.peekShow': '{color}: 🔍 상대 패 — {list}', 'log.peekEmpty': '{color}: 🔍 상대 패가 비어 있음', 'log.peeked': '🔍 상대가 내 패를 엿봤습니다',
  'log.giantOn': '{color}: 🪨 거대한 돌 — 이번 턴 다음 착수가 2×2로 놓임', 'log.giantDone': '{color}: 🪨 거대한 돌이 {n}칸을 차지',
  'log.ghostOn': '{color}: 👻 투명한 돌 — 이번 턴 다음 착수는 상대에게 3라운드 동안 안 보임', 'log.ghostFound': '👻 숨어 있던 투명한 돌을 찾았습니다!', 'log.ghostGone': '👻 투명한 돌이 모습을 드러냄',
  'log.weatherDone': '{color}: 🌦️ 기상 이변 — 맵이 {icon} {map}(으)로 바뀜',
});
Object.assign(I18N.en, {
  'map.badge': '{icon} {map}', 'map.round': 'Round {n}', 'map.title': "This game's map", 'log.mapIs': '🗺️ Map: {icon} {map} — {mapShort}',
  'map.zoneNote': 'Closing zone: from round {start}, the outer ring closes every {every} rounds (up to {max} rings)', 'map.zoneNow': 'Zone now {n} ring(s)',
  'log.melt': '☀️ The heat melted {n} stone(s)', 'log.freeze': '❄️ A {color} stone froze (2 rounds)', 'log.thaw': '❄️ The ice thawed back into a {color} stone',
  'log.sandstorm': '🏜️ Sandstorm! {n} stone(s) pushed {dir}', 'dir.up': 'up', 'dir.down': 'down', 'dir.left': 'left', 'dir.right': 'right',
  'log.tsunami': '🌊 Tsunami! {n} stone(s) on the 3 lines by the {dir} edge were swept away',
  'log.zoneWarn': '⚡ The zone closes next round (outer ring)', 'log.zone': '⚡ The zone closed — {n} stone(s) on the outer ring vanished',
  'ab.draftTitle': '{color} — Pick a starting ability', 'ab.draftSub': 'One passive ability that lasts the whole game', 'ab.badge': 'Ability',
  'ab.picked': '{color}: picked ability {icon} {card}', 'log.pickpocket': "{color}: 🖐️ Pickpocket — copied the opponent's first card, {card}",
  'draft.refresh': '🔄 Reroll ({n} left)', 'log.refresh': '{color}: 🔄 rerolled the cards',
  'log.snipeDone': '{color}: 🎯 Snipe — removed {n} enemy stone(s) (turn ends)', 'log.doubleDone': '{color}: 🎁 1+1 — got 2 cards',
  'log.peekShow': "{color}: 🔍 opponent's hand — {list}", 'log.peekEmpty': "{color}: 🔍 the opponent's hand is empty", 'log.peeked': '🔍 Your opponent peeked at your hand',
  'log.giantOn': '{color}: 🪨 Giant Stone — your next stone this turn covers 2×2', 'log.giantDone': '{color}: 🪨 the giant stone covers {n} cells',
  'log.ghostOn': '{color}: 👻 Ghost Stone — your next stone this turn is invisible to the opponent for 3 rounds', 'log.ghostFound': '👻 You found a hidden ghost stone!', 'log.ghostGone': '👻 A ghost stone became visible',
  'log.weatherDone': '{color}: 🌦️ Weather Shift — the map is now {icon} {map}',
});

// ================= 상태 =================
let mapId = 'classic';  // checkWin(우주 웜홀)과 계산용 작업자도 씀
let world = null;       // { map, round, frozen[], zone, hidden[], ab{}, pp{}, sturdy{}, refresh{} } — 멀티플레이 공개 상태
let wNext = { giant: 0, ghost: 0 }; // 이번 턴 다음 착수에 붙는 효과 (그 색)
let peekView = null;    // { by, cards[] } — 엿보기로 본 상대 패 (내 턴 끝까지)
let mpPeekReq = null, mpPeekRes = null, mpGift = null, lastSeenPeekReqId = null, lastSeenPeekResId = null, lastSeenGiftId = null;

function randomMapId() { return MAP_POOL[Math.floor(Math.random() * MAP_POOL.length)].id; }
function mapInfo(id) { return MAP_POOL.find(m => m.id === (id || mapId)) || MAP_POOL[0]; }
function mapName(id) { const m = mapInfo(id); return lang === 'en' && MAP_EN[m.id] ? MAP_EN[m.id].name : m.name; }
function mapShort(id) { const m = mapInfo(id); return lang === 'en' && MAP_EN[m.id] ? MAP_EN[m.id].short : m.short; }
function mapDesc(id) { const m = mapInfo(id); return lang === 'en' && MAP_EN[m.id] ? MAP_EN[m.id].desc : m.desc; }
function worldFresh(map) {
  return { map, round: 0, frozen: [], zone: 0, hidden: [], ab: lgPair(null), pp: lgPair(false), sturdy: lgPair(0), refresh: lgPair(1), ev: [], evSeq: 0 };
}
function worldNorm(d) {
  const out = worldFresh(d && d.map ? d.map : 'classic');
  if (!d || typeof d !== 'object') return out;
  out.round = d.round || 0; out.zone = d.zone || 0;
  const arr = v => Array.isArray(v) ? v.slice() : (v ? Object.values(v) : []);
  out.frozen = arr(d.frozen); out.hidden = arr(d.hidden); out.ev = arr(d.ev); out.evSeq = d.evSeq || 0;
  for (const k of ['ab', 'pp', 'sturdy', 'refresh']) if (d[k]) for (const p of [BLACK, WHITE]) if (d[k][p] !== undefined) out[k][p] = d[k][p];
  return out;
}
function worldReset(map) {
  world = worldFresh(map || randomMapId());
  mapId = world.map;
  wNext = { giant: 0, ghost: 0 }; peekView = null; lastSeenWorldEv = 0;
  mpPeekReq = null; mpPeekRes = null; mpGift = null;
}
function setMap(id) { world.map = id; mapId = id; }
// 자연재해·자기장 기록: 멀티플레이에서는 상대 화면에도 같은 기록이 남도록 공개 상태에 최근 몇 개를 함께 실음
let lastSeenWorldEv = 0;
function worldLog(msg) {
  addLog(msg);
  if (!world) return;
  world.evSeq++;
  world.ev = world.ev.concat({ id: world.evSeq, m: msg }).slice(-8);
  lastSeenWorldEv = world.evSeq;
}
function catchUpWorldLog() {
  if (!world) return;
  for (const e of world.ev) if (e && e.id > lastSeenWorldEv) { addLog(e.m); }
  lastSeenWorldEv = Math.max(lastSeenWorldEv, world.evSeq);
}
function abOf(p) { return world && world.ab[p]; }
function abCard(p) { const id = abOf(p); return id ? ABILITY_POOL.find(c => c.id === id) : null; }
function handLimit(p) { return abOf(p) === 'pouch' ? HAND_LIMIT + 1 : HAND_LIMIT; }
function draftSize(p) { return abOf(p) === 'clover' ? 4 : 3; }
function disasterHits(p) { return abOf(p) !== 'umbrella'; }
function trimHand(p) { while (hand[p].length > handLimit(p)) { const dropped = hand[p].shift(); addLog(L('log.handOverflow', { color: p, card: dropped.id })); } }
function abilityPicks() { return shuffle(ABILITY_POOL).slice(0, 3); }
function ringOf(r, c) { return Math.min(r, c, SIZE - 1 - r, SIZE - 1 - c); }
function isZoneCell(r, c) { return !!world && ringOf(r, c) < world.zone; }
function frozenAt(r, c) { return world ? world.frozen.find(f => f.r === r && f.c === c) : null; }
function viewerColor() { return mode === 'local' ? current : myColor; }
// 투명한 돌: 지금 화면을 보는 사람에게 숨길 돌인지
function isHiddenFor(r, c, viewer) {
  return !!world && world.hidden.some(h => h.r === r && h.c === c && h.owner !== viewer && board[r][c] === h.owner);
}

// ================= 라운드 진행 (passTurn에서 차례가 바뀐 뒤) =================
function worldTurnEnd(p) {
  wNext = { giant: 0, ghost: 0 };
  if (peekView && peekView.by === p) peekView = null;
}
function worldRoundTick() {
  if (!world || gameOver || tut) return;
  if (current !== BLACK) return; // 백의 턴이 끝나 흑 차례가 되면 1라운드
  world.round++;
  const R = world.round;
  // 얼음 녹기 · 투명한 돌 드러나기
  world.frozen = world.frozen.filter(f => {
    if (--f.rounds > 0) return true;
    if (board[f.r][f.c] === WALL && !isZoneCell(f.r, f.c)) { board[f.r][f.c] = f.owner; worldLog(L('log.thaw', { color: f.owner })); }
    return false;
  });
  world.hidden = world.hidden.filter(h => {
    if (board[h.r][h.c] !== h.owner) return false;
    if (--h.rounds > 0) return true;
    worldLog(L('log.ghostGone'));
    return false;
  });
  // 맵 자연재해
  if (mapId === 'summer' && R % 5 === 0) mapMelt();
  if (mapId === 'winter' && R % 5 === 0) mapFreeze();
  if (mapId === 'desert' && R >= 8 && (R - 8) % 4 === 0) mapSandstorm();
  // 자기장
  if (world.zone < ZONE_MAX) {
    if (R >= ZONE_START - 1 && (R - (ZONE_START - 1)) % ZONE_EVERY === 0) worldLog(L('log.zoneWarn'));
    if (R >= ZONE_START && (R - ZONE_START) % ZONE_EVERY === 0) zoneShrink();
  }
  pruneInvalidTraps();
  if (!gameOver) endIfBoardWin(true);
}
function stonesOf(p) { return listStones(p).filter(q => !isZoneCell(q.r, q.c)); }
function mapMelt() {
  let n = 0;
  for (const p of [BLACK, WHITE]) {
    if (!disasterHits(p)) continue;
    const list = stonesOf(p);
    if (!list.length) continue;
    const q = list[Math.floor(Math.random() * list.length)];
    lgRemoveStone(q.r, q.c); lgLose(p, q.r, q.c); n++;
  }
  if (n) worldLog(L('log.melt', { n }));
}
function mapFreeze() {
  const list = [BLACK, WHITE].filter(disasterHits).flatMap(p => stonesOf(p).map(q => ({ r: q.r, c: q.c, owner: p })));
  if (!list.length) return;
  const q = list[Math.floor(Math.random() * list.length)];
  board[q.r][q.c] = WALL;
  world.frozen.push({ r: q.r, c: q.c, owner: q.owner, rounds: 2 });
  worldLog(L('log.freeze', { color: q.owner }));
}
const DIR4 = [{ k: 'up', dr: -1, dc: 0 }, { k: 'down', dr: 1, dc: 0 }, { k: 'left', dr: 0, dc: -1 }, { k: 'right', dr: 0, dc: 1 }];
function mapSandstorm() {
  const d = DIR4[Math.floor(Math.random() * 4)];
  // 바람이 향하는 쪽 앞에 있는 돌부터 움직여야 뒤의 돌이 따라 밀림
  const stones = [BLACK, WHITE].filter(disasterHits).flatMap(p => listStones(p))
    .sort((a, b) => (b.r * d.dr + b.c * d.dc) - (a.r * d.dr + a.c * d.dc));
  let n = 0;
  for (const q of stones) {
    const v = board[q.r][q.c], nr = q.r + d.dr, nc = q.c + d.dc;
    if (!inBoard(nr, nc) || board[nr][nc] !== EMPTY || isCrater(nr, nc)) continue;
    lgMoveStone(q.r, q.c, nr, nc);
    for (const h of world.hidden) if (h.r === q.r && h.c === q.c) { h.r = nr; h.c = nc; }
    if (checkWin(nr, nc, v)) { lgMoveStone(nr, nc, q.r, q.c); for (const h of world.hidden) if (h.r === nr && h.c === nc) { h.r = q.r; h.c = q.c; } continue; }
    n++;
  }
  lastMovePos = null;
  triggerBoardShake();
  worldLog(L('log.sandstorm', { n, dir: t('dir.' + d.k) }));
}
// 장마: 지진 뒤 쓰나미
function mapTsunami() {
  const d = DIR4[Math.floor(Math.random() * 4)];
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const v = board[r][c];
    if (!isStone(v) || !disasterHits(v)) continue;
    const dist = d.k === 'up' ? r : d.k === 'down' ? SIZE - 1 - r : d.k === 'left' ? c : SIZE - 1 - c;
    if (dist >= 3) continue;
    lgRemoveStone(r, c); lgLose(v, r, c); n++;
  }
  pruneInvalidTraps();
  worldLog(L('log.tsunami', { n, dir: t('dir.' + d.k) }));
}
function zoneShrink() {
  const z = world.zone;
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (ringOf(r, c) !== z) continue;
    if (isStone(board[r][c])) { const v = board[r][c]; lgRemoveStone(r, c); lgLose(v, r, c); n++; }
    board[r][c] = WALL;
  }
  world.zone = z + 1;
  world.frozen = world.frozen.filter(f => !isZoneCell(f.r, f.c));
  craterList = craterList.filter(cr => !isZoneCell(cr.r, cr.c));
  triggerBoardShake();
  worldLog(L('log.zone', { n }));
}

// ================= 착수 때 붙는 효과 (handlePlace에서 돌을 놓은 직후) =================
function worldOnPlace(r, c, p) {
  if (!world) return;
  // 단단한 시작: 처음 둔 돌 3개는 영구 보호
  if (abOf(p) === 'sturdy' && world.sturdy[p] < 3) { world.sturdy[p]++; immuneList.push({ r, c, owner: p }); }
  if (wNext.ghost === p) { wNext.ghost = 0; world.hidden.push({ r, c, owner: p, rounds: 3 }); }
  if (wNext.giant === p) {
    wNext.giant = 0;
    let n = 1;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1]]) {
      const rr = r + dr, cc = c + dc;
      if (!inBoard(rr, cc) || board[rr][cc] !== EMPTY || placeBlocked(rr, cc, p)) continue;
      if (lgWouldWin(rr, cc, p)) continue; // 덤으로 붙는 칸으로는 승리 줄을 완성하지 않음
      board[rr][cc] = p;
      moveHistory.push({ r: rr, c: cc, player: p, counted: false });
      n++;
    }
    pruneInvalidTraps();
    addLog(L('log.giantDone', { color: p, n }));
  }
}
// 카드를 얻을 때마다 (손버릇)
function onCardGained(p, card) {
  if (!world || !card || card.legend || card.ability) return;
  const opp = other(p);
  if (abOf(opp) !== 'pickpocket' || world.pp[opp]) return;
  if (mode === 'multiplayer' && p !== myColor) return; // 멀티: 카드를 얻은 쪽 화면이 알림
  world.pp[opp] = true;
  if (mode === 'multiplayer') {
    mpGift = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), to: opp, card: card.id };
    if (dbApi && roomCode) dbApi.updatePath('games/' + roomCode, { gift: mpGift, ['world/pp/' + opp]: true }).catch(() => {});
    return;
  }
  hand[opp].push(card);
  trimHand(opp);
  addLog(L('log.pickpocket', { color: opp, card: card.id }));
}

// ================= 새 카드 =================
function useWorldCard(player, idx, card) {
  const opp = other(player), C = { color: player };
  const spend = () => { removeFromHand(player, idx); markUsed(player); };
  switch (card.type) {
    case 'snipe': {
      const pool = shuffle(listStones(opp).filter(q => !isProtected(q.r, q.c)));
      if (!pool.length) { addLog(L('log.noTarget', C)); return true; }
      spend();
      const hit = pool.slice(0, 2);
      hit.forEach(q => { lgRemoveStone(q.r, q.c); lgLose(opp, q.r, q.c); });
      pruneInvalidTraps();
      addLog(L('log.snipeDone', { color: player, n: hit.length }));
      updateStatus(); updateHandUI(); draw();
      if (!endIfBoardWin(true)) passTurn(); // 사용 즉시 턴 종료 (돌은 두지 않음)
      return true;
    }
    case 'double':
      spend();
      grantRandomCard(player); grantRandomCard(player);
      addLog(L('log.doubleDone', C));
      updateHandUI(); draw();
      return true;
    case 'peek':
      spend();
      if (mode === 'multiplayer') {
        mpPeekReq = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), by: player };
      } else showPeek(player, hand[opp].map(c => c.id));
      updateHandUI(); draw();
      return true;
    case 'giant':
      spend(); wNext.giant = player;
      addLog(L('log.giantOn', C));
      updateHandUI(); draw();
      return true;
    case 'ghost':
      spend(); wNext.ghost = player;
      addLog(L('log.ghostOn', C));
      updateHandUI(); draw();
      return true;
    case 'weather': {
      spend();
      const next = shuffle(MAP_POOL.filter(m => m.id !== mapId))[0];
      // 얼음은 모두 녹고 새 맵 규칙이 바로 적용됨
      world.frozen.forEach(f => { if (board[f.r][f.c] === WALL && !isZoneCell(f.r, f.c)) board[f.r][f.c] = f.owner; });
      world.frozen = [];
      setMap(next.id);
      addLog(L('log.weatherDone', { color: player, icon: next.icon, map: next.id }));
      updateStatus(); updateHandUI(); draw();
      endIfBoardWin(true);
      return true;
    }
  }
  return false;
}
function showPeek(by, ids) {
  peekView = { by, cards: ids };
  if (!ids.length) { addLog(L('log.peekEmpty', { color: by })); return; }
  const list = ids.map(id => { const c = findAnyCard(id); return c ? c.icon + ' ' + cardName(c) : id; }).join(', ');
  addLog(L('log.peekShow', { color: by, list }));
}

// ================= 카드 다시 뽑기 =================
const draftRefreshBtn = document.getElementById('draft-refresh');
function renderDraftRefresh(player) {
  if (!draftRefreshBtn) return;
  const left = world ? world.refresh[player] : 0;
  const canSee = mode === 'local' || player === myColor;
  draftRefreshBtn.hidden = !(left > 0 && canSee);
  draftRefreshBtn.textContent = t('draft.refresh', { n: left });
}
if (draftRefreshBtn) draftRefreshBtn.addEventListener('click', () => {
  if (!draftOpen || !lastDraft || !world || world.refresh[lastDraft.player] <= 0) return;
  const p = lastDraft.player;
  world.refresh[p]--;
  addLog(L('log.refresh', { color: p }));
  renderDraftCards(p, draftPicksFor(p, lastDraft.kind), lastDraft.kind);
  if (mode === 'multiplayer') syncPublicState();
});

// ================= 멀티플레이: 엿보기 요청/응답, 손버릇 선물 =================
function handleWorldSync(data) {
  mpPeekReq = data.peekReq || null; mpPeekRes = data.peekRes || null; mpGift = data.gift || null;
  const rq = data.peekReq;
  if (rq && rq.id !== lastSeenPeekReqId) {
    lastSeenPeekReqId = rq.id;
    if (rq.by !== myColor && !(data.peekRes && data.peekRes.id === rq.id)) {
      mpPeekRes = { id: rq.id, to: rq.by, cards: (hand[myColor] || []).map(c => c.id) };
      addLog(L('log.peeked'));
      dbApi.updatePath('games/' + roomCode, { peekRes: mpPeekRes }).catch(() => {});
    }
  }
  const rs = data.peekRes;
  if (rs && rs.id !== lastSeenPeekResId && rs.to === myColor) {
    lastSeenPeekResId = rs.id;
    showPeek(myColor, Array.isArray(rs.cards) ? rs.cards : (rs.cards ? Object.values(rs.cards) : []));
  }
  const g = data.gift;
  if (g && g.id !== lastSeenGiftId && g.to === myColor) {
    lastSeenGiftId = g.id;
    const card = CARD_POOL.find(c => c.id === g.card);
    if (card) { hand[myColor].push(card); trimHand(myColor); addLog(L('log.pickpocket', { color: myColor, card: card.id })); savePrivateState(); }
  }
}

// ================= 맵 표시 =================
const mapBadge = document.getElementById('map-badge');
function renderMapBadge() {
  if (!mapBadge) return;
  const m = mapInfo();
  mapBadge.hidden = !world || tut;
  mapBadge.textContent = t('map.badge', { icon: m.icon, map: m.id }) + (world && world.round ? ' · ' + t('map.round', { n: world.round }) : '') + (world && world.zone ? ' · ⚡' + world.zone : '');
}
if (mapBadge) {
  const open = () => openCardDetail(null, 'map');
  mapBadge.addEventListener('click', open);
  mapBadge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
}
function renderMapDetail() {
  const m = mapInfo();
  cdIcon.textContent = m.icon; cdName.textContent = t('map.title') + ' · ' + mapName();
  cdShort.textContent = mapShort(); cdDesc.textContent = mapDesc();
  cdUse.hidden = true; cdClose.textContent = t('cd.close');
  cdNote.textContent = t('map.zoneNote', { start: ZONE_START, every: ZONE_EVERY, max: ZONE_MAX }) + (world && world.zone ? ' · ' + t('map.zoneNow', { n: world.zone }) : '');
}
function renderAbilityDetail(f) {
  const card = abCard(f.player);
  if (!card) { closeCardDetail(); return; }
  cdIcon.textContent = card.icon; cdName.textContent = cardName(card) + ' · ' + t('ab.badge');
  cdShort.textContent = cardShort(card); cdDesc.textContent = cardDesc(card);
  cdUse.hidden = true; cdClose.textContent = t('cd.close');
  cdNote.textContent = '';
}
// 그리기: 장벽 칸 중 자기장·얼음은 다르게
function drawWorldCell(r, c, p) {
  if (isZoneCell(r, c)) {
    ctx.fillStyle = 'rgba(110, 60, 190, 0.55)';
    ctx.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL);
    return true;
  }
  const f = frozenAt(r, c);
  if (f) {
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(190, 230, 255, 0.95)'; ctx.fill();
    ctx.strokeStyle = f.owner === BLACK ? '#1b1b1b' : '#9fb7c9'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = Math.round(CELL * 0.42) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('❄️', p.x, p.y + 1);
    ctx.restore();
    return true;
  }
  return false;
}
function drawWorldOverlay() {
  if (mapId !== 'space') return;
  // 웜홀: 가장자리를 보라색 점선으로
  const a = cellCenter(0, 0), b = cellCenter(SIZE - 1, SIZE - 1);
  ctx.save();
  ctx.strokeStyle = 'rgba(150, 90, 255, 0.75)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
  ctx.strokeRect(a.x - CELL * 0.5, a.y - CELL * 0.5, b.x - a.x + CELL, b.y - a.y + CELL);
  ctx.restore();
}
