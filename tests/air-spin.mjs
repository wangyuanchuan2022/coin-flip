// air-spin.mjs — 空中角速度检查：抛出后每 0.5s 打印角速度/速度曲线
// 预期：空中 |ω| 基本保持（仅微小空气阻尼），落地接触后才快速衰减
import { CoinPhysics } from '../src/physics.js';

const p = new CoinPhysics();
p.throwCoin(2); // 大力档
const STEP = 1 / 120;
let t = 0;
let next = 0;
while (p.state === 'flying' && t < 10) {
  p.update(STEP);
  t += STEP;
  if (t >= next) {
    const w = p.coinBody.angularVelocity.length();
    const v = p.coinBody.velocity.length();
    const y = p.coinBody.position.y;
    console.log(`t=${t.toFixed(1)}s |ω|=${w.toFixed(1).padStart(5)} rad/s |v|=${v.toFixed(1).padStart(4)} m/s y=${y.toFixed(2)}`);
    next += 0.5;
  }
}
console.log('final state:', p.state, `t=${t.toFixed(2)}s`);
