// ui.js 记账逻辑 node 自测（DOM 桩）+ main.js 接线契约检查：直跑 node tests/ui-stats.mjs
import fs from 'node:fs';
import { CoinUI } from '../src/ui.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ok -', msg); }
  else { fail++; console.error('  FAIL -', msg); }
}

// —— 最小 DOM/localStorage 桩 ——
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
function stubEl() {
  return {
    textContent: '', style: {}, offsetWidth: 0,
    classList: { add() {}, remove() {}, toggle() { return false; } },
    addEventListener() {}, append() {}, setAttribute() {},
    querySelector: () => stubEl(),
  };
}
const ids = ['throw-btn', 'result-panel', 'result-face', 'result-en', 'stat-heads', 'stat-tails',
  'stat-standing', 'stat-total', 'stat-rate', 'ratio-heads', 'sound-btn', 'status-line'];
globalThis.document = {
  getElementById: (id) => (ids.includes(id) ? stubEl() : null),
  querySelectorAll: () => [],
  createElement: () => stubEl(),
};
globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };

const ui = new CoinUI({ onThrow() {}, onToggleSound() {} });

// 1) 正常两面记账
ui.record('heads');
ui.record('tails');
assert(ui.stats.heads === 1 && ui.stats.tails === 1 && ui.stats.standing === 0, '正/反各 1，站立 0');

// 2) 立住进独立桶，不污染正/反（回归：main.js 曾漏传 standing）
ui.record('heads', true);
assert(ui.stats.standing === 1, '立住 +1');
assert(ui.stats.heads === 1 && ui.stats.tails === 1, '立住不进正/反桶');

// 3) 渲染输出：总计 = 正+反+站立；正面率只按两面
ui._renderStats();
assert(ui.els.statTotal.textContent === '3', `总计 = 3 (${ui.els.statTotal.textContent})`);
assert(ui.els.statStanding.textContent === '1', `站立显示 = 1 (${ui.els.statStanding.textContent})`);
assert(ui.els.statRate.textContent === '50%', `正面率 = 50% (${ui.els.statRate.textContent})`);

// 4) 旧存档迁移：无 standing 字段 → 补 0
store.set('coin-flip-stats-v1', JSON.stringify({ heads: 4, tails: 5 }));
const ui2 = new CoinUI({ onThrow() {} });
assert(ui2.stats.standing === 0 && ui2.stats.heads === 4, '旧存档迁移补 standing=0');
ui2.record('tails', true);
assert(ui2.stats.standing === 1 && ui2.stats.tails === 5, '迁移后立住记账正常');

// 5) 接线契约：main.js 的 record 调用必须带 standing（回归守卫）
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert(/ui\.record\(face,\s*standing\)/.test(mainSrc), 'main.js 调用 ui.record(face, standing)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
