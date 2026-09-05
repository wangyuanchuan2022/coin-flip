// tests/standing.mjs — 立住彩蛋的物理结算自证（node 直跑：node tests/standing.mjs）
// 构造「硬币立在桌沿上」的初始状态，验证：不再被击倒，停满 0.45s 后以
// standing=true 结算；同时回归验证正常平躺结算不受影响。
import { CoinPhysics, COIN } from '../src/physics.js';

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

console.log('— 场景 1：立姿停稳 → standing=true 结算 —');
{
  const p = new CoinPhysics();
  let result = null;
  p.onSettle = (face, standing) => { result = { face, standing }; };
  p.state = 'flying';
  p.airTime = 0;
  p.stillTimer = 0;
  // 直接摆放立姿：绕 X 轴 90°（局部 +Y 指向世界水平 → dot≈0），中心高度 = 半径
  p.coinBody.wakeUp();
  p.coinBody.position.set(0, COIN.radius + 0.001, 0);
  p.coinBody.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  p.coinBody.velocity.setZero();
  p.coinBody.angularVelocity.setZero();
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 5 && !result; i++) p.update(dt);
  assert(result, '5s 模拟内完成结算（旧逻辑会无限击倒永不结算）');
  assert(result.standing === true, '立姿以 standing=true 结算');
  assert(['heads', 'tails'].includes(result.face), '仍给出朝向面（统计用）: ' + result.face);
}

console.log('— 场景 2：平躺 → 正常结算（回归保护） —');
{
  const p = new CoinPhysics();
  let result = null;
  p.onSettle = (face, standing) => { result = { face, standing }; };
  p.state = 'flying';
  p.airTime = 0;
  p.stillTimer = 0;
  p.coinBody.wakeUp();
  p.coinBody.position.set(0, COIN.thickness / 2 + 0.001, 0);
  p.coinBody.quaternion.set(0, 0, 0, 1);
  p.coinBody.velocity.setZero();
  p.coinBody.angularVelocity.setZero();
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 5 && !result; i++) p.update(dt);
  assert(result, '平躺 5s 模拟内完成结算');
  assert(result.standing === false, '平躺结算 standing=false');
  assert(['heads', 'tails'].includes(result.face), '平躺结算给出正/反面: ' + result.face);
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
