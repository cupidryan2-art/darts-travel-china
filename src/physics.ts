/**
 * 投掷：手势 → 瞄准点 → 抛物线。纯数学（three 的 Vector3 在 Node 里也能用）。
 */
import { Vector3 } from 'three';

/** 世界布局 */
export const BOARD_R = 0.9; // 靶半径（米）
export const BOARD_CENTER = new Vector3(0, 2.0, 0);
export const BOARD_DEPTH = 0.08;
export const FACE_Z = BOARD_CENTER.z + BOARD_DEPTH / 2 + 0.001; // 靶面所在平面
export const WALL_Z = -1.6;
export const GRAVITY = new Vector3(0, -6, 0);

export type Difficulty = 'easy' | 'normal' | 'hard';
export const SHAKE: Record<Difficulty, { aim: number; power: number }> = {
  easy: { aim: 0.015, power: 0.015 },
  normal: { aim: 0.04, power: 0.035 },
  hard: { aim: 0.085, power: 0.07 },
};

export interface Swipe {
  /** 总位移（像素，y 向下为正） */
  dx: number;
  dy: number;
  /** 松手前一小段时间的速度（像素/秒，向上为正） */
  upSpeed: number;
  /** 屏幕高度（像素），用来归一化 */
  screenH: number;
}

/**
 * 力度：1 ≈ 靶心高度；< 0.375 落到靶下方；> 1.625 飞过靶顶。
 * 手机竖屏实测：轻滑(~90px) ≈ 0.7 → 下半部分；中等(~220px) ≈ 1；用力(~340px 快速) ≈ 1.4 → 上半部分
 */
export function swipePower(s: Swipe) {
  const L = -s.dy / s.screenH;
  const v = s.upSpeed / s.screenH;
  const raw = Math.max(0, 0.45 * (L / 0.3) + 0.55 * (v / 2.5));
  // raw≈0.67 对准靶心；往下灵敏、往上平缓一些，方便控制落在上半部分而不是直接飞出去
  const mid = 0.67;
  return raw < mid ? 1 - 0.75 * (mid - raw) : 1 + 0.45 * (raw - mid);
}

/** 左右偏角（弧度），夹在 ±45° */
export function swipeAngle(s: Swipe) {
  const a = Math.atan2(s.dx, -s.dy);
  return Math.max(-Math.PI / 4, Math.min(Math.PI / 4, a));
}

export function gauss(rand = Math.random) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** 无手抖时，手势对应的靶面坐标（单位：靶半径） */
export function aimFromSwipe(s: Swipe): [number, number] {
  const p = swipePower(s);
  return [Math.sin(swipeAngle(s)) * 1.5, (p - 1) * 1.6];
}

export interface Trajectory {
  start: Vector3;
  v0: Vector3;
  /** 到达靶面平面的时间 */
  tFace: number;
  /** 在靶面平面上的落点（靶面坐标） */
  board: [number, number];
}

/** 从出手点 start 出发，在 tFace 秒后恰好穿过靶面平面上的 (bx,by) */
export function planTrajectory(start: Vector3, bx: number, by: number, power = 1): Trajectory {
  const target = new Vector3(BOARD_CENTER.x + bx * BOARD_R, BOARD_CENTER.y + by * BOARD_R, FACE_Z);
  const tFace = Math.max(0.38, Math.min(0.65, 0.52 - 0.1 * (power - 1)));
  // target = start + v0 t + ½ g t²  →  v0 = (target - start - ½ g t²) / t
  const v0 = target.clone().sub(start).addScaledVector(GRAVITY, -0.5 * tFace * tFace).divideScalar(tFace);
  return { start: start.clone(), v0, tFace, board: [bx, by] };
}

export function positionAt(tr: Trajectory, t: number, out = new Vector3()) {
  return out.copy(tr.start).addScaledVector(tr.v0, t).addScaledVector(GRAVITY, 0.5 * t * t);
}
export function velocityAt(tr: Trajectory, t: number, out = new Vector3()) {
  return out.copy(tr.v0).addScaledVector(GRAVITY, t);
}

/** 世界坐标 → 靶面坐标 */
export function worldToBoard(p: Vector3): [number, number] {
  return [(p.x - BOARD_CENTER.x) / BOARD_R, (p.y - BOARD_CENTER.y) / BOARD_R];
}

/** 沿抛物线找与平面 z=zPlane 的交点时间（数值求解，供测试独立验证） */
export function crossTime(tr: Trajectory, zPlane: number) {
  // z(t) 是线性的（重力只在 y）
  return (zPlane - tr.start.z) / tr.v0.z;
}

/** 脱靶后：继续飞，直到撞墙或落地，返回停下的时间 */
export function stopTime(tr: Trajectory) {
  const tWall = crossTime(tr, WALL_Z);
  // y(t)=0：½g t² + v0y t + y0 = 0
  const a = 0.5 * GRAVITY.y, b = tr.v0.y, c = tr.start.y - 0.02;
  const disc = b * b - 4 * a * c;
  const tFloor = disc >= 0 ? (-b - Math.sqrt(disc)) / (2 * a) : Infinity;
  return Math.min(tWall, tFloor > 0 ? tFloor : Infinity);
}
