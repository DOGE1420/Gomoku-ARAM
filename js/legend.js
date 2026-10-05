// 전설 카드 (게임 시작 때만 고르는 12장)
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

// ================= 전설 카드 =================
function lgPair(v) { return { [BLACK]: v, [WHITE]: v }; }
function lgFresh() {
  return {
    card: lgPair(null), done: lgPair(false),
    plies: 0,                 // 판에 둔 수 (양쪽 합)
    first: lgPair(null),      // 각자 처음 둔 돌
    last: lgPair(null),       // 각자 마지막으로 둔 자리 (따라쟁이)
    lastCard: lgPair(null),   // 각자 마지막으로 쓴 카드 (따라쟁이)
    lost: lgPair(0), lostPos: { [BLACK]: [], [WHITE]: [] }, // 카드 효과로 잃은 돌 (광대의 한 수)
    far: lgPair(0), empty: lgPair(0), edge: lgPair(0), mirror: lgPair(0),
    big: 0, blind: 0,         // 이번 턴에 대기만성 / 눈 감고 두기를 쓴 색
  };
}
// 동기화된 값은 빈 배열·null이 빠져서 오므로 기본 모양에 덮어씀
function lgNorm(d) {
  const out = lgFresh();
  if (!d || typeof d !== 'object') return out;
  for (const k of ['card', 'done', 'first', 'last', 'lastCard', 'lost', 'far', 'empty', 'edge', 'mirror']) {
    if (d[k] && typeof d[k] === 'object') for (const p of [BLACK, WHITE]) if (d[k][p] !== undefined) out[k][p] = d[k][p];
  }
  if (d.lostPos) for (const p of [BLACK, WHITE]) out.lostPos[p] = Array.isArray(d.lostPos[p]) ? d.lostPos[p].slice() : (d.lostPos[p] ? Object.values(d.lostPos[p]) : []);
  out.plies = d.plies || 0; out.big = d.big || 0; out.blind = d.blind || 0;
  return out;
}
function lgReset() {
  lg = lgFresh(); winOver = {}; immuneList = [];
  lgHandAtPlace = null; lgUsedThisTurn = false;
  mpLgReq = null; mpLgRes = null; lgOppHandN = 0; napSince = Date.now();
}
function lgCard(p) { return lg && lg.card[p] ? LEGEND_POOL.find(c => c.id === lg.card[p]) : null; }
function isEdgeCell(r, c) { return r < 2 || c < 2 || r >= SIZE - 2 || c >= SIZE - 2; }
function countStones(p) { let n = 0; for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === p) n++; return n; }
function lgFirstAlive(p) { const f = lg && lg.first[p]; return !!(f && board[f.r][f.c] === p); }
// p의 가장 긴 줄 (같은 색이 연달아 놓인 칸들)
function longestRun(p) {
  let best = { len: 0, cells: [] };
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== p) continue;
    for (const [dr, dc] of DIRS) {
      const pr = r - dr, pc = c - dc;
      if (inBoard(pr, pc) && board[pr][pc] === p) continue; // 줄의 시작에서만 셈
      const cells = [];
      let rr = r, cc = c;
      while (inBoard(rr, cc) && board[rr][cc] === p) { cells.push({ r: rr, c: cc }); rr += dr; cc += dc; }
      if (cells.length > best.len || (cells.length === best.len && Math.random() < 0.5)) best = { len: cells.length, cells };
    }
  }
  return best;
}
function oppHandCount(p) {
  const opp = other(p);
  return mode === 'multiplayer' && opp !== myColor ? lgOppHandN : hand[opp].length;
}

// 착수 기록 (판의 수 · 첫 돌 · 멀리 두기 · 좌우 대칭)
function lgOnPlace(r, c, p) {
  if (!lg) return;
  const opp = other(p);
  lg.plies++;
  if (!lg.first[p]) lg.first[p] = { r, c };
  let near = SIZE;
  for (let rr = 0; rr < SIZE; rr++) for (let cc = 0; cc < SIZE; cc++) if (board[rr][cc] === opp) near = Math.min(near, Math.max(Math.abs(rr - r), Math.abs(cc - c)));
  lg.far[p] = near >= 3 ? lg.far[p] + 1 : 0;
  const lo = lg.last[opp];
  if (lo && lo.r === r && lo.c === SIZE - 1 - c && lo.c !== c) lg.mirror[p]++;
  lg.last[p] = { r, c };
}
// 카드 효과로 p의 돌이 (r,c)에서 사라짐
function lgLose(p, r, c) {
  if (!lg || (p !== BLACK && p !== WHITE)) return;
  lg.lost[p]++;
  if (!lg.lostPos[p].some(q => q.r === r && q.c === c)) lg.lostPos[p].push({ r, c });
}
// 돌 하나 제거 (풍차·영구 보호·기록 정리)
function lgRemoveStone(r, c) {
  board[r][c] = EMPTY;
  windmillList = windmillList.filter(w => !(w.r === r && w.c === c));
  immuneList = immuneList.filter(s => !(s.r === r && s.c === c));
  moveHistory = moveHistory.filter(m => !(m.r === r && m.c === c));
}
// 돌 이동 (풍차·영구 보호·첫 돌 위치도 함께)
function lgMoveStone(r, c, nr, nc) {
  const v = board[r][c];
  board[nr][nc] = v; board[r][c] = EMPTY;
  for (const w of windmillList) if (w.r === r && w.c === c) { w.r = nr; w.c = nc; }
  for (const s of immuneList) if (s.r === r && s.c === c) { s.r = nr; s.c = nc; }
  if (lg && lg.first[v] && lg.first[v].r === r && lg.first[v].c === c) lg.first[v] = { r: nr, c: nc };
  moveHistory = moveHistory.filter(m => !(m.r === r && m.c === c));
  moveHistory.push({ r: nr, c: nc, player: v });
}
// (r,c)에 p 돌을 놓으면 승리 줄이 완성되는지
function lgWouldWin(r, c, p) {
  const keep = board[r][c];
  board[r][c] = p;
  const w = checkWin(r, c, p);
  board[r][c] = keep;
  return !!w;
}

// 조건 진행 상황 { ok, text }
function lgProgress(p) {
  const id = lg && lg.card[p];
  if (!id) return { ok: false, text: '' };
  const opp = other(p);
  switch (id) {
    case 'obelisk': { const n = countStones(p); return { ok: n >= 3 && countStones(opp) > 0, text: t('lg.p.obelisk', { n: Math.min(n, 3) }) }; }
    case 'nothing': return { ok: false, text: t('lg.p.nothing', { n: Math.min(lg.empty[p], 3) }) };
    case 'latebloom': return { ok: lg.plies >= 40, text: t('lg.p.latebloom', { n: Math.min(lg.plies, 40) }) };
    case 'blind': return { ok: lg.far[p] >= 3 && lg.blind !== p, text: t('lg.p.blind', { n: Math.min(lg.far[p], 3) }) };
    case 'clown': return { ok: lg.lost[p] >= 3, text: t('lg.p.clown', { n: Math.min(lg.lost[p], 3) }) };
    case 'chicken': { const a = longestRun(p).len, b = longestRun(opp).len; return { ok: a >= 3 && b >= 3, text: t('lg.p.chicken', { a, b }) }; }
    case 'sloth': return { ok: false, text: t('lg.p.sloth', { n: Math.min(lg.edge[p], 5) }) };
    case 'mirror': {
      const n = Math.min(lg.mirror[p], 3), lc = lg.lastCard[opp];
      return { ok: n >= 3 && !!lc && !usedCardThisTurn[p], text: lc ? t('lg.p.mirrorCard', { n, card: lc }) : t('lg.p.mirror', { n }) };
    }
    case 'nap': return { ok: false, text: t('lg.p.nap') };
    case 'allin': {
      const hidden = mode === 'multiplayer' && p !== myColor;
      const n = hidden ? lgOppHandN : hand[p].length;
      return { ok: !hidden && n >= HAND_LIMIT, text: t('lg.p.allin', { n }) };
    }
    case 'turtle': { const d = countStones(opp) - countStones(p); return { ok: d >= 5 && !winOver[p], text: t('lg.p.turtle', { n: Math.max(0, Math.min(d, 5)) }) }; }
    case 'king': { const alive = lgFirstAlive(p); return { ok: alive && lg.plies >= 20, text: t('lg.p.king', { n: Math.min(lg.plies, 20), s: t(alive ? 'lg.alive' : 'lg.dead') }) }; }
  }
  return { ok: false, text: '' };
}
function canUseLegend(p) {
  const card = lgCard(p);
  if (!card || card.auto || lg.done[p]) return false;
  if (p !== current || gameOver || draftOpen || pendingTarget || alkPhaseActive() || cardAnimBusy || awaitingSide) return false;
  if (mode !== 'local' && p !== myColor && !(mode === 'bot' && p === other(myColor) && botLegendTurn)) return false;
  return lgProgress(p).ok;
}
let botLegendTurn = false; // 봇이 자기 전설 카드를 쓰는 중

function lgFinish(p) {
  lg.done[p] = true;
  lgUsedThisTurn = true;
}
// 수동 전설 카드 발동: 연출 → 효과
function activateLegend(p, after) {
  if (!canUseLegend(p)) return false;
  const id = lg.card[p];
  if (mode === 'multiplayer') {
    mpCardFx = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), card: id, color: p };
    seenCardFxIds.add(mpCardFx.id);
    syncPublicState();
  }
  playCardAnim(id, p, () => {
    useLegend(p, after);
    if (mode === 'multiplayer') { syncPublicState(); savePrivateState(); }
  });
  return true;
}
// 자동 발동: 효과를 바로 적용하고 연출은 보여 주기만 함
function lgFireAuto(p) {
  const card = lgCard(p);
  if (!card || lg.done[p]) return;
  lg.done[p] = true;
  addLog(L('lg.used', { color: p, icon: card.icon, card: card.id }));
  if (mode === 'multiplayer') {
    mpCardFx = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), card: card.id, color: p };
    seenCardFxIds.add(mpCardFx.id);
  }
  if (card.id === 'nothing') lgNothing(p);
  else if (card.id === 'sloth') lgSloth(p);
  else if (card.id === 'nap') {
    turnPlacementsNeeded = Math.max(turnPlacementsNeeded, turnPlacementsDone + 2, 2);
    cardLockNextTurn[other(p)] = true;
    addLog(L('lg.napDone', { color: p }));
  }
  playCardAnim(card.id, p, null);
}

function useLegend(p, after) {
  const card = lgCard(p);
  if (!card || lg.done[p]) { if (after) after(); return; }
  const opp = other(p), C = { color: p };
  const finish = () => { lgFinish(p); addLog(L('lg.used', { color: p, icon: card.icon, card: card.id })); };
  switch (card.id) {
    case 'obelisk':
      pendingTarget = { type: 'sacrifice', forPlayer: p, legend: true, picks: [] };
      enterTargetMode(L('tgt.obelisk', { n: 0 }));
      break;
    case 'latebloom':
      finish();
      lg.big = p;
      turnPlacementsNeeded = Math.max(turnPlacementsNeeded, 5);
      addLog(L('lg.bigOn', C));
      break;
    case 'blind':
      finish();
      lg.blind = p;
      addLog(L('lg.blindOn', C));
      break;
    case 'clown': finish(); lgClown(p); break;
    case 'chicken': finish(); lgChicken(p); break;
    case 'mirror': {
      const src = CARD_POOL.find(c => c.id === lg.lastCard[opp]);
      if (!src || usedCardThisTurn[p]) { addLog(L('lg.mirrorNone', C)); break; }
      finish();
      addLog(L('lg.mirrorDone', { color: p, card: src.id }));
      hand[p].push(src); // 잠깐 5장이 될 수 있음 — 턴이 끝날 때 정리
      updateHandUI(); draw();
      activateCard(p, hand[p].length - 1, after);
      return; // 복사한 카드의 발동이 끝난 뒤 after 호출
    }
    case 'allin': finish(); lgAllin(p); break;
    case 'turtle':
      finish();
      winOver[p] = 4;
      addLog(L('lg.turtleDone', C));
      updateHandUI(); draw();
      passTurn();
      if (after) after();
      return;
    case 'king': finish(); lgKing(p); break;
  }
  updateStatus(); updatePips(); updateHandUI(); draw();
  if (!gameOver && !pendingTarget) endIfBoardWin(true);
  if (after) after();
}

// 🗿 희생한 돌 3개를 고른 뒤: 상대 돌이 가장 많은 줄을 분쇄
function lgObeliskResolve(p, picks) {
  const opp = other(p);
  picks.forEach(q => lgRemoveStone(q.r, q.c));
  const lines = [];
  for (let i = 0; i < SIZE; i++) {
    lines.push(Array.from({ length: SIZE }, (_, k) => ({ r: i, c: k })));
    lines.push(Array.from({ length: SIZE }, (_, k) => ({ r: k, c: i })));
  }
  for (let s = 0; s < SIZE * 2 - 1; s++) {
    const d1 = [], d2 = [];
    for (let r = 0; r < SIZE; r++) { const c1 = s - r, c2 = r - (s - SIZE + 1); if (inBoard(r, c1)) d1.push({ r, c: c1 }); if (inBoard(r, c2)) d2.push({ r, c: c2 }); }
    lines.push(d1, d2);
  }
  let best = [], bestN = 0;
  for (const line of lines) {
    const hits = line.filter(q => board[q.r][q.c] === opp && !isProtected(q.r, q.c));
    if (hits.length > bestN || (hits.length === bestN && hits.length > 0 && Math.random() < 0.5)) { best = hits; bestN = hits.length; }
  }
  if (!bestN) { addLog(L('lg.obeliskNone', { color: p })); return; }
  best.forEach(q => { lgRemoveStone(q.r, q.c); lgLose(opp, q.r, q.c); });
  pruneInvalidTraps(); triggerBoardShake();
  addLog(L('lg.obeliskDone', { color: p, n: bestN }));
}
// 🧘 상대 패를 모두 버리게 하고 그만큼 받음 (멀티: 상대 화면에 요청)
function lgNothing(p) {
  const opp = other(p);
  if (mode === 'multiplayer') {
    mpLgReq = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), by: p };
    return;
  }
  const n = hand[opp].length;
  hand[opp] = [];
  for (let i = 0; i < n; i++) grantRandomCard(p);
  addLog(L('lg.nothingDone', { color: p, n }));
}
// 🤡 잃은 돌을 제자리로 (그 자리의 상대 돌은 가까운 빈 칸으로 밀어냄)
function lgClown(p) {
  const opp = other(p);
  let n = 0;
  for (const q of lg.lostPos[p]) {
    const v = board[q.r][q.c];
    if (v === p || v === WALL) continue;
    if (v === opp) {
      if (isProtected(q.r, q.c)) continue;
      board[q.r][q.c] = EMPTY;
      if (lgWouldWin(q.r, q.c, p)) { board[q.r][q.c] = opp; continue; }
      board[q.r][q.c] = opp;
      const dest = lgNearestEmpty(q.r, q.c, opp);
      if (!dest) continue;
      lgMoveStone(q.r, q.c, dest.r, dest.c);
    } else if (lgWouldWin(q.r, q.c, p)) continue;
    board[q.r][q.c] = p;
    craterList = craterList.filter(cr => !(cr.r === q.r && cr.c === q.c));
    moveHistory.push({ r: q.r, c: q.c, player: p });
    n++;
  }
  lg.lostPos[p] = [];
  pruneInvalidTraps();
  addLog(L('lg.clownDone', { color: p, n }));
}
// (r,c)에서 가장 가까운 빈 칸 (구멍 제외, 그 돌 주인이 승리 줄을 완성하지 않는 칸)
function lgNearestEmpty(r, c, owner) {
  for (let d = 1; d < SIZE; d++) {
    const ring = [];
    for (let rr = r - d; rr <= r + d; rr++) for (let cc = c - d; cc <= c + d; cc++) {
      if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) !== d || !inBoard(rr, cc)) continue;
      if (board[rr][cc] !== EMPTY || isCrater(rr, cc)) continue;
      ring.push({ r: rr, c: cc });
    }
    const ok = shuffle(ring).filter(q => { const v = board[r][c]; board[r][c] = EMPTY; const w = lgWouldWin(q.r, q.c, owner); board[r][c] = v; return !w; });
    if (ok.length) return ok[0];
  }
  return null;
}
// 🍗 동전 던지기: 진 쪽의 가장 긴 줄이 사라짐
function lgChicken(p) {
  const win = Math.random() < 0.5;
  const victim = win ? other(p) : p;
  const run = longestRun(victim);
  let n = 0;
  for (const q of run.cells) if (!isProtected(q.r, q.c)) { lgRemoveStone(q.r, q.c); lgLose(victim, q.r, q.c); n++; }
  pruneInvalidTraps();
  addLog(L(win ? 'lg.chickenWin' : 'lg.chickenLose', { color: p, n }));
}
// 🦥 가장자리 두 줄의 내 돌을 중앙 쪽으로 한 칸씩
function lgSloth(p) {
  const mid = (SIZE - 1) / 2;
  const stones = listStones(p).filter(q => isEdgeCell(q.r, q.c))
    .sort((a, b) => Math.max(Math.abs(a.r - mid), Math.abs(a.c - mid)) - Math.max(Math.abs(b.r - mid), Math.abs(b.c - mid)));
  let n = 0;
  for (const q of stones) {
    const dr = q.r < 2 ? 1 : q.r >= SIZE - 2 ? -1 : 0, dc = q.c < 2 ? 1 : q.c >= SIZE - 2 ? -1 : 0;
    const nr = q.r + dr, nc = q.c + dc;
    if (!inBoard(nr, nc) || board[nr][nc] !== EMPTY || isCrater(nr, nc)) continue;
    lgMoveStone(q.r, q.c, nr, nc);
    if (checkWin(nr, nc, p)) { lgMoveStone(nr, nc, q.r, q.c); continue; }
    n++;
  }
  pruneInvalidTraps();
  addLog(L('lg.slothDone', { color: p, n }));
}
// 🎰 패를 모두 버리고 동전: 상대 돌 절반 or 내 돌 절반
function lgAllin(p) {
  hand[p] = [];
  const win = Math.random() < 0.5;
  const victim = win ? other(p) : p;
  const all = listStones(victim);
  const pool = shuffle(all.filter(q => !isProtected(q.r, q.c)));
  const n = Math.min(pool.length, Math.floor(all.length / 2));
  pool.slice(0, n).forEach(q => { lgRemoveStone(q.r, q.c); lgLose(victim, q.r, q.c); });
  pruneInvalidTraps(); triggerBoardShake();
  addLog(L(win ? 'lg.allinWin' : 'lg.allinLose', { color: p, n }));
}
// 👑 첫 돌 주변 8칸을 내 돌로
function lgKing(p) {
  const f = lg.first[p];
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = f.r + dr, c = f.c + dc;
    if ((!dr && !dc) || !inBoard(r, c) || board[r][c] !== EMPTY || isCrater(r, c)) continue;
    if (lgWouldWin(r, c, p)) continue;
    board[r][c] = p;
    moveHistory.push({ r, c, player: p });
    n++;
  }
  pruneInvalidTraps();
  addLog(L('lg.kingDone', { color: p, n }));
}

// 턴이 끝날 때 (passTurn 처음): 무소유·나무늘보 진행/자동 발동, 이번 턴 효과 정리
function legendTurnEnd(p) {
  if (!lg) return;
  if (lg.big === p) lg.big = 0;
  if (lg.blind === p) lg.blind = 0;
  const counted = mode !== 'multiplayer' || p === myColor; // 멀티: 내 턴은 내 화면에서만 셈 (상대 패는 모름)
  if (counted && !gameOver) {
    const n = lgHandAtPlace !== null ? lgHandAtPlace : hand[p].length;
    lg.empty[p] = n === 0 ? lg.empty[p] + 1 : 0;
    const edgeTurn = !usedCardThisTurn[p] && !lgUsedThisTurn && turnPlacedPositions.length > 0 && turnPlacedPositions.every(q => isEdgeCell(q.r, q.c));
    lg.edge[p] = edgeTurn ? lg.edge[p] + 1 : 0;
    while (hand[p].length > HAND_LIMIT) { const dropped = hand[p].shift(); addLog(L('log.handOverflow', { color: p, card: dropped.id })); }
    const id = lg.card[p];
    if (id === 'nothing' && !lg.done[p] && lg.empty[p] >= 3 && oppHandCount(p) > 0) lgFireAuto(p);
    if (id === 'sloth' && !lg.done[p] && lg.edge[p] >= 5) lgFireAuto(p);
  }
  lgHandAtPlace = null; lgUsedThisTurn = false;
}

// 💤 낮잠 (멀티플레이 전용): 내 턴에 10초 동안 아무 입력이 없으면 발동
let napSince = Date.now(), napKey = '';
function napActivity() { napSince = Date.now(); }
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, napActivity, true));
setInterval(() => {
  if (mode !== 'multiplayer' || !lg || lg.card[myColor] !== 'nap' || lg.done[myColor]) return;
  const key = current + '|' + lg.plies + '|' + usedCardThisTurn[myColor];
  if (key !== napKey) { napKey = key; napSince = Date.now(); return; }
  if (current !== myColor || gameOver || draftOpen || pendingTarget || alkPhaseActive() || cardAnimBusy || startupQueue) { napSince = Date.now(); return; }
  if (turnPlacementsDone > 0 || pendingPlacement || pendingCardUse || pendingTargetCell) { napSince = Date.now(); return; }
  if (Date.now() - napSince < 10000) return;
  lgFireAuto(myColor);
  updateStatus(); updatePips(); updateHandUI(); draw();
  syncPublicState();
}, 500);

// 멀티플레이: 상대의 무소유 요청에 내 패를 비우고 응답 / 내 요청의 응답으로 카드를 받음
function handleLegendSync(data) {
  mpLgReq = data.lgReq || null;
  mpLgRes = data.lgRes || null;
  const rq = data.lgReq;
  if (rq && rq.id !== lastSeenLgReqId) {
    lastSeenLgReqId = rq.id;
    if (rq.by !== myColor && !(data.lgRes && data.lgRes.id === rq.id)) {
      const n = (hand[myColor] || []).length;
      hand[myColor] = [];
      addLog(L('lg.nothingLost', { n }));
      mpLgRes = { id: rq.id, to: rq.by, n };
      savePrivateState();
      dbApi.updatePath('games/' + roomCode, { lgRes: mpLgRes, ['handN/' + myColor]: 0 }).catch(() => {});
    }
  }
  const rs = data.lgRes;
  if (rs && rs.id !== lastSeenLgResId && rs.to === myColor) {
    lastSeenLgResId = rs.id;
    for (let i = 0; i < (rs.n || 0); i++) grantRandomCard(myColor);
    addLog(L('lg.nothingDone', { color: myColor, n: rs.n || 0 }));
    savePrivateState();
  }
}

function undo() {
  if (gameOver || draftOpen || pendingTarget || alk || moveHistory.length === 0) return;
  const last = moveHistory.pop();
  board[last.r][last.c] = EMPTY;
  if (last.counted !== false) placedCount[last.player] = Math.max(0, placedCount[last.player] - 1);
  current = last.player;
  turnPlacementsDone = 0;
  turnPlacementsNeeded = 1;
  turnPlacedPositions = [];
  lastMovePos = moveHistory.length > 0 ? { r: moveHistory[moveHistory.length - 1].r, c: moveHistory[moveHistory.length - 1].c } : null;
  updateStatus(); updatePips(); updateHandUI(); draw();
}
