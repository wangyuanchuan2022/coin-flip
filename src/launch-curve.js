// launch-curve.js — 起抛动画的位移曲线（纯函数，node 可测）
// 指数脉冲：t=0 处导数最大 → 按下硬币立即弹起（跟手）；
// 峰值后平滑衰减，终点值与斜率都趋零 → 与延迟渲染的物理轨迹无缝交接，不产生跳变。
export const LAUNCH_DURATION = 0.9; // 秒；此后补间归零自动结束
export function launchOffsetY(t) {
  if (t <= 0 || t >= LAUNCH_DURATION) return 0;
  return 1.3 * (Math.exp(-6 * t) - Math.exp(-12 * t)); // 峰值 ≈0.325 @ ≈0.116s
}
