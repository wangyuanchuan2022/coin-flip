// calibrate.js — 音画延迟自动校准向导（osu! Offset Wizard 同款机制）
//
// 原理：节拍器以固定周期调度「嗒」声（WebAudio 采样级精确调度），用户跟着
// 「听到的」节拍拍击。拍击时刻与该拍调度时刻之差 = 音频输出链路真实延迟
// （人类跟拍存在约 -10~-40ms 的整体预判偏置，结果偏小时在游戏里按 ] 加一档微调）。
// 取中位数并做离群剔除，免疫个别拍错/走神。
//
// 时钟对齐：调度时采样 clockOffset = performance.now()/1000 − ctx.currentTime，
// 两者同为 1s/s 恒速时钟，常数差使「调度节拍的墙钟时刻」可精确换算；
// ctx.currentTime 的读取量化误差为常数偏置，在差值中互相抵消。

const PERIOD = 1.1;    // 节拍周期（秒，约 55 BPM）：必须大于预期最大延迟的 2 倍——
                       // 否则「延迟 L 的拍击」在时间轴上会离「下一拍」更近（L>周期/2 时），
                       // 被错误归属到下一拍再被容差拒绝，有效拍击永远不足（实测 300ms 延迟必现）
const COUNT_IN = 3;    // 预备拍数（低音，不计入统计）
const BEATS = 12;      // 计入统计的拍数
const MIN_TAPS = 6;    // 有效拍击下限
const OUTLIER = 0.08;  // 距中位数超过此值视为走神拍（秒）

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
  let taps = []; // 每拍归属的拍击偏移（秒），按 ticks 顺序
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
    taps = [];
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
    const t = performance.now() / 1000;
    let best = null;
    let bestD = Infinity;
    for (const k of ticks) {
      const d = t - k.p;
      if (Math.abs(d) < Math.abs(bestD)) { best = k; bestD = d; }
    }
    // 只按「最近拍」归属：延迟本身就是待测量，不能设小容差硬拒；
    // 防走神/双击交给「每拍只收一次 + 中位数离群剔除」
    if (!best || !best.counted || best.tap !== undefined) return;
    best.tap = bestD;
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
    const vals = ticks.filter((k) => k.counted && k.tap !== undefined).map((k) => k.tap).sort((a, b) => a - b);
    if (vals.length < MIN_TAPS) {
      render(
        title('有 效 拍 击 不 足') +
        `<div style="font-size:13.5px;line-height:1.8;opacity:.85;">有效 ${vals.length} 次，至少需要 ${MIN_TAPS} 次。<br>跟着听到的「嗒」声拍即可，慢一点也没关系。</div>` +
        btn('重新测', true) + btn('取消')
      );
    } else {
      const med = vals[Math.floor(vals.length / 2)];
      const kept = vals.filter((v) => Math.abs(v - med) <= OUTLIER);
      const use = kept.length ? kept : vals;
      const resultMs = Math.round(use[Math.floor(use.length / 2)] * 1000);
      render(
        title('校 准 完 成') +
        `<div style="font-size:30px;font-weight:700;color:#e8c86a;letter-spacing:.04em;margin:6px 0;">≈ ${resultMs} ms</div>` +
        '<div style="font-size:13px;line-height:1.8;opacity:.85;">这是你当前音频输出链路的真实延迟（有效拍击 ' + vals.length + ' 次）。<br>人类跟拍会整体略微提前，若游戏里仍觉得<br>碰撞声稍晚，进入游戏后按 <b>]</b> 加 25ms 微调即可。</div>' +
        btn('应用并保存', true) + btn('重新测') + btn('取消')
      );
      card.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          if (b.dataset.act.startsWith('应用')) {
            if (onApply) onApply(resultMs);
            close();
          } else if (b.dataset.act.startsWith('重新')) begin();
          else close();
        });
      });
      return;
    }
    card.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.act.startsWith('重新')) begin();
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
