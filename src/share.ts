/** 生成分享图：靶面 + 飞镖 + 「我的飞镖扎中了 XX市！」 */
import { TEX } from './mapping';

export function makeShareImage(boardCanvas: HTMLCanvasElement, hit: [number, number], city: string, province: string): Promise<Blob> {
  const W = 1080, H = 1440;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;

  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2b2233'); bg.addColorStop(1, '#14111a');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);

  // 标题
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.font = '600 54px "Noto Serif SC", "Songti SC", serif';
  x.fillText('我的飞镖扎中了', W / 2, 140);
  x.fillStyle = '#ffcf5a';
  x.font = '128px "Ma Shan Zheng", "STKaiti", "KaiTi", serif';
  x.fillText(`${city}！`, W / 2, 290);
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.font = '40px "Noto Serif SC", serif';
  x.fillText(province, W / 2, 360);

  // 靶面
  const D = 900, ox = (W - D) / 2, oy = 420;
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 40; x.shadowOffsetY = 16;
  x.beginPath(); x.arc(ox + D / 2, oy + D / 2, D / 2, 0, Math.PI * 2); x.fillStyle = '#111'; x.fill();
  x.restore();
  x.drawImage(boardCanvas, 0, 0, TEX, TEX, ox, oy, D, D);

  // 飞镖（俯视角简化画法：从落点斜向右下伸出）
  const hx = ox + ((hit[0] + 1) / 2) * D, hy = oy + ((1 - hit[1]) / 2) * D;
  x.save();
  x.translate(hx, hy);
  x.rotate(Math.PI / 4.5);
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.beginPath(); x.ellipse(36, 40, 70, 10, 0.3, 0, Math.PI * 2); x.fill(); // 投影
  x.fillStyle = '#d8dde2'; x.fillRect(0, -3, 26, 6);
  x.fillStyle = '#4b4f55'; x.fillRect(26, -8, 46, 16);
  x.fillStyle = '#e0262c'; x.fillRect(72, -4, 46, 8);
  x.beginPath(); x.moveTo(110, 0); x.lineTo(160, -30); x.lineTo(168, -26); x.lineTo(150, 0); x.lineTo(168, 26); x.lineTo(160, 30); x.closePath(); x.fill();
  x.restore();
  x.fillStyle = '#ffef5a';
  x.beginPath(); x.arc(hx, hy, 7, 0, Math.PI * 2); x.fill();

  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.font = '32px sans-serif';
  x.fillText('飞镖去旅行 · 中国版', W / 2, H - 70);
  x.font = '22px sans-serif';
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.fillText('地图：© 阿里云 DataV.GeoAtlas', W / 2, H - 32);

  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}
