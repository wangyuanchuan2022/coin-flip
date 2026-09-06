// tests/fairness.mjs — 公平性抽查：批量同步快进抛掷，统计正/反分布与 z-score
// 用法：node tests/fairness.mjs [次数]（默认 200，三档力度轮换）
// 滚出台面掉落属合法结果（不计入正/反），单列 dropped 统计
// 立住（edge standing）是第三种结局：单列 standing 统计，不进正/反分母（与产品统计口径一致）
import { CoinPhysics } from '../src/physics.js';

const N = Number(process.argv[2]) || 200;
const STEP = 1 / 120;
const GUARD = Math.round(20 / STEP); // 单次抛掷模拟时间上限 20s

const results = { heads: 0, tails: 0, dropped: 0, standing: 0 };
const byPower = [
  { heads: 0, tails: 0, standing: 0 },
  { heads: 0, tails: 0, standing: 0 },
  { heads: 0, tails: 0, standing: 0 },
];

const coin = new CoinPhysics();
let face = null;
let stood = false;
coin.onSettle = (f, standing) => {
  face = f;
  stood = !!standing;
};

for (let i = 0; i < N; i++) {
  const power = i % 3;
  face = null;
  stood = false;
  coin.throwCoin(power);
  let guard = 0;
  while (coin.state === 'flying' && guard < GUARD) {
    coin.update(STEP);
    guard++;
  }
  if (coin.state === 'idle') {
    results.dropped++; // 滚出台面掉落：特色结果，不计正/反
    continue;
  }
  if (!face) {
    console.log(`trial ${i + 1}: UNSETTLED (power=${power})`);
    continue;
  }
  if (stood) {
    results.standing++; // 立住了：极稀有结局，单列统计
    byPower[power].standing++;
    continue;
  }
  results[face]++;
  byPower[power][face]++;
}

const total = results.heads + results.tails;
if (total === 0) {
  console.log('no settled trials — aborting');
  process.exit(1);
}
const exp = total / 2;
const sd = Math.sqrt(total * 0.25);
const z = (results.heads - exp) / sd;
const lo = ((exp - 1.96 * sd) / total * 100).toFixed(1);
const hi = ((exp + 1.96 * sd) / total * 100).toFixed(1);

console.log('--- fairness report ---');
console.log(`trials=${N} faces=${total} standing=${results.standing} dropped=${results.dropped}`);
console.log(`heads=${results.heads} tails=${results.tails}  standing rate=${((results.standing / N) * 100).toFixed(2)}% (of all trials, rare event)`);
console.log(`heads ratio=${((results.heads / total) * 100).toFixed(1)}%  (95% fair band: ${lo}%~${hi}%)`);
console.log(`z-score=${z.toFixed(2)}  (|z| < 2 means no significant bias)`);
byPower.forEach((s, i) => {
  console.log(`power ${['light', 'normal', 'heavy'][i]}: heads=${s.heads} tails=${s.tails} standing=${s.standing}`);
});
