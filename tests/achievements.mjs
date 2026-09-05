// tests/achievements.mjs — 成就系统逻辑测试：全 16 枚条件、连击/掉落边界、精确时点、存档迁移
// 运行：node tests/achievements.mjs
import { AchievementManager, ACHIEVEMENTS } from '../src/achievements.js';

let pass = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) pass += 1;
  else failures.push(msg);
}
function mockLS(store) {
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}
function freshMgr(extra = {}) {
  globalThis.localStorage = mockLS({});
  return new AchievementManager(extra);
}
function has(mgr, id) { return mgr.isUnlocked(id); }
const KEY = 'coin-flip-achievements-v1';

// —— 用例 1：里程碑阶梯（连续 100 次 heads）——
{
  const m = freshMgr();
  const unlockLog = [];
  m.onUnlock = (a) => unlockLog.push(a.id);
  for (let i = 1; i <= 100; i++) {
    m.onSettle('heads');
    if (i === 1) assert(has(m, 'first-throw'), 'first-throw unlocked at 1');
    if (i === 9) assert(!has(m, 'throws-10'), 'throws-10 NOT at 9');
    if (i === 3) assert(has(m, 'streak-3-heads'), 'streak-3-heads at 3');
    if (i === 5) assert(has(m, 'streak-5-any'), 'streak-5-any at 5');
    if (i === 10) assert(has(m, 'throws-10'), 'throws-10 at 10');
    if (i === 49) assert(!has(m, 'throws-50'), 'throws-50 NOT at 49');
    if (i === 50) {
      assert(has(m, 'throws-50'), 'throws-50 at 50');
      assert(has(m, 'heads-50'), 'heads-50 at 50 heads');
    }
    if (i === 100) {
      assert(has(m, 'throws-100'), 'throws-100 at 100');
      assert(!has(m, 'balance'), 'balance NOT for 100 all-heads');
    }
  }
  assert(
    unlockLog.length === Object.keys(m.state.unlocked).length,
    'onUnlock fired exactly once per unlock'
  );
  const bal = ACHIEVEMENTS.find((a) => a.id === 'balance');
  const [cur, goal] = m.progress(bal);
  assert(cur === 100 && goal === 100, 'balance progress reads [100,100] at total=100');
}

// —— 用例 2：连击被结算重置 ——
{
  const m = freshMgr();
  ['heads', 'heads', 'tails', 'tails', 'tails', 'tails', 'tails'].forEach((f) => m.onSettle(f));
  assert(has(m, 'streak-5-any'), 'streak-5-any after 5 tails in a row');
  assert(!has(m, 'streak-3-heads'), 'streak-3-heads reset by tails interruption');
}

// —— 用例 3：掉落不打断连击（掉落无结果语义）——
{
  const m = freshMgr();
  m.onSettle('heads');
  m.onSettle('heads');
  m.onDrop();
  m.onSettle('heads');
  assert(has(m, 'streak-3-heads'), 'drop does not break head streak');
  assert(has(m, 'drop'), 'drop achievement unlocked on first drop');
}

// —— 用例 4：阵营互斥 ——
{
  const m = freshMgr();
  for (let i = 0; i < 50; i++) m.onSettle('tails');
  assert(has(m, 'tails-50'), 'tails-50 at 50 tails');
  assert(!has(m, 'heads-50'), 'heads-50 NOT with tails only');
}

// —— 用例 5：完美均衡的恰 100 时点 ——
{
  const m = freshMgr();
  [...Array(50).fill('heads'), ...Array(50).fill('tails')].forEach((f) => m.onSettle(f));
  assert(has(m, 'balance'), 'balance unlocked at exact 50/50@100');
}
{
  const m = freshMgr();
  [...Array(49).fill('heads'), ...Array(51).fill('tails')].forEach((f) => m.onSettle(f));
  assert(!has(m, 'balance'), 'balance NOT at 49/51@100');
  m.onSettle('heads'); // 101 次 50/51
  assert(!has(m, 'balance'), 'balance stays locked past 100 (50/51)');
}

// —— 用例 6：力度/静音/台面点击/午夜（时间注入）——
{
  const m = freshMgr({ hourFn: () => 0 });
  for (let i = 1; i <= 30; i++) {
    m.onThrow({ power: 2, silent: true, viaDesk: true });
    if (i === 1) assert(has(m, 'midnight'), 'midnight at first midnight throw');
    if (i === 10) assert(has(m, 'silent-10'), 'silent-10 at 10');
    if (i === 20) assert(has(m, 'desk-20'), 'desk-20 at 20');
  }
  assert(has(m, 'heavy-30'), 'heavy-30 at 30');
}
{
  const m = freshMgr({ hourFn: () => 9 });
  m.onThrow({ power: 0, silent: false, viaDesk: false });
  assert(!has(m, 'midnight'), 'midnight NOT unlocked at 9am');
}

// —— 用例 7：旧存档迁移（缺失字段补默认、继承累计与解锁）——
{
  const store = {};
  globalThis.localStorage = mockLS(store);
  store[KEY] = JSON.stringify({
    unlocked: { 'first-throw': 123456 },
    counters: { total: 10, heads: 6, tails: 4 },
  });
  const m = new AchievementManager();
  const c = m.counters;
  assert(
    c.drop === 0 && c.heavy === 0 && c.silent === 0 && c.desk === 0 && c.midnight === 0 && c.streakFace === 0,
    'migrated counters get defaults for new fields'
  );
  assert(m.isUnlocked('first-throw'), 'inherited unlock preserved');
  m.onSettle('heads');
  assert(m.counters.total === 11, 'inherited total accumulates to 11');
  assert(m.counters.heads === 7, 'inherited heads accumulates to 7');
  // total 已过 10 但旧存档未记录该成就 → 首次结算补发（retroactive grant），属正确行为
  assert(m.unlockedCount === 2, 'migrated unlock + retroactive throws-10 (total already past threshold)');
  assert(has(m, 'throws-10'), 'throws-10 retroactively granted for migrated total');
}

// —— 用例 8：损坏存档回退 ——
{
  const store = {};
  globalThis.localStorage = mockLS(store);
  store[KEY] = '{broken json';
  const m = new AchievementManager();
  assert(m.counters.total === 0, 'broken save falls back to fresh state');
}

// —— 用例 9：evaluate 幂等（重复评估不重复触发回调）——
{
  const m = freshMgr();
  let calls = 0;
  m.onUnlock = () => calls++;
  m.onSettle('heads');
  m.evaluate();
  m.evaluate();
  assert(calls === 1, 'onUnlock fired once despite repeated evaluate');
}

// —— 用例 10：立住彩蛋（edgeStand 计数 + 隐藏成就解锁 + 存档迁移补默认）——
{
  const m = freshMgr();
  assert(!has(m, 'edge-stand'), 'edge-stand starts locked');
  m.onSettle('heads', false);
  assert(!has(m, 'edge-stand'), 'edge-stand NOT on normal settle');
  m.onSettle('tails', true);
  assert(has(m, 'edge-stand'), 'edge-stand unlocked on standing settle');
  assert(m.counters.edgeStand === 1, 'edgeStand counter incremented');
  const es = ACHIEVEMENTS.find((a) => a.id === 'edge-stand');
  assert(es.hidden === true, 'edge-stand is a hidden achievement');
  const [cur, goal] = m.progress(es);
  assert(cur === 1 && goal === 1, 'edge-stand progress [1,1] after unlock');
  // 存档迁移：旧档缺 edgeStand 字段补 0，且解锁链路可用
  const store = {};
  globalThis.localStorage = mockLS(store);
  store[KEY] = JSON.stringify({ unlocked: {}, counters: { total: 3, heads: 2, tails: 1 } });
  const m2 = new AchievementManager();
  assert(m2.counters.edgeStand === 0, 'migrated counters get edgeStand=0');
  m2.onSettle('heads', true);
  assert(has(m2, 'edge-stand'), 'edge-stand unlockable on migrated save');
}

console.log('--- achievements test report ---');
console.log(`pass=${pass} fail=${failures.length} / ${ACHIEVEMENTS.length} achievements defined`);
failures.forEach((f) => console.log('FAIL:', f));
if (failures.length) process.exit(1);
