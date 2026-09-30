// 생성된 정석 조각들을 index.html의 `const E2_BOOK = {...};` 한 줄에 합친다: node tests/merge-book.js part1.json part2.json ...
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'index.html');
let src = fs.readFileSync(file, 'utf8');
const re = /const E2_BOOK = (\{.*\});/;
const book = JSON.parse(src.match(re)[1]);
for (const f of process.argv.slice(2)) Object.assign(book, JSON.parse(fs.readFileSync(f, 'utf8')));
const sorted = Object.fromEntries(Object.keys(book).sort().map(k => [k, book[k]]));
src = src.replace(re, () => 'const E2_BOOK = ' + JSON.stringify(sorted) + ';');
fs.writeFileSync(file, src);
console.log('E2_BOOK entries:', Object.keys(sorted).length);
