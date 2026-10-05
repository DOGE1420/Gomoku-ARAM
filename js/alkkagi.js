// 알까기 모드 (물리 계산·조준·멀티플레이 관전)
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

// ================= 알까기 =================
function buildPhysFromBoard() {
  const list = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (isStone(board[r][c])) {
      const p = cellCenter(r, c);
      list.push({ x: p.x, y: p.y, vx: 0, vy: 0, color: board[r][c], isNew: false, isWindmill: windmillList.some(w => w.r === r && w.c === c) });
    }
  }
  return list;
}

function addNewFlickStone(player) {
  const ns = { x: GRID_OFFSET_X + GRID_SPAN / 2, y: PAD + GRID_SPAN + EXTRA_BOTTOM / 2, vx: 0, vy: 0, color: player, isNew: true, isWindmill: false };
  alk.physStones.push(ns);
  alk.newIndex = alk.physStones.length - 1;
  alk.awaitingLaunch = true;
  alk.dragging = false;
  alk.dragCurrent = null;
}

function startAlkkagi(player) {
  const opp = other(player);
  alkHandoff = null;
  alk = {
    turnOrder: [player, opp],
    turnIndex: 0,
    physStones: buildPhysFromBoard(),
    simulating: false,
    awaitingLaunch: true,
    dragging: false,
    dragCurrent: null,
    frameCount: 0,
  };
  addNewFlickStone(player);
  updateStatus(); updateHandUI(); draw();
  checkBotAlkTurn();
}

function beginMyAlkTurn(turnOrder, turnIndex) {
  alkHandoff = null;
  alk = {
    turnOrder: turnOrder,
    turnIndex: turnIndex,
    physStones: buildPhysFromBoard(),
    simulating: false,
    awaitingLaunch: true,
    dragging: false,
    dragCurrent: null,
    frameCount: 0,
  };
  addNewFlickStone(myColor);
  updateStatus(); updateHandUI(); draw();
}

function tryStartDrag(pos) {
  if (!alk || !alk.awaitingLaunch || alk.simulating) return;
  const ns = alk.physStones[alk.newIndex];
  if (Math.hypot(pos.x - ns.x, pos.y - ns.y) <= CELL * 0.9) {
    alk.dragging = true;
    alk.dragCurrent = pos;
    sendAlkAim(pos, true);
    draw();
  }
}
function updateDrag(pos) {
  if (!alk || !alk.dragging) return;
  alk.dragCurrent = pos;
  sendAlkAim(pos, false);
  draw();
}

// ---- 멀티플레이 알까기 관전: 조준 위치는 가끔, 발사는 출발 상태 전체를 한 번 전송 ----
let lastAimSent = 0;
function sendAlkAim(pos, force) {
  if (mode !== 'multiplayer' || !dbApi || !roomCode || !alk) return;
  const now = Date.now();
  if (!force && now - lastAimSent < 150) return;
  lastAimSent = now;
  const aim = pos ? { turnIndex: alk.turnIndex, color: myColor, x: Math.round(pos.x), y: Math.round(pos.y) } : null;
  dbApi.updatePath('games/' + roomCode, { alkAim: aim }).catch(() => {});
}
function broadcastAlkLaunch() {
  if (mode !== 'multiplayer' || !alk) return;
  mpAlkLaunch = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    turnIndex: alk.turnIndex, color: myColor,
    stones: alk.physStones.map(s => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, color: s.color, isNew: !!s.isNew, isWindmill: !!s.isWindmill })),
  };
  syncPublicState();
}

// 상대가 알까기 중일 때 내 화면에 보여줄 상태 { physStones, newIndex, turnIndex, aim, playing, frame }
function updateAlkSpectate(data) {
  if (mode !== 'multiplayer') { alkView = null; return; }
  const launch = data.alkLaunch;
  if (launch && launch.id !== lastSeenLaunchId && launch.color !== myColor && Array.isArray(launch.stones)) {
    lastSeenLaunchId = launch.id;
    alkView = { physStones: launch.stones.map(s => Object.assign({}, s)), playing: true, frame: 0, aim: null };
    requestAnimationFrame(spectateAlkTick);
    return;
  }
  if (alkView && alkView.playing) return;
  const turnOrder = data.alkTurnOrder, turnIndex = data.alkTurnIndex;
  const flicker = data.alkActive && turnOrder && typeof turnIndex === 'number' ? turnOrder[turnIndex] : null;
  if (!flicker || flicker === myColor) { alkView = null; return; }
  if (!alkView || alkView.turnIndex !== turnIndex) {
    // 동기화된 판에서 상대가 쏠 돌의 출발 상태를 똑같이 만든다
    const phys = buildPhysFromBoard();
    phys.push({ x: GRID_OFFSET_X + GRID_SPAN / 2, y: PAD + GRID_SPAN + EXTRA_BOTTOM / 2, vx: 0, vy: 0, color: flicker, isNew: true, isWindmill: false });
    alkView = { physStones: phys, newIndex: phys.length - 1, turnIndex, playing: false, aim: null };
  }
  const aim = data.alkAim;
  alkView.aim = aim && aim.turnIndex === turnIndex && aim.color === flicker ? aim : null;
}
function spectateAlkTick() {
  if (!alkView || !alkView.playing) return;
  alkPhysStep(alkView.physStones);
  alkView.frame++;
  draw();
  if (alkMaxSpeed(alkView.physStones) < ALK_MIN_SPEED || alkView.frame > ALK_MAX_FRAMES) {
    // 재생이 끝나면 발사한 쪽이 보낸 최종 판으로 맞춘다
    alkView = null;
    if (lastPublicData) { updateAlkSpectate(lastPublicData); syncAlkFromPublic(lastPublicData); }
    updateStatus(); updatePips(); updateHandUI(); draw();
  } else {
    requestAnimationFrame(spectateAlkTick);
  }
}
function releaseDrag(pos) {
  if (!alk || !alk.dragging) return;
  alk.dragging = false;
  const ns = alk.physStones[alk.newIndex];
  let pullX = pos.x - ns.x, pullY = pos.y - ns.y;
  let pullDist = Math.hypot(pullX, pullY);
  const MAXPULL = CELL * 4;
  if (pullDist > MAXPULL) { pullX *= MAXPULL / pullDist; pullY *= MAXPULL / pullDist; pullDist = MAXPULL; }
  if (pullDist < 6) { alk.dragCurrent = null; sendAlkAim(null, true); draw(); return; } // 너무 약하면 다시 시도
  const POWER = 0.32;
  ns.vx = -pullX * POWER; ns.vy = -pullY * POWER;
  alk.awaitingLaunch = false;
  alk.simulating = true;
  alk.frameCount = 0;
  alk.dragCurrent = null;
  broadcastAlkLaunch();
  updateStatus();
  requestAnimationFrame(simulateAlkTick);
}

const ALK_MIN_SPEED = 0.05, ALK_MAX_FRAMES = 480;
function simulateAlkTick() {
  if (!alk || !alk.simulating) return;
  const stones = alk.physStones;
  alkPhysStep(stones);
  draw();
  alk.frameCount++;
  if (alkMaxSpeed(stones) < ALK_MIN_SPEED || alk.frameCount > ALK_MAX_FRAMES) {
    alk.simulating = false;
    finishAlkFlick();
  } else {
    requestAnimationFrame(simulateAlkTick);
  }
}

function alkMaxSpeed(stones) { return stones.reduce((m, s) => Math.max(m, Math.hypot(s.vx, s.vy)), 0); }

// 알까기 물리 한 프레임 (무작위 요소 없음 — 같은 입력이면 어느 화면에서나 같은 움직임)
function alkPhysStep(stones) {
  const FRICTION = 0.965;

  for (const s of stones) { s.x += s.vx; s.y += s.vy; s.vx *= FRICTION; s.vy *= FRICTION; }

  for (const s of stones) { s.x += s.vx; s.y += s.vy; s.vx *= FRICTION; s.vy *= FRICTION; }

  for (const s of stones) {
    if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx) * 0.6; }
    if (s.x > DIM_W - R) { s.x = DIM_W - R; s.vx = -Math.abs(s.vx) * 0.6; }
    if (s.y < R) { s.y = R; s.vy = Math.abs(s.vy) * 0.6; }
    if (s.y > DIM_H - R) { s.y = DIM_H - R; s.vy = -Math.abs(s.vy) * 0.6; }
  }

  for (let i = 0; i < stones.length; i++) {
    for (let j = i + 1; j < stones.length; j++) {
      const a = stones[i], b = stones[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const minDist = R * 2;
      if (dist < minDist) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = (minDist - dist) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const avn = a.vx * nx + a.vy * ny, bvn = b.vx * nx + b.vy * ny;
        const avtx = a.vx - avn * nx, avty = a.vy - avn * ny;
        const bvtx = b.vx - bvn * nx, bvty = b.vy - bvn * ny;
        a.vx = avtx + bvn * nx; a.vy = avty + bvn * ny;
        b.vx = bvtx + avn * nx; b.vy = bvty + avn * ny;
      }
    }
  }
}

function snapPhysStonesToGrid(physStones) {
  const candidates = [];
  const wallCells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === WALL) wallCells.push(r + ',' + c);
  for (let si = 0; si < physStones.length; si++) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const p = cellCenter(r, c);
      const dist = Math.hypot(physStones[si].x - p.x, physStones[si].y - p.y);
      candidates.push({ si, r, c, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);
  const assignedStone = new Array(physStones.length).fill(false);
  const takenCell = new Set(wallCells);
  const result = new Array(physStones.length);
  let remaining = physStones.length;
  for (const cand of candidates) {
    if (remaining === 0) break;
    if (assignedStone[cand.si]) continue;
    const key = cand.r + ',' + cand.c;
    if (takenCell.has(key)) continue;
    assignedStone[cand.si] = true;
    takenCell.add(key);
    result[cand.si] = { r: cand.r, c: cand.c };
    remaining--;
  }
  return result;
}

function finishAlkFlick() {
  const assign = snapPhysStonesToGrid(alk.physStones);
  const wallsKeep = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === WALL) wallsKeep.push({ r, c });
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  wallsKeep.forEach(w => { board[w.r][w.c] = WALL; });
  windmillList = [];
  moveHistory = [];
  let newStonePos = null;
  alk.physStones.forEach((s, i) => {
    const pos = assign[i];
    if (!pos) return; // 보드가 가득 찬 극단적 상황 안전장치
    board[pos.r][pos.c] = s.color;
    moveHistory.push({ r: pos.r, c: pos.c, player: s.color });
    if (s.isWindmill) windmillList.push({ r: pos.r, c: pos.c });
    if (s.isNew) newStonePos = pos;
  });
  if (newStonePos) lastMovePos = newStonePos;
  pruneInvalidTraps();
  pruneCraters();
  draw();

  const turnOrder = alk.turnOrder;
  const nextIndex = alk.turnIndex + 1;
  const phaseDone = nextIndex >= turnOrder.length;

  if (mode === 'multiplayer') {
    if (phaseDone) {
      alk = null; alkHandoff = null;
      addLog(L('log.alkEnd'));
    } else {
      alk = null;
      alkHandoff = { turnOrder: turnOrder, turnIndex: nextIndex };
      addLog(L('log.alkTurn', { color: turnOrder[nextIndex] }));
    }
    syncPublicState();
    savePrivateState();
    if (phaseDone) {
      if (!hasEmptyCell()) { gameOver = true; showBanner(L('banner.draw')); draw(); return; }
      if (endIfBoardWin()) return;
    }
    updateStatus(); updatePips(); updateHandUI(); draw();
    return;
  }

  // ---- 로컬 / 봇 모드: 한 화면에서 이어서 진행 ----
  if (!phaseDone) {
    const nextPlayer = turnOrder[nextIndex];
    alk.turnIndex = nextIndex;
    alk.physStones = buildPhysFromBoard();
    addNewFlickStone(nextPlayer);
    addLog(L('log.alkTurn', { color: nextPlayer }));
    updateStatus(); draw();
    checkBotAlkTurn();
  } else {
    alk = null;
    addLog(L('log.alkEnd'));
    if (!hasEmptyCell()) {
      gameOver = true; showBanner(L('banner.draw')); draw(); return;
    }
    if (endIfBoardWin()) return;
    updateStatus(); updatePips(); updateHandUI(); draw();
  }
}
