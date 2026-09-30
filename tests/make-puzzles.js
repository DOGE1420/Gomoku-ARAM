// 퍼즐(공격/수비 문제) 생성: node tests/make-puzzles.js <시드 시작> <대국 수> <출력 파일>
const fs = require('fs');
const openBench = require('./load');
(async () => {
  const [start = 1, games = 5, outFile = 'puzzles-part.json'] = process.argv.slice(2);
  const { page, errors, cleanup } = await openBench();
  const found = [];
  for (let g = 0; g < +games; g++) {
    const seed = +start + g;
    const positions = await page.evaluate(s => window.__bench.selfPlay(s, 300, 50), seed);
    for (const pos of positions) {
      const pz = await page.evaluate(p => window.__bench.classify(p, 3000), pos);
      if (pz) { pz.seed = seed; pz.ply = pos.ply; found.push(pz); }
    }
    console.log(`game seed ${seed}: positions ${positions.length}, puzzles so far ${found.length}`);
  }
  fs.writeFileSync(outFile, JSON.stringify(found));
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
