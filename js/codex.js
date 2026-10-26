// 카드 도감 · 티어표 (메뉴와 게임 화면에서 열 수 있는 창)
// (index.html에서 순서대로 불러오는 일반 스크립트 — 파일끼리 전역 변수·함수를 함께 씀)

// 티어: 일반 카드는 짱짱맨끼리 200판의 '쓴 쪽 승률'·픽률, 전설 카드는 한쪽만 들고 둔 측정(카드당 10판) 기준
// est: true = 아직 측정 전이라 효과를 보고 매긴 예상 티어
const TIERS = {
  // 일반 카드
  chain: { t: 'S', ko: '쓴 쪽 승률 57.6%, 픽률 94% — 한 턴에 3수는 모든 상황에서 강함', en: 'Used-side win 57.6%, pick 94% — 3 stones in one turn is always strong' },
  trade: { t: 'S', ko: '쓴 쪽 승률 62.5% — 열린 3을 끊거나 내 줄을 잇는 결정타', en: 'Used-side win 62.5% — breaks threats or links your lines' },
  bomb: { t: 'S', ko: '쓴 쪽 승률 61.0% — 원하는 돌 제거 + 2턴 구멍', en: 'Used-side win 61.0% — remove any stone plus a 2-turn crater' },
  windmill: { t: 'A', ko: '쓴 쪽 승률 59.7%, 픽률 84% — 주변 8칸 봉쇄로 공격 거점', en: 'Used-side win 59.7%, pick 84% — locks 8 cells around your stone' },
  infection: { t: 'A', ko: '쓴 쪽 승률 58.3% (표본 적음) — 2개 전향은 크지만 턴 종료', en: 'Used-side win 58.3% (small sample) — 2 conversions, ends your turn' },
  snipe: { t: 'A', est: true, ko: '예상 — 상대 돌 2개 제거, 대신 그 턴에 돌을 못 둠', en: 'Estimate — removes 2 enemy stones, but you skip placing that turn' },
  giant: { t: 'A', est: true, ko: '예상 — 한 번에 최대 4칸 확보 (덤 칸은 승리 불가)', en: 'Estimate — up to 4 cells at once (extra cells cannot win)' },
  trap: { t: 'B', ko: '쓴 쪽 승률 52.2% — 4를 만들 자리와 묶으면 강함', en: 'Used-side win 52.2% — strong when paired with a four' },
  blockade: { t: 'B', ko: '쓴 쪽 승률 50.0% — 상대가 결정타를 쥐었을 때만 가치', en: 'Used-side win 50.0% — only shines against a key card' },
  reversal: { t: 'B', ko: '쓴 쪽 승률 50.0% — 지고 있을 때 판을 뒤집는 한 방', en: 'Used-side win 50.0% — a comeback swing' },
  double: { t: 'B', est: true, ko: '예상 — 카드 1장을 2장으로, 무엇이 올지 모름', en: 'Estimate — turns 1 card into 2 random ones' },
  wall: { t: 'B', ko: '쓴 쪽 승률 45.1% — 수비용, 열린 4를 막을 때 결정적', en: 'Used-side win 45.1% — defensive, decisive against an open four' },
  sixsense: { t: 'B', ko: '쓴 쪽 승률 44.4% — 상대의 5목 위협을 무력화', en: 'Used-side win 44.4% — defuses the opponent’s fives' },
  weather: { t: 'C', est: true, ko: '예상 — 맵 규칙을 바꾸지만 이득은 상황에 달림', en: 'Estimate — changes the map; value depends on the board' },
  ghost: { t: 'C', est: true, ko: '예상 — 사람 상대로는 함정이 되지만 판에는 그대로 영향', en: 'Estimate — tricks humans, but the stone is still just a stone' },
  peek: { t: 'C', est: true, ko: '예상 — 정보만 얻고 판은 그대로', en: 'Estimate — information only' },
  shield: { t: 'C', ko: '쓴 쪽 승률 31.8% — 지키는 동안 판을 못 움직임', en: 'Used-side win 31.8% — protection without progress' },
  teleport: { t: 'C', ko: '무작위 이동이라 이득이 적음 (표본 적음)', en: 'Random move, little gain (small sample)' },
  meteor: { t: 'D', ko: '쓴 쪽 승률 16.7% — 내 돌이 날아갈 수도 있음', en: 'Used-side win 16.7% — may hit your own stone' },
  earthquake: { t: 'D', ko: '봇이 고르지 않음 — 판 전체를 흔들어 예측 불가', en: 'Bots never pick it — shakes the whole board unpredictably' },
  alkkagi: { t: 'D', ko: '봇이 고르지 않음 — 손 기술에 따라 결과가 크게 달라짐', en: 'Bots never pick it — result depends on flicking skill' },
  // 전설 카드
  king: { t: 'S', ko: '발동한 4판 모두 승리 — 조건은 쉬운데 돌 최대 8개', en: 'Won all 4 games it fired — easy condition, up to 8 stones' },
  nothing: { t: 'S', ko: '발동 100%, 10승 0패 — 패를 바로 쓰면 공짜 자동 효과', en: 'Fired 100%, 10–0 — free if you spend cards right away' },
  nap: { t: 'S', est: true, ko: '예상 (멀티 전용) — 10초 기다리면 2번 착수 + 상대 카드 무효', en: 'Estimate (multiplayer) — wait 10s for 2 stones and a nullified card' },
  clown: { t: 'A', ko: '발동 30%, 발동한 판 3/3 승리 — 잃은 돌이 한꺼번에 돌아옴', en: 'Fired 30%, won 3/3 — all lost stones come back' },
  obelisk: { t: 'A', ko: '발동 90% — 줄 하나를 통째로 지우지만 내 돌 3개가 비용', en: 'Fired 90% — wipes a line but costs 3 stones' },
  latebloom: { t: 'B', ko: '발동 30% — 40수까지 가야 하지만 5번 착수는 강력', en: 'Fired 30% — needs 40 moves, but 5 placements is huge' },
  chicken: { t: 'B', ko: '발동 30% — 동전 던지기, 불리할 때 쓰는 카드', en: 'Fired 30% — a coin flip for when you are behind' },
  turtle: { t: 'B', ko: '발동 0% — 돌 5개 차이가 거의 안 남, 켜지면 매우 강함', en: 'Fired 0% — the 5-stone gap rarely happens, very strong once on' },
  blind: { t: 'C', ko: '발동 0% — 비용(멀리 3번) 대비 효과(보호 돌 1개)가 작음', en: 'Fired 0% — 3 far moves for one protected stone' },
  mirror: { t: 'C', ko: '발동 0% — 상대가 대칭 자리를 남겨 줘야 함', en: 'Fired 0% — needs the opponent to leave mirror spots' },
  allin: { t: 'C', ko: '발동 0% — 패 4장을 모아 동전 던지기', en: 'Fired 0% — full hand for a coin flip' },
  sloth: { t: 'D', ko: '발동 0% — 가장자리에 5턴은 사실상 판 포기', en: 'Fired 0% — 5 turns on the edge is nearly giving up' },
  // 시작 능력
  sturdy: { t: 'A', est: true, ko: '예상 — 중앙 첫 3돌이 판 내내 안전', en: 'Estimate — your first 3 central stones stay safe all game' },
  pouch: { t: 'A', est: true, ko: '예상 — 카드가 넘쳐 버려지는 일이 줄어듦', en: 'Estimate — fewer cards lost to a full hand' },
  clover: { t: 'A', est: true, ko: '예상 — 매 카드 선택에서 1장 더 보고 고름', en: 'Estimate — one extra option every pick' },
  umbrella: { t: 'B', est: true, ko: '예상 — 자연재해 맵에서만 효과 (평원·우주에선 무용)', en: 'Estimate — only matters on disaster maps' },
  pickpocket: { t: 'B', est: true, ko: '예상 — 카드 1장 공짜, 한 번뿐', en: 'Estimate — one free card, once' },
  retry: { t: 'C', est: true, ko: '예상 — 다시 뽑기 2번 추가', en: 'Estimate — two extra rerolls' },
};
const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];

Object.assign(I18N.ko, {
  'codex.open': '📚 카드 도감 · 티어표', 'codex.openShort': '📚 도감', 'codex.desc': '모든 카드·전설·시작 능력·맵 보기',
  'codex.title': '카드 도감', 'codex.close': '닫기',
  'codex.tab.cards': '일반 카드', 'codex.tab.legends': '전설 카드', 'codex.tab.abilities': '시작 능력', 'codex.tab.maps': '맵', 'codex.tab.tiers': '티어표',
  'codex.chance': '출현 {p}%', 'codex.auto': '자동 발동', 'codex.manual': '조건 충족 시 사용', 'codex.mpOnly': '멀티 전용', 'codex.est': '예상',
  'codex.tierNote': '일반 카드: 짱짱맨끼리 200판에서 그 카드를 쓴 쪽의 승률·픽률 기준 · 전설 카드: 한쪽만 들고 둔 측정(카드당 10판, 레벨 5) 기준 · "예상"은 아직 측정 전이라 효과를 보고 매긴 티어입니다.',
  'codex.sec.cards': '일반 카드', 'codex.sec.legends': '전설 카드', 'codex.sec.abilities': '시작 능력',
});
Object.assign(I18N.en, {
  'codex.open': '📚 Card Codex · Tier List', 'codex.openShort': '📚 Codex', 'codex.desc': 'Every card, legend, ability and map',
  'codex.title': 'Card Codex', 'codex.close': 'Close',
  'codex.tab.cards': 'Cards', 'codex.tab.legends': 'Legends', 'codex.tab.abilities': 'Abilities', 'codex.tab.maps': 'Maps', 'codex.tab.tiers': 'Tier List',
  'codex.chance': '{p}% to appear', 'codex.auto': 'Automatic', 'codex.manual': 'Use when ready', 'codex.mpOnly': 'Multiplayer only', 'codex.est': 'estimate',
  'codex.tierNote': 'Cards: win rate and pick rate of the side that used the card over 200 Super-bot games · Legends: one side holding it (10 games each, level 5) · "estimate" = not measured yet, rated from the effect.',
  'codex.sec.cards': 'Cards', 'codex.sec.legends': 'Legends', 'codex.sec.abilities': 'Abilities',
});

const codexEl = document.getElementById('codex');
const codexTabsEl = document.getElementById('codex-tabs');
const codexBodyEl = document.getElementById('codex-body');
let codexTab = 'cards';

function tierInfo(id) { return TIERS[id] || null; }
function tierBadge(id) {
  const ti = tierInfo(id);
  if (!ti) return '';
  return `<span class="tier-badge tier-${ti.t}" title="${escapeHtml(lang === 'en' ? ti.en : ti.ko)}">${ti.t}${ti.est ? '?' : ''}</span>`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function codexCard(card, extra) {
  return `<div class="codex-card${card.legend ? ' legend' : card.ability ? ' ability' : ''}">` +
    `<div class="cc-head"><span class="cc-icon">${card.icon}</span><span class="cc-name">${escapeHtml(cardName(card))}</span>${tierBadge(card.id)}</div>` +
    (extra ? `<div class="cc-meta">${extra}</div>` : '') +
    `<div class="cc-short">${escapeHtml(cardShort(card))}</div>` +
    `<div class="cc-desc">${escapeHtml(cardDesc(card).replace(/\s*\((가장 희귀|희귀 카드)\)/g, ''))}</div></div>`;
}
function renderCodex() {
  const tabs = ['cards', 'legends', 'abilities', 'maps', 'tiers'];
  codexTabsEl.innerHTML = '';
  tabs.forEach(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'codex-tab' + (k === codexTab ? ' on' : '');
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === codexTab));
    b.textContent = t('codex.tab.' + k);
    b.addEventListener('click', () => { codexTab = k; renderCodex(); });
    codexTabsEl.appendChild(b);
  });
  document.getElementById('codex-title').textContent = t('codex.title');
  document.getElementById('codex-close').textContent = t('codex.close');
  let html = '';
  if (codexTab === 'cards') {
    const total = CARD_POOL.reduce((s, c) => s + (c.weight || 10), 0);
    html = '<div class="codex-grid">' + CARD_POOL.map(c => codexCard(c, t('codex.chance', { p: ((c.weight || 10) * 100 / total).toFixed(1) }))).join('') + '</div>';
  } else if (codexTab === 'legends') {
    html = '<div class="codex-grid">' + LEGEND_POOL.map(c => codexCard(c, t(c.auto ? 'codex.auto' : 'codex.manual') + (c.mpOnly ? ' · ' + t('codex.mpOnly') : ''))).join('') + '</div>';
  } else if (codexTab === 'abilities') {
    html = '<div class="codex-grid">' + ABILITY_POOL.map(c => codexCard(c)).join('') + '</div>';
  } else if (codexTab === 'maps') {
    html = '<div class="codex-grid">' + MAP_POOL.map(m => `<div class="codex-card map"><div class="cc-head"><span class="cc-icon">${m.icon}</span><span class="cc-name">${escapeHtml(mapName(m.id))}</span></div>` +
      `<div class="cc-short">${escapeHtml(mapShort(m.id))}</div><div class="cc-desc">${escapeHtml(mapDesc(m.id))}</div></div>`).join('') + '</div>' +
      `<p class="codex-note">${escapeHtml(t('map.zoneNote', { start: ZONE_START, every: ZONE_EVERY, max: ZONE_MAX }))}</p>`;
  } else {
    const groups = [['cards', CARD_POOL], ['legends', LEGEND_POOL], ['abilities', ABILITY_POOL]];
    html = groups.map(([k, pool]) => `<h3 class="codex-sec">${t('codex.sec.' + k)}</h3>` + TIER_ORDER.map(tier => {
      const list = pool.filter(c => tierInfo(c.id) && tierInfo(c.id).t === tier);
      if (!list.length) return '';
      return `<div class="tier-row"><div class="tier-label tier-${tier}">${tier}</div><div class="tier-items">` + list.map(c => {
        const ti = tierInfo(c.id);
        return `<div class="tier-item"><span class="ti-name">${c.icon} ${escapeHtml(cardName(c))}${ti.est ? ` <em>(${t('codex.est')})</em>` : ''}</span><span class="ti-why">${escapeHtml(lang === 'en' ? ti.en : ti.ko)}</span></div>`;
      }).join('') + '</div></div>';
    }).join('')).join('') + `<p class="codex-note">${escapeHtml(t('codex.tierNote'))}</p>`;
  }
  codexBodyEl.innerHTML = html;
}
function openCodex(tab) {
  if (tab) codexTab = tab;
  renderCodex();
  codexEl.hidden = false;
  codexBodyEl.scrollTop = 0;
  document.getElementById('codex-close').focus();
}
function closeCodex() { codexEl.hidden = true; }
document.getElementById('codex-close').addEventListener('click', closeCodex);
codexEl.addEventListener('click', (e) => { if (e.target === codexEl) closeCodex(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !codexEl.hidden) closeCodex(); });
document.getElementById('codex-menu-btn').addEventListener('click', () => openCodex());
document.getElementById('codex-game-btn').addEventListener('click', () => openCodex());
