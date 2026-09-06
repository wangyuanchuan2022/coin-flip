// scene.js — three.js 渲染：暗场舞台、聚光灯、金币模型、结果光环、金色粒子
// 风格来源：ui-ux-pro-max 数据库 3d-and-hyperrealism × Theater/Cinema「Dramatic dark + spotlight gold」
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { launchFlightTime, launchTau, LAUNCH_LIFT } from './launch-curve.js';

const _lq1 = new THREE.Quaternion();
const _lq2 = new THREE.Quaternion();
import woodColorUrl from '../assets/wood-color.jpg';
import woodRoughUrl from '../assets/wood-rough.jpg';
import woodNormalUrl from '../assets/wood-normal.jpg';

export class CoinScene {
  constructor(container) {
    this.container = container;

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // 移动端降载：像素比上限 1.5
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap; // 方差阴影：大半径柔边（PCFSoft 无法模糊）
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // 场景与雾（深蓝紫暗场，远处渐隐）
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f0f23');
    this.scene.fog = new THREE.FogExp2('#0f0f23', 0.052);

    // 相机
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera.position.set(0, 4.9, 10.8);
    this.camera.lookAt(0, 1.1, 0);

    // 环境反射（金属材质必需）：RoomEnvironment → PMREM
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();

    this._buildLights();
    this._buildGround();
    this._buildRing();
    this._buildParticles();

    // 相机跟随状态：飞行时追踪硬币，静止后回位到「落点与画面中心的折中」
    this.camBase = new THREE.Vector3(0, 4.9, 10.8);
    this.restLook = new THREE.Vector3(0, 1.1, 0);
    this.lookCur = this.restLook.clone();
    this.camCur = this.camBase.clone();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.launchElapsed = 0;   // 起抛补间已播放时长
    this.launchActive = false;

    // —— 音画同步：渲染延迟补偿 ——
    // 声音按「现在」调度，最早也要 ctx.outputLatency 后才到达扬声器；把画面渲染
    // 「过去 renderDelay 秒」的状态，碰撞的声与画即落在同一时刻。
    this.simClock = 0;      // 与物理同步推进的模拟时钟（秒），main 每帧累加 dt
    this.renderDelay = 0;   // 当前渲染延迟（秒），main 按音频延迟动态计算
    this.coinHistory = [];  // 硬币变换样本环形历史 {t, p:Vector3, q:Quaternion}
    this.delayedPos = new THREE.Vector3(0, 0.06, 0);   // 延迟后的硬币位置（相机跟随用）
    this.delayedQuat = new THREE.Quaternion();
    this._tmpP = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();

    window.addEventListener('resize', () => this._onResize());
  }

  _buildLights() {
    // 主聚光：暖白舞台光，投影（收窄锥角强化「中心亮、四周暗」的舞台感）
    const spot = new THREE.SpotLight('#ffe0b0', 1000, 0, Math.PI / 5.5, 0.6, 1.9);
    spot.position.set(0, 12.5, 2.6);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512); // VSM 大模糊半径下 512 足够，减半阴影渲染负载
    spot.shadow.radius = 7; // VSM 柔化半径
    spot.shadow.blurSamples = 12;
    spot.shadow.bias = -0.0004;
    spot.shadow.camera.near = 4;
    spot.shadow.camera.far = 30;
    this.scene.add(spot, spot.target);
    this.spot = spot;

    // 冷色补光（蓝紫，塑造体积）
    const fill = new THREE.DirectionalLight('#7d8cff', 0.55);
    fill.position.set(-6, 6, -4);
    this.scene.add(fill);

    // 后方轮廓微光
    const rim = new THREE.PointLight('#5f6bff', 35, 30, 2);
    rim.position.set(0, 3.5, -7);
    this.scene.add(rim);

    // 低角度掠射侧光：移到桌外，从台面边缘外斜照进来（舞台侧幕灯），并投出第二道柔影
    const rake = new THREE.SpotLight('#fff2d9', 700, 0, Math.PI / 5, 0.85, 2);
    rake.position.set(-17, 4.5, 7.5);
    rake.target.position.set(0, 0.5, 0);
    rake.castShadow = true;
    rake.shadow.mapSize.set(512, 512);
    rake.shadow.radius = 12;
    rake.shadow.blurSamples = 14;
    rake.shadow.bias = -0.0006;
    rake.shadow.camera.near = 8;
    rake.shadow.camera.far = 45;
    this.scene.add(rake, rake.target);

    this.scene.add(new THREE.AmbientLight('#383b63', 0.55));
  }

  _buildGround() {
    // 木质台面：CC0 木材 PBR 贴图（Color + Roughness + NormalGL 平铺，各向异性过滤斜视清晰）
    const woodTex = (url, isColor) => {
      const t = new THREE.TextureLoader().load(url);
      if (isColor) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(4, 4);
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return t;
    };
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(14, 72).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: woodTex(woodColorUrl, true),
        roughnessMap: woodTex(woodRoughUrl, false),
        normalMap: woodTex(woodNormalUrl, false),
        normalScale: new THREE.Vector2(1.2, 1.2),
        color: new THREE.Color('#4a4150'), // 深紫棕 tint：加深桌面、拉开与银币的对比
        roughness: 0.8,
        metalness: 0.0,
        envMapIntensity: 0.18,
      })
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // 挂载 GLB 硬币视觉模型（异步加载完成后由 main 调用；物理同步沿用同一个组）
  setCoinVisual(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) o.material.side = THREE.DoubleSide; // 双面保险
      }
    });
    this.coinVisual = group;
    this.scene.add(group);
  }

  _buildRing() {
    // 结果标记光环（结算后出现在硬币落点）
    this.resultRing = new THREE.Mesh(
      new THREE.RingGeometry(1.18, 1.38, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#e8b54a',
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.resultRing.visible = false;
    this.scene.add(this.resultRing);
  }

  _buildParticles() {
    const N = 130;
    this.particleCount = N;
    this.particlePos = new Float32Array(N * 3);
    this.particleVel = [];
    this.particleLife = new Float32Array(N);
    for (let i = 0; i < N; i++) this.particleVel.push(new THREE.Vector3());

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePos, 3));
    this.particleMat = new THREE.PointsMaterial({
      color: '#ffd97a',
      size: 0.075,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geo, this.particleMat);
    this.particles.visible = false;
    this.particleElapsed = 0;
    this.particleDuration = 1.15;
    this.scene.add(this.particles);
  }

  // 每帧在 physics.update 之后调用：记录硬币的插值变换样本。
  // 用 cannon 的 interpolatedPosition/Quaternion（step 已按剩余时间插值），
  // 消除「整子步量化」——接触帧与碰撞事件帧严格对应，也是 120Hz+ 屏幕平滑的前提。
  pushCoinSample(body) {
    const ip = body.interpolatedPosition;
    const iq = body.interpolatedQuaternion;
    this.coinHistory.push({
      t: this.simClock,
      p: new THREE.Vector3(ip.x, ip.y, ip.z),
      q: new THREE.Quaternion(iq.x, iq.y, iq.z, iq.w),
    });
    // 只留 0.5s：足够覆盖最大补偿延迟（0.15s）加抖动余量
    const cutoff = this.simClock - 0.5;
    const h = this.coinHistory;
    while (h.length > 2 && h[0].t < cutoff) h.shift();
  }

  // 把硬币历史插值到 renderTime，结果写入 _tmpP/_tmpQ（applyCoinAt 与起抛动画共用）
  _coinStateAt(renderTime) {
    const h = this.coinHistory;
    if (h.length === 0) return false;
    let a;
    let b;
    if (renderTime <= h[0].t) {
      a = h[0];
      b = null;
    } else if (renderTime >= h[h.length - 1].t) {
      a = h[h.length - 1];
      b = null;
    } else {
      for (let i = h.length - 2; i >= 0; i--) {
        if (h[i].t <= renderTime) {
          a = h[i];
          b = h[i + 1];
          break;
        }
      }
    }
    if (b) {
      const k = (renderTime - a.t) / Math.max(1e-6, b.t - a.t);
      this._tmpP.lerpVectors(a.p, b.p, k);
      this._tmpQ.slerpQuaternions(a.q, b.q, k);
    } else {
      this._tmpP.copy(a.p);
      this._tmpQ.copy(a.q);
    }
    return true;
  }

  // 把视觉硬币设为 renderTime（= simClock - renderDelay）时刻的状态，
  // 并把该位置写入 delayedPos/delayedQuat 供相机跟随（GLB 未挂载时只更新跟随位置）。
  applyCoinAt(renderTime) {
    if (!this._coinStateAt(renderTime)) return;
    this.delayedPos.copy(this._tmpP);
    this.delayedQuat.copy(this._tmpQ);
    if (this.coinVisual) {
      this.coinVisual.position.copy(this._tmpP);
      this.coinVisual.quaternion.copy(this._tmpQ);
    }
  }

  showRingAt(pos) {
    this.resultRing.position.set(pos.x, 0.02, pos.z);
    this.resultRing.visible = true;
  }

  hideRing() {
    this.resultRing.visible = false;
  }

  // 起抛动画：把「本次抛掷的真实轨迹」提前渲染（不跟手对策）。
  // ic = 抛出瞬间的初始条件 { p:[3], v:[3], g:[3], q:[4], w:[3] }（throwCoin 之后立即采集）。
  // 两段式：
  //   抬手段：桌面静止位 → 真实飞行位姿（飞行时间 LAUNCH_LIFT 处），Hermite 位置 +
  //     世界系真实自旋全程积累（与 cannon 左乘积分一致）+ 一圈渐衰翻面，出口速率恰为真实 ω；
  //   飞行段：从真实变换历史按「提前的飞行时间」取样——包含真实碰撞/阻尼/积分细节，
  //     时间轴经高斯包络渐近汇入延迟画面，不重播、不跳变。
  // 纯视觉：不改物理/统计，dt 驱动可确定性回放。
  playLaunch(ic) {
    if (this.reducedMotion || !ic) return;
    const wLen = Math.hypot(ic.w[0], ic.w[1], ic.w[2]);
    const p0 = new THREE.Vector3(ic.p[0], ic.p[1], ic.p[2]);
    const v0 = new THREE.Vector3(ic.v[0], ic.v[1], ic.v[2]);
    const g = new THREE.Vector3(ic.g[0], ic.g[1], ic.g[2]);
    const delay = this.renderDelay;
    // 顶点飞行时间（vy 归零点），用于把收敛减速点藏进硬币的自然悬停里
    const fApex = THREE.MathUtils.clamp(ic.v[1] / Math.max(0.1, -ic.g[1]), 0.25, 0.9);
    const tau = launchTau(delay, fApex);
    this._launch = {
      s0: this.simClock,
      delay,
      tau,
      total: LAUNCH_LIFT + 2.8 * tau,
      q0: new THREE.Quaternion(ic.q[0], ic.q[1], ic.q[2], ic.q[3]).normalize(),
      axis: wLen > 1e-4 ? new THREE.Vector3(ic.w[0] / wLen, ic.w[1] / wLen, ic.w[2] / wLen) : new THREE.Vector3(0, 1, 0),
      wMag: wLen,
      restP: this.coinVisual ? this.coinVisual.position.clone() : this.delayedPos.clone(),
      restQ: this.coinVisual ? this.coinVisual.quaternion.clone() : new THREE.Quaternion(),
      va: v0.clone().multiplyScalar(0.45),
      pEnd: p0.clone().addScaledVector(v0, LAUNCH_LIFT).addScaledVector(g, 0.5 * LAUNCH_LIFT * LAUNCH_LIFT),
      vEnd: v0.clone().addScaledVector(g, LAUNCH_LIFT),
    };
    this.launchElapsed = 0;
    this.launchActive = true;
  }

  // 金色粒子迸发（结算庆祝）；edge = 立住彩蛋：冲天金柱，更高更久
  burst(pos, edge = false) {
    if (edge) this.particleDuration = 1.7;
    else this.particleDuration = 1.15;
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      this.particlePos[i3] = pos.x;
      this.particlePos[i3 + 1] = pos.y + (edge ? 0.5 : 0.15);
      this.particlePos[i3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      if (edge) {
        const r = Math.random() * 3.4;
        this.particleVel[i].set(Math.cos(a) * r * 0.8, 3.4 + Math.random() * 5.4, Math.sin(a) * r * 0.8);
      } else {
        const r = Math.random() * 2.4;
        this.particleVel[i].set(Math.cos(a) * r, 2.4 + Math.random() * 3.2, Math.sin(a) * r);
      }
      this.particleLife[i] = this.particleDuration * (0.6 + Math.random() * 0.4);
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particleElapsed = 0;
    this.particles.visible = true;
  }

  // 结果定格：把「回位注视点」设为落点与画面中心的折中，保证硬币与光环留在画面内
  setRestLook(pos) {
    this.restLook.set(pos.x * 0.6, 0.9, pos.z * 0.6);
  }

  // 相机跟随：飞行时平滑追踪「延迟渲染后的硬币」（与用户所见的声画位置一致），
  // 静止后缓慢回位
  followCoin(state, dt) {
    const tracking = state === 'flying';
    const blend = 1 - Math.exp(-(tracking ? 5 : 2.2) * dt);
    if (tracking) {
      const p = this.delayedPos;
      this.lookCur.lerp(new THREE.Vector3(p.x * 0.9, Math.max(0.4, p.y), p.z * 0.9), blend);
      if (!this.reducedMotion) {
        // 机位跟随硬币移动：水平跟走约一半行程（视差足够又不晕）、垂直随高度抬升，
        // 纵深保持默认距离（只平移不推拉）；硬币坠落时 clamp 保底不跟到桌面以下
        this.camCur.lerp(
          new THREE.Vector3(
            THREE.MathUtils.clamp(p.x * 0.55, -5, 5),
            this.camBase.y + THREE.MathUtils.clamp(p.y * 0.3, 0, 2.4),
            this.camBase.z
          ),
          blend
        );
      }
    } else {
      this.lookCur.lerp(this.restLook, blend);
      this.camCur.lerp(this.camBase, blend);
    }
    this.camera.position.copy(this.camCur);
    this.camera.lookAt(this.lookCur);
  }

  update(dt) {
    // 起抛动画（真实抛物线提前渲染）：主循环里 applyCoinAt 每帧重写硬币位姿之后再
    // 覆盖（render 前），不污染变换历史，也不影响相机跟随与碰撞声画对齐。
    if (this.launchActive) {
      this.launchElapsed += dt;
      const t = this.launchElapsed;
      const L = this._launch;
      if (!L || !this.coinVisual || t >= L.total) {
        this.launchActive = false;
      } else if (t < LAUNCH_LIFT) {
        // 抬手段：Hermite(rest→真实飞行位姿@LIFT) + 世界系真实自旋全程积累 + 渐衰整圈翻面
        // （自旋左乘=世界系，与 cannon 积分一致；出口翻面速率归零、只剩真实 ω，无卡顿）
        const u = t / LAUNCH_LIFT;
        const k = 1 - (1 - u) * (1 - u);
        const h00 = 2 * k * k * k - 3 * k * k + 1;
        const h10 = k * k * k - 2 * k * k + k;
        const h01 = -2 * k * k * k + 3 * k * k;
        const h11 = k * k * k - k * k;
        this.coinVisual.position.set(
          h00 * L.restP.x + h10 * LAUNCH_LIFT * L.va.x + h01 * L.pEnd.x + h11 * LAUNCH_LIFT * L.vEnd.x,
          h00 * L.restP.y + h10 * LAUNCH_LIFT * L.va.y + h01 * L.pEnd.y + h11 * LAUNCH_LIFT * L.vEnd.y,
          h00 * L.restP.z + h10 * LAUNCH_LIFT * L.va.z + h01 * L.pEnd.z + h11 * LAUNCH_LIFT * L.vEnd.z
        );
        _lq1.copy(L.restQ).slerp(L.q0, k);
        _lq2.setFromAxisAngle(L.axis, L.wMag * t + 2 * Math.PI * (1 - k));
        _lq2.multiply(_lq1); // 世界系自旋在左：与 cannon 的角速度积分方式一致
        this.coinVisual.quaternion.copy(_lq2);
      } else {
        // 飞行段：从真实变换历史按「提前的飞行时间」取样——包含真实碰撞/阻尼/积分细节，
        // 时间轴渐近汇入延迟画面，结束点与画面重合，无跳变
        const ft = launchFlightTime(t, L.delay, L.tau);
        if (this._coinStateAt(L.s0 + ft)) {
          this.coinVisual.position.copy(this._tmpP);
          this.coinVisual.quaternion.copy(this._tmpQ);
        }
      }
    }

    // 结果光环呼吸
    if (this.resultRing.visible) {
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.045;
      this.resultRing.scale.set(s, 1, s);
      this.resultRing.material.opacity = 0.72 + Math.sin(performance.now() * 0.004) * 0.18;
    }

    // 粒子推进
    if (this.particles.visible) {
      this.particleElapsed += dt;
      const k = this.particleElapsed / this.particleDuration;
      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        this.particleLife[i] -= dt;
        if (this.particleLife[i] <= 0) {
          this.particlePos[i3 + 1] = -50; // 移出视野
          continue;
        }
        this.particleVel[i].y -= 6.8 * dt;
        this.particlePos[i3] += this.particleVel[i].x * dt;
        this.particlePos[i3 + 1] += this.particleVel[i].y * dt;
        this.particlePos[i3 + 2] += this.particleVel[i].z * dt;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particleMat.opacity = Math.max(0, 1 - k);
      if (k >= 1) this.particles.visible = false;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // 同步重绘当前帧并导出 PNG 数据 URL（分享卡片背景用）。
  // 不开 preserveDrawingBuffer：在同一个任务里 render() 后立刻 toDataURL，
  // 绘制缓冲尚未被合成器清空，导出完整；比常开缓冲少一档性能开销。
  captureFrame() {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
