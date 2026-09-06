// tests/launch-curve.mjs — 起抛时间轴自证 + 场景/主循环接线契约：直跑 node tests/launch-curve.mjs
import fs from 'node:fs';
import { launchFlightTime, launchTau, LAUNCH_LIFT } from '../src/launch-curve.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ok -', msg); }
  else { fail++; console.error('  FAIL -', msg); }
}

// 1) 时间轴形状：抬手段出口与真实飞行轨迹无缝
assert(launchFlightTime(LAUNCH_LIFT - 0.001, 0.4) === null, '抬手段内不产生飞行时间');
assert(Math.abs(launchFlightTime(LAUNCH_LIFT, 0.4) - LAUNCH_LIFT) < 1e-9, `飞行段起点 = 抬手段覆盖的飞行时间 (${LAUNCH_LIFT}s，衔接无缝)`);
const slope = (launchFlightTime(LAUNCH_LIFT + 0.002, 0.4) - launchFlightTime(LAUNCH_LIFT, 0.4)) / 0.002;
assert(Math.abs(slope - 1) < 0.05, `飞行时间起始变化率 ≈ 1（与抬手段出口速度/自旋匹配）(${slope.toFixed(3)})`);

// 2) 多种延迟下：变化率谷底落在顶点（卡顿不可见）、无冻结、有效、收敛
for (const [d, fa] of [[0, 0.45], [0.1, 0.45], [0.4, 0.5], [0.8, 0.45]]) {
  const tau = launchTau(d, fa);
  let minSlope = 1, tMin = LAUNCH_LIFT, ok = true;
  for (let t = LAUNCH_LIFT; t <= LAUNCH_LIFT + 3 * tau; t += 0.002) {
    const s = (launchFlightTime(t + 0.002, d, tau) - launchFlightTime(t, d, tau)) / 0.002;
    if (s < minSlope) { minSlope = s; tMin = t; }
    const ft = launchFlightTime(t, d, tau);
    if (ft === null || ft < LAUNCH_LIFT - 0.02 || ft > t) ok = false;
  }
  assert(minSlope > 0.15, `d=${d}: 变化率谷底 ${minSlope.toFixed(2)}（无冻结/无倒退）`);
  assert(ok, `d=${d}: 飞行时间全程有效且不超出真实历史（ft ≤ t）`);
  if (d > 0.05) {
    const ftAtDip = launchFlightTime(tMin, d, tau);
    assert(Math.abs(ftAtDip - fa) < 0.15, `d=${d}: 减速谷底落在补间顶点 (ft=${ftAtDip.toFixed(2)} vs apex=${fa})`);
  } else {
    assert(minSlope > 0.9, 'd=0: 无包络，时间轴恒速');
  }
  const te = LAUNCH_LIFT + 2.8 * tau;
  const end = launchFlightTime(te, d, tau);
  assert(Math.abs(end - (te - d)) < 0.001, `d=${d}: 渐近收敛到延迟画面 (残差 ${(Math.abs(end - (te - d)) * 1000).toFixed(2)}ms)`);
}
// 提前渲染生效：延迟画面尚在静止（t<d）时，补间硬币已经升空
const early = launchFlightTime(LAUNCH_LIFT + 0.05, 0.4);
assert(early > 0 && LAUNCH_LIFT + 0.05 < 0.4, `延迟画面未开始时硬币已升空 (ft=${early.toFixed(3)})`);

// 3) 接线契约
const sceneSrc = fs.readFileSync(new URL('../src/scene.js', import.meta.url), 'utf8');
assert(/playLaunch\(ic\)/.test(sceneSrc), 'scene.js 提供 playLaunch(ic)');
assert(/launchFlightTime\(t, L\.delay, L\.tau\)/.test(sceneSrc), 'scene.js 飞行段消费时间轴（按本次延迟/顶点定参）');
assert(/_coinStateAt\(L\.s0 \+ ft\)/.test(sceneSrc), '飞行段从真实变换历史取样（含真实碰撞/阻尼/自旋）');
assert(/wMag \* t \+ 2 \* Math\.PI \* \(1 - k\)/.test(sceneSrc), '抬手段全程积累世界系真实自旋 + 渐衰翻面');
assert(/_lq2\.multiply\(_lq1\)/.test(sceneSrc), '自旋为世界系左乘（与 cannon 积分一致）');
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert(/scene\.playLaunch\(\{/.test(mainSrc), 'main.js 传入本次抛掷初始条件');
assert(/physics\.world\.gravity/.test(mainSrc), 'main.js 使用真实重力向量');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
