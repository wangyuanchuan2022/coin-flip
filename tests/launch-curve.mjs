// tests/launch-curve.mjs — 起抛时间轴自证 + 场景/主循环接线契约：直跑 node tests/launch-curve.mjs
import fs from 'node:fs';
import { launchFlightTime, LAUNCH_LIFT, LAUNCH_TOTAL } from '../src/launch-curve.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ok -', msg); }
  else { fail++; console.error('  FAIL -', msg); }
}

// 1) 时间轴形状：抬手段结束点与延迟画面无缝
assert(launchFlightTime(LAUNCH_LIFT - 0.001, 0.4) === null, '抬手段内不产生飞行时间');
assert(Math.abs(launchFlightTime(LAUNCH_LIFT, 0.4)) < 1e-9, '飞行段起点飞行时间 = 0（与抬手段出口无缝）');
const slope = (launchFlightTime(LAUNCH_LIFT + 0.002, 0.4) - launchFlightTime(LAUNCH_LIFT, 0.4)) / 0.002;
assert(Math.abs(slope - 1) < 0.05, `飞行时间起始变化率 ≈ 1（与出口速度匹配）(${slope.toFixed(3)})`);

// 2) 多种延迟下：非负、收敛回延迟画面
for (const d of [0, 0.1, 0.4, 0.8]) {
  let ok = true, conv = false;
  for (let t = LAUNCH_LIFT; t <= 3; t += 0.002) {
    const ft = launchFlightTime(t, d);
    if (ft === null || ft < 0 || ft > t + LAUNCH_LIFT) { ok = false; break; }
  }
  const end = launchFlightTime(3, d);
  conv = Math.abs(end - (3 - d)) < 0.005;
  assert(ok, `d=${d}: 飞行时间全程有效`);
  assert(conv, `d=${d}: 渐近收敛到延迟画面 (ft(3s)−(3−d)=${(end - (3 - d)).toFixed(5)})`);
}
// 提前渲染生效：延迟画面尚在静止（t<d）时，补间硬币已经升空
const early = launchFlightTime(LAUNCH_LIFT + 0.05, 0.4);
assert(early > 0 && LAUNCH_LIFT + 0.05 < 0.4, `延迟画面未开始时硬币已升空 (ft=${early.toFixed(3)})`);

// 3) 接线契约
const sceneSrc = fs.readFileSync(new URL('../src/scene.js', import.meta.url), 'utf8');
assert(/playLaunch\(ic\)/.test(sceneSrc) && /launchFlightTime\(/.test(sceneSrc), 'scene.js 提供 playLaunch(ic) 并消费时间轴');
assert(/setFromAxisAngle/.test(sceneSrc), 'scene.js 抛物线段带真实自旋');
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert(/scene\.playLaunch\(\{/.test(mainSrc), 'main.js 传入本次抛掷初始条件');
assert(/physics\.world\.gravity/.test(mainSrc), 'main.js 使用真实重力向量');
assert(/physics\.throwCoin\(power\);\s*\n\s*\/\/ 起抛动画/.test(mainSrc), '初始条件在 throwCoin 之后采集');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
