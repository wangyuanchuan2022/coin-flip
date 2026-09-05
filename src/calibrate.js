// calibrate.js — 音画延迟自动校准向导（osu! Offset Wizard 同款机制）
//
// 原理：节拍器以固定周期调度「嗒」声（WebAudio 采样级精确调度），用户跟着
// 「听到的」节拍拍击。拍击时刻与该拍调度时刻之差 = 音频输出链路真实延迟
// （人类跟拍存在约 -10~-40ms 的整体预判偏置，结果偏小时在游戏里按 ] 加一档微调）。
//
// 纯逻辑（归属 attributeTap / 结算 evaluateSession）导出供 tests/calibrate.mjs
// 在 node 里直接验证——向导 UI 与测试跑同一份代码，改逻辑必先过测试。
//
// 时钟对齐：调度时采样 clockOffset = performance.now()/1000 − ctx.currentTime，
// 两者同为 1s/s 恒速时钟，常数差使「调度节拍的墙钟时刻」可精确换算；
// ctx.currentTime 的读取量化误差为常数偏置，在差值中互相抵消。

// 节拍周期（秒，约 55 BPM）：即本向导可测延迟的上限。配合 evaluateSession 的
// 周期展开，任意延迟 L ∈ [0, PERIOD) 都能正确恢复——高延迟（> 半周期）的拍击
// 虽然会被「最近拍」归属翻到下一拍得到大负数，展开后即还原。
export const PERIOD = 1.1;
export const COUNT_IN = 3;    // 预备拍数（低音，不计入统计）
export const BEATS = 12;      // 计入统计的拍数
export const MIN_TAPS = 6;    // 有效拍击下限
export const MAD_LIMIT = 0.045; // 原始偏移的中位绝对偏差上限：超过判定「拍击不稳定」并警告
                               // （正常跟拍 MAD≈15-30ms；±120ms 级手忙脚乱 MAD≈60ms）
                               // 注意必须在【原始】偏移上算——对剔除后集合算会被裁剪效应
                               // 人为压小，手忙脚乱反而被判稳定（node 测试场景 4 抓到过）

// 把一次拍击归属到时间轴上最近的「未占用且计入统计」的节拍。
// 延迟本身就是待测量，不能设小容差硬拒；防走神/双击交给
// 「每拍只收一次 + 中位数（对孤立走神天然免疫）+ MAD 稳定性警告」。
// 返回被占用的节拍对象；无可归属节拍（全是预备拍/已占用）返回 null。
export function attributeTap(tapSec, ticks) {
  let best = null;
  let bestD = Infinity;
  for (const k of ticks) {
    const d = tapSec - k.p;
    if (Math.abs(d) < Math.abs(bestD)) { best = k; bestD = d; }
  }
  if (!best || !best.counted || best.tap !== undefined) return null;
  best.tap = bestD;
  return best;
}

// 会话结算：有效拍数、周期展开后的中位数、MAD 离散度、可靠性。
// 周期展开：输出延迟物理上非负，把每拍偏移 ((d mod P) + P) mod P 折进 [0, P)——
// 高延迟（L > P/2）被「最近拍」归属成的大负数（L − P）即还原为 L。
// 唯一例外是贴近周期上界（med > P − 150ms）的样本簇：那其实是「延迟 ≈ 0 +
// 跟拍提前」跨过零边界的情形，按 med − P 修正并钳到 0（>1050ms 的延迟不可用）。
// 不满足 MIN_TAPS 返回 { ok:false, validCount }。
export function evaluateSession(ticks) {
  const vals = ticks
    .filter((k) => k.counted && k.tap !== undefined)
    .map((k) => k.tap);
  if (vals.length < MIN_TAPS) return { ok: false, validCount: vals.length };
  const P = PERIOD;
  const us = vals
    .map((v) => ((v % P) + P) % P)
    .sort((a, b) => a - b);
  const med = us[Math.floor(us.length / 2)];
  let resultSec = med;
  if (med > P - 0.15) resultSec = med - P; // 跨零边界：延迟≈0、样本被跟拍提前推过周期头
  const devs = us
    .map((v) => {
      const d0 = Math.abs(v - med);
      return Math.min(d0, P - d0); // 环绕距离：跨零边界的样本群也算聚合
    })
    .sort((a, b) => a - b);
  const mad = devs[Math.floor(devs.length / 2)];
  return {
    ok: true,
    validCount: vals.length,
    usedCount: vals.length,
    resultMs: Math.max(0, Math.round(resultSec * 1000)),
    madMs: Math.round(mad * 1000),
    reliable: mad <= MAD_LIMIT,
  };
}

// ———————— 以下为向导 UI（依赖 DOM 与 AudioContext） ————————

export function openCalibration({ sound, onApply }) {
  const ctx = sound && sound.ctx;
  if (!ctx) return;

  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(10,7,14,.82);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-family:inherit;';
  document.body.appendChild(root);

  const card = document.createElement('div');
  card.style.cssText = 'width:min(420px,calc(100vw - 40px));padding:28px 26px;border-radius:18px;background:rgba(28,22,36,.96);border:1px solid rgba(255,255,255,.14);color:#f2ecf8;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,.5);';
  root.appendChild(card);

  const title = (t) => `<div style="font-size:17px;font-weight:600;letter-spacing:.08em;margin-bottom:12px;color:#e8c86a;">${t}</div>`;
  const note = (t) => `<div style="font-size:12.5px;line-height:1.7;opacity:.72;margin-top:12px;">${t}</div>`;
  const btn = (label, primary) =>
    `<button type="button" data-act="${label}" style="pointer-events:auto;cursor:pointer;border-radius:10px;padding:10px 22px;font-size:14px;letter-spacing:.06em;border:1px solid ${primary ? 'transparent' : 'rgba(255,255,255,.25)'};background:${primary ? '#e8c86a' : 'transparent'};color:${primary ? '#241c10' : '#f2ecf8'};margin:14px 6px 0;">${label}</button>`;

  let phase = 'intro';
  let tickGain = null;
  let oscs = [];
  let pulseTimers = [];
  let finishTimer = null;
  let ticks = [];

  function render(html) { card.innerHTML = html; }

  // —— intro ——
  function showIntro() {
    phase = 'intro';
    render(
      title('音 画 延 迟 校 准') +
      '<div style="font-size:13.5px;line-height:1.9;opacity:.85;">请佩戴你<b>平时使用</b>的耳机/音箱。<br>节拍较慢（约每秒 1 拍），节拍器响起后，跟着你<b>听到的「嗒」声</b><br>按 <b>空格</b>（或点按钮），共 ' + BEATS + ' 拍。<b>不要看圆点</b>，圆点只是装饰。</div>' +
      btn('开 始', true) +
      btn('取消') +
      note('原理：拍击时刻与调度时刻之差的稳健中位数 = 本机音频输出延迟。')
    );
    card.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.act.startsWith('开')) begin();
        else close();
      });
    });
    const start = card.querySelector('button');
    if (start) start.focus();
  }

  // —— running ——
  function begin() {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      setTimeout(begin, 120);
      return;
    }
    phase = 'running';
    tickGain = ctx.createGain();
    tickGain.gain.value = 1;
    tickGain.connect(ctx.destination);

    const clockOffset = performance.now() / 1000 - ctx.currentTime;
    const t0 = ctx.currentTime + 0.9;
    ticks = [];
    oscs = [];
    pulseTimers = [];
    for (let i = 0; i < COUNT_IN + BEATS; i++) {
      const c = t0 + i * PERIOD;
      const counted = i >= COUNT_IN;
      ticks.push({ c, p: c + clockOffset, counted, tap: undefined });
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = counted ? 1200 : 780;
      g.gain.setValueAtTime(0.001, c);
      g.gain.exponentialRampToValueAtTime(counted ? 0.5 : 0.28, c + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, c + 0.075);
      osc.connect(g).connect(tickGain);
      osc.start(c);
      osc.stop(c + 0.12);
      oscs.push(osc);
      // 视觉脉冲（仅装饰；明确提示用户跟音频）
      pulseTimers.push(setTimeout(() => pulse(), (c - ctx.currentTime) * 1000));
    }
    finishTimer = setTimeout(finish, (ticks[ticks.length - 1].p * 1000) - performance.now() + 420);

    render(
      title('跟 着 「 嗒 」 拍 击') +
      '<div id="cal-pulse" style="width:86px;height:86px;margin:14px auto;border-radius:50%;border:2px solid rgba(232,200,106,.5);transition:box-shadow .09s, transform .09s;"></div>' +
      '<div id="cal-count" style="font-size:14px;letter-spacing:.1em;opacity:.85;">预备…</div>' +
      '<button type="button" id="cal-tap" style="pointer-events:auto;cursor:pointer;margin-top:16px;width:150px;height:56px;border-radius:14px;border:1px solid rgba(232,200,106,.55);background:rgba(232,200,106,.1);color:#e8c86a;font-size:16px;letter-spacing:.2em;">拍 击</button>' +
      note('按 空格 或点按钮 · Esc 取消 · 跟音频、勿看圆点')
    );
    card.querySelector('#cal-tap').addEventListener('pointerdown', (e) => { e.preventDefault(); recordTap(); });
  }

  function pulse() {
    const el = card.querySelector('#cal-pulse');
    if (!el || phase !== 'running') return;
    el.style.boxShadow = '0 0 0 10px rgba(232,200,106,.22)';
    el.style.transform = 'scale(1.08)';
    setTimeout(() => { el.style.boxShadow = 'none'; el.style.transform = 'none'; }, 90);
  }

  function recordTap() {
    if (phase !== 'running') return;
    const hit = attributeTap(performance.now() / 1000, ticks);
    if (!hit) return;
    const done = ticks.filter((k) => k.counted && k.tap !== undefined).length;
    const cnt = card.querySelector('#cal-count');
    if (cnt) cnt.textContent = `已完成 ${done} / ${BEATS}`;
    if (done >= MIN_TAPS) {
      const btnEarly = card.querySelector('#cal-early');
      if (!btnEarly) {
        card.querySelector('#cal-tap').insertAdjacentHTML('afterend',
          '<button type="button" id="cal-early" style="pointer-events:auto;cursor:pointer;margin-top:10px;border:none;background:none;color:#e8c86a;opacity:.8;font-size:12.5px;letter-spacing:.08em;text-decoration:underline;">提前完成</button>');
        card.querySelector('#cal-early').addEventListener('click', finish);
      }
    }
  }

  // —— result ——
  function finish() {
    if (phase !== 'running') return;
    phase = 'result';
    cleanupTimers();
    const r = evaluateSession(ticks);
    if (!r.ok) {
      render(
        title('有 效 拍 击 不 足') +
        `<div style="font-size:13.5px;line-height:1.8;opacity:.85;">有效 ${r.validCount} 次，至少需要 ${MIN_TAPS} 次。<br>跟着听到的「嗒」声拍即可，节奏慢，稳住就行。</div>` +
        btn('重新测', true) + btn('取消')
      );
    } else {
      const warn = r.reliable
        ? ''
        : `<div style="font-size:13px;line-height:1.7;color:#ff9d9d;margin-top:10px;">⚠ 拍击不稳定（离散度 ±${r.madMs}ms），结果可能不可靠，建议重新测一次</div>`;
      render(
        title('校 准 完 成') +
        `<div style="font-size:30px;font-weight:700;color:#e8c86a;letter-spacing:.04em;margin:6px 0;">≈ ${r.resultMs} ms</div>` +
        '<div style="font-size:13px;line-height:1.8;opacity:.85;">这是你当前音频输出链路的真实延迟（有效拍击 ' + r.validCount + ' 次）。<br>人类跟拍会整体略微提前，若游戏里仍觉得<br>碰撞声稍晚，进入游戏后按 <b>]</b> 加 25ms 微调即可。</div>' +
        warn +
        btn('应用并保存', true) + btn('重新测') + btn('取消')
      );
    }
    card.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.act.startsWith('应用')) {
          const rr = evaluateSession(ticks);
          if (rr.ok && onApply) onApply(rr.resultMs);
          close();
        } else if (b.dataset.act.startsWith('重新')) begin();
        else close();
      });
    });
  }

  function cleanupTimers() {
    pulseTimers.forEach(clearTimeout);
    pulseTimers = [];
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; }
    if (tickGain) { try { tickGain.gain.setValueAtTime(0, ctx.currentTime); } catch { /* 已关闭 */ } }
  }

  function close() {
    phase = 'closed';
    cleanupTimers();
    window.removeEventListener('keydown', onKey, true);
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (phase === 'running' && (e.code === 'Space' || e.key === ' ')) {
      e.preventDefault();
      recordTap();
    }
  }
  window.addEventListener('keydown', onKey, true);

  showIntro();
}
