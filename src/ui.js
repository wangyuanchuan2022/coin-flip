// ui.js — DOM 界面层：抛掷按钮、力度选择、结果展示、统计（localStorage 持久化）、静音开关、成就系统
import { ACHIEVEMENTS } from './achievements.js';

const STATS_KEY = 'coin-flip-stats-v1';

export class CoinUI {
  constructor({ onThrow, onToggleSound }) {
    this.onThrow = onThrow;
    this._onToggleSound = onToggleSound;
    this.power = 1;

    this.els = {
      throwBtn: document.getElementById('throw-btn'),
      resultPanel: document.getElementById('result-panel'),
      resultFace: document.getElementById('result-face'),
      resultEn: document.getElementById('result-en'),
      statHeads: document.getElementById('stat-heads'),
      statTails: document.getElementById('stat-tails'),
      statTotal: document.getElementById('stat-total'),
      statRate: document.getElementById('stat-rate'),
      ratioHeads: document.getElementById('ratio-heads'),
      soundBtn: document.getElementById('sound-btn'),
      status: document.getElementById('status-line'),
    };

    this._loadStats();
    this._renderStats();
    this._bind();
  }

  _bind() {
    this.els.throwBtn.addEventListener('click', () => this._requestThrow());
    this.els.soundBtn.addEventListener('click', () => {
      const muted = this.els.soundBtn.classList.toggle('muted');
      if (typeof this._onToggleSound === 'function') this._onToggleSound(!muted);
    });

    // 力度三档
    document.querySelectorAll('.power-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.power-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.power = Number(btn.dataset.power);
      });
    });

    // 空格 / 回车抛掷
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this._requestThrow();
      }
    });
  }

  _requestThrow() {
    if (typeof this.onThrow === 'function') this.onThrow(this.power);
  }

  enterFlying() {
    this.els.throwBtn.disabled = true;
    this.els.throwBtn.classList.add('flying');
    this.els.throwBtn.querySelector('.btn-label').textContent = '硬币飞行中';
    this.els.status.textContent = '重力和角动量决定命运…';
    this.els.resultPanel.classList.remove('show', 'heads', 'tails');
  }

  enterIdle(message) {
    this.els.throwBtn.disabled = false;
    this.els.throwBtn.classList.remove('flying');
    this.els.throwBtn.querySelector('.btn-label').textContent = '抛 硬 币';
    this.els.status.textContent = message || '点击按钮、按下空格或直接点击台面抛掷';
  }

  showResult(face) {
    const panel = this.els.resultPanel;
    panel.classList.remove('heads', 'tails', 'show');
    // 强制重排以重启动画
    void panel.offsetWidth;
    panel.classList.add(face === 'heads' ? 'heads' : 'tails', 'show');
    this.els.resultFace.textContent = face === 'heads' ? '正 面' : '反 面';
    this.els.resultEn.textContent = face === 'heads' ? 'HEADS' : 'TAILS';
  }

  record(face) {
    this.stats.total += 1;
    if (face === 'heads') this.stats.heads += 1;
    else this.stats.tails += 1;
    this._saveStats();
    this._renderStats();
  }

  _loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      this.stats = raw ? JSON.parse(raw) : { heads: 0, tails: 0 };
      if (typeof this.stats.heads !== 'number' || typeof this.stats.tails !== 'number') {
        throw new Error('bad stats');
      }
    } catch {
      this.stats = { heads: 0, tails: 0 };
    }
  }

  _saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this.stats));
    } catch {
      /* 隐私模式下静默失败 */
    }
  }

  _renderStats() {
    const { heads, tails } = this.stats;
    const total = heads + tails;
    this.els.statHeads.textContent = String(heads);
    this.els.statTails.textContent = String(tails);
    this.els.statTotal.textContent = String(total);
    this.els.statRate.textContent = total ? Math.round((heads / total) * 100) + '%' : '—';
    const headsPct = total ? (heads / total) * 100 : 50;
    this.els.ratioHeads.style.width = headsPct + '%';
  }

  // —— 成就系统 ——
  setAchievements(mgr) {
    this.achv = mgr;
    this.toastQueue = [];
    this.toastBusy = false;
    this.achvEls = {
      entry: document.getElementById('achv-entry'),
      count: document.getElementById('achv-count'),
      panel: document.getElementById('achv-panel'),
      panelCount: document.getElementById('achv-panel-count'),
      grid: document.getElementById('achv-grid'),
      close: document.getElementById('achv-close'),
      toast: document.getElementById('achv-toast'),
      toastName: document.getElementById('achv-toast-name'),
    };
    this.achvEls.entry.addEventListener('click', () => this.openAchievements());
    this.achvEls.close.addEventListener('click', () => this.closeAchievements());
    this.achvEls.panel.addEventListener('click', (e) => {
      if (e.target === this.achvEls.panel) this.closeAchievements();
    });
    this.updateAchvEntry();
  }

  updateAchvEntry() {
    if (!this.achv) return;
    const text = this.achv.unlockedCount + '/' + this.achv.total;
    this.achvEls.count.textContent = text;
    this.achvEls.panelCount.textContent = text;
  }

  openAchievements() {
    const grid = this.achvEls.grid;
    grid.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const unlocked = this.achv.isUnlocked(a.id);
      const masked = a.hidden && !unlocked;
      const card = document.createElement('div');
      card.className = 'achv-card' + (unlocked ? ' unlocked' : '') + (masked ? ' hidden-locked' : '');
      const glyph = document.createElement('div');
      glyph.className = 'achv-glyph';
      glyph.textContent = masked ? '?' : a.glyph;
      const body = document.createElement('div');
      body.className = 'achv-body';
      const name = document.createElement('div');
      name.className = 'achv-name';
      name.textContent = masked ? '？？？' : a.name;
      const desc = document.createElement('div');
      desc.className = 'achv-desc';
      desc.textContent = masked ? '隐藏成就 · 继续探索' : a.desc;
      body.append(name, desc);
      if (unlocked) {
        const done = document.createElement('div');
        done.className = 'achv-done';
        done.textContent = '已解锁';
        body.append(done);
      } else if (!a.hidden) {
        const [cur, goal] = this.achv.progress(a);
        const bar = document.createElement('div');
        bar.className = 'achv-bar';
        const fill = document.createElement('div');
        fill.className = 'achv-bar-fill';
        fill.style.width = Math.min(100, (cur / goal) * 100) + '%';
        bar.append(fill);
        const pct = document.createElement('div');
        pct.className = 'achv-pct';
        pct.textContent = cur + ' / ' + goal;
        body.append(bar, pct);
      }
      card.append(glyph, body);
      grid.append(card);
    }
    this.achvEls.panel.classList.add('show');
    this.achvEls.panel.setAttribute('aria-hidden', 'false');
  }

  closeAchievements() {
    this.achvEls.panel.classList.remove('show');
    this.achvEls.panel.setAttribute('aria-hidden', 'true');
  }

  showUnlockToast(a) {
    this.toastQueue.push(a);
    if (!this.toastBusy) this._nextToast();
  }

  _nextToast() {
    const a = this.toastQueue.shift();
    if (!a) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;
    this.achvEls.toastName.textContent = a.name;
    this.achvEls.toast.classList.add('show');
    setTimeout(() => {
      this.achvEls.toast.classList.remove('show');
      setTimeout(() => this._nextToast(), 300);
    }, 3000);
  }
}
