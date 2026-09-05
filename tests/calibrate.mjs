// tests/calibrate.mjs — 校准向导纯逻辑自证（node 直跑：node tests/calibrate.mjs）
// 模拟「每拍固定延迟 ± 随机抖动」的拍击序列，喂给与向导 UI 同一份代码
// （attributeTap / evaluateSession），断言：逐拍归属正确、结果落在设定延迟附近、
// 走神拍被剔除、抖动过大时给出不可靠警告、拍数不足正确拒绝。
import {
  PERIOD, COUNT_IN, BEATS, MIN_TAPS,
  attributeTap, evaluateSession,
} from '../src/calibrate.js';

// —— 确定性随机（mulberry32，避免测试碰运气） ——
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

// 构造一局节拍时间轴（与向导 begin() 相同的形状）
function makeSession() {
  const ticks = [];
  for (let i = 0; i < COUNT_IN + BEATS; i++) {
    ticks.push({ c: i * PERIOD, p: i * PERIOD, counted: i >= COUNT_IN, tap: undefined });
  }
  return ticks;
}

console.log('— 不变量 —');
assert(PERIOD >= 0.66, `节拍周期 ${PERIOD}s ≥ 2×300ms（300ms 延迟不发生归属翻转）`);
assert(MIN_TAPS <= BEATS, `有效拍击下限 ${MIN_TAPS} ≤ 计数拍数 ${BEATS}`);

console.log('— 场景 1：延迟 300ms ± 25ms 抖动（你的机器画像） —');
{
  const rnd = mulberry32(30001);
  const ticks = makeSession();
  let allOwn = true;
  for (let i = COUNT_IN; i < COUNT_IN + BEATS; i++) {
    const tapSec = ticks[i].p + 0.300 + (rnd() * 2 - 1) * 0.025;
    if (attributeTap(tapSec, ticks) !== ticks[i]) allOwn = false;
  }
  assert(allOwn, '逐拍归属：12 拍全部归到自己那一拍（不再翻到下一拍）');
  const r = evaluateSession(ticks);
  assert(r.ok && r.validCount === BEATS, `会话有效拍数 ${r.validCount}/${BEATS}`);
  assert(Math.abs(r.resultMs - 300) <= 20, `结果 ${r.resultMs}ms ∈ 300±20ms`);
  assert(r.reliable, `拍击稳定判定：MAD ${r.madMs}ms ≤ 45ms，无警告`);
}

console.log('— 场景 2：300ms 正常拍 + 1 次走神拍（+430ms） —');
{
  const rnd = mulberry32(30002);
  const ticks = makeSession();
  const strayBeat = COUNT_IN + 4; // 中间某拍走神
  for (let i = COUNT_IN; i < COUNT_IN + BEATS; i++) {
    const late = i === strayBeat ? 0.430 : 0.300 + (rnd() * 2 - 1) * 0.025;
    attributeTap(ticks[i].p + late, ticks);
  }
  const r = evaluateSession(ticks);
  assert(r.ok && r.validCount === BEATS, `有效拍数 ${r.validCount}/${BEATS}（走神拍占格但不影响结算）`);
  assert(Math.abs(r.resultMs - 300) <= 20, `走神拍不影响中位数：结果 ${r.resultMs}ms ∈ 300±20ms`);
  assert(r.reliable, `单次走神不触发不可靠警告（MAD ${r.madMs}ms）`);
}

console.log('— 场景 3：延迟 450ms ± 20ms（接近归属翻转边界） —');
{
  const rnd = mulberry32(30003);
  const ticks = makeSession();
  let allOwn = true;
  for (let i = COUNT_IN; i < COUNT_IN + BEATS; i++) {
    const tapSec = ticks[i].p + 0.450 + (rnd() * 2 - 1) * 0.020;
    if (attributeTap(tapSec, ticks) !== ticks[i]) allOwn = false;
  }
  assert(allOwn, '逐拍归属：450ms 仍全部归到自己那一拍');
  const r = evaluateSession(ticks);
  assert(Math.abs(r.resultMs - 450) <= 20, `结果 ${r.resultMs}ms ∈ 450±20ms`);
}

console.log('— 场景 4：抖动过大（±120ms 手忙脚乱）应判不可靠 —');
{
  const rnd = mulberry32(30004);
  const ticks = makeSession();
  for (let i = COUNT_IN; i < COUNT_IN + BEATS; i++) {
    attributeTap(ticks[i].p + 0.300 + (rnd() * 2 - 1) * 0.120, ticks);
  }
  const r = evaluateSession(ticks);
  assert(Math.abs(r.resultMs - 300) <= 60, `中位数仍稳健：${r.resultMs}ms ∈ 300±60ms`);
  assert(!r.reliable, `触发不可靠警告：MAD ${r.madMs}ms > 45ms`);
}

console.log('— 场景 5：有效拍击不足（只拍了 4 次） —');
{
  const ticks = makeSession();
  for (let i = COUNT_IN; i < COUNT_IN + 4; i++) {
    attributeTap(ticks[i].p + 0.300, ticks);
  }
  const r = evaluateSession(ticks);
  assert(!r.ok && r.validCount === 4, `拒绝结算（有效 ${r.validCount} < ${MIN_TAPS}）`);
}

console.log('— 场景 6：同一拍双击只收第一次 —');
{
  const ticks = makeSession();
  const first = attributeTap(ticks[COUNT_IN].p + 0.300, ticks);
  const second = attributeTap(ticks[COUNT_IN].p + 0.360, ticks);
  assert(first === ticks[COUNT_IN] && second === null, '第二次拍击被拒绝，不串到下一拍');
}

console.log('— 场景 7：高延迟 700ms ± 25ms（超过半周期，最近拍归属翻到下一拍） —');
{
  const rnd = mulberry32(30007);
  const ticks = makeSession();
  let aliased = 0;
  for (let i = COUNT_IN; i < COUNT_IN + BEATS; i++) {
    const tapSec = ticks[i].p + 0.700 + (rnd() * 2 - 1) * 0.025;
    if (attributeTap(tapSec, ticks) !== ticks[i]) aliased++;
  }
  assert(aliased === BEATS, '归属确实翻到下一拍（原始偏移 ≈ −400ms）');
  const r = evaluateSession(ticks);
  assert(Math.abs(r.resultMs - 700) <= 20, `周期展开恢复真实延迟：${r.resultMs}ms ∈ 700±20，绝不为负`);
  assert(r.reliable, `MAD ${r.madMs}ms 稳定，不误报`);
}

console.log('— 场景 8：小延迟 20ms ± 40ms（样本跨零边界） —');
{
  const rnd = mulberry32(30008);
  const ticks = makeSession();
  for (let i = COUNT_IN; i < COUNT_IN + BEATS; i++) {
    attributeTap(ticks[i].p + 0.020 + (rnd() * 2 - 1) * 0.040, ticks);
  }
  const r = evaluateSession(ticks);
  assert(r.resultMs >= 0 && r.resultMs <= 100, `小延迟不爆表：${r.resultMs}ms ∈ [0,100]`);
}

console.log('— 场景 9：贴近周期上界 1000ms（跨零修正钳到 0） —');
{
  const rnd = mulberry32(30009);
  const ticks = makeSession();
  for (let i = COUNT_IN; i < COUNT_IN + BEATS; i++) {
    attributeTap(ticks[i].p + 1.000 + (rnd() * 2 - 1) * 0.020, ticks);
  }
  const r = evaluateSession(ticks);
  assert(r.resultMs === 0, `跨零修正：${r.resultMs}ms（≥1050ms 不可用延迟按 0 报告，绝不输出负数）`);
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
