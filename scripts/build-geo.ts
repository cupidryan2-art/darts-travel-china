/**
 * 下载阿里云 DataV GeoAtlas 的省级 + 地级数据，合并为一份「地级单位」TopoJSON。
 * 输出：public/china-cities.topo.json（objects.cities + objects.dash 九段线）
 * 省界在运行时用 topojson.mesh 从相邻且省份不同的城市边界导出
 *
 * 规则：
 *  - 直辖市（京津沪渝）整体作为一个单元
 *  - 港澳台各自整体作为一个单元
 *  - 省直辖县级单位（仙桃/潜江/天门/神农架/济源/海南各县…）作为独立单元
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import type { Feature, FeatureCollection } from 'geojson';

const BASE = 'https://geo.datav.aliyun.com/areas_v3/bound';
const CACHE = new URL('./.cache/', import.meta.url);
const OUT = new URL('../public/china-cities.topo.json', import.meta.url);
const WHOLE = new Set([110000, 120000, 310000, 500000, 710000, 810000, 820000]);

async function get(name: string): Promise<FeatureCollection> {
  const file = new URL(name, CACHE);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`${BASE}/${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await writeFile(file, text);
      return JSON.parse(text);
    } catch (e) {
      console.warn(`  重试 ${name}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`下载失败：${name}`);
}


async function main() {
  await mkdir(CACHE, { recursive: true });
  const country = await get('100000_full.json');
  const cities: Feature[] = [];
  const dash: Feature[] = [];

  for (const f of country.features) {
    const p = f.properties as any;
    if (!p?.name) { dash.push({ ...f, properties: {} }); continue; } // 九段线
    const code = Number(p.adcode);
    if (WHOLE.has(code)) {
      cities.push({ type: 'Feature', geometry: f.geometry, properties: { adcode: code, name: p.name, province: p.name } });
      continue;
    }
    process.stdout.write(`  ${p.name}…`);
    const sub = await get(`${code}_full.json`);
    let n = 0;
    for (const c of sub.features) {
      const cp = c.properties as any;
      if (!cp?.name || !c.geometry) continue;
      cities.push({ type: 'Feature', geometry: c.geometry, properties: { adcode: Number(cp.adcode), name: cp.name, province: p.name } });
      n++;
    }
    console.log(` ${n}`);
  }

  // 三沙市的岛礁太小，简化后会塌缩成点（看不见也扎不中）。
  // 把每个岛（群）换成半径约 0.14° 的小圆点，靶面上可见、也能命中。
  const sansha = cities.find((c) => (c.properties as any).adcode === 460300)!;
  sansha.geometry = islandDots(sansha.geometry as any);

  let topo: any = topology(<any>{ cities: { type: 'FeatureCollection', features: cities }, dash: { type: 'FeatureCollection', features: dash } }, 6e4);
  topo = presimplify(topo);
  const minW = quantile(topo, 0.05);
  topo = simplify(topo, minW);
  const json = JSON.stringify(topo);
  await writeFile(OUT, json);

  const byProv = new Map<string, number>();
  for (const c of cities) byProv.set((c.properties as any).province, (byProv.get((c.properties as any).province) ?? 0) + 1);
  console.log('\n各省地级单位数：', Object.fromEntries(byProv));
  console.log(`\n✅ 地级单位总数：${cities.length}`);
  console.log(`✅ 输出 ${OUT.pathname}  ${(json.length / 1024 / 1024).toFixed(2)} MB`);
}

function islandDots(g: { type: string; coordinates: any }) {
  const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const centers: [number, number][] = [];
  for (const poly of polys) {
    const ring = poly[0];
    const c: [number, number] = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    if (!centers.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) < 0.1)) centers.push(c);
  }
  const R = 0.14;
  return {
    type: 'MultiPolygon' as const,
    coordinates: centers.map(([x, y]) => [Array.from({ length: 13 }, (_, i) => {
      const a = (-i / 12) * Math.PI * 2;
      return [+(x + R * Math.cos(a)).toFixed(4), +(y + R * Math.sin(a)).toFixed(4)];
    })]),
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
