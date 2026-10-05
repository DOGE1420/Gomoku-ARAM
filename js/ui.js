// 튜토리얼 · 메뉴/로비 UI · 버튼 연결
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

// ================= 튜토리얼 =================
const tutBox = document.getElementById('tut-box'), tutText = document.getElementById('tut-text'), tutBtn = document.getElementById('tut-btn');
function tutShow(key, btnKey) {
  if (tut) { tut.k = key; tut.b = btnKey; } // 언어를 바꾸면 다시 그리기 위해 기억
  tutBox.hidden = false; tutText.textContent = t(key);
  tutBtn.hidden = !btnKey; if (btnKey) tutBtn.textContent = t(btnKey);
}
function tutStage(step) {
  tut = { step };
  init();
  const put = (list, v) => list.forEach(([r, c]) => { board[r][c] = v; });
  current = BLACK; placedCount = { [BLACK]: 0, [WHITE]: 0 };
  if (step === 1) {
    put([[7, 5], [7, 6], [7, 7], [7, 8]], BLACK);
    put([[6, 6], [8, 7], [6, 8], [8, 5]], WHITE);
    tutShow('tut.1');
  } else if (step === 2) {
    put([[6, 5], [6, 6], [6, 7], [6, 8]], WHITE);
    put([[7, 6], [7, 7], [5, 7], [8, 9]], BLACK);
    hand[BLACK] = [CARD_POOL.find(c => c.id === 'wall')];
    tutShow('tut.2');
  } else {
    tutShow('tut.3', 'tut.play');
  }
  updateStatus(); updatePips(); updateHandUI(); draw();
}
function startTutorial() {
  mode = 'local'; myColor = BLACK; awaitingSide = false;
  showScreen('game');
  tutStage(1);
}
function endTutorial() { tut = null; tutBox.hidden = true; }
// 착수 직후 호출: 단계 목표를 이뤘는지 확인 (true면 일반 진행을 멈춤)
function tutAfterPlace(won) {
  if (!tut) return false;
  if (tut.step === 1 && won) { draw(); setTimeout(() => tutStage(2), 700); return true; }
  if (tut.step === 2) {
    const ok = findWinCells(WHITE, makeBlocked()[WHITE]).length === 0;
    draw();
    if (ok) setTimeout(() => tutStage(3), 700);
    else { tutShow('tut.2.retry'); setTimeout(() => tutStage(2), 1400); }
    return true;
  }
  return false;
}

// ================= 메뉴 / 로비 UI =================
let menuNoteMsg = null, lobbyMsg = null;
function setMenuNote(msg) { menuNoteMsg = msg; menuNote.textContent = msg ? fmt(msg) : ''; }
function setLobbyStatus(msg) { lobbyMsg = msg; lobbyStatus.textContent = msg ? fmt(msg) : ''; }
const roomCodeBox = document.getElementById('room-code-box'), roomCodeValue = document.getElementById('room-code-value');
function showRoomCode(code) { roomCodeValue.textContent = code || ''; roomCodeBox.hidden = !code; }
// 방 코드 입력: 무조건 대문자, 영문·숫자만
// 다른 언어 자판으로 쳐도 같은 자리의 영문 자판으로 바꿈 (한글 두벌식·러시아어·일본어 로마자 입력)
const KO_KEY = { 'ㅂ': 'Q', 'ㅈ': 'W', 'ㄷ': 'E', 'ㄱ': 'R', 'ㅅ': 'T', 'ㅛ': 'Y', 'ㅕ': 'U', 'ㅑ': 'I', 'ㅐ': 'O', 'ㅔ': 'P',
  'ㅁ': 'A', 'ㄴ': 'S', 'ㅇ': 'D', 'ㄹ': 'F', 'ㅎ': 'G', 'ㅗ': 'H', 'ㅓ': 'J', 'ㅏ': 'K', 'ㅣ': 'L',
  'ㅋ': 'Z', 'ㅌ': 'X', 'ㅊ': 'C', 'ㅍ': 'V', 'ㅠ': 'B', 'ㅜ': 'N', 'ㅡ': 'M',
  'ㅃ': 'Q', 'ㅉ': 'W', 'ㄸ': 'E', 'ㄲ': 'R', 'ㅆ': 'T', 'ㅒ': 'O', 'ㅖ': 'P',
  'ㅘ': 'HK', 'ㅙ': 'HO', 'ㅚ': 'HL', 'ㅝ': 'NJ', 'ㅞ': 'NP', 'ㅟ': 'NL', 'ㅢ': 'ML',
  'ㄳ': 'RT', 'ㄵ': 'SW', 'ㄶ': 'SG', 'ㄺ': 'FR', 'ㄻ': 'FA', 'ㄼ': 'FQ', 'ㄽ': 'FT', 'ㄾ': 'FX', 'ㄿ': 'FV', 'ㅀ': 'FG', 'ㅄ': 'QT' };
const KO_CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', KO_JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const KO_JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const RU_KEY = { 'Й': 'Q', 'Ц': 'W', 'У': 'E', 'К': 'R', 'Е': 'T', 'Н': 'Y', 'Г': 'U', 'Ш': 'I', 'Щ': 'O', 'З': 'P',
  'Ф': 'A', 'Ы': 'S', 'В': 'D', 'А': 'F', 'П': 'G', 'Р': 'H', 'О': 'J', 'Л': 'K', 'Д': 'L',
  'Я': 'Z', 'Ч': 'X', 'С': 'C', 'М': 'V', 'И': 'B', 'Т': 'N', 'Ь': 'M' };
const KANA = { 'あ': 'A', 'い': 'I', 'う': 'U', 'え': 'E', 'お': 'O', 'か': 'KA', 'き': 'KI', 'く': 'KU', 'け': 'KE', 'こ': 'KO',
  'さ': 'SA', 'し': 'SI', 'す': 'SU', 'せ': 'SE', 'そ': 'SO', 'た': 'TA', 'ち': 'TI', 'つ': 'TU', 'て': 'TE', 'と': 'TO',
  'な': 'NA', 'に': 'NI', 'ぬ': 'NU', 'ね': 'NE', 'の': 'NO', 'は': 'HA', 'ひ': 'HI', 'ふ': 'HU', 'へ': 'HE', 'ほ': 'HO',
  'ま': 'MA', 'み': 'MI', 'む': 'MU', 'め': 'ME', 'も': 'MO', 'や': 'YA', 'ゆ': 'YU', 'よ': 'YO',
  'ら': 'RA', 'り': 'RI', 'る': 'RU', 'れ': 'RE', 'ろ': 'RO', 'わ': 'WA', 'を': 'WO', 'ん': 'N',
  'が': 'GA', 'ぎ': 'GI', 'ぐ': 'GU', 'げ': 'GE', 'ご': 'GO', 'ざ': 'ZA', 'じ': 'ZI', 'ず': 'ZU', 'ぜ': 'ZE', 'ぞ': 'ZO',
  'だ': 'DA', 'ぢ': 'DI', 'づ': 'DU', 'で': 'DE', 'ど': 'DO', 'ば': 'BA', 'び': 'BI', 'ぶ': 'BU', 'べ': 'BE', 'ぼ': 'BO',
  'ぱ': 'PA', 'ぴ': 'PI', 'ぷ': 'PU', 'ぺ': 'PE', 'ぽ': 'PO' };
function codeToLatin(str) {
  let out = '';
  for (const ch0 of String(str || '').normalize('NFC')) {
    let ch = ch0.toUpperCase();
    const k = ch0.charCodeAt(0);
    if (k >= 0xAC00 && k <= 0xD7A3) { // 완성형 한글 → 자모 → 두벌식 자판
      const x = k - 0xAC00, jong = x % 28, jung = ((x - jong) / 28) % 21, cho = Math.floor(x / 588);
      out += KO_KEY[KO_CHO[cho]] + KO_KEY[KO_JUNG[jung]] + (jong ? KO_KEY[KO_JONG[jong]] : '');
      continue;
    }
    if (KO_KEY[ch0]) { out += KO_KEY[ch0]; continue; }
    if (RU_KEY[ch]) { out += RU_KEY[ch]; continue; }
    const kana = k >= 0x30A1 && k <= 0x30F6 ? String.fromCharCode(k - 0x60) : ch0; // 가타카나 → 히라가나
    if (KANA[kana]) { out += KANA[kana]; continue; }
    if (/[A-Z0-9]/.test(ch)) out += ch;
    else if (/[０-９Ａ-Ｚａ-ｚ]/.test(ch0)) out += String.fromCharCode(k - 0xFEE0).toUpperCase(); // 전각 영숫자
  }
  return out.slice(0, 5);
}
let codeComposing = false;
const fixCodeInput = () => {
  const v = codeToLatin(joinCodeInput.value);
  if (v !== joinCodeInput.value) joinCodeInput.value = v;
};
// 조합형 입력기(한글·일본어)는 조합이 끝날 때 바꾸고, 그 밖의 자판은 누른 자리(e.code)로 바로 영문 입력
joinCodeInput.addEventListener('compositionstart', () => { codeComposing = true; });
joinCodeInput.addEventListener('compositionend', () => { codeComposing = false; setTimeout(fixCodeInput, 0); });
joinCodeInput.addEventListener('input', (e) => { if (!codeComposing && !e.isComposing) fixCodeInput(); });
joinCodeInput.addEventListener('blur', fixCodeInput);
joinCodeInput.addEventListener('keydown', (e) => {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1 || /[A-Za-z0-9]/.test(e.key)) return;
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code || '');
  if (!m || codeToLatin(e.key)) return; // 한글·러시아 등 표로 바꿀 수 있는 글자는 input 단계에서 처리
  e.preventDefault();
  const el = joinCodeInput, a = el.selectionStart, b = el.selectionEnd;
  el.value = codeToLatin(el.value.slice(0, a) + (m[1] || m[2]) + el.value.slice(b));
  el.setSelectionRange(Math.min(a + 1, el.value.length), Math.min(a + 1, el.value.length));
});

// ---- 언어 전환 ----
function applyStaticI18n() {
  document.documentElement.lang = lang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
function rerenderAll() {
  if (tut && tut.k && !tutBox.hidden) tutShow(tut.k, tut.b);
  applyStaticI18n();
  renderBotLevel();
  if (menuNoteMsg) setMenuNote(menuNoteMsg);
  if (lobbyMsg) setLobbyStatus(lobbyMsg);
  if (board) {
    updateStatus();
    if (pendingTarget && targetPrompt) enterTargetMode(targetPrompt);
    updateHandUI(); updateLog(); draw();
  }
  if (confirmBar.classList.contains('show') && confirmMsg) confirmText.textContent = fmt(confirmMsg);
  if (banner.classList.contains('show') && lastBannerMsg) renderBannerOnly(lastBannerMsg);
  if (draftOverlay.classList.contains('show') && lastDraft) renderDraftCards(lastDraft.player, lastDraft.picks);
  if (!chatPanel.hidden) renderChat(lastChatMessages);
}
// ---- 설정: 움직임 줄이기 ----
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const reduceMotionInput = document.getElementById('reduce-motion');
reduceMotionInput.checked = reduceMotion;
function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  settingsBtn.setAttribute('aria-expanded', String(open));
}
settingsBtn.addEventListener('click', (e) => { e.stopPropagation(); setSettingsOpen(settingsPanel.hidden); });
settingsPanel.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { if (!settingsPanel.hidden) setSettingsOpen(false); });
reduceMotionInput.addEventListener('change', () => {
  reduceMotion = reduceMotionInput.checked;
  try { localStorage.setItem('omok_reduce_motion', reduceMotion ? '1' : '0'); } catch (e) {}
});

document.getElementById('lang-toggle').addEventListener('click', () => {
  lang = lang === 'ko' ? 'en' : 'ko';
  try { localStorage.setItem('omok_lang', lang); } catch (e) {}
  rerenderAll();
});
modeLocalBtn.addEventListener('click', () => { endTutorial(); mode = 'local'; myColor = BLACK; awaitingSide = false; init(); showScreen('game'); });
// 튜토리얼 뒤 첫 봇전은 무조건 1레벨 (저장된 난이도는 바꾸지 않음)
tutBtn.addEventListener('click', () => { endTutorial(); botLevel = 1; renderBotLevel(); startBotGameWithSidePick(); });
document.getElementById('mode-tut-btn').addEventListener('click', startTutorial);
function startBotGameWithSidePick() {
  mode = 'bot'; myColor = BLACK; awaitingSide = true;
  init(); showScreen('game');
}
modeBotBtn.addEventListener('click', startBotGameWithSidePick);
document.getElementById('side-options').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-side]');
  if (!b || !awaitingSide) return;
  const side = b.dataset.side === 'random' ? (Math.random() < 0.5 ? 'first' : 'second') : b.dataset.side;
  myColor = side === 'first' ? BLACK : WHITE;
  awaitingSide = false;
  init();
  addLog(L('bot.log', { n: botLevelName(botLevel) }));
  addLog(L(myColor === BLACK ? 'log.sideFirst' : 'log.sideSecond'));
});

const botLevelOptions = document.getElementById('bot-level-options');
const botLevelHint = document.getElementById('bot-level-hint');
const botModeDesc = document.getElementById('bot-mode-desc');
function renderBotLevel() {
  botLevelOptions.innerHTML = '';
  for (const lv of BOT_LEVEL_LIST) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(lv === botLevel));
    b.textContent = botLevelName(lv);
    if (lv === 20 || lv === 50) b.classList.add('ultimate');
    if (lv === 50) b.classList.add('super');
    b.addEventListener('click', () => {
      botLevel = lv;
      try { localStorage.setItem('omok_bot_level', String(lv)); } catch (e) {}
      renderBotLevel();
    });
    botLevelOptions.appendChild(b);
  }
  botLevelHint.textContent = t('bot.hint.' + botLevel);
  botModeDesc.textContent = t('mode.bot.desc', { n: botLevelName(botLevel) });
}
renderBotLevel();
modeMpBtn.addEventListener('click', () => {
  setLobbyStatus(null);
  showRoomCode(null);
  joinCodeInput.value = '';
  showScreen('lobby');
});
lobbyBackBtn.addEventListener('click', () => {
  showRoomCode(null);
  if (unsubPublic) { unsubPublic(); unsubPublic = null; }
  unsubscribeChat();
  showScreen('menu');
});
gameBackBtn.addEventListener('click', () => {
  endTutorial();
  closeCardDetail();
  engineToken++; engineBusy = false;
  awaitingSide = false;
  sideOverlay.classList.remove('show');
  if (mode === 'multiplayer' && roomCode && dbApi && !gameOver) {
    gameOver = true;
    showBanner(L('banner.left', { color: myColor }));
  }
  if (unsubPublic) { unsubPublic(); unsubPublic = null; }
  unsubscribeChat();
  mode = 'local';
  showScreen('menu');
});
createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', () => { fixCodeInput(); joinRoom(joinCodeInput.value); });

canvas.addEventListener('click', function (e) {
  if (!alk) handleCanvasClick(e);
});

canvas.addEventListener('mousedown', function (e) { if (alk) tryStartDrag(rawPosFromEvent(e)); });
canvas.addEventListener('mousemove', function (e) { if (alk && alk.dragging) updateDrag(rawPosFromEvent(e)); });
window.addEventListener('mouseup', function (e) { if (alk && alk.dragging) releaseDrag(rawPosFromEvent(e)); });

canvas.addEventListener('touchstart', function (e) {
  e.preventDefault();
  if (alk) tryStartDrag(rawPosFromEvent(e));
  else handleCanvasClick(e);
}, { passive: false });
canvas.addEventListener('touchmove', function (e) {
  e.preventDefault();
  if (alk && alk.dragging) updateDrag(rawPosFromEvent(e));
}, { passive: false });
canvas.addEventListener('touchend', function (e) {
  e.preventDefault();
  if (alk && alk.dragging) releaseDrag(rawPosFromEvent(e));
}, { passive: false });

undoBtn.addEventListener('click', () => { if (mode !== 'multiplayer' && !cardAnimBusy) undo(); });
resetBtn.addEventListener('click', () => {
  if (mode === 'multiplayer') {
    if (gameOver) startRematch(Math.random() < 0.5 ? BLACK : WHITE, true); // 무승부 등 진 쪽이 없으면 선후공 랜덤
  } else if (mode === 'bot') {
    startBotGameWithSidePick();
  } else {
    init();
  }
});
cancelBtn.addEventListener('click', cancelTarget);
rematchOptions.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-rematch]');
  if (!b || !loserPicksSide() || bannerWinner(lastBannerMsg) === myColor) return;
  const viaRandom = b.dataset.rematch === 'random';
  const newColor = viaRandom ? (Math.random() < 0.5 ? BLACK : WHITE) : b.dataset.rematch === 'first' ? BLACK : WHITE;
  if (mode === 'multiplayer') {
    startRematch(newColor, viaRandom);
  } else if (mode === 'bot') {
    myColor = newColor;
    init();
    addLog(L(viaRandom ? 'notice.rematchRandom' : newColor === BLACK ? 'notice.rematchFirst' : 'notice.rematchSecond'));
    addLog(L('bot.log', { n: botLevelName(botLevel) }));
    addLog(L(newColor === BLACK ? 'log.sideFirst' : 'log.sideSecond'));
  }
});

confirmYesBtn.addEventListener('click', () => {
  if (pendingPlacement) {
    const pos = pendingPlacement;
    pendingPlacement = null;
    hideConfirmBar();
    handlePlace(pos);
    if (mode === 'multiplayer') { syncPublicState(); savePrivateState(); }
  } else if (pendingCardUse) {
    const { player, idx } = pendingCardUse;
    pendingCardUse = null;
    hideConfirmBar();
    activateCard(player, idx);
  } else if (pendingTargetCell) {
    const pos = pendingTargetCell;
    pendingTargetCell = null;
    hideConfirmBar();
    handleTargetClick(pos);
    if (mode === 'multiplayer') { syncPublicState(); savePrivateState(); }
  }
});

confirmNoBtn.addEventListener('click', () => {
  clearAllPending();
  draw();
});

showScreen('menu');
if (lang !== 'ko') rerenderAll(); // 저장된 언어가 영어면 처음부터 영어로 표시
