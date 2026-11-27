/** 用 Canvas 画靶面贴图：数字环 + 红绿双倍/三倍区 + 海蓝底橙色中国地图 + 南海诸岛插图 */
import { geoPath, type GeoProjection } from 'd3-geo';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { INSET_BOX, R_MAP, SANSHA, TEX, toPx, type CityFeature, type GeoWorld } from './mapping';

const NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const C = {
  sea: '#2a7fc4',
  seaDeep: '#1f6aa8',
  land: '#f49a32',
  landVisited: '#fde2bd',
  cityLine: 'rgba(122, 52, 0, 0.45)',
  provLine: 'rgba(110, 40, 0, 0.9)',
  coast: '#7a3300',
  red: '#d42a2f',
  green: '#1d8a4b',
  black: '#1a1a1a',
  cream: '#f1e2c0',
  wire: '#c8ccd0',
  highlight: '#ffef5a',
};

export class BoardTexture {
  readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  private base = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private highlight: CityFeature | null = null;
  private highlightOn = false;

  constructor(private w: GeoWorld, private visited: Set<number>) {
    this.canvas.width = this.canvas.height = this.base.width = this.base.height = TEX;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.redrawBase();
  }

  setVisited(v: Set<number>) {
    this.visited = v;
    this.redrawBase();
  }

  setHighlight(city: CityFeature | null, on = true) {
    this.highlight = city;
    this.highlightOn = on;
    this.compose();
  }

  redrawBase() {
    const ctx = this.base.getContext('2d')!;
    const S = TEX, c = S / 2;
    const R = (r: number) => r * c;
    ctx.clearRect(0, 0, S, S);

    // —— 外圈数字环 ——
    ctx.fillStyle = C.black;
    ctx.beginPath(); ctx.arc(c, c, R(1), 0, Math.PI * 2); ctx.fill();

    const seg = (r0: number, r1: number, colors: [string, string]) => {
      for (let i = 0; i < 20; i++) {
        const a0 = ((-90 + i * 18 - 9) * Math.PI) / 180, a1 = a0 + (18 * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(c, c, R(r1), a0, a1);
        ctx.arc(c, c, R(r0), a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = colors[i % 2];
        ctx.fill();
      }
    };
    seg(0.8, 0.86, [C.red, C.green]); // 双倍区
    seg(0.73, 0.8, [C.black, C.cream]);
    seg(0.68, 0.73, [C.red, C.green]); // 三倍区
    seg(R_MAP, 0.68, [C.black, C.cream]);

    // 金属分隔线
    ctx.strokeStyle = C.wire;
    ctx.lineWidth = 3;
    for (const r of [R_MAP, 0.68, 0.73, 0.8, 0.86]) { ctx.beginPath(); ctx.arc(c, c, R(r), 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 20; i++) {
      const a = ((-90 + i * 18 - 9) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * R(R_MAP), c + Math.sin(a) * R(R_MAP));
      ctx.lineTo(c + Math.cos(a) * R(0.86), c + Math.sin(a) * R(0.86));
      ctx.stroke();
    }
    // 数字
    ctx.fillStyle = '#f5f5f5';
    ctx.font = `bold ${Math.round(R(0.09))}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    NUMBERS.forEach((n, i) => {
      const a = ((-90 + i * 18) * Math.PI) / 180;
      ctx.save();
      ctx.translate(c + Math.cos(a) * R(0.93), c + Math.sin(a) * R(0.93));
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    });
    // 外缘一圈金属
    ctx.lineWidth = 10; ctx.strokeStyle = '#8a8f95';
    ctx.beginPath(); ctx.arc(c, c, R(1) - 5, 0, Math.PI * 2); ctx.stroke();

    // —— 地图圆盘 ——
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R(R_MAP), 0, Math.PI * 2); ctx.clip();
    const g = ctx.createRadialGradient(c, c, R(0.1), c, c, R(R_MAP));
    g.addColorStop(0, C.sea); g.addColorStop(1, C.seaDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    this.drawMap(ctx, this.w.mainProj, 1, true);

    // —— 南海诸岛插图 ——
    const [x0, y0, x1, y1] = INSET_BOX;
    const [px0, py0] = toPx(x0, y1), [px1, py1] = toPx(x1, y0);
    ctx.save();
    ctx.beginPath(); ctx.rect(px0, py0, px1 - px0, py1 - py0); ctx.clip();
    ctx.fillStyle = C.sea; ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
    this.drawMap(ctx, this.w.insetProj, 0.8);
    const dash = geoPath(this.w.insetProj, ctx);
    ctx.setLineDash([10, 7]); ctx.lineWidth = 2.5; ctx.strokeStyle = C.coast;
    ctx.beginPath(); dash(this.w.dash as any); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${Math.round(R(0.026))}px sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('南海诸岛', px1 - 10, py1 - 8);
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(px0, py0, px1 - px0, py1 - py0);
    ctx.restore();

    ctx.lineWidth = 4; ctx.strokeStyle = C.wire;
    ctx.beginPath(); ctx.arc(c, c, R(R_MAP), 0, Math.PI * 2); ctx.stroke();

    this.compose();
  }

  private drawMap(ctx: CanvasRenderingContext2D, proj: GeoProjection, k: number, main = false) {
    const path = geoPath(proj, ctx);
    for (const city of this.w.cities) {
      if (main && city.properties.adcode === SANSHA) continue;
      ctx.beginPath(); path(city);
      ctx.fillStyle = this.visited.has(city.properties.adcode) ? C.landVisited : C.land;
      ctx.fill();
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.cityLine; ctx.lineWidth = 1.3 * k;
    ctx.beginPath(); path(this.w.cityMesh); ctx.stroke();
    ctx.strokeStyle = C.provLine; ctx.lineWidth = 2.4 * k;
    ctx.beginPath(); path(this.w.provinceMesh); ctx.stroke();
    ctx.strokeStyle = C.coast; ctx.lineWidth = 2.2 * k;
    ctx.beginPath(); path(main ? this.w.coastMeshMain : this.w.coastMesh); ctx.stroke();
  }

  private compose() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, TEX, TEX);
    ctx.drawImage(this.base, 0, 0);
    const city = this.highlight;
    if (city && this.highlightOn) {
      const c = TEX / 2;
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, R_MAP * c, 0, Math.PI * 2); ctx.clip();
      const [x0, y0, x1, y1] = INSET_BOX;
      const [px0, py0] = toPx(x0, y1), [px1, py1] = toPx(x1, y0);
      for (const [proj, inset] of [[this.w.mainProj, false], [this.w.insetProj, true]] as const) {
        ctx.save();
        if (inset) { ctx.beginPath(); ctx.rect(px0, py0, px1 - px0, py1 - py0); ctx.clip(); }
        else { ctx.beginPath(); ctx.rect(0, 0, TEX, TEX); ctx.rect(px0, py0, px1 - px0, py1 - py0); ctx.clip('evenodd'); }
        if (!inset && city.properties.adcode === SANSHA) { ctx.restore(); continue; }
        const path = geoPath(proj, ctx);
        ctx.beginPath(); path(city);
        // 外发光描边，小城市也看得见
        ctx.save();
        ctx.shadowColor = 'rgba(255, 245, 160, 0.95)'; ctx.shadowBlur = 24;
        ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.highlight; ctx.fill();
        ctx.strokeStyle = '#c2410c'; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    this.texture.needsUpdate = true;
  }
}
