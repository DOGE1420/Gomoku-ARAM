// 봇 AI (난이도 1~20)
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

// ================= 봇 AI (난이도 1 / 3 / 5 / 7 / 10) =================
// radius: 돌 주변 몇 칸까지 후보로 보는지 (인지 영역)
// depth: 몇 수 앞까지 읽는지 (0 = 현재 수만 평가), width: 탐색 시 각 단계에서 검토하는 후보 수
// topN: 상위 몇 개 후보 중 무작위로 고르는지, defense: 수비 가중치
// missChance: 상대 위협을 못 보고 넘어갈 확률, patterns: 띈 3·4·쌍삼 등 패턴 인식 여부
// smartCards: 카드를 상황에 맞게 쓰는지 (아니면 무작위), vcf: 연속 4로 끝내는 수순 탐색 여부
const BOT_LEVELS = {
  1:  { radius: 1, depth: 0, width: 0,  topN: 6, defense: 0.5,  missChance: 0.4, patterns: false, smartCards: false, vcf: false },
  3:  { radius: 2, depth: 0, width: 0,  topN: 3, defense: 0.85, missChance: 0.1, patterns: false, smartCards: false, vcf: false },
  5:  { radius: 2, depth: 0, width: 0,  topN: 1, defense: 0.9,  missChance: 0,   patterns: true,  smartCards: true,  vcf: false },
  7:  { radius: 2, depth: 2, width: 12, topN: 1, defense: 1,    missChance: 0,   patterns: true,  smartCards: true,  vcf: false },
  10: { radius: 3, depth: 4, width: 10, topN: 1, defense: 1,    missChance: 0,   patterns: true,  smartCards: true,  vcf: true  },
  // 얼티밋: 시간 제한 안에서 최대한 깊이 읽음 (반복 심화 + 치환표 + 위협 가지치기 + 상대 VCF 차단)
  20: { radius: 2, depth: 12, width: 14, topN: 1, defense: 1,   missChance: 0,   patterns: true,  smartCards: true,  vcf: true, ultimate: true, timeMs: 2500 },
  // 슈퍼 울트라 짱짱맨: 얼티밋 + 수당 약 5초 + 상대의 연속 위협(VCT) 차단 + 상대 패 읽기
  // (VCT 공격은 봇끼리 대국에서 오히려 불리해 꺼 둠: 막는 수를 일부 놓쳐 이기지 못하는 공격을 걸게 됨)
  50: { radius: 2, depth: 14, width: 14, topN: 1, defense: 1,   missChance: 0,   patterns: true,  smartCards: true,  vcf: true, ultimate: true, vct: true, vctAttack: false,
        readCards: true,
        worker: true, timeMs: 8000, chainTimeMs: 3000, planMs: 6000, // A. 백그라운드 계산 + 긴 생각 시간
        book: true,   // B. 정석
        style: true,  // D. 흑=공격형, 백=수비형 (C. 카드+착수 계획은 worker 경로에서 사용)
        engine2: true, vct2: true, oppCardReplies: true, tradeRisk: true,
        chainPlan: true, chainRisk: true, tradeAttack: true, cardPlan2: true, draft2: true, cardPlan3: true, cardPlan4: true, cardPlan5: false, // cardPlan5(새 카드 수 읽기)는 측정에서 효과가 없어 꺼 둠 (23:25)
        shieldSmart: true, wallSmart: true },  // v2 엔진: 증분 평가·PVS/LMR, 빠짐없는 VCT, 상대 카드 대응 수 읽기
};
const BOT_LEVEL_LIST = [1, 3, 5, 7, 10, 20, 50];
let botLevel = 5;
try { const saved = parseInt(localStorage.getItem('omok_bot_level'), 10); if (BOT_LEVELS[saved]) botLevel = saved; } catch (e) {}
function botCfg() { return BOT_LEVELS[botLevel] || BOT_LEVELS[5]; }
function botLevelName(lv) { return lv === 20 ? t('bot.ultimate') : lv === 50 ? t('bot.super') : String(lv); }

let botTimer = null;
function scheduleMaybeBotTurn() {
  if (botTimer) return;
  botTimer = setTimeout(() => { botTimer = null; maybeBotTurn(); }, 650);
}

let botThinkingShown = false;
function maybeBotTurn() {
  if (mode !== 'bot' || gameOver || draftOpen || pendingTarget || alk || awaitingSide) return;
  const botColor = other(myColor);
  if (current !== botColor) return;
  // 얼티밋은 계산이 길어서, 먼저 '생각 중' 표시를 그린 뒤 계산
  if (botCfg().ultimate && !botThinkingShown) {
    statusText.textContent = t('bot.thinking');
    botThinkingShown = true;
    setTimeout(() => { maybeBotTurn(); botThinkingShown = false; }, 30);
    return;
  }
  if (cardAnimBusy) return;
  if (botLegendTry(botColor)) return;
  if (botCfg().worker) { botTurnWithEngine(botColor); return; }
  const proceed = () => {
    if (!gameOver && current === botColor && !draftOpen && !pendingTarget && !alk) botPlaceStone(botColor);
  };
  if (!usedCardThisTurn[botColor] && hand[botColor].length > 0) {
    // 카드를 쓰면 발동 연출이 끝난 뒤 효과 적용 → 이어서 착수
    const started = botCfg().smartCards ? botUseCardSmart(botColor, proceed) : (Math.random() < 0.5 && botUseCard(botColor, proceed));
    if (started) return;
  }
  proceed();
}

// ---- 저난이도: 무작위 카드 사용 ----
function botUseCard(botColor, after) {
  const opp = other(botColor);
  const usable = hand[botColor].map((c, i) => ({ c, i })).filter(({ c }) => {
    if (c.type === 'remove_enemy') return hasStoneOf(opp);
    if (c.type === 'self_remove' || c.type === 'windmill' || c.type === 'teleport') return hasStoneOf(botColor);
    if (c.type === 'trade') return hasTradablePair();
    if (c.type === 'trap') return hasEmptyCell();
    if (c.type === 'six_sense') return winLength !== 6;
    if (c.type === 'shield') return hasStoneOf(botColor);
    if (c.type === 'wall') return hasEmptyCell();
    if (c.type === 'meteor') return meteorTargets().length > 0;
    return true;
  });
  if (usable.length === 0) return false;
  const chosen = usable[Math.floor(Math.random() * usable.length)];
  return activateCard(botColor, chosen.i, () => {
    if (pendingTarget && pendingTarget.forPlayer === botColor) resolveBotPendingTarget();
    if (after) after();
  });
}

function resolveBotPendingTarget() {
  const t = pendingTarget;
  if (!t) return;
  let candidates = [];
  if (t.type === 'remove') {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === t.opponent && !isProtected(r, c)) candidates.push({ r, c });
  } else if (t.type === 'self_remove' || t.type === 'windmill' || t.type === 'teleport' || t.type === 'shield') {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === t.forPlayer) candidates.push({ r, c });
  } else if (t.type === 'trap' || t.type === 'wall') {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === EMPTY) candidates.push({ r, c });
  } else if (t.type === 'trade') {
    if (t.stage === 'first') {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (hasOppositeNeighbor(r, c) && !(board[r][c] !== t.forPlayer && isProtected(r, c))) candidates.push({ r, c });
    } else {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (isValidTradeSecond(t.firstPos, r, c) && !(board[r][c] !== t.forPlayer && isProtected(r, c)) && !swapMakesLine(t.firstPos.r, t.firstPos.c, r, c)) candidates.push({ r, c });
    }
  }
  if (candidates.length === 0) { cancelTarget(); return; }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  handleTargetClick(pick);
  if (pendingTarget && pendingTarget.type === 'trade' && pendingTarget.stage === 'second') {
    resolveBotPendingTarget();
  }
}

// ---- 공통 보조 함수 ----
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
function inBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

// player가 둘 수 없는 칸 (상대 풍차 주변) 표시
function buildBlockedGrid(player) {
  const g = new Uint8Array(SIZE * SIZE);
  for (const cr of craterList) g[cr.r * SIZE + cr.c] = 1;
  for (let i = 0; i < SIZE * SIZE; i++) if (board[(i / SIZE) | 0][i % SIZE] === WALL) g[i] = 1; // 장벽은 아무도 못 씀
  for (const w of windmillList) {
    if (!isStone(board[w.r][w.c]) || board[w.r][w.c] === player) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = w.r + dr, c = w.c + dc;
      if (inBoard(r, c)) g[r * SIZE + c] = 1;
    }
  }
  return g;
}
function makeBlocked() { return { [BLACK]: buildBlockedGrid(BLACK), [WHITE]: buildBlockedGrid(WHITE) }; }

function collectCandidates(player, radius, blocked, respectChain) {
  radius = radius || 2;
  let any = false;
  for (let r = 0; r < SIZE && !any; r++) for (let c = 0; c < SIZE; c++) if (isStone(board[r][c])) { any = true; break; }
  const chainActive = respectChain !== false && turnPlacementsDone > 0 && turnPlacedPositions.length > 0;
  const isBlocked = (r, c) => blocked ? blocked[player][r * SIZE + c] : isBlockedForPlayer(r, c, player);
  function farEnough(r, c) {
    if (!chainActive) return true;
    return !turnPlacedPositions.some(p => Math.max(Math.abs(r - p.r), Math.abs(c - p.c)) <= 2);
  }
  if (!any) return [{ r: 7, c: 7 }];
  const cands = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== EMPTY || isBlocked(r, c)) continue;
    if (!farEnough(r, c)) continue;
    let near = false;
    for (let dr = -radius; dr <= radius && !near; dr++) for (let dc = -radius; dc <= radius && !near; dc++) {
      const nr = r + dr, nc = c + dc;
      if (inBoard(nr, nc) && isStone(board[nr][nc])) near = true;
    }
    if (near) cands.push({ r, c });
  }
  if (cands.length) return cands;
  const fallback = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] === EMPTY && !isBlocked(r, c) && farEnough(r, c)) fallback.push({ r, c });
  }
  return fallback;
}

// ---- 저난이도용 단순 평가: 연속으로 붙은 돌만 셈 ----
function lineScore(r, c, dr, dc, player) {
  let count = 1, openEnds = 0;
  let rr = r + dr, cc = c + dc;
  while (inBoard(rr, cc) && board[rr][cc] === player) { count++; rr += dr; cc += dc; }
  if (inBoard(rr, cc) && board[rr][cc] === EMPTY) openEnds++;
  rr = r - dr; cc = c - dc;
  while (inBoard(rr, cc) && board[rr][cc] === player) { count++; rr -= dr; cc -= dc; }
  if (inBoard(rr, cc) && board[rr][cc] === EMPTY) openEnds++;

  if (count >= winLength) return 10000000;
  const gap = winLength - count;
  if (gap === 1) return openEnds === 2 ? 500000 : openEnds === 1 ? 50000 : 0;
  if (gap === 2) return openEnds === 2 ? 5000 : openEnds === 1 ? 500 : 0;
  if (gap === 3) return openEnds === 2 ? 200 : openEnds === 1 ? 50 : 0;
  return count * 2 + openEnds;
}

function simpleCellScore(r, c, player, defense) {
  const opp = other(player);
  board[r][c] = player;
  let offense = 0;
  for (const [dr, dc] of DIRS) offense = Math.max(offense, lineScore(r, c, dr, dc, player));
  board[r][c] = opp;
  let def = 0;
  for (const [dr, dc] of DIRS) def = Math.max(def, lineScore(r, c, dr, dc, opp));
  board[r][c] = EMPTY;
  return offense + def * defense;
}

// ---- 패턴 인식: 한 방향으로 winLength 칸짜리 창(window)을 밀면서 모양을 판단 ----
// board[r][c]에 player 돌이 놓였다고 가정하고 호출
// (이미 둔 돌에 더해) idx에 player를 두면 정확히 N개가 되는지 — 장목이 되는 4는 위협이 아님
function realFiveAt(idx, player) {
  const r = (idx / SIZE) | 0, c = idx % SIZE;
  board[r][c] = player; const ok = !!checkWin(r, c, player); board[r][c] = EMPTY;
  return ok;
}
function lineShape(r, c, dr, dc, player, blk) {
  const L = winLength;
  let best = 0, winCell = -1, winCells = 0, near = 0;
  for (let s = -(L - 1); s <= 0; s++) {
    let n = 0, ok = true, empty = -1;
    for (let k = 0; k < L; k++) {
      const rr = r + (s + k) * dr, cc = c + (s + k) * dc;
      if (!inBoard(rr, cc)) { ok = false; break; }
      const v = board[rr][cc];
      if (v === player) n++;
      else if (v === EMPTY && !blk[rr * SIZE + cc]) empty = rr * SIZE + cc;
      else { ok = false; break; }
    }
    if (!ok) continue;
    if (n > best) best = n;
    if (n === L - 1 && empty !== winCell && realFiveAt(empty, player)) { if (winCell === -1 || winCells < 2) winCells++; winCell = empty; }
    if (n === L - 2) near++;
  }
  return { best, winCells, near };
}

const P_FIVE = 10000000, P_OPEN4 = 1000000, P_FOUR = 100000, P_OPEN3 = 10000, P_THREE = 1000, P_OPEN2 = 300, P_TWO = 50;

// player가 (r,c)에 두었을 때의 공격 가치
function attackValue(r, c, player, blk) {
  const L = winLength;
  board[r][c] = player;
  let score = 0, fours = 0, open3 = 0, five = false;
  for (const [dr, dc] of DIRS) {
    const s = lineShape(r, c, dr, dc, player, blk);
    if (s.best >= L) { if (checkWin(r, c, player)) { five = true; break; } continue; } // 장목은 승리 아님
    if (s.winCells >= 2) { score += P_OPEN4; fours += 2; }
    else if (s.winCells === 1) { score += P_FOUR; fours++; }
    else if (s.best === L - 2) { if (s.near >= 2) { score += P_OPEN3; open3++; } else score += P_THREE; }
    else if (s.best === L - 3) score += s.near >= 1 ? P_OPEN2 : P_TWO;
    else score += s.best;
  }
  board[r][c] = EMPTY;
  if (five) return { score: P_FIVE, five: true, fours: 0 };
  if (fours >= 2 || (fours >= 1 && open3 >= 1)) score += P_OPEN4 / 2; // 4-4, 4-3: 사실상 필승
  else if (open3 >= 2) score += P_OPEN3 * 5;                           // 3-3
  return { score, five: false, fours };
}

function patternCellScore(r, c, player, blocked, defense) {
  const opp = other(player);
  const a = attackValue(r, c, player, blocked[player]);
  const d = blocked[opp][r * SIZE + c] ? { score: 0, five: false } : attackValue(r, c, opp, blocked[opp]);
  return { score: a.score + d.score * defense, win: a.five, mustBlock: d.five, fours: a.fours };
}

// ---- 판 전체 평가 (탐색의 말단에서 사용) ----
function windowWeight(n) {
  const g = winLength - n;
  return g <= 0 ? 10000000 : g === 1 ? 800 : g === 2 ? 70 : g === 3 ? 8 : g === 4 ? 1 : 0;
}
function evalBoard(me, blocked) {
  const opp = other(me), L = winLength;
  let sMe = 0, sOpp = 0;
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const er = r + (L - 1) * dr, ec = c + (L - 1) * dc;
      if (!inBoard(er, ec)) continue;
      let nMe = 0, nOpp = 0, bMe = false, bOpp = false;
      for (let k = 0; k < L; k++) {
        const rr = r + k * dr, cc = c + k * dc, v = board[rr][cc];
        if (v === me) nMe++;
        else if (v === opp) nOpp++;
        else { const i = rr * SIZE + cc; if (blocked[me][i]) bMe = true; if (blocked[opp][i]) bOpp = true; }
      }
      if (nOpp === 0 && nMe > 0 && !bMe) sMe += windowWeight(nMe);
      if (nMe === 0 && nOpp > 0 && !bOpp) sOpp += windowWeight(nOpp);
    }
  }
  if (uStyle && uBot) {
    // 짱짱맨 스타일: 봇 형세·상대 형세 가중치를 따로 (흑=공격형, 백=수비형)
    const sBot = me === uBot ? sMe : sOpp, sHum = me === uBot ? sOpp : sMe;
    const v = uStyle.a * sBot - uStyle.b * sHum;
    return me === uBot ? v : -v;
  }
  return sMe - sOpp * 1.1;
}

// ---- 수 읽기 (알파-베타 탐색) ----
const WIN_SCORE = 1e9;
let searchDeadline = 0;

function orderedMoves(player, blocked, cfg, width, isRoot) {
  const cands = collectCandidates(player, cfg.radius, blocked, isRoot);
  const scored = [];
  let blocks = [];
  for (const p of cands) {
    const s = patternCellScore(p.r, p.c, player, blocked, cfg.defense);
    if (s.win) return { win: p, list: [p] };
    if (s.mustBlock) blocks.push({ r: p.r, c: p.c, score: s.score });
    scored.push({ r: p.r, c: p.c, score: s.score });
  }
  // 상대가 다음 수에 이기는 자리가 있으면 그 자리를 막는 수만 검토
  const list = blocks.length ? blocks : scored;
  list.sort((a, b) => b.score - a.score);
  return { win: null, list: width ? list.slice(0, width) : list, forced: blocks.length > 0 };
}

function negamax(player, depth, alpha, beta, blocked, cfg) {
  const moves = orderedMoves(player, blocked, cfg, cfg.width, false);
  if (moves.win) return WIN_SCORE + depth;
  if (!moves.list.length) return 0;
  if (depth <= 0 || Date.now() > searchDeadline) return evalBoard(player, blocked);
  const opp = other(player);
  let best = -Infinity;
  for (const m of moves.list) {
    board[m.r][m.c] = player;
    const v = -negamax(opp, depth - 1, -beta, -alpha, blocked, cfg);
    board[m.r][m.c] = EMPTY;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// ---- 연속 4(VCF) 탐색: 계속 4를 만들어 상대가 막을 수밖에 없게 몰아 이기는 수순 ----
function findWinCells(player, blk) {
  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== EMPTY || blk[r * SIZE + c]) continue;
    board[r][c] = player;
    const w = checkWin(r, c, player);
    board[r][c] = EMPTY;
    if (w) cells.push({ r, c });
  }
  return cells;
}

function vcf(player, depth, blocked, isRoot) {
  if (depth <= 0 || Date.now() > searchDeadline) return null;
  const opp = other(player);
  if (findWinCells(opp, blocked[opp]).length) return null; // 상대가 먼저 이길 수 있으면 불가
  const cands = collectCandidates(player, 2, blocked, !!isRoot);
  for (const p of cands) {
    const a = attackValue(p.r, p.c, player, blocked[player]);
    if (a.five) return p;
    if (a.fours < 1) continue;
    board[p.r][p.c] = player;
    const wins = findWinCells(player, blocked[player]);
    let ok = false;
    if (wins.length >= 2) ok = true;
    else if (wins.length === 1) {
      const w = wins[0];
      if (!blocked[opp][w.r * SIZE + w.c]) {
        board[w.r][w.c] = opp;
        ok = !checkWin(w.r, w.c, opp) && vcf(player, depth - 1, blocked) !== null;
        board[w.r][w.c] = EMPTY;
      } else ok = true; // 상대가 막을 수 없는 자리
    }
    board[p.r][p.c] = EMPTY;
    if (ok) return p;
  }
  return null;
}


// ---- 얼티밋: 반복 심화 + 치환표 + 위협 가지치기 + 양쪽 VCF 확인 ----
const ZOB = (() => {
  const r32 = () => (Math.random() * 4294967296) >>> 0;
  const z = { [BLACK]: [], [WHITE]: [] };
  for (let i = 0; i < SIZE * SIZE; i++) { z[BLACK].push([r32(), r32() & 0x7FFFF]); z[WHITE].push([r32(), r32() & 0x7FFFF]); }
  return z;
})();
const U_WIDTHS = [14, 10, 8, 7, 6, 5, 5, 4, 4, 4, 4, 4];
let uWidths = U_WIDTHS;
// 상대 패 읽기 (짱짱맨): 탐색에 반영할 보정값
let uDefense = 0.95, uBot = null, uFlipRisk = false, uStyle = null, uLastDepth = 0; // uLastDepth: 마지막으로 끝까지 읽은 깊이 (측정용)

// 상대가 다음 턴에 쓸 수 있는 카드 (봉쇄에 걸려 있으면 다음 카드는 무효이므로 없는 것으로 봄)
function readOppCards(botColor) {
  const opp = other(botColor);
  const has = {};
  const locked = cardLockNextTurn && cardLockNextTurn[opp];
  if (!locked) for (const c of (hand && hand[opp]) || []) has[c.id] = true;
  return has;
}
let uTT = new Map(), uAborted = false, uNodes = 0;

function uHashBoard() {
  let h1 = 0, h2 = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const v = board[r][c];
    if (isStone(v)) { const z = ZOB[v][r * SIZE + c]; h1 ^= z[0]; h2 ^= z[1]; }
  }
  return [h1 >>> 0, h2];
}
function uKey(h, player) { return ((h[0] * 524288 + h[1]) * 2) + (player === BLACK ? 0 : 1); }
function uPlace(h, r, c, player) { const z = ZOB[player][r * SIZE + c]; return [(h[0] ^ z[0]) >>> 0, h[1] ^ z[1]]; }

// 후보 정렬 + 위협 가지치기: 상대가 이기는 자리 → 그 자리만, 상대가 열린 4를 만들 자리 → 막는 수·내 4만
function uOrdered(player, blocked, width, isRoot) {
  const opp = other(player);
  const cands = collectCandidates(player, 2, blocked, isRoot);
  const all = [], blocks = [], critical = [];
  for (const p of cands) {
    const i = p.r * SIZE + p.c;
    const a = attackValue(p.r, p.c, player, blocked[player]);
    if (a.five) return { win: p, list: [p] };
    const d = blocked[opp][i] ? { score: 0, five: false } : attackValue(p.r, p.c, opp, blocked[opp]);
    const m = { r: p.r, c: p.c, score: a.score + d.score * uDefense };
    all.push(m);
    if (d.five) blocks.push(m);
    else if (d.score >= P_OPEN4 || a.fours >= 1) critical.push(m);
  }
  let list = all, forced = false;
  if (blocks.length) { list = blocks; forced = true; }
  else if (critical.length && critical.some(m => m.score >= P_OPEN4 * 0.9)) list = critical;
  list.sort((a, b) => b.score - a.score);
  return { win: null, list: width ? list.slice(0, width) : list, forced };
}

function uSearch(player, depth, alpha, beta, blocked, h, ply) {
  if ((++uNodes & 255) === 0 && Date.now() > searchDeadline) uAborted = true;
  if (uAborted) return 0;
  const key = uKey(h, player);
  const e = uTT.get(key);
  const alpha0 = alpha;
  if (e && e.depth >= depth) {
    if (e.flag === 0) return e.value;
    if (e.flag === 1 && e.value > alpha) alpha = e.value;
    else if (e.flag === 2 && e.value < beta) beta = e.value;
    if (alpha >= beta) return e.value;
  }
  const moves = uOrdered(player, blocked, uWidths[Math.min(ply, uWidths.length - 1)], false);
  if (moves.win) return WIN_SCORE - ply;
  if (!moves.list.length) return 0;
  if (depth <= 0) {
    let v = evalBoard(player, blocked);
    // 상대가 전세 역전을 쥐고 있으면, 봇 쪽 우세는 뒤집힐 수 있으므로 할인
    if (uFlipRisk) { const vb = player === uBot ? v : -v; const adj = vb > 0 ? vb * 0.35 : vb; v = player === uBot ? adj : -adj; }
    return v;
  }
  if (e && e.best !== undefined) {
    const bi = moves.list.findIndex(m => m.r * SIZE + m.c === e.best);
    if (bi > 0) moves.list.unshift(moves.list.splice(bi, 1)[0]);
  }
  const opp = other(player);
  let best = -Infinity, bestIdx;
  for (const m of moves.list) {
    board[m.r][m.c] = player;
    const v = -uSearch(opp, depth - 1, -beta, -alpha, blocked, uPlace(h, m.r, m.c, player), ply + 1);
    board[m.r][m.c] = EMPTY;
    if (uAborted) return 0;
    if (v > best) { best = v; bestIdx = m.r * SIZE + m.c; }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  uTT.set(key, { depth, value: best, flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0, best: bestIdx });
  return best;
}


// ---- 연속 위협(VCT) 탐색: 4 또는 열린 3을 계속 만들어, 상대가 어떻게 막아도 이기는 수순 ----
// 상대가 막는 도중 자기 4를 만들면(반격) 실패로 보는 보수적 탐색
function vct(att, depth, blocked, isRoot, deadline) {
  if (depth <= 0 || Date.now() > deadline) return null;
  const def = other(att);
  if (findWinCells(def, blocked[def]).length) return null;
  const threats = [];
  for (const p of collectCandidates(att, 2, blocked, isRoot)) {
    const a = attackValue(p.r, p.c, att, blocked[att]);
    if (a.five) return p;
    if (a.fours >= 1 || a.score >= P_OPEN3) threats.push({ p, s: a.score });
  }
  threats.sort((x, y) => y.s - x.s);
  for (const t of threats.slice(0, 10)) {
    board[t.p.r][t.p.c] = att;
    const ok = vctDefend(att, depth, blocked, deadline);
    board[t.p.r][t.p.c] = EMPTY;
    if (ok) return t.p;
    if (Date.now() > deadline) return null;
  }
  return null;
}

function vctDefend(att, depth, blocked, deadline) {
  const def = other(att);
  const attWins = findWinCells(att, blocked[att]);
  if (findWinCells(def, blocked[def]).length) return false;
  if (attWins.length >= 2) return true;
  let defenses;
  if (attWins.length === 1) {
    const w = attWins[0];
    if (blocked[def][w.r * SIZE + w.c]) return true; // 막을 수 없는 자리
    defenses = [w];
  } else {
    // 열린 3: 공격자가 열린 4를 만들 자리 + 수비자가 4로 반격할 자리
    defenses = [];
    for (const p of collectCandidates(def, 2, blocked, false)) {
      const a = attackValue(p.r, p.c, att, blocked[att]);
      const d = attackValue(p.r, p.c, def, blocked[def]);
      if (a.score >= P_OPEN4 || d.fours >= 1) defenses.push({ r: p.r, c: p.c, s: a.score + d.score });
    }
    if (!defenses.length) return false; // 실질적인 위협이 아님
    defenses.sort((x, y) => y.s - x.s);
    defenses = defenses.slice(0, 8);
  }
  for (const d of defenses) {
    board[d.r][d.c] = def;
    const lost = checkWin(d.r, d.c, def);
    const cont = !lost && vct(att, depth - 1, blocked, false, deadline) !== null;
    board[d.r][d.c] = EMPTY;
    if (!cont) return false;
  }
  return true;
}

function ultimateChooseMove(botColor, blocked, budgetMs, cfg) {
  const opp = other(botColor);
  // 연속 착수가 있으면 상대 위협을 더 무겁게, 전세 역전이 있으면 우세를 과신하지 않음, 폭파가 있으면 몰아치기를 믿지 않음
  const { trustForcing } = uSetupFor(botColor, cfg);
  if (cfg && cfg.readCards) {
    // 상대가 설치한 함정 칸에는 두지 않음
    for (const tr of trapList || []) if (tr.owner === opp && board[tr.r][tr.c] === EMPTY) blocked[botColor][tr.r * SIZE + tr.c] = 1;
  }
  if (cfg && cfg.book && turnPlacementsDone === 0) {
    const bm = openingBookMove(botColor, blocked);
    if (bm) return bm;
  }
  searchDeadline = Date.now() + budgetMs;
  const root = uOrdered(botColor, blocked, 0, true);
  if (root.win) return root.win;
  if (!root.list.length) return null;
  if (root.forced && root.list.length === 1) return root.list[0];

  if (!root.forced && trustForcing) {
    const v = vcf(botColor, 14, blocked, true);
    if (v) return v;
  }
  // 짱짱맨: 열린 3까지 섞은 연속 공격으로 이기는 수순
  if (cfg && cfg.vct && cfg.vctAttack !== false && !root.forced && trustForcing) {
    const v = vct(botColor, 6, blocked, true, Date.now() + budgetMs * 0.2);
    if (v) return v;
  }

  let moves = root.list.slice(0, (cfg && cfg.rootWidth) || 16);
  // 상대에게 연속 4로 이기는 수순이 있으면, 그걸 끊는 수만 남긴다
  if (!root.forced && vcf(opp, 12, blocked, false)) {
    const safe = moves.filter(m => {
      board[m.r][m.c] = botColor;
      const threat = vcf(opp, 12, blocked, false);
      board[m.r][m.c] = EMPTY;
      return !threat;
    });
    if (safe.length) moves = safe;
  }
  // 짱짱맨: 상대의 연속 위협(VCT) 수순도 미리 끊는다
  if (cfg && cfg.vct && cfg.vctDefend !== false && !root.forced && moves.length > 1) {
    const dl = Date.now() + budgetMs * 0.2;
    if (vct(opp, 5, blocked, false, dl)) {
      const safe = moves.filter(m => {
        if (Date.now() > dl) return true;
        board[m.r][m.c] = botColor;
        const threat = vct(opp, 5, blocked, false, dl);
        board[m.r][m.c] = EMPTY;
        return !threat;
      });
      if (safe.length) moves = safe;
    }
  }
  if (moves.length === 1) return moves[0];

  uTT = new Map(); uAborted = false; uNodes = 0;
  const h0 = uHashBoard();
  let bestMove = moves[0];
  for (let depth = 2; depth <= 12; depth++) {
    let iterBest = null, iterVal = -Infinity, alpha = -Infinity;
    // 직전 반복의 최선 수를 먼저 탐색
    const ordered = [bestMove].concat(moves.filter(m => m !== bestMove));
    for (const m of ordered) {
      board[m.r][m.c] = botColor;
      const v = -uSearch(opp, depth - 1, -Infinity, -alpha, blocked, uPlace(h0, m.r, m.c, botColor), 1) + m.score * 1e-7;
      board[m.r][m.c] = EMPTY;
      if (uAborted) break;
      if (v > iterVal) { iterVal = v; iterBest = m; }
      if (v > alpha) alpha = v;
    }
    if (uAborted) { if (iterBest && iterVal > -WIN_SCORE / 2 && iterBest === ordered[0]) bestMove = iterBest; break; }
    bestMove = iterBest || bestMove;
    uLastDepth = depth;
    if (iterVal >= WIN_SCORE / 2) break; // 이기는 수순을 찾음
    if (Date.now() > searchDeadline - budgetMs * 0.45) break; // 다음 깊이를 끝낼 시간이 부족
  }
  return bestMove;
}
