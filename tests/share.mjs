// tests/share.mjs — 分享模块纯逻辑自证（node 直跑：node tests/share.mjs）
// 覆盖：URL 解析回退、统计/成就文案、QR 矩阵结构性正确（三个定位角）、SVG 输出形态。
// QR 语义正确性由 vendored 上游库（安全审查 PASS）保证，这里锁「我们这层的接线」。
import {
  FALLBACK_URL, resolveGameUrl, statsLine, achievementsLine,
  buildQrMatrix, buildQrSvg,
} from '../src/share.js';

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

console.log('— resolveGameUrl —');
assert(resolveGameUrl({ protocol: 'https:', origin: 'https://u.github.io', pathname: '/coin-flip/' }) === 'https://u.github.io/coin-flip/', 'https 部署取真实地址');
assert(resolveGameUrl({ protocol: 'http:', origin: 'http://localhost:3080', pathname: '/x/' }) === 'http://localhost:3080/x/', 'http 亦取真实地址');
assert(resolveGameUrl({ protocol: 'file:' }) === FALLBACK_URL, 'file:// 回退 GitHub Pages');
assert(resolveGameUrl(null) === FALLBACK_URL, '非法输入回退 GitHub Pages');

console.log('— statsLine —');
const C = { total: 0, heads: 0, tails: 0, streakFace: 0, streakLast: '' };
assert(statsLine(C).includes('尚未开抛'), '零抛友好文案');
assert(statsLine({ ...C, total: 10, heads: 6, tails: 4, streakFace: 1, streakLast: 'heads' }) === '总抛 10 · 正 6 · 反 4', '无连击段时不展示');
assert(statsLine({ ...C, total: 10, heads: 8, tails: 2, streakFace: 3, streakLast: 'heads' }) === '总抛 10 · 正 8 · 反 2 · 连正×3', '连击 ≥2 展示连正×3');
assert(statsLine({ ...C, total: 7, heads: 2, tails: 5, streakFace: 2, streakLast: 'tails' }) === '总抛 7 · 正 2 · 反 5 · 连反×2', '连反×2 正确');

console.log('— achievementsLine —');
assert(achievementsLine({}) === '成就 0/16 · 虚位以待', '零解锁文案');
const unl = { 'first-throw': 1000, 'throws-10': 2000, 'drop': 3000, 'streak-5-any': 500 };
const line = achievementsLine(unl);
assert(line.startsWith('成就 4/16'), '解锁计数 4/16');
assert(line.includes('桌面之外') && line.includes('小试手气') && line.includes('命运之始'), '最近 3 个按时间倒序（桌面之外、小试手气、命运之始）');
assert(!line.includes('五福同临'), '最早的成就（五福同临）不出现');

console.log('— buildQrMatrix（三个定位角结构） —');
const m = buildQrMatrix(FALLBACK_URL);
assert(m.size >= 21 && m.size <= 177, `版本自动选择合理（模块数 ${m.size}）`);
// 定位角：7×7 外圈黑、次圈白、中心 3×3 黑。左上原点：
assert(m.isDark(0, 0) && m.isDark(0, 6) && m.isDark(6, 0) && m.isDark(3, 3), '左上定位角：外圈与中心黑');
assert(!m.isDark(1, 1) && !m.isDark(5, 5) && m.isDark(2, 2), '左上定位角：白环与中心黑正确');
// 右上（列偏移 size-7）与左下（行偏移 size-7）：
assert(m.isDark(0, m.size - 1) && m.isDark(3, m.size - 4) && !m.isDark(1, m.size - 6), '右上定位角结构正确');
assert(m.isDark(m.size - 1, 0) && m.isDark(m.size - 4, 3) && !m.isDark(m.size - 6, 1), '左下定位角结构正确');

console.log('— buildQrSvg —');
const svg = buildQrSvg(FALLBACK_URL, 208);
let darkCount = 0;
for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.isDark(r, c)) darkCount++;
assert(svg.includes('<svg') && svg.includes('crispEdges') && svg.includes('width="208"'), 'SVG 形态：crispEdges + 尺寸');
const rectCount = (svg.match(/<rect/g) || []).length;
assert(rectCount === darkCount + 1, `rect 数 = 暗模块 ${darkCount} + 白底 1（实际 ${rectCount}）`);

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
