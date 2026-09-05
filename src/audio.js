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

  // 金属撞木合成兜底：中低频「叩」声，短促钝感（高频泛音刺耳，已弃用）
  _metalPing(intensity = 0.5) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const vol = 0.05 + intensity * 0.18;
    const master = ctx.createGain();
    master.gain.value = vol;
    master.connect(ctx.destination);

    const partials = [
      { f: 820 + intensity * 260, g: 1.0, d: 0.11 },
      { f: 1750 + intensity * 350, g: 0.3, d: 0.06 },
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

  // 碰撞声：木板采样为主（音量随冲击、速率微随机），不叠合成音——保持金属撞木的钝感
  clink(intensity = 0.5) {
    const ctx = this.ensure();
    if (!ctx) return;

    if (this.hitBuffer) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = this.hitBuffer;
        src.playbackRate.value = 0.92 + Math.random() * 0.16; // 微随机避免重复感
        const g = ctx.createGain();
        g.gain.value = 0.2 + intensity * 0.55;
        src.connect(g).connect(ctx.destination);
        src.start(0, this.hitStartOffset || 0); // 跳过静音头，即响
        return;
      } catch {
        /* 播放异常时回退合成音 */
      }
    }
    this._metalPing(intensity); // 采样尚未解码完成或播放异常时的兜底
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
        // 1) 清理：非有限/越界坏点 → 置 0（源文件实测含 7.2e31 级越界样本，直接播放会爆音）
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const d = buf.getChannelData(ch);
          for (let i = 0; i < d.length; i++) {
            const v = d[i];
            if (!isFinite(v) || Math.abs(v) > 4) d[i] = 0;
          }
        }
        // 2) 清理后重算有效峰值，归一化到 0.85 的稳定响度（此后采样电平恒定可听）
        let peak = 0;
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const d = buf.getChannelData(ch);
          for (let i = 0; i < d.length; i++) {
            const a = Math.abs(d[i]);
            if (a > peak) peak = a;
          }
        }
        this.hitPeak = peak;
        if (peak > 0 && peak !== 0.85) {
          const norm = 0.85 / peak;
          for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) {
              d[i] = Math.max(-1, Math.min(1, d[i] * norm));
            }
          }
        }
        // 3) 扫描首个有效样本（|v|>0.02）：跳过采样开头的静音段，消除播放迟滞感
        let startIdx = 0;
        const threshold = 0.02;
        for (let ch = 0; ch < buf.numberOfChannels && startIdx === 0; ch++) {
          const d = buf.getChannelData(ch);
          for (let i = 0; i < d.length; i++) {
            if (Math.abs(d[i]) > threshold) {
              startIdx = Math.max(0, i - 64); // 保留约 1.3ms 的自然起振
              break;
            }
          }
        }
        this.hitStartOffset = startIdx / buf.sampleRate;
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
