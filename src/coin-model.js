// coin-model.js — GLB 硬币视觉模型：加载（贴图内嵌）、轴向对齐、尺寸归一（对齐物理圆柱 COIN）
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { COIN } from './physics.js';
import coinGlbUrl from '../assets/coin.glb';

function dataUrlToArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function createCoinVisual() {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      dataUrlToArrayBuffer(coinGlbUrl),
      '',
      (gltf) => {
        try {
          const model = gltf.scene;
          model.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach((m) => {
                m.side = THREE.DoubleSide; // 双面保险
                // 质感增强：做旧币 roughness 偏高导致反射模糊，收紧后高光对比恢复立体感
                if (typeof m.roughness === 'number') m.roughness = Math.min(m.roughness, 0.42);
                m.envMapIntensity = 0.6;
                if (m.normalScale) m.normalScale.setScalar(1.8); // 放大雕刻凹凸响应
              });
            }
          });

          // 厚度轴（原始尺寸最小的轴）判定 + 本地轴缩放（直径轴→COIN 直径、厚轴→COIN 厚度）
          // 注意 three 变换顺序为 T·R·S：缩放作用于本地轴，中心补偿需经过 R·S，
          // 否则旋转与缩放比例错位（此前椭圆 bug 的根因）
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const dims = [size.x, size.y, size.z];
          const thickIdx = dims.indexOf(Math.min(size.x, size.y, size.z));
          const s = dims.map((d, i) => (i === thickIdx ? COIN.thickness / d : (COIN.radius * 2) / d));

          if (thickIdx === 0) model.rotation.z = Math.PI / 2; // 本地 x→世界 y
          else if (thickIdx === 2) model.rotation.x = -Math.PI / 2; // 本地 z→世界 y
          model.scale.set(s[0], s[1], s[2]);
          const offset = new THREE.Vector3(center.x * s[0], center.y * s[1], center.z * s[2]);
          offset.applyEuler(model.rotation);
          model.position.copy(offset.negate());

          const group = new THREE.Group();
          group.add(model);
          resolve(group);
        } catch (e) {
          reject(e);
        }
      },
      reject
    );
  });
}
