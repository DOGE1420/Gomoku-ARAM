// 게임 진행: 화면 요소·상태, 초기화, 그리기, 착수·턴, 카드 뽑기·사용
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

const PLACE_SOUND = new Audio(PLACE_SOUND_SRC);
PLACE_SOUND.preload = 'auto';
function playPlaceSound() {
  try {
    const s = PLACE_SOUND.cloneNode();
    s.volume = 1;
    s.play().catch(() => {});
  } catch (e) {}
}

const canvas = document.getElementById('board');
const boardWrapEl = document.querySelector('.board-wrap');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = DIM_W * dpr; canvas.height = DIM_H * dpr;
canvas.style.width = DIM_W + 'px'; canvas.style.aspectRatio = DIM_W + ' / ' + DIM_H; // 높이는 고정하지 않음: 모바일에서 폭이 줄면 비율 유지하며 함께 축소
ctx.scale(dpr, dpr);

const statusText = document.getElementById('status-text');
const turnDot = document.getElementById('turn-dot');
const winLenBadge = document.getElementById('win-length-badge');
const banner = document.getElementById('banner');
const undoBtn = document.getElementById('undo-btn');
const resetBtn = document.getElementById('reset-btn');
const sideOverlay = document.getElementById('side-overlay');
let awaitingSide = false; // 봇전에서 선후공 선택을 기다리는 중
const rematchBar = document.getElementById('rematch-bar');
const rematchText = document.getElementById('rematch-text');
const rematchOptions = document.getElementById('rematch-options');
const cancelBtn = document.getElementById('cancel-btn');
const confirmBar = document.getElementById('confirm-bar');
const confirmText = document.getElementById('confirm-text');
const confirmYesBtn = document.getElementById('confirm-yes-btn');
const confirmNoBtn = document.getElementById('confirm-no-btn');
const pipRow = document.getElementById('pip-row');
const logPanel = document.getElementById('log-panel');
const chatPanel = document.getElementById('chat-panel');
const chatList = document.getElementById('chat-list');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const draftOverlay = document.getElementById('draft-overlay');
const draftTitle = document.getElementById('draft-title');
const draftSubEl = document.querySelector('#draft-overlay .draft-sub');
const draftCardsEl = document.getElementById('draft-cards');
const handRow1 = document.getElementById('hand-row-1');
const handRow2 = document.getElementById('hand-row-2');
const handCards1 = document.getElementById('hand-cards-1');
const handCards2 = document.getElementById('hand-cards-2');
const legendSlot1 = document.getElementById('legend-slot-1'), legendSlot2 = document.getElementById('legend-slot-2');

const menuScreen = document.getElementById('menu-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const subText = document.getElementById('sub-text');
const menuNote = document.getElementById('menu-note');
const modeLocalBtn = document.getElementById('mode-local-btn');
const modeBotBtn = document.getElementById('mode-bot-btn');
const modeMpBtn = document.getElementById('mode-mp-btn');
const lobbyBackBtn = document.getElementById('lobby-back-btn');
const gameBackBtn = document.getElementById('game-back-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinCodeInput = document.getElementById('join-code-input');
const lobbyStatus = document.getElementById('lobby-status');

let board, current, moveHistory, gameOver, winLine, winLength, lastMovePos;
let placedCount, hand, usedCardThisTurn, turnPlacementsDone, turnPlacementsNeeded;
let pendingTarget, draftOpen, draftPlayer, logLines, windmillList;
let alk; // 알까기 상태 (내가 지금 발사할 차례일 때만 채워짐)
let alkHandoff; // 멀티플레이: 알까기가 진행 중이지만 지금은 내 차례가 아닐 때 { turnOrder, turnIndex }
function alkPhaseActive() { return !!alk || !!alkHandoff; }
let turnPlacedPositions = []; // 이번 턴에 이미 둔 자리들 (연속 착수 간격 제한용)
let pendingPlacement = null;  // { r, c } — 확인 대기 중인 착수 미리보기
let pendingCardUse = null;    // { player, idx } — 확인 대기 중인 카드 사용
let pendingTargetCell = null; // { r, c } — 확인 대기 중인 카드 대상 선택
let trapList; // { r, c, owner }[]
// 폭파 구멍: 터진 자리 { r, c, turns, fresh } — 폭파한 턴 + 이후 2턴 동안 누구도 착수 불가
let craterList = [];
// 보호막: { r, c, owner, turns, fresh } — 중심 주변 3×3 안의 owner 돌을 보호 (폭파 구멍과 같은 방식으로 턴마다 줄어듦)
let shieldList = [];
// 강탈 (멀티플레이: 상대 패는 상대 화면에만 있으므로 요청 → 상대 화면이 1장 내줌 → 응답)
let mpStealReq = null, mpStealRes = null, lastSeenStealReqId = null, lastSeenStealResId = null;
// 멀티플레이 알까기 관전: 내가 보낸 발사 정보 / 상대 알까기를 내 화면에 재현하는 상태
let mpAlkLaunch = null;
let alkView = null, lastSeenLaunchId = null, lastPublicData = null;
// 카드 발동 연출
let cardAnimBusy = false, cardAnimRemote = false, deferredSnapshot = null;
let mpCardFx = null, lastSeenCardFxId = null, seenCardFxIds = new Set();
let cardAnimInstant = false; // 테스트용: 연출 없이 바로 진행
let reduceMotion = false;
try {
  const saved = localStorage.getItem('omok_reduce_motion');
  reduceMotion = saved === null ? !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) : saved === '1';
} catch (e) {}
function isCrater(r, c) { return craterList.some(cr => cr.r === r && cr.c === c); }
// (r,c)의 돌이 그 돌 주인의 보호막 안에 있는지
function isProtected(r, c) {
  const v = board[r][c];
  if (v !== BLACK && v !== WHITE) return false;
  for (const s of shieldList || []) if (s.owner === v && Math.abs(s.r - r) <= 1 && Math.abs(s.c - c) <= 1) return true;
  for (const s of immuneList || []) if (s.owner === v && s.r === r && s.c === c) return true; // 눈 감고 두기로 둔 돌
  return false;
}
// 전세 역전: user가 쓰면 판의 흑·백이 뒤바뀌되, 상대(user가 아닌 쪽) 보호막 안의 돌은 그대로
function flipBoard(user) {
  const keep = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (isStone(board[r][c]) && board[r][c] !== user && isProtected(r, c)) keep.push(r * SIZE + c);
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (keep.includes(r * SIZE + c)) continue;
    if (board[r][c] === BLACK) board[r][c] = WHITE; else if (board[r][c] === WHITE) board[r][c] = BLACK;
  }
}
function tickShields() {
  shieldList = (shieldList || []).filter(s => {
    if (s.fresh) { s.fresh = false; return true; }
    s.turns--;
    return s.turns > 0;
  });
}
// 턴이 넘어갈 때 호출: 폭파한 턴이 끝나면(fresh) 그대로 두고, 이후 턴마다 1씩 줄여 0이 되면 제거
function tickCraters() {
  craterList = craterList.filter(cr => {
    if (cr.fresh) { cr.fresh = false; return true; }
    cr.turns--;
    return cr.turns > 0;
  });
}
// 알까기·지진 등으로 돌이 들어간 구멍은 메워진 것으로 처리
function pruneCraters() { craterList = craterList.filter(cr => board[cr.r][cr.c] === EMPTY); }
let cardLockNextTurn; // { [BLACK]: bool, [WHITE]: bool } — 다음 턴 카드 사용 봉쇄
let skipNextTurn; // { [BLACK]: bool, [WHITE]: bool } — 폭파/전세역전 대가로 다음 내 턴을 건너뜀
let startupQueue; // 게임 시작 시 초기 카드 뽑기 순서 (흑→백)
let draftAfterTurn = null; // 연속 착수 중에 카드 받을 차례가 되면, 이번 턴의 수를 다 둔 뒤 카드 선택 (그 색)
let tut = null;   // 튜토리얼 진행 { step } (로컬 모드 위에서 정해진 국면만 보여줌)
// 전설 카드 진행 상태 (멀티플레이에서는 공개 상태로 동기화)
let lg = null;
let winOver = {};     // { [색]: 4 } — 토끼와 거북이: 그 색만 정확히 4개로도 승리
let immuneList = [];  // { r, c, owner }[] — 눈 감고 두기로 둔 영구 보호 돌
let lgHandAtPlace = null, lgUsedThisTurn = false; // 이번 턴: 마지막 착수 때 패 장수(새로 고른 카드 전) / 전설 사용 여부
let mpLgReq = null, mpLgRes = null, lastSeenLgReqId = null, lastSeenLgResId = null, lgOppHandN = 0;

// ---- 모드 / 멀티플레이 상태 ----
let mode = 'local'; // 'local' | 'bot' | 'multiplayer'
let myColor = BLACK; // bot·멀티플레이에서 내가 조작하는 색
let dbApi = null, myUserId = null;
let roomCode = null;
let unsubPublic = null;
let mpPlayers = { [BLACK]: null, [WHITE]: null };
let mpNotice = null, mpNoticeSeq = 0, lastSeenNoticeSeq = 0, mpBannerText = null;
let mpShakeSeq = 0, lastSeenShakeSeq = 0;
let mpRestartSeq = 0, lastSeenRestartSeq = 0;

function getCardPool() {
  return CARD_POOL; // 모든 모드에서 알까기 포함
}

function waitForFb(timeoutMs) {
  return new Promise((resolve) => {
    if (window.__fb) { resolve(window.__fb); return; }
    const onReady = () => { window.removeEventListener('fb-ready', onReady); resolve(window.__fb); };
    window.addEventListener('fb-ready', onReady);
    setTimeout(() => resolve(window.__fb || { ready: false }), timeoutMs || 6000);
  });
}

function getOrCreateClientId() {
  let id = null;
  try { id = localStorage.getItem('omok_client_id'); } catch (e) {}
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem('omok_client_id', id); } catch (e) {}
  }
  return id;
}

async function initCapabilities() {
  const fb = await waitForFb();
  dbApi = fb && fb.ready ? fb : null;
  myUserId = dbApi ? getOrCreateClientId() : null;
  if (!dbApi) {
    modeMpBtn.disabled = true;
    setMenuNote(L('menu.mpFail'));
  }
}
initCapabilities();

let currentScreen = 'menu';
function showScreen(name) {
  currentScreen = name;
  menuScreen.style.display = name === 'menu' ? 'flex' : 'none';
  lobbyScreen.style.display = name === 'lobby' ? 'flex' : 'none';
  gameScreen.style.display = name === 'game' ? 'flex' : 'none';
  subText.style.display = name === 'game' ? 'block' : 'none';
}

function other(p) { return p === BLACK ? WHITE : BLACK; }
function isStone(v) { return v === BLACK || v === WHITE; }

function init() {
  engineToken++; engineBusy = false;
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  current = BLACK;
  moveHistory = [];
  gameOver = false;
  winLine = null;
  winLength = 5;
  lastMovePos = null;
  windmillList = [];
  placedCount = { [BLACK]: 0, [WHITE]: 0 };
  hand = { [BLACK]: [], [WHITE]: [] };
  usedCardThisTurn = { [BLACK]: false, [WHITE]: false };
  turnPlacementsDone = 0;
  turnPlacementsNeeded = 1;
  turnPlacedPositions = [];
  pendingTarget = null;
  draftOpen = false;
  draftPlayer = null;
  logLines = [];
  alk = null;
  alkHandoff = null;
  pendingPlacement = null;
  pendingCardUse = null;
  pendingTargetCell = null;
  trapList = [];
  craterList = [];
  shieldList = []; mpStealReq = null; mpStealRes = null;
  alkView = null; mpAlkLaunch = null;
  cardLockNextTurn = { [BLACK]: false, [WHITE]: false };
  skipNextTurn = { [BLACK]: false, [WHITE]: false };
  lgReset();
  mpNotice = null; mpNoticeSeq = 0; lastSeenNoticeSeq = 0; mpBannerText = null;
  mpShakeSeq = 0; lastSeenShakeSeq = 0;
  mpRestartSeq = 0; lastSeenRestartSeq = 0;
  banner.classList.remove('show'); lastBannerMsg = null;
  draftOverlay.classList.remove('show');
  winLenBadge.classList.remove('show');
  updateLog();
  draw();
  sideOverlay.classList.toggle('show', awaitingSide);
  if (awaitingSide) {
    // 봇전: 선후공을 고른 뒤에 카드 드래프트와 게임 시작
    statusText.textContent = t('side.prompt');
    updateHandUI();
    return;
  }
  if (tut) { startupQueue = null; updateStatus(); updatePips(); updateHandUI(); draw(); return; } // 튜토리얼은 시작 카드 없음
  startupQueue = mode === 'multiplayer' ? [myColor] : [BLACK, WHITE];
  runStartupDraft();
}


function renderRematchBar() {
  const show = loserPicksSide();
  rematchBar.hidden = !show;
  if (!show) return;
  const iLost = bannerWinner(lastBannerMsg) !== myColor;
  rematchText.textContent = iLost ? t('rematch.loser') : t('rematch.winner');
  rematchOptions.hidden = !iLost;
}

function turnText() {
  let s = t('status.turn', { color: current });
  if (mode === 'multiplayer') s += current === myColor ? t('status.mine') : t('status.opp');
  return s;
}

function updateStatus() {
  if (mode === 'bot') scheduleMaybeBotTurn();
  undoBtn.style.display = mode === 'multiplayer' ? 'none' : 'inline-block';
  resetBtn.style.display = ((mode === 'multiplayer' && !gameOver) || loserPicksSide()) ? 'none' : 'inline-block';
  renderRematchBar();
  if (gameOver) return;
  if (awaitingSide) { statusText.textContent = t('side.prompt'); return; }
  if (alk) { updateAlkStatus(); return; }
  if (alkHandoff) {
    const flicker = alkHandoff.turnOrder[alkHandoff.turnIndex];
    turnDot.className = 'turn-dot ' + (flicker === BLACK ? 'black' : 'white');
    statusText.classList.remove('targeting');
    statusText.classList.add('alkkagi');
    statusText.textContent = t('status.alkOther', { color: flicker });
    cancelBtn.classList.remove('show');
    return;
  }
  statusText.classList.remove('targeting', 'alkkagi');
  turnDot.className = 'turn-dot ' + (current === BLACK ? 'black' : 'white');
  statusText.textContent = turnText();
  cancelBtn.classList.remove('show');
  const turtles = [BLACK, WHITE].filter(p => winOver[p]).map(p => t('rule.turtle', { color: p }));
  winLenBadge.textContent = (winLength !== 5 ? [t('rule.len', { n: winLength })] : []).concat(turtles).join(' · ');
  winLenBadge.classList.toggle('show', winLength !== 5 || turtles.length > 0);
}

function updateAlkStatus() {
  const flicker = alk.turnOrder[alk.turnIndex];
  turnDot.className = 'turn-dot ' + (flicker === BLACK ? 'black' : 'white');
  statusText.classList.remove('targeting');
  statusText.classList.add('alkkagi');
  statusText.textContent = alk.simulating
    ? t('alk.running')
    : t('alk.prompt', { color: flicker });
  cancelBtn.classList.remove('show');
}

function updatePips() {
  if (gameOver || alk || alkHandoff) return;
  const filled = placedCount[current] % INTERVAL;
  pipRow.innerHTML = '';
  for (let i = 0; i < INTERVAL; i++) {
    const span = document.createElement('span');
    span.className = 'pip' + (i < filled ? ' filled' : '');
    pipRow.appendChild(span);
  }
}

function addLog(text) {
  logLines.unshift(text);
  logLines = logLines.slice(0, 100);
  updateLog();
}
function updateLog() {
  logPanel.innerHTML = '';
  if (logLines.length === 0) {
    const li = document.createElement('li');
    li.className = 'log-empty';
    li.textContent = t('log.empty');
    logPanel.appendChild(li);
    return;
  }
  for (const line of logLines) {
    const li = document.createElement('li');
    li.textContent = fmt(line);
    logPanel.appendChild(li);
  }
}

function updateHandUI() {
  handRow1.classList.toggle('active-turn', current === BLACK && !gameOver && !alk);
  handRow2.classList.toggle('active-turn', current === WHITE && !gameOver && !alk);
  renderHand(BLACK, handCards1);
  renderHand(WHITE, handCards2);
  renderLegend(BLACK, legendSlot1);
  renderLegend(WHITE, legendSlot2);
  if (cardDetailFor) renderCardDetail(); // 열린 설명 창도 지금 상태(사용 가능 여부)로 갱신
}

function canUseCardNow(player) {
  return player === current && !gameOver && !draftOpen && !pendingTarget && !usedCardThisTurn[player] && !alkPhaseActive() && !cardAnimBusy && (mode === 'local' || player === myColor);
}
// ---- 카드 설명 창 ----
const cardDetailEl = document.getElementById('card-detail');
const cdIcon = document.getElementById('cd-icon'), cdName = document.getElementById('cd-name'), cdShort = document.getElementById('cd-short');
const cdDesc = document.getElementById('cd-desc'), cdNote = document.getElementById('cd-note'), cdUse = document.getElementById('cd-use'), cdClose = document.getElementById('cd-close');
let cardDetailFor = null; // { player, idx, id } (전설 카드는 idx = 'legend')
function openCardDetail(player, idx) {
  const card = idx === 'legend' ? lgCard(player) : hand[player] && hand[player][idx];
  if (!card) return;
  cardDetailFor = { player, idx, id: card.id };
  renderCardDetail();
  cardDetailEl.hidden = false;
  (cdUse.hidden ? cdClose : cdUse).focus();
}
function renderCardDetail() {
  const f = cardDetailFor;
  if (f && f.idx === 'legend') { renderLegendDetail(f); return; }
  const card = f && hand[f.player] && hand[f.player][f.idx];
  if (!card || card.id !== f.id) { closeCardDetail(); return; } // 패가 바뀌었으면 닫음
  cdIcon.textContent = card.icon; cdName.textContent = cardName(card);
  cdShort.textContent = cardShort(card); cdDesc.textContent = cardDesc(card);
  const mine = mode === 'local' || f.player === myColor;
  const canUse = canUseCardNow(f.player);
  cdUse.hidden = !canUse;
  cdUse.textContent = t('cd.use'); cdClose.textContent = t('cd.close');
  cdNote.textContent = canUse ? '' : !mine ? t('cd.opp') : f.player !== current ? t('cd.notTurn') : usedCardThisTurn[f.player] ? t('cd.used') : t('cd.busy');
}
function closeCardDetail() { cardDetailFor = null; cardDetailEl.hidden = true; }
cdClose.addEventListener('click', closeCardDetail);
cardDetailEl.addEventListener('click', (e) => { if (e.target === cardDetailEl) closeCardDetail(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !cardDetailEl.hidden) closeCardDetail(); });
cdUse.addEventListener('click', () => {
  const f = cardDetailFor;
  closeCardDetail();
  if (f && f.idx === 'legend') {
    if (!canUseLegend(f.player)) return;
    pendingPlacement = null; pendingTargetCell = null; pendingCardUse = null;
    hideConfirmBar();
    activateLegend(f.player);
    return;
  }
  if (!f || !canUseCardNow(f.player) || !hand[f.player][f.idx] || hand[f.player][f.idx].id !== f.id) return;
  // 설명 창의 [사용하기]가 확인 역할 → 바로 발동
  pendingPlacement = null; pendingTargetCell = null; pendingCardUse = null;
  hideConfirmBar();
  activateCard(f.player, f.idx);
});

function renderLegendDetail(f) {
  const card = lgCard(f.player);
  if (!card || card.id !== f.id) { closeCardDetail(); return; }
  const pr = lgProgress(f.player);
  cdIcon.textContent = card.icon; cdName.textContent = cardName(card) + ' · ' + t('lg.badge');
  cdShort.textContent = cardShort(card); cdDesc.textContent = cardDesc(card);
  const canUse = canUseLegend(f.player);
  cdUse.hidden = !canUse;
  cdUse.textContent = t('cd.use'); cdClose.textContent = t('cd.close');
  const mine = mode === 'local' || f.player === myColor;
  const prog = t('lg.cdProg', { p: pr.text });
  let note;
  if (lg.done[f.player]) note = t('lg.done');
  else if (canUse) note = prog;
  else if (card.auto) note = prog + ' · ' + t('lg.cdAutoNote');
  else if (!mine) note = prog + ' · ' + t('cd.opp');
  else if (!pr.ok) note = prog + ' · ' + t('lg.notReady');
  else note = prog + ' · ' + (f.player !== current ? t('cd.notTurn') : t('cd.busy'));
  cdNote.textContent = note;
}
// 전설 카드 칸 (양쪽 모두 공개)
function renderLegend(player, container) {
  if (!container) return;
  container.innerHTML = '';
  const card = lgCard(player);
  if (!card) return;
  const done = lg.done[player], pr = lgProgress(player);
  const ready = !done && !card.auto && pr.ok;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'legend-btn' + (done ? ' done' : ready ? ' ready' : '');
  const tag = done ? t('lg.done') : ready ? t('lg.ready') : t('lg.badge');
  btn.innerHTML = `<span class="lgb-icon">${card.icon}</span><span class="lgb-main"><span class="lgb-name">${cardName(card)}</span><span class="lgb-prog"></span></span><span class="lgb-tag">${tag}</span>`;
  btn.querySelector('.lgb-prog').textContent = done ? cardShort(card) : pr.text;
  btn.title = cardDesc(card);
  btn.addEventListener('click', () => openCardDetail(player, 'legend'));
  container.appendChild(btn);
}

function renderHand(player, container) {
  container.innerHTML = '';
  const hideContents = mode === 'multiplayer' && player !== myColor;
  if (hand[player].length === 0) {
    const span = document.createElement('span');
    span.className = 'hand-empty';
    span.textContent = t('hand.none');
    container.appendChild(span);
    return;
  }
  hand[player].forEach((card, idx) => {
    const btn = document.createElement('button');
    if (hideContents) {
      btn.className = 'hand-card disabled';
      btn.innerHTML = `<div class="hc-icon">🂠</div><div class="hc-name">${t('hand.hidden')}</div>`;
      container.appendChild(btn);
      return;
    }
    const canUse = canUseCardNow(player);
    btn.className = 'hand-card' + (canUse ? '' : ' disabled');
    btn.title = cardDesc(card);
    btn.innerHTML = `<div class="hc-icon">${card.icon}</div><div class="hc-name">${cardName(card)}</div><div class="hc-desc">${cardShort(card) || cardDesc(card)}</div>`;
    btn.addEventListener('click', () => openCardDetail(player, idx)); // 누르면 자세한 설명 (쓸 수 있으면 [사용하기])
    container.appendChild(btn);
  });
}

function cellCenter(r, c) { return { x: GRID_OFFSET_X + c * CELL, y: PAD + r * CELL }; }
function getVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawBoardBase() {
  ctx.clearRect(0, 0, DIM_W, DIM_H);
  const grad = ctx.createLinearGradient(0, 0, DIM_W, DIM_H);
  grad.addColorStop(0, getVar('--wood-light'));
  grad.addColorStop(1, getVar('--wood-dark'));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, DIM_W, DIM_H);

  ctx.strokeStyle = getVar('--line');
  ctx.lineWidth = 1;
  for (let i = 0; i < SIZE; i++) {
    const x = GRID_OFFSET_X + i * CELL;
    ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, PAD + GRID_SPAN); ctx.stroke();
    const y = PAD + i * CELL;
    ctx.beginPath(); ctx.moveTo(GRID_OFFSET_X, y); ctx.lineTo(GRID_OFFSET_X + GRID_SPAN, y); ctx.stroke();
  }
  const stars = [3, 7, 11];
  ctx.fillStyle = getVar('--line');
  stars.forEach(r => stars.forEach(c => {
    const p = cellCenter(r, c);
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  }));
}

function drawStoneAt(x, y, player) {
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
  if (player === BLACK) { g.addColorStop(0, getVar('--stone-black-1')); g.addColorStop(1, getVar('--stone-black-2')); }
  else { g.addColorStop(0, getVar('--stone-white-1')); g.addColorStop(1, getVar('--stone-white-2')); }
  ctx.fillStyle = g; ctx.fill();
  if (player === WHITE) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke(); }
}

function drawWalls() {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== WALL) continue;
    const p = cellCenter(r, c), h = CELL * 0.44;
    ctx.fillStyle = '#6b5a4a'; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(p.x - h, p.y - h, h * 2, h * 2); ctx.fill(); ctx.stroke();
    ctx.font = Math.round(CELL * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🧱', p.x, p.y + 1);
  }
}

function draw() {
  drawBoardBase();
  drawWalls();

  if (alk) {
    alk.physStones.forEach(s => drawStoneAt(s.x, s.y, s.color));
    if (alk.dragging && alk.dragCurrent) {
      const ns = alk.physStones[alk.newIndex];
      ctx.strokeStyle = getVar('--gold'); ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(ns.x, ns.y); ctx.lineTo(alk.dragCurrent.x, alk.dragCurrent.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = getVar('--gold');
      ctx.beginPath(); ctx.arc(alk.dragCurrent.x, alk.dragCurrent.y, 6, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }

  // 상대의 알까기: 조준 모습과 발사 후 움직임을 그대로 보여줌
  if (alkView) {
    alkView.physStones.forEach(s => drawStoneAt(s.x, s.y, s.color));
    if (!alkView.playing && alkView.aim && alkView.newIndex !== undefined) {
      const ns = alkView.physStones[alkView.newIndex];
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = getVar('--gold'); ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(ns.x, ns.y); ctx.lineTo(alkView.aim.x, alkView.aim.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = getVar('--gold');
      ctx.beginPath(); ctx.arc(alkView.aim.x, alkView.aim.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return;
  }

  craterList.forEach(cr => {
    if (board[cr.r][cr.c] !== EMPTY) return;
    const p = cellCenter(cr.r, cr.c);
    const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, CELL * 0.46);
    g.addColorStop(0, 'rgba(40,20,10,0.85)');
    g.addColorStop(0.7, 'rgba(90,45,20,0.55)');
    g.addColorStop(1, 'rgba(90,45,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, CELL * 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold ' + Math.round(CELL * 0.36) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(cr.turns), p.x, p.y + 1);
  });

  (shieldList || []).forEach(sh => {
    const p = cellCenter(sh.r, sh.c);
    ctx.save();
    ctx.fillStyle = 'rgba(90, 160, 255, 0.13)'; ctx.strokeStyle = 'rgba(90, 160, 255, 0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.fillRect(p.x - CELL * 1.5, p.y - CELL * 1.5, CELL * 3, CELL * 3);
    ctx.strokeRect(p.x - CELL * 1.5, p.y - CELL * 1.5, CELL * 3, CELL * 3);
    ctx.restore();
  });

  windmillList.forEach(w => {
    if (!isStone(board[w.r][w.c])) return;
    const p = cellCenter(w.r, w.c);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = getVar('--teal');
    ctx.lineWidth = 1.2;
    ctx.strokeRect(p.x - CELL * 0.9, p.y - CELL * 0.9, CELL * 1.8, CELL * 1.8);
    ctx.setLineDash([]);
  });

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isStone(board[r][c])) { const p = cellCenter(r, c); drawStoneAt(p.x, p.y, board[r][c]); }
    }
  }

  windmillList.forEach(w => {
    if (!isStone(board[w.r][w.c])) return;
    const p = cellCenter(w.r, w.c);
    ctx.font = (CELL * 0.5) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🎡', p.x, p.y);
  });

  // 눈 감고 두기로 둔 영구 보호 돌: 작은 표시
  for (const im of immuneList || []) {
    if (board[im.r][im.c] !== im.owner) continue;
    const p = cellCenter(im.r, im.c);
    ctx.save();
    ctx.font = Math.round(CELL * 0.34) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🙈', p.x + R * 0.55, p.y - R * 0.55);
    ctx.restore();
  }
  // 거신병: 희생으로 고른 돌
  if (pendingTarget && pendingTarget.type === 'sacrifice') {
    for (const q of pendingTarget.picks) {
      const p = cellCenter(q.r, q.c);
      ctx.strokeStyle = '#ff5a36'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, R + 3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 함정: 설치한 사람에게만 보임 (멀티=내 함정, 봇전=사람 함정, 로컬=지금 차례인 사람의 함정)
  const trapViewer = mode === 'local' ? current : myColor;
  for (const tr of trapList || []) {
    if (tr.owner !== trapViewer || board[tr.r][tr.c] !== EMPTY) continue;
    const p = cellCenter(tr.r, tr.c);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(140, 70, 20, 0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, CELL * 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.85;
    ctx.font = Math.round(CELL * 0.46) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🪤', p.x, p.y + 1);
    ctx.restore();
  }

  if (lastMovePos) {
    const p = cellCenter(lastMovePos.r, lastMovePos.c);
    ctx.strokeStyle = getVar('--accent'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
  }

  if (winLine) {
    const a = cellCenter(winLine[0].r, winLine[0].c);
    const b = cellCenter(winLine[1].r, winLine[1].c);
    ctx.strokeStyle = getVar('--accent'); ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  if (pendingTarget) {
    ctx.strokeStyle = getVar('--purple');
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, DIM_W - 4, DIM_H - 4);
  }
  if (pendingTarget && pendingTarget.type === 'trade' && pendingTarget.firstPos) {
    const p = cellCenter(pendingTarget.firstPos.r, pendingTarget.firstPos.c);
    ctx.strokeStyle = getVar('--purple'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, CELL * 0.5, 0, Math.PI * 2); ctx.stroke();
    // 교환 가능한 상대 돌 표시
    ctx.setLineDash([4, 3]);
    for (const [dr, dc] of ORTHO_DIRS) {
      const r = pendingTarget.firstPos.r + dr, c = pendingTarget.firstPos.c + dc;
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || !isValidTradeSecond(pendingTarget.firstPos, r, c)) continue;
      const q = cellCenter(r, c);
      ctx.beginPath(); ctx.arc(q.x, q.y, CELL * 0.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (pendingPlacement) {
    const p = cellCenter(pendingPlacement.r, pendingPlacement.c);
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawStoneAt(p.x, p.y, current);
    ctx.restore();
    ctx.strokeStyle = getVar('--gold'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, R + 3, 0, Math.PI * 2); ctx.stroke();
  }
  if (pendingTargetCell) {
    const p = cellCenter(pendingTargetCell.r, pendingTargetCell.c);
    ctx.strokeStyle = getVar('--gold'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, CELL * 0.5, 0, Math.PI * 2); ctx.stroke();
  }
}

function rawPosFromEvent(evt) {
  let clientX, clientY;
  if (evt.touches && evt.touches.length) { clientX = evt.touches[0].clientX; clientY = evt.touches[0].clientY; }
  else if (evt.changedTouches && evt.changedTouches.length) { clientX = evt.changedTouches[0].clientX; clientY = evt.changedTouches[0].clientY; }
  else { clientX = evt.clientX; clientY = evt.clientY; }
  const rect = canvas.getBoundingClientRect();
  const scaleX = DIM_W / rect.width, scaleY = DIM_H / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function posFromEvent(evt) {
  const raw = rawPosFromEvent(evt);
  const c = Math.round((raw.x - GRID_OFFSET_X) / CELL), r = Math.round((raw.y - PAD) / CELL);
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
  const p = cellCenter(r, c);
  if (Math.hypot(p.x - raw.x, p.y - raw.y) > CELL * 0.48) return null;
  return { r, c };
}

function handleCanvasClick(evt) {
  if (alkPhaseActive() || gameOver || draftOpen || awaitingSide || cardAnimBusy) return;
  if (mode !== 'local' && current !== myColor) return;
  const pos = posFromEvent(evt);
  if (!pos) return;

  if (pendingTarget) {
    pendingPlacement = null;
    pendingTargetCell = pos;
    showConfirmBar(L('confirm.target'));
    draw();
    return;
  }

  const { r, c } = pos;
  if (board[r][c] !== EMPTY) return;
  if (placeBlocked(r, c, current)) {
    addLog(L(isCrater(r, c) ? 'log.craterBlocked' : 'log.windmillBlocked'));
    return;
  }
  pendingCardUse = null;
  pendingPlacement = { r, c };
  showConfirmBar(L('confirm.place'));
  draw();
}

// 착수 금지 칸인지 (눈 감고 두기를 쓴 착수는 풍차를 무시하고 구멍만 막힘)
function placeBlocked(r, c, player) {
  if (lg && lg.blind === player) return isCrater(r, c);
  return isBlockedForPlayer(r, c, player);
}
function isBlockedForPlayer(r, c, player) {
  if (isCrater(r, c)) return true;
  for (const w of windmillList) {
    if (!isStone(board[w.r][w.c])) continue;
    if (board[w.r][w.c] === player) continue;
    const dr = Math.abs(w.r - r), dc = Math.abs(w.c - c);
    if (dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0)) return true;
  }
  return false;
}

function handlePlace(pos) {
  const { r, c } = pos;
  if (board[r][c] !== EMPTY) return;
  if (placeBlocked(r, c, current)) {
    addLog(L(isCrater(r, c) ? 'log.craterBlocked' : 'log.windmillBlocked'));
    return;
  }
  const bigTurn = lg && lg.big === current, blindNow = lg && lg.blind === current;
  if (bigTurn && lgWouldWin(r, c, current)) { addLog(L('lg.bigNoWin')); return; } // 대기만성 턴: 승리 줄 완성 불가
  if (!bigTurn && turnPlacementsDone > 0 && turnPlacedPositions.length > 0) {
    const tooClose = turnPlacedPositions.some(p => Math.max(Math.abs(r - p.r), Math.abs(c - p.c)) <= 2);
    if (tooClose) {
      addLog(L('log.chainTooClose'));
      return;
    }
  }
  // 카드 획득 카운트는 턴당 1회만: 연속 착수로 추가로 둔 돌은 세지 않음
  const countsForDraft = turnPlacementsDone === 0;
  board[r][c] = current;
  playPlaceSound();
  moveHistory.push({ r, c, player: current, counted: countsForDraft });
  lastMovePos = { r, c };
  turnPlacedPositions.push({ r, c });
  lgOnPlace(r, c, current);
  if (blindNow) { // 눈 감고 두기: 함정 무시 + 영구 보호 돌
    lg.blind = 0;
    immuneList.push({ r, c, owner: current });
  }

  const trapHit = !blindNow && trapList.find(tr => tr.r === r && tr.c === c && tr.owner !== current);
  if (trapHit) {
    board[r][c] = EMPTY;
    moveHistory.pop();
    trapList = trapList.filter(tr => tr !== trapHit);
    addLog(L('log.trapHit', { color: current }));
    lgLose(current, r, c);
    if (lg.first[current] && lg.first[current].r === r && lg.first[current].c === c) lg.first[current] = null;
    grantRandomCard(trapHit.owner);
    turnPlacementsDone++;
    if (turnPlacementsDone >= turnPlacementsNeeded) lgHandAtPlace = hand[current].length;
    draw();
    if (turnPlacementsDone >= turnPlacementsNeeded && draftAfterTurn === current) {
      draftAfterTurn = null;
      openDraft(current);
    } else if (turnPlacementsDone >= turnPlacementsNeeded) {
      passTurn();
    } else {
      updateStatus(); updatePips(); updateHandUI(); draw();
    }
    return;
  }
  // 자기 자신의 함정 위에 두면 그 함정은 조용히 소멸
  trapList = trapList.filter(tr => !(tr.r === r && tr.c === c));

  const win = checkWin(r, c, current);
  if (tut && tutAfterPlace(!!win)) return;
  if (win) {
    gameOver = true; winLine = [win.start, win.end];
    draw(); showBanner(L('banner.win', { color: current }), true);
    return;
  }
  if (!hasEmptyCell()) {
    gameOver = true; draw(); showBanner(L('banner.draw'), true); return;
  }

  if (countsForDraft) placedCount[current]++;
  turnPlacementsDone++;
  if (turnPlacementsDone >= turnPlacementsNeeded) lgHandAtPlace = hand[current].length; // 이번 턴에 새로 고를 카드는 빼고 셈

  const milestone = countsForDraft && placedCount[current] % INTERVAL === 0;
  draw();

  // 연속 착수로 아직 더 둘 수 있으면 카드 선택은 이번 턴의 마지막 수 뒤로 미룸
  if (milestone && turnPlacementsDone < turnPlacementsNeeded) draftAfterTurn = current;
  if (turnPlacementsDone >= turnPlacementsNeeded && (milestone || draftAfterTurn === current)) {
    draftAfterTurn = null;
    openDraft(current);
  } else if (turnPlacementsDone >= turnPlacementsNeeded) {
    passTurn();
  } else {
    updateStatus(); updatePips(); updateHandUI(); draw();
  }
}

function passTurn() {
  legendTurnEnd(current);
  draftAfterTurn = null;
  tickCraters();
  tickShields();
  current = other(current);
  turnPlacementsDone = 0;
  turnPlacementsNeeded = 1;
  turnPlacedPositions = [];
  usedCardThisTurn[current] = false;
  if (skipNextTurn[current]) {
    skipNextTurn[current] = false;
    addLog(L('log.skipTurn', { color: current }));
    passTurn();
    return;
  }
  updateStatus(); updatePips(); updateHandUI(); draw();
}

function checkWin(r, c, player) {
  const dirs = [{ dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 1, dc: 1 }, { dr: 1, dc: -1 }];
  for (const { dr, dc } of dirs) {
    let count = 1, start = { r, c }, end = { r, c };
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === player) { end = { r: rr, c: cc }; count++; rr += dr; cc += dc; }
    rr = r - dr; cc = c - dc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === player) { start = { r: rr, c: cc }; count++; rr -= dr; cc -= dc; }
    if (count === winLength || (winOver && winOver[player] && count === winOver[player])) return { start, end }; // 정확히 N개만 승리 (장목은 승리 아님), 토끼와 거북이는 4개도
  }
  return null;
}

function scanBoardForWin() {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (isStone(board[r][c])) { const win = checkWin(r, c, board[r][c]); if (win) return { player: board[r][c], win }; }
  }
  return null;
}

function endIfBoardWin(skipSync) {
  const found = scanBoardForWin();
  if (found) {
    gameOver = true;
    winLine = [found.win.start, found.win.end];
    draw();
    showBanner(L('banner.win', { color: found.player }), skipSync);
    return true;
  }
  return false;
}

// 결과 배너에 기록된 승자 색 (무승부·나감·옛 버전 문자열이면 null)
function bannerWinner(msg) {
  return msg && typeof msg === 'object' && msg.k === 'banner.win' && msg.p ? msg.p.color : null;
}
// 진 사람이 선후공을 고르는 상황인지: 멀티플레이는 양쪽 모두, 봇전은 사람이 졌을 때만
function loserPicksSide() {
  const w = bannerWinner(lastBannerMsg);
  if (!gameOver || w === null || w === undefined) return false;
  if (mode === 'multiplayer') return true;
  if (mode === 'bot') return w !== myColor;
  return false;
}
let lastBannerMsg = null;
function renderBannerOnly(msg) {
  lastBannerMsg = msg;
  let suffix = t('banner.suffix');
  if (loserPicksSide()) suffix = bannerWinner(msg) === myColor ? t('banner.suffixWinner') : t('banner.suffixLoser');
  banner.textContent = fmt(msg) + suffix;
  banner.classList.add('show');
  // 상태 줄에도 결과 표시 (봇의 '생각 중' 등 이전 문구가 남지 않게)
  statusText.classList.remove('targeting', 'alkkagi');
  statusText.textContent = fmt(msg);
  resetBtn.style.display = ((mode === 'multiplayer' && !gameOver) || loserPicksSide()) ? 'none' : 'inline-block';
  renderRematchBar();
}
function showBanner(text, skipSync) {
  mpBannerText = text;
  renderBannerOnly(text);
  if (mode === 'multiplayer' && !skipSync) syncPublicState();
}

// ---- 카드 획득 (드래프트) ----
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 가중치 기반 비복원 추출 (Efraimidis-Spirakis): weight가 낮을수록 뽑힐 확률이 낮음
function weightedSample(pool, k) {
  const keyed = pool.map(card => ({ card, key: Math.pow(Math.random(), 1 / (card.weight || 10)) }));
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, k).map(x => x.card);
}

function grantRandomCard(player) {
  const card = weightedSample(getCardPool(), 1)[0];
  hand[player].push(card);
  if (hand[player].length > HAND_LIMIT) {
    const dropped = hand[player].shift();
    addLog(L('log.handOverflow', { color: player, card: dropped.id }));
  }
  addLog(L('log.cardGained', { color: player, icon: card.icon, card: card.id }));
}

let lastDraft = null;
// 게임 시작 카드 선택에는 전설 카드만 3장 (낮잠은 멀티플레이에서만)
function legendPicks() {
  return shuffle(LEGEND_POOL.filter(c => !c.mpOnly || mode === 'multiplayer')).slice(0, 3);
}
function openDraft(player) {
  const picks = startupQueue ? legendPicks() : weightedSample(getCardPool(), 3);
  if (mode === 'bot' && player !== myColor) {
    // 봇은 UI 없이 선택 (저난이도는 무작위, 고난이도는 강한 카드 우선)
    draftPlayer = player;
    draftOpen = false;
    pickCardIntoHand(botPickDraft(picks, player));
    return;
  }
  draftOpen = true;
  draftPlayer = player;
  renderDraftCards(player, picks);
  draftOverlay.classList.add('show');
  updateHandUI();
}

function renderDraftCards(player, picks) {
  const legend = picks.length && picks[0].legend;
  draftTitle.textContent = t(legend ? 'lg.draftTitle' : 'draft.title', { color: player });
  draftSubEl.textContent = t(legend ? 'lg.draftSub' : 'draft.sub');
  lastDraft = { player, picks };
  draftCardsEl.innerHTML = '';
  picks.forEach(card => {
    const btn = document.createElement('button');
    const rare = (card.weight || 10) <= 3;
    const desc = cardDesc(card).replace(/\s*\((가장 희귀|희귀 카드)\)/g, ''); // 희귀 표시는 배지로 대신함
    btn.className = 'aug-card' + (card.legend ? ' legend' : rare ? ' rare' : '');
    btn.innerHTML = (card.legend ? `<span class="aug-rarity">${t('lg.badge')}</span>` : rare ? `<span class="aug-rarity">${t('rare')}</span>` : '') +
      `<div class="aug-icon">${card.icon}</div><div class="aug-name">${cardName(card)}</div>` +
      (card.legend ? `<div class="aug-mode">${t(card.auto ? 'lg.auto' : 'lg.manual')}</div>` : '') +
      `<div class="aug-short">${cardShort(card)}</div><div class="aug-desc">${desc}</div>`;
    btn.addEventListener('click', () => pickCardIntoHand(card));
    draftCardsEl.appendChild(btn);
  });
}

function runStartupDraft() {
  if (!startupQueue || startupQueue.length === 0) {
    startupQueue = null;
    updateStatus(); updatePips(); updateHandUI(); draw();
    return;
  }
  openDraft(startupQueue[0]);
}

function pickCardIntoHand(card) {
  const p = draftPlayer;
  if (card.legend) {
    // 전설 카드는 패가 아니라 전설 칸에 (판마다 1장)
    lg.card[p] = card.id;
    addLog(L('lg.picked', { color: p, icon: card.icon, card: card.id }));
    draftOverlay.classList.remove('show');
    draftOpen = false;
    if (mode === 'multiplayer' && dbApi && roomCode) dbApi.updatePath('games/' + roomCode + '/lgPick', { [p]: card.id }).catch(() => {});
    if (startupQueue) { startupQueue.shift(); runStartupDraft(); }
    else { updateStatus(); updatePips(); updateHandUI(); draw(); }
    return;
  }
  hand[p].push(card);
  if (hand[p].length > HAND_LIMIT) {
    const dropped = hand[p].shift();
    addLog(L('log.handOverflow', { color: p, card: dropped.id }));
  }
  addLog(L('log.cardGainedHand', { color: p, icon: card.icon, card: card.id }));
  draftOverlay.classList.remove('show');
  draftOpen = false;
  if (mode === 'multiplayer') savePrivateState();

  if (startupQueue) {
    startupQueue.shift();
    runStartupDraft();
    return;
  }

  if (turnPlacementsDone >= turnPlacementsNeeded) {
    passTurn();
  } else {
    updateStatus(); updatePips(); updateHandUI(); draw();
  }
  if (mode === 'multiplayer') syncPublicState();
}

// ---- 카드 사용 ----
function hasStoneOf(player) {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === player) return true;
  return false;
}
function hasWindmillableTarget(player) {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] === player && !windmillList.some(w => w.r === r && w.c === c)) return true;
  }
  return false;
}

function hasEmptyCell() {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === EMPTY) return true;
  return false;
}

function pruneInvalidTraps() {
  trapList = trapList.filter(t => board[t.r][t.c] === EMPTY);
}

// 순간이동 목적지: 가능하면 그 플레이어에게 풍차로 막히지 않은 빈 칸 중에서, 없으면 아무 빈 칸에서 무작위 선택
function pickRandomEmptyCell(forPlayer) {
  const preferred = [];
  const anyEmpty = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] === EMPTY) {
      anyEmpty.push({ r, c });
      if (!isBlockedForPlayer(r, c, forPlayer)) preferred.push({ r, c });
    }
  }
  const pool = preferred.length > 0 ? preferred : anyEmpty;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 감염 대상: 내 돌과 상하좌우(대각선 제외)로 맞닿은 상대 돌 목록 (중복 없이)
function getOrthogonalEnemyNeighbors(player) {
  const opp = other(player);
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const seen = new Set();
  const result = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== player) continue;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      if (board[nr][nc] !== opp || isProtected(nr, nc)) continue;
      const key = nr + ',' + nc;
      if (!seen.has(key)) { seen.add(key); result.push({ r: nr, c: nc }); }
    }
  }
  return result;
}

// 운석: 보호막 밖의 돌 중 무작위 1개 (색 무관)
function meteorTargets() {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (isStone(board[r][c]) && !isProtected(r, c)) out.push({ r, c });
  return out;
}
// 지진: 모든 돌을 각자 주변 무작위 빈 칸(원래 보드 기준)으로 흔들되, 겹치지 않도록 처리
function runEarthquake() {
  const stones = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (isStone(board[r][c])) stones.push({ r, c, color: board[r][c], isWindmill: windmillList.some(w => w.r === r && w.c === c) });
  }
  const occSet = new Set(stones.map(s => s.r + ',' + s.c));
  const walls = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === WALL) { walls.push({ r, c }); occSet.add(r + ',' + c); }
  const claimed = new Set();
  const order = shuffle(stones.map((_, i) => i));
  const newPos = new Array(stones.length);

  for (const i of order) {
    const s = stones[i];
    const neighbors = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = s.r + dr, nc = s.c + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const key = nr + ',' + nc;
      if (occSet.has(key)) continue;      // 원래 다른 돌이 있던 칸은 제외
      if (claimed.has(key)) continue;      // 이번 지진에서 이미 배정된 칸은 제외
      if (isCrater(nr, nc)) continue;      // 폭파 구멍으로는 이동하지 않음
      neighbors.push({ r: nr, c: nc, key });
    }
    if (neighbors.length > 0) {
      const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
      claimed.add(pick.key);
      newPos[i] = { r: pick.r, c: pick.c };
    } else {
      newPos[i] = { r: s.r, c: s.c };
    }
  }

  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  walls.forEach(w => { board[w.r][w.c] = WALL; });
  windmillList = [];
  moveHistory = [];
  stones.forEach((s, i) => {
    const p = newPos[i];
    board[p.r][p.c] = s.color;
    moveHistory.push({ r: p.r, c: p.c, player: s.color });
    if (s.isWindmill) windmillList.push({ r: p.r, c: p.c });
  });
  lastMovePos = null;
  pruneInvalidTraps();
}

// 맞교환: 상하좌우로 맞닿은 서로 다른 색 돌끼리만 교환 가능
const ORTHO_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function isOrthoAdjacent(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; }
function hasOppositeNeighbor(r, c) {
  const v = board[r][c];
  if (!isStone(v)) return false;
  return ORTHO_DIRS.some(([dr, dc]) => {
    const rr = r + dr, cc = c + dc;
    return rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && isStone(board[rr][cc]) && board[rr][cc] !== v;
  });
}
function hasTradablePair() {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (hasOppositeNeighbor(r, c)) return true;
  return false;
}
// 두 돌의 색을 바꿨을 때 어느 쪽이든 오목/육목이 완성되는지 (그런 맞교환은 할 수 없음)
function swapMakesLine(r1, c1, r2, c2) {
  const v1 = board[r1][c1], v2 = board[r2][c2];
  board[r1][c1] = v2; board[r2][c2] = v1;
  const made = !!(checkWin(r1, c1, v2) || checkWin(r2, c2, v1));
  board[r1][c1] = v1; board[r2][c2] = v2;
  return made;
}
function isValidTradeSecond(first, r, c) {
  return isStone(board[r][c]) && board[r][c] !== first.color && isOrthoAdjacent(first, { r, c });
}

function useCard(player, idx) {
  if (player !== current || gameOver || draftOpen || pendingTarget || usedCardThisTurn[player] || alkPhaseActive()) return;
  if (mode === 'multiplayer' && player !== myColor) return;
  const card = hand[player][idx];
  if (!card) return;
  const opp = other(player);
  const C = { color: player };

  if (cardLockNextTurn[player]) {
    cardLockNextTurn[player] = false;
    removeFromHand(player, idx);
    markUsed(player);
    addLog(L('log.blockadeHit', { color: player, icon: card.icon, card: card.id }));
    if (mode === 'multiplayer') setNotice(L('notice.blockadeHit', C));
    updateHandUI(); draw();
    return;
  }

  switch (card.type) {
    case 'chain_move':
      removeFromHand(player, idx);
      markUsed(player);
      turnPlacementsNeeded = Math.max(turnPlacementsNeeded, turnPlacementsDone + 3, 3);
      addLog(L('log.chainUsed', { color: player, icon: card.icon }));
      updateStatus(); updatePips(); updateHandUI(); draw();
      return;

    case 'six_sense':
      if (winLength === 6) { addLog(L('log.sixAlready', C)); return; }
      winLength = 6;
      removeFromHand(player, idx);
      markUsed(player);
      addLog(L('log.sixUsed', { color: player, icon: card.icon }));
      updateStatus(); updateHandUI(); draw();
      return;

    case 'reversal':
      flipBoard(player);
      removeFromHand(player, idx);
      markUsed(player);
      addLog(L('log.reversalUsed', { color: player, icon: card.icon }));
      updateHandUI(); draw();
      if (endIfBoardWin(true)) return;
      passTurn();
      return;

    case 'windmill':
      if (!hasWindmillableTarget(player)) { addLog(L('log.noWindmillTarget', C)); return; }
      pendingTarget = { type: 'windmill', forPlayer: player, handIndex: idx };
      enterTargetMode(L('tgt.windmill'));
      return;

    case 'self_remove':
      if (!hasStoneOf(player)) { addLog(L('log.noOwnStoneRemove', C)); return; }
      pendingTarget = { type: 'self_remove', forPlayer: player, handIndex: idx };
      enterTargetMode(L('tgt.selfRemove'));
      return;

    case 'remove_enemy':
      if (!hasStoneOf(opp)) { addLog(L('log.noTarget', C)); return; }
      pendingTarget = { type: 'remove', opponent: opp, forPlayer: player, handIndex: idx };
      enterTargetMode(L('tgt.remove'));
      return;

    case 'trade':
      if (!hasTradablePair()) { addLog(L('log.noTradePair', C)); return; }
      pendingTarget = { type: 'trade', forPlayer: player, handIndex: idx, stage: 'first', firstPos: null };
      enterTargetMode(L('tgt.trade1'));
      return;

    case 'alkkagi':
      removeFromHand(player, idx);
      markUsed(player);
      addLog(L('log.alkUsed', { color: player, icon: card.icon }));
      startAlkkagi(player);
      return;

    case 'teleport':
      if (!hasStoneOf(player)) { addLog(L('log.noOwnStoneMove', C)); return; }
      if (!hasEmptyCell()) { addLog(L('log.noEmptyMove', C)); return; }
      pendingTarget = { type: 'teleport', forPlayer: player, handIndex: idx };
      enterTargetMode(L('tgt.teleport'));
      return;

    case 'earthquake':
      runEarthquake();
      removeFromHand(player, idx);
      markUsed(player);
      addLog(L('log.quakeUsed', { color: player, icon: card.icon }));
      mpShakeSeq++;
      lastSeenShakeSeq = mpShakeSeq;
      triggerBoardShake();
      updateHandUI(); draw();
      if (!hasEmptyCell()) { gameOver = true; showBanner(L('banner.draw'), true); return; }
      endIfBoardWin(true);
      return;

    case 'blockade':
      cardLockNextTurn[opp] = true;
      removeFromHand(player, idx);
      markUsed(player);
      addLog(L('log.blockadeUsed', { color: player, icon: card.icon }));
      if (mode === 'multiplayer') setNotice(L('notice.blockadeUsed', C));
      updateHandUI(); draw();
      return;

    case 'trap':
      if (!hasEmptyCell()) { addLog(L('log.noEmptyTrap', C)); return; }
      pendingTarget = { type: 'trap', forPlayer: player, handIndex: idx };
      enterTargetMode(L('tgt.trap'));
      return;

    case 'shield':
      if (!hasStoneOf(player)) { addLog(L('log.noShieldTarget', C)); return; }
      pendingTarget = { type: 'shield', forPlayer: player, handIndex: idx };
      enterTargetMode(L('tgt.shield'));
      return;

    case 'wall':
      if (!hasEmptyCell()) { addLog(L('log.noEmptyTrap', C)); return; }
      pendingTarget = { type: 'wall', forPlayer: player, handIndex: idx };
      enterTargetMode(L('tgt.wall'));
      return;

    case 'meteor': {
      const pool = meteorTargets();
      if (!pool.length) { addLog(L('log.meteorNone', C)); return; }
      const hit = pool[Math.floor(Math.random() * pool.length)], victim = board[hit.r][hit.c];
      const dest = pickRandomEmptyCell(victim);
      if (!dest) { addLog(L('log.noEmptyCell')); return; }
      board[hit.r][hit.c] = EMPTY;
      board[dest.r][dest.c] = victim;
      for (const w of windmillList) if (w.r === hit.r && w.c === hit.c) { w.r = dest.r; w.c = dest.c; }
      moveHistory = moveHistory.filter(m => !(m.r === hit.r && m.c === hit.c));
      moveHistory.push({ r: dest.r, c: dest.c, player: victim });
      lastMovePos = { r: dest.r, c: dest.c };
      pruneInvalidTraps(); pruneCraters();
      removeFromHand(player, idx);
      markUsed(player);
      addLog(L('log.meteorUsed', { color: player, color2: victim }));
      updateStatus(); updateHandUI(); draw();
      endIfBoardWin(true); // 날아간 돌이 줄을 완성할 수도 있음
      return;
    }

    case 'infection': {
      const targets = getOrthogonalEnemyNeighbors(player);
      if (targets.length === 0) { addLog(L('log.noInfectTarget', C)); return; }
      const converted = [];
      for (const t of shuffle(targets)) {
        if (converted.length >= 2) break;
        board[t.r][t.c] = player;
        if (checkWin(t.r, t.c, player)) {
          board[t.r][t.c] = opp; // 오목/육목이 완성되는 감염은 불가 — 되돌리고 다른 대상 검토
          continue;
        }
        converted.push(t);
      }
      converted.forEach(q => lgLose(opp, q.r, q.c));
      if (converted.length === 0) { addLog(L('log.noSafeInfect', C)); return; }
      removeFromHand(player, idx);
      markUsed(player);
      addLog(L('log.infectUsed', { color: player, icon: card.icon, n: converted.length }));
      updateHandUI(); draw();
      passTurn();
      return;
    }
  }
}

let confirmMsg = null;
function showConfirmBar(msg) {
  confirmMsg = msg;
  confirmText.textContent = fmt(msg);
  confirmBar.classList.add('show');
}
function hideConfirmBar() {
  confirmBar.classList.remove('show');
}
function clearAllPending() {
  pendingPlacement = null;
  pendingCardUse = null;
  pendingTargetCell = null;
  hideConfirmBar();
}

let targetPrompt = null;
function enterTargetMode(msg) {
  targetPrompt = msg;
  statusText.classList.remove('alkkagi');
  statusText.textContent = fmt(msg);
  statusText.classList.add('targeting');
  cancelBtn.classList.add('show');
  updateHandUI();
  draw();
}

function resetStatusAfterTarget() {
  cancelBtn.classList.remove('show');
  statusText.classList.remove('targeting');
  targetPrompt = null;
  statusText.textContent = turnText();
}

function handleTargetClick(pos) {
  const { r, c } = pos;
  const t = pendingTarget;
  const C = { color: t.forPlayer };
  let resolved = false;

  if ((t.type === 'remove' || t.type === 'trade') && isStone(board[r][c]) && board[r][c] !== t.forPlayer && isProtected(r, c)) {
    addLog(L('log.shielded'));
    return;
  }
  if (t.type === 'sacrifice') {
    // 🗿 거신병: 희생할 내 돌 3개 고르기 (다시 누르면 선택 취소)
    if (board[r][c] !== t.forPlayer) return;
    const i = t.picks.findIndex(q => q.r === r && q.c === c);
    if (i !== -1) t.picks.splice(i, 1); else t.picks.push({ r, c });
    if (t.picks.length < 3) { enterTargetMode(L('tgt.obelisk', { n: t.picks.length })); draw(); return; }
    lgFinish(t.forPlayer);
    const lc = lgCard(t.forPlayer);
    addLog(L('lg.used', { color: t.forPlayer, icon: lc.icon, card: lc.id }));
    lgObeliskResolve(t.forPlayer, t.picks);
    resolved = true;

  } else if (t.type === 'remove' && board[r][c] === t.opponent) {
    lgLose(t.opponent, r, c);
    board[r][c] = EMPTY;
    immuneList = immuneList.filter(s => !(s.r === r && s.c === c));
    windmillList = windmillList.filter(w => !(w.r === r && w.c === c)); // 풍차 돌이면 풍차도 함께 사라짐
    moveHistory = moveHistory.filter(m => !(m.r === r && m.c === c));
    trapList = trapList.filter(tr => !(tr.r === r && tr.c === c));
    craterList.push({ r, c, turns: 2, fresh: true });
    addLog(L('log.bombDone', C));
    resolved = true;

  } else if (t.type === 'self_remove' && board[r][c] === t.forPlayer) {
    board[r][c] = EMPTY;
    moveHistory = moveHistory.filter(m => !(m.r === r && m.c === c));
    addLog(L('log.selfRemove', C));
    resolved = true;

  } else if (t.type === 'teleport' && board[r][c] === t.forPlayer) {
    const dest = pickRandomEmptyCell(t.forPlayer);
    if (!dest) { addLog(L('log.noEmptyCell')); return; }
    board[r][c] = EMPTY;
    board[dest.r][dest.c] = t.forPlayer;
    moveHistory = moveHistory.filter(m => !(m.r === r && m.c === c));
    moveHistory.push({ r: dest.r, c: dest.c, player: t.forPlayer });
    const wIdx = windmillList.findIndex(w => w.r === r && w.c === c);
    if (wIdx !== -1) windmillList[wIdx] = { r: dest.r, c: dest.c };
    lastMovePos = dest;
    pruneInvalidTraps();
    addLog(L('log.teleportDone', C));
    resolved = true;

  } else if (t.type === 'shield' && board[r][c] === t.forPlayer) {
    shieldList.push({ r, c, owner: t.forPlayer, turns: 3, fresh: true });
    addLog(L('log.shieldUsed', C));
    resolved = true;

  } else if (t.type === 'wall') {
    if (board[r][c] !== EMPTY) { addLog(L('log.wallNeedEmpty')); return; }
    board[r][c] = WALL;
    trapList = trapList.filter(tr => !(tr.r === r && tr.c === c));
    craterList = craterList.filter(cr => !(cr.r === r && cr.c === c));
    addLog(L('log.wallUsed', C));
    resolved = true;

  } else if (t.type === 'trap' && board[r][c] === EMPTY) {
    if (trapList.some(tr => tr.r === r && tr.c === c)) {
      addLog(L('log.trapExists'));
      return;
    }
    trapList.push({ r, c, owner: t.forPlayer });
    addLog(L('log.trapSet', C));
    if (mode === 'multiplayer') setNotice(L('notice.trapSet'));
    resolved = true;

  } else if (t.type === 'windmill' && board[r][c] === t.forPlayer) {
    if (windmillList.some(w => w.r === r && w.c === c)) {
      addLog(L('log.windmillExists'));
      return;
    }
    windmillList.push({ r, c });
    addLog(L('log.windmillSet', C));
    resolved = true;

  } else if (t.type === 'trade') {
    if (t.stage === 'first') {
      if (hasOppositeNeighbor(r, c)) {
        t.firstPos = { r, c, color: board[r][c] };
        t.stage = 'second';
        enterTargetMode(L('tgt.trade2'));
        draw();
      } else if (isStone(board[r][c])) {
        addLog(L('log.tradeNoNeighbor'));
      }
      return;
    } else {
      if (!isValidTradeSecond(t.firstPos, r, c)) {
        // 맞닿지 않은 돌을 누르면 그 돌을 첫 번째 돌로 다시 선택
        if (hasOppositeNeighbor(r, c)) { t.firstPos = { r, c, color: board[r][c] }; draw(); }
        return;
      }
      const a = t.firstPos, bColor = board[r][c];
      if (swapMakesLine(a.r, a.c, r, c)) { addLog(L('log.tradeNoLine')); return; } // 오목/육목이 되는 교환은 불가
      const victim = other(t.forPlayer);
      if (a.color === victim) lgLose(victim, a.r, a.c); else lgLose(victim, r, c);
      board[a.r][a.c] = bColor;
      board[r][c] = a.color;
      addLog(L('log.tradeDone', C));
      resolved = true;
    }
  }

  if (resolved) {
    if (!t.legend) {
      removeFromHand(t.forPlayer, t.handIndex);
      markUsed(t.forPlayer);
    }
    pendingTarget = null;
    resetStatusAfterTarget();
    updateHandUI();
    draw();
    if (t.type === 'trade' || t.type === 'teleport' || t.type === 'sacrifice') endIfBoardWin(true);
    if (t.type === 'trade' && !gameOver) passTurn();
  }
}

function cancelTarget() {
  if (!pendingTarget) return;
  pendingTarget = null;
  pendingTargetCell = null;
  hideConfirmBar();
  resetStatusAfterTarget();
  updateHandUI();
  draw();
}

function removeFromHand(player, idx) { hand[player].splice(idx, 1); }
function markUsed(player) { usedCardThisTurn[player] = true; }
