/**
 * 自测：已知经纬度 → 靶面上的 3D 点 → (射线/抛物线 与靶面求交) → 靶面坐标 → 经纬度 → 城市
 * 运行：npm run test:hit
 */
import { readFile } from 'node:fs/promises';
import { Plane, Ray, Vector3 } from 'three';
import { buildWorld, judge, lonLatToBoard } from '../src/mapping';
import { BOARD_CENTER, BOARD_R, FACE_Z, planTrajectory, positionAt, crossTime, worldToBoard } from '../src/physics';

const CASES: [string, number, number, string, boolean?][] = [
  ['杭州', 120.155, 30.274, '杭州市'],
  ['乌鲁木齐', 87.617, 43.826, '乌鲁木齐市'],
  ['拉萨', 91.117, 29.647, '拉萨市'],
  ['海口', 110.33, 20.022, '海口市'],
  ['哈尔滨', 126.535, 45.803, '哈尔滨市'],
  ['北京', 116.407, 39.904, '北京市'],
  ['上海', 121.473, 31.23, '上海市'],
  ['广州', 113.264, 23.129, '广州市'],
  ['成都', 104.066, 30.572, '成都市'],
  ['西安', 108.94, 34.341, '西安市'],
  ['昆明', 102.833, 24.88, '昆明市'],
  ['呼和浩特', 111.749, 40.842, '呼和浩特市'],
  ['兰州', 103.834, 36.061, '兰州市'],
  ['湖州', 120.086, 30.894, '湖州市'],
  ['台北', 121.565, 25.033, '台湾省'],
  ['香港', 114.17, 22.32, '香港特别行政区'],
  ['仙桃', 113.454, 30.364, '仙桃市'],
  ['喀什', 75.99, 39.47, '喀什地区'],
  ['三亚', 109.512, 18.253, '三亚市'],
  ['永兴岛(插图)', 112.336, 16.833, '三沙市', true],
  ['东海', 125, 30, '海'],
  ['乌兰巴托(国外)', 106.9, 47.9, '海'],
];

const topo = JSON.parse(await readFile(new URL('../public/china-cities.topo.json', import.meta.url), 'utf8'));
const w = buildWorld(topo);
const camera = new Vector3(0, 1.75, 5.2);
const hand = new Vector3(0.45, 0.9, 3.0);
const face = new Plane(new Vector3(0, 0, 1), -FACE_Z);

let fail = 0;
const label = (r: ReturnType<typeof judge>) => (r.kind === 'city' ? r.city.properties.name : r.kind === 'sea' ? '海' : r.kind);
for (const [n, lon, lat, want, inset] of CASES) {
  const [bx, by] = lonLatToBoard(w, lon, lat, inset);
  const world = new Vector3(BOARD_CENTER.x + bx * BOARD_R, BOARD_CENTER.y + by * BOARD_R, FACE_Z);
  // ① 相机射线与靶面平面求交
  const hit = new Ray(camera, world.clone().sub(camera).normalize()).intersectPlane(face, new Vector3())!;
  const a = label(judge(w, ...worldToBoard(hit)));
  // ② 抛物线飞镖与靶面平面求交
  const tr = planTrajectory(hand, bx, by);
  const p = positionAt(tr, crossTime(tr, FACE_Z));
  const b = label(judge(w, ...worldToBoard(p)));
  const ok = a === want && b === want;
  if (!ok) fail++;
  console.log(`${ok ? '✅' : '❌'} ${n.padEnd(10, '　')} (${lon}, ${lat}) → 靶面(${bx.toFixed(3)}, ${by.toFixed(3)}) → 射线:${a} / 飞镖:${b}  期望:${want}`);
}
// 环与脱靶
const ring = judge(w, 0, 0.8).kind, miss = judge(w, 0, 1.2).kind;
console.log(`${ring === 'ring' ? '✅' : '❌'} 数字环 (0,0.8) → ${ring}`);
console.log(`${miss === 'miss' ? '✅' : '❌'} 脱靶 (0,1.2) → ${miss}`);
if (ring !== 'ring' || miss !== 'miss') fail++;
console.log(fail ? `\n${fail} 项失败` : `\n全部通过（${CASES.length + 2} 项）`);
process.exit(fail ? 1 : 0);
