import './style.css';
import * as THREE from 'three';
import type { Topology } from 'topojson-specification';
import { buildWorld, judge, type CityFeature, type HitResult } from './mapping';
import { BoardTexture } from './board';
import { createBoard, createDart, createRedPanda, createRoom, createStand, DART_TIP } from './scene';
import {
  BOARD_CENTER, BOARD_R, FACE_Z, SHAKE, aimFromSwipe, gauss, planTrajectory, positionAt, stopTime,
  swipePower, velocityAt, type Difficulty, type Swipe, type Trajectory,
} from './physics';
import { playThud, playWhoosh, setSound, unlockAudio } from './audio';
import { makeShareImage } from './share';

const BASE = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------- 本地存储 ----------------
const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem('darts-china:' + k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem('darts-china:' + k, JSON.stringify(v)); } catch { /* 隐私模式等 */ }
  },
};
const settings = store.get('settings', { difficulty: 'normal' as Difficulty, sound: true });
setSound(settings.sound);
let visited = new Set<number>(store.get<number[]>('visited', []));

async function main() {
  const [topo, summaries] = await Promise.all([
    fetch(BASE + 'china-cities.topo.json').then((r) => r.json() as Promise<Topology>),
    fetch(BASE + 'summaries.json').then((r) => r.json()).catch(() => ({})) as Promise<Record<string, { title: string; text: string }>>,
  ]);
  const world = buildWorld(topo);
  const boardTex = new BoardTexture(world, visited);

  // ---------------- three.js ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
  createRoom(scene);
  const pivot = createStand(scene);
  const { board } = createBoard(pivot, boardTex.texture);
  boardTex.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const panda = createRedPanda();
  scene.add(panda.root);

  let dart = createDart();
  scene.add(dart);

  // 拖尾
  const trail: THREE.Mesh[] = [];
  const trailGeo = new THREE.SphereGeometry(0.012, 8, 6);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    trail.push(m); scene.add(m);
  }
  const trailHist: THREE.Vector3[] = [];

  // ---------------- 相机与布局 ----------------
  const home = { pos: new THREE.Vector3(), target: new THREE.Vector3(0, 1.85, 0) };
  const camTarget = new THREE.Vector3();
  function layout() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(1.6 / t, (BOARD_R * 1.2) / (t * camera.aspect));
    home.pos.set(0, 1.95, FACE_Z + dist);
    // 角色放在画面右下角：用一台「在原位的相机」反投影
    const c = camera.clone();
    c.position.copy(home.pos); c.lookAt(home.target); c.updateMatrixWorld();
    const ndc = new THREE.Vector3(camera.aspect < 1 ? 0.42 : 0.6, -0.6, 0.5).unproject(c);
    const dir = ndc.sub(c.position).normalize();
    const p = c.position.clone().addScaledVector(dir, 3.1);
    panda.root.position.copy(p).add(new THREE.Vector3(0, -0.25, 0));
    panda.root.scale.setScalar(0.5);
    panda.root.rotation.y = -0.3;
    if (state !== 'result' && state !== 'zooming') { camera.position.copy(home.pos); camTarget.copy(home.target); }
  }

  // ---------------- 状态 ----------------
  type State = 'idle' | 'aiming' | 'flying' | 'stuck' | 'zooming' | 'result' | 'returning';
  let state: State = 'idle';
  let tr: Trajectory | null = null;
  let flyT = 0, flyEnd = 0;
  let pendingHit: HitResult | null = null;
  let hitWorld = new THREE.Vector3();
  let hitBoard: [number, number] = [0, 0];
  let currentCity: CityFeature | null = null;
  let thrownOnce = false;
  let pull = 0; // 瞄准时飞镖往后拉的量
  let sway = { t: 99, amp: 0, ampZ: 0 };
  let camTween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; dur: number; done: () => void } | null = null;
  let flash: { t: number; n: number } | null = null;
  let resetTimer = 0;

  function handTip() {
    // 手里那支飞镖：位置跟手，针尖指向靶心偏上（模拟举镖姿势）
    panda.hand.updateWorldMatrix(true, false);
    return panda.hand.getWorldPosition(new THREE.Vector3());
  }
  function holdDart() {
    const p = handTip();
    p.y -= pull * 0.12; p.z += pull * 0.1;
    dart.position.copy(p);
    dart.lookAt(BOARD_CENTER.x, BOARD_CENTER.y + 0.6, FACE_Z);
  }

  // ---------------- 投掷 ----------------
  function throwDart(s: Swipe) {
    const shake = SHAKE[settings.difficulty];
    let power = swipePower(s) + gauss() * shake.power;
    let [bx, by] = aimFromSwipe(s);
    by = (power - 1) * 1.6;
    bx += gauss() * shake.aim;
    by += gauss() * shake.aim;
    launch(bx, by, power);
  }

  function launch(bx: number, by: number, power = 1) {
    if (state !== 'idle' && state !== 'aiming') return;
    if (!thrownOnce) { thrownOnce = true; $('hint').classList.add('hide'); }
    pull = 0;
    holdDart();
    const tip = dart.localToWorld(new THREE.Vector3(0, 0, DART_TIP));
    tr = planTrajectory(tip, bx, by, power);
    pendingHit = judge(world, bx, by);
    hitBoard = [bx, by];
    flyT = 0;
    flyEnd = pendingHit.kind === 'miss' ? stopTime(tr) : tr.tFace;
    trailHist.length = 0;
    state = 'flying';
    playWhoosh();
  }

  const tmpV = new THREE.Vector3(), tmpP = new THREE.Vector3();
  function updateFlight(dt: number) {
    if (!tr) return;
    flyT = Math.min(flyEnd, flyT + dt);
    const tip = positionAt(tr, flyT, tmpP);
    const v = velocityAt(tr, flyT, tmpV).normalize();
    dart.position.copy(tip).addScaledVector(v, -DART_TIP);
    dart.lookAt(tip);
    dart.rotateZ(flyT * 18); // 自旋
    trailHist.unshift(dart.position.clone().addScaledVector(v, -0.2));
    if (trailHist.length > trail.length) trailHist.pop();
    if (flyT >= flyEnd) land(v);
  }

  function land(v: THREE.Vector3) {
    const hit = pendingHit!;
    const tip = positionAt(tr!, flyEnd, new THREE.Vector3());
    // 稍微扎进去一点
    dart.position.copy(tip).addScaledVector(v, -(DART_TIP - 0.035));
    hitWorld.copy(tip);
    state = 'stuck';
    trailHist.length = 0;
    if (hit.kind === 'miss') {
      if (dart.position.y < 0.3) { // 掉在地上
        dart.position.y = 0.025;
        dart.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dart.rotateX(Math.PI / 2 - 0.05);
        dart.position.y = 0.03;
      }
      playThud(true);
      showToast('脱靶啦 🎯 再投一次', 1700);
      resetTimer = setTimeout(resetThrow, 1700) as unknown as number;
      return;
    }
    board.attach(dart);
    sway = { t: 0, amp: 0.035 + Math.abs(hitBoard[1]) * 0.01, ampZ: -hitBoard[0] * 0.012 };
    playThud();
    if (navigator.vibrate) navigator.vibrate(18);
    if (hit.kind === 'ring') {
      showToast('脱靶啦 🎯 再投一次', 1700);
      resetTimer = setTimeout(resetThrow, 1700) as unknown as number;
    } else if (hit.kind === 'sea') {
      showToast('扑通！掉海里了 🌊', 1700);
      resetTimer = setTimeout(resetThrow, 1700) as unknown as number;
    } else {
      currentCity = hit.city;
      const code = hit.city.properties.adcode;
      if (!visited.has(code)) { visited.add(code); store.set('visited', [...visited]); }
      updateCounter();
      setTimeout(() => zoomTo(hitWorld), 350);
    }
  }

  function zoomTo(p: THREE.Vector3) {
    state = 'zooming';
    $('hud').classList.add('hide');
    const portrait = camera.aspect < 1;
    const to = p.clone().add(new THREE.Vector3(0.26, 0.16, portrait ? 1.3 : 1.0));
    const tTo = p.clone().add(new THREE.Vector3(0, portrait ? -0.12 : -0.02, 0));
    camTween = { from: camera.position.clone(), to, tFrom: camTarget.clone(), tTo, t: 0, dur: 1.05, done: showResult };
    boardTex.setHighlight(currentCity, true);
    flash = { t: 0, n: 0 };
  }

  function showResult() {
    state = 'result';
    const c = currentCity!.properties;
    $('r-name').textContent = c.name;
    $('r-prov').textContent = c.province === c.name ? (c.adcode >= 810000 ? '中华人民共和国 · 特别行政区' : c.adcode === 710000 ? '中华人民共和国' : '中华人民共和国 · 直辖市') : c.province;
    ($('btn-baike') as HTMLAnchorElement).href = `https://baike.baidu.com/item/${encodeURIComponent(c.name)}`;
    const p = $('r-summary');
    const local = summaries[c.adcode];
    if (local) p.textContent = local.text;
    else {
      p.textContent = '正在查找简介…';
      const want = c.adcode;
      fetchWiki(c.name).then((t) => { if (currentCity?.properties.adcode === want) p.textContent = t ?? '暂无简介，点「打开百度百科」看看吧。'; });
    }
    $('result').hidden = false;
  }

  async function fetchWiki(name: string) {
    try {
      const r = await fetch(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`, { headers: { 'Accept-Language': 'zh-cn' } });
      if (!r.ok) return null;
      const j = await r.json();
      if (j.type === 'disambiguation' || !j.extract) return null;
      return (j.extract as string).match(/[^。！？]+[。！？]?/g)?.slice(0, 4).join('') ?? null;
    } catch { return null; }
  }

  function resetThrow() {
    clearTimeout(resetTimer);
    $('result').hidden = true;
    const wasZoomed = state === 'result' || state === 'zooming';
    const finish = () => {
      // 拔掉飞镖，角色手里再拿一支
      dart.removeFromParent();
      dart = createDart();
      scene.add(dart);
      boardTex.setHighlight(null);
      if (currentCity) boardTex.setVisited(visited);
      currentCity = null;
      flash = null;
      sway.amp = sway.ampZ = 0;
      pivot.rotation.set(0, 0, 0);
      $('hud').classList.remove('hide');
      state = 'idle';
    };
    if (wasZoomed) {
      state = 'returning';
      camTween = { from: camera.position.clone(), to: home.pos.clone(), tFrom: camTarget.clone(), tTo: home.target.clone(), t: 0, dur: 0.8, done: finish };
    } else finish();
  }

  // ---------------- UI ----------------
  let toastTimer = 0;
  function showToast(text: string, ms: number) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms - 200) as unknown as number;
  }
  function updateCounter() {
    $('unlocked').textContent = $('s-unlocked').textContent = String(visited.size);
    $('total').textContent = String(world.cities.length);
  }
  updateCounter();

  $('btn-again').onclick = resetThrow;
  $('btn-settings').onclick = () => {
    const dlg = $<HTMLDialogElement>('settings');
    (dlg.querySelector(`input[value="${settings.difficulty}"]`) as HTMLInputElement).checked = true;
    ($('opt-sound') as HTMLInputElement).checked = settings.sound;
    dlg.showModal();
  };
  $('settings').addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'diff') settings.difficulty = t.value as Difficulty;
    if (t.id === 'opt-sound') { settings.sound = t.checked; setSound(t.checked); }
    store.set('settings', settings);
  });
  $('btn-clear').onclick = () => {
    if (!visited.size || !confirm(`确定清空已解锁的 ${visited.size} 个城市吗？`)) return;
    visited = new Set();
    store.set('visited', []);
    boardTex.setVisited(visited);
    updateCounter();
  };

  let shareBlob: Blob | null = null;
  $('btn-share').onclick = async () => {
    const c = currentCity!.properties;
    shareBlob = await makeShareImage(boardTex.canvas, hitBoard, c.name, $('r-prov').textContent ?? '');
    const url = URL.createObjectURL(shareBlob);
    ($('share-img') as HTMLImageElement).src = url;
    ($('share-download') as HTMLAnchorElement).href = url;
    ($('share-download') as HTMLAnchorElement).download = `飞镖去旅行-${c.name}.png`;
    const file = new File([shareBlob], 'darts.png', { type: 'image/png' });
    $('share-native').style.display = navigator.canShare?.({ files: [file] }) || 'share' in navigator ? '' : 'none';
    $<HTMLDialogElement>('share').showModal();
  };
  $('share-native').onclick = async () => {
    const c = currentCity!.properties;
    const text = `我的飞镖扎中了${c.name}！来「飞镖去旅行 · 中国版」试试手气`;
    const file = new File([shareBlob!], `darts-${c.adcode}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: '飞镖去旅行', text });
      else await navigator.share({ title: '飞镖去旅行', text, url: location.href });
    } catch { /* 用户取消 */ }
  };
  $('share-close').onclick = () => $<HTMLDialogElement>('share').close();

  // ---------------- 手势：往上滑投掷 ----------------
  const stage = $('stage');
  let samples: { x: number; y: number; t: number }[] = [];
  let pid = -1;
  stage.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (state !== 'idle') return;
    pid = e.pointerId;
    try { stage.setPointerCapture(pid); } catch { /* 合成事件没有真实指针 */ }
    samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    state = 'aiming';
  });
  stage.addEventListener('pointermove', (e) => {
    if (state !== 'aiming' || e.pointerId !== pid) return;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (samples.length > 60) samples.shift();
    const dy = e.clientY - samples[0].y;
    pull = Math.max(-1, Math.min(1, dy / (innerHeight * 0.25)));
  });
  const release = (e: PointerEvent) => {
    if (state !== 'aiming' || e.pointerId !== pid) return;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    const first = samples[0], last = samples[samples.length - 1];
    // 松手前 ~100ms 的向上速度
    let k = samples.length - 1;
    while (k > 0 && last.t - samples[k].t < 100) k--;
    const dtS = Math.max(16, last.t - samples[k].t) / 1000;
    const upSpeed = Math.max(0, (samples[k].y - last.y) / dtS);
    const dx = last.x - first.x, dy = last.y - first.y;
    pull = 0;
    if (-dy < 30 || e.type === 'pointercancel') { state = 'idle'; return; }
    // 用最后一段的方向为主（更像真实出手），总位移为辅
    const sx = last.x - samples[k].x, sy = last.y - samples[k].y;
    const dirX = sy < -5 ? (sx / -sy) * -dy * 0.6 + dx * 0.4 : dx;
    throwDart({ dx: dirX, dy, upSpeed, screenH: innerHeight });
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // ---------------- 主循环 ----------------
  addEventListener('resize', layout);
  layout();
  const clock = new THREE.Clock();
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // 角色待机晃动
    panda.body.position.y = Math.sin(time * 2.2) * 0.012;
    panda.body.rotation.z = Math.sin(time * 1.3) * 0.03;
    panda.head.rotation.z = Math.sin(time * 1.7 + 1) * 0.06;
    panda.tail.rotation.y = Math.sin(time * 1.5) * 0.15;
    const armTarget = state === 'aiming' ? -0.35 + pull * 0.4 : state === 'flying' || state === 'stuck' ? -0.9 : -0.35 + Math.sin(time * 2.2) * 0.04;
    panda.armR.rotation.z += (armTarget - panda.armR.rotation.z) * Math.min(1, dt * 14);
    panda.armR.rotation.x = state === 'flying' ? -0.6 : 0;

    if (state === 'idle' || state === 'aiming') holdDart();
    if (state === 'flying') updateFlight(dt);

    trail.forEach((m, i) => {
      const p = trailHist[i];
      const mat = m.material as THREE.MeshBasicMaterial;
      if (p) { m.position.copy(p); mat.opacity = 0.5 * (1 - i / trail.length); m.scale.setScalar(1 - i / trail.length); }
      else mat.opacity = 0;
    });

    // 靶子被扎中后的摆动（阻尼振荡）
    if (sway.amp) {
      sway.t += dt;
      const d = Math.exp(-sway.t * 2.6);
      pivot.rotation.x = -sway.amp * d * Math.sin(sway.t * 9);
      pivot.rotation.z = sway.ampZ * d * Math.sin(sway.t * 7);
    }

    if (camTween) {
      camTween.t = Math.min(1, camTween.t + dt / camTween.dur);
      const k = ease(camTween.t);
      camera.position.lerpVectors(camTween.from, camTween.to, k);
      camTarget.lerpVectors(camTween.tFrom, camTween.tTo, k);
      if (camTween.t >= 1) { const done = camTween.done; camTween = null; done(); }
    }
    camera.lookAt(camTarget);

    if (flash) {
      flash.t += dt;
      if (flash.t > 0.22 && flash.n < 8) { flash.t = 0; flash.n++; boardTex.setHighlight(currentCity, flash.n % 2 === 0); }
    }

    renderer.render(scene, camera);
  });
  $('loading').classList.add('done');
}

main().catch((e) => {
  console.error(e);
  $('loading').textContent = '加载失败，请刷新重试';
});
