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
