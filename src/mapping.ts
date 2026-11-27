/**
 * 靶面坐标 ⇄ 经纬度 ⇄ 城市。纯计算，无 DOM 依赖（Node 测试脚本也用它）。
 *
 * 坐标约定：
 *  - 「靶面坐标」(bx, by)：以靶心为原点、靶半径为 1，x 向右、y 向上。
 *  - 「贴图像素」(px, py)：边长 TEX 的 Canvas，y 向下。
 * 投影直接定义在贴图像素空间上；画贴图和命中判定共用同一组投影对象，
 * 保证「看到扎在哪」与「判定成哪」完全一致。
 */
import { geoBounds, geoConicEqualArea, geoContains, type GeoProjection } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, MultiLineString, Polygon, MultiPolygon, Position } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';

export const TEX = 2048;
export const SANSHA = 460300;
/** 地图圆盘半径（靶面坐标） */
export const R_MAP = 0.66;
/** 主图拟合框（靶面坐标）[x0, y0, x1, y1] */
export const MAIN_BOX = [-0.6, -0.32, 0.44, 0.52] as const;
/** 南海诸岛插图框（靶面坐标）[x0, y0, x1, y1] */
export const INSET_BOX = [0.25, -0.5, 0.45, -0.26] as const;

export interface CityProps {
  adcode: number;
  name: string;
  province: string;
}
export type CityFeature = Feature<Polygon | MultiPolygon, CityProps>;

export const toPx = (bx: number, by: number): [number, number] => [((bx + 1) / 2) * TEX, ((1 - by) / 2) * TEX];
export const fromPx = (px: number, py: number): [number, number] => [(px / TEX) * 2 - 1, 1 - (py / TEX) * 2];

// ---------- 环绕方向修正：d3 要求外环顺时针 ----------
function ringArea(r: Position[]) {
  let s = 0;
  for (let i = 0, n = r.length - 1; i < n; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return s / 2; // >0 为逆时针（经纬度平面，y 向上）
}
function fixPolygon(rings: Position[][]) {
  rings.forEach((r, i) => {
    const ccw = ringArea(r) > 0;
    if ((i === 0 && ccw) || (i > 0 && !ccw)) r.reverse();
  });
}
export function rewind<T extends Feature>(f: T): T {
  const g = f.geometry as Polygon | MultiPolygon;
  if (g?.type === 'Polygon') fixPolygon(g.coordinates);
  else if (g?.type === 'MultiPolygon') g.coordinates.forEach(fixPolygon);
  return f;
}

export interface GeoWorld {
  topo: Topology;
  cities: CityFeature[];
  byAdcode: Map<number, CityFeature>;
  bounds: [[number, number], [number, number]][];
  mainProj: GeoProjection;
  insetProj: GeoProjection;
  cityMesh: MultiLineString;
  provinceMesh: MultiLineString;
  coastMesh: MultiLineString;
  coastMeshMain: MultiLineString;
  dash: FeatureCollection;
}

export function buildWorld(topo: Topology): GeoWorld {
  const obj = topo.objects.cities as GeometryCollection<CityProps>;
  const fc = feature(topo, obj) as unknown as FeatureCollection<Polygon | MultiPolygon, CityProps>;
  const cities = fc.features.map(rewind);
  const byAdcode = new Map(cities.map((c) => [c.properties.adcode, c]));
  const bounds = cities.map((c) => geoBounds(c));

  // 主图：去掉三沙（南海诸岛放插图），拟合到 MAIN_BOX
  const mainland: FeatureCollection = { type: 'FeatureCollection', features: cities.filter((c) => c.properties.adcode !== SANSHA) };
  const [x0, y0, x1, y1] = MAIN_BOX;
  const mainProj = geoConicEqualArea().parallels([25, 47]).rotate([-105, 0]).fitExtent([toPx(x0, y1), toPx(x1, y0)], mainland);

  // 插图：同一种投影，覆盖南海（含九段线），拟合到 INSET_BOX
  const [ix0, iy0, ix1, iy1] = INSET_BOX;
  const pad = 14;
  const [ipx0, ipy0] = toPx(ix0, iy1);
  const [ipx1, ipy1] = toPx(ix1, iy0);
  const insetArea = { type: 'MultiPoint', coordinates: [[107, 3], [122, 3], [107, 24], [122, 24], [114.5, 24.5], [114.5, 3]] } as const;
  const insetProj = geoConicEqualArea().parallels([25, 47]).rotate([-105, 0]).fitExtent([[ipx0 + pad, ipy0 + pad], [ipx1 - pad, ipy1 - pad]], insetArea as any);

  const cityMesh = mesh(topo, obj, (a, b) => a !== b && (a.properties as CityProps).province === (b.properties as CityProps).province);
  const provinceMesh = mesh(topo, obj, (a, b) => a !== b && (a.properties as CityProps).province !== (b.properties as CityProps).province);
  const coastMesh = mesh(topo, obj, (a, b) => a === b);
  const coastMeshMain = mesh(topo, obj, (a, b) => a === b && (a.properties as CityProps).adcode !== SANSHA);
  const dash = feature(topo, topo.objects.dash as GeometryCollection) as unknown as FeatureCollection;

  return { topo, cities, byAdcode, bounds, mainProj, insetProj, cityMesh, provinceMesh, coastMesh, coastMeshMain, dash };
}

export function inInset(bx: number, by: number) {
  const [x0, y0, x1, y1] = INSET_BOX;
  return bx >= x0 && bx <= x1 && by >= y0 && by <= y1;
}

/** 靶面坐标 → 经纬度（落在地图圆盘外返回 null） */
export function boardToLonLat(w: GeoWorld, bx: number, by: number): [number, number] | null {
  if (Math.hypot(bx, by) > R_MAP) return null;
  const proj = inInset(bx, by) ? w.insetProj : w.mainProj;
  return proj.invert!(toPx(bx, by)) as [number, number] | null;
}

/** 经纬度 → 靶面坐标（测试用；useInset 用于南海诸岛的点） */
export function lonLatToBoard(w: GeoWorld, lon: number, lat: number, useInset = false): [number, number] {
  const p = (useInset ? w.insetProj : w.mainProj)([lon, lat])!;
  return fromPx(p[0], p[1]);
}

export function findCity(w: GeoWorld, lon: number, lat: number): CityFeature | null {
  for (let i = 0; i < w.cities.length; i++) {
    const [[a, b], [c, d]] = w.bounds[i];
    if (lon < a || lon > c || lat < b || lat > d) continue;
    if (geoContains(w.cities[i], [lon, lat])) return w.cities[i];
  }
  return null;
}

export type HitResult =
  | { kind: 'city'; city: CityFeature; lonlat: [number, number] }
  | { kind: 'sea'; lonlat: [number, number] | null }
  | { kind: 'ring' }
  | { kind: 'miss' };

/** 靶面坐标的最终判定 */
export function judge(w: GeoWorld, bx: number, by: number): HitResult {
  const r = Math.hypot(bx, by);
  if (r > 1) return { kind: 'miss' };
  if (r > R_MAP) return { kind: 'ring' };
  const ll = boardToLonLat(w, bx, by);
  if (!ll || !isFinite(ll[0])) return { kind: 'sea', lonlat: null };
  let city = findCity(w, ll[0], ll[1]);
  // 南海诸岛只在插图里画，主图里不画也不判定
  if (city && city.properties.adcode === SANSHA && !inInset(bx, by)) city = null;
  return city ? { kind: 'city', city, lonlat: ll } : { kind: 'sea', lonlat: ll };
}
