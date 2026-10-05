// 멀티플레이: 동기화·카드 연출·채팅·방 만들기/참가·재대국
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

// ================= 멀티플레이 동기화 =================
function flattenBoard() { const a = []; for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) a.push(board[r][c]); return a; }
function unflattenBoard(flat) { const b = []; for (let r = 0; r < SIZE; r++) b.push(flat.slice(r * SIZE, (r + 1) * SIZE)); return b; }

function buildPublicState() {
  const alkOrderNow = alk ? alk.turnOrder : (alkHandoff ? alkHandoff.turnOrder : null);
  const alkIndexNow = alk ? alk.turnIndex : (alkHandoff ? alkHandoff.turnIndex : null);
  return {
    board: flattenBoard(), current, winLength, windmillList, craterList, shieldList,
    stealReq: mpStealReq, stealRes: mpStealRes,
    turnPlacementsDone, turnPlacementsNeeded,
    usedCardThisTurn, cardLockNextTurn, skipNextTurn, placedCount,
    gameOver, winLine, lastMovePos,
    players: mpPlayers,
    notice: mpNotice, noticeSeq: mpNoticeSeq,
    bannerText: mpBannerText,
    shakeSeq: mpShakeSeq,
    restartSeq: mpRestartSeq,
    alkActive: !!(alk || alkHandoff),
    alkTurnOrder: alkOrderNow,
    alkTurnIndex: alkIndexNow,
    alkLaunch: mpAlkLaunch,
    cardFx: mpCardFx,
    lg, winOver, immune: immuneList,
    lgPick: lg ? { [BLACK]: lg.card[BLACK], [WHITE]: lg.card[WHITE] } : null,
    lgReq: mpLgReq, lgRes: mpLgRes,
    handN: { [myColor]: (hand[myColor] || []).length, [other(myColor)]: lgOppHandN },
  };
}

let publicSyncBusy = false, publicSyncQueued = false;
async function syncPublicState() {
  if (mode !== 'multiplayer' || !dbApi || !roomCode) return;
  if (publicSyncBusy) { publicSyncQueued = true; return; }
  publicSyncBusy = true;
  try { await dbApi.setPath('games/' + roomCode, buildPublicState()); } catch (e) {}
  publicSyncBusy = false;
  if (publicSyncQueued) { publicSyncQueued = false; syncPublicState(); }
}

let privateSyncBusy = false, privateSyncQueued = false;
async function savePrivateState() {
  if (mode !== 'multiplayer' || !dbApi || !roomCode) return;
  if (privateSyncBusy) { privateSyncQueued = true; return; }
  privateSyncBusy = true;
  try { await dbApi.setPath('private/' + myUserId + '/games_' + roomCode, { hand: hand[myColor], traps: trapList }); } catch (e) {}
  privateSyncBusy = false;
  if (privateSyncQueued) { privateSyncQueued = false; savePrivateState(); }
}

async function loadPrivateState() {
  if (mode !== 'multiplayer' || !dbApi || !roomCode) return;
  try {
    const snap = await dbApi.getPath('private/' + myUserId + '/games_' + roomCode);
    if (snap.exists) {
      const data = snap.data() || {};
      hand[myColor] = data.hand || hand[myColor] || [];
      trapList = data.traps || trapList || [];
    }
  } catch (e) {}
}

function setNotice(text) { mpNotice = text; mpNoticeSeq++; lastSeenNoticeSeq = mpNoticeSeq; }

// ---- 카드 발동 연출 ----
const FX_COLORS = {
  chain: ['#ffe066', '#ffd23f', '#fff3b0'], windmill: ['#5ee6d0', '#3cc9b5', '#bff7ee'], sixsense: ['#b784ff', '#d9b8ff', '#8d5cf6'],
  trade: ['#7fc8ff', '#ffffff', '#3f8cff'], bomb: ['#ff5a36', '#ffae42', '#ffd166'], reversal: ['#ffffff', '#222222', '#bbbbbb'],
  alkkagi: ['#ff6b6b', '#ffd166', '#4ecdc4'], teleport: ['#fff7a8', '#c9a7ff', '#ffffff'], earthquake: ['#c0894f', '#8a5a2b', '#e8c39e'],
  blockade: ['#ff4d6d', '#ffffff', '#c9184a'], trap: ['#c8a165', '#7f5539', '#ffd6a5'], infection: ['#7cfc00', '#2ecc71', '#b5ff6b'],
  shield: ['#5aa0ff', '#cfe3ff', '#ffffff'],
  wall: ['#8d7b68', '#c4b29c', '#5c4b3a'], meteor: ['#ff7b00', '#ffd166', '#6a040f'],
};
const FX_DEFAULT = ['#7cfc00', '#ffd700', '#adff2f']; // 토템 기본색 (초록·노랑)

function playCardAnim(cardId, player, done) {
  const card = findAnyCard(cardId);
  if (cardAnimInstant || !card || !boardWrapEl) { done && done(); return; }
  cardAnimBusy = true;
  updateHandUI();
  const layer = document.createElement('div');
  layer.className = 'totem-layer' + (reduceMotion ? ' reduced' : '');
  const cardEl = document.createElement('div');
  cardEl.className = 'totem-card';
  const who = document.createElement('div'); who.className = 'totem-who'; who.textContent = t('fx.who', { color: player });
  const icon = document.createElement('div'); icon.className = 'totem-icon'; icon.textContent = card.icon;
  const name = document.createElement('div'); name.className = 'totem-name'; name.textContent = cardName(card);
  cardEl.append(who, icon, name);
  layer.appendChild(cardEl);
  if (!reduceMotion) {
    const colors = FX_COLORS[card.id] || FX_DEFAULT;
    for (let i = 0; i < 34; i++) {
      const pt = document.createElement('span');
      pt.className = 'totem-particle';
      const ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 190;
      pt.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
      pt.style.setProperty('--dy', Math.round(Math.sin(ang) * dist - 30) + 'px');
      pt.style.setProperty('--rot', Math.round(Math.random() * 540 - 270) + 'deg');
      pt.style.setProperty('--d', Math.round(200 + Math.random() * 160) + 'ms'); // 튀어나오는 순간 한 번 터짐
      pt.style.setProperty('--pc', colors[i % colors.length]);
      layer.appendChild(pt);
    }
  }
  boardWrapEl.appendChild(layer);
  setTimeout(() => {
    layer.remove();
    cardAnimBusy = false;
    cardAnimRemote = false;
    done && done();
    updateHandUI();
  }, reduceMotion ? 1200 : 2200);
}

// 카드 발동: 연출(상대 화면에도) → 끝난 뒤 실제 효과 적용
function activateCard(player, idx, after) {
  const card = hand[player] && hand[player][idx];
  if (!card || cardAnimBusy) return false;
  if (lg) lg.lastCard[player] = card.id; // 따라쟁이가 복사할 카드
  if (mode === 'multiplayer') {
    mpCardFx = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), card: card.id, color: player };
    seenCardFxIds.add(mpCardFx.id);
    syncPublicState(); // 효과 적용 전 상태로 먼저 알려 상대도 연출부터 보게 함
  }
  playCardAnim(card.id, player, () => {
    useCard(player, idx);
    if (mode === 'multiplayer') { syncPublicState(); savePrivateState(); }
    if (after) after();
  });
  return true;
}

function triggerBoardShake() {
  if (!boardWrapEl || reduceMotion) return;
  boardWrapEl.classList.remove('shake');
  void boardWrapEl.offsetWidth; // 강제 리플로우로 애니메이션 재시작 가능하게
  boardWrapEl.classList.add('shake');
}

function checkMyTrapsAgainstBoard() {
  if (mode !== 'multiplayer' || !trapList || trapList.length === 0) return;
  const opp = other(myColor);
  const remaining = [];
  let triggered = false;
  for (const tr of trapList) {
    if (board[tr.r][tr.c] === opp && immuneList.some(s => s.r === tr.r && s.c === tr.c)) continue; // 눈 감고 둔 돌: 함정 무시 (함정은 사라짐)
    if (board[tr.r][tr.c] === opp) {
      lgLose(opp, tr.r, tr.c);
      board[tr.r][tr.c] = EMPTY;
      addLog(L('log.trapHitOpp'));
      grantRandomCard(myColor);
      triggered = true;
    } else if (board[tr.r][tr.c] === EMPTY) {
      remaining.push(tr);
    }
    // 내 돌이 그 칸을 덮은 경우는 자연 소멸 (remaining에서 제외)
  }
  trapList = remaining;
  if (triggered) {
    // 함정이 걸린 돌이 오목/육목을 완성해서 상대 쪽이 이미 승리를 선언했더라도, 그 돌이 사라졌으면 승리 판정을 취소하고 게임을 이어감
    if (gameOver && winLine && !scanBoardForWin()) {
      gameOver = false; winLine = null; mpBannerText = null;
      banner.classList.remove('show');
      addLog(L('log.trapStopWin'));
      if (current === opp) passTurn();
    }
    setNotice(L('notice.trapFired'));
    syncPublicState();
    savePrivateState();
  }
}

// 강탈 동기화: 내가 빼앗길 쪽이면 패에서 1장을 내주고 응답, 빼앗는 쪽이면 응답으로 온 카드를 받음
function handleStealSync(data) {
  mpStealReq = data.stealReq || null;
  mpStealRes = data.stealRes || null;
  const rq = data.stealReq;
  if (rq && rq.id !== lastSeenStealReqId) {
    lastSeenStealReqId = rq.id;
    if (rq.by !== myColor && !(data.stealRes && data.stealRes.id === rq.id)) {
      const mine = hand[myColor] || [];
      const card = mine.length ? mine.splice(Math.floor(Math.random() * mine.length), 1)[0] : null;
      if (card) addLog(L('log.stealLost', { card: card.id }));
      mpStealRes = { id: rq.id, to: rq.by, card: card ? card.id : null };
      savePrivateState();
      dbApi.updatePath('games/' + roomCode, { stealRes: mpStealRes }).catch(() => {});
    }
  }
  const rs = data.stealRes;
  if (rs && rs.id !== lastSeenStealResId && rs.to === myColor) {
    lastSeenStealResId = rs.id;
    const card = rs.card && CARD_POOL.find(c => c.id === rs.card);
    if (card) {
      hand[myColor].push(card);
      if (hand[myColor].length > HAND_LIMIT) { const dropped = hand[myColor].shift(); addLog(L('log.handOverflow', { color: myColor, card: dropped.id })); }
      addLog(L('log.stealGot', { color: myColor, card: card.id }));
    } else addLog(L('log.stealEmpty', { color: myColor }));
    savePrivateState();
  }
}

function applyPublicSnapshot(data) {
  if (!data) return;
  // 상대 카드 발동: 연출을 먼저 보여주고, 연출 중 들어온 변화(효과)는 끝난 뒤 적용
  const fx = data.cardFx;
  // 공유 상태의 '마지막 카드 발동'을 내 쪽에도 맞춰 둠 — 예전 내 발동을 다시 써 보내면 상대 화면에서 같은 연출·기록이 반복됨
  if (fx) mpCardFx = fx;
  if (fx && fx.id !== lastSeenCardFxId && !seenCardFxIds.has(fx.id)) {
    lastSeenCardFxId = fx.id; seenCardFxIds.add(fx.id);
    if (fx.color !== myColor) {
      // 상대가 쓴 카드도 내 기록창에 남김
      const fc = findAnyCard(fx.card);
      if (fc) addLog(L('log.oppCard', { color: fx.color, icon: fc.icon, card: fc.id }));
    }
    if (fx.color !== myColor && !cardAnimBusy) {
      cardAnimRemote = true;
      playCardAnim(fx.card, fx.color, () => {
        const d = deferredSnapshot; deferredSnapshot = null;
        if (d) applyPublicSnapshot(d);
      });
    }
  } else if (cardAnimBusy && cardAnimRemote) {
    deferredSnapshot = data;
    return;
  }
  if (data.board) board = unflattenBoard(data.board);
  if (data.current) current = data.current;
  if (data.winLength) winLength = data.winLength;
  windmillList = data.windmillList || [];
  craterList = data.craterList || [];
  shieldList = data.shieldList || [];
  turnPlacementsDone = data.turnPlacementsDone || 0;
  turnPlacementsNeeded = data.turnPlacementsNeeded || 1;
  usedCardThisTurn = data.usedCardThisTurn || { [BLACK]: false, [WHITE]: false };
  cardLockNextTurn = data.cardLockNextTurn || { [BLACK]: false, [WHITE]: false };
  skipNextTurn = data.skipNextTurn || { [BLACK]: false, [WHITE]: false };
  placedCount = data.placedCount || { [BLACK]: 0, [WHITE]: 0 };
  gameOver = !!data.gameOver;
  if (gameOver) clearAllPending();
  mpBannerText = data.bannerText || null;
  winLine = data.winLine || null;
  lastMovePos = data.lastMovePos || null;
  mpPlayers = data.players || mpPlayers;

  let restarted = false, restartedColor = null;
  if (typeof data.restartSeq === 'number' && data.restartSeq > lastSeenRestartSeq) {
    lastSeenRestartSeq = data.restartSeq;
    restarted = true;
    // 진 쪽이 선후공을 바꿨을 수 있으므로 players에서 내 색을 다시 확인
    if (mpPlayers[BLACK] === myUserId) myColor = BLACK;
    else if (mpPlayers[WHITE] === myUserId) myColor = WHITE;
    restartedColor = myColor;
    hand = { [BLACK]: [], [WHITE]: [] };
    trapList = [];
    logLines = []; updateLog();
    lastSeenNoticeSeq = 0; lastSeenShakeSeq = 0; lastBannerMsg = null;
    pendingTarget = null; draftOpen = false; draftPlayer = null;
    pendingPlacement = null; pendingCardUse = null; pendingTargetCell = null;
    // 지난 판에서 남은 진행 상태도 비움 (알까기 관전, 연속 착수 위치, 알림 번호)
    alk = null; alkHandoff = null; alkView = null; mpAlkLaunch = null; turnPlacedPositions = [];
    mpNoticeSeq = 0; mpShakeSeq = 0;
    lgReset();
    draftOverlay.classList.remove('show');
  }
  // 번호는 양쪽 화면이 같은 값을 이어 써야 함 — 상대가 올린 번호를 내 쪽에도 맞춰 둠
  // (안 그러면 다음에 내가 보낸 재대국·알림 번호가 상대에게 '이미 본 번호'로 무시됨)
  if (typeof data.restartSeq === 'number') mpRestartSeq = Math.max(mpRestartSeq, data.restartSeq);
  if (typeof data.noticeSeq === 'number') mpNoticeSeq = Math.max(mpNoticeSeq, data.noticeSeq);
  if (typeof data.shakeSeq === 'number') mpShakeSeq = Math.max(mpShakeSeq, data.shakeSeq);

  if (data.noticeSeq && data.noticeSeq > lastSeenNoticeSeq) {
    lastSeenNoticeSeq = data.noticeSeq;
    if (data.notice) addLog(data.notice);
  }
  if (typeof data.shakeSeq === 'number' && data.shakeSeq > lastSeenShakeSeq) {
    lastSeenShakeSeq = data.shakeSeq;
    triggerBoardShake();
  }

  if (restarted) {
    addLog(L('log.youAre', { color: restartedColor }));
    startupQueue = [myColor];
    runStartupDraft();
  }

  // 전설 카드: 진행 상황은 공개 상태를 따르되, 내 전설 카드는 내 화면이 기준 (시작 때 양쪽이 동시에 골라 덮어쓸 수 있음)
  {
    const myCard = lg ? lg.card[myColor] : null, oppPrev = lg ? lg.card[other(myColor)] : null;
    lg = lgNorm(data.lg);
    const pick = data.lgPick || {};
    lg.card[myColor] = myCard;
    lg.card[other(myColor)] = pick[other(myColor)] || lg.card[other(myColor)] || oppPrev;
    if (myCard && pick[myColor] !== myCard && dbApi && roomCode) dbApi.updatePath('games/' + roomCode + '/lgPick', { [myColor]: myCard }).catch(() => {});
    winOver = {};
    if (data.winOver) for (const k of [BLACK, WHITE]) if (data.winOver[k]) winOver[k] = data.winOver[k];
    immuneList = Array.isArray(data.immune) ? data.immune.slice() : (data.immune ? Object.values(data.immune) : []);
    if (data.handN && typeof data.handN[other(myColor)] === 'number') lgOppHandN = data.handN[other(myColor)];
  }
  handleStealSync(data);
  handleLegendSync(data);
  lastPublicData = data;
  updateAlkSpectate(data); // 상대 발사가 새로 왔으면 먼저 재생을 시작
  syncAlkFromPublic(data);
  checkMyTrapsAgainstBoard();

  if (gameOver && data.bannerText) {
    if (!banner.classList.contains('show')) renderBannerOnly(data.bannerText);
  } else {
    banner.classList.remove('show');
  }

  updateStatus(); updatePips(); updateHandUI(); draw();
}

function syncAlkFromPublic(data) {
  if (alkView && alkView.playing) return; // 상대 발사 재생이 끝난 뒤에 다음 차례로 넘어감
  if (!data.alkActive) {
    if (alk || alkHandoff) { alk = null; alkHandoff = null; }
    return;
  }
  const turnOrder = data.alkTurnOrder;
  const turnIndex = data.alkTurnIndex;
  if (!turnOrder || typeof turnIndex !== 'number') return;
  const flicker = turnOrder[turnIndex];
  if (flicker === myColor) {
    if (!alk || alk.turnIndex !== turnIndex) {
      beginMyAlkTurn(turnOrder, turnIndex);
    }
  } else {
    alk = null;
    alkHandoff = { turnOrder: turnOrder, turnIndex: turnIndex };
  }
}

// ---- 채팅 (멀티플레이 전용) ----
const CHAT_MAX_LEN = 200;
const CHAT_HISTORY = 50;
let unsubChat = null;
let chatError = false, lastChatMessages = [];

function subscribeChat() {
  unsubscribeChat();
  chatPanel.hidden = false;
  chatError = false;
  renderChat([]);
  unsubChat = dbApi.onPathLast('chats/' + roomCode, CHAT_HISTORY, renderChat, function () {
    chatError = true; renderChat([]);
  });
}

function unsubscribeChat() {
  if (unsubChat) { unsubChat(); unsubChat = null; }
  chatPanel.hidden = true;
  chatInput.value = '';
}

function renderChat(messages) {
  lastChatMessages = messages;
  chatList.innerHTML = '';
  if (!messages.length) {
    const li = document.createElement('li');
    li.className = 'chat-empty';
    li.textContent = chatError ? t('chat.error') : t('chat.empty');
    chatList.appendChild(li);
    return;
  }
  for (const m of messages) {
    if (!m || typeof m.text !== 'string') continue;
    const li = document.createElement('li');
    li.className = 'chat-msg' + (m.uid === myUserId ? ' mine' : '');
    const who = document.createElement('div');
    who.className = 'chat-who';
    who.textContent = m.uid === myUserId ? t('chat.me') : (m.color === BLACK || m.color === WHITE ? colorName(m.color) : t('chat.opp'));
    const text = document.createElement('div');
    text.textContent = m.text.slice(0, CHAT_MAX_LEN);
    li.appendChild(who); li.appendChild(text);
    chatList.appendChild(li);
  }
  chatList.scrollTop = chatList.scrollHeight;
}

async function sendChat() {
  const text = chatInput.value.trim().slice(0, CHAT_MAX_LEN);
  if (!text || mode !== 'multiplayer' || !dbApi || !roomCode) return;
  chatInput.value = '';
  try {
    await dbApi.pushPath('chats/' + roomCode, { uid: myUserId, color: myColor, text, ts: Date.now() });
  } catch (e) {
    chatInput.value = text;
    addLog(L('chat.sendFail'));
  }
}

chatForm.addEventListener('submit', function (e) { e.preventDefault(); sendChat(); });

function subscribePublic() {
  subscribeChat();
  if (unsubPublic) { unsubPublic(); unsubPublic = null; }
  unsubPublic = dbApi.onPath('games/' + roomCode, function (snap) {
    if (!snap.exists) return;
    const data = snap.data();
    if (!data) return;
    if (currentScreen !== 'game' && data.players && data.players[BLACK] && data.players[WHITE]) {
      showScreen('game');
    }
    applyPublicSnapshot(data);
  }, function () {
    setLobbyStatus(L('lobby.connErr'));
  });
}

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function createRoom() {
  if (!dbApi || !myUserId) { setLobbyStatus(L('lobby.connecting')); return; }
  mode = 'multiplayer';
  // 선공(흑) 결정: 랜덤 / 방장 / 참가자
  const iGoFirst = firstPickMode === 'me' ? true : firstPickMode === 'opp' ? false : Math.random() < 0.5;
  myColor = iGoFirst ? BLACK : WHITE;
  roomCode = randomRoomCode();
  mpPlayers = { [BLACK]: null, [WHITE]: null };
  mpPlayers[myColor] = myUserId;
  setLobbyStatus(L('lobby.creating'));
  init();
  subscribePublic();
  await syncPublicState();
  showRoomCode(roomCode);
  setLobbyStatus(L(myColor === BLACK ? 'lobby.waitingFirst' : 'lobby.waitingSecond', { code: roomCode }));
}

let firstPickMode = 'random';
try { const v = localStorage.getItem('omok_first_pick'); if (v === 'random' || v === 'me' || v === 'opp') firstPickMode = v; } catch (e) {}
const firstPickOptions = document.getElementById('first-pick-options');
function renderFirstPick() {
  firstPickOptions.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.first === firstPickMode)));
}
firstPickOptions.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-first]');
  if (!b) return;
  firstPickMode = b.dataset.first;
  try { localStorage.setItem('omok_first_pick', firstPickMode); } catch (e2) {}
  renderFirstPick();
});
renderFirstPick();

function startRematch(newColor, viaRandom) {
  // 진 사람이 고른 색으로 자리 바꾸기 (players 매핑을 통째로 교환)
  const swap = newColor && newColor !== myColor;
  if (swap) {
    mpPlayers = { [BLACK]: mpPlayers[WHITE] || null, [WHITE]: mpPlayers[BLACK] || null };
    myColor = newColor;
  }
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  current = BLACK;
  moveHistory = [];
  gameOver = false;
  winLine = null;
  winLength = 5;
  lastMovePos = null;
  windmillList = [];
  placedCount = { [BLACK]: 0, [WHITE]: 0 };
  turnPlacementsDone = 0;
  turnPlacementsNeeded = 1;
  turnPlacedPositions = [];
  usedCardThisTurn = { [BLACK]: false, [WHITE]: false };
  cardLockNextTurn = { [BLACK]: false, [WHITE]: false };
  skipNextTurn = { [BLACK]: false, [WHITE]: false };
  pendingTarget = null; draftOpen = false; draftPlayer = null;
  pendingPlacement = null; pendingCardUse = null; pendingTargetCell = null;
  alk = null; alkHandoff = null;
  trapList = [];
  craterList = [];
  shieldList = []; mpStealReq = null; mpStealRes = null;
  alkView = null; mpAlkLaunch = null;
  hand = { [BLACK]: [], [WHITE]: [] }; // 상대 손패는 상대 쪽에서 restartSeq를 보고 알아서 초기화함
  lgReset();
  logLines = [];
  mpNotice = null; mpNoticeSeq = 0; lastSeenNoticeSeq = 0; mpBannerText = null; lastBannerMsg = null;
  mpShakeSeq = 0; lastSeenShakeSeq = 0;
  if (newColor) {
    const note = viaRandom ? L('notice.rematchRandom') : L(newColor === BLACK ? 'notice.rematchFirst' : 'notice.rematchSecond');
    setNotice(note);
    addLog(note);
    addLog(L('log.youAre', { color: myColor }));
  }
  mpRestartSeq = Math.max(mpRestartSeq, lastSeenRestartSeq) + 1; lastSeenRestartSeq = mpRestartSeq; // 내 화면은 스스로 에코 처리하지 않도록
  banner.classList.remove('show'); draftOverlay.classList.remove('show'); updateLog();
  syncPublicState();
  startupQueue = [myColor];
  runStartupDraft();
}

async function joinRoom(codeRaw) {
  if (!dbApi || !myUserId) { setLobbyStatus(L('lobby.connecting')); return; }
  const code = (codeRaw || '').trim().toUpperCase();
  if (!code) { setLobbyStatus(L('lobby.enterCode')); return; }
  setLobbyStatus(L('lobby.joining'));
  try {
    const snap = await dbApi.getPath('games/' + code);
    if (!snap.exists) { setLobbyStatus(L('lobby.notFound')); return; }
    const data = snap.data() || {};
    const players = data.players || {};
    let assignedColor = null;
    let isReconnect = false;
    if (players[BLACK] === myUserId) { assignedColor = BLACK; isReconnect = true; }
    else if (players[WHITE] === myUserId) { assignedColor = WHITE; isReconnect = true; }
    else if (!players[WHITE]) { assignedColor = WHITE; }
    else if (!players[BLACK]) { assignedColor = BLACK; }
    else { setLobbyStatus(L('lobby.full')); return; }

    mode = 'multiplayer';
    myColor = assignedColor;
    roomCode = code;
    mpPlayers = Object.assign({ [BLACK]: null, [WHITE]: null }, players);
    mpPlayers[assignedColor] = myUserId;
    hand = { [BLACK]: [], [WHITE]: [] };
    trapList = []; pendingTarget = null; draftOpen = false; draftPlayer = null; alk = null; alkHandoff = null;
    pendingPlacement = null; pendingCardUse = null; pendingTargetCell = null;
    moveHistory = [];
    logLines = []; mpNotice = null; mpNoticeSeq = 0; lastSeenNoticeSeq = 0; mpBannerText = null;
    mpShakeSeq = 0; lastSeenShakeSeq = 0;
    mpRestartSeq = data.restartSeq || 0; lastSeenRestartSeq = mpRestartSeq;
    lastSeenCardFxId = data.cardFx ? data.cardFx.id : null; // 들어오기 전에 쓴 카드 연출은 다시 보여주지 않음
    board = unflattenBoard(data.board || flattenBoard());
    current = data.current || BLACK;
    winLength = data.winLength || 5;
    windmillList = data.windmillList || [];
    craterList = data.craterList || [];
    turnPlacementsDone = data.turnPlacementsDone || 0;
    turnPlacementsNeeded = data.turnPlacementsNeeded || 1;
    turnPlacedPositions = [];
    usedCardThisTurn = data.usedCardThisTurn || { [BLACK]: false, [WHITE]: false };
    cardLockNextTurn = data.cardLockNextTurn || { [BLACK]: false, [WHITE]: false };
    skipNextTurn = data.skipNextTurn || { [BLACK]: false, [WHITE]: false };
    placedCount = data.placedCount || { [BLACK]: 0, [WHITE]: 0 };
    gameOver = !!data.gameOver;
    winLine = data.winLine || null;
    lastMovePos = data.lastMovePos || null;
    banner.classList.remove('show'); draftOverlay.classList.remove('show'); updateLog();
    if (!isReconnect) {
      await dbApi.updatePath('games/' + code + '/players', { [assignedColor]: myUserId });
    }
    subscribePublic();
    await loadPrivateState();
    if (isReconnect) {
      updateStatus(); updatePips(); updateHandUI(); draw();
      setLobbyStatus(L('lobby.reconnected'));
    } else {
      startupQueue = [myColor];
      runStartupDraft();
    }
    showScreen('game');
  } catch (e) {
    setLobbyStatus(L('lobby.joinFail'));
  }
}
