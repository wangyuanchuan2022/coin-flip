// main.js — 装配入口：物理世界 + 渲染场景 + UI + 音效 + 主循环
import * as THREE from 'three';
import { CoinPhysics } from './physics.js';
import { CoinScene } from './scene.js';
import { CoinUI } from './ui.js';
import { SoundKit } from './audio.js';
import { createCoinVisual } from './coin-model.js';
import { AchievementManager } from './achievements.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function boot() {
  const container = document.getElementById('scene-container');
  const physics = new CoinPhysics();
  const scene = new CoinScene(container);
  const sound = new SoundKit();
  const achievements = new AchievementManager();
  sound.preloadHit(); // 页面加载即预解码碰撞采样（不必等第一次碰撞）

  // —— 音画同步补偿 ——
  // 声音按「现在」调度，最早也要 outputLatency 后才从扬声器出声（Windows 常见 20-60ms，
  // 蓝牙 150ms+）；而碰撞画面只延迟约 1 个垂直同步就上屏。把画面渲染「过去 renderDelay 秒」
  // 的状态（scene.applyCoinAt），声音与画面即对齐。?avdelay=毫秒 可强制覆盖（0 = 关闭补偿）。
  const avDelayParam = new URLSearchParams(window.location.search).get('avdelay');
  const avDelayOverride = avDelayParam === null ? null : Math.max(0, Number(avDelayParam) || 0) / 1000;
  let vsyncEst = 1 / 60;         // 垂直同步周期估计（rAF 间隔 EMA）
  let lastFrameAt = performance.now();
  let pendingSettle = null;      // { face, pos, at } —— 等画面「演到」结算时刻再触发可见/可听反馈
  let pendingDrop = null;

  // 音画诊断 HUD（?avdebug=1）：实时暴露音画链路数字。
  // 红框闪烁 = 碰撞声「此刻」被调度的墙钟时刻，用于与可见弹跳/可听咚声三方比对：
  // 闪烁与弹跳同时但咚声晚 → 音频输出链路（设备/驱动/蓝牙/增强）延迟；
  // 咚声与闪烁同时但画面晚 → 补偿过度（outputLatency 报告值高估）；
  // 闪烁比弹跳晚 → 代码事件侧问题（结构上不应出现）。
  const avDebug = new URLSearchParams(window.location.search).get('avdebug') === '1';
  const hud = avDebug ? document.createElement('div') : null;
  if (hud) {
    hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;background:rgba(0,0,0,.72);color:#7dff9b;font:12px/1.5 Consolas,monospace;padding:8px 10px;border-radius:8px;pointer-events:none;white-space:pre;transition:box-shadow .12s;';
    document.body.appendChild(hud);
  }
  let fpsEst = 60;

  function computeRenderDelay() {
    if (avDelayOverride !== null) {
      scene.renderDelay = avDelayOverride;
      return;
    }
    const rawDt = (performance.now() - lastFrameAt) / 1000;
    if (rawDt > 0.001 && rawDt < 0.25) vsyncEst += (rawDt - vsyncEst) * 0.05;
    // 目标延迟 = 输出延迟 − 半个垂直同步（画面还有合成上屏延迟，取半帧折中）
    const target = sound.enabled
      ? Math.min(0.15, Math.max(0, sound.audioLatency - 0.5 * vsyncEst))
      : 0;
    scene.renderDelay += (target - scene.renderDelay) * 0.1; // 平滑防跳变
  }

  function doThrow(power, viaDesk) {
    if (physics.state === 'flying') return; // 飞行中不可重复抛
    if (pendingSettle) fireSettle(); // 上一投的展示还没播出就重抛：立即补齐（防结果丢失）
    if (pendingDrop) fireDrop();
    sound.ensure(); // 用户手势内解锁 AudioContext
    sound.toss(scene.renderDelay); // 抛起音与延迟渲染的画面同步响起
    achievements.onThrow({ power, silent: !sound.enabled, viaDesk: !!viaDesk });
    scene.hideRing();
    ui.enterFlying();
    physics.throwCoin(power);
  }

  const ui = new CoinUI({
    onThrow: (power) => doThrow(power),
    onToggleSound: (enabled) => sound.setEnabled(enabled),
  });

  // GLB 硬币视觉模型（异步加载挂载；视觉尺寸已对齐物理圆柱）
  createCoinVisual()
    .then((group) => scene.setCoinVisual(group))
    .catch((e) => console.error('coin model load failed:', e));

  // 成就系统接线
  ui.setAchievements(achievements);
  achievements.onUnlock = (a) => {
    sound.unlock();
    ui.showUnlockToast(a);
    ui.updateAchvEntry();
  };

  physics.onImpact = (intensity) => {
    if (hud) { // 红框闪烁标记「此刻调度了碰撞声」（见上方 HUD 三方比对说明）
      hud.style.boxShadow = '0 0 0 3px #ff4d4d';
      setTimeout(() => { hud.style.boxShadow = 'none'; }, 90);
    }
    sound.clink(intensity);
  };

  // 结算/掉落只推进状态并记账，可见与可听的反馈统一延迟到「画面演到该时刻」再触发
  // （碰撞声已由渲染延迟对齐，结算光环/揭晓音/结果面板若立即触发会提前于画面）
  physics.onSettle = (face) => {
    pendingSettle = { face, pos: physics.coinBody.position.clone(), at: scene.simClock };
  };

  physics.onDrop = () => {
    pendingDrop = { at: scene.simClock };
  };

  function fireSettle() {
    const { face, pos } = pendingSettle;
    pendingSettle = null;
    achievements.onSettle(face);
    scene.setRestLook(pos);
    scene.showRingAt(pos);
    if (!prefersReducedMotion) scene.burst(pos);
    sound.reveal(face);
    ui.record(face);
    ui.showResult(face);
    ui.enterIdle();
  }

  function fireDrop() {
    pendingDrop = null;
    achievements.onDrop();
    ui.enterIdle('硬币滚出台面边缘，已自动重置（不计入统计）');
  }

  // 直接点击台面也可抛掷（overlay 为 pointer-events: none，不遮挡）
  container.addEventListener('click', (e) => {
    if (e.target === scene.renderer.domElement) doThrow(ui.power, true);
  });

  // 主循环：物理推进 → 记录变换样本 → 按「模拟时钟 − 渲染延迟」上屏 →
  // 相机跟随延迟后的位置 → 待播的结算/掉落反馈到点触发
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    physics.update(dt);
    scene.simClock += dt;
    scene.pushCoinSample(physics.coinBody);
    computeRenderDelay();

    scene.applyCoinAt(scene.simClock - scene.renderDelay);
    scene.followCoin(physics.state, dt);
    scene.update(dt);
    scene.render();

    if (hud) {
      fpsEst += (1 / Math.max(1e-3, dt) - fpsEst) * 0.05;
      const lat = sound.ctx ? sound.ctx.outputLatency : null;
      const base = sound.ctx ? sound.ctx.baseLatency : null;
      hud.textContent =
        'ctx: ' + (sound.ctx ? sound.ctx.state : '-') + '\n' +
        'outputLatency: ' + (lat == null ? 'n/a' : (lat * 1000).toFixed(1) + 'ms') + '\n' +
        'baseLatency: ' + (base == null ? 'n/a' : (base * 1000).toFixed(1) + 'ms') + '\n' +
        'renderDelay: ' + (scene.renderDelay * 1000).toFixed(1) + 'ms' + (scene.renderDelay >= 0.149 ? '（已达上限）' : '') + '\n' +
        'fps: ' + fpsEst.toFixed(0) + '\n' +
        '红框闪烁 = 碰撞声此刻被调度';
    }

    if (pendingSettle && scene.simClock - pendingSettle.at >= scene.renderDelay) fireSettle();
    if (pendingDrop && scene.simClock - pendingDrop.at >= scene.renderDelay) fireDrop();

    lastFrameAt = performance.now();
  }
  loop();

  ui.enterIdle();

  // 自动抛掷入口（演示 / 自动化视觉验收用）：index.html?autotoss=毫秒延迟
  const auto = new URLSearchParams(window.location.search).get('autotoss');
  if (auto !== null) {
    setTimeout(() => doThrow(ui.power), Number(auto) || 800);
  }
}

boot();
