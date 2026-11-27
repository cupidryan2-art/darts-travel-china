/** 3D 场景：窗帘墙 + 地板 + 金属门形架 + 吊着的飞镖靶 + 原创小熊猫角色 + 飞镖模型 */
import * as THREE from 'three';
import { BOARD_CENTER, BOARD_DEPTH, BOARD_R, WALL_Z } from './physics';

const metal = () => new THREE.MeshStandardMaterial({ color: 0xc3c7cc, metalness: 0.85, roughness: 0.3 });
const HANG_Y = 3.32; // 横梁高度（也是靶子摆动的支点）

export function createRoom(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x221c27);
  scene.fog = new THREE.Fog(0x221c27, 9, 18);

  // 窗帘墙：竖向褶皱
  const wallGeo = new THREE.PlaneGeometry(16, 9, 320, 1);
  const pos = wallGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin(x * 5.2) * 0.07 + Math.sin(x * 2.3 + 1) * 0.04);
  }
  wallGeo.computeVertexNormals();
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0x3b2c44, roughness: 0.95 }));
  wall.position.set(0, 4.5, WALL_Z - 0.1);
  wall.receiveShadow = true;
  scene.add(wall);

  // 浅灰地板
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0xc9c8cc, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // 墙脚线
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0x9d9aa3 }));
  skirting.position.set(0, 0.06, WALL_Z + 0.02);
  scene.add(skirting);

  // 灯光
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x5a4f62, 1.1));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(-2.2, 5.5, 5.5);
  key.target.position.set(0, 2, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 1, far: 16 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key, key.target);
  const spot = new THREE.SpotLight(0xffe2b8, 30, 12, 0.55, 0.7, 1.2);
  spot.position.set(0, 6.5, 2.8);
  spot.target.position.set(0, 2, 0);
  scene.add(spot, spot.target);
}

/** 金属门形架；返回挂靶子的支点 */
export function createStand(scene: THREE.Scene) {
  const m = metal();
  const W = 1.3, r = 0.035;
  for (const x of [-W, W]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r, HANG_Y, 24), m);
    post.position.set(x, HANG_Y / 2, 0);
    post.castShadow = true;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.9, 16), m);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(x, r, 0);
    foot.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.3, 16, 12), m);
    cap.position.set(x, HANG_Y, 0);
    scene.add(post, foot, cap);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, W * 2, 24), m);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, HANG_Y, 0);
  bar.castShadow = true;
  scene.add(bar);

  const pivot = new THREE.Group();
  pivot.position.set(0, HANG_Y, BOARD_CENTER.z);
  scene.add(pivot);
  return pivot;
}

/** 靶子（挂在 pivot 下面）；返回靶子组（局部原点 = 靶心）和靶面 mesh */
export function createBoard(pivot: THREE.Group, texture: THREE.Texture) {
  const board = new THREE.Group();
  board.position.set(BOARD_CENTER.x, BOARD_CENTER.y - HANG_Y, 0);
  pivot.add(board);

  const rimMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(BOARD_R * 1.04, BOARD_R * 1.04, BOARD_DEPTH, 128), rimMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  board.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BOARD_R * 1.03, 0.02, 12, 128), metal());
  rim.position.z = BOARD_DEPTH / 2;
  board.add(rim);

  texture.anisotropy = 8;
  const face = new THREE.Mesh(new THREE.CircleGeometry(BOARD_R, 128), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 }));
  face.position.z = BOARD_DEPTH / 2 + 0.001;
  face.receiveShadow = true;
  board.add(face);

  // 两根细吊线
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 });
  const topY = BOARD_CENTER.y - HANG_Y; // 靶心在 pivot 下方的距离（负数）
  for (const x of [-0.42, 0.42]) {
    const yOnRim = topY + Math.sqrt(BOARD_R ** 2 - x * x) * 1.02;
    const len = -yOnRim;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, len, 6), lineMat);
    line.position.set(x, yOnRim / 2, -0.01);
    line.castShadow = true;
    pivot.add(line);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 16), metal());
    hook.position.set(x, -0.01, 0);
    pivot.add(hook);
  }
  return { board, face };
}

/** 飞镖：针尖朝 +Z（方便用 lookAt 对准飞行方向），总长约 0.44 */
export function createDart() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xe3e6ea, metalness: 0.95, roughness: 0.2 });
  const tungsten = new THREE.MeshStandardMaterial({ color: 0x4b4f55, metalness: 0.8, roughness: 0.35 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe0262c, roughness: 0.45 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2;
    m.position.z = z;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.ConeGeometry(0.008, 0.09, 12), steel, 0.175); // 针尖（cone 默认尖朝 +Y → 旋转后朝 +Z）
  add(new THREE.CylinderGeometry(0.019, 0.016, 0.1, 20), tungsten, 0.08);
  for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.0185, 0.0025, 6, 20), tungsten, 0.045 + i * 0.022).rotation.x = 0;
  add(new THREE.CylinderGeometry(0.009, 0.011, 0.13, 12), red, -0.035);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(0.06, 0.03); shape.lineTo(0.066, 0.12); shape.lineTo(0, 0.11); shape.closePath();
  const flightGeo = new THREE.ShapeGeometry(shape);
  const flightMat = new THREE.MeshStandardMaterial({ color: 0xff3036, roughness: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(flightGeo, flightMat);
    // Shape 在 XY 平面，沿 Y 是长度方向 → 让 Y 对齐 -Z
    const holder = new THREE.Group();
    f.rotation.x = Math.PI / 2;
    f.position.z = -0.1;
    f.scale.y = -1;
    holder.add(f);
    holder.rotation.z = (i * Math.PI) / 2;
    f.castShadow = true;
    g.add(holder);
  }
  g.position.set(0, 0, 0);
  return g;
}
export const DART_TIP = 0.22; // 针尖到原点的距离

/** 原创小熊猫：红棕色毛 + 白色眉斑和口鼻 + 深色四肢 + 环纹大尾巴，右手举着红色飞镖 */
export function createRedPanda() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const M = (c: number, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const rust = M(0xc85a2a), dark = M(0x3a1d16), white = M(0xfff7ee), cream = M(0xf1c9a0), black = M(0x141012, 0.4), pink = M(0xf59a94);
  const ball = (r: number, mat: THREE.Material, x: number, y: number, z: number, s: [number, number, number] = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat);
    m.position.set(x, y, z);
    m.scale.set(...s);
    m.castShadow = true;
    return m;
  };

  // 尾巴：一串环纹球，向身后左侧卷起
  const tail = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const seg = ball(0.1 - t * 0.02, i % 2 ? cream : rust, -0.15 - Math.sin(t * 2.2) * 0.25, 0.12 + t * 0.45, -0.18 - Math.cos(t * 2) * 0.05);
    tail.add(seg);
  }
  body.add(tail);

  // 身体（肚子深色）
  body.add(ball(0.24, rust, 0, 0.3, 0, [1, 1.15, 0.9]));
  body.add(ball(0.17, dark, 0, 0.26, 0.1, [1, 1.1, 0.7]));
  // 腿
  for (const x of [-0.12, 0.12]) body.add(ball(0.085, dark, x, 0.06, 0.06, [1, 0.9, 1.2]));

  // 头
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0.02);
  body.add(head);
  head.add(ball(0.24, rust, 0, 0, 0, [1.12, 0.95, 0.95]));
  head.add(ball(0.11, white, 0, -0.07, 0.17, [1.3, 0.85, 0.8])); // 口鼻
  head.add(ball(0.028, black, 0, -0.035, 0.26)); // 鼻子
  for (const s of [-1, 1]) {
    head.add(ball(0.05, white, s * 0.09, 0.09, 0.19, [1.2, 0.8, 0.5])); // 眉斑
    head.add(ball(0.075, white, s * 0.17, -0.06, 0.13, [0.9, 1, 0.6])); // 腮
    head.add(ball(0.035, black, s * 0.085, 0.02, 0.215)); // 眼睛
    head.add(ball(0.011, white, s * 0.078, 0.034, 0.245)); // 高光
    head.add(ball(0.03, pink, s * 0.15, -0.09, 0.19, [1, 0.6, 0.4])); // 腮红
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.13, 20), rust);
    ear.position.set(s * 0.17, 0.2, -0.02);
    ear.rotation.z = -s * 0.45;
    ear.castShadow = true;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 16), white);
    inner.position.set(0, -0.015, 0.03);
    ear.add(inner);
    head.add(ear);
  }
  // 嘴（小微笑）
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 16, Math.PI), black);
  smile.position.set(0, -0.085, 0.255);
  smile.rotation.z = Math.PI;
  head.add(smile);

  // 左臂（垂着）
  const armL = ball(0.06, dark, -0.21, 0.35, 0.08, [1, 1.8, 1]);
  armL.rotation.z = -0.3;
  body.add(armL);
  // 右臂（举起，手里拿飞镖）
  const armR = new THREE.Group();
  armR.position.set(0.2, 0.45, 0.02);
  const upper = ball(0.06, dark, 0, 0.12, 0, [1, 2.2, 1]);
  armR.add(upper);
  const paw = ball(0.065, dark, 0, 0.26, 0);
  armR.add(paw);
  armR.rotation.z = -0.35;
  body.add(armR);
  const hand = new THREE.Group(); // 飞镖挂点
  hand.position.set(0, 0.27, 0.02);
  armR.add(hand);

  return { root, body, head, armR, tail, hand };
}

export type Panda = ReturnType<typeof createRedPanda>;
