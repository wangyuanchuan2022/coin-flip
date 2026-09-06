// launch-curve.js — 起抛动画时间轴（纯函数，node 可测）
// 思路：抛出瞬间画面仍在「过去 renderDelay 秒」。补间把真实轨迹提前渲染：
//   抬手段 [0, LAUNCH_LIFT)：桌面静止位 → 真实飞行位姿（飞行时间 LAUNCH_LIFT 处），
//     全程积累世界系真实自旋，另加一圈渐衰翻面；
//   飞行段 [LAUNCH_LIFT, ∞)：场景从真实变换历史按本函数给出的「提前飞行时间」取样，
//     高斯包络使其从「提前 delay」渐近收敛回延迟画面时间轴（起始斜率恰为 1，
//     与抬手段出口速度/自旋无缝），因此不重播、不跳变、包含全部真实碰撞细节。
// 关键手感设计：收敛的减速点（飞行时间变化率的谷底）被放置在补间硬币的
// 「顶点时刻」——硬币在最高点本来就要自然悬停，时间轴的减速藏在里面不可见，
// 大延迟下也不会出现中途冻结的卡顿。
export const LAUNCH_TAU = 0.35;  // 基准收敛时间常数（秒）
export const LAUNCH_LIFT = 0.14; // 抬手段时长（秒）

// 收敛时间常数：让变化率谷底落在补间硬币的顶点时刻（fApex=顶点飞行时间，s）
export function launchTau(delay, fApex = 0.45) {
  return Math.min(2, Math.max(0.5, Math.SQRT2 * (fApex + 0.393 * delay - LAUNCH_LIFT)));
}

// 飞行段时间轴映射：t=补间墙钟时间 → 抛物线飞行时间；t < 抬手段时长时返回 null
export function launchFlightTime(t, delay, tau) {
  if (t < LAUNCH_LIFT) return null;
  const k = tau === undefined ? launchTau(delay) : tau;
  return Math.max(0, (t - delay) + delay * Math.exp(-Math.pow((t - LAUNCH_LIFT) / k, 2)));
}
