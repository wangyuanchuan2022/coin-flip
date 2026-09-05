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

  function doThrow(power, viaDesk) {
    if (physics.state === 'flying') return; // 飞行中不可重复抛
    sound.ensure(); // 用户手势内解锁 AudioContext
    sound.toss();
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

  physics.onImpact = (intensity) => sound.clink(intensity);
  physics.onSettle = (face) => {
    const pos = physics.coinBody.position;
    achievements.onSettle(face);
    scene.setRestLook(pos);
    scene.showRingAt(pos);
    if (!prefersReducedMotion) scene.burst(pos);
    sound.reveal(face);
    ui.record(face);
    ui.showResult(face);
    ui.enterIdle();
  };

  physics.onDrop = () => {
    achievements.onDrop();
    ui.enterIdle('硬币滚出台面边缘，已自动重置（不计入统计）');
  };

  // 直接点击台面也可抛掷（overlay 为 pointer-events: none，不遮挡）
  container.addEventListener('click', (e) => {
    if (e.target === scene.renderer.domElement) doThrow(ui.power, true);
  });

  // 主循环
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    physics.update(dt);
    scene.followCoin(physics.coinBody, physics.state, dt);
    scene.syncCoin(physics.coinBody);
    scene.update(dt);
    scene.render();
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
