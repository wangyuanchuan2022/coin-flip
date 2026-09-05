# 抛硬币模拟器 · Coin Flip Simulator

基于真实刚体物理引擎的网页版抛硬币模拟器：硬币被真实抛出、翻转、弹跳、滚动静置，最终稳定显示正面或反面。

## 运行方式

**在线版（GitHub Pages）**：<https://wangyuanchuan2022.github.io/coin-flip/>

**本地运行**：双击 `index.html` 即可使用（完全离线，无需服务器、无需联网）。觉得不错的话，欢迎到[仓库页](https://github.com/wangyuanchuan2022/coin-flip)点个 Star ⭐

可选：也可以通过本地服务器运行（效果相同）：

```
npm run build
# 任选其一：
npx http-server .        # 或
python -m http.server 8000
```

## 操作说明

- **抛硬币**：点击「抛硬币」大按钮 / 按空格或回车 / 直接点击台面
- **力度**：三档可选（轻抛 / 正常 / 大力），影响抛起高度与翻转角速度
- **镜头**：硬币抛出后相机自动追踪（飞行跟随 + 落点定格），无需手动调整视角
- **掉落**：台面是有边界的真实桌面——力度过猛或运气差时硬币可能滚出边缘掉落，会自动重置到台面中央（不计入统计）
- **成就**：15 枚成就（里程碑 / 连击 / 阵营 / 隐藏彩蛋），统计卡「成就」入口查看进度；解锁瞬间有 toast 通知与专属音效；localStorage 持久化
- **音效**：右上角按钮开关；碰撞「叮」声与冲击力成正比，结果揭晓有提示音
- **统计**：底部卡片记录正/反次数与正面率（localStorage 持久化，关闭浏览器不丢失）
- **演示/自动化**：`index.html?autotoss=800` 可在页面加载后自动抛掷（毫秒为延迟参数）

## 物理实现（验收要点）

- 引擎：[cannon-es](https://github.com/pmndrs/cannon-es) 刚体物理，`1/120s` 固定步长
- 硬币：薄圆柱刚体（质量 8），真实重力 9.82、空气阻尼、与台面摩擦 0.38 / 弹性 0.42
- 抛掷：随机初速度 + 绕随机水平轴的主翻转角速度（tumbling）+ 随机初始姿态
- 结果判定：硬币静止（速度/角速度低于阈值持续 0.45s 或进入休眠）后，读取圆柱轴向与世界 up 的夹角——朝上为正，朝下为反；罕见斜靠状态会自动微扰推倒后重新判定；14s 超时保护兜底
- 台面：有限圆盘桌面（与视觉一致，半径 14），无隐形围墙；呢面滚动阻力让硬币落地后数秒内自然停住，滚出边缘即真实掉落
- 相机：飞行时平滑追踪硬币（看向点全跟随 + 机位小比例限幅跟随），结算后镜头定格在落点与画面中心的折中位；`prefers-reduced-motion` 下只转视角不移动机位

## 技术栈与结构

| 模块 | 文件 | 职责 |
|---|---|---|
| 入口 | `index.html` | 页面骨架 + 全部 UI 样式（设计 token 见 `:root`） |
| 装配 | `src/main.js` | 物理循环、交互接线 |
| 物理 | `src/physics.js` | cannon-es 世界、有限圆盘台面、抛掷与判定 |
| 渲染 | `src/scene.js` | three.js 暗场舞台、聚光阴影、相机跟随、结果光环、庆祝粒子 |
| 模型 | `src/coin-model.js` | GLB 硬币模型加载、轴向对齐与尺寸归一（贴图内嵌 bundle） |
| 音效 | `src/audio.js` | WebAudio 合成音效（零音频资源） |
| 界面 | `src/ui.js` | 按钮/力度/结果/统计交互 |

依赖：`three`（渲染）、`cannon-es`（物理）；`esbuild` 仅用于构建。

## 重新构建

修改 `src/` 后执行：

```
npm run build
```

产物为 `dist/bundle.js`（IIFE，已随项目提供），`index.html` 直接引用。

## 公平性测试

`tests/fairness.mjs` 在 node 中批量同步快进抛掷，统计正/反分布与 z-score：

```
node tests/fairness.mjs        # 默认 200 次
node tests/fairness.mjs 2000   # 自定义次数（三档力度轮换）
```

判定标准：正面比例落在 95% 公平带内（|z| < 2）即无显著偏向；滚出台面的掉落单列 `dropped` 统计（合法结果，不计正/反）。定稿验证数据：600 次 z=+0.73（0 掉落）、此前 2000 次 z=+1.03，均无系统性偏向。

> 实现注记：初始姿态采用 Shoemake 均匀四元数采样（随机欧拉角在姿态空间分布不均匀）、翻转方向正负随机（恒定单方向会造成角动量与落地映射的弱相关）——两者都是批量测试曾暴露的真实偏差来源，修复依据见 git 历史。

## 设计说明

视觉风格来自 ui-ux-pro-max 设计数据库：`3d-and-hyperrealism`（WebGL 3D + 真实光影）× Theater/Cinema 色板（Dramatic dark + spotlight gold：背景 `#0F0F23`、金色点缀 `#CA8A04`），标题 Playfair Display 衬线（离线自动回退 Georgia/系统衬线），正文 Inter。

## 素材许可

- 硬币视觉模型：`Roman Coin – Constantine II – Zbrush sculpt`，作者 **Andy Woodhead**（[Sketchfab 来源页](https://sketchfab.com/3d-models/roman-coin-constantine-ii-zbrush-sculpt-df65cc0befa040969e9d5fa476e6ebaf)），许可 **CC BY-NC 4.0**（署名—非商业性使用 4.0，已按模型内嵌元数据核实）。
- 台面木材 PBR 贴图：**Wood051**（[ambientCG](https://ambientcg.com/)），许可 **CC0**（可商用、免署名）。
- 碰撞音效：Freesound 用户投稿采样（`assets/coin-wood-hit.wav`），许可 **CC0**（可商用、免署名）。

- `assets/` 内为素材源文件（不入库），加工后内嵌于 `dist/bundle.js`；
- 硬币模型为**非商业用途**：如公开分发本项目（含内嵌模型的 dist），须保留署名且不得用于商业用途。
