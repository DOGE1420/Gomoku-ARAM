// 정석 생성: node tests/make-book.js <stage 1|2> <part> <parts> <국면당 ms> <출력 파일> [반경=2]
// 여러 프로세스로 나눠 돌린 뒤 merge-book.js로 index.html의 E2_BOOK에 합친다
const fs = require('fs');
const openBench = require('./load');
(async () => {
  const [stage, part, parts, ms, outFile, radius = 2] = process.argv.slice(2);
  const { page, errors, cleanup } = await openBench();
  const all = await page.evaluate(([s, r]) => window.__bench.bookPositions(s, r), [+stage, +radius]);
  const mine = all.filter((_, k) => k % +parts === +part);
  console.log(`stage ${stage}: ${all.length} positions, this part ${mine.length}`);
  const book = {};
  for (const pos of mine) {
    const r = await page.evaluate(([p, t]) => window.__bench.bookSolve(p, t), [pos, +ms]);
    book[r.key] = r.move;
    fs.writeFileSync(outFile, JSON.stringify(book));
  }
  console.log(`done ${Object.keys(book).length}`);
  if (errors.length) console.log('errors:', errors);
  await cleanup();
})();
