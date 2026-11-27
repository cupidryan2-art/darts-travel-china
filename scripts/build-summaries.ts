/**
 * 为每个地级单位从中文维基百科 REST API 拉取简介，用 opencc-js 转简体，
 * 输出 public/summaries.json：{ [adcode]: { title, text } }
 * 依赖 build-geo.ts 先生成 public/china-cities.topo.json。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as OpenCC from 'opencc-js';

const TOPO = new URL('../public/china-cities.topo.json', import.meta.url);
const OUT = new URL('../public/summaries.json', import.meta.url);
const toCN = OpenCC.Converter({ from: 't', to: 'cn' });
const UA = 'darts-travel-china/1.0 (open-source educational map game)';

export function trimSentences(text: string, max = 4): string {
  const parts = text.replace(/\s+/g, ' ').match(/[^。！？]+[。！？]?/g) ?? [];
  let out = '';
  for (const p of parts.slice(0, max)) {
    if (out.length > 40 && (out + p).length > 180) break;
    out += p;
  }
  return out.trim();
}

async function fetchSummary(title: string) {
  const url = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-cn' } });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 3000 * (i + 1);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) return null;
    const j: any = await res.json();
    if (j.type === 'disambiguation' || !j.extract) return null;
    return { title: toCN(j.titles?.normalized ?? j.title ?? title), text: trimSentences(toCN(j.extract)) };
  }
  return null;
}

async function main() {
  const topo = JSON.parse(await readFile(TOPO, 'utf8'));
  const cities = topo.objects.cities.geometries.map((g: any) => g.properties) as { adcode: number; name: string; province: string }[];
  const out: Record<string, { title: string; text: string }> = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : {};
  const todo = cities.filter((c) => !out[c.adcode]);
  let done = 0;
  const missing: string[] = [];
  const queue = [...todo];
  await Promise.all(Array.from({ length: 2 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      // 先试全称，再试去掉「市/地区/盟/自治州」后缀的简称
      const s = (await fetchSummary(c.name)) ?? (await fetchSummary(c.name.replace(/(市|地区|盟|自治州)$/, '')));
      if (s) out[c.adcode] = s; else missing.push(c.name);
      if (++done % 25 === 0) console.log(`  ${done}/${todo.length}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }));
  await writeFile(OUT, JSON.stringify(out));
  console.log(`✅ 已有简介 ${Object.keys(out).length}/${cities.length}`);
  if (missing.length) console.log('⚠️ 未找到：', missing.join('、'));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
