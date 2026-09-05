// physics.js — cannon-es 物理世界：硬币刚体、有限圆盘台面、抛掷与结果判定
// 单位约定：1 单位 ≈ 1 米，重力取真实值。
import * as CANNON from 'cannon-es';

export const COIN = {
  radius: 1,
  thickness: 0.12,
  mass: 8,
};

export const ARENA = {
  tableRadius: 14, // 台面半径（与视觉一致）：滚出边缘即真实掉落，无隐形围墙
};

// 三档力度参数：向上初速 / 翻转角速度（rad/s）
const POWER_PROFILES = [
  { vy: [6.0, 7.5], spin: [9, 14] },   // 轻抛
  { vy: [7.5, 9.0], spin: [14, 22] },  // 正常
  { vy: [9.0, 10.4], spin: [22, 28] }, // 大力
];

const rand = (a, b) => a + Math.random() * (b - a);

export class CoinPhysics {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    this._buildMaterials();
    this._buildGround();
    this._buildCoin();

    this.state = 'idle'; // idle | flying | settled
    this.stillTimer = 0;
    this.airTime = 0;
    this.onSettle = null;  // (face: 'heads' | 'tails') => void
    this.onImpact = null;  // (intensity: 0~1) => void
    this.onDrop = null;    // () => void：硬币滚出台面边缘
    this._lastImpactAt = 0;
    this.coinBody.addEventListener('collide', (e) => this._handleCollide(e));
  }

  _buildMaterials() {
    this.coinMaterial = new CANNON.Material('coin');
    this.groundMaterial = new CANNON.Material('ground');
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.coinMaterial, this.groundMaterial, {
        friction: 0.38,
        restitution: 0.42,
      })
    );
    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.3;
  }

  _buildGround() {
    // 有限圆盘台面（半径与视觉一致，顶面 y=0）：真实桌沿——滚出边缘即掉落
    const slab = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Cylinder(ARENA.tableRadius, ARENA.tableRadius, 1, 32),
      material: this.groundMaterial,
    });
    slab.position.set(0, -0.5, 0);
    this.world.addBody(slab);
  }

  _buildCoin() {
    const shape = new CANNON.Cylinder(COIN.radius, COIN.radius, COIN.thickness, 28);
    this.coinBody = new CANNON.Body({
      mass: COIN.mass,
      shape,
      material: this.coinMaterial,
      position: new CANNON.Vec3(0, 1.5, 0),
      linearDamping: 0.01,
      angularDamping: 0.08,
    });
    this.coinBody.allowSleep = true;
    this.coinBody.sleepSpeedLimit = 0.4;
    this.coinBody.sleepTimeLimit = 0.6;
    // 初始平躺静止于台面中央（开局不乱动，第一次抛掷时随机化姿态）
    this.coinBody.position.set(0, COIN.thickness / 2 + 0.001, 0);
    this.world.addBody(this.coinBody);
  }

  // 触发一次抛掷；power: 0 轻 / 1 正常 / 2 大力
  throwCoin(power = 1) {
    const profile = POWER_PROFILES[Math.max(0, Math.min(2, power))];
    const body = this.coinBody;

    body.wakeUp();
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.position.set(rand(-0.6, 0.6), 1.45, rand(-0.6, 0.6));
    // 随机初始姿态：Shoemake 均匀四元数采样（随机欧拉角在 SO(3) 上不均匀，
    // 长期统计会引入姿态分布偏置，进而造成正/反判定系统性偏向）
    const u1 = Math.random();
    const u2 = Math.random() * Math.PI * 2;
    const u3 = Math.random() * Math.PI * 2;
    const s1 = Math.sqrt(1 - u1);
    const s2 = Math.sqrt(u1);
    body.quaternion.set(s1 * Math.sin(u2), s1 * Math.cos(u2), s2 * Math.sin(u3), s2 * Math.cos(u3));

    const vx = rand(-1, 1) * (1.0 + power * 0.7);
    const vz = rand(-1, 1) * (1.0 + power * 0.7);
    body.velocity.set(vx, rand(profile.vy[0], profile.vy[1]), vz);

    // 主翻转轴：随机水平方向（真实抛掷的 tumbling），叠加小幅扰动；
    // 翻转方向正负随机——恒定单方向会让角动量与落地映射产生弱相关，长期偏向某一面
    const a = rand(0, Math.PI * 2);
    const spin = rand(profile.spin[0], profile.spin[1]) * (Math.random() < 0.5 ? -1 : 1);
    body.angularVelocity.set(
      Math.cos(a) * spin + rand(-2, 2),
      rand(-2, 2),
      Math.sin(a) * spin + rand(-2, 2)
    );

    this.state = 'flying';
    this.stillTimer = 0;
    this.airTime = 0;
  }

  _handleCollide(e) {
    if (this.state !== 'flying') return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 1.0) return;
    // 声音节流基于物理模拟时间（墙钟在无头/后台标签下不可靠）
    if (this.airTime - this._lastImpactAt < 0.08) return;
    this._lastImpactAt = this.airTime;
    if (this.onImpact) this.onImpact(Math.min(1, v / 9));
  }

  // 判定正面/反面：硬币局部 +Y（圆柱轴）与世界 up 的点积
  _readFace() {
    const axis = this.coinBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    return axis.y;
  }

  update(dt) {
    this.world.step(1 / 120, dt, 10);
    if (this.state !== 'flying') return;

    this.airTime += dt;
    const b = this.coinBody;

    // 掉出台面边缘：重置到中心待重抛（不计入统计）
    if (b.position.y < -2) {
      this._handleDrop();
      return;
    }

    // 台面阻力：只在真正接触台面时施加（空中零衰减！）
    // cannon-es 不建模滚动摩擦，接触期间按姿态分两档衰减：
    if (this.world.contacts.some((c) => c.bi === this.coinBody || c.bj === this.coinBody)) {
      if (b.position.y < 0.35) {
        // 平躺/浅斜滚动：呢面滚阻（无此项硬币会近恒速滚出桌沿）
        const damp = Math.exp(-1.4 * dt);
        b.velocity.x *= damp;
        b.velocity.z *= damp;
        b.angularVelocity.x *= damp;
        b.angularVelocity.z *= damp;
      } else {
        // 立姿/深斜滚动（像轮子）：增强衰减快速歪倒，避免长尾立滚
        const spinDamp = Math.exp(-3.0 * dt);
        b.angularVelocity.x *= spinDamp;
        b.angularVelocity.z *= spinDamp;
        const rollDamp = Math.exp(-1.2 * dt);
        b.velocity.x *= rollDamp;
        b.velocity.z *= rollDamp;
      }
    }

    const slow =
      b.velocity.lengthSquared() < 0.03 &&
      b.angularVelocity.lengthSquared() < 0.06 &&
      b.position.y < 1.3;
    const asleep = b.sleepState === CANNON.Body.SLEEPING;

    if (slow || asleep) {
      this.stillTimer += dt;
    } else {
      this.stillTimer = 0;
    }

    // 超时保护：极端情况下 14s 强制结算
    if (this.airTime > 14) {
      this._settle();
      return;
    }

    if (this.stillTimer > 0.45 || asleep) {
      const dot = this._readFace();
      if (Math.abs(dot) < 0.55) {
        // 极罕见：斜靠/侧立，施加微扰让它倒下后继续等
        b.wakeUp();
        b.applyImpulse(new CANNON.Vec3(rand(-1, 1), 0, rand(-1, 1)).scale(2.5 * COIN.mass * 0.05));
        b.angularVelocity.x += rand(-3, 3);
        b.angularVelocity.z += rand(-3, 3);
        this.stillTimer = 0;
        return;
      }
      this._settle();
    }
  }

  _settle() {
    this.state = 'settled';
    const dot = this._readFace();
    const face = dot > 0 ? 'heads' : 'tails';
    if (this.onSettle) this.onSettle(face);
  }

  // 硬币滚出台面掉落：摆回中心平躺，等待下一次抛掷
  _handleDrop() {
    const b = this.coinBody;
    b.velocity.setZero();
    b.angularVelocity.setZero();
    b.position.set(0, COIN.thickness / 2 + 0.001, 0);
    b.quaternion.set(0, 0, 0, 1);
    this.state = 'idle';
    this.stillTimer = 0;
    if (this.onDrop) this.onDrop();
  }
}
