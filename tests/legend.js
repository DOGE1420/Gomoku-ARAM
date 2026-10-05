// 전설 카드 시나리오 테스트: node tests/legend.js (결과 JSON, errors가 비어 있어야 함)
const openBench = require('./load');
(async () => {
  const { page, errors, cleanup } = await openBench();
  const ev = (code) => page.evaluate(c => window.__bench.ev(c), code);
  const res = {};
  // 시작 카드 선택: 전설 카드만, 흑·백 순서
  res.startDraft = await ev(`(() => {
    mode = 'local'; init();
    const a = { open: draftOpen, player: draftPlayer, picks: lastDraft.picks.map(c => c.id), legend: lastDraft.picks.every(c => c.legend), title: draftTitle.textContent };
    pickCardIntoHand(lastDraft.picks[0]);
    const b = { open: draftOpen, player: draftPlayer, picks: lastDraft.picks.map(c => c.id) };
    pickCardIntoHand(lastDraft.picks[1]);
    return { a, b, cards: lg.card, hands: [hand[1].length, hand[2].length], q: startupQueue, slot: document.getElementById('legend-slot-1').textContent };
  })()`);
  // 이후 카드 선택에는 전설 카드가 안 나옴 (300번)
  res.laterDraft = await ev(`(() => { let leg = 0; for (let i = 0; i < 300; i++) { startupQueue = null; const p = weightedSample(getCardPool(), 3); if (p.some(c => c.legend)) leg++; } return { leg, napInLocal: (() => { let n = 0; for (let i = 0; i < 200; i++) if (legendPicks().some(c => c.id === 'nap')) n++; return n; })() }; })()`);
  const setup = `const fresh = (cur) => { mode = 'local'; init(); draftOpen = false; startupQueue = null; pendingTarget = null; cardAnimInstant = true; draftOverlay.classList.remove('show'); current = cur || 1; };
    const put = (list, v) => list.forEach(([r, c]) => { board[r][c] = v; });`;
  // 거신병
  res.obelisk = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'obelisk'; put([[0,0],[0,2],[0,4],[10,10]], 1); put([[5,1],[5,3],[5,6],[5,9],[8,8]], 2);
    const ok = lgProgress(1).ok; activateLegend(1);
    const tgt = pendingTarget && pendingTarget.type;
    handleTargetClick({r:0,c:0}); handleTargetClick({r:0,c:2}); handleTargetClick({r:0,c:4});
    return { ok, tgt, row5: board[5].filter(v => v === 2).length, my: countStones(1), white: countStones(2), done: lg.done[1], pend: !!pendingTarget, cur: current, lostW: lg.lost[2] };
  })()`);
  // 무소유 (로컬): 패 0장으로 3턴 → 상대 패 버림
  res.nothing = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'nothing'; hand[2] = [CARD_POOL[0], CARD_POOL[1]];
    const moves = [[0,0],[14,14],[0,3],[14,11],[0,6],[14,8],[3,0],[11,14]];
    const trace = [];
    moves.forEach(([r,c], i) => { if (i === 6 && current === 1 && hand[1].length) { activateCard(1, 0); if (pendingTarget) cancelTarget(); } handlePlace({r,c}); if (draftOpen) pickCardIntoHand(CARD_POOL.find(c => c.id === 'blockade')); trace.push([lg.empty[1], hand[1].length]); });
    return { trace, done: lg.done[1], h1: hand[1].length, h2: hand[2].length, empty: lg.empty[1], log: logLines.slice(0,4).map(fmt) };
  })()`);
  // 대기만성: 40수, 5번 착수, 승리 줄 금지
  res.latebloom = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'latebloom'; lg.plies = 40; put([[7,3],[7,4],[7,5],[7,6]], 1);
    activateLegend(1);
    const need = turnPlacementsNeeded;
    handlePlace({r:7,c:7}); const blockedWin = board[7][7];
    handlePlace({r:7,c:2}); const blockedWin2 = board[7][2];
    [[1,1],[1,2],[1,3],[1,4],[1,5]].forEach(([r,c]) => handlePlace({r,c}));
    return { need, blockedWin, blockedWin2, row1: board[1].filter(v => v === 1).length, cur: current, over: gameOver, big: lg.big };
  })()`);
  // 눈 감고 두기: 풍차 무시, 함정 무시, 영구 보호
  res.blind = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'blind'; put([[7,7]], 2); windmillList.push({r:7,c:7}); trapList.push({r:7,c:8,owner:2});
    lg.far[1] = 3; activateLegend(1);
    handlePlace({r:7,c:8});
    const placed = board[7][8], prot = isProtected(7,8), traps = trapList.length;
    current = 2; hand[2] = [CARD_POOL.find(c => c.id === 'bomb')]; usedCardThisTurn[2] = false; activateCard(2, 0); handleTargetClick({r:7,c:8});
    return { placed, prot, traps, after: board[7][8], cancelled: !!pendingTarget };
  })()`);
  // 멀리 두기 진행
  res.farCount = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'blind'; put([[7,7]], 2);
    handlePlace({r:0,c:0}); handlePlace({r:14,c:14}); handlePlace({r:0,c:5}); handlePlace({r:14,c:0}); handlePlace({r:0,c:10});
    return { far: lg.far[1], ok: lgProgress(1).ok };
  })()`);
  // 광대: 폭파 3번 당한 뒤 귀환 (한 자리는 백 돌이 차지 → 밀려남)
  res.clown = await ev(`(() => { ${setup}
    fresh(2); lg.card[1] = 'clown'; put([[3,3],[3,5],[3,7]], 1);
    for (const [r,c] of [[3,3],[3,5],[3,7]]) { current = 2; usedCardThisTurn[2] = false; hand[2] = [CARD_POOL.find(c => c.id === 'bomb')]; activateCard(2,0); handleTargetClick({r,c}); }
    craterList = []; board[3][5] = 2; current = 1;
    const lost = lg.lost[1]; activateLegend(1);
    return { lost, a: board[3][3], b: board[3][5], c: board[3][7], whites: countStones(2) };
  })()`);
  // 치킨 게임
  res.chicken = await ev(`(() => { ${setup}
    let win = 0, lose = 0;
    for (let i = 0; i < 40; i++) {
      fresh(1); lg.card[1] = 'chicken'; put([[2,2],[2,3],[2,4]], 1); put([[9,2],[9,3],[9,4],[9,5]], 2);
      activateLegend(1);
      if (countStones(2) === 0 && countStones(1) === 3) win++; else if (countStones(1) === 0 && countStones(2) === 4) lose++;
    }
    return { win, lose };
  })()`);
  // 나무늘보: 카드 없이 가장자리만 5턴
  res.sloth = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'sloth';
    const b = [[0,0],[0,3],[1,6],[0,9],[14,14]], w = [[7,7],[7,8],[8,7],[8,8],[6,6]];
    for (let i = 0; i < 5; i++) { handlePlace({r:b[i][0],c:b[i][1]}); if (draftOpen) pickCardIntoHand(lastDraft.picks[0]); if (i < 4) { handlePlace({r:w[i][0],c:w[i][1]}); if (draftOpen) pickCardIntoHand(lastDraft.picks[0]); } }
    return { done: lg.done[1], edge: lg.edge[1], stones: listStones(1) };
  })()`);
  // 따라쟁이: 흑이 백의 직전 수 좌우 대칭에 3번
  res.mirror = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'mirror';
    handlePlace({r:7,c:7});
    for (const [r,c] of [[3,2],[5,4],[9,1]]) { handlePlace({r,c}); if (draftOpen) pickCardIntoHand(CARD_POOL[0]); handlePlace({r,c:14-c}); if (draftOpen) pickCardIntoHand(CARD_POOL[0]); }
    const mir = lg.mirror[1];
    current = 2; usedCardThisTurn[2] = false; hand[2] = [CARD_POOL.find(c => c.id === 'chain')]; activateCard(2, 0);
    current = 1; usedCardThisTurn[1] = false; turnPlacementsNeeded = 1; turnPlacementsDone = 0; hand[1] = [];
    const ok = lgProgress(1).ok; activateLegend(1);
    return { mir, ok, need: turnPlacementsNeeded, used: usedCardThisTurn[1], hand1: hand[1].length, log: logLines.slice(0,3).map(fmt) };
  })()`);
  // 올인
  res.allin = await ev(`(() => { ${setup}
    let win = 0, lose = 0;
    for (let i = 0; i < 30; i++) {
      fresh(1); lg.card[1] = 'allin'; hand[1] = [0,1,2,3].map(i => CARD_POOL[i]);
      put([[0,0],[0,2],[0,4],[0,6]], 1); put([[9,0],[9,2],[9,4],[9,6],[9,8],[9,10]], 2);
      activateLegend(1);
      if (countStones(2) === 3) win++; else if (countStones(1) === 2) lose++;
    }
    return { win, lose, hand: hand[1].length };
  })()`);
  // 토끼와 거북이
  res.turtle = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'turtle'; put([[0,0],[2,2],[2,3],[2,4]], 1); put([[9,0],[9,2],[9,4],[9,6],[9,8],[9,10],[11,1],[11,3],[11,5],[11,7]], 2);
    const ok = lgProgress(1).ok; activateLegend(1);
    const cur = current, wo = winOver[1], over1 = gameOver;
    handlePlace({r:12,c:12});
    handlePlace({r:2,c:5});
    return { ok, cur, wo, over1, over: gameOver, winner: scanBoardForWin() && scanBoardForWin().player, badge: winLenBadge.textContent };
  })()`);
  // 왕의 귀환
  res.king = await ev(`(() => { ${setup}
    fresh(1); lg.card[1] = 'king';
    handlePlace({r:7,c:7});
    lg.plies = 20; current = 1; put([[6,4],[6,5],[6,6]], 1);
    const ok = lgProgress(1).ok; activateLegend(1);
    return { ok, row6: [board[6][6],board[6][7],board[6][8]], n: countStones(1), over: gameOver };
  })()`);
  // 상대가 4목 승리면 봇이 막음 (lgUrgentMove)
  res.urgent = await ev(`(() => { ${setup}
    fresh(1); winOver[2] = 4; put([[4,4],[4,5],[4,6]], 2); board[4][3] = 1;
    return lgUrgentMove(1);
  })()`);
  res.errors = errors;
  console.log(JSON.stringify(res, null, 1));
  await cleanup();
})();
