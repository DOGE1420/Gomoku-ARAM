// 퍼즐 채점 + 속도 측정: node tests/run-puzzles.js [시간ms=2000] [레벨들=20,50]
const fs = require('fs');
const path = require('path');
const openBench = require('./load');
(async () => {
  const ms = +(process.argv[2] || 2000);
  const levels = (process.argv[3] || '20,50').split(',').map(Number);
  const puzzles = JSON.parse(fs.readFileSync(path.join(__dirname, 'puzzles.json'), 'utf8'));
  const { page, errors, cleanup } = await openBench();
  for (const lv of levels) {
    const score = { attack: [0, 0], defense: [0, 0] };
    let depthSum = 0, nodeSum = 0, timeSum = 0;
    for (const pz of puzzles) {
      const r = await page.evaluate(([p, l, t]) => {
        const s = window.__bench.think(p, l, t);
        return Object.assign(s, { ok: p.answers.includes(s.move) });
      }, [pz, lv, ms]);
      score[pz.type][0] += r.ok ? 1 : 0; score[pz.type][1]++;
      depthSum += r.depth; nodeSum += r.nodes; timeSum += r.ms;
    }
    const n = puzzles.length;
    console.log(`level ${lv} @${ms}ms: attack ${score.attack[0]}/${score.attack[1]}, defense ${score.defense[0]}/${score.defense[1]}, ` +
      `total ${score.attack[0] + score.defense[0]}/${n} | avg depth ${(depthSum / n).toFixed(1)}, ` +
      `nodes/s ${Math.round(nodeSum / (timeSum / 1000))}`);
  }
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
