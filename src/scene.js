// scene.js — three.js 渲染：暗场舞台、聚光灯、金币模型、结果光环、金色粒子
// 风格来源：ui-ux-pro-max 数据库 3d-and-hyperrealism × Theater/Cinema「Dramatic dark + spotlight gold」
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import woodColorUrl from '../assets/wood-color.jpg';
import woodRoughUrl from '../assets/wood-rough.jpg';
import woodNormalUrl from '../assets/wood-normal.jpg';

export class CoinScene {
  constructor(container) {
    this.container = container;

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    window.addEventListener('resize', () => this._onResize());
  }

  _buildLights() {
    // 主聚光：暖白舞台光，投影（收窄锥角强化「中心亮、四周暗」的舞台感）
    const spot = new THREE.SpotLight('#ffe0b0', 1000, 0, Math.PI / 5.5, 0.6, 1.9);
    spot.position.set(0, 12.5, 2.6);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
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
    rake.shadow.mapSize.set(1024, 1024);
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

  // 物理同步（GLB 视觉模型未挂载前跳过）
  syncCoin(body) {
    if (!this.coinVisual) return;
    this.coinVisual.position.copy(body.position);
    this.coinVisual.quaternion.copy(body.quaternion);
  }

  showRingAt(pos) {
    this.resultRing.position.set(pos.x, 0.02, pos.z);
    this.resultRing.visible = true;
  }

  hideRing() {
    this.resultRing.visible = false;
  }

  // 金色粒子迸发（结算庆祝）
  burst(pos) {
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      this.particlePos[i3] = pos.x;
      this.particlePos[i3 + 1] = pos.y + 0.15;
      this.particlePos[i3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.4;
      this.particleVel[i].set(Math.cos(a) * r, 2.4 + Math.random() * 3.2, Math.sin(a) * r);
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

  // 相机跟随：飞行时平滑追踪（看向点全跟随 + 机位小比例限幅跟随），静止后缓慢回位
  followCoin(body, state, dt) {
    const tracking = state === 'flying';
    const blend = 1 - Math.exp(-(tracking ? 5 : 2.2) * dt);
    if (tracking) {
      const p = body.position;
      this.lookCur.lerp(new THREE.Vector3(p.x * 0.9, Math.max(0.4, p.y), p.z * 0.9), blend);
      if (!this.reducedMotion) {
        this.camCur.lerp(
          new THREE.Vector3(
            THREE.MathUtils.clamp(p.x * 0.18, -1.6, 1.6),
            this.camBase.y + THREE.MathUtils.clamp(p.y * 0.22, 0, 2.2),
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

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
