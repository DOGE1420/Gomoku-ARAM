// 전설 카드 밸런스 측정: node tests/legend-balance.js <전설 id> [판 수=24] [레벨=5] [한 수 ms=300]
// 한쪽만 그 전설 카드를 들고(판마다 흑/백 교대), 상대는 전설 카드 없이 봇끼리 대국
// 결과: 든 쪽 승률, 발동 비율, 평균 수, 발동한 판의 승률
const openBench = require('./load');
(async () => {
  const [id, gamesArg, lvArg, msArg] = process.argv.slice(2);
  const games = Number(gamesArg || 24), lv = Number(lvArg || 5), ms = Number(msArg || 300);
  const { page, errors, cleanup } = await openBench();
  const r = { id, games: 0, win: 0, loss: 0, draw: 0, stall: 0, used: 0, usedWin: 0, moves: 0 };
  for (let g = 0; g < games; g++) {
    const holder = g % 2 === 0 ? 1 : 2;
    await page.evaluate(([l, t]) => window.__bench.cardGameStart(l, l, t, 2), [lv, { timeMs: ms, chainTimeMs: ms / 2, planMs: ms }]);
    // 시작 카드 선택을 끝내고 전설 카드를 지정 (상대는 없음)
    await page.evaluate(([h, card]) => window.__bench.ev(`(() => {
      for (let i = 0; i < 3 && draftOpen && startupQueue; i++) pickCardIntoHand(lastDraft.picks[0]);
      lg.card[${h}] = ${JSON.stringify(card)}; lg.card[other(${h})] = null; updateHandUI();
    })()`), [holder, id === 'none' ? null : id]);
    const t0 = Date.now(); let st;
    for (;;) { await page.waitForTimeout(400); st = await page.evaluate(() => window.__bench.cardGameState()); if (st.over || Date.now() - t0 > 240000) break; }
    const info = await page.evaluate((h) => { window.__bench.cardGameStop(); return window.__bench.ev(`({ done: !!(lg && lg.done[${h}]), plies: lg ? lg.plies : 0,
      at: (window.__bench._events || []).filter(e => e && e.k === 'lg.used' && e.p.color === ${h}).length })`); }, holder);
    r.games++; r.moves += st.moves;
    if (!st.over) { r.stall++; continue; }
    const won = st.winner === holder;
    if (!st.winner) r.draw++; else if (won) r.win++; else r.loss++;
    if (info.done) { r.used++; if (won) r.usedWin++; }
  }
  r.winRate = Math.round(r.win / Math.max(1, r.win + r.loss) * 1000) / 10;
  r.useRate = Math.round(r.used / r.games * 1000) / 10;
  r.usedWinRate = r.used ? Math.round(r.usedWin / r.used * 1000) / 10 : null;
  r.avgMoves = Math.round(r.moves / r.games);
  console.log(JSON.stringify(r));
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
