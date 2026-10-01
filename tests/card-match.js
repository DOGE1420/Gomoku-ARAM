// 카드 포함 실제 대국: node tests/card-match.js <레벨A> <레벨B> <판 수> [한 수 ms=1500] [무작위 시작 수=2]
// 판마다 흑백을 바꾼다. 레벨 51 = 짱짱맨(50)에서 카드 개선을 끈 것 (bench-harness.js 참고)
// 실험: 레벨 자리에 60/61을 주고 6·7번째 인자로 켤 기능 JSON (예: '{"chainPlan":true}' '{}')
const openBench = require('./load');
(async () => {
  const args = process.argv.slice(2);
  const [a, b, games = 4, ms = 1500, rnd = 2] = args.slice(0, 5).map(Number);
  const ovA = JSON.parse(args[5] || '{}'), ovB = JSON.parse(args[6] || '{}');
  const timing = { timeMs: ms, chainTimeMs: Math.round(ms / 2), planMs: Math.round(ms * 0.8) };
  const { page, errors, cleanup } = await openBench();
  const res = { [a]: 0, [b]: 0, draw: 0, stall: 0, cardsUsed: {} };
  for (let g = 0; g < games; g++) {
    const aBlack = g % 2 === 0;
    await page.evaluate(([bl, wh, t, r, oa, ob]) => window.__bench.cardGameStart(bl, wh, t, r, oa, ob), [aBlack ? a : b, aBlack ? b : a, timing, rnd, ovA, ovB]);
    const t0 = Date.now();
    let st;
    for (;;) {
      await page.waitForTimeout(1000);
      st = await page.evaluate(() => window.__bench.cardGameState());
      if (st.over || Date.now() - t0 > 12 * 60 * 1000) break;
    }
    await page.evaluate(() => window.__bench.cardGameStop());
    // 카드 사용 기록 (로그에서 '발동' 줄)
    for (const line of st.log) { const m = line.match(/^(흑|백): (\S+) (.+?) 발동/); if (m) res.cardsUsed[m[3]] = (res.cardsUsed[m[3]] || 0) + 1; }
    if (!st.over) { res.stall++; console.log(`game ${g}: STALL after ${st.moves} moves`, st.log.slice(0, 5)); continue; }
    if (!st.winner) res.draw++;
    else res[(st.winner === 1) === aBlack ? a : b]++;
    console.log(`game ${g}: ${aBlack ? a : b}(black) vs ${aBlack ? b : a}(white) → winner ${st.winner === 1 ? 'black' : st.winner === 2 ? 'white' : 'none'}, ${st.moves} moves, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  console.log(JSON.stringify(res));
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
