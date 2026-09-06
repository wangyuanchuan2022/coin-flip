// Electron 主进程（CJS）：只加载本地 index.html；全部资产已内联于 dist/bundle.js，离线可用。
// 安全配置：关闭 Node 集成、开启上下文隔离与沙箱（安全审查报告的缓解措施）。
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f0f23',
    autoHideMenuBar: true,
    title: '抛硬币模拟器',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.on('page-title-updated', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
