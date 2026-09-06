// main.js — 装配入口：物理世界 + 渲染场景 + UI + 音效 + 主循环
import * as THREE from 'three';
import { CoinPhysics } from './physics.js';
import { CoinScene } from './scene.js';
import { CoinUI } from './ui.js';
import { SoundKit } from './audio.js';
import { createCoinVisual } from './coin-model.js';
import { AchievementManager } from './achievements.js';
import { openCalibration } from './calibrate.js';
import { openShare, resolveGameUrl } from './share.js';

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
  // 手动补偿量（毫秒）：URL ?avdelay= 优先，其次 localStorage 持久值（HUD 中 [ ] 调整、S 保存）
  const storedDelayMs = Number(localStorage.getItem('coin-flip-avdelay-ms'));
  let manualDelayMs = avDelayParam !== null
    ? Math.max(0, Number(avDelayParam) || 0)
    : (isFinite(storedDelayMs) && storedDelayMs >= 0 ? storedDelayMs : null);
  let vsyncEst = 1 / 60;         // 垂直同步周期估计（rAF 间隔 EMA）
  let lastFrameAt = performance.now();
  let pendingSettle = null;      // { face, pos, at } —— 等画面「演到」结算时刻再触发可见/可听反馈
  let pendingDrop = null;
  let settleHoldUntil = 0;       // 结算展示定格截止时刻：期间相机保持不动，正面/背面看满 3 秒
  let coinReturnAt = 0;          // 硬币回中时刻：结算可见 1 秒后送回台面中心初始位
  let lastFace = null;           // 最近一次结果（分享卡片展示用）

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
    // 校准键：[ / ] = 补偿量 ±25ms，S = 保存为默认（localStorage 持久），X = 清除恢复自动
    window.addEventListener('keydown', (e) => {
      if (e.key === '[' || e.key === ']') {
        const cur = manualDelayMs !== null ? manualDelayMs : Math.round(scene.renderDelay * 1000);
        manualDelayMs = Math.max(0, Math.min(800, cur + (e.key === ']' ? 25 : -25)));
      } else if (e.key === 's' || e.key === 'S') {
        if (manualDelayMs !== null) localStorage.setItem('coin-flip-avdelay-ms', String(Math.round(manualDelayMs)));
      } else if (e.key === 'x' || e.key === 'X') {
        localStorage.removeItem('coin-flip-avdelay-ms');
      }
    });
  }
  let fpsEst = 60;

  function computeRenderDelay() {
    if (manualDelayMs !== null) {
      scene.renderDelay = manualDelayMs / 1000;
      return;
    }
    const rawDt = (performance.now() - lastFrameAt) / 1000;
    if (rawDt > 0.001 && rawDt < 0.25) vsyncEst += (rawDt - vsyncEst) * 0.05;
    // 目标延迟 = 输出延迟 − 半个垂直同步（画面还有合成上屏延迟，取半帧折中）。
    // 上限 0.5s：蓝牙/系统音频增强等设备的真实延迟可达 200-400ms，旧上限 150ms 数学上就追不上
    const target = sound.enabled
      ? Math.min(0.5, Math.max(0, sound.audioLatency - 0.5 * vsyncEst))
      : 0;
    scene.renderDelay += (target - scene.renderDelay) * 0.1; // 平滑防跳变
  }

  function doThrow(power, viaDesk) {
    if (physics.state === 'flying') return; // 飞行中不可重复抛
    if (pendingSettle) fireSettle(); // 上一投的展示还没播出就重抛：立即补齐（防结果丢失）
    if (pendingDrop) fireDrop();
    settleHoldUntil = 0; // 再投即结束定格：相机直接从当前位姿切入追踪，避免回位途中转向的闪回
    coinReturnAt = 0;
    sound.ensure(); // 用户手势内解锁 AudioContext
    sound.toss(); // 起抛动画是即时跟手的，音效立即响（不再等 renderDelay——那是起抛动画之前的旧对齐策略）
    achievements.onThrow({ power, silent: !sound.enabled, viaDesk: !!viaDesk });
    scene.hideRing();
    ui.enterFlying();
    physics.throwCoin(power);
    // 起抛动画：throwCoin 之后立即采集初始条件，把本次真实抛物线提前渲染（跟手；纯视觉）
    const lb = physics.coinBody;
    scene.playLaunch({
      p: [lb.position.x, lb.position.y, lb.position.z],
      v: [lb.velocity.x, lb.velocity.y, lb.velocity.z],
      g: [physics.world.gravity.x, physics.world.gravity.y, physics.world.gravity.z],
      q: [lb.quaternion.x, lb.quaternion.y, lb.quaternion.z, lb.quaternion.w],
      w: [lb.angularVelocity.x, lb.angularVelocity.y, lb.angularVelocity.z],
    });
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
  physics.onSettle = (face, standing) => {
    pendingSettle = { face, pos: physics.coinBody.position.clone(), at: scene.simClock, standing: !!standing };
  };

  physics.onDrop = () => {
    pendingDrop = { at: scene.simClock };
  };

  function fireSettle() {
    const { face, pos, standing } = pendingSettle;
    pendingSettle = null;
    lastFace = face;
    achievements.onSettle(face, standing);
    scene.setRestLook(pos);
    scene.showRingAt(pos);
    if (!prefersReducedMotion) scene.burst(pos, standing); // 立住时切换为冲天金柱特效
    sound.reveal(face);
    ui.record(face, standing); // standing 必须传入：立住是第三种结果，单独计数（此前漏传导致立住被计入正/反面）
    ui.showResult(face, standing);
    ui.enterIdle();
    settleHoldUntil = performance.now() + 3000; // 定格 3 秒展示正面/背面，之后相机才回初始位
    coinReturnAt = performance.now() + Math.max(200, 3000 - scene.renderDelay * 1000); // 结算可见 3s 时硬币回中，与撤圈/撤提示/相机回位同步
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

  // 音画延迟校准向导：自动测出本机音频输出链路的真实延迟并持久化
  // （浏览器 outputLatency 报告值可能远小于真实值，蓝牙/系统音频增强下可达 200-400ms）
  const calBtn = document.getElementById('cal-btn');
  if (calBtn) calBtn.addEventListener('click', () => {
    sound.ensure();
    openCalibration({
      sound,
      onApply: (ms) => {
        manualDelayMs = ms;
        localStorage.setItem('coin-flip-avdelay-ms', String(ms));
      },
    });
  });

  // 分享面板：屏幕二维码 + 结果/成就/统计卡片图（背景为真实渲染场景帧）
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) shareBtn.addEventListener('click', () => {
    openShare({
      url: resolveGameUrl(window.location),
      face: lastFace,
      counters: achievements.counters,
      unlocked: achievements.state.unlocked,
      capture: () => scene.captureFrame(),
    });
  });

  // 分享面板预览（?sharepreview，自动化视觉验收用）
  if (new URLSearchParams(window.location.search).has('sharepreview')) {
    setTimeout(() => shareBtn && shareBtn.click(), 3000);
  }

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
    // 相机跟随「画面状态」而非物理状态：结算/滚出的可见反馈要等画面演到那一刻
    // （renderDelay 补偿期间画面还在过去）。若相机按物理状态提前回位，画面里的
    // 硬币还在空中，结算瞬间就会出现「先撤走再拉回」的镜头抽搐。
    // 结算后 3 秒定格展示（held），期间回初始位或再投都不会发生镜头闪回。
    const visualState = (pendingSettle || pendingDrop) ? 'flying'
      : (performance.now() < settleHoldUntil ? 'held' : physics.state);
    scene.followCoin(visualState, dt);
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
        'renderDelay: ' + (scene.renderDelay * 1000).toFixed(1) + 'ms\n' +
        'avdelay: ' + (manualDelayMs === null ? 'auto' : Math.round(manualDelayMs) + 'ms') + '  [ ]=±25ms S=保存 X=清除\n' +
        'fps: ' + fpsEst.toFixed(0) + '\n' +
        '红框闪烁 = 碰撞声此刻被调度';
    }

    if (pendingSettle && scene.simClock - pendingSettle.at >= scene.renderDelay) fireSettle();
    if (pendingDrop && scene.simClock - pendingDrop.at >= scene.renderDelay) fireDrop();
    // 硬币回中：结算可见 3 秒时与撤黄圈/撤结果提示/相机回位同步执行
    if (coinReturnAt && performance.now() >= coinReturnAt && physics.state === 'settled') {
      physics.returnToCenter();
      scene.pushCoinSample({ interpolatedPosition: physics.coinBody.position, interpolatedQuaternion: physics.coinBody.quaternion });
      scene.hideRing(); // 同步撤掉落点黄圈
      ui.hideResult(); // 同步撤掉正面/反面提示
      scene.setRestLook(physics.coinBody.position); // 相机回位注视点同步改为中心的新硬币位置
      coinReturnAt = 0;
    }

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
