// card-stats.js 결과(json 여러 개)를 합쳐 카드별 픽률·승률 표를 출력: node tests/card-report.js a.json b.json ...
const fs = require('fs');
const rows = process.argv.slice(2).flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const st = {};
const g = id => (st[id] = st[id] || { offered: 0, picked: 0, gotN: 0, gotW: 0, usedN: 0, usedW: 0 });
for (const row of rows) {
  for (const d of row.cards.drafts || []) { for (const id of d.offer) g(id).offered++; g(d.pick).picked++; }
  for (const col of ['1', '2']) {
    const won = String(row.winner) === col;
    for (const id of Object.keys(row.cards[col].got)) { g(id).gotN++; if (won) g(id).gotW++; }
    for (const id of Object.keys(row.cards[col].used)) { g(id).usedN++; if (won) g(id).usedW++; }
  }
}
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
console.log(`판 수 ${rows.length}`);
console.log('카드 | 제시 | 픽률 | 뽑은 쪽 승률 (n) | 쓴 쪽 승률 (n)');
for (const [id, s] of Object.entries(st).sort((a, b) => b[1].picked / (b[1].offered || 1) - a[1].picked / (a[1].offered || 1)))
  console.log(`${id} | ${s.offered} | ${pct(s.picked, s.offered)} | ${pct(s.gotW, s.gotN)} (${s.gotN}) | ${pct(s.usedW, s.usedN)} (${s.usedN})`);
