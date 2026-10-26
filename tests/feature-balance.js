// 새 카드 · 시작 능력 밸런스 측정: node tests/feature-balance.js <card|ability|none> <id> [판 수=30] [레벨=5] [한 수 ms=300]
// 한쪽만(판마다 흑/백 교대) 그 카드를 시작 패에 2장 쥐거나 그 시작 능력을 갖고, 상대는 아무것도 없이 봇끼리 대국 (양쪽 전설 카드 없음, 맵은 무작위)
// 결과: 든 쪽 승률, 카드를 쓴 횟수(카드일 때), 평균 수
const openBench = require('./load');
(async () => {
  const [kind, id, gamesArg, lvArg, msArg] = process.argv.slice(2);
  const games = Number(gamesArg || 30), lv = Number(lvArg || 5), ms = Number(msArg || 300);
  const USED = { snipe: 'log.snipeDone', double: 'log.doubleDone', peek: 'log.peekShow', giant: 'log.giantOn', ghost: 'log.ghostOn', weather: 'log.weatherDone' };
  const { page, errors, cleanup } = await openBench();
  const r = { kind, id, games: 0, win: 0, loss: 0, draw: 0, stall: 0, used: 0, gamesUsed: 0, usedWin: 0, moves: 0 };
  for (let g = 0; g < games; g++) {
    const holder = g % 2 === 0 ? 1 : 2;
    await page.evaluate(([l, t]) => window.__bench.cardGameStart(l, l, t, 2), [lv, { timeMs: ms, chainTimeMs: ms / 2, planMs: ms }]);
    await page.evaluate(([h, k, cid]) => window.__bench.ev(`(() => {
      for (let i = 0; i < 6 && draftOpen && startupQueue; i++) pickCardIntoHand(lastDraft.picks[0]);
      const opp = other(${h});
      lg.card[1] = null; lg.card[2] = null;
      world.ab[1] = null; world.ab[2] = null; world.refresh[1] = 1; world.refresh[2] = 1;
      hand[1] = []; hand[2] = [];
      if (${JSON.stringify(k)} === 'card') { const c = CARD_POOL.find(x => x.id === ${JSON.stringify(cid)}); hand[${h}] = [c, c]; }
      if (${JSON.stringify(k)} === 'ability') { world.ab[${h}] = ${JSON.stringify(cid)}; if (${JSON.stringify(cid)} === 'retry') world.refresh[${h}] = 3; }
      window.__bench._events = [];
      updateHandUI(); updateStatus();
    })()`), [holder, kind, id]);
    const t0 = Date.now(); let st, last = -1, same = 0;
    for (;;) { await page.waitForTimeout(400); st = await page.evaluate(() => window.__bench.cardGameState()); if (st.over) break; if (st.moves === last) same++; else { same = 0; last = st.moves; } if (same > 75 || Date.now() - t0 > 300000) break; }
    const used = await page.evaluate(([h, key]) => { window.__bench.cardGameStop(); return window.__bench.ev(`(window.__bench._events || []).filter(e => e && e.k === ${JSON.stringify(key)} && e.p && e.p.color === ${h}).length`); }, [holder, USED[id] || '-']);
    r.games++; r.moves += st.moves; r.used += used;
    if (!st.over) { r.stall++; continue; }
    const won = st.winner === holder;
    if (!st.winner) r.draw++; else if (won) r.win++; else r.loss++;
    if (used) { r.gamesUsed++; if (won) r.usedWin++; }
  }
  r.winRate = Math.round(r.win / Math.max(1, r.win + r.loss) * 1000) / 10;
  r.avgMoves = Math.round(r.moves / r.games);
  console.log(JSON.stringify(r));
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
