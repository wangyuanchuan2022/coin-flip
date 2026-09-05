# vendor/qrcode.cjs 溯源

- 来源：https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/js1.4.4/js/qrcode.js
  （tag `js1.4.4`，与 npm 发行版 qrcode-generator@1.4.4 的主入口同源）
- 许可：MIT（文件头完整保留，Copyright (c) 2009 Kazuhiko Arase）
- 字节：56,658；文件内容与上游逐字节一致（未改动，仅扩展名 .cjs 标记 CommonJS 以便
  esbuild 与 node ESM 双侧以 default interop 导入）
- 为什么 vendor：npm 包整体安装被安全审查判 BLOCK——包内附带的 `qrcode_SJIS.js`
  （日文汉字模式编码表）命中「超长 base64 字面量」混淆特征，属误报但按纪律规避；
  本文件在两轮包扫描中均为零命中，本地复扫 PASS（0 高危 / 0 中危 / 0 低危）。
- 引入图：仅 `src/share.js` 使用（`import qrcode from './vendor/qrcode.cjs'`），
  用于在分享面板渲染屏幕二维码与分享卡片内嵌二维码。
- 升级方式：换新版本时重新走「下载 → security_review → 覆盖本文件」流程。
