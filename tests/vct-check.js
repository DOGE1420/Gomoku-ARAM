// VCT 건전성 확인: 공격 문제마다 v2(공격)가 실제로 끝까지 이기는지, 수비는 다른 엔진이 더 긴 시간으로 막음
// node tests/vct-check.js [수비 레벨=20] [수비 시간ms=3000]
const fs = require('fs');
const path = require('path');
const openBench = require('./load');
(async () => {
  const defLevel = +(process.argv[2] || 20), defMs = +(process.argv[3] || 3000);
  const puzzles = JSON.parse(fs.readFileSync(path.join(__dirname, 'puzzles.json'), 'utf8')).filter(p => p.type === 'attack');
  const { page, errors, cleanup } = await openBench();
  let win = 0; const fails = [];
  for (let k = 0; k < puzzles.length; k++) {
    const r = await page.evaluate(([p, dl, dm]) => window.__bench.playout(p, 1500, dl, dm, 40), [puzzles[k], defLevel, defMs]);
    if (r.winner === 1) win++; else fails.push({ k, r });
  }
  console.log(`attacker (level 50) converted ${win}/${puzzles.length} winning positions vs level ${defLevel} @${defMs}ms`);
  if (fails.length) console.log('not converted:', JSON.stringify(fails));
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
