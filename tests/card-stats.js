// 카드(증강)별 승률: 짱짱맨끼리 카드 포함 대국을 두고, 각 카드를 '뽑은 쪽'·'쓴 쪽'이 이긴 비율을 셈
// node tests/card-stats.js <판 수> [한 수 ms=1500] [출력 json]
const fs = require('fs');
const openBench = require('./load');
(async () => {
  const [games = 10, ms = 1500, outFile = 'card-stats-part.json'] = process.argv.slice(2);
  const timing = { timeMs: +ms, chainTimeMs: Math.round(ms / 2), planMs: Math.round(ms * 0.8) };
  const { page, errors, cleanup } = await openBench();
  const rows = [];
  for (let g = 0; g < +games; g++) {
    await page.evaluate(([t]) => window.__bench.cardGameStart(50, 50, t, 2), [timing]);
    const t0 = Date.now(); let st;
    for (;;) { await page.waitForTimeout(1000); st = await page.evaluate(() => window.__bench.cardGameState()); if (st.over || Date.now() - t0 > 12 * 60 * 1000) break; }
    const cards = await page.evaluate(() => window.__bench.cardGameCards());
    await page.evaluate(() => window.__bench.cardGameStop());
    if (st.over && st.winner) rows.push({ winner: st.winner, cards });
    fs.writeFileSync(outFile, JSON.stringify(rows));
  }
  console.log('games', rows.length, errors.length ? 'errors: ' + errors.join(' | ') : 'no errors');
  await cleanup();
})();
