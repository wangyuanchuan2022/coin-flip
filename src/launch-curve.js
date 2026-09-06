// launch-curve.js — 起抛动画时间轴（纯函数，node 可测）
// 思路：抛出瞬间画面仍在「过去 renderDelay 秒」。补间不发明假动作，而是把本次抛掷的
// 真实抛物线「提前渲染」：
//   抬手段 [0, LAUNCH_LIFT)：硬币从桌面静止位抬到物理抛出点（Hermite 弧 + 整圈翻面，scene.js 实现）
//   飞行段 [LAUNCH_LIFT, ∞)：直接演出真实抛物线，但其飞行时间轴经高斯包络从
//   「提前 renderDelay」渐近收敛回延迟画面时间轴——起始斜率恰为 1（与抬手段出口速度
//   无缝衔接），终点与延迟画面完全重合，因此不重播、不跳变。
export const LAUNCH_TAU = 0.45;  // 收敛时间常数（秒）
export const LAUNCH_LIFT = 0.14; // 抬手段时长（秒）
export const LAUNCH_TOTAL = 1.5; // 补间总时长上限（秒），此后完全交给延迟画面

// 飞行段的时间轴映射：t=补间墙钟时间 → 抛物线飞行时间；t < 抬手段时长时返回 null
export function launchFlightTime(t, delay, tau = LAUNCH_TAU) {
  const lift = LAUNCH_LIFT;
  if (t < lift) return null;
  // (t−delay) 是延迟画面的飞行时间；高斯包络在 t=lift 处补上 (delay−lift) 的提前量，
  // 且该处包络斜率为 0 → 飞行时间起始变化率恰为 1，随包络衰减渐近收敛到延迟画面。
  return Math.max(0, (t - delay) + (delay - lift) * Math.exp(-Math.pow((t - lift) / tau, 2)));
}
