// share.js — 分享面板：屏幕二维码（真实 UI 元素，可被手机直接扫）+ 带成就/统计的分享卡片图
// 纯逻辑（URL 解析/文案/QR 矩阵/SVG）导出供 tests/share.mjs 在 node 里自证；
// DOM 相关（modal/canvas 卡片）只在函数体内触碰，保证 node 可直接 import 本模块。
import qrcode from './vendor/qrcode.cjs';
import { ACHIEVEMENTS } from './achievements.js';

export const FALLBACK_URL = 'https://wangyuanchuan2022.github.io/coin-flip/';

// https 部署用真实地址；file:// 本地打开回退 GitHub Pages（本地地址扫码无意义）
export function resolveGameUrl(loc) {
  try {
    if (loc && typeof loc.protocol === 'string' && loc.protocol.startsWith('http')) {
      return (loc.origin || '') + (loc.pathname || '/');
    }
  } catch { /* 非 location 形状按回退处理 */ }
  return FALLBACK_URL;
}

// 统计行：零抛特殊文案；连击 ≥2 才展示连击段
export function statsLine(c) {
  if (!c || !c.total) return '尚未开抛 · 快来试试手气';
  const base = `总抛 ${c.total} · 正 ${c.heads} · 反 ${c.tails}`;
  if (c.streakFace >= 2) {
    const face = c.streakLast === 'heads' ? '正' : '反';
    return `${base} · 连${face}×${c.streakFace}`;
  }
  return base;
}

// 成就行：解锁数 k/15 + 最近解锁的最多 3 个成就名（按解锁时间倒序）
export function achievementsLine(unlocked) {
  const ids = Object.keys(unlocked || {});
  const latest = ids
    .map((id) => ({ id, ts: unlocked[id] || 0 }))
    .sort((a, b) => b.ts - a.ts)
    .map((x) => ACHIEVEMENTS.find((a) => a.id === x.id))
    .filter(Boolean)
    .slice(0, 3)
    .map((a) => a.name);
  const head = `成就 ${ids.length}/${ACHIEVEMENTS.length}`;
  return latest.length ? `${head} · 最近：${latest.join('、')}` : `${head} · 虚位以待`;
}

// QR 矩阵：typeNumber 自动纠错 M 级；导出供 SVG 与 canvas 双侧复用 + node 断言
export function buildQrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return { size, isDark: (r, c) => qr.isDark(r, c) };
}

// 屏幕 SVG 二维码：crispEdges 保证任意缩放锐利、真机可扫；静区 4 模块（规范值）
export function buildQrSvg(text, px = 208) {
  const m = buildQrMatrix(text);
  const quiet = 4;
  const total = m.size + quiet * 2;
  let cells = '';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.isDark(r, c)) cells += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="游戏链接二维码">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/><g fill="#1d1626">${cells}</g></svg>`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

// 分享卡片：1080×1350 海报（结果 + 统计 + 成就 + 内嵌二维码）
export function buildShareCard({ face, counters, url, unlocked }) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#17121f');
  g.addColorStop(1, '#2a2033');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(232,200,106,.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8c86a';
  ctx.font = `600 64px ${FONT}`;
  ctx.fillText('抛硬币模拟器', W / 2, 152);
  ctx.fillStyle = 'rgba(155,143,176,.9)';
  ctx.font = `400 24px ${FONT}`;
  ctx.fillText('C O I N   F L I P  ·  R I G I D   B O D Y   P H Y S I C S', W / 2, 198);

  const cy = 480;
  const R = 208;
  ctx.beginPath();
  ctx.arc(W / 2, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#e8c86a';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, cy, R - 16, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(232,200,106,.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const glyph = face === 'heads' ? '正' : face === 'tails' ? '反' : '？';
  ctx.fillStyle = '#f2ecf8';
  ctx.font = `700 168px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, W / 2, cy + 10);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#cfc6dd';
  ctx.font = `400 40px ${FONT}`;
  const resultText = counters.total
    ? `第 ${counters.total} 抛 · ${glyph === '正' ? '正面' : glyph === '反' ? '反面' : '待揭晓'}`
    : '虚位以待 · 快来抛出第一枚';
  ctx.fillText(resultText, W / 2, cy + R + 92);

  ctx.fillStyle = '#e8c86a';
  ctx.font = `500 44px ${FONT}`;
  ctx.fillText(statsLine(counters), W / 2, cy + R + 178);

  ctx.fillStyle = 'rgba(207,198,221,.95)';
  ctx.font = `400 31px ${FONT}`;
  ctx.fillText(achievementsLine(unlocked), W / 2, cy + R + 248);

  // 底部白卡：二维码 + 扫码文案
  const qw = 820;
  const qh = 236;
  const qx = (W - qw) / 2;
  const qy = H - qh - 108;
  roundRectPath(ctx, qx, qy, qw, qh, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const m = buildQrMatrix(url);
  const qs = 176;
  const quiet = 4;
  const total = m.size + quiet * 2;
  const cell = qs / total;
  const qxx = qx + 30;
  const qyy = qy + (qh - qs) / 2;
  ctx.fillStyle = '#1d1626';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.isDark(r, c)) ctx.fillRect(qxx + (c + quiet) * cell, qyy + (r + quiet) * cell, cell + 0.4, cell + 0.4);
    }
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#241c10';
  ctx.font = `700 48px ${FONT}`;
  ctx.fillText('扫码开玩', qxx + qs + 56, qy + qh / 2 - 16);
  ctx.fillStyle = '#6b6270';
  ctx.font = `400 27px ${FONT}`;
  const short = url.replace(/^https:\/\//, '');
  ctx.fillText(short.length > 30 ? short.slice(0, short.lastIndexOf('/', 28) + 1) : short, qxx + qs + 56, qy + qh / 2 + 34);
  ctx.fillText(short.includes('/') && short.length > 30 ? short.slice(short.lastIndexOf('/', 28) + 1) : '', qxx + qs + 56, qy + qh / 2 + 74);
  return canvas;
}

// ———————— 以下为分享面板 UI（依赖 DOM） ————————

export function openShare({ url, face, counters, unlocked }) {
  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(10,7,14,.82);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-family:inherit;';
  document.body.appendChild(root);

  const card = document.createElement('div');
  card.style.cssText = 'width:min(460px,calc(100vw - 40px));max-height:calc(100vh - 48px);overflow:auto;padding:26px;border-radius:18px;background:rgba(28,22,36,.97);border:1px solid rgba(255,255,255,.14);color:#f2ecf8;box-shadow:0 18px 60px rgba(0,0,0,.5);position:relative;';
  root.appendChild(card);

  const btnCss = 'pointer-events:auto;cursor:pointer;border-radius:10px;padding:10px 20px;font-size:14px;letter-spacing:.06em;';
  const primaryCss = btnCss + 'border:none;background:#e8c86a;color:#241c10;';
  const ghostCss = btnCss + 'border:1px solid rgba(255,255,255,.25);background:transparent;color:#f2ecf8;';

  card.innerHTML =
    '<div style="font-size:17px;font-weight:600;letter-spacing:.08em;color:#e8c86a;margin-bottom:14px;">分 享</div>' +
    '<button type="button" id="share-close" aria-label="关闭" style="position:absolute;top:14px;right:14px;border:none;background:none;color:#9b8fb0;font-size:20px;cursor:pointer;pointer-events:auto;">✕</button>' +
    '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">' +
      `<div id="share-qr" style="flex:0 0 auto;padding:10px;background:#fff;border-radius:10px;">${buildQrSvg(url, 168)}</div>` +
      '<div style="flex:1;min-width:150px;">' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:8px;">扫码开玩</div>' +
        `<div id="share-url" style="font-size:12px;line-height:1.6;opacity:.75;word-break:break-all;margin-bottom:10px;">${url}</div>` +
        `<button type="button" id="share-copy" style="${ghostCss}">复制链接</button>` +
        '<div id="share-copy-tip" style="font-size:12px;color:#7dff9b;margin-top:6px;height:14px;"></div>' +
      '</div>' +
    '</div>' +
    '<div style="border-top:1px solid rgba(255,255,255,.12);margin:16px 0 14px;"></div>' +
    '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">分享卡片（结果 + 成就 + 统计 + 二维码）</div>' +
    '<div id="share-card-slot" style="text-align:center;margin-bottom:8px;"></div>' +
    '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
      `<button type="button" id="share-save" style="${primaryCss}">保存图片</button>` +
      `<button type="button" id="share-native" style="${ghostCss}display:none;">系统分享</button>` +
    '</div>';

  // 卡片图
  const canvas = buildShareCard({ face, counters, url, unlocked });
  const dataUrl = canvas.toDataURL('image/png');
  const slot = card.querySelector('#share-card-slot');
  const img = new Image();
  img.src = dataUrl;
  img.alt = '分享卡片';
  img.style.cssText = 'width:100%;max-width:250px;border-radius:12px;border:1px solid rgba(255,255,255,.14);';
  slot.appendChild(img);

  function close() {
    window.removeEventListener('keydown', onKey, true);
    if (root.parentNode) root.parentNode.removeChild(root);
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  window.addEventListener('keydown', onKey, true);
  card.querySelector('#share-close').addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  card.querySelector('#share-copy').addEventListener('click', async () => {
    const tip = card.querySelector('#share-copy-tip');
    try {
      await navigator.clipboard.writeText(url);
      tip.textContent = '已复制';
    } catch {
      tip.textContent = '复制失败，请手动选择链接';
    }
    setTimeout(() => { tip.textContent = ''; }, 2000);
  });

  card.querySelector('#share-save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'coin-flip-share.png';
    a.href = dataUrl;
    a.click();
  });

  const native = card.querySelector('#share-native');
  if (navigator.canShare) {
    try {
      const file = new File([dataUrlToBlob(dataUrl)], 'coin-flip-share.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        native.style.display = '';
        native.addEventListener('click', () => {
          navigator.share({ files: [file], title: '抛硬币模拟器', text: '来试试这个物理抛硬币：', url }).catch(() => { /* 用户取消 */ });
        });
      }
    } catch { /* 分享能力探测失败则保持隐藏 */ }
  }
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
