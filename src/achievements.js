// achievements.js — 成就系统：15 枚成就（里程碑/连击/阵营/彩蛋），计数、评估、持久化
// 设计惯例参考：Cookie Clicker（统计里程碑+shadow 隐藏成就）、Steamworks 成就指南
const STORE_KEY = 'coin-flip-achievements-v1';

// check(counters) 是否达成；progress(counters) 返回 [当前, 目标] 供面板进度条
export const ACHIEVEMENTS = [
  // —— 里程碑 ——
  { id: 'first-throw', glyph: '1', name: '命运之始', desc: '完成首次抛掷', check: (c) => c.total >= 1, progress: (c) => [Math.min(c.total, 1), 1] },
  { id: 'throws-10', glyph: '10', name: '小试手气', desc: '累计抛掷 10 次', check: (c) => c.total >= 10, progress: (c) => [Math.min(c.total, 10), 10] },
  { id: 'throws-50', glyph: '50', name: '渐入佳境', desc: '累计抛掷 50 次', check: (c) => c.total >= 50, progress: (c) => [Math.min(c.total, 50), 50] },
  { id: 'throws-100', glyph: '100', name: '百掷百看', desc: '累计抛掷 100 次', check: (c) => c.total >= 100, progress: (c) => [Math.min(c.total, 100), 100] },
  { id: 'throws-500', glyph: '500', name: '五百轮回', desc: '累计抛掷 500 次', check: (c) => c.total >= 500, progress: (c) => [Math.min(c.total, 500), 500] },
  // —— 连击 ——
  { id: 'streak-3-heads', glyph: '阳', name: '三阳开泰', desc: '连续 3 次正面', check: (c) => c.streakLast === 'heads' && c.streakFace >= 3, progress: (c) => [c.streakLast === 'heads' ? Math.min(c.streakFace, 3) : 0, 3] },
  { id: 'streak-5-any', glyph: '连', name: '五福同临', desc: '连续 5 次同一面', check: (c) => c.streakFace >= 5, progress: (c) => [Math.min(c.streakFace, 5), 5] },
  // —— 阵营 ——
  { id: 'heads-50', glyph: '正', name: '鹰派信徒', desc: '正面累计 50 次', check: (c) => c.heads >= 50, progress: (c) => [Math.min(c.heads, 50), 50] },
  { id: 'tails-50', glyph: '反', name: '尾部拥趸', desc: '反面累计 50 次', check: (c) => c.tails >= 50, progress: (c) => [Math.min(c.tails, 50), 50] },
  // —— 彩蛋（隐藏） ——
  { id: 'drop', glyph: '坠', name: '桌面之外', desc: '硬币滚出台面掉落', hidden: true, check: (c) => c.drop >= 1, progress: (c) => [Math.min(c.drop, 1), 1] },
  { id: 'heavy-30', glyph: '力', name: '大力出奇迹', desc: '使用大力档抛掷 30 次', hidden: true, check: (c) => c.heavy >= 30, progress: (c) => [Math.min(c.heavy, 30), 30] },
  { id: 'silent-10', glyph: '默', name: '无声的命运', desc: '静音状态下抛掷 10 次', hidden: true, check: (c) => c.silent >= 10, progress: (c) => [Math.min(c.silent, 10), 10] },
  { id: 'balance', glyph: '衡', name: '完美均衡', desc: '累计 100 次时正反恰好各 50', hidden: true, check: (c) => c.total === 100 && c.heads === 50 && c.tails === 50, progress: (c) => [Math.min(c.total, 100), 100] },
  { id: 'midnight', glyph: '夜', name: '午夜抉择', desc: '在午夜 0 点至 1 点间抛掷', hidden: true, check: (c) => c.midnight >= 1, progress: (c) => [Math.min(c.midnight, 1), 1] },
  { id: 'desk-20', glyph: '指', name: '指尖命运', desc: '直接点击台面抛掷 20 次', hidden: true, check: (c) => c.desk >= 20, progress: (c) => [Math.min(c.desk, 20), 20] },
  { id: 'edge-stand', glyph: '立', name: '一线之间', desc: '硬币以立姿停稳在桌面上（极稀有）', hidden: true, check: (c) => c.edgeStand >= 1, progress: (c) => [Math.min(c.edgeStand, 1), 1] },
];

const EMPTY_COUNTERS = {
  total: 0, heads: 0, tails: 0, drop: 0, heavy: 0,
  silent: 0, desk: 0, midnight: 0, streakFace: 0, streakLast: '',
  edgeStand: 0,
};

export class AchievementManager {
  constructor({ hourFn } = {}) {
    // 时钟注入点：午夜成就的时间判定可被测试替换（默认真实本地时间）
    this._hourFn = hourFn || (() => new Date().getHours());
    this.state = this._load();
    this.onUnlock = null; // (achievement) => void
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.unlocked && s.counters) {
          return { unlocked: s.unlocked, counters: Object.assign({}, EMPTY_COUNTERS, s.counters) };
        }
      }
    } catch {
      /* 损坏的存档按全新处理 */
    }
    return { unlocked: {}, counters: Object.assign({}, EMPTY_COUNTERS) };
  }

  _save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
    } catch {
      /* 隐私模式下静默失败 */
    }
  }

  get counters() {
    return this.state.counters;
  }

  get total() {
    return ACHIEVEMENTS.length;
  }

  get unlockedCount() {
    return Object.keys(this.state.unlocked).length;
  }

  isUnlocked(id) {
    return !!this.state.unlocked[id];
  }

  // 面板进度条数据：[当前, 目标]
  progress(a) {
    return a.progress(this.state.counters);
  }

  // 抛掷动作上下文计数（力度/静音/午夜/台面点击）
  onThrow({ power, silent, viaDesk }) {
    const c = this.state.counters;
    if (power === 2) c.heavy += 1;
    if (silent) c.silent += 1;
    if (this._hourFn() === 0) c.midnight += 1;
    if (viaDesk) c.desk += 1;
    this.evaluate();
    this._save();
  }

  // 结算：累计 + 连击更新 + 评估（standing = 立姿停稳的极稀有结算）
  onSettle(face, standing = false) {
    const c = this.state.counters;
    c.total += 1;
    if (face === 'heads') c.heads += 1;
    else c.tails += 1;
    if (standing) c.edgeStand += 1;
    c.streakFace = face === c.streakLast ? c.streakFace + 1 : 1;
    c.streakLast = face;
    this.evaluate();
    this._save();
  }

  onDrop() {
    this.state.counters.drop += 1;
    this.evaluate();
    this._save();
  }

  evaluate() {
    for (const a of ACHIEVEMENTS) {
      if (this.isUnlocked(a.id)) continue;
      if (a.check(this.state.counters)) {
        this.state.unlocked[a.id] = Date.now();
        this._save();
        if (this.onUnlock) this.onUnlock(a);
      }
    }
  }
}
