# 🎯 飞镖去旅行 · 中国版

一个 3D 网页投掷小游戏：金属架上吊着一块飞镖靶，靶心是一张中国地图。**用手指（或鼠标）往上滑**把飞镖投出去，扎中哪个地级行政区，就去那里"旅行"——显示城市名、简介，并可以一键打开百度百科。

- 在线试玩：<https://cupidryan2-art.github.io/darts-travel-china/>
- 技术栈：Vite + TypeScript + Three.js + d3-geo + topojson，纯前端、无后端

## 玩法

| 手势 | 效果 |
| --- | --- |
| 轻轻往上滑 | 力度小，落在靶子下半部分；太轻会扎在数字环上 |
| 中等力度 | 大约落在靶心附近 |
| 用力快速往上滑 | 落在上半部分；太用力会飞过靶顶 |
| 斜着滑 | 控制左右 |

落点**完全由滑动的方向和力度决定**，再加一点"手抖"（设置里可以选 简单 / 普通 / 困难）。
扎在中国陆地 → 显示地级市；扎在海里或国外 → 「扑通！掉海里了 🌊」；扎在数字环上或脱靶 → 「脱靶啦」。

扎中过的城市会在靶面上变成淡色，左上角显示「已解锁 X / 370」，记录保存在浏览器 localStorage 里，可以在设置里清空。

## 本地开发

```bash
npm install
npm run dev        # 打开 http://localhost:5173 ，手机和电脑在同一局域网也能直接访问
npm run test:hit   # 自测：22 个已知经纬度 + 数字环/脱靶，验证「3D 交点 → 经纬度 → 城市」
npm run build      # 输出到 dist/
```

## 重新生成数据

运行时只读 `public/` 下的两个本地文件，不会在运行时访问 DataV 或百度。

```bash
npm run build:geo        # → public/china-cities.topo.json（约 1.2 MB）
npm run build:summaries  # → public/summaries.json（依赖上一步）
```

**`scripts/build-geo.ts`** 从阿里云 DataV GeoAtlas 下载省级 `100000_full.json` 和每个省的 `{adcode}_full.json`（缓存在 `scripts/.cache/`），合并成一份地级单位 TopoJSON，然后简化：

- 直辖市（京津沪渝）、港澳台各自作为一个整体单元
- 省直辖县级单位（仙桃、潜江、天门、神农架、济源、海南各县市、新疆兵团各市…）作为独立单元
- 三沙市的岛礁简化后会塌缩成点，所以把每个岛（群）换成半径 0.14° 的小圆点，保证在南海诸岛插图里看得见、扎得中
- 每个单元只保留 `adcode`、`name`、`province`
- 当前数据共 **370** 个单元：333 个地级 + 4 个直辖市 + 3 个港澳台 + 30 个省直辖县级单位

**`scripts/build-summaries.ts`** 调用中文维基百科 REST API（`/api/rest_v1/page/summary/{城市名}`），用 opencc-js 转成简体，截取 2–4 句。支持断点续跑：已经拿到的不会重复请求；遇到 429 限流会自动等待重试，没拿全的话再跑一次即可。运行时如果本地没有某个城市的简介，前端会直接请求维基 summary API（支持 CORS），再拿不到就显示"暂无简介"。

> 为什么不用百度百科？百度百科没有开放 API、禁止 iframe 嵌入、前端请求会被 CORS 拦截，所以只把它作为按钮链接：`https://baike.baidu.com/item/{城市名}`。

## 关键设计：看到的 = 判定的

`src/mapping.ts` 里的投影（`geoConicEqualArea`，标准纬线 25°N / 47°N，中央经线 105°E）直接定义在 2048×2048 的贴图像素空间上。**画靶面贴图**（`src/board.ts`）和**命中判定**用的是同一组投影对象：

```
飞镖抛物线 ∩ 靶面平面 → 靶面坐标 (bx, by) → 贴图像素 → projection.invert → 经纬度 → geoContains → 城市
```

南海诸岛插图用同一种投影、不同的缩放平移；落点在插图框里就用插图投影反算。

投掷物理在 `src/physics.ts`：手势先换算成靶面上的瞄准点（加上手抖），再解出一条 ~0.5 秒后恰好穿过该点的抛物线（有重力）。脱靶时飞镖会沿抛物线继续飞，撞到窗帘墙或掉到地上。

## 部署

### GitHub Pages（本仓库已配置）

`.github/workflows/deploy.yml` 会在每次 push 到 `main` 时跑自测 + 构建，然后发布到 GitHub Pages。首次需要在仓库 **Settings → Pages → Source** 选 **GitHub Actions**（本仓库已经设置好）。

`vite.config.ts` 里 `base: './'`，所以同一份构建产物放在根路径或子路径下都能用。

### Vercel

1. 在 Vercel 导入这个 GitHub 仓库
2. Framework 选 **Vite**（`vercel.json` 已写好：构建命令 `npm run build`，输出目录 `dist`）
3. 部署即可，不需要任何环境变量

## 目录

```
scripts/build-geo.ts        下载 + 合并 + 简化地图数据
scripts/build-summaries.ts  拉取维基百科简介
scripts/test-hit.ts         命中判定自测
src/mapping.ts              投影、靶面坐标 ⇄ 经纬度 ⇄ 城市
src/physics.ts              手势 → 力度/方向 → 抛物线
src/board.ts                Canvas 画靶面贴图
src/scene.ts                3D 场景：房间、架子、靶子、小熊猫、飞镖
src/main.ts                 状态机、手势、镜头、结果界面
src/share.ts                生成分享图
src/audio.ts                WebAudio 合成音效
```

## 署名

- 地图数据：© 阿里云 DataV.GeoAtlas
- 城市简介：维基百科，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- 玩法灵感来自 lotteryjs 的 darts-tabi；场景、角色、代码均为原创
