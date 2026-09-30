// index.html의 게임 코드 안쪽에 bench-harness.js를 넣은 테스트 페이지를 만들고 브라우저로 연다
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
module.exports = async function openBench() {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const hook = fs.readFileSync(path.join(__dirname, 'bench-harness.js'), 'utf8');
  const i = src.lastIndexOf('})();');
  const out = path.join(require('os').tmpdir(), 'gomoku-bench-' + process.pid + '.html');
  fs.writeFileSync(out, src.slice(0, i) + hook + src.slice(i));
  const executablePath = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + out);
  await page.click('#mode-local-btn'); // 게임 상태 초기화
  await page.waitForTimeout(200);
  return { browser, page, errors, cleanup: async () => { await browser.close(); fs.unlinkSync(out); } };
};
