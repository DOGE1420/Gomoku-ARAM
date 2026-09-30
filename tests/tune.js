// 평가 가중치 대국 튜닝: 후보 가중치 vs 현재 기본값, 같은 시작(무작위 3수)으로 흑백을 바꿔 두 판씩
// node tests/tune.js '<후보 JSON (E2P 일부)>' <시드 시작> <쌍 수> [한 수 시간ms=300]
const openBench = require('./load');
(async () => {
  const [candJson, start = 1, pairs = 10, ms = 300] = process.argv.slice(2);
  const cand = JSON.parse(candJson);
  const { page, errors, cleanup } = await openBench();
  let pts = 0, games = 0;
  for (let s = +start; s < +start + +pairs; s++) {
    for (const candBlack of [true, false]) {
      const A = { level: 50, params: cand }, B = { level: 50 };
      const r = await page.evaluate(([seed, b, w, t]) => window.__bench.match(seed, b, w, t),
        [s, candBlack ? A : B, candBlack ? B : A, +ms]);
      const candColor = candBlack ? 1 : 2;
      pts += r.winner === 0 ? 0.5 : r.winner === candColor ? 1 : 0; games++;
    }
  }
  console.log(JSON.stringify({ cand, pts, games }));
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
