// 슈퍼 울트라 짱짱맨: 카드 계획·백그라운드 계산 · 엔진 v2
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

// ================= 슈퍼 울트라 짱짱맨 전용 =================
// 공통 탐색 설정: 상대 패 읽기·흑백 스타일을 전역 탐색 변수에 반영
function uSetupFor(botColor, cfg) {
  uWidths = (cfg && cfg.widths) || U_WIDTHS;
  const oppCards = cfg && cfg.readCards ? readOppCards(botColor) : {};
  uBot = botColor;
  uDefense = oppCards.chain ? 1.35 : 0.95;
  uFlipRisk = !!oppCards.reversal;
  // D. 흑이면 공격적으로(내 형세 가중), 백이면 수비적으로(상대 형세 가중)
  uStyle = cfg && cfg.style ? (botColor === BLACK ? { a: 1.2, b: 1.0 } : { a: 1.0, b: 1.25 }) : null;
  return { oppCards, trustForcing: !oppCards.bomb };
}

// B. 정석: 첫 몇 수는 알려진 강한 오프닝으로 (화월/포월 계열)
function openingBookMove(bot, blocked) {
  const stones = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (isStone(board[r][c])) stones.push({ r, c, v: board[r][c] });
  const C = (SIZE - 1) / 2;
  const ok = (p) => p && inBoard(p.r, p.c) && board[p.r][p.c] === EMPTY && !blocked[bot][p.r * SIZE + p.c];
  if (stones.length === 0) { const p = { r: C, c: C }; return ok(p) ? p : null; }
  if (stones.length === 1 && bot === WHITE && stones[0].v === BLACK) {
    // 백 첫 수: 흑 돌에 대각선으로 붙이는 간접 응수 (중앙 쪽 우선)
    const s = stones[0];
    const opts = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dr, dc]) => ({ r: s.r + dr, c: s.c + dc }))
      .filter(ok).sort((a, b) => (Math.abs(a.r - C) + Math.abs(a.c - C)) - (Math.abs(b.r - C) + Math.abs(b.c - C)));
    return opts[0] || null;
  }
  if (stones.length === 2 && bot === BLACK) {
    const b = stones.find(s => s.v === BLACK), w = stones.find(s => s.v === WHITE);
    if (!b || !w) return null;
    const dr = w.r - b.r, dc = w.c - b.c;
    if (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) return null;
    let opts;
    if (dr === 0 || dc === 0) {
      // 직접 응수 → 화월: 흑의 대각선이면서 백과 붙은 자리
      opts = dr === 0 ? [{ r: b.r - 1, c: b.c + dc }, { r: b.r + 1, c: b.c + dc }] : [{ r: b.r + dr, c: b.c - 1 }, { r: b.r + dr, c: b.c + 1 }];
    } else {
      // 간접 응수 → 포월: 흑과 붙고 백과도 붙은 자리
      opts = [{ r: b.r + dr, c: b.c }, { r: b.r, c: b.c + dc }];
    }
    opts = opts.filter(ok).sort((p, q) => (Math.abs(p.r - C) + Math.abs(p.c - C)) - (Math.abs(q.r - C) + Math.abs(q.c - C)));
    return opts[0] || null;
  }
  return null;
}

function scanFiveWinner() {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const v = board[r][c];
    if (isStone(v) && checkWin(r, c, v)) return v;
  }
  return 0;
}

// player 차례인 국면의 가치 (player 관점, 반복 심화)
function uBestValue(player, blocked, budgetMs) {
  searchDeadline = Date.now() + budgetMs;
  uTT = new Map(); uAborted = false; uNodes = 0;
  const opp = other(player);
  const root = uOrdered(player, blocked, 0, false);
  if (root.win) return WIN_SCORE;
  if (!root.list.length) return 0;
  const moves = root.list.slice(0, 12);
  const h0 = uHashBoard();
  let best = evalBoard(player, blocked);
  for (let depth = 2; depth <= 10; depth++) {
    let iterVal = -Infinity, alpha = -Infinity;
    for (const m of moves) {
      board[m.r][m.c] = player;
      const v = -uSearch(opp, depth - 1, -Infinity, -alpha, blocked, uPlace(h0, m.r, m.c, player), 1);
      board[m.r][m.c] = EMPTY;
      if (uAborted) break;
      if (v > iterVal) iterVal = v;
      if (v > alpha) alpha = v;
    }
    if (uAborted) break;
    best = iterVal;
    if (Math.abs(iterVal) >= WIN_SCORE / 2) break;
    if (Date.now() > searchDeadline - budgetMs * 0.45) break;
  }
  return best;
}

// C. 카드 + 착수 동시 계획: "이 카드를 이 대상에 쓰고 두는 것"과 "그냥 두는 것"을 수 읽기로 비교
function planCardsSearch(bot, cfg, budgetMs) {
  const t0 = Date.now();
  uSetupFor(bot, cfg);
  const opp = other(bot);
  const snap = { board: board.map(r => r.slice()), windmillList: windmillList.slice(), craterList: craterList.map(c => Object.assign({}, c)), winLength, trapList: (trapList || []).slice() };
  const restore = () => {
    board = snap.board.map(r => r.slice());
    windmillList = snap.windmillList.slice();
    craterList = snap.craterList.map(c => Object.assign({}, c));
    winLength = snap.winLength;
    trapList = snap.trapList.slice();
  };
  const blocked0 = makeBlocked();
  const v2 = !!(cfg && cfg.cardPlan2);
  // 판 가치 계산: v2는 짱짱맨 v2 엔진(증분 평가·PVS), 아니면 기존 얼티밋 엔진
  if (v2) { e2Killers = []; e2Hist = { [BLACK]: new Int32Array(SIZE * SIZE), [WHITE]: new Int32Array(SIZE * SIZE) }; }
  const v3 = !!(cfg && cfg.cardPlan3);
  // v3: 함정 칸은 함정 주인의 상대가 쓸 수 없는 칸으로 계산 (두면 돌이 사라짐)
  const withTraps = (blk) => { if (v3) for (const tr of trapList || []) if (board[tr.r][tr.c] === EMPTY) blk[other(tr.owner)][tr.r * SIZE + tr.c] = 1; return blk; };
  const bestValue = (p, blk, ms) => { if (!v2) return uBestValue(p, blk, ms); e2Init(withTraps(blk)); return e2BestValue(p, ms); };
  // v4: 상대가 쥔 맞교환·연속 착수 한 장에 바로 지는 모양이면 그 결과는 사실상 패
  const v4 = !!(cfg && cfg.cardPlan4);
  const v5 = !!(cfg && cfg.cardPlan5);
  const oc4 = v4 ? readOppCards(bot) : {};
  const riskNow = () => {
    if (!v4 || !(oc4.trade || oc4.chain)) return 0;
    e2Init(withTraps(makeBlocked()));
    return ((oc4.trade && e2TradeRisk(bot)) || (oc4.chain && e2ChainRisk(bot))) ? WIN_SCORE / 2 : 0;
  };
  // v4: 필승 수순(VCT) 유무 — 식스센스가 상대 수순을 끊는지/내 수순을 끊는지
  const vctNow = (p) => { e2Init(withTraps(makeBlocked())); return !!e2Vct(p, 6, Date.now() + 120, null); };
  const six5 = v4 && winLength === 5 && (hand[bot] || []).some(c => c.type === 'six_sense') ? { opp: vctNow(opp), me: vctNow(bot) } : null;
  const options = [];
  (hand[bot] || []).forEach((card, idx) => {
    if (card.type === 'remove_enemy') {
      // v3: 돌을 없앤 뒤 막힌 칸(풍차 효과)까지 다시 계산해서 순위, 상대 풍차 돌은 항상 후보
      const isMill = (s) => windmillList.some(w => w.r === s.r && w.c === s.c);
      let ranked = listStones(opp).filter(s => !isProtected(s.r, s.c)).map(s => {
        board[s.r][s.c] = EMPTY; const g = evalBoard(bot, v3 ? makeBlocked() : blocked0); board[s.r][s.c] = opp; return { s, g };
      }).sort((a, b) => b.g - a.g).slice(0, v2 ? 6 : 4);
      if (v3) for (const s of listStones(opp)) if (isMill(s) && !isProtected(s.r, s.c) && !ranked.some(x => x.s.r === s.r && x.s.c === s.c)) ranked.push({ s });
      for (const { s } of ranked) options.push({ idx, cardId: card.id, targets: [s], endsTurn: false,
        apply: () => { board[s.r][s.c] = EMPTY; windmillList = windmillList.filter(w => !(w.r === s.r && w.c === s.c)); craterList.push({ r: s.r, c: s.c, turns: 2, fresh: true }); } });
    } else if (card.type === 'windmill') {
      const ranked = listStones(bot).filter(s => !windmillList.some(w => w.r === s.r && w.c === s.c)).map(s => {
        let g = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const r = s.r + dr, c = s.c + dc;
          if ((!dr && !dc) || !inBoard(r, c) || board[r][c] !== EMPTY || blocked0[opp][r * SIZE + c]) continue;
          g += Math.min(attackValue(r, c, opp, blocked0[opp]).score, P_OPEN4);
          // v3: 공격용 — 내 공격 자리 둘레에 풍차를 세우면 상대가 그 자리를 막지 못함
          if (v3) g += Math.min(attackValue(r, c, bot, blocked0[bot]).score, P_OPEN4);
        }
        return { s, g };
      }).filter(x => x.g > 0).sort((a, b) => b.g - a.g).slice(0, v3 ? 6 : 3);
      for (const { s } of ranked) options.push({ idx, cardId: card.id, targets: [s], endsTurn: false, apply: () => { windmillList.push({ r: s.r, c: s.c }); } });
    } else if (card.type === 'six_sense' && winLength === 5) {
      options.push({ idx, cardId: card.id, targets: [], endsTurn: false, apply: () => { winLength = 6; } });
    } else if (card.type === 'trade') {
      const pairs = [];
      for (const a of listStones(opp)) for (const b of listStones(bot)) {
        if (!isOrthoAdjacent(a, b) || isProtected(a.r, a.c) || swapMakesLine(a.r, a.c, b.r, b.c)) continue;
        board[a.r][a.c] = bot; board[b.r][b.c] = opp;
        const g = evalBoard(bot, blocked0);
        board[a.r][a.c] = opp; board[b.r][b.c] = bot;
        pairs.push({ a, b, g });
      }
      pairs.sort((x, y) => y.g - x.g);
      for (const { a, b } of pairs.slice(0, v2 ? 6 : 4)) options.push({ idx, cardId: card.id, targets: [a, b], endsTurn: true,
        apply: () => { board[a.r][a.c] = bot; board[b.r][b.c] = opp; } });
    } else if (v2 && card.type === 'infection') {
      // 감염: 맞닿은 상대 돌 중 무작위 2개 → 가능한 쌍 몇 가지의 평균 가치 (5목이 되는 전향은 규칙상 제외)
      const ts = getOrthogonalEnemyNeighbors(bot).filter(t => { board[t.r][t.c] = bot; const w = checkWin(t.r, t.c, bot); board[t.r][t.c] = opp; return !w; });
      if (ts.length) {
        const all = [];
        if (ts.length === 1) all.push([ts[0]]);
        else for (let a = 0; a < ts.length; a++) for (let b = a + 1; b < ts.length; b++) all.push([ts[a], ts[b]]);
        const step = Math.max(1, all.length / 6), combos = [];
        for (let k = 0; k < all.length && combos.length < 6; k += step) combos.push(all[Math.floor(k)]); // 고르게 표본
        options.push({ idx, cardId: card.id, targets: [], endsTurn: true, combos });
      }
    } else if (v3 && card.type === 'trap') {
      // 함정: 내가 다음 수로 4를 만들 때 상대가 막아야 하는 자리에 미리 깔면 그 4는 막을 수 없음 (+ 상대 급소 몇 곳)
      e2Init(withTraps(makeBlocked()));
      const spots = new Set();
      for (const q of collectCandidates(bot, 2, blocked0, false)) {
        const i = q.r * SIZE + q.c;
        if (e2Attack(i, bot).fours < 1) continue;
        e2Place(i, bot); for (const x of e2WinCells(bot)) spots.add(x); e2Remove(i, bot);
      }
      collectCandidates(opp, 2, blocked0, false).map(q => ({ i: q.r * SIZE + q.c, s: e2Attack(q.r * SIZE + q.c, opp).score }))
        .sort((a, b) => b.s - a.s).slice(0, 3).forEach(x => spots.add(x.i));
      for (const i of Array.from(spots).slice(0, 8)) {
        const p = { r: (i / SIZE) | 0, c: i % SIZE };
        if (board[p.r][p.c] !== EMPTY || (trapList || []).some(t => t.r === p.r && t.c === p.c)) continue;
        options.push({ idx, cardId: card.id, targets: [p], endsTurn: false, apply: () => { trapList.push({ r: p.r, c: p.c, owner: bot }); } });
      }
    } else if (v4 && card.type === 'teleport') {
      // 순간이동: 상대 카드 한 장에 지는 쌍에 걸린 내 돌을 빼냄 (도착 칸은 무작위라 무시) + 가장 쓸모없는 돌
      e2Init(withTraps(makeBlocked()));
      const r0 = e2TradeRisk(bot) + e2ChainRisk(bot);
      const scored = listStones(bot).filter(st => !windmillList.some(w => w.r === st.r && w.c === st.c)).map(st => {
        const i = st.r * SIZE + st.c; e2Remove(i, bot);
        const risk = e2TradeRisk(bot) + e2ChainRisk(bot), val = e2Eval(bot);
        e2Place(i, bot);
        return { st, fix: r0 - risk, val };
      });
      const picks = scored.filter(x => x.fix > 0).slice(0, 4).concat(scored.sort((a, b) => b.val - a.val).slice(0, 1));
      for (const { st } of picks) options.push({ idx, cardId: card.id, targets: [st], endsTurn: false, apply: () => { board[st.r][st.c] = EMPTY; } });
    } else if (v4 && card.type === 'earthquake') {
      options.push({ idx, cardId: card.id, targets: [], endsTurn: false, quake: 4 });
    } else if (v5 && card.type === 'wall') {
      // 장벽: 상대가 바로 이기는 칸·상대 급소에 세워 보고 결과 판 비교
      const spots = new Map();
      for (const w of findWinCells(opp, blocked0[opp])) spots.set(w.r * SIZE + w.c, w);
      collectCandidates(opp, 2, blocked0, false).map(q => ({ q, s: attackValue(q.r, q.c, opp, blocked0[opp]).score }))
        .sort((a, b) => b.s - a.s).slice(0, 4).forEach(x => spots.set(x.q.r * SIZE + x.q.c, x.q));
      for (const p of Array.from(spots.values()).slice(0, 6)) {
        if (board[p.r][p.c] !== EMPTY) continue;
        options.push({ idx, cardId: card.id, targets: [{ r: p.r, c: p.c }], endsTurn: false, apply: () => { board[p.r][p.c] = WALL; } });
      }
    } else if (v2 && card.type === 'chain_move') {
      // 연속 착수는 기존처럼 바로 쓰되(측정 결과 아껴 두면 오히려 약함), 이번 턴에 끝내는 수순이 있으면 계획에 '승리'로 표시
      options.push({ idx, cardId: card.id, targets: [], endsTurn: false, chain: true });
    } else if (card.type === 'reversal') {
      options.push({ idx, cardId: card.id, targets: [], endsTurn: true, apply: () => { flipBoard(bot); } });
    }
  });
  if (!options.length) return null;
  const per = Math.max(350, Math.floor(budgetMs / (options.length + 1)));
  const baseline = bestValue(bot, makeBlocked(), per) - riskNow();
  let best = null;
  for (const o of options) {
    if (Date.now() - t0 > budgetMs * 1.3) break;
    let v;
    if (o.combos) {
      // 무작위 카드: 가능한 결과들의 평균
      let sum = 0, allWin = true;
      const each = Math.max(150, Math.floor(per / o.combos.length));
      for (const cb of o.combos) {
        cb.forEach(t => { board[t.r][t.c] = bot; });
        const x = -bestValue(opp, makeBlocked(), each) - riskNow();
        sum += x; if (x < WIN_SCORE / 2) allWin = false;
        restore();
      }
      v = sum / o.combos.length;
      if (!allWin) v = Math.min(v, WIN_SCORE / 2 - 1); // 무작위 결과가 전부 이길 때만 '확실한 승리'
    } else if (o.quake) {
      // 지진: 무작위 결과 몇 가지의 평균 (턴은 이어짐)
      let sum = 0, allWin = true;
      const each = Math.max(150, Math.floor(per / o.quake));
      for (let k = 0; k < o.quake; k++) {
        simQuake();
        const f = scanFiveWinner();
        const x = f === bot ? WIN_SCORE : f === opp ? -WIN_SCORE : bestValue(bot, makeBlocked(), each) - riskNow();
        sum += x; if (x < WIN_SCORE / 2) allWin = false;
        restore();
      }
      v = sum / o.quake;
      if (!allWin) v = Math.min(v, WIN_SCORE / 2 - 1);
    } else if (o.chain) {
      // 연속 착수: 이번 턴 3수를 묶어서 둔 결과의 가치
      const blk = makeBlocked(); e2Init(blk);
      const saved = { d: turnPlacementsDone, p: turnPlacedPositions };
      turnPlacementsDone = 0; turnPlacedPositions = [];
      const plan = e2ChainPlan(bot, blk, per, 3);
      turnPlacementsDone = saved.d; turnPlacedPositions = saved.p;
      restore();
      if (!plan) continue;
      v = plan.value;
    } else {
      o.apply();
      const f = scanFiveWinner();
      if (f === bot) v = WIN_SCORE;
      else if (f === opp) v = -WIN_SCORE;
      else {
        const blk = makeBlocked(); v = o.endsTurn ? -bestValue(opp, blk, per) : bestValue(bot, blk, per);
        if (v4 && Math.abs(v) < WIN_SCORE / 2) {
          v -= riskNow();
          // 식스센스: 상대 필승 수순이 6목에서 사라지면 가점, 내 수순이 사라지면 감점
          if (six5 && o.cardId === 'sixsense') { const o6 = vctNow(opp), m6 = vctNow(bot); v += (six5.opp && !o6 ? 3000 : 0) - (six5.me && !m6 ? 3000 : 0); }
        }
      }
      restore();
    }
    if (!best || v > best.v) best = { v, o };
  }
  if (!best) return null;
  return { idx: best.o.idx, cardId: best.o.cardId, targets: best.o.targets, gain: best.v - baseline, win: best.v >= WIN_SCORE / 2 };
}

// 지진 결과 한 가지를 판에 그대로 적용 (runEarthquake와 같은 규칙, 기록·연출 없음) — 카드 계획의 표본용
function simQuake() {
  const stones = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (isStone(board[r][c])) stones.push({ r, c, color: board[r][c], mill: windmillList.some(w => w.r === r && w.c === c) });
  const occ = new Set(stones.map(s => s.r * SIZE + s.c)), claimed = new Set();
  const walls = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (board[(i / SIZE) | 0][i % SIZE] === WALL) { walls.push(i); occ.add(i); }
  const order = stones.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const pos = new Array(stones.length);
  for (const i of order) {
    const s = stones[i], nb = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = s.r + dr, c = s.c + dc, k = r * SIZE + c;
      if (!inBoard(r, c) || occ.has(k) || claimed.has(k) || isCrater(r, c)) continue;
      nb.push(k);
    }
    const k = nb.length ? nb[Math.floor(Math.random() * nb.length)] : s.r * SIZE + s.c;
    claimed.add(k); pos[i] = k;
  }
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  walls.forEach(i => { board[(i / SIZE) | 0][i % SIZE] = WALL; });
  windmillList = [];
  stones.forEach((s, i) => { const r = (pos[i] / SIZE) | 0, c = pos[i] % SIZE; board[r][c] = s.color; if (s.mill) windmillList.push({ r, c }); });
}

// A. 백그라운드 계산(Web Worker): 탐색 함수들을 그대로 옮겨 실행해 화면이 멈추지 않게 함
let engineWorker = null, engineWorkerFailed = false, engineReqId = 0, engineToken = 0, engineBusy = false;
const engineCallbacks = new Map();
function engineWorkerMain(e) {
  const d = e.data;
  try {
    board = d.board; winLength = d.winLength; windmillList = d.windmillList; craterList = d.craterList; shieldList = d.shieldList || []; trapList = d.trapList;
    winOver = d.winOver || {}; immuneList = d.immuneList || [];
    hand = d.hand; cardLockNextTurn = d.cardLockNextTurn; skipNextTurn = d.skipNextTurn || {}; turnPlacementsDone = d.turnPlacementsDone; turnPlacementsNeeded = d.turnPlacementsNeeded || 1; turnPlacedPositions = d.turnPlacedPositions;
    let result = null;
    if (d.task === 'move') { const m = (d.cfg && d.cfg.engine2 ? e2ChooseMove : ultimateChooseMove)(d.bot, makeBlocked(), d.budget, d.cfg); result = m ? { r: m.r, c: m.c } : null; }
    else if (d.task === 'plan') result = planCardsSearch(d.bot, d.cfg, d.budget);
    postMessage({ id: d.id, result });
  } catch (err) {
    postMessage({ id: d.id, error: String((err && err.message) || err) });
  }
}
function getEngineWorker() {
  if (engineWorker || engineWorkerFailed || typeof Worker === 'undefined') return engineWorker;
  try {
    const fns = [isStone, other, inBoard, checkWin, isCrater, isProtected, flipBoard, swapMakesLine, realFiveAt, e2RealFive, pruneInvalidTraps, isBlockedForPlayer, buildBlockedGrid, makeBlocked, collectCandidates,
      lineShape, attackValue, windowWeight, evalBoard, uHashBoard, uKey, uPlace, uOrdered, uSearch, findWinCells, vcf, vct, vctDefend,
      readOppCards, uSetupFor, openingBookMove, ultimateChooseMove, listStones, isOrthoAdjacent, scanFiveWinner, uBestValue, planCardsSearch, engineWorkerMain,
      e2BuildTables, e2Contrib, e2At, e2Init, e2NbAdd, e2Update, e2Place, e2Remove, e2Eval, e2Attack, e2Ordered, e2Search,
      e2WinCells, e2HasDoubleMove, e2HasFourMove, e2Vct, e2VctDefend, e2BestValue, e2TradeRisk, e2ChainRisk, e2ChainPlan, getOrthogonalEnemyNeighbors, simQuake, e2Canon, e2FromCanon, e2BookMove, e2ChooseMove];
    const src = [
      '"use strict";',
      `const SIZE = ${SIZE}, EMPTY = ${EMPTY}, BLACK = ${BLACK}, WHITE = ${WHITE}, WALL = ${WALL}, HAND_LIMIT = ${HAND_LIMIT};`,
      `const DIRS = ${JSON.stringify(DIRS)};`,
      `const P_FIVE = ${P_FIVE}, P_OPEN4 = ${P_OPEN4}, P_FOUR = ${P_FOUR}, P_OPEN3 = ${P_OPEN3}, P_THREE = ${P_THREE}, P_OPEN2 = ${P_OPEN2}, P_TWO = ${P_TWO};`,
      `const WIN_SCORE = ${WIN_SCORE}, U_WIDTHS = ${JSON.stringify(U_WIDTHS)};`,
      `const ZOB = ${JSON.stringify(ZOB)};`,
      'let winOver = {}, immuneList = [];',
      'let board, winLength = 5, windmillList = [], craterList = [], shieldList = [], moveHistory = [], trapList = [], hand = {}, skipNextTurn = {}, cardLockNextTurn = {}, turnPlacementsDone = 0, turnPlacementsNeeded = 1, turnPlacedPositions = [];',
      'let searchDeadline = 0, uWidths = U_WIDTHS, uDefense = 0.95, uBot = null, uFlipRisk = false, uStyle = null, uLastDepth = 0, uTT = new Map(), uAborted = false, uNodes = 0;',
      `const E2P = ${JSON.stringify(E2P)}, E2_BOOK = ${JSON.stringify(E2_BOOK)};`,
      `const E2_SYM = [${E2_SYM.map(f => f.toString()).join(', ')}];`,
      'let e2L = 0, e2NW = 0, e2WCells = null, e2CellW = null, e2CellWAll = null, e2CntB = null, e2CntW = null, e2BlkB = null, e2BlkW = null, e2SB = 0, e2SW = 0, e2Nb = null, e2WG = null, e2Grid = null, e2Killers = [], e2Hist = null, e2Nodes = 0, e2MaxDepth = 0;',
      fns.map(f => f.toString()).join('\n'),
      'onmessage = engineWorkerMain;',
    ].join('\n');
    engineWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    engineWorker.onmessage = (e) => {
      const cb = engineCallbacks.get(e.data.id);
      engineCallbacks.delete(e.data.id);
      if (cb) cb(e.data.error ? undefined : e.data.result, e.data.error);
    };
    engineWorker.onerror = () => {
      engineWorkerFailed = true; engineWorker = null;
      const cbs = Array.from(engineCallbacks.values()); engineCallbacks.clear();
      cbs.forEach(cb => cb(undefined, 'worker error'));
    };
  } catch (e) {
    engineWorkerFailed = true; engineWorker = null;
  }
  return engineWorker;
}
// task: 'move' | 'plan'. 워커를 못 쓰면 같은 계산을 짧은 시간으로 바로 실행
function requestEngine(task, bot, budget, cb) {
  const cfg = botCfg();
  const w = getEngineWorker();
  const fallback = () => {
    if (task === 'move') { const m = (cfg.engine2 ? e2ChooseMove : ultimateChooseMove)(bot, makeBlocked(), Math.min(budget, 3000), cfg); cb(m ? { r: m.r, c: m.c } : null); }
    else cb(null);
  };
  if (!w) { fallback(); return; }
  const id = ++engineReqId;
  engineCallbacks.set(id, (res, err) => { if (err) fallback(); else cb(res); });
  w.postMessage({
    id, task, bot, budget, cfg,
    board: board.map(r => r.slice()), winLength, windmillList, craterList, shieldList: shieldList || [], trapList: trapList || [],
    hand: { [BLACK]: (hand[BLACK] || []).map(c => ({ id: c.id, type: c.type })), [WHITE]: (hand[WHITE] || []).map(c => ({ id: c.id, type: c.type })) },
    cardLockNextTurn, skipNextTurn, turnPlacementsDone, turnPlacementsNeeded, turnPlacedPositions,
    winOver, immuneList,
  });
}

const ENGINE_PLANNED_TYPES = ['remove_enemy', 'windmill', 'six_sense', 'trade', 'reversal'];
// 짱짱맨의 한 턴: (카드 계획 → 카드 발동) → 착수, 계산은 모두 백그라운드
function botTurnWithEngine(botColor) {
  if (engineBusy) return;
  const cfg = botCfg();
  const tok = engineToken;
  const stillMyTurn = () => tok === engineToken && mode === 'bot' && !gameOver && current === botColor && !draftOpen && !pendingTarget && !alk && !cardAnimBusy;
  const place = () => {
    if (!stillMyTurn()) return;
    engineBusy = true;
    statusText.textContent = t('bot.thinking');
    requestEngine('move', botColor, turnPlacementsDone > 0 ? cfg.chainTimeMs : cfg.timeMs, (pick) => {
      engineBusy = false;
      if (!stillMyTurn()) return;
      placeBotPick(botColor, pick);
    });
  };
  statusText.textContent = t('bot.thinking');
  if (usedCardThisTurn[botColor] || !hand[botColor].length) { place(); return; }
  engineBusy = true;
  requestEngine('plan', botColor, cfg.planMs, (plan) => {
    engineBusy = false;
    if (!stillMyTurn()) return;
    const valid = plan && hand[botColor][plan.idx] && hand[botColor][plan.idx].id === plan.cardId;
    const usePlan = () => activateCard(botColor, plan.idx, () => { applyBotTargets(botColor, plan.targets); place(); });
    if (valid && plan.win && usePlan()) return;                                   // 카드로 이기는 수가 있으면 바로
    if (valid && cfg.cardPlan3 && plan.cardId === 'trap' && plan.gain > 300 && usePlan()) return; // 함정 콤보는 기존 함정 규칙보다 먼저
    const planned = cfg.cardPlan2 ? ENGINE_PLANNED_TYPES.concat(cfg.cardPlan4 ? ['infection', 'teleport', 'earthquake'] : ['infection'], cfg.cardPlan5 ? ['wall'] : []) : ENGINE_PLANNED_TYPES;
    if (botUseCardSmart(botColor, place, { exclude: planned })) return;           // 함정·봉쇄 등은 기존 판단
    const fullHand = cfg.cardPlan2 && hand[botColor].length >= HAND_LIMIT;        // 곧 버려질 상황이면 손해만 아니면 사용
    if (valid && plan.gain > (fullHand ? 0 : 300) && usePlan()) return;          // 수 읽기로 이득이 확인된 카드
    place();
  });
}


// ================= 짱짱맨 엔진 v2 =================
// 1) 돌 하나를 놓을 때 그 돌이 지나는 줄(창)만 다시 계산하는 증분 평가
// 2) 킬러 수·히스토리 정렬, 좁은 창 탐색(PVS), 가망 없는 수 얕게 읽기(LMR)
// 3) 막는 수를 빠짐없이 따지는 연속 위협(VCT) 탐색
// 조정 가능한 평가 기준 (자동 조정 결과로 갱신)
const E2P = { tr: 60, cr: 40, ta: 50, g1: 800, g2: 70, g3: 8, g4: 1, bA: 1.2, bB: 1.0, wA: 1.0, wB: 1.25 };
let e2L = 0, e2NW = 0, e2WCells = null, e2CellW = null, e2CellWAll = null;
let e2CntB = null, e2CntW = null, e2BlkB = null, e2BlkW = null, e2SB = 0, e2SW = 0, e2Nb = null, e2WG = null, e2Grid = null;
let e2Killers = [], e2Hist = null, e2Nodes = 0, e2MaxDepth = 0;

function e2BuildTables(L) {
  if (e2L === L && e2WCells) return;
  e2L = L;
  const cells = [], cellW = [];
  for (let i = 0; i < SIZE * SIZE; i++) cellW.push([[], [], [], []]);
  let nW = 0;
  for (let d = 0; d < 4; d++) {
    const dr = DIRS[d][0], dc = DIRS[d][1];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (!inBoard(r + (L - 1) * dr, c + (L - 1) * dc)) continue;
      for (let k = 0; k < L; k++) { const idx = (r + k * dr) * SIZE + (c + k * dc); cells.push(idx); cellW[idx][d].push(nW); }
      nW++;
    }
  }
  e2NW = nW; e2WCells = Int16Array.from(cells); e2CellW = cellW;
  e2CellWAll = cellW.map(ds => ds[0].concat(ds[1], ds[2], ds[3]));
}
function e2Contrib(cMe, cOp, blk) { return (cMe > 0 && cOp === 0 && !blk) ? e2WG[e2L - cMe] : 0; }
function e2At(i) { return board[(i / SIZE) | 0][i % SIZE]; }

// 현재 판(board)과 막힌 칸(blocked)으로 증분 평가 상태를 새로 만든다
function e2Init(blocked) {
  e2BuildTables(winLength);
  const L = e2L;
  e2Grid = blocked;
  e2WG = new Float64Array(L + 1);
  e2WG[0] = 1e7; e2WG[1] = E2P.g1; e2WG[2] = E2P.g2; e2WG[3] = E2P.g3; e2WG[4] = E2P.g4;
  for (let g = 5; g <= L; g++) e2WG[g] = 0.2;
  e2CntB = new Int8Array(e2NW); e2CntW = new Int8Array(e2NW); e2BlkB = new Uint8Array(e2NW); e2BlkW = new Uint8Array(e2NW);
  e2SB = 0; e2SW = 0;
  for (let w = 0; w < e2NW; w++) {
    let b = 0, wc = 0, kb = 0, kw = 0;
    for (let k = 0; k < L; k++) {
      const idx = e2WCells[w * L + k], v = e2At(idx);
      if (v === BLACK) b++; else if (v === WHITE) wc++;
      else { if (blocked[BLACK][idx]) kb = 1; if (blocked[WHITE][idx]) kw = 1; }
    }
    e2CntB[w] = b; e2CntW[w] = wc; e2BlkB[w] = kb; e2BlkW[w] = kw;
    e2SB += e2Contrib(b, wc, kb); e2SW += e2Contrib(wc, b, kw);
  }
  e2Nb = new Int16Array(SIZE * SIZE);
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (isStone(board[r][c])) e2NbAdd(r * SIZE + c, 1);
}
function e2NbAdd(i, delta) {
  const r0 = (i / SIZE) | 0, c0 = i % SIZE;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    const r = r0 + dr, c = c0 + dc;
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) e2Nb[r * SIZE + c] += delta;
  }
}
function e2Update(i, p, delta) {
  const ws = e2CellWAll[i];
  for (let k = 0; k < ws.length; k++) {
    const w = ws[k], b = e2CntB[w], wc = e2CntW[w], kb = e2BlkB[w], kw = e2BlkW[w];
    e2SB -= e2Contrib(b, wc, kb); e2SW -= e2Contrib(wc, b, kw);
    if (p === BLACK) e2CntB[w] = b + delta; else e2CntW[w] = wc + delta;
    e2SB += e2Contrib(e2CntB[w], e2CntW[w], kb); e2SW += e2Contrib(e2CntW[w], e2CntB[w], kw);
  }
}
function e2Place(i, p) { board[(i / SIZE) | 0][i % SIZE] = p; e2Update(i, p, 1); e2NbAdd(i, 1); }
function e2Remove(i, p) { board[(i / SIZE) | 0][i % SIZE] = EMPTY; e2Update(i, p, -1); e2NbAdd(i, -1); }

function e2Eval(me) {
  const sMe = me === BLACK ? e2SB : e2SW, sOp = me === BLACK ? e2SW : e2SB;
  let v;
  if (uStyle && uBot) {
    const sBot = me === uBot ? sMe : sOp, sHum = me === uBot ? sOp : sMe;
    v = uStyle.a * sBot - uStyle.b * sHum;
    v = me === uBot ? v : -v;
  } else v = sMe - sOp * 1.1;
  if (uFlipRisk && uBot) { const vb = me === uBot ? v : -v; const adj = vb > 0 ? vb * 0.35 : vb; v = me === uBot ? adj : -adj; }
  return v;
}

// i 칸에 p를 두면 생기는 모양 (attackValue와 같은 판정, 창 개수를 이용해 빠르게)
// i와 e에 p를 두면 e에서 정확히 N개가 되는지 (장목이면 승리가 아니므로 진짜 4가 아님)
function e2RealFive(i, e, p) {
  const ri = (i / SIZE) | 0, ci = i % SIZE, re = (e / SIZE) | 0, ce = e % SIZE, ki = board[ri][ci];
  board[ri][ci] = p; board[re][ce] = p;
  const ok = !!checkWin(re, ce, p);
  board[re][ce] = EMPTY; board[ri][ci] = ki;
  return ok;
}
function e2Attack(i, p) {
  const L = e2L, cP = p === BLACK ? e2CntB : e2CntW, cO = p === BLACK ? e2CntW : e2CntB, blk = p === BLACK ? e2BlkB : e2BlkW;
  let score = 0, fours = 0, open3 = 0;
  const byDir = e2CellW[i];
  for (let d = 0; d < 4; d++) {
    const ws = byDir[d];
    let best = 0, winCell = -1, winCells = 0, near = 0;
    for (let k = 0; k < ws.length; k++) {
      const w = ws[k];
      if (cO[w] || blk[w]) continue;
      const n = cP[w] + 1;
      if (n > best) best = n;
      if (n === L - 1) {
        let e = -1;
        for (let t = 0; t < L; t++) { const x = e2WCells[w * L + t]; if (x !== i && e2At(x) === EMPTY) { e = x; break; } }
        if (e !== winCell && e >= 0 && e2RealFive(i, e, p)) { if (winCell === -1 || winCells < 2) winCells++; winCell = e; } // 장목이 되는 4는 위협 아님
      }
      if (n === L - 2) near++;
    }
    if (best >= L) {
      // 창이 다 차도 이어진 돌이 N개를 넘으면(장목) 승리 아님 — 실제 판정으로 확인
      const r0 = (i / SIZE) | 0, c0 = i % SIZE, keep = board[r0][c0];
      board[r0][c0] = p; const ok = checkWin(r0, c0, p); board[r0][c0] = keep;
      if (ok) return { score: P_FIVE, five: true, fours: 0 };
      continue;
    }
    if (winCells >= 2) { score += P_OPEN4; fours += 2; }
    else if (winCells === 1) { score += P_FOUR; fours++; }
    else if (best === L - 2) { if (near >= 2) { score += P_OPEN3; open3++; } else score += P_THREE; }
    else if (best === L - 3) score += near >= 1 ? P_OPEN2 : P_TWO;
    else score += best;
  }
  if (fours >= 2 || (fours >= 1 && open3 >= 1)) score += P_OPEN4 / 2;
  else if (open3 >= 2) score += P_OPEN3 * 5;
  return { score, five: false, fours };
}

// 후보 정렬 + 위협 가지치기 (uOrdered와 같은 규칙)
function e2Ordered(p, width, rootList) {
  const o = other(p), gP = e2Grid[p], gO = e2Grid[o];
  const all = [], blocks = [], critical = [];
  const consider = (i) => {
    const a = e2Attack(i, p);
    if (a.five) return { i, r: (i / SIZE) | 0, c: i % SIZE, score: P_FIVE };
    const d = gO[i] ? { score: 0, five: false } : e2Attack(i, o);
    const m = { i, r: (i / SIZE) | 0, c: i % SIZE, score: a.score + d.score * uDefense, four: a.fours >= 1 };
    all.push(m);
    if (d.five) blocks.push(m);
    else if (d.score >= P_OPEN4 || a.fours >= 1) critical.push(m);
    return null;
  };
  if (rootList) {
    for (const q of rootList) { const win = consider(q.r * SIZE + q.c); if (win) return { win, list: [win] }; }
  } else {
    let any = false;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (e2Nb[i] <= 0 || gP[i] || e2At(i) !== EMPTY) continue;
      any = true;
      const win = consider(i); if (win) return { win, list: [win] };
    }
    if (!any && e2At(112) === EMPTY) consider(112);
  }
  let list = all, forced = false;
  if (blocks.length) { list = blocks; forced = true; }
  else if (critical.length && critical.some(m => m.score >= P_OPEN4 * 0.9)) list = critical;
  list.sort((a, b) => b.score - a.score);
  return { win: null, list: width ? list.slice(0, width) : list, forced };
}

function e2Search(p, depth, alpha, beta, h, ply) {
  if ((++e2Nodes & 255) === 0 && Date.now() > searchDeadline) uAborted = true;
  if (uAborted) return 0;
  if (ply > e2MaxDepth) e2MaxDepth = ply;
  const key = uKey(h, p);
  const e = uTT.get(key);
  const alpha0 = alpha;
  if (e && e.depth >= depth) {
    if (e.flag === 0) return e.value;
    if (e.flag === 1 && e.value > alpha) alpha = e.value;
    else if (e.flag === 2 && e.value < beta) beta = e.value;
    if (alpha >= beta) return e.value;
  }
  const moves = e2Ordered(p, uWidths[Math.min(ply, uWidths.length - 1)], null);
  if (moves.win) return WIN_SCORE - ply;
  if (!moves.list.length) return 0;
  if (depth <= 0) return e2Eval(p);
  // 정렬: 치환표의 최선 수 → 킬러 수 → 히스토리 가산
  const kill = e2Killers[ply] || [];
  const hist = e2Hist[p];
  for (const m of moves.list) m.ord = m.score + hist[m.i] * 4 + (kill[0] === m.i || kill[1] === m.i ? P_OPEN3 : 0) + (e && e.best === m.i ? 1e9 : 0);
  moves.list.sort((a, b) => b.ord - a.ord);
  const o = other(p);
  let best = -Infinity, bestIdx = -1;
  for (let k = 0; k < moves.list.length; k++) {
    const m = moves.list[k];
    e2Place(m.i, p);
    const h2 = uPlace(h, m.r, m.c, p);
    let v;
    if (k === 0) v = -e2Search(o, depth - 1, -beta, -alpha, h2, ply + 1);
    else {
      const reduce = (k >= 3 && depth >= 3 && !moves.forced && !m.four && m.score < P_OPEN3) ? 1 : 0;
      v = -e2Search(o, depth - 1 - reduce, -alpha - 1, -alpha, h2, ply + 1);
      if (!uAborted && v > alpha && (reduce || v < beta)) v = -e2Search(o, depth - 1, -beta, -alpha, h2, ply + 1);
    }
    e2Remove(m.i, p);
    if (uAborted) return 0;
    if (v > best) { best = v; bestIdx = m.i; }
    if (best > alpha) alpha = best;
    if (alpha >= beta) {
      if (kill[0] !== m.i) { e2Killers[ply] = [m.i, kill[0]]; }
      hist[m.i] += depth * depth;
      break;
    }
  }
  uTT.set(key, { depth, value: best, flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0, best: bestIdx });
  return best;
}

// ---- 3) 연속 위협(VCT): 막는 수를 빠짐없이 따지는 탐색 ----
function e2WinCells(p) {
  const L = e2L, cP = p === BLACK ? e2CntB : e2CntW, cO = p === BLACK ? e2CntW : e2CntB, blk = p === BLACK ? e2BlkB : e2BlkW;
  const out = [];
  for (let w = 0; w < e2NW; w++) {
    if (cP[w] !== L - 1 || cO[w] || blk[w]) continue;
    for (let t = 0; t < L; t++) {
      const x = e2WCells[w * L + t];
      if (e2At(x) !== EMPTY) continue;
      if (!out.includes(x)) {
        const r0 = (x / SIZE) | 0, c0 = x % SIZE;
        board[r0][c0] = p; const ok = checkWin(r0, c0, p); board[r0][c0] = EMPTY; // 장목이 되는 칸은 이기는 자리가 아님
        if (ok) out.push(x);
      }
      break;
    }
  }
  return out;
}
// p가 한 수로 막을 수 없는 위협(열린 4·4-4 등)을 만들 수 있는지
function e2HasDoubleMove(p) {
  const L = e2L, cP = p === BLACK ? e2CntB : e2CntW, cO = p === BLACK ? e2CntW : e2CntB, blk = p === BLACK ? e2BlkB : e2BlkW;
  const seen = new Uint8Array(SIZE * SIZE), g = e2Grid[p];
  for (let w = 0; w < e2NW; w++) {
    if (cP[w] !== L - 2 || cO[w] || blk[w]) continue;
    for (let t = 0; t < L; t++) {
      const x = e2WCells[w * L + t];
      if (seen[x] || e2At(x) !== EMPTY || g[x]) continue;
      seen[x] = 1;
      const a = e2Attack(x, p);
      if (a.five || a.fours >= 2) return true;
    }
  }
  return false;
}
// p가 4를 만들 수 있는 칸이 하나라도 있는지 (반격 가능성)
function e2HasFourMove(p) {
  const L = e2L, cP = p === BLACK ? e2CntB : e2CntW, cO = p === BLACK ? e2CntW : e2CntB, blk = p === BLACK ? e2BlkB : e2BlkW;
  for (let w = 0; w < e2NW; w++) if (cP[w] >= L - 2 && !cO[w] && !blk[w]) return true;
  return false;
}
// att가 연속 위협으로 이기는 첫 수 (없으면 null). legalRoot: 첫 수로 둘 수 있는 칸 집합
function e2Vct(att, depth, deadline, legalRoot) {
  if (depth <= 0 || Date.now() > deadline) return null;
  const def = other(att), L = e2L;
  const mine = e2WinCells(att);
  for (const x of mine) if (!legalRoot || legalRoot.has(x)) return { r: (x / SIZE) | 0, c: x % SIZE };
  if (e2WinCells(def).length) return null;
  const cP = att === BLACK ? e2CntB : e2CntW, cO = att === BLACK ? e2CntW : e2CntB, blk = att === BLACK ? e2BlkB : e2BlkW;
  const seen = new Uint8Array(SIZE * SIZE), g = e2Grid[att], threats = [];
  for (let w = 0; w < e2NW; w++) {
    if (cP[w] < L - 3 || cO[w] || blk[w]) continue;
    for (let t = 0; t < L; t++) {
      const x = e2WCells[w * L + t];
      if (seen[x] || e2At(x) !== EMPTY || g[x] || (legalRoot && !legalRoot.has(x))) continue;
      seen[x] = 1;
      const a = e2Attack(x, att);
      if (a.five) return { r: (x / SIZE) | 0, c: x % SIZE };
      if (a.fours >= 1) { threats.push({ x, s: a.score + P_FIVE }); continue; }
      if (a.score < P_OPEN3) continue;
      e2Place(x, att);
      const dbl = e2HasDoubleMove(att);
      e2Remove(x, att);
      if (dbl) threats.push({ x, s: a.score });
    }
  }
  threats.sort((a, b) => b.s - a.s);
  for (const tm of threats.slice(0, 12)) {
    e2Place(tm.x, att);
    const ok = e2VctDefend(att, depth, deadline);
    e2Remove(tm.x, att);
    if (ok) return { r: (tm.x / SIZE) | 0, c: tm.x % SIZE };
    if (Date.now() > deadline) return null;
  }
  return null;
}
// att가 방금 위협을 만든 뒤, def의 모든 방어에 대해 att가 계속 이기는지 (반격 4가 있으면 보수적으로 실패)
function e2VctDefend(att, depth, deadline) {
  const def = other(att), L = e2L;
  if (e2WinCells(def).length) return false;
  const wins = e2WinCells(att);
  if (wins.length >= 2) return true;
  let defs;
  if (wins.length === 1) {
    if (e2Grid[def][wins[0]]) return true;
    defs = [wins[0]];
  } else {
    if (e2HasFourMove(def)) return false;
    const cP = att === BLACK ? e2CntB : e2CntW, cO = att === BLACK ? e2CntW : e2CntB, blk = att === BLACK ? e2BlkB : e2BlkW;
    const seen = new Uint8Array(SIZE * SIZE), g = e2Grid[def];
    defs = [];
    for (let w = 0; w < e2NW; w++) {
      if (cP[w] < L - 2 || cO[w] || blk[w]) continue;
      for (let t = 0; t < L; t++) {
        const x = e2WCells[w * L + t];
        if (seen[x] || e2At(x) !== EMPTY || g[x]) continue;
        seen[x] = 1;
        e2Place(x, def);
        const still = e2WinCells(att).length > 0 || e2HasDoubleMove(att);
        e2Remove(x, def);
        if (!still) defs.push(x);
      }
    }
    if (!defs.length) return true;
  }
  for (const d of defs) {
    e2Place(d, def);
    const cont = e2Vct(att, depth - 1, deadline, null) !== null;
    e2Remove(d, def);
    if (!cont) return false;
  }
  return true;
}

// player 차례 국면의 가치 (v2 탐색, player 관점) — e2Init이 된 상태에서 호출
function e2BestValue(player, budgetMs) {
  const dl = Date.now() + budgetMs;
  const saved = searchDeadline; searchDeadline = dl;
  uTT = new Map(); uAborted = false;
  const root = e2Ordered(player, 10, null);
  let best = e2Eval(player);
  if (root.win) { searchDeadline = saved; return WIN_SCORE; }
  if (!root.list.length) { searchDeadline = saved; return 0; }
  const o = other(player), h0 = uHashBoard();
  for (let depth = 2; depth <= 12; depth++) {
    let iv = -Infinity, alpha = -Infinity;
    for (const m of root.list) {
      e2Place(m.i, player);
      const v = -e2Search(o, depth - 1, -Infinity, -alpha, uPlace(h0, m.r, m.c, player), 1);
      e2Remove(m.i, player);
      if (uAborted) break;
      if (v > iv) iv = v;
      if (v > alpha) alpha = v;
    }
    if (uAborted) break;
    best = iv;
    if (Math.abs(iv) >= WIN_SCORE / 2 || Date.now() > dl - budgetMs * 0.45) break;
  }
  uAborted = false; searchDeadline = saved;
  return best;
}

// 맞교환 위험: 상대가 맞교환 한 장으로 곧바로 이기는(5목 또는 막을 수 없는 4) 흑·백 쌍의 수
function e2TradeRisk(me) {
  const opp = other(me);
  let n = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const r = (i / SIZE) | 0, c = i % SIZE;
    if (board[r][c] !== me || isProtected(r, c)) continue; // 보호막 안의 돌은 상대가 바꿀 수 없음
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const r2 = r + dr, c2 = c + dc;
      if (!inBoard(r2, c2) || board[r2][c2] !== opp) continue;
      const j = r2 * SIZE + c2;
      e2Remove(i, me); e2Place(i, opp); e2Remove(j, opp); e2Place(j, me);
      // 오목/육목이 완성되는 교환은 규칙상 불가 → 막을 수 없는 4가 생기는 경우만 위험
      const illegal = checkWin(r, c, opp) || checkWin(r2, c2, me);
      const lost = !illegal && !e2WinCells(me).length && e2WinCells(opp).length >= 2;
      e2Remove(j, me); e2Place(j, opp); e2Remove(i, opp); e2Place(i, me);
      if (lost) n++;
    }
  }
  return n;
}

// 연속 착수 위험: 상대가 연속 착수(최대 3수, 같은 턴 돌끼리 2칸 이내 금지) 한 턴으로 끝낼 수 있는지
//   돌 2개를 떨어뜨려 놓아 5목을 만들거나, 4를 두 개 만들어 한 수로 못 막게 하는 경우 (한 수만으로 되는 열린 4는 일반 탐색이 이미 막음)
function e2ChainRisk(me) {
  const opp = other(me), L = e2L, cO = opp === BLACK ? e2CntB : e2CntW, cM = opp === BLACK ? e2CntW : e2CntB, blk = opp === BLACK ? e2BlkB : e2BlkW;
  if (e2WinCells(opp).length) return 0; // 이미 바로 이기는 자리는 일반 탐색 몫
  const F = [], seen = new Uint8Array(SIZE * SIZE), g = e2Grid[opp];
  for (let w = 0; w < e2NW && F.length < 24; w++) {
    if (cO[w] !== L - 2 || cM[w] || blk[w]) continue;
    for (let t = 0; t < L; t++) { const x = e2WCells[w * L + t]; if (e2At(x) === EMPTY && !g[x] && !seen[x]) { seen[x] = 1; F.push(x); } }
  }
  const single = F.map(x => { e2Place(x, opp); const n = e2WinCells(opp).length; e2Remove(x, opp); return n; });
  for (let a = 0; a < F.length; a++) {
    if (single[a] >= 2) continue;
    for (let b = a + 1; b < F.length; b++) {
      if (single[b] >= 2) continue;
      const x = F[a], y = F[b];
      if (Math.max(Math.abs(((x / SIZE) | 0) - ((y / SIZE) | 0)), Math.abs((x % SIZE) - (y % SIZE))) <= 2) continue;
      e2Place(x, opp); e2Place(y, opp);
      const lost = checkWin((x / SIZE) | 0, x % SIZE, opp) || checkWin((y / SIZE) | 0, y % SIZE, opp) || e2WinCells(opp).length >= 2;
      e2Remove(y, opp); e2Remove(x, opp);
      if (lost) return 1;
    }
  }
  return 0;
}

// 연속 착수 계획: 이번 턴에 남은 left수를 한꺼번에 묶어 따져 첫 수를 고름 → { move, value }
//   (같은 턴 돌끼리 2칸 이내 금지 규칙 반영, 끝난 뒤 상대 차례 가치로 비교)
function e2ChainPlan(bot, blocked, budgetMs, left) {
  const opp = other(bot), t0 = Date.now(), dl = t0 + budgetMs;
  const placed0 = (turnPlacedPositions || []).map(p => p.r * SIZE + p.c);
  const far = (i, list) => list.every(j => Math.max(Math.abs(((i / SIZE) | 0) - ((j / SIZE) | 0)), Math.abs((i % SIZE) - (j % SIZE))) > 2);
  const widths = left >= 3 ? [10, 7, 5] : [12, 9];
  const cands = (taken, n) => {
    const out = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (e2Nb[i] <= 0 || blocked[bot][i] || e2At(i) !== EMPTY || !far(i, taken)) continue;
      const a = e2Attack(i, bot), d = e2Attack(i, opp);
      out.push({ i, s: a.five ? 1e9 : a.score + d.score * (d.five ? 50 : 1) });
    }
    return out.sort((x, y) => y.s - x.s).slice(0, n);
  };
  const leaves = [];
  const walk = (seq, taken, k) => {
    if (Date.now() > dl - budgetMs * 0.5) return;
    if (k === left) {
      // 내 턴 끝 → 상대 차례: 상대가 바로 이기면 패, 내가 막을 수 없는 4가 둘 이상이면 승에 가까움
      let v;
      if (e2WinCells(opp).length) v = -WIN_SCORE;
      else if (e2WinCells(bot).length >= 2) v = WIN_SCORE / 2;
      else v = e2Eval(bot);
      leaves.push({ seq: seq.slice(), v });
      return;
    }
    for (const c of cands(taken, widths[k])) {
      e2Place(c.i, bot);
      const r = (c.i / SIZE) | 0, cc = c.i % SIZE;
      if (checkWin(r, cc, bot)) { e2Remove(c.i, bot); leaves.push({ seq: seq.concat(c.i), v: WIN_SCORE }); continue; }
      seq.push(c.i); taken.push(c.i);
      walk(seq, taken, k + 1);
      seq.pop(); taken.pop();
      e2Remove(c.i, bot);
    }
  };
  walk([], placed0.slice(), 0);
  if (!leaves.length) return null;
  leaves.sort((a, b) => b.v - a.v);
  // 상위 몇 개 조합은 상대 응수까지 실제로 읽어 다시 비교
  const top = leaves.slice(0, 6).filter(l => Math.abs(l.v) < WIN_SCORE / 2);
  const won = leaves.find(l => l.v === WIN_SCORE); // 이번 턴 안에 5목
  if (won) { const i = won.seq[0]; return { move: { r: (i / SIZE) | 0, c: i % SIZE }, value: WIN_SCORE }; }
  let best = leaves[0];
  if (top.length) {
    const each = Math.max(60, Math.floor((dl - Date.now()) / top.length));
    for (const l of top) {
      l.seq.forEach(i => e2Place(i, bot));
      l.v = -e2BestValue(opp, each);
      for (let k = l.seq.length - 1; k >= 0; k--) e2Remove(l.seq[k], bot);
    }
    const pool = leaves.filter(l => Math.abs(l.v) >= WIN_SCORE / 2).concat(top).sort((a, b) => b.v - a.v);
    best = pool[0];
  }
  const i = best.seq[0];
  return { move: { r: (i / SIZE) | 0, c: i % SIZE }, value: best.v };
}

// ---- 6) 정석 확장: 오프라인으로 깊게 계산해 둔 초반 수 (대칭·이동을 정규화해서 조회) ----
const E2_SYM = [(r, c) => [r, c], (r, c) => [r, -c], (r, c) => [-r, c], (r, c) => [-r, -c], (r, c) => [c, r], (r, c) => [c, -r], (r, c) => [-c, r], (r, c) => [-c, -r]];
function e2Canon(stones) {
  let best = null;
  for (let t = 0; t < 8; t++) {
    const pts = stones.map(s => { const q = E2_SYM[t](s.r, s.c); return { r: q[0], c: q[1], v: s.v }; });
    const mr = Math.min(...pts.map(p => p.r)), mc = Math.min(...pts.map(p => p.c));
    const key = pts.map(p => (p.r - mr) + '.' + (p.c - mc) + '.' + p.v).sort().join('|');
    if (!best || key < best.key) best = { key, t, mr, mc };
  }
  return best;
}
function e2FromCanon(cv, cr, cc) {
  const r0 = cr + cv.mr, c0 = cc + cv.mc;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) { const q = E2_SYM[cv.t](r, c); if (q[0] === r0 && q[1] === c0) return { r, c }; }
  return null;
}
function e2BookMove(bot, blocked) {
  if (winLength !== 5 || windmillList.length || craterList.length) return null;
  const stones = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (isStone(board[r][c])) stones.push({ r, c, v: board[r][c] });
  if (stones.length < 3 || stones.length > 6) return null;
  const cv = e2Canon(stones), hit = E2_BOOK[cv.key + '>' + bot];
  if (!hit) return null;
  const mv = e2FromCanon(cv, hit[0], hit[1]);
  return mv && board[mv.r][mv.c] === EMPTY && !blocked[bot][mv.r * SIZE + mv.c] ? mv : null;
}

// ---- 짱짱맨 v2 착수 결정 ----
function e2ChooseMove(botColor, blocked, budgetMs, cfg) {
  const opp = other(botColor);
  const { oppCards, trustForcing } = uSetupFor(botColor, cfg);
  uStyle = cfg && cfg.style ? (botColor === BLACK ? { a: E2P.bA, b: E2P.bB } : { a: E2P.wA, b: E2P.wB }) : null;
  if (cfg && cfg.readCards) for (const tr of trapList || []) if (tr.owner === opp && board[tr.r][tr.c] === EMPTY) blocked[botColor][tr.r * SIZE + tr.c] = 1;
  if (cfg && cfg.cardPlan3) for (const tr of trapList || []) if (tr.owner === botColor && board[tr.r][tr.c] === EMPTY) blocked[opp][tr.r * SIZE + tr.c] = 1;
  if (cfg && cfg.book && turnPlacementsDone === 0) {
    const bm = e2BookMove(botColor, blocked) || openingBookMove(botColor, blocked);
    if (bm) return bm;
  }
  const t0 = Date.now();
  searchDeadline = t0 + budgetMs;
  e2Init(blocked);
  e2Killers = []; e2Hist = { [BLACK]: new Int32Array(SIZE * SIZE), [WHITE]: new Int32Array(SIZE * SIZE) }; e2Nodes = 0; e2MaxDepth = 0;
  const legal = collectCandidates(botColor, 2, blocked, true);
  const legalSet = new Set(legal.map(p => p.r * SIZE + p.c));
  const root = e2Ordered(botColor, 0, legal);
  if (root.win) return root.win;
  if (!root.list.length) return null;
  if (root.forced && root.list.length === 1) return root.list[0];
  // 이번 턴에 더 둘 수 있으면(연속 착수) 남은 수를 묶어서 계획
  const left = (turnPlacementsNeeded || 1) - turnPlacementsDone;
  if (cfg && cfg.chainPlan && left >= 2) {
    // 이번 턴 안에 확실히 끝나는 수순(5목, 또는 막을 수 없는 4 두 개)을 찾았을 때만 따르고, 아니면 한 수씩 안전하게 읽는 기존 방식
    const plan = e2ChainPlan(botColor, blocked, budgetMs * 0.35, left);
    if (plan && plan.value >= WIN_SCORE / 2 && legalSet.has(plan.move.r * SIZE + plan.move.c)) return plan.move;
    e2Init(blocked);
    searchDeadline = Date.now() + budgetMs * 0.65;
  }

  // 연속 4 / 연속 위협으로 이기는 수순 (상대가 판을 흔드는 카드를 쥐고 있으면 확정하지 않고 먼저 검토만)
  let forcing = null;
  if (!root.forced) {
    forcing = vcf(botColor, 14, blocked, true);
    if (!forcing && cfg && cfg.vct2) forcing = e2Vct(botColor, 7, t0 + budgetMs * 0.2, legalSet);
    if (forcing && trustForcing) {
      // 상대가 맞교환을 쥐고 있으면, 그 한 장으로 뒤집히지 않는 수순일 때만 확정
      if (!(cfg && cfg.tradeRisk && oppCards.trade)) return forcing;
      const fi = forcing.r * SIZE + forcing.c;
      e2Place(fi, botColor); const risk = e2TradeRisk(botColor); e2Remove(fi, botColor);
      if (!risk) return forcing;
    }
  }
  let moves = root.list.slice(0, (cfg && cfg.rootWidth) || 16);
  if (!root.forced && vcf(opp, 12, blocked, false)) {
    const safe = moves.filter(m => { e2Place(m.i, botColor); const th = vcf(opp, 12, blocked, false); e2Remove(m.i, botColor); return !th; });
    if (safe.length) moves = safe;
  }
  if (cfg && cfg.vct2 && !root.forced && moves.length > 1) {
    const dl = Date.now() + budgetMs * 0.15;
    if (e2Vct(opp, 6, dl, null)) {
      const safe = moves.filter(m => { if (Date.now() > dl) return true; e2Place(m.i, botColor); const th = e2Vct(opp, 6, dl, null); e2Remove(m.i, botColor); return !th; });
      if (safe.length) moves = safe;
    }
  }
  if (cfg && cfg.chainRisk && oppCards.chain && moves.length > 1) {
    const safe = moves.filter(m => { e2Place(m.i, botColor); const risk = e2ChainRisk(botColor); e2Remove(m.i, botColor); return !risk; });
    if (safe.length) moves = safe;
  }
  if (cfg && cfg.tradeRisk && oppCards.trade && moves.length > 1) {
    // 상대가 맞교환을 쥐고 있으면 그 한 장에 바로 지는 수는 후보에서 뺌
    const safe = moves.filter(m => { e2Place(m.i, botColor); const risk = e2TradeRisk(botColor); e2Remove(m.i, botColor); return !risk; });
    if (safe.length) moves = safe;
  }
  if (forcing) { const k = moves.findIndex(m => m.r === forcing.r && m.c === forcing.c); if (k > 0) moves.unshift(moves.splice(k, 1)[0]); }
  if (moves.length === 1) return moves[0];

  // 반복 심화 (PVS·LMR·킬러·히스토리)
  const cardShare = cfg && cfg.oppCardReplies && (oppCards.bomb || oppCards.reversal || (oppCards.sixsense && winLength === 5)) ? 0.25 : 0;
  searchDeadline = t0 + budgetMs * (1 - cardShare);
  uTT = new Map(); uAborted = false;
  const h0 = uHashBoard();
  let bestMove = moves[0], lastVals = null;
  for (let depth = 2; depth <= 16; depth++) {
    let iterBest = null, iterVal = -Infinity, alpha = -Infinity;
    const vals = new Map();
    const ordered = [bestMove].concat(moves.filter(m => m !== bestMove));
    for (let k = 0; k < ordered.length; k++) {
      const m = ordered[k];
      e2Place(m.i, botColor);
      const h2 = uPlace(h0, m.r, m.c, botColor);
      let v;
      if (k === 0) v = -e2Search(opp, depth - 1, -Infinity, -alpha, h2, 1);
      else {
        v = -e2Search(opp, depth - 1, -alpha - 1, -alpha, h2, 1);
        if (!uAborted && v > alpha) v = -e2Search(opp, depth - 1, -Infinity, -alpha, h2, 1);
      }
      e2Remove(m.i, botColor);
      if (uAborted) break;
      v += m.score * 1e-7;
      vals.set(m, v);
      if (v > iterVal) { iterVal = v; iterBest = m; }
      if (v > alpha) alpha = v;
    }
    if (uAborted) { if (iterBest && iterBest === ordered[0] && iterVal > -WIN_SCORE / 2) bestMove = iterBest; break; }
    bestMove = iterBest || bestMove; lastVals = vals; uLastDepth = depth;
    if (iterVal >= WIN_SCORE / 2) return bestMove;
    if (Date.now() > searchDeadline - budgetMs * (1 - cardShare) * 0.45) break;
  }
  uAborted = false;

  // 5) 상대 카드까지 수 읽기: 상위 후보마다 "상대가 카드를 쓰고 두는 경우"의 가치를 따져 최악의 경우가 가장 나은 수를 고름
  if (cardShare > 0 && lastVals && lastVals.size > 1) {
    const top = Array.from(lastVals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const each = Math.max(250, Math.floor((t0 + budgetMs - Date.now()) / (top.length * 2)));
    let pick = null, pickVal = -Infinity;
    for (const [m, v0] of top) {
      let v = v0;
      e2Place(m.i, botColor);
      if (oppCards.bomb) {
        // 상대가 내 핵심 돌 1개를 폭파한 뒤 두는 경우
        let key = -1, keyLoss = -Infinity;
        for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
          if (board[r][c] !== botColor) continue;
          const i = r * SIZE + c; e2Remove(i, botColor); const loss = -e2Eval(botColor); e2Place(i, botColor);
          if (loss > keyLoss) { keyLoss = loss; key = i; }
        }
        if (key >= 0) { e2Remove(key, botColor); v = Math.min(v, -e2BestValue(opp, each)); e2Place(key, botColor); }
      }
      if (oppCards.reversal) {
        // 상대가 전세 역전을 쓰면 판이 뒤집히고 내 차례
        const snap = board.map(row => row.slice());
        flipBoard(opp);
        e2Init(blocked); v = Math.min(v, e2BestValue(botColor, each));
        board = snap; e2Init(blocked);
      }
      if (oppCards.sixsense && winLength === 5) {
        winLength = 6; e2Init(blocked); v = Math.min(v, -e2BestValue(opp, each));
        winLength = 5; e2Init(blocked);
      }
      e2Remove(m.i, botColor);
      if (v > pickVal) { pickVal = v; pick = m; }
    }
    if (pick) bestMove = pick;
  }

  // 7) 앞으로 뽑을 카드까지 대비한 모양 조정 (비슷한 가치의 수들 사이에서 고름)
  //    - 맞교환/연속 착수 한 번에 지는 모양이면 감점 (상대 패에 그 카드가 있으면 사실상 지는 수로 취급)
  //    - 내가 맞교환을 쥐고 있으면 다음 턴 교환 한 번으로 이기는 모양에 가점
  const myTrade = cfg && cfg.tradeAttack && !oppCards.blockade && !(cardLockNextTurn && cardLockNextTurn[botColor]) &&
    (hand && hand[botColor] || []).some(c => c.id === 'trade');
  const penT = cfg && cfg.tradeRisk ? (oppCards.trade ? WIN_SCORE / 2 : E2P.tr) : 0;
  const penC = cfg && cfg.chainRisk ? (oppCards.chain ? WIN_SCORE / 2 : E2P.cr) : 0;
  const bonT = myTrade ? E2P.ta : 0;
  if ((penT || penC || bonT) && lastVals && lastVals.size > 1) {
    const bestV = lastVals.get(bestMove);
    const span = Math.max(penT, penC, bonT);
    if (bestV !== undefined && bestV < WIN_SCORE / 2) {
      let pick = bestMove, pickVal = -Infinity;
      for (const [m, v] of lastVals) {
        if (v < bestV - span) continue;
        e2Place(m.i, botColor);
        let adj = v + (m === bestMove ? 1e-6 : 0);
        if (penT && e2TradeRisk(botColor)) adj -= penT;
        if (penC && e2ChainRisk(botColor)) adj -= penC;
        if (bonT && e2TradeRisk(opp)) adj += bonT;
        e2Remove(m.i, botColor);
        if (adj > pickVal) { pickVal = adj; pick = m; }
      }
      bestMove = pick;
    }
  }
  return bestMove;
}

function botChooseMove(botColor) {
  const cfg = botCfg();
  uStyle = null;
  const blocked = makeBlocked();
  const opp = other(botColor);

  if (!cfg.patterns) {
    const cands = collectCandidates(botColor, cfg.radius, blocked, true);
    if (!cands.length) return null;
    const defense = Math.random() < cfg.missChance ? 0.1 : cfg.defense;
    const scored = cands.map(p => ({ r: p.r, c: p.c, score: simpleCellScore(p.r, p.c, botColor, defense) }));
    scored.sort((a, b) => b.score - a.score);
    const pool = scored.slice(0, Math.min(cfg.topN, scored.length));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  if (cfg.engine2) return e2ChooseMove(botColor, blocked, turnPlacementsDone > 0 ? 900 : Math.min(cfg.timeMs, 5000), cfg);
  if (cfg.ultimate) return ultimateChooseMove(botColor, blocked, turnPlacementsDone > 0 ? 900 : (cfg.worker ? Math.min(cfg.timeMs, 5000) : cfg.timeMs), cfg);

  searchDeadline = Date.now() + 1500;
  const root = orderedMoves(botColor, blocked, cfg, 0, true);
  if (root.win) return root.win;
  if (!root.list.length) return null;
  if (root.forced && root.list.length === 1) return root.list[0];

  if (cfg.vcf && !root.forced) {
    const v = vcf(botColor, 8, blocked, true);
    if (v) return v;
  }

  if (cfg.depth <= 0) return root.list[0];

  const moves = root.list.slice(0, cfg.width);
  let best = moves[0], bestVal = -Infinity, alpha = -Infinity;
  for (const m of moves) {
    board[m.r][m.c] = botColor;
    const v = -negamax(opp, cfg.depth - 1, -Infinity, -alpha, blocked, cfg) + m.score * 1e-6; // 동점이면 패턴 점수가 높은 수
    board[m.r][m.c] = EMPTY;
    if (v > bestVal) { bestVal = v; best = m; }
    if (v > alpha) alpha = v;
    if (Date.now() > searchDeadline) break;
  }
  return best;
}

function botPlaceStone(botColor) {
  placeBotPick(botColor, botChooseMove(botColor));
}
// 토끼와 거북이(4목 승리)가 걸려 있으면: 내가 바로 이기는 칸 → 상대가 바로 이기는 칸 막기 (엔진은 4목 승리를 모름)
function lgUrgentMove(botColor) {
  if (!winOver[BLACK] && !winOver[WHITE]) return null;
  if (lg && lg.big === botColor) return null;
  const blk = makeBlocked();
  const mine = findWinCells(botColor, blk[botColor]);
  if (mine.length) return mine[0];
  const opp = other(botColor);
  const theirs = findWinCells(opp, blk[opp]).filter(q => !blk[botColor][q.r * SIZE + q.c]);
  return theirs.length ? theirs[0] : null;
}
function placeBotPick(botColor, pick) {
  const urgent = lgUrgentMove(botColor);
  if (urgent) pick = urgent;
  const noWin = lg && lg.big === botColor; // 대기만성 턴: 승리 줄을 완성하는 칸은 둘 수 없음
  if (pick && noWin && lgWouldWin(pick.r, pick.c, botColor)) pick = null;
  if (pick) handlePlace({ r: pick.r, c: pick.c });
  // 규칙상 거부된 경우(연속 착수 거리 제한 등) 둘 수 있는 자리 중 하나로 대신 둔다
  if ((!pick || board[pick.r][pick.c] === EMPTY) && current === botColor && !gameOver && !draftOpen) {
    const legal = collectCandidates(botColor, 2, null, true).filter(q => !noWin || !lgWouldWin(q.r, q.c, botColor));
    if (legal.length) {
      const alt = legal.map(p => ({ p, s: simpleCellScore(p.r, p.c, botColor, 1) })).sort((a, b) => b.s - a.s)[0].p;
      handlePlace(alt);
    }
  }
}

// ---- 고난이도: 상황을 보고 카드 사용 ----
function listStones(color) {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === color) out.push({ r, c });
  return out;
}

// player가 다음 수에 열린 4(또는 4-4, 4-3)를 만들 수 있는지
function hasOpenFourThreat(player, blocked) {
  for (const p of collectCandidates(player, 2, blocked, false)) {
    if (attackValue(p.r, p.c, player, blocked[player]).score >= P_OPEN4) return true;
  }
  return false;
}
function scanBoardForWinOf(player) {
  const f = scanBoardForWin();
  return f && f.player === player ? f : null;
}

function botUseCardSmart(botColor, after, opts) {
  const opp = other(botColor);
  const blocked = makeBlocked();
  const myWins = findWinCells(botColor, blocked[botColor]);
  if (myWins.length) return false; // 바로 이길 수 있으면 카드 없이 둔다
  const oppWins = findWinCells(opp, blocked[opp]);
  const base = evalBoard(botColor, blocked);
  const oppHasCards = hand[opp].length > 0;
  const reads = botCfg().readCards;
  const oppCards = reads ? readOppCards(botColor) : {};
  let best = null;
  const consider = (idx, value, targets) => { if (value > 0 && (!best || value > best.value)) best = { idx, value, targets }; };
  // 쓰지 않으면 버려질 상황: 패가 꽉 찼고 다음 착수로 카드를 또 받으면 가장 오래된 카드가 소멸
  const handLen = hand[botColor].length;
  const draftSoon = placedCount[botColor] % INTERVAL === INTERVAL - 1;
  const overflowSoon = handLen >= HAND_LIMIT && draftSoon;
  const scale = overflowSoon ? 0.25 : handLen >= 3 ? 0.6 : 1; // 급할수록 사용 기준을 낮춤
  const oppCritical = oppWins.length > 0 || hasOpenFourThreat(opp, blocked);

  // 짱짱맨: 봉쇄에 걸려 있으면 가장 덜 중요한 카드로 무효화를 먼저 소진
  if (reads && cardLockNextTurn[botColor] && hand[botColor].length > 1) {
    const junkOrder = BOT_CARD_PRIORITY.slice().reverse();
    let junk = -1, junkRank = Infinity;
    hand[botColor].forEach((c, i) => { const r = junkOrder.indexOf(c.id); if (r !== -1 && r < junkRank) { junkRank = r; junk = i; } });
    if (junk !== -1) return activateCard(botColor, junk, after);
  }

  const exclude = (opts && opts.exclude) || [];
  hand[botColor].forEach((card, idx) => {
    if (exclude.includes(card.type)) return; // 짱짱맨: 수 읽기로 따로 판단하는 카드
    switch (card.type) {
      case 'chain_move':
        consider(idx, 3000 + (oppWins.length >= 2 ? 50000 : 0));
        break;
      case 'remove_enemy': {
        // 대가가 없으므로 상대 공격의 핵심 돌을 끊는 데 사용 (터진 자리는 2턴간 막힘)
        let bestT = null, bestGain = -Infinity;
        for (const s of listStones(opp)) {
          if (isProtected(s.r, s.c)) continue;
          board[s.r][s.c] = EMPTY;
          blocked[opp][s.r * SIZE + s.c] = 1; blocked[botColor][s.r * SIZE + s.c] = 1;
          const remain = findWinCells(opp, blocked[opp]).length;
          const gain = evalBoard(botColor, blocked) - base - remain * 1e6;
          blocked[opp][s.r * SIZE + s.c] = 0; blocked[botColor][s.r * SIZE + s.c] = 0;
          board[s.r][s.c] = opp;
          if (gain > bestGain) { bestGain = gain; bestT = s; }
        }
        if (!bestT) break;
        if (oppWins.length >= 2) consider(idx, 40000, [bestT]);
        else if (oppCritical && bestGain > 0) consider(idx, 4000 + bestGain, [bestT]); // 상대가 열린 4를 만들 수 있으면 핵심 돌 제거
        else if (bestGain > 700 * scale) consider(idx, 2000 + bestGain, [bestT]);
        break;
      }
      case 'windmill': {
        // 상대가 둬야 할 자리를 풍차로 막는다
        let bestT = null, bestGain = 0;
        for (const s of listStones(botColor)) {
          if (windmillList.some(w => w.r === s.r && w.c === s.c)) continue;
          let gain = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const r = s.r + dr, c = s.c + dc;
            if ((!dr && !dc) || !inBoard(r, c) || board[r][c] !== EMPTY || blocked[opp][r * SIZE + c]) continue;
            gain += Math.min(attackValue(r, c, opp, blocked[opp]).score, P_OPEN4);
          }
          if (gain > bestGain) { bestGain = gain; bestT = s; }
        }
        if (bestT && bestGain >= P_THREE) consider(idx, Math.min(bestGain, 60000), [bestT]);
        break;
      }
      case 'trade': {
        let bestPair = null, bestGain = 0;
        const mine = listStones(botColor), theirs = listStones(opp);
        for (const a of theirs) for (const b of mine) {
          if (!isOrthoAdjacent(a, b) || isProtected(a.r, a.c) || swapMakesLine(a.r, a.c, b.r, b.c)) continue; // 오목/육목이 되는 교환은 불가
          board[a.r][a.c] = botColor; board[b.r][b.c] = opp;
          const gain = evalBoard(botColor, blocked) - base;
          board[a.r][a.c] = opp; board[b.r][b.c] = botColor;
          if (gain > bestGain) { bestGain = gain; bestPair = [a, b]; }
        }
        if (bestPair && bestGain > 900 * scale) consider(idx, bestGain, bestPair); // 턴이 끝나므로 이득이 클 때만
        break;
      }
      case 'six_sense': {
        if (winLength === 6) break;
        winLength = 6;
        const gain = evalBoard(botColor, blocked) - base; // 6목 규칙에서 판세가 얼마나 좋아지는지
        const oppWins6 = findWinCells(opp, blocked[opp]).length;
        winLength = 5;
        if (oppWins.length && !oppWins6) consider(idx, 45000);
        else if (gain > 150 * scale) consider(idx, 300 + gain);
        else if (overflowSoon && idx === 0 && gain > -150) consider(idx, 200); // 버려지기 전에 손해가 크지 않으면 사용
        break;
      }
      case 'reversal': {
        const flipped = -evalBoard(botColor, blocked); // 색이 바뀌면 상대 관점 평가가 내 평가가 됨
        if (flipped - base > Math.max(800, 3000 * scale)) consider(idx, flipped - base);
        break;
      }
      case 'trap': {
        // 상대가 가장 두고 싶어하는 자리 (내가 둘 자리와는 겹치지 않게)
        const cands = collectCandidates(opp, 2, blocked, false)
          .filter(p => !trapList.some(t => t.r === p.r && t.c === p.c))
          .map(p => ({ p, s: attackValue(p.r, p.c, opp, blocked[opp]).score + (botCfg().cardPlan3 ? 1 : -1) * attackValue(p.r, p.c, botColor, blocked[botColor]).score }))
          .sort((a, b) => b.s - a.s);
        if (cands.length) consider(idx, 1500, [cands[0].p]);
        break;
      }
      case 'blockade':
        // 짱짱맨: 상대가 위험한 카드를 쥐고 있으면 먼저 봉쇄
        if (reads && (oppCards.reversal || oppCards.bomb || oppCards.chain || oppCards.sixsense)) consider(idx, 6000);
        else if (reads && botCfg().cardPlan3 && (oppCards.trade || oppCards.infection || oppCards.windmill)) consider(idx, 2500);
        else if (oppHasCards && !(reads && botCfg().cardPlan3)) consider(idx, 1200); // 짱짱맨: 순간이동·지진·알까기·함정뿐이면 아껴 둠
        break;
      case 'infection': {
        if (oppWins.length) break; // 턴이 끝나므로 막아야 할 때는 쓰지 않음
        const targets = getOrthogonalEnemyNeighbors(botColor);
        if (targets.length < 2) break;
        let sum = 0;
        for (const t of targets) {
          board[t.r][t.c] = botColor;
          sum += evalBoard(botColor, blocked) - base;
          board[t.r][t.c] = opp;
        }
        const expected = (sum / targets.length) * Math.min(2, targets.length);
        if (expected > 450 * scale) consider(idx, expected);
        break;
      }
      case 'wall': {
        // 장벽: 상대가 바로 이기는 자리를 내 돌 없이 막음 (둘이면 장벽 하나 + 착수 하나로 둘 다 막음), 아니면 상대 급소를 영구 봉쇄
        const wallSmart = botCfg().wallSmart;
        const cands = collectCandidates(opp, 2, blocked, false)
          .filter(p => !trapList.some(t => t.r === p.r && t.c === p.c))
          .map(p => ({ p, s: attackValue(p.r, p.c, opp, blocked[opp]).score - (wallSmart ? attackValue(p.r, p.c, botColor, blocked[botColor]).score : 0) }))
          .sort((a, b) => b.s - a.s);
        if (oppWins.length >= 2) consider(idx, 46000, [oppWins[0]]);
        else if (cands.length && cands[0].s >= P_OPEN3) consider(idx, 2500 + Math.min(cands[0].s, P_OPEN4) / 100, [cands[0].p]);
        else if (overflowSoon && idx === 0 && cands.length) consider(idx, 300, [cands[0].p]);
        break;
      }
      case 'meteor': {
        // 운석: 보호막 밖의 아무 돌이 무작위 빈 칸으로 날아감 → 원래 자리에서 빠지는 효과의 평균으로 판단 (떨어지는 곳은 무작위라 대부분 영향이 작음)
        const pool = meteorTargets();
        if (!pool.length) break;
        let sum = 0;
        for (const t of pool) {
          const v = board[t.r][t.c];
          board[t.r][t.c] = EMPTY;
          let g = evalBoard(botColor, blocked) - base;
          if (oppWins.length && !findWinCells(opp, blocked[opp]).length) g += 20000;   // 상대 승리 자리가 사라짐
          if (findWinCells(botColor, blocked[botColor]).length < myWins.length) g -= 20000;
          board[t.r][t.c] = v;
          sum += g;
        }
        const exp = sum / pool.length;
        if (exp > 400 * scale) consider(idx, 1000 + exp);
        else if (overflowSoon && idx === 0 && exp > -200) consider(idx, 150);
        break;
      }
      case 'shield': {
        // 짱짱맨: 상대가 쥔 맞교환에 지는 쌍을 실제로 계산해 지킴
        if (reads && (botCfg().cardPlan5 || botCfg().shieldSmart) && oppCards.trade) {
          e2Init(makeBlocked());
          const r0 = oppCards.trade ? e2TradeRisk(botColor) : 0;
          let bestT = null, bestV = 0;
          for (const s2 of listStones(botColor)) {
            shieldList.push({ r: s2.r, c: s2.c, owner: botColor, turns: 3, fresh: true });
            let v = 0;
            if (r0) v += (r0 - e2TradeRisk(botColor)) * 20000;
            shieldList.pop();
            if (v > bestV) { bestV = v; bestT = s2; }
          }
          if (bestT) { consider(idx, 3000 + Math.min(bestV, 40000), [bestT]); break; }
        }
        // 보호막: 상대가 쥔 맞교환·폭파·감염으로 무너질 돌을 지킴
        if (!reads || !(oppCards.trade || oppCards.bomb || oppCards.infection || oppCards.meteor)) {
          if (overflowSoon && idx === 0 && hasStoneOf(botColor)) consider(idx, 200);
          break;
        }
        let bestT = null, bestV = 0;
        for (const s2 of listStones(botColor)) {
          // 주변 3×3에서 내 돌이 맞닿은 상대 돌 수 + 줄 가치로 대략 평가
          let v = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const r = s2.r + dr, c = s2.c + dc;
            if (!inBoard(r, c) || board[r][c] !== botColor) continue;
            board[r][c] = EMPTY; v += Math.max(0, base - evalBoard(botColor, blocked)); board[r][c] = botColor;
          }
          if (v > bestV) { bestV = v; bestT = s2; }
        }
        if (bestT && bestV > 300) consider(idx, 3000 + Math.min(bestV, 30000), [bestT]);
        break;
      }
      case 'earthquake':
      case 'alkkagi':
        // 무작위성이 큰 카드는 불리할 때 판을 흔드는 용도, 곧 버려질 카드면 크게 이기고 있지 않을 때 사용
        if (oppWins.length >= 2 || base < -1500) consider(idx, 800);
        else if (overflowSoon && idx === 0 && base < 1500) consider(idx, 150);
        break;
      case 'teleport': {
        // 곧 버려질 카드면, 판에 가장 도움이 덜 되는 내 돌을 옮김
        if (!(overflowSoon || (handLen >= 3 && idx === 0))) break;
        let bestT = null, leastLoss = Infinity;
        for (const st of listStones(botColor)) {
          board[st.r][st.c] = EMPTY;
          const loss = base - evalBoard(botColor, blocked);
          board[st.r][st.c] = botColor;
          if (loss < leastLoss) { leastLoss = loss; bestT = st; }
        }
        if (bestT && leastLoss < 60) consider(idx, 120, [bestT]);
        break;
      }
    }
  });

  if (!best) return false;
  const choice = best;
  return activateCard(botColor, choice.idx, () => {
    applyBotTargets(botColor, choice.targets);
    if (after) after();
  });
}

// 카드 발동 후 대상 선택이 필요하면 정해 둔 대상(없으면 기본 규칙)으로 처리
function applyBotTargets(botColor, targets) {
  const t = pendingTarget;
  if (!t || t.forPlayer !== botColor) return;
  if (targets && targets.length) {
    for (const pos of targets) {
      if (!pendingTarget) break;
      handleTargetClick(pos);
    }
    if (pendingTarget) cancelTarget();
  } else {
    resolveBotPendingTarget();
  }
}

// 봇의 카드 드래프트: 고난이도는 강한 카드를 우선
const BOT_CARD_PRIORITY = ['chain', 'windmill', 'wall', 'bomb', 'shield', 'trap', 'sixsense', 'trade', 'blockade', 'infection', 'reversal', 'meteor', 'teleport', 'earthquake', 'alkkagi'];
// 봇의 전설 카드 사용: 턴 시작에 조건이 맞고 쓸 만하면 발동 (발동이 끝나면 이어서 착수)
const BOT_MIRROR_OK = ['chain', 'windmill', 'bomb', 'shield', 'trap', 'wall', 'blockade', 'infection', 'sixsense'];
function botLegendTry(botColor) {
  const card = lgCard(botColor);
  if (!card || card.auto || lg.done[botColor] || turnPlacementsDone > 0 || usedCardThisTurn[botColor] && card.id === 'mirror') return false;
  if (!lgProgress(botColor).ok) return false;
  const opp = other(botColor);
  let ok = true;
  if (card.id === 'obelisk') {
    // 상대 돌이 3개 이상 모인 줄이 있을 때만
    ok = false;
    for (const [dr, dc] of DIRS) {
      for (let r = 0; r < SIZE && !ok; r++) for (let c = 0; c < SIZE && !ok; c++) {
        if (inBoard(r - dr, c - dc)) continue; // 줄의 시작 칸에서만
        let n = 0, rr = r, cc = c;
        while (inBoard(rr, cc)) { if (board[rr][cc] === opp && !isProtected(rr, cc)) n++; rr += dr; cc += dc; }
        if (n >= 3) ok = true;
      }
    }
  } else if (card.id === 'chicken') {
    ok = longestRun(opp).len > longestRun(botColor).len || findWinCells(opp, makeBlocked()[opp]).length > 0;
  } else if (card.id === 'mirror') {
    ok = BOT_MIRROR_OK.includes(lg.lastCard[opp]);
  } else if (card.id === 'allin') {
    try { ok = evalBoard(botColor, makeBlocked()) < -800; } catch (e) { ok = false; }
  }
  if (!ok) return false;
  botLegendTurn = true;
  const started = activateLegend(botColor, () => {
    botLegendTurn = false;
    const t = pendingTarget;
    if (t && t.forPlayer === botColor) {
      if (t.type === 'sacrifice') {
        // 덜 중요한 돌(주변에 내 돌이 적은 돌)부터 희생
        const run = longestRun(botColor).cells;
        const cands = listStones(botColor).filter(q => !run.some(x => x.r === q.r && x.c === q.c)).concat(run);
        const score = (q) => { let n = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && inBoard(q.r + dr, q.c + dc) && board[q.r + dr][q.c + dc] === botColor) n++; return n; };
        const pickList = cands.map((q, i) => ({ q, s: score(q) + (i >= cands.length - run.length ? 100 : 0) })).sort((a, b) => a.s - b.s).slice(0, 3);
        for (const x of pickList) if (pendingTarget) handleTargetClick(x.q);
        if (pendingTarget) cancelTarget();
      } else resolveBotPendingTarget();
    }
    scheduleMaybeBotTurn();
  });
  if (!started) botLegendTurn = false;
  return started;
}

// 봇의 전설 카드 선택: 봇이 스스로 조건을 채우기 쉬운 카드 우선
const BOT_LEGEND_PRIORITY = ['king', 'latebloom', 'obelisk', 'clown', 'turtle', 'blind', 'chicken', 'allin', 'nothing', 'mirror', 'sloth', 'nap'];
function botPickDraft(picks, player) {
  if (picks.length && picks[0].legend) {
    if (!botCfg().smartCards) return picks[Math.floor(Math.random() * picks.length)];
    return picks.slice().sort((a, b) => BOT_LEGEND_PRIORITY.indexOf(a.id) - BOT_LEGEND_PRIORITY.indexOf(b.id))[0];
  }
  if (!botCfg().smartCards) return picks[Math.floor(Math.random() * picks.length)];
  const me = player || other(myColor), opp = other(me);
  let base = 0, oppThreat = false;
  try { const blk = makeBlocked(); base = evalBoard(me, blk); oppThreat = hasOpenFourThreat(opp, blk); } catch (e) {}
  // 짱짱맨: 지금 판에서 그 카드가 실제로 무엇을 할 수 있는지 계산해서 가점
  const sit = {};
  if (botCfg().draft2) {
    try {
      e2Init(makeBlocked());
      const oc = readOppCards(me);
      sit.myTradeWin = e2TradeRisk(opp) > 0;    // 맞교환 한 번으로 내가 이기는 쌍이 있음
      sit.oppTradeWin = e2TradeRisk(me) > 0;    // 상대가 맞교환을 뽑으면 지는 쌍이 있음
      sit.myChainWin = e2ChainRisk(opp) > 0;    // 연속 착수 한 턴으로 내가 끝낼 수 있음
      sit.oppChainWin = e2ChainRisk(me) > 0;
      sit.oppDanger = (oc.trade && sit.oppTradeWin) || (oc.chain && sit.oppChainWin) || oc.reversal;
    } catch (e) {}
  }
  const score = (c) => {
    let v = BOT_CARD_PRIORITY.length - BOT_CARD_PRIORITY.indexOf(c.id);
    v -= 4 * hand[me].filter(h => h.id === c.id).length;      // 같은 카드는 겹쳐 쥐지 않음
    if (base < -1500 && (c.id === 'reversal' || c.id === 'earthquake' || c.id === 'alkkagi')) v += 6; // 불리하면 판을 뒤집는 카드
    if (oppThreat && (c.id === 'bomb' || c.id === 'sixsense' || c.id === 'windmill')) v += 4;       // 상대 공격을 끊는 카드
    if (sit.myTradeWin && c.id === 'trade') v += 10;
    if (sit.myChainWin && c.id === 'chain') v += 8;
    if (sit.oppDanger && c.id === 'blockade') v += 9;                                              // 상대가 쥔 결정타를 무효화
    if ((sit.oppTradeWin || sit.oppChainWin) && (c.id === 'bomb' || c.id === 'windmill')) v += 3;  // 약한 모양을 미리 끊을 수단
    return v;
  };
  return picks.slice().sort((a, b) => score(b) - score(a))[0];
}

// ---- 봇의 알까기 발사 판단 ----
function checkBotAlkTurn() {
  if (mode !== 'bot' || !alk || !alk.awaitingLaunch || alk.simulating) return;
  const botColor = other(myColor);
  const flicker = alk.turnOrder[alk.turnIndex];
  if (flicker !== botColor) return;
  setTimeout(botDoAlkFlick, 700);
}

function botDoAlkFlick() {
  if (mode !== 'bot' || !alk || !alk.awaitingLaunch || alk.simulating) return;
  const botColor = other(myColor);
  if (alk.turnOrder[alk.turnIndex] !== botColor) return;
  const ns = alk.physStones[alk.newIndex];
  const oppColor = other(botColor);

  if (botCfg().cardPlan4) {
    // 짱짱맨: 방향·세기 후보를 같은 물리 계산으로 끝까지 굴려 보고, 칸에 고정된 결과 판을 평가해서 가장 좋은 발사
    const best = botBestAlkFlick(botColor, ns);
    if (best) {
      ns.vx = best.vx; ns.vy = best.vy;
      alk.awaitingLaunch = false; alk.simulating = true; alk.frameCount = 0;
      updateStatus();
      requestAnimationFrame(simulateAlkTick);
      return;
    }
  }
  // 상대 돌들의 무게중심을 대충 겨냥 (없으면 보드 중앙), 약간의 무작위 편차 추가
  let sx = 0, sy = 0, n = 0;
  alk.physStones.forEach(s => {
    if (s !== ns && s.color === oppColor) { sx += s.x; sy += s.y; n++; }
  });
  let targetX = n > 0 ? sx / n : GRID_OFFSET_X + GRID_SPAN / 2;
  let targetY = n > 0 ? sy / n : PAD + GRID_SPAN / 2;
  targetX += (Math.random() - 0.5) * CELL * 4;
  targetY += (Math.random() - 0.5) * CELL * 4;

  let dx = targetX - ns.x, dy = targetY - ns.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = CELL * (0.6 + Math.random() * 0.8);
  ns.vx = (dx / dist) * speed;
  ns.vy = (dy / dist) * speed;

  alk.awaitingLaunch = false;
  alk.simulating = true;
  alk.frameCount = 0;
  updateStatus();
  requestAnimationFrame(simulateAlkTick);
}

function botBestAlkFlick(botColor, ns) {
  const opp = other(botColor), idx = alk.physStones.indexOf(ns);
  const saved = { board, windmillList };
  let best = null;
  const t0 = Date.now();
  for (let a = 0; a < 36; a++) {
    const ang = -Math.PI * (0.06 + 0.88 * a / 35); // 위쪽 반원
    for (const sp of [0.5, 0.75, 1.0, 1.3]) {
      if (Date.now() - t0 > 1500) break;
      const stones = alk.physStones.map(s => Object.assign({}, s));
      stones[idx].vx = Math.cos(ang) * CELL * sp; stones[idx].vy = Math.sin(ang) * CELL * sp;
      for (let f = 0; f <= ALK_MAX_FRAMES; f++) { alkPhysStep(stones); if (alkMaxSpeed(stones) < ALK_MIN_SPEED) break; }
      const assign = snapPhysStonesToGrid(stones);
      board = saved.board.map(row => row.map(v => v === WALL ? WALL : EMPTY)); windmillList = [];
      stones.forEach((s, i) => { const p = assign[i]; if (!p) return; board[p.r][p.c] = s.color; if (s.isWindmill) windmillList.push({ r: p.r, c: p.c }); });
      const f = scanFiveWinner();
      const v = f === botColor ? WIN_SCORE : f === opp ? -WIN_SCORE : evalBoard(botColor, makeBlocked());
      if (!best || v > best.v) best = { v, vx: Math.cos(ang) * CELL * sp, vy: Math.sin(ang) * CELL * sp };
    }
  }
  board = saved.board; windmillList = saved.windmillList;
  return best;
}
