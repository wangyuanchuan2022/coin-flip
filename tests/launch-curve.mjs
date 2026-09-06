// tests/launch-curve.mjs — 起抛曲线自证 + 场景/主循环接线契约：直跑 node tests/launch-curve.mjs
import fs from 'node:fs';
import { launchOffsetY, LAUNCH_DURATION } from '../src/launch-curve.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ok -', msg); }
  else { fail++; console.error('  FAIL -', msg); }
}

// 1) 曲线形状
assert(launchOffsetY(0) === 0, 't=0 位移为 0');
assert(launchOffsetY(LAUNCH_DURATION) === 0, '终点位移归零（与物理轨迹无缝交接）');
let peak = 0, peakT = 0, min = 0;
for (let t = 0; t <= LAUNCH_DURATION; t += 0.0005) {
  const v = launchOffsetY(t);
  if (v > peak) { peak = v; peakT = t; }
  if (v < min) min = v;
}
assert(peak > 0.25 && peak < 0.4, `峰值合理 (${peak.toFixed(3)})`);
assert(peakT > 0.05 && peakT < 0.2, `峰值出现早（立即响应）(${(peakT * 1000).toFixed(0)}ms)`);
assert(min >= 0, '全程无负位移');
assert(Math.abs(launchOffsetY(0.8)) < 0.02, `尾段趋零无跳变 (${launchOffsetY(0.8).toFixed(4)})`);
// 起步速度（前 16ms 位移）应明显大于同时间内纯物理自由上升的一半——跟手的关键
const step = 0.016;
assert(launchOffsetY(step) > 0.02, `首 16ms 即有可见位移 (${launchOffsetY(step).toFixed(4)})`);

// 2) 接线契约：scene.js 必须消费曲线并提供 playLaunch；main.js 必须调用且相机跟画面状态
const sceneSrc = fs.readFileSync(new URL('../src/scene.js', import.meta.url), 'utf8');
assert(/playLaunch\(\)/.test(sceneSrc) && /launchOffsetY\(t\)/.test(sceneSrc), 'scene.js 提供 playLaunch 并消费曲线');
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert(/scene\.playLaunch\(\)/.test(mainSrc), 'main.js doThrow 调用起抛补间');
assert(/const visualState = \(pendingSettle \|\| pendingDrop\) \? 'flying' : physics\.state;/.test(mainSrc), 'main.js 相机改跟画面状态（结算抽搐修复）');
assert(/followCoin\(visualState, dt\)/.test(mainSrc), 'followCoin 接收 visualState');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
