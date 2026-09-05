// audio.js — WebAudio 音效：木板采样碰撞（音量随冲击）+ 抛起/揭晓/解锁合成音（零外部依赖之外的采样）
import hitWavUrl from '../assets/coin-wood-hit.wav';

export class SoundKit {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.hitBuffer = null; // 解码完成的碰撞采样
    this.hitDecoding = false;
    this.hitPromise = null; // 解码 Promise（供验收/测试等待）
  }

  // 必须在用户手势后调用（浏览器自动播放策略）
  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._prepareHitBuffer();
    return this.ctx;
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v && this.ctx) this.ctx.suspend();
    if (v && this.ctx) this.ctx.resume();
  }

  // 金属碰撞「叮」合成兜底：两个非谐波泛音快速指数衰减，intensity 0~1 控制音量与亮度
  _metalPing(intensity = 0.5) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const vol = 0.04 + intensity * 0.22;
    const master = ctx.createGain();
    master.gain.value = vol;
    master.connect(ctx.destination);

    const partials = [
      { f: 2350 + intensity * 500, g: 1.0, d: 0.09 },
      { f: 6100 + intensity * 900, g: 0.4, d: 0.05 },
    ];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(p.g, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.d);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + p.d + 0.02);
    }
  }

  // 碰撞声：木板采样（峰值归一化，音量随冲击、速率微随机）+ 金属叮叠加，保证碰撞反馈始终可听
  clink(intensity = 0.5) {
    const ctx = this.ensure();
    if (!ctx) return;

    // 金属叮始终叠加：合成音量稳定，是碰撞反馈的可听下限（采样电平异常时也不至于无声）
    this._metalPing(intensity);

    if (this.hitBuffer) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = this.hitBuffer;
        src.playbackRate.value = 0.92 + Math.random() * 0.16; // 微随机避免重复感
        const g = ctx.createGain();
        g.gain.value = 0.2 + intensity * 0.55;
        src.connect(g).connect(ctx.destination);
        src.start();
      } catch {
        /* 播放异常时合成叮已保证反馈 */
      }
    }
  }

  // 预解码碰撞采样（幂等；解码在用户手势后的 AudioContext 上进行）
  _prepareHitBuffer() {
    if (this.hitBuffer || this.hitDecoding || !this.ctx) {
      return this.hitPromise || Promise.resolve(this.hitBuffer);
    }
    this.hitDecoding = true;
    this.hitPromise = fetch(hitWavUrl)
      .then((r) => r.arrayBuffer())
      .then((ab) => this.ctx.decodeAudioData(ab))
      .then((buf) => {
        // 峰值归一化（无放大上限）：不管源文件电平多低，都拉到峰值 0.85 的可用响度；
        // 样本级 clamp(-1,1) 兜底防削波；非有限样本直接置 0
        let peak = 0;
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const d = buf.getChannelData(ch);
          for (let i = 0; i < d.length; i++) {
            const v = d[i];
            if (!isFinite(v)) {
              d[i] = 0;
              continue;
            }
            const a = Math.abs(v);
            if (a > peak) peak = a;
          }
        }
        this.hitPeak = peak;
        if (peak > 0 && peak < 1) {
          const norm = 0.85 / peak;
          for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) {
              d[i] = Math.max(-1, Math.min(1, d[i] * norm));
            }
          }
        }
        this.hitBuffer = buf;
        return buf;
      })
      .catch(() => {
        this.hitBuffer = null; // 解码失败则永久使用合成兜底
        this.hitDecoding = false;
        return null;
      });
    return this.hitPromise;
  }

  // 等待碰撞采样解码完成（验收/测试用；产品路径在 ensure 后自动预解码）
  preloadHit() {
    this.ensure();
    return this._prepareHitBuffer();
  }

  // 抛起轻响：短促上扫频
  toss() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, t0);
    osc.frequency.exponentialRampToValueAtTime(920, t0 + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }

  // 结果揭晓：上行双音
  reveal(face) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const notes = face === 'heads' ? [659.25, 987.77] : [587.33, 880]; // E5→B5 / D5→A5
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      const start = t0 + i * 0.12;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(g).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }

  // 成就解锁：上行三连琶音
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      const start = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(g).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  }
}
