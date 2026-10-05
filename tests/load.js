// index.html 뒤에 bench-harness.js를 붙인 테스트 페이지를 만들고 브라우저로 연다
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
module.exports = async function openBench() {
  const root = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const hook = fs.readFileSync(path.join(__dirname, 'bench-harness.js'), 'utf8');
  // 게임 스크립트(js/*.js)는 저장소 폴더 기준으로 읽고, 측정 코드는 마지막 스크립트 뒤에 붙임 (게임 전역 변수·함수를 그대로 씀)
  const base = '<base href="' + require('url').pathToFileURL(root + path.sep).href + '">';
  const i = src.lastIndexOf('</body>');
  const out = path.join(require('os').tmpdir(), 'gomoku-bench-' + process.pid + '.html');
  fs.writeFileSync(out, src.replace('<head>', '<head>' + base).slice(0, i + base.length) + '<script>\n' + hook + '\n</script>\n' + src.slice(i));
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
