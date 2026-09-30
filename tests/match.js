// 레벨끼리 대국: 같은 시작(무작위 3수)으로 흑백을 바꿔 두 판씩
// node tests/match.js <레벨A> <레벨B> <시드 시작> <쌍 수> [한 수 시간ms=1000]
const openBench = require('./load');
(async () => {
  const [a, b, start = 1, pairs = 5, ms = 1000] = process.argv.slice(2).map(Number);
  const { page, errors, cleanup } = await openBench();
  const res = { [a]: 0, [b]: 0, draw: 0, blackWins: 0 };
  for (let s = start; s < start + pairs; s++) {
    for (const aBlack of [true, false]) {
      const A = { level: a, cfg: { book: true } }, B = { level: b, cfg: { book: true } };
      const r = await page.evaluate(([seed, bl, wh, t]) => window.__bench.match(seed, bl, wh, t), [s, aBlack ? A : B, aBlack ? B : A, ms]);
      if (!r.winner) res.draw++;
      else { res[(r.winner === 1) === aBlack ? a : b]++; if (r.winner === 1) res.blackWins++; }
    }
  }
  console.log(JSON.stringify(res));
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
