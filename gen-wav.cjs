// gen-wav.cjs — 把碰撞采样 WAV 转成 dataURL 的 ESM 模块（esbuild 打包内联，绕开 loader 机制）
const fs = require('fs');
const b64 = fs.readFileSync('assets/coin-wood-hit.wav').toString('base64');
fs.writeFileSync(
  'assets/coin-wav-dataurl.js',
  '// 由 gen-wav.cjs 自动生成：碰撞采样的 dataURL\nexport default "data:audio/wav;base64,' + b64 + '";\n'
);
console.log('coin-wav-dataurl.js generated:', (b64.length / 1024).toFixed(0), 'KB base64');
