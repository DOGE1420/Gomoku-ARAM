// 맵 · 자기장 · 시작 능력 · 다시 뽑기 · 새 카드 시나리오 테스트: node tests/world.js (errors가 비어 있어야 함)
const openBench = require('./load');
(async () => {
  const { page, errors, cleanup } = await openBench();
  const ev = (code) => page.evaluate(c => window.__bench.ev(c), code);
  const res = {};
  const setup = `const fresh = (cur, map) => { mode = 'local'; init(); draftOpen = false; startupQueue = null; pendingTarget = null; cardAnimInstant = true; draftOverlay.classList.remove('show'); current = cur || 1; setMap(map || 'classic'); };
    const put = (list, v) => list.forEach(([r, c]) => { board[r][c] = v; });
    const endRound = () => { current = 2; turnPlacementsDone = 1; passTurn(); };
    const give = (p, id) => { hand[p].push(CARD_POOL.find(c => c.id === id)); return hand[p].length - 1; };`;
  // 시작 순서: 흑 전설 → 흑 능력 → 백 전설 → 백 능력, 다시 뽑기
  res.startup = await ev(`(() => {
    mode = 'local'; init();
    const seq = [];
    const r0 = world.refresh[1], btn0 = !document.getElementById('draft-refresh').hidden;
    const before = lastDraft.picks.map(c => c.id).join(); document.getElementById('draft-refresh').click();
    const after = lastDraft.picks.map(c => c.id).join(), r1 = world.refresh[1], btn1 = !document.getElementById('draft-refresh').hidden;
    for (let i = 0; i < 4; i++) { seq.push(lastDraft.kind + ':' + draftPlayer); pickCardIntoHand(lastDraft.kind === 'ability' ? ABILITY_POOL.find(c => c.id === (i === 1 ? 'retry' : 'clover')) : lastDraft.picks[0]); }
    return { seq, refresh: [r0, r1, btn0, btn1, before !== after], retry: world.refresh[1], ab: world.ab, q: startupQueue, mapLog: logLines.map(fmt).find(l => l.includes('맵')) };
  })()`);
  // 행운(4장 중), 넉넉한 주머니(5장)
  res.abilities = await ev(`(() => { ${setup}
    fresh(1); world.ab[1] = 'clover'; world.ab[2] = 'pouch';
    openDraft(1); const n1 = lastDraft.picks.length; draftOverlay.classList.remove('show'); draftOpen = false;
    openDraft(2); const n2 = lastDraft.picks.length; draftOverlay.classList.remove('show'); draftOpen = false;
    for (let i = 0; i < 6; i++) grantRandomCard(2);
    for (let i = 0; i < 6; i++) grantRandomCard(1);
    return { clover: n1, normal: n2, pouchHand: hand[2].length, normalHand: hand[1].length };
  })()`);
  // 손버릇: 상대의 첫 카드 복사 (한 번만)
  res.pickpocket = await ev(`(() => { ${setup}
    fresh(1); world.ab[2] = 'pickpocket';
    grantRandomCard(1); const first = hand[1][0].id; grantRandomCard(1);
    return { first, white: hand[2].map(c => c.id), once: world.pp[2] };
  })()`);
  // 단단한 시작: 처음 3돌 보호
  res.sturdy = await ev(`(() => { ${setup}
    fresh(1); world.ab[1] = 'sturdy';
    [[7,7],[0,0],[7,9],[1,1],[7,11],[2,2],[7,13]].forEach(([r,c]) => { handlePlace({r,c}); if (draftOpen) pickCardIntoHand(lastDraft.picks[0]); });
    return { prot: [isProtected(7,7), isProtected(7,9), isProtected(7,11), isProtected(7,13)] };
  })()`);
  // 여름: 5라운드마다 흑·백 1개씩 녹음, 면역 능력
  res.summer = await ev(`(() => { ${setup}
    fresh(2, 'summer'); put([[3,3],[3,5],[3,7]], 1); put([[9,3],[9,5],[9,7]], 2);
    world.round = 4; endRound();
    const a = [countStones(1), countStones(2), world.round];
    fresh(2, 'summer'); world.ab[1] = 'umbrella'; put([[3,3],[3,5],[3,7]], 1); put([[9,3],[9,5],[9,7]], 2);
    world.round = 9; endRound();
    return { normal: a, umbrella: [countStones(1), countStones(2)] };
  })()`);
  // 겨울: 얼음 → 2라운드 뒤 녹음
  res.winter = await ev(`(() => { ${setup}
    fresh(2, 'winter'); put([[5,5]], 1);
    world.round = 4; endRound();
    const frozen = [board[5][5], world.frozen.length];
    endRound(); const mid = board[5][5];
    endRound(); const thawed = board[5][5];
    return { frozen, mid, thawed, left: world.frozen.length };
  })()`);
  // 우주: 웜홀 너머로 이어진 5목
  res.space = await ev(`(() => { ${setup}
    fresh(1, 'space'); put([[7,12],[7,13],[7,14],[7,0]], 1);
    const urgentForWhite = lgUrgentMove(2);
    handlePlace({ r: 7, c: 1 });
    const won = gameOver, wl = winLine && winLine.length;
    fresh(1, 'classic'); put([[7,12],[7,13],[7,14],[7,0]], 1); handlePlace({ r: 7, c: 1 });
    return { won, wl, urgentForWhite, classicWon: gameOver };
  })()`);
  // 사막: 8라운드에 모래폭풍
  res.desert = await ev(`(() => { ${setup}
    fresh(2, 'desert'); put([[7,7]], 1); put([[7,8]], 2);
    world.round = 7; endRound();
    return { round: world.round, moved: board[7][7] !== 1 || board[7][8] !== 2, stones: [countStones(1), countStones(2)], log: logLines.slice(0, 2).map(fmt) };
  })()`);
  // 장마: 지진 뒤 쓰나미, 지진 출현 두 배
  res.rain = await ev(`(() => { ${setup}
    fresh(1, 'rain'); put([[0,5],[1,6],[2,7]], 1); put([[14,5],[13,6],[12,7]], 2); put([[5,0],[6,1]], 1); put([[5,14],[6,13]], 2);
    const n0 = countStones(1) + countStones(2);
    const i = give(1, 'earthquake'); activateCard(1, i);
    const quake = getCardPool().find(c => c.id === 'earthquake').weight;
    setMap('classic'); const quake0 = getCardPool().find(c => c.id === 'earthquake').weight;
    return { before: n0, after: countStones(1) + countStones(2), log: logLines.slice(0, 2).map(fmt), quake, quake0 };
  })()`);
  // 자기장: 14라운드 예고, 15라운드 바깥 한 줄
  res.zone = await ev(`(() => { ${setup}
    fresh(2); put([[0,0],[0,7],[14,14]], 1); put([[1,1],[7,7]], 2);
    world.round = 13; endRound(); const warn = logLines.map(fmt).some(l => l.includes('자기장'));
    endRound();
    return { warn, zone: world.zone, corner: board[0][0], ring1: board[1][1], stones: [countStones(1), countStones(2)], blocked: placeBlocked(0, 3, 1) || board[0][3] !== 0 };
  })()`);
  // 새 카드
  res.cards = await ev(`(() => { ${setup}
    const out = {};
    fresh(1); put([[3,3],[3,5],[3,7],[3,9]], 2); let i = give(1, 'snipe'); activateCard(1, i); out.snipe = countStones(2);
    fresh(1); i = give(1, 'double'); activateCard(1, i); out.double = hand[1].length;
    fresh(1); hand[2] = [CARD_POOL[0], CARD_POOL[1]]; i = give(1, 'peek'); activateCard(1, i); out.peek = { view: peekView && peekView.cards, log: logLines[0] && fmt(logLines[0]) };
    current = 1; turnPlacementsDone = 1; passTurn(); out.peekCleared = peekView === null;
    fresh(1); i = give(1, 'giant'); activateCard(1, i); handlePlace({ r: 7, c: 7 }); out.giant = [board[7][7], board[7][8], board[8][7], board[8][8], current];
    fresh(1); put([[4,5],[4,6],[4,7]], 1); i = give(1, 'giant'); activateCard(1, i); handlePlace({ r: 3, c: 3 }); out.giantNoWin = { over: gameOver, skipped: board[4][4], others: [board[3][4], board[4][3]] };
    fresh(1); i = give(1, 'ghost'); activateCard(1, i); handlePlace({ r: 6, c: 6 });
    out.ghost = { hiddenForWhite: isHiddenFor(6, 6, 2), visibleForBlack: !isHiddenFor(6, 6, 1) };
    mode = 'bot'; myColor = 2; current = 2; draw();
    const ev2 = { clientX: 0, clientY: 0 }; const rect = canvas.getBoundingClientRect(); const p = cellCenter(6, 6);
    handleCanvasClick({ clientX: rect.left + p.x * rect.width / DIM_W, clientY: rect.top + p.y * rect.height / DIM_H });
    out.ghostFound = { hidden: isHiddenFor(6, 6, 2), cur: current, pend: !!pendingPlacement };
    fresh(1, 'summer'); i = give(1, 'weather'); activateCard(1, i); out.weather = mapId;
    return out;
  })()`);
  res.errors = errors;
  console.log(JSON.stringify(res, null, 1));
  await cleanup();
})();
