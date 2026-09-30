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
      for (let t = 0; t < 8; t++) for (const [or, oc] of [[5, 5], [6, 4], [4, 7]]) {
        const place = (r, c) => { const q = E2_SYM[t](r, c); return [q[0] + or, q[1] + oc]; };
        this.reset();
        st.forEach(([r, c, v]) => { const p = place(r, c); board[p[0]][p[1]] = v; });
        const m = e2BookMove(+bot, makeBlocked()), exp = place(mv[0], mv[1]);
        // 대칭인 국면은 대칭 위치의 수(같은 수)가 나와도 정답
        const withMove = (r, c) => e2Canon(st.map(([a, b, v]) => { const p = place(a, b); return { r: p[0], c: p[1], v }; }).concat([{ r, c, v: +bot }])).key;
        if (m && (m.r === exp[0] && m.c === exp[1] || withMove(m.r, m.c) === withMove(exp[0], exp[1]))) ok++; else bad++;
      }
    }
    this.reset();
    return { entries: Object.keys(E2_BOOK).length, ok, bad };
  },
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
