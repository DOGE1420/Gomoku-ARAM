// 벤치마크용 훅: index.html의 게임 코드 안쪽에 삽입되어 내부 함수에 접근한다 (게임 동작에는 영향 없음)
window.__bench = {
  // 결정적인 난수 (재현 가능한 대국)
  rng(seed) { let x = seed >>> 0 || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; },
  reset() {
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
    winLength = 5; windmillList = []; craterList = []; trapList = []; turnPlacementsDone = 0; turnPlacedPositions = [];
    hand = { [BLACK]: [], [WHITE]: [] }; cardLockNextTurn = { [BLACK]: false, [WHITE]: false };
  },
  load(pz) { this.reset(); pz.board.forEach((row, r) => row.forEach((v, c) => { board[r][c] = v; })); },
  snapshot() { return board.map(row => row.slice()); },
  // 봇끼리 자가 대국하며 국면을 모음 (첫 3수는 무작위)
  selfPlay(seed, ms, level) {
    const rnd = this.rng(seed); this.reset();
    const out = []; let col = BLACK;
    for (let ply = 0; ply < 120; ply++) {
      let m;
      if (ply < 3) { do { m = { r: 5 + Math.floor(rnd() * 5), c: 5 + Math.floor(rnd() * 5) }; } while (board[m.r][m.c] !== EMPTY); }
      else {
        if (ply >= 8) out.push({ board: this.snapshot(), side: col, ply });
        const cfg = Object.assign({}, BOT_LEVELS[level], { book: false, oppCardReplies: false });
        m = (cfg.engine2 ? e2ChooseMove : ultimateChooseMove)(col, makeBlocked(), ms, cfg);
      }
      if (!m) break;
      board[m.r][m.c] = col;
      if (checkWin(m.r, m.c, col)) break;
      col = other(col);
    }
    return out;
  },
  // 국면 분류: 공격 문제(두는 쪽이 필승) / 수비 문제(상대의 필승을 막아야 함), 정답 목록 계산
  classify(pos, solveMs) {
    this.load(pos);
    const side = pos.side, opp = other(side), blk = makeBlocked();
    e2Init(blk);
    if (e2WinCells(side).length || e2WinCells(opp).length) return null; // 바로 이기거나 바로 막는 쉬운 국면 제외
    const cands = collectCandidates(side, 2, blk, false).map(p => p.r * SIZE + p.c);
    const now = () => Date.now();
    if (e2Vct(side, 9, now() + solveMs, null)) {
      const answers = [];
      for (const i of cands) {
        e2Place(i, side);
        const ok = e2VctDefend(side, 9, now() + solveMs / 4);
        e2Remove(i, side);
        if (ok) answers.push(i);
      }
      if (answers.length >= 1 && answers.length <= 6) return { type: 'attack', board: pos.board, side, answers };
      return null;
    }
    if (e2Vct(opp, 9, now() + solveMs, null)) {
      const answers = [];
      for (const i of cands) {
        e2Place(i, side);
        const th = e2Vct(opp, 9, now() + solveMs / 4, null);
        e2Remove(i, side);
        if (!th) answers.push(i);
      }
      if (answers.length >= 1 && answers.length <= 6) return { type: 'defense', board: pos.board, side, answers };
    }
    return null;
  },
  // 문제 풀이: 엔진이 고른 수가 정답 목록에 있는지
  solve(pz, level, ms, overrides) {
    this.load(pz);
    const cfg = Object.assign({}, BOT_LEVELS[level], { book: false, oppCardReplies: false }, overrides || {});
    const m = (cfg.engine2 ? e2ChooseMove : ultimateChooseMove)(pz.side, makeBlocked(), ms, cfg);
    return !!m && pz.answers.includes(m.r * SIZE + m.c);
  },
  // VCT 검증: 공격 문제에서 v2가 공격, 수비는 다른 레벨이 더 긴 시간으로 막아 봄 → 공격 쪽이 이겼는지
  playout(pz, atkMs, defLevel, defMs, maxPlies) {
    this.load(pz);
    let col = pz.side;
    for (let ply = 0; ply < maxPlies; ply++) {
      const lv = col === pz.side ? 50 : defLevel, t = col === pz.side ? atkMs : defMs;
      const cfg = Object.assign({}, BOT_LEVELS[lv], { book: false, oppCardReplies: false });
      const m = (cfg.engine2 ? e2ChooseMove : ultimateChooseMove)(col, makeBlocked(), t, cfg);
      if (!m) return { winner: 0, plies: ply };
      board[m.r][m.c] = col;
      if (checkWin(m.r, m.c, col)) return { winner: col === pz.side ? 1 : -1, plies: ply + 1 };
      col = other(col);
    }
    return { winner: 0, plies: maxPlies };
  },
  // 정석 만들 국면 목록: 봇이 실제로 만나는 초반 (기존 정석 수를 따라간 뒤 상대가 근처에 둔 경우들)
  //  stage 1: 봇 백 4번째 수(돌 3개), 봇 흑 5번째 수(돌 4개) / stage 2: 봇 백 6번째 수(돌 5개, stage 1 결과 필요)
  bookPositions(stage, radius) {
    const C = 7, out = [], seen = new Set(), self = this;
    const put = (stones) => { self.reset(); stones.forEach(s => { board[s.r][s.c] = s.v; }); };
    const add = (stones, bot) => {
      const k = e2Canon(stones).key + '>' + bot;
      if (!seen.has(k) && !E2_BOOK[k]) { seen.add(k); out.push({ stones, bot }); }
    };
    const replies = (stones, who) => { put(stones); return collectCandidates(who, radius, makeBlocked(), false).map(p => ({ r: p.r, c: p.c, v: who })); };
    const bookReply = (stones, bot) => { put(stones); const m = e2BookMove(bot, makeBlocked()) || openingBookMove(bot, makeBlocked()); return m ? { r: m.r, c: m.c, v: bot } : null; };
    const b1 = { r: C, c: C, v: BLACK };
    // 봇 백: 흑 중앙 → 백 정석 응수 → 흑 3번째 수(근처 전부)
    const w2 = bookReply([b1], WHITE);
    for (const b3 of replies([b1, w2], BLACK)) {
      const s3 = [b1, w2, b3];
      if (stage === 1) add(s3, WHITE);
      else {
        const w4 = bookReply(s3, WHITE); if (!w4) continue;
        for (const b5 of replies([...s3, w4], BLACK)) add([...s3, w4, b5], WHITE);
      }
    }
    // 봇 흑: 중앙 → 백 2번째 수(붙인 8곳) → 흑 정석 응수 → 백 4번째 수(근처 전부)
    if (stage === 1) for (const [dr, dc] of [[0, 1], [1, 1]]) {
      const w2b = { r: C + dr, c: C + dc, v: WHITE };
      const b3 = bookReply([b1, w2b], BLACK); if (!b3) continue;
      for (const w4 of replies([b1, w2b, b3], WHITE)) add([b1, w2b, b3, w4], BLACK);
    }
    this.reset();
    return out;
  },
  // 정석 한 국면을 깊게 계산해서 정규화된 키와 수를 돌려줌
  bookSolve(pos, ms) {
    this.reset(); pos.stones.forEach(s => { board[s.r][s.c] = s.v; });
    const cfg = Object.assign({}, BOT_LEVELS[50], { book: false, oppCardReplies: false });
    const m = e2ChooseMove(pos.bot, makeBlocked(), ms, cfg);
    const cv = e2Canon(pos.stones);
    // 정규화 좌표로 변환 (e2FromCanon의 역)
    const q = E2_SYM[cv.t](m.r, m.c);
    return { key: cv.key + '>' + pos.bot, move: [q[0] - cv.mr, q[1] - cv.mc], depth: uLastDepth };
  },
  // 정석 조회 검증: 모든 항목을 8가지 대칭 × 여러 위치에 놓아도 저장된 수로 복원되는지
  bookCheck() {
    let ok = 0, bad = 0;
    for (const [k, mv] of Object.entries(E2_BOOK)) {
      const [body, bot] = k.split('>');
      const st = body.split('|').map(s => s.split('.').map(Number));
      for (let t = 0; t < 8; t++) for (const [or, oc] of [[7, 7], [6, 8], [8, 6]]) {
        const place = (r, c) => { const q = E2_SYM[t](r, c); return [q[0] + or, q[1] + oc]; };
        this.reset();
        st.forEach(([r, c, v]) => { const p = place(r, c); board[p[0]][p[1]] = v; });
        const m = e2BookMove(+bot, makeBlocked()), exp = place(mv[0], mv[1]);
        // 대칭인 국면은 대칭 위치의 수(같은 수)가 나와도 정답
        const withMove = (r, c) => e2Canon(st.map(([a, b, v]) => { const p = place(a, b); return { r: p[0], c: p[1], v }; }).concat([{ r, c, v: +bot }])).key;
        if (m && (m.r === exp[0] && m.c === exp[1] || withMove(m.r, m.c) === withMove(exp[0], exp[1]))) ok++; else { bad++; (this.badKeys = this.badKeys || new Set()).add(k + ' ' + JSON.stringify(mv) + ' got ' + JSON.stringify(m)); }
      }
    }
    this.reset();
    return { entries: Object.keys(E2_BOOK).length, ok, bad, badKeys: [...(this.badKeys || [])].slice(0, 10) };
  },
  // 맞교환 위험 통계: 상대가 맞교환을 쥔 국면에서 봇이 고른 수가 그 한 장에 지는 모양인지
  tradeRiskOn(pz, ms, on, holds) {
    this.load(pz);
    if (holds) hand[other(pz.side)] = [CARD_POOL.find(c => c.id === 'trade')];
    const cfg = Object.assign({}, BOT_LEVELS[50], { book: false, oppCardReplies: false, tradeRisk: on });
    const m = e2ChooseMove(pz.side, makeBlocked(), ms, cfg);
    if (!m) return -1;
    e2Init(makeBlocked()); const i = m.r * SIZE + m.c;
    e2Place(i, pz.side); const risk = e2TradeRisk(pz.side); e2Remove(i, pz.side);
    // 피할 수 있었는지: 바로 지지 않는 후보 중 위험 0인 수가 있었는지 (상대 즉시 5목 자리를 비우는 수 제외)
    let avoidable = false;
    if (risk) {
      const must = e2WinCells(other(pz.side));
      for (const p of collectCandidates(pz.side, 2, makeBlocked(), false)) {
        const j = p.r * SIZE + p.c; if (must.length && !must.includes(j)) continue;
        e2Place(j, pz.side); const r0 = e2TradeRisk(pz.side); e2Remove(j, pz.side);
        if (!r0) { avoidable = true; break; }
      }
    }
    return risk ? (avoidable ? 2 : 1) : 0;
  },
  // 맞교환 위험 감지 확인: 스크린샷 국면(흑 4개를 백이 막았지만 왼쪽 백 아래에 흑이 붙은 모양)
  tradeTest() {
    const set = (bs, ws) => { this.reset(); bs.forEach(([r, c]) => { board[r][c] = BLACK; }); ws.forEach(([r, c]) => { board[r][c] = WHITE; }); };
    // 스크린샷: 흑 4개 양끝을 백이 막았지만 왼쪽 백 아래에 흑이 붙어 있음
    set([[7, 5], [7, 6], [7, 7], [7, 8], [8, 4], [3, 4], [5, 5]], [[7, 3], [7, 4], [7, 9], [4, 4], [5, 4], [6, 4], [4, 7]]);
    e2Init(makeBlocked());
    const riskScreen = e2TradeRisk(WHITE);
    const res = { riskScreen };
    this.reset();
    return res;
  },
  // 카드 관련 시나리오 확인 (연속 착수 계획 / 카드 계획 / 상대 연속 착수 대비 / 카드 뽑기)
  cardTests(ms) {
    const set = (bs, ws) => { this.reset(); bs.forEach(([r, c]) => { board[r][c] = BLACK; }); ws.forEach(([r, c]) => { board[r][c] = WHITE; }); };
    const cfg = Object.assign({}, BOT_LEVELS[50], { book: false });
    const out = {};
    // 백: 한쪽이 막힌 3이 두 줄 → 연속 착수로 4를 둘 만들어 이김
    const twoThrees = () => set([[3, 2], [9, 2], [6, 10], [7, 11], [12, 12]], [[3, 3], [3, 4], [3, 5], [9, 3], [9, 4], [9, 5]]);
    // 연속 착수 3수를 실제 규칙(같은 턴 2칸 이내 금지)대로 두게 해 봄
    const playChain = (color) => {
      turnPlacementsNeeded = 3; turnPlacementsDone = 0; turnPlacedPositions = [];
      const seq = [];
      for (let k = 0; k < 3; k++) {
        const m = e2ChooseMove(color, makeBlocked(), ms, cfg);
        if (!m) break;
        if (turnPlacedPositions.some(p => Math.max(Math.abs(p.r - m.r), Math.abs(p.c - m.c)) <= 2)) { seq.push('ILLEGAL'); break; }
        board[m.r][m.c] = color; seq.push([m.r, m.c]); turnPlacedPositions.push(m); turnPlacementsDone++;
        if (checkWin(m.r, m.c, color)) { seq.push('FIVE'); break; }
      }
      turnPlacementsNeeded = 1; turnPlacementsDone = 0; turnPlacedPositions = [];
      e2Init(makeBlocked());
      return { seq, winCells: e2WinCells(color).length };
    };
    twoThrees(); out.chainTwoThrees = playChain(WHITE);
    // 열린 3 하나: 떨어진 양끝 두 칸을 같은 턴에 둬서 5목
    set([[2, 2], [12, 12], [11, 3]], [[5, 4], [5, 5], [5, 6], [10, 10]]); out.chainOpenThree = playChain(WHITE);
    // 카드 계획: 연속 착수·감염을 쥔 백이 두 줄 3 국면에서 무엇을 쓰는지
    twoThrees(); hand[WHITE] = ['chain', 'infection'].map(id => CARD_POOL.find(c => c.id === id));
    const plan = planCardsSearch(WHITE, cfg, ms);
    out.plan = plan && { cardId: plan.cardId, win: plan.win, gain: Math.round(plan.gain) };
    // 상대(흑)가 연속 착수를 쥐고 한쪽 막힌 3이 두 줄: 백은 둘 중 하나를 끊어 한 턴 패배를 막아야 함
    set([[3, 3], [3, 4], [3, 5], [9, 3], [9, 4], [9, 5]], [[3, 2], [9, 2], [6, 10], [7, 11]]);
    hand[BLACK] = [CARD_POOL.find(c => c.id === 'chain')];
    const m = e2ChooseMove(WHITE, makeBlocked(), ms, cfg);
    board[m.r][m.c] = WHITE; e2Init(makeBlocked());
    out.defendChain = { move: [m.r, m.c], riskAfter: e2ChainRisk(WHITE) };
    // 카드 뽑기: 맞교환 한 번으로 이기는 쌍이 있으면 맞교환을 고름
    set([[7, 6], [2, 2], [12, 12], [11, 3]], [[7, 4], [7, 5], [7, 7], [7, 8], [8, 6]]);
    hand[WHITE] = []; hand[BLACK] = [];
    const saved = botLevel; botLevel = 50;
    out.draft = botPickDraft(['windmill', 'trade', 'earthquake'].map(id => CARD_POOL.find(c => c.id === id)), WHITE).id;
    botLevel = saved;
    this.reset();
    return out;
  },
  // 카드 포함 실제 대국: 게임 화면 흐름 그대로 양쪽을 봇이 둠 (사람 쪽 차례가 오면 그 색을 봇 색으로 바꿔 넘김)
  //  레벨 51 = 50에서 이번 카드 개선(연속 착수 계획·카드 계획 v2·맞교환 공격·연속 착수 대비·카드 뽑기)을 끈 것
  cardGameStart(lvBlack, lvWhite, timing, randomPlies) {
    BOT_LEVELS[51] = Object.assign({}, BOT_LEVELS[50], { chainPlan: false, chainRisk: false, tradeAttack: false, cardPlan2: false, draft2: false });
    for (const lv of [50, 51]) Object.assign(BOT_LEVELS[lv], timing || {});
    cardAnimInstant = true;
    const lv = { [BLACK]: lvBlack, [WHITE]: lvWhite };
    mode = 'bot'; myColor = WHITE; awaitingSide = false; botLevel = lvBlack;
    init(); showScreen('game');
    for (let k = 0; k < (randomPlies || 0); k++) {
      const e = []; for (let r = 5; r <= 9; r++) for (let c = 5; c <= 9; c++) if (board[r][c] === EMPTY) e.push({ r, c });
      handlePlace(e[Math.floor(Math.random() * e.length)]);
    }
    if (this._timer) clearInterval(this._timer);
    let alkKey = '';
    this._timer = setInterval(() => {
      if (mode !== 'bot' || gameOver) return;
      if (alk) {
        if (alk.awaitingLaunch && !alk.simulating) {
          const fl = alk.turnOrder[alk.turnIndex], key = alk.turnIndex + ':' + fl;
          if (myColor === fl) { myColor = other(fl); botLevel = lv[fl]; }
          if (key !== alkKey) { alkKey = key; checkBotAlkTurn(); }
        }
        return;
      }
      alkKey = '';
      if (draftOpen && lastDraft && lastDraft.player === draftPlayer) {
        // 사람 쪽 카드 선택 창 → 그 색의 봇 판단으로 고름
        const keep = botLevel; botLevel = lv[draftPlayer];
        const pick = botPickDraft(lastDraft.picks, draftPlayer);
        botLevel = keep; pickCardIntoHand(pick);
        return;
      }
      if (draftOpen || pendingTarget || cardAnimBusy || engineBusy) return;
      if (myColor === current) { myColor = other(current); botLevel = lv[current]; scheduleMaybeBotTurn(); }
      else if (botLevel !== lv[current]) botLevel = lv[current];
    }, 50);
  },
  cardGameState() {
    const f = gameOver ? scanBoardForWin() : null;
    return { over: gameOver, winner: f ? f.player : 0, moves: moveHistory.length, log: logLines.slice(0, 40).map(fmt),
      dbg: { current, myColor, botLevel, draftOpen, pend: !!pendingTarget, alk: !!alk, anim: cardAnimBusy, busy: engineBusy, timer: !!botTimer, done: turnPlacementsDone, need: turnPlacementsNeeded } };
  },
  cardGameStop() { if (this._timer) clearInterval(this._timer); this._timer = null; },
  // 속도 측정: 한 국면을 생각시키고 깊이·노드 수·시간을 돌려줌
  think(pz, level, ms) {
    this.load(pz); uLastDepth = 0;
    const cfg = Object.assign({}, BOT_LEVELS[level], { book: false, oppCardReplies: false });
    const t0 = Date.now();
    const m = (cfg.engine2 ? e2ChooseMove : ultimateChooseMove)(pz.side, makeBlocked(), ms, cfg);
    return { depth: uLastDepth, nodes: cfg.engine2 ? e2Nodes : uNodes, ms: Date.now() - t0, move: m ? m.r * SIZE + m.c : -1 };
  },
  // 대국: 흑/백 설정을 따로 주고 끝까지 둠 (첫 3수는 무작위, E2P 덮어쓰기 가능)
  match(seed, black, white, ms) {
    const rnd = this.rng(seed); this.reset();
    const saved = Object.assign({}, E2P);
    let col = BLACK;
    for (let ply = 0; ply < 160; ply++) {
      let m;
      if (ply < 3) { do { m = { r: 5 + Math.floor(rnd() * 5), c: 5 + Math.floor(rnd() * 5) }; } while (board[m.r][m.c] !== EMPTY); }
      else {
        const side = col === BLACK ? black : white;
        Object.assign(E2P, saved, side.params || {});
        const cfg = Object.assign({}, BOT_LEVELS[side.level], { book: false, oppCardReplies: false }, side.cfg || {});
        m = (cfg.engine2 ? e2ChooseMove : ultimateChooseMove)(col, makeBlocked(), ms, cfg);
      }
      if (!m) { Object.assign(E2P, saved); return { winner: 0, plies: ply }; }
      board[m.r][m.c] = col;
      if (checkWin(m.r, m.c, col)) { Object.assign(E2P, saved); return { winner: col, plies: ply + 1 }; }
      col = other(col);
    }
    Object.assign(E2P, saved);
    return { winner: 0, plies: 160 };
  },
};
