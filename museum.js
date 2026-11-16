/* Ақжібек Мұқашева: Үнсіз ерлік — виртуалды 3D музей (Three.js) */
import * as THREE from "three";

const App = window.AKZApp, D = window.AKZ;
const $ = (s) => document.querySelector(s);
const stage = $("#museumStage"), canvas = $("#museumCanvas");
const ui = {
  title: $("#mTitle"), hint: $("#mHint"), fade: $("#mFade"), label: $("#mLabel"), panel: $("#mPanel"), menu: $("#mMenu"),
  guide: $("#mGuideText"), tour: $("#mTour"), guideBtn: $("#mGuideBtn"), task: $("#mTask"), rot: $("#mRot")
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer = null, scene, camera, built = false, running = false, raf = 0;
let view = "hall";
const groups = {};             // hall, 1..5
const clickables = [];         // meshes with userData.ex
const anims = [];              // per-frame callbacks {view, fn}
const ROOM_X = (n) => n * 80;

/* ---------- orbit camera ---------- */
const orbit = { target: new THREE.Vector3(), yaw: 0, pitch: 0.12, dist: 10, min: 3, max: 16, yawLim: null,
  goal: { target: new THREE.Vector3(), yaw: 0, pitch: 0.12, dist: 10 }, auto: false };
function setOrbit(o, instant) {
  Object.assign(orbit, { min: o.min, max: o.max, yawLim: o.yawLim || null });
  orbit.goal.target.copy(o.target); orbit.goal.yaw = o.yaw; orbit.goal.pitch = o.pitch; orbit.goal.dist = o.dist;
  if (instant) { orbit.target.copy(o.target); orbit.yaw = o.yaw; orbit.pitch = o.pitch; orbit.dist = o.dist; }
}
function clampGoal() {
  const g = orbit.goal;
  g.pitch = Math.max(-0.2, Math.min(1.15, g.pitch));
  g.dist = Math.max(orbit.min, Math.min(orbit.max, g.dist));
  if (orbit.yawLim) g.yaw = Math.max(-orbit.yawLim, Math.min(orbit.yawLim, g.yaw));
}
function updateCamera(dt) {
  const k = 1 - Math.pow(0.0015, dt);
  if (orbit.auto) orbit.goal.yaw += dt * 0.12 * (orbit.yawLim ? Math.sign(Math.sin(performance.now() / 9000)) || 1 : 1);
  clampGoal();
  orbit.target.lerp(orbit.goal.target, k);
  orbit.yaw += (orbit.goal.yaw - orbit.yaw) * k;
  orbit.pitch += (orbit.goal.pitch - orbit.pitch) * k;
  orbit.dist += (orbit.goal.dist - orbit.dist) * k;
  const cp = Math.cos(orbit.pitch);
  camera.position.set(
    orbit.target.x + orbit.dist * cp * Math.sin(orbit.yaw),
    orbit.target.y + orbit.dist * Math.sin(orbit.pitch),
    orbit.target.z + orbit.dist * cp * Math.cos(orbit.yaw));
  camera.lookAt(orbit.target);
}

/* ---------- helpers ---------- */
function ctex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.7, metalness: o.m ?? 0.05, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, map: o.map || null, transparent: !!o.t, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide });
function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 24) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m; }
function plane(w, h, mat, x = 0, y = 0, z = 0, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; return m; }
const B = (map) => new THREE.MeshBasicMaterial({ map });
const GOLD = () => M(0xd4af37, { r: 0.35, m: 0.8 });
const WOOD = () => M(0x5a3d24, { r: 0.6 });
const DARKWOOD = () => M(0x2e1f13, { r: 0.65 });
const PAPER = (map) => M(0xffffff, { r: 0.9, map });
function sprite(text, opts = {}) {
  const w = opts.w || 512, h = opts.h || 128;
  const t = ctex(w, h, (g) => {
    g.fillStyle = opts.bg || "rgba(7,17,31,.82)"; roundRect(g, 4, 4, w - 8, h - 8, 22); g.fill();
    g.strokeStyle = opts.stroke || "#D4AF37"; g.lineWidth = 3; g.stroke();
    g.fillStyle = opts.color || "#F4D58D"; g.font = `${opts.weight || 500} ${opts.size || 46}px Oswald, "Arial Narrow", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  const sc = opts.scale || 1.6; s.scale.set(sc, sc * h / w, 1); return s;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(" "); let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t; }
  if (line) g.fillText(line, x, y); return y;
}
function markEx(obj, ex) { obj.userData.exRoot = true; obj.userData.ex = ex; obj.traverse((o) => { if (o.isMesh) { o.userData.ex = ex; o.userData.root = obj; clickables.push(o); } }); }
const loader = new THREE.TextureLoader();
function imgTex(src) { const t = loader.load(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

const parquet = () => { const t = ctex(512, 512, (g, w, h) => {
  g.fillStyle = "#2a1c10"; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { const off = (y % 2) * 64; g.fillStyle = `hsl(28,${35 + ((x * 7 + y * 3) % 10)}%,${16 + ((x * 5 + y * 11) % 7)}%)`; g.fillRect(x * 128 + off - 64, y * 64, 126, 62); }
}); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t; };
const wallTex = (hex, stripe) => ctex(512, 256, (g, w, h) => {
  g.fillStyle = hex; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.025)"; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
  g.fillStyle = stripe; g.fillRect(0, h * 0.62, w, 3);
  g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, h * 0.64, w, h);
});

/* ---------- room shell ---------- */
function shell(g, o) {
  const S = o.size || 14, H = 6, half = S / 2;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(S, S), M(0xffffff, { map: parquet(), r: 0.55 }));
  fl.rotation.x = -Math.PI / 2; g.add(fl);
  const wt = wallTex(o.wall, o.stripe || "#D4AF37");
  const wm = M(0xffffff, { map: wt, r: 0.85 });
  [[0, -half, 0], [0, half, Math.PI], [-half, 0, Math.PI / 2], [half, 0, -Math.PI / 2]].forEach(([x, z, ry]) => g.add(plane(S, H, wm, x, H / 2, z, ry)));
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(S, S), M(0x0a121e, { r: 1 })); ce.rotation.x = Math.PI / 2; ce.position.y = H; g.add(ce);
  const amb = new THREE.HemisphereLight(o.sky || 0x9fb4d0, 0x1a120a, o.hemi ?? 0.55); g.add(amb);
  const pl = new THREE.PointLight(o.light || 0xffe2a8, (o.li ?? 22) * 1.8, 20, 1.5); pl.position.set(0, 5.2, 0); g.add(pl);
  // ceiling lamp
  g.add(cyl(0.6, 0.9, 0.25, M(0x111111, { e: o.light || 0xffe2a8, ei: 0.6 }), 0, 5.85, 0));
  return { S, H, half };
}

/* ================= HALL ================= */
function buildHall() {
  const g = new THREE.Group(); groups.hall = g; scene.add(g);
  const L = 44, W = 10, H = 6.4, z0 = 6, zc = z0 - L / 2;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, L), M(0xffffff, { map: (() => { const t = parquet(); t.repeat.set(2, 9); return t; })(), r: 0.45 }));
  fl.rotation.x = -Math.PI / 2; fl.position.z = zc; g.add(fl);
  // carpet
  const cp = new THREE.Mesh(new THREE.PlaneGeometry(3, L - 2), M(0x5a1a17, { r: 0.95 })); cp.rotation.x = -Math.PI / 2; cp.position.set(0, 0.01, zc); g.add(cp);
  const wm = M(0xffffff, { map: (() => { const t = wallTex("#14243b", "#D4AF37"); t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); return t; })(), r: 0.85 });
  g.add(plane(L, H, wm, -W / 2, H / 2, zc, Math.PI / 2));
  g.add(plane(L, H, wm, W / 2, H / 2, zc, -Math.PI / 2));
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, L), M(0x08101b, { r: 1 })); ce.rotation.x = Math.PI / 2; ce.position.set(0, H, zc); g.add(ce);
  g.add(new THREE.HemisphereLight(0x8fa6c8, 0x1a120a, 0.5));
  for (let i = 0; i < 5; i++) {
    const z = 2 - i * 8.5;
    const l = new THREE.PointLight(0xffdca0, 24, 16, 1.6); l.position.set(0, 5.6, z); g.add(l);
    g.add(box(2.2, 0.08, 0.5, M(0x111111, { e: 0xffe2a8, ei: 1.2 }), 0, H - 0.05, z));
  }
  // end wall: title + portrait
  const endZ = z0 - L;
  const endTex = ctex(1600, 640, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0d1a2c"); gr.addColorStop(1, "#07111F"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#D4AF37"; c.lineWidth = 6; c.strokeRect(30, 30, w - 60, h - 60);
    c.fillStyle = "#F4D58D"; c.textAlign = "center"; c.font = '700 84px "Noto Serif Display", Georgia, serif'; c.fillText("АҚЖІБЕК МҰҚАШЕВА", 570, 270);
    c.fillStyle = "#D4AF37"; c.font = 'italic 500 72px "Noto Serif Display", Georgia, serif'; c.fillText("Үнсіз ерлік", 570, 390);
    c.fillStyle = "#A9B4C4"; c.font = '400 34px Oswald, sans-serif'; c.fillText("ВИРТУАЛДЫ ТАРИХИ МУЗЕЙ · 5 БӨЛМЕ", 570, 490);
  });
  g.add(plane(W, H, M(0xffffff, { map: endTex, r: 0.9 }), 0, H / 2, endZ));
  const pf = new THREE.Group();
  pf.add(box(2.3, 2.9, 0.12, GOLD(), 0, 0, 0));
  pf.add(plane(2.1, 2.7, M(0xffffff, { map: imgTex("ai-face.jpg"), r: 0.8 }), 0, 0, 0.07));
  pf.position.set(3.15, 3.2, endZ + 0.12); g.add(pf);
  const nt = sprite("ЖИ реконструкциясы · түпнұсқа фото емес", { size: 26, scale: 2.4, w: 768, h: 96 }); nt.position.set(3.15, 1.45, endZ + 0.3); g.add(nt);
  markEx(pf, { kind: "info", t: "Ақжібектің реконструкцияланған бейнесі", d: D.AI_NOTE + " Бейне тарихи деректерге сүйеніп жасалған шартты визуал: 1940-жылдар, Мәскеудегі шифрлау бөлімі, жас қазақ әйел маман.", s: "Ғылыми жобаның 2-суреті", st: "mod" });
  const sp = new THREE.SpotLight(0xffe6b0, 40, 14, 0.45, 0.6, 1.4); sp.position.set(3.15, 6, endZ + 4); sp.target = pf; g.add(sp); g.add(sp.target);

  // doors
  const doorPos = { 1: [-1, -4], 2: [1, -10], 3: [-1, -16], 4: [1, -22], 5: [-1, -28] };
  D.ROOMS.forEach((r) => {
    const [side, z] = doorPos[r.n]; const x = side * (W / 2 - 0.02);
    const d = new THREE.Group();
    d.add(box(2.4, 3.9, 0.25, GOLD(), 0, 1.95, 0));
    d.add(box(2.0, 3.6, 0.2, M(0x3b2716, { r: 0.55 }), 0, 1.8, 0.08));
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) d.add(box(0.75, 1.4, 0.04, M(0x4d331d, { r: 0.5 }), -0.45 + k * 0.9, 1.0 + j * 1.6, 0.2));
    { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), GOLD()); kn.position.set(0.75, 1.75, 0.25); d.add(kn); }
    const lt = ctex(1024, 300, (c, w, h) => {
      c.fillStyle = "#07111F"; c.fillRect(0, 0, w, h); c.strokeStyle = r.color; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = r.color; c.font = '700 110px "Noto Serif Display", Georgia, serif'; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(String(r.n), 50, h / 2);
      c.fillStyle = "#F5F5F5"; c.font = '500 64px Oswald, sans-serif'; c.fillText(r.name.toUpperCase(), 170, h / 2 - 34);
      c.fillStyle = "#A9B4C4"; c.font = '400 40px "PT Sans", sans-serif'; c.fillText(r.sub, 170, h / 2 + 52);
    });
    d.add(plane(3.4, 1.0, B(lt), 0, 4.55, 0.15));
    const glow = new THREE.PointLight(new THREE.Color(r.color), 6, 5, 2); glow.position.set(0, 3, 1.2); d.add(glow);
    d.position.set(x, 0, z); d.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(d);
    markEx(d, { kind: "door", room: r.n, t: `${r.n}-бөлме · ${r.name}` });
    anims.push({ view: "hall", fn: (t) => { glow.intensity = 5 + Math.sin(t * 2 + r.n) * 1.5; } });
  });
  // floating dust
  const pg = new THREE.BufferGeometry(); const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * W; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = z0 - Math.random() * L; }
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf4d58d, size: 0.03, transparent: true, opacity: 0.6 })); g.add(pts);
  anims.push({ view: "hall", fn: (t) => { pts.rotation.y = Math.sin(t * 0.05) * 0.02; pts.position.y = Math.sin(t * 0.3) * 0.1; } });
}

/* ================= ROOMS ================= */
function exInfo(n, key) { const e = D.ROOMS[n - 1].exhibits[key]; return { kind: "info", room: n, key, ...e }; }

function room1() {
  const g = new THREE.Group(); g.position.x = ROOM_X(1); groups[1] = g; scene.add(g);
  shell(g, { wall: "#1d2a3c", stripe: "#D4AF37", light: 0xffdfa0 });
  // table
  const tb = new THREE.Group();
  tb.add(box(3.4, 0.12, 1.5, WOOD(), 0, 0.95, 0));
  [[-1.55, -0.6], [1.55, -0.6], [-1.55, 0.6], [1.55, 0.6]].forEach(([x, z]) => tb.add(box(0.1, 0.9, 0.1, DARKWOOD(), x, 0.45, z)));
  tb.position.set(0, 0, -2.4); g.add(tb);
  // books
  const books = new THREE.Group(); const cols = [0x6b1f1a, 0x1f3b5a, 0x3d4a1e, 0x5a3d24, 0x2b2b44];
  for (let i = 0; i < 5; i++) { const b = box(0.62 - i * 0.03, 0.12, 0.45, M(cols[i], { r: 0.8 }), 0, 0.07 + i * 0.125, 0); b.rotation.y = (i % 2 ? 0.12 : -0.08); books.add(b); }
  const ob = box(0.5, 0.04, 0.7, PAPER(ctex(256, 360, (c, w, h) => { c.fillStyle = "#f1e6c9"; c.fillRect(0, 0, w, h); c.fillStyle = "#3a2c1a"; c.font = "22px PT Mono, monospace"; for (let i = 0; i < 12; i++) c.fillText("x² + y² = r²   ∑".slice(0, 6 + (i % 9)), 16, 34 + i * 26); })), 0.75, 0.04, 0);
  books.add(ob); books.position.set(-1.0, 1.0, -2.4); g.add(books); markEx(books, exInfo(1, "books"));
  // diploma
  const dip = new THREE.Group();
  dip.add(box(0.7, 0.5, 0.04, GOLD(), 0, 0, 0));
  dip.add(plane(0.62, 0.42, PAPER(ctex(620, 420, (c, w, h) => { c.fillStyle = "#efe2c0"; c.fillRect(0, 0, w, h); c.strokeStyle = "#8a6d1c"; c.lineWidth = 8; c.strokeRect(14, 14, w - 28, h - 28); c.fillStyle = "#5b1a12"; c.textAlign = "center"; c.font = '700 64px "Noto Serif Display", serif'; c.fillText("ДИПЛОМ", w / 2, 130); c.fillStyle = "#3a2c1a"; c.font = "28px PT Sans, sans-serif"; c.fillText("Механика-математика факультеті", w / 2, 210); c.fillText("1940", w / 2, 260); c.font = "italic 22px PT Sans"; c.fillStyle = "#7b6040"; c.fillText("тарихи-көркем макет", w / 2, 360); })), 0, 0, 0.025));
  dip.position.set(0.7, 1.26, -2.75); dip.rotation.x = -0.25; g.add(dip); markEx(dip, exInfo(1, "diploma"));
  // lamp
  const lamp = new THREE.Group(); lamp.add(cyl(0.15, 0.2, 0.05, M(0x222222), 0, 0, 0)); lamp.add(cyl(0.02, 0.02, 0.6, M(0x333333, { m: 0.6 }), 0, 0.3, 0));
  lamp.add(cyl(0.08, 0.25, 0.22, M(0x1f3b2e, { e: 0x332200 }), 0, 0.62, 0)); const ll = new THREE.PointLight(0xffd98a, 4, 4, 2); ll.position.set(0, 0.5, 0.1); lamp.add(ll);
  lamp.position.set(1.4, 1.01, -2.5); g.add(lamp);
  anims.push({ view: 1, fn: (t) => { ll.intensity = 4 + (Math.random() < 0.02 ? -2 : 0); } });
  // blackboard
  const bb = new THREE.Group();
  bb.add(box(3.9, 2.2, 0.08, WOOD(), 0, 0, 0));
  bb.add(plane(3.7, 2.0, M(0xffffff, { r: 0.95, map: ctex(1024, 560, (c, w, h) => {
    c.fillStyle = "#1c2b22"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(255,255,255,.04)"; for (let i = 0; i < 60; i++) c.fillRect(Math.random() * w, Math.random() * h, 80, 2);
    c.fillStyle = "#e9efe6"; c.font = "48px PT Mono, monospace";
    ["∫₀¹ x² dx = 1/3", "a² + b² = c²", "P(A|B) = P(A∩B)/P(B)", "x ≡ y (mod 42)", "f(n) = 2n + 1"].forEach((s, i) => c.fillText(s, 50, 90 + i * 95));
    c.font = "italic 30px PT Sans"; c.fillStyle = "#f4d58d"; c.fillText("Математика → шифр", 640, 520);
  }) }), 0, 0, 0.05));
  bb.position.set(-3, 2.7, -6.9); g.add(bb); markEx(bb, exInfo(1, "board"));
  // Orenburg map
  const mp = new THREE.Group(); mp.add(box(3.5, 2.4, 0.06, GOLD(), 0, 0, 0));
  mp.add(plane(3.3, 2.2, PAPER(ctex(1024, 680, (c, w, h) => {
    c.fillStyle = "#d9c9a1"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(90,61,36,.25)"; for (let x = 0; x < w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.strokeStyle = "#3d6b8a"; c.lineWidth = 14; c.beginPath(); c.moveTo(0, 470); c.bezierCurveTo(250, 380, 420, 560, 620, 450); c.bezierCurveTo(800, 360, 900, 470, w, 400); c.stroke();
    c.strokeStyle = "#3d6b8a"; c.lineWidth = 7; c.beginPath(); c.moveTo(560, 470); c.bezierCurveTo(560, 300, 640, 200, 700, 0); c.stroke();
    c.fillStyle = "#7a1f15"; c.beginPath(); c.arc(560, 420, 16, 0, 7); c.fill();
    c.font = '700 70px "Noto Serif Display", serif'; c.fillStyle = "#3a2c1a"; c.fillText("ОРЫНБОР", 330, 360);
    c.font = "34px PT Mono, monospace"; c.fillText("1919", 600, 520); c.fillText("Жайық өзені", 60, 560);
    c.font = "italic 26px PT Sans"; c.fillStyle = "#6b4a28"; c.fillText("көркем макет", 820, 650);
  })), 0, 0, 0.04));
  mp.position.set(3, 2.7, -6.9); g.add(mp); markEx(mp, exInfo(1, "map"));
  // MSU illustration (west wall)
  const ms = new THREE.Group(); ms.add(box(3.6, 2.6, 0.06, GOLD(), 0, 0, 0));
  ms.add(plane(3.4, 2.4, PAPER(ctex(1024, 720, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#2b3c57"); gr.addColorStop(1, "#c9a96a"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = "#1a1410";
    c.fillRect(170, 430, 680, 260); c.fillRect(260, 330, 500, 120); c.fillRect(380, 210, 260, 140); c.fillRect(450, 120, 120, 110); c.fillRect(495, 30, 30, 100);
    c.fillStyle = "#f4d58d"; for (let y = 450; y < 680; y += 34) for (let x = 190; x < 840; x += 30) if ((x + y) % 4 < 2) c.fillRect(x, y, 10, 16);
    c.font = '700 64px "Noto Serif Display", serif'; c.fillStyle = "#F5F5F5"; c.fillText("ММУ · 1940", 40, 90);
    c.font = "italic 28px PT Sans"; c.fillStyle = "#F4D58D"; c.fillText("көркем иллюстрация", 40, 140);
  })), 0, 0, 0.04));
  ms.position.set(-6.9, 2.8, -0.5); ms.rotation.y = Math.PI / 2; g.add(ms); markEx(ms, exInfo(1, "msu"));
  // portrait (east wall)
  const pr = new THREE.Group(); pr.add(box(2.0, 2.5, 0.1, GOLD(), 0, 0, 0));
  pr.add(plane(1.84, 2.34, M(0xffffff, { map: imgTex("ai-face.jpg"), r: 0.85 }), 0, 0, 0.06));
  pr.position.set(6.9, 2.8, -0.5); pr.rotation.y = -Math.PI / 2; g.add(pr); markEx(pr, exInfo(1, "portrait"));
  const pn = sprite("ЖИ реконструкциясы · түпнұсқа фото емес", { size: 26, scale: 2.2, w: 768, h: 96 }); pn.position.set(6.6, 1.25, -0.5); g.add(pn);
  const sp = new THREE.SpotLight(0xffe6b0, 30, 10, 0.5, 0.6, 1.5); sp.position.set(3, 5.5, -0.5); sp.target = pr; g.add(sp);
  // year posts
  [["1919", -2.4], ["1940", 0], ["1941", 2.4]].forEach(([y, x]) => { const s = sprite(y, { size: 64, scale: 1.0, w: 256, h: 112 }); s.position.set(x, 4.3, -5.2); g.add(s); });
}

function room2() {
  const g = new THREE.Group(); g.position.x = ROOM_X(2); groups[2] = g; scene.add(g);
  shell(g, { wall: "#16262f", stripe: "#35C7D8", light: 0xd8f2ff, li: 18, sky: 0x8fd0de });
  // desk
  g.add(box(4.2, 0.12, 1.6, WOOD(), 0, 0.95, -2.2));
  [[-2, -2.9], [2, -2.9], [-2, -1.5], [2, -1.5]].forEach(([x, z]) => g.add(box(0.1, 0.9, 0.1, DARKWOOD(), x, 0.45, z)));
  // radio
  const rd = new THREE.Group();
  rd.add(box(1.2, 0.65, 0.55, M(0x3a2e20, { r: 0.6 }), 0, 0.33, 0));
  rd.add(plane(0.6, 0.3, M(0x0d151f, { e: 0x0b3a40, ei: 1 }), -0.22, 0.4, 0.28));
  const dial = cyl(0.13, 0.13, 0.06, GOLD(), 0.35, 0.38, 0.29); dial.rotation.x = Math.PI / 2; rd.add(dial);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M(0xff3020, { e: 0xff3020, ei: 2 })); led.position.set(0.5, 0.58, 0.28); rd.add(led);
  const ant = cyl(0.01, 0.01, 0.9, M(0x999999, { m: 0.8 }), 0.45, 1.05, -0.1); ant.rotation.z = -0.4; rd.add(ant);
  rd.position.set(-1.3, 1.01, -2.4); g.add(rd); markEx(rd, exInfo(2, "radio"));
  anims.push({ view: 2, fn: (t) => { led.material.emissiveIntensity = Math.sin(t * 6) > 0 ? 2.4 : 0.2; dial.rotation.y = Math.sin(t * 0.7) * 0.6; } });
  // cipher device
  const cd = new THREE.Group();
  cd.add(box(1.0, 0.25, 0.7, M(0x2b313b, { r: 0.4, m: 0.5 }), 0, 0.12, 0));
  for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) { const key = cyl(0.035, 0.035, 0.05, M(0xe0d8c0), -0.39 + k * 0.13 + (r % 2) * 0.06, 0.27, 0.18 - r * 0.11, 12); cd.add(key); }
  const rotors = [];
  for (let i = 0; i < 3; i++) { const ro = cyl(0.11, 0.11, 0.07, GOLD(), -0.15 + i * 0.15, 0.36, -0.22, 20); ro.rotation.z = Math.PI / 2; cd.add(ro); rotors.push(ro); }
  cd.position.set(0.9, 1.01, -2.3); g.add(cd); markEx(cd, exInfo(2, "cipher"));
  anims.push({ view: 2, fn: (t, dt) => { rotors.forEach((r, i) => r.rotation.x += dt * (0.6 + i * 0.5)); } });
  // messages
  const msgs = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = plane(0.5, 0.7, PAPER(ctex(300, 420, (c, w, h) => { c.fillStyle = "#f1e6c9"; c.fillRect(0, 0, w, h); c.fillStyle = "#7a1f15"; c.font = "bold 22px PT Mono"; c.fillText("СОВ. СЕКРЕТНО", 20, 36); c.fillStyle = "#2a1d0e"; c.font = "22px PT Mono"; for (let k = 0; k < 11; k++) c.fillText(Array.from({ length: 4 }, () => String(Math.floor(Math.random() * 90000) + 10000)).join(" ").slice(0, 21), 18, 80 + k * 30); })));
    p.rotation.x = -Math.PI / 2; p.rotation.z = (i - 1.5) * 0.18; p.position.set(-0.6 + i * 0.4, 0.005 + i * 0.002, 0); msgs.add(p);
  }
  msgs.position.set(0, 1.02, -1.75); g.add(msgs); markEx(msgs, exInfo(2, "msgs"));
  // military map
  const mm = new THREE.Group(); mm.add(box(6.2, 2.8, 0.06, DARKWOOD(), 0, 0, 0));
  mm.add(plane(6, 2.6, PAPER(ctex(1400, 600, (c, w, h) => {
    c.fillStyle = "#cdbb8e"; c.fillRect(0, 0, w, h); c.strokeStyle = "rgba(60,40,20,.25)"; for (let x = 0; x < w; x += 70) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 70) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = "#3a2c1a"; c.font = '600 44px Oswald, sans-serif';
    const chain = ["БАРЛАУ АРНАСЫ", "ҚҰПИЯ ХАБАР", "ШИФРЛАНҒАН МӘТІН", "ШИФРЛАУШЫ", "ӘСКЕРИ БАСҚАРУ"];
    chain.forEach((s, i) => { const x = 40 + i * 275, y = 260 + (i % 2) * 90; c.fillStyle = i === 3 ? "#7a1f15" : "#3a2c1a"; c.strokeStyle = c.fillStyle; c.lineWidth = 4; c.strokeRect(x, y - 50, 250, 80); c.font = '500 26px Oswald, sans-serif'; c.fillText(s, x + 14, y); if (i < 4) { c.beginPath(); c.moveTo(x + 250, y - 10); c.lineTo(x + 275, y + (i % 2 ? -90 : 90) - 10); c.stroke(); } });
    c.fillStyle = "#7a1f15"; c.font = '700 54px Oswald, sans-serif'; c.fillText("АҚПАРАТ ТІЗБЕГІ · ОҚУ СХЕМАСЫ", 40, 90);
  })), 0, 0, 0.04));
  mm.position.set(0, 3.1, -6.9); g.add(mm); markEx(mm, exInfo(2, "map"));
  // typewriter on side table
  g.add(box(1.6, 0.1, 1.0, WOOD(), -4.6, 0.85, 1.2)); [[-5.3, 0.8], [-3.9, 0.8], [-5.3, 1.6], [-3.9, 1.6]].forEach(([x, z]) => g.add(box(0.08, 0.8, 0.08, DARKWOOD(), x, 0.4, z)));
  const tw = new THREE.Group();
  tw.add(box(0.9, 0.22, 0.6, M(0x1d1d1f, { r: 0.4, m: 0.3 }), 0, 0.11, 0));
  tw.add(box(0.95, 0.1, 0.12, M(0x2a2a2c, { m: 0.4 }), 0, 0.3, -0.2));
  tw.add(plane(0.6, 0.4, PAPER(ctex(300, 200, (c, w, h) => { c.fillStyle = "#f3e9d0"; c.fillRect(0, 0, w, h); c.fillStyle = "#222"; c.font = "18px PT Mono"; c.fillText("ХАБАР ҚАБЫЛДАНДЫ", 20, 50); c.fillText("ОРТАЛЫҚҚА...", 20, 80); })), 0, 0.5, -0.24));
  for (let k = 0; k < 10; k++) tw.add(cyl(0.025, 0.025, 0.03, M(0xc9c2ad), -0.36 + k * 0.08, 0.24, 0.15, 10));
  tw.position.set(-4.6, 0.9, 1.2); g.add(tw); markEx(tw, exInfo(2, "typewriter"));
  // cabinet
  const cb = new THREE.Group(); cb.add(box(1.2, 2.8, 0.8, M(0x4a3a24, { r: 0.6 }), 0, 1.4, 0));
  for (let i = 0; i < 4; i++) { cb.add(box(1.05, 0.58, 0.04, M(0x5a4730, { r: 0.55 }), 0, 0.45 + i * 0.66, 0.41)); cb.add(box(0.25, 0.05, 0.05, GOLD(), 0, 0.5 + i * 0.66, 0.45)); }
  cb.position.set(5.9, 0, -3); cb.rotation.y = -Math.PI / 2; g.add(cb); markEx(cb, exInfo(2, "cabinet"));
  // radio waves sprite rings
  const rings = [];
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.008, 6, 48), new THREE.MeshBasicMaterial({ color: 0x35c7d8, transparent: true, opacity: 0.6 })); r.position.set(-0.85, 2.0, -2.5); g.add(r); rings.push(r); }
  anims.push({ view: 2, fn: (t) => { rings.forEach((r, i) => { const k = ((t * 0.5 + i / 3) % 1); r.scale.setScalar(0.3 + k * 2.2); r.material.opacity = 0.7 * (1 - k); }); } });
}

function room3() {
  const g = new THREE.Group(); g.position.x = ROOM_X(3); groups[3] = g; scene.add(g);
  shell(g, { wall: "#1b2433", stripe: "#F4D58D", light: 0xfff0c8, li: 16 });
  // map table
  const TW = 7, TD = 4.2;
  const fx = (lon) => lon <= 60 ? 0.04 + ((lon + 5) / 65) * 0.62 : 0.66 + ((lon - 60) / 85) * 0.3, fy = (lat) => 0.06 + ((61 - lat) / 27) * 0.84;
  const tx = (lon) => -TW / 2 + fx(lon) * TW, tz = (lat) => -TD / 2 + fy(lat) * TD;
  const mapTex = ctex(1400, 840, (c, w, h) => {
    c.fillStyle = "#0b1a2c"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(53,199,216,.18)"; c.lineWidth = 1;
    for (const lon of [0, 10, 20, 30, 40, 50, 60, 80, 100, 120, 140]) { const x = fx(lon) * w; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (const lat of [40, 50, 60]) { const y = fy(lat) * h; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = "rgba(244,213,141,.7)"; c.font = "26px PT Mono"; c.fillText("СХЕМАЛЫҚ КАРТА · МАСШТАБСЫЗ", 30, h - 30);
    c.font = '600 40px Oswald, sans-serif'; c.fillStyle = "#F4D58D"; c.fillText("АҚПАРАТТЫҚ МАЙДАН", 30, 60);
    const LB = { orenburg: [18, 40, 'left'], oral: [-18, 44, 'right'], moscow: [-14, -22, 'right'], berlin: [0, -26, 'center'], brussels: [0, 50, 'center'], tokyo: [-18, -18, 'right'], khasan: [-18, -18, 'right'] };
    D.MAP.points.forEach((p) => { const x = fx(p.lon) * w, y = fy(p.lat) * h, l = LB[p.id] || [18, -16, 'left']; c.fillStyle = "#F5F5F5"; c.font = '500 30px Oswald, sans-serif'; c.textAlign = l[2]; c.fillText(p.name, x + l[0], y + l[1]); }); c.textAlign = 'left';
  });
  const table = new THREE.Group();
  table.add(box(TW + 0.4, 0.2, TD + 0.4, DARKWOOD(), 0, 0.9, 0));
  const top = plane(TW, TD, B(mapTex)); top.rotation.x = -Math.PI / 2; top.position.y = 1.005; table.add(top);
  [[-3.5, -2], [3.5, -2], [-3.5, 2], [3.5, 2]].forEach(([x, z]) => table.add(box(0.16, 0.8, 0.16, DARKWOOD(), x, 0.4, z)));
  g.add(table);
  markEx(top, exInfo(3, "table"));
  const colors = { pub: 0xd4af37, mod: 0x35c7d8, unc: 0xe8b04b };
  const P = {};
  D.MAP.points.forEach((p) => {
    const pin = new THREE.Group();
    pin.add(cyl(0.025, 0.025, 0.35, M(0xdddddd, { m: 0.7 }), 0, 0.17, 0, 8));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), M(colors[p.kind], { e: colors[p.kind], ei: 0.8 })); head.position.y = 0.38; pin.add(head);
    pin.position.set(tx(p.lon), 1.01, tz(p.lat)); g.add(pin); P[p.id] = pin.position.clone().setY(1.4);
    markEx(pin, { kind: "info", t: p.name, d: p.text, s: "Тарихи карта", st: p.kind });
    anims.push({ view: 3, fn: (t) => { head.position.y = 0.38 + Math.sin(t * 2 + p.lon) * 0.03; } });
  });
  D.MAP.links.forEach((l, i) => {
    const a = P[l.from], b = P[l.to]; const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 0.5 + a.distanceTo(b) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(60));
    const mat = l.kind === "pub" ? new THREE.LineBasicMaterial({ color: colors.pub }) : new THREE.LineDashedMaterial({ color: colors[l.kind], dashSize: l.kind === "unc" ? 0.05 : 0.15, gapSize: 0.1 });
    const line = new THREE.Line(geo, mat); if (l.kind !== "pub") line.computeLineDistances(); g.add(line);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: colors[l.kind] })); g.add(dot);
    anims.push({ view: 3, fn: (t) => { dot.position.copy(curve.getPoint(((t * 0.25) + i * 0.17) % 1)); } });
  });
  // topic posters on walls
  D.MAP.topics.forEach((tp, i) => {
    const pst = new THREE.Group();
    pst.add(box(1.9, 1.3, 0.05, GOLD(), 0, 0, 0));
    pst.add(plane(1.8, 1.2, PAPER(ctex(720, 480, (c, w, h) => { c.fillStyle = "#e9dcbc"; c.fillRect(0, 0, w, h); c.fillStyle = "#7a1f15"; c.font = '600 54px Oswald, sans-serif'; c.fillText(tp.t, 30, 80); c.fillStyle = "#3a2c1a"; c.font = "26px PT Sans, sans-serif"; wrapText(c, tp.d, 30, 140, w - 60, 34); })), 0, 0, 0.03));
    const north = i < 3;
    if (north) { pst.position.set(-4 + i * 4, 3.0, -6.9); }
    else { pst.position.set(-6.9, 3.0, -3.5 + (i - 3) * 3); pst.rotation.y = Math.PI / 2; }
    g.add(pst); markEx(pst, { kind: "info", t: tp.t, d: tp.d, s: "Ақпараттық майдан", st: i < 2 ? "pub" : "mod" });
  });
  // radio corner
  const rd = new THREE.Group(); rd.add(box(1, 0.6, 0.5, M(0x3a2e20), 0, 0.3, 0)); const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), M(0x35c7d8, { e: 0x35c7d8, ei: 2 })); led.position.set(0.4, 0.5, 0.26); rd.add(led);
  g.add(box(1.4, 0.8, 0.8, DARKWOOD(), 5.5, 0.4, 4.6)); rd.position.set(5.5, 0.8, 4.6); rd.rotation.y = -0.8; g.add(rd); markEx(rd, exInfo(3, "radio"));
  anims.push({ view: 3, fn: (t) => { led.material.emissiveIntensity = Math.sin(t * 8) > 0.3 ? 2.5 : 0.2; } });
}

function room4() {
  const g = new THREE.Group(); g.position.x = ROOM_X(4); groups[4] = g; scene.add(g);
  shell(g, { wall: "#1f1912", stripe: "#70543B", light: 0xd9c49a, li: 9, hemi: 0.3, sky: 0x6a5a48 });
  // shelves with folders
  for (let s = 0; s < 3; s++) {
    const sh = new THREE.Group(); sh.add(box(3.2, 3.6, 0.6, M(0x2e2116), 0, 1.8, 0));
    for (let r = 0; r < 4; r++) { sh.add(box(3.0, 0.05, 0.55, M(0x3d2c1c), 0, 0.4 + r * 0.85, 0.02)); for (let k = 0; k < 9; k++) if (Math.random() > 0.2) { const f = box(0.08 + Math.random() * 0.08, 0.55 + Math.random() * 0.15, 0.45, M([0x8a6a45, 0x6b4f30, 0x9c8058, 0x5a4229][k % 4], { r: 0.9 }), -1.35 + k * 0.33, 0.73 + r * 0.85, 0.04); f.rotation.z = (Math.random() - 0.5) * 0.15; sh.add(f); } }
    sh.position.set(-3.6 + s * 3.6, 0, -6.6); g.add(sh);
  }
  // table with open folders
  g.add(box(2.8, 0.1, 1.4, M(0x3b2a1a), 0, 0.9, -1.2)); [[-1.3, -1.8], [1.3, -1.8], [-1.3, -0.6], [1.3, -0.6]].forEach(([x, z]) => g.add(box(0.08, 0.85, 0.08, DARKWOOD(), x, 0.43, z)));
  const fold = new THREE.Group();
  [-0.7, 0, 0.7].forEach((x, i) => {
    const f = box(0.6, 0.02, 0.8, M(0x9c7a4c), x, 0, 0); f.rotation.y = (i - 1) * 0.15; fold.add(f);
    const p = plane(0.5, 0.7, PAPER(ctex(300, 420, (c, w, h) => { c.fillStyle = "#efe3c6"; c.fillRect(0, 0, w, h); c.fillStyle = "#7a1f15"; c.font = "bold 26px PT Mono"; c.fillText(["1942", "1945", "?"][i], 20, 44); c.fillStyle = "#3a2c1a"; c.font = "17px PT Mono"; for (let k = 0; k < 12; k++) c.fillText("▬▬▬ ▬▬ ▬▬▬▬ ▬▬".slice(0, 6 + ((k * 5) % 10)), 20, 90 + k * 26); c.strokeStyle = "#7a1f15"; c.lineWidth = 4; c.strokeRect(150, 330, 120, 50); c.fillStyle = "#7a1f15"; c.font = "bold 18px Oswald"; c.fillText("ІС", 192, 362); })));
    p.rotation.x = -Math.PI / 2; p.rotation.z = -(i - 1) * 0.15; p.position.set(x, 0.015, 0); fold.add(p);
  });
  fold.position.set(0, 0.96, -1.2); g.add(fold); markEx(fold, exInfo(4, "folders"));
  // clock on west wall
  const ck = new THREE.Group();
  const face = cyl(0.8, 0.8, 0.08, M(0xffffff, { map: ctex(512, 512, (c, w, h) => { c.fillStyle = "#e9dcbc"; c.beginPath(); c.arc(256, 256, 250, 0, 7); c.fill(); c.fillStyle = "#3a2c1a"; c.font = '600 40px Oswald'; c.textAlign = "center"; c.textBaseline = "middle"; for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; c.fillText(String(i), 256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200); } c.font = "22px PT Mono"; c.fillText("XII · 1942", 256, 330); }) }), 0, 0, 0, 40);
  face.rotation.x = Math.PI / 2; ck.add(face);
  { const rim = cyl(0.86, 0.86, 0.06, GOLD(), 0, 0, -0.03, 40); rim.rotation.x = Math.PI / 2; ck.add(rim); }
  const hh = box(0.05, 0.4, 0.02, M(0x111111), 0, 0.17, 0.06), mh = box(0.035, 0.6, 0.02, M(0x111111), 0, 0.27, 0.07);
  const hp = new THREE.Group(); hp.add(hh); hp.position.z = 0.0; const mp = new THREE.Group(); mp.add(mh); ck.add(hp, mp);
  hp.rotation.z = -Math.PI * 2 * (11 / 12); mp.rotation.z = -Math.PI * 2 * (55 / 60);
  ck.position.set(-6.9, 3.3, 0); ck.rotation.y = Math.PI / 2; g.add(ck); markEx(ck, exInfo(4, "clock"));
  anims.push({ view: 4, fn: (t) => { mp.rotation.z = -Math.PI * 2 * (55 / 60) - Math.floor(t) * 0.004; } });
  // closed door on east wall
  const dr = new THREE.Group();
  dr.add(box(2.4, 3.9, 0.2, M(0x2a1f15), 0, 1.95, 0)); dr.add(box(2.0, 3.6, 0.2, M(0x3b2a1a), 0, 1.8, 0.06));
  for (let i = 0; i < 6; i++) { const ch = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), M(0x777777, { m: 0.8, r: 0.4 })); ch.position.set(-0.9 + i * 0.36, 1.9 + Math.sin(i) * 0.05, 0.22); ch.rotation.y = i % 2 ? Math.PI / 2 : 0; dr.add(ch); }
  dr.add(box(0.35, 0.45, 0.12, M(0x555555, { m: 0.8 }), 0, 1.75, 0.25));
  dr.add(plane(1.6, 0.5, M(0xffffff, { map: ctex(512, 160, (c, w, h) => { c.fillStyle = "#e9dcbc"; c.fillRect(0, 0, w, h); c.strokeStyle = "#7a1f15"; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = "#7a1f15"; c.font = '700 80px Oswald'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("ЖАБЫҚ", w / 2, h / 2); }) }), 0, 3.1, 0.18));
  dr.position.set(6.9, 0, 0); dr.rotation.y = -Math.PI / 2; g.add(dr); markEx(dr, exInfo(4, "door"));
  // floating question mark
  const q = sprite("?", { size: 120, w: 256, h: 256, scale: 1.2, bg: "rgba(0,0,0,0)", stroke: "rgba(0,0,0,0)", color: "#D4AF37", weight: 600 });
  q.position.set(0, 3.4, -1.2); g.add(q);
  const tag = sprite("Тарихтағы белгісіздік – жаңа зерттеудің бастамасы", { size: 28, w: 1024, h: 96, scale: 4.2 }); tag.position.set(0, 4.6, -4.5); g.add(tag);
  const spot = new THREE.SpotLight(0xffd9a0, 30, 9, 0.38, 0.8, 1.4); spot.position.set(0, 5.8, -1.2); spot.target = fold; g.add(spot);
  anims.push({ view: 4, fn: (t) => { q.position.y = 3.4 + Math.sin(t) * 0.12; q.material.opacity = 0.65 + Math.sin(t * 1.3) * 0.3; spot.intensity = 28 + Math.sin(t * 0.8) * 6; } });
}

function room5() {
  const g = new THREE.Group(); g.position.x = ROOM_X(5); groups[5] = g; scene.add(g);
  shell(g, { wall: "#0a1626", stripe: "#35C7D8", light: 0xbfefff, li: 14, sky: 0x6fd6e6 });
  // big screen
  const sc = new THREE.Group();
  sc.add(box(7.4, 4.3, 0.15, M(0x0b0f16, { e: 0x0a3a44, ei: 0.6, m: 0.4 }), 0, 0, 0));
  const scr = plane(7.1, 4.0, B(imgTex("ai-face-wide.jpg")), 0, 0, 0.08);
  sc.add(scr);
  const playT = sprite("▶  Бейнені көру", { size: 40, w: 512, h: 112, scale: 1.8, stroke: "#35C7D8", color: "#F5F5F5" }); playT.position.set(-2.4, -1.5, 0.2); sc.add(playT);
  sc.position.set(0, 3.1, -6.85); g.add(sc); markEx(sc, exInfo(5, "screen"));
  const ai = sprite("ЖИ реконструкциясы · түпнұсқа тарихи фотосурет емес", { size: 26, w: 1024, h: 80, scale: 4.2 }); ai.position.set(0, 0.75, -6.6); g.add(ai);
  // pedestals with ALGO stages
  const N = D.ALGO.length;
  D.ALGO.forEach((a, i) => {
    const ang = -1.15 + (i / (N - 1)) * 2.3;
    const x = Math.sin(ang) * 3.8, z = 0.8 - Math.cos(ang) * 3.0 + 1.6;
    const pd = new THREE.Group();
    pd.add(cyl(0.38, 0.45, 1.0, M(0x14243b, { r: 0.4, m: 0.4 }), 0, 0.5, 0));
    pd.add(cyl(0.4, 0.4, 0.05, M(0x35c7d8, { e: 0x35c7d8, ei: 1.2 }), 0, 1.02, 0));
    const holo = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), M(0x35c7d8, { e: 0x35c7d8, ei: 0.8, t: true, op: 0.75 })); holo.position.y = 1.45; pd.add(holo);
    const lab = sprite(`${i + 1} · ${a.k}`, { size: 40, w: 640, h: 112, scale: 1.5, stroke: "#35C7D8" }); lab.position.y = 1.95; pd.add(lab);
    pd.position.set(x, 0, z); g.add(pd);
    markEx(pd, { kind: "algo", i, t: `${i + 1}. ${a.k}`, d: a.goal, s: "Жобаның алгоритмі", st: "mod" });
    anims.push({ view: 5, fn: (t) => { holo.rotation.y = t * 1.2 + i; holo.position.y = 1.45 + Math.sin(t * 2 + i) * 0.06; } });
  });
  // floor ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: 0x35c7d8, transparent: true, opacity: 0.7 })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, 0.8); g.add(ring);
  const ring2 = ring.clone(); ring2.scale.setScalar(0.6); g.add(ring2);
  anims.push({ view: 5, fn: (t) => { ring.rotation.z = t * 0.3; ring2.rotation.z = -t * 0.5; ring.material.opacity = 0.45 + Math.sin(t * 2) * 0.25; } });
  // data particles rising
  const pg = new THREE.BufferGeometry(); const NN = 200, pos = new Float32Array(NN * 3);
  for (let i = 0; i < NN; i++) { pos[i * 3] = (Math.random() - 0.5) * 12; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = (Math.random() - 0.5) * 12; }
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x35c7d8, size: 0.04, transparent: true, opacity: 0.7 })); g.add(pts);
  anims.push({ view: 5, fn: (t, dt) => { const a = pg.attributes.position.array; for (let i = 1; i < a.length; i += 3) { a[i] += dt * 0.3; if (a[i] > 6) a[i] = 0; } pg.attributes.position.needsUpdate = true; } });
}

/* ================= VIEWS ================= */
const VIEWS = {
  hall: { target: new THREE.Vector3(0, 2.2, -14), yaw: 0, pitch: 0.06, dist: 14, min: 3, max: 18, yawLim: 0.9 },
  room: (n) => ({ target: new THREE.Vector3(ROOM_X(n), 1.7, -1.2), yaw: 0, pitch: 0.18, dist: 6.2, min: 1.8, max: 7.0 })
};
function applyView(v, instant) {
  view = v;
  Object.entries(groups).forEach(([k, g]) => g.visible = String(k) === String(v));
  if (v === "hall") {
    setOrbit(VIEWS.hall, instant);
    ui.title.innerHTML = `Музей дәлізі<small>Бес есіктің бірін таңдаңыз</small>`;
    setGuide("Музейге қош келдіңіз. Дәлізде бес есік бар: өмір жолы, құпия қызмет, ақпараттық майдан, үзілген тағдыр және тарихты тірілткен жасанды интеллект. Есікті басып, бөлмеге кіріңіз.");
    ui.task.disabled = true; ui.hint.textContent = "Есікті басыңыз"; showHint();
    scene.fog = new THREE.Fog(0x05080d, 10, 46);
  } else {
    const r = D.ROOMS[v - 1];
    setOrbit(VIEWS.room(v), instant);
    ui.title.innerHTML = `${r.n}-бөлме · ${App.esc(r.name)}<small>${App.esc(r.sub)}</small>`;
    setGuide(r.guide);
    ui.task.disabled = false; ui.hint.textContent = "Экспонатты басыңыз"; showHint();
    scene.fog = new THREE.Fog(0x05080d, 9, 26);
  }
  closePanel();
}
function showHint() { ui.hint.style.opacity = 1; clearTimeout(showHint.t); showHint.t = setTimeout(() => ui.hint.style.opacity = 0, 2600); }
let guideOn = false;
function setGuide(text) {
  ui.guide.textContent = text;
  if (guideOn) App.Speech.speak(text, () => { if (tour.on) tour.next(); });
}
function go(v) {
  if (String(v) === String(view)) return;
  App.Speech.stop();
  ui.fade.style.opacity = 1;
  setTimeout(() => { applyView(v, true); setTimeout(() => ui.fade.style.opacity = 0, 60); }, reduced ? 0 : 420);
}
function walkToDoor(n) {
  const door = groups.hall.children.find((c) => c.userData.ex && c.userData.ex.kind === "door" && c.userData.ex.room === n);
  if (door) { orbit.goal.target.copy(door.position).setY(2); orbit.goal.dist = 4.5; orbit.goal.yaw = door.position.x < 0 ? -0.9 : 0.9; }
  setTimeout(() => go(n), reduced ? 0 : 450);
}

/* ---------- panel ---------- */
function closePanel() { ui.panel.hidden = true; ui.panel.innerHTML = ""; }
function openPanel(html, build) {
  ui.panel.hidden = false; ui.panel.innerHTML = "";
  const c = document.createElement("button"); c.className = "m-btn close"; c.textContent = "✕"; c.setAttribute("aria-label", "Панельді жабу"); c.onclick = closePanel;
  ui.panel.appendChild(c);
  const body = document.createElement("div"); body.className = "grid"; body.style.gap = "14px"; body.innerHTML = html || ""; ui.panel.appendChild(body);
  build && build(body);
  ui.panel.scrollTop = 0;
}
function showExhibit(ex) {
  App.beep(660, 0.05, 0.03);
  if (ex.kind === "algo") {
    const a = D.ALGO[ex.i];
    openPanel(`<span class="eyebrow">Алгоритм · ${ex.i + 1}/7</span><h3>${App.esc(a.k)}</h3>
      <dl style="margin:0;display:grid;gap:8px"><dt class="eyebrow" style="font-size:.7rem">Мақсаты</dt><dd style="margin:0">${App.esc(a.goal)}</dd><dt class="eyebrow" style="font-size:.7rem">Әдіс</dt><dd style="margin:0">${App.esc(a.method)}</dd><dt class="eyebrow" style="font-size:.7rem">Орындалған жұмыс</dt><dd style="margin:0">${App.esc(a.done)}</dd><dt class="eyebrow" style="font-size:.7rem">Нәтиже</dt><dd style="margin:0">${App.esc(a.result)}</dd></dl>
      <figure style="margin:0;border-radius:10px;overflow:hidden;border:1px solid var(--line)"><img src="${a.img}" alt="" style="width:100%;display:block">${a.ai ? `<figcaption class="ai-note">${App.esc(D.AI_NOTE)}</figcaption>` : ""}</figure>
      ${a.video ? `<button class="btn small primary" data-video="${a.video}">▶ Видеоны көру</button>` : ""}`);
    setGuide(`${a.k}. ${a.goal} ${a.result}`);
    return;
  }
  openPanel(`<span class="eyebrow">${ex.room ? ex.room + "-бөлме · экспонат" : "Экспонат"}</span><h3>${App.esc(ex.t)}</h3>${App.chip(ex.st)}<p>${App.esc(ex.d)}</p><p class="src">Дереккөз: ${App.esc(ex.s || "—")}</p>
    ${ex.ai ? `<p class="ai-note" style="border-radius:8px">${App.esc(D.AI_NOTE)}</p>` : ""}
    ${ex.key === "screen" ? `<div class="cta"><button class="btn small primary" data-video="film">▶ Тарихи бейнені көру</button><button class="btn small" data-video="process">Жасалу процесі</button></div>` : ""}
    ${ex.room ? `<button class="btn small" id="mpTask">Бөлме тапсырмасын ашу</button>` : ""}`, (b) => {
      const t = b.querySelector("#mpTask"); if (t) t.onclick = () => openTask();
    });
  setGuide(`${ex.t}. ${ex.d}`);
}
function openTask() {
  if (view === "hall") return;
  const r = D.ROOMS[view - 1];
  openPanel(`<span class="eyebrow">${r.n}-бөлме тапсырмасы</span>`, (b) => { const host = document.createElement("div"); host.className = "grid"; host.style.gap = "12px"; b.appendChild(host); App.roomTask(r.n, host); });
}

/* ---------- tour ---------- */
const tour = {
  on: false, i: 0, seq: ["hall", 1, 2, 3, 4, 5], timer: 0,
  start() { this.on = true; this.i = 0; ui.tour.classList.add("on"); ui.tour.textContent = "■ Экскурсияны тоқтату"; orbit.auto = true; this.step(); },
  stop() { this.on = false; clearTimeout(this.timer); ui.tour.classList.remove("on"); ui.tour.textContent = "▶ Экскурсия"; orbit.auto = rotOn; },
  step() {
    if (!this.on) return;
    const v = this.seq[this.i];
    if (String(v) === String(view)) setGuide(ui.guide.textContent); else go(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.next(), guideOn ? 45000 : 13000);
  },
  next() { if (!this.on) return; this.i++; if (this.i >= this.seq.length) { this.stop(); go("hall"); ui.guide.textContent = "Экскурсия аяқталды. Енді бөлмелерді өзіңіз аралап, экспонаттарды басып көріңіз."; return; } this.step(); }
};
let rotOn = false;

/* ---------- input ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const pointers = new Map(); let downAt = null, moved = 0, pinch0 = 0, hoverRoot = null;
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const vis = clickables.filter((m) => { let o = m; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
  const hit = ray.intersectObjects(vis, false)[0];
  return hit ? hit.object : null;
}
function onDown(e) {
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { downAt = { x: e.clientX, y: e.clientY }; moved = 0; }
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
}
function onMove(e) {
  if (!pointers.has(e.pointerId)) { hover(e); return; }
  const p = pointers.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    moved += Math.abs(dx) + Math.abs(dy);
    orbit.goal.yaw -= dx * 0.006; orbit.goal.pitch += dy * 0.004;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0) orbit.goal.dist *= pinch0 / d; pinch0 = d; moved += 10;
  }
}
function onUp(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0 && downAt && moved < 8) {
    const o = pick(e);
    if (o && o.userData.ex) {
      const ex = o.userData.ex;
      if (tour.on) tour.stop();
      if (ex.kind === "door") walkToDoor(ex.room); else showExhibit(ex);
    }
  }
  if (pointers.size < 2) pinch0 = 0;
  if (pointers.size === 0) downAt = null;
}
function hover(e) {
  if (e.pointerType === "touch") return;
  const o = pick(e);
  const root = o ? o.userData.root : null;
  if (root !== hoverRoot) { if (hoverRoot) hoverRoot.userData.hov = false; hoverRoot = root; if (root) root.userData.hov = true; }
  canvas.style.cursor = o ? "pointer" : "grab";
  if (o) { ui.label.textContent = o.userData.ex.t; ui.label.style.left = e.clientX + "px"; ui.label.style.top = e.clientY + "px"; ui.label.style.opacity = 1; }
  else ui.label.style.opacity = 0;
}

/* ---------- loop ---------- */
let last = 0; const TMP = new THREE.Vector3();
function frame(t) {
  raf = requestAnimationFrame(frame);
  const time = t / 1000; const dt = Math.min(0.05, last ? time - last : 0.016); last = time;
  updateCamera(dt);
  anims.forEach((a) => { if (String(a.view) === String(view)) a.fn(time, dt); });
  clickables.forEach((m) => { const r = m.userData.root; if (r && r.userData.exRoot && r.visible) { const s = r.userData.hov ? 1.035 : 1; TMP.set(s, s, s); r.scale.lerp(TMP, 0.2); } });
  renderer.render(scene, camera);
}
function resize() {
  if (!renderer) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 68 : 55; camera.updateProjectionMatrix();
}

/* ---------- build & open ---------- */
async function build() {
  try { await Promise.race([Promise.all(["600 40px Oswald", '700 60px "Noto Serif Display"', "20px PT Mono", "20px PT Sans"].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x05080d);
  camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  buildHall(); room1(); room2(); room3(); room4(); room5();
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", (e) => { pointers.delete(e.pointerId); downAt = null; });
  canvas.addEventListener("pointerleave", () => { ui.label.style.opacity = 0; });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); orbit.goal.dist *= Math.exp(e.deltaY * 0.001); }, { passive: false });
  addEventListener("resize", resize);
  built = true;
}
function webglOK() { try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch (e) { return false; } }

async function open(arg) {
  if (!webglOK()) { App.museumFallback && App.museumFallback(); return; }
  stage.hidden = false; document.body.style.overflow = "hidden";
  try { if (!built) await build(); }
  catch (e) { stage.hidden = true; document.body.style.overflow = ""; App.museumFallback && App.museumFallback(); return; }
  resize();
  const n = parseInt(arg, 10);
  applyView(n >= 1 && n <= 5 ? n : "hall", true);
  if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
  if (arg === "tour") tour.start();
  ui.guideBtn.focus();
}
function exit() {
  tour.stop(); App.Speech.stop(); guideOn = false; ui.guideBtn.classList.remove("on");
  stage.hidden = true; document.body.style.overflow = ""; running = false; cancelAnimationFrame(raf);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  ui.menu.hidden = true; closePanel();
  const m = document.getElementById("museum"); m && m.scrollIntoView();
}

/* ---------- UI wiring ---------- */
$("#mHall").onclick = () => { tour.stop(); go("hall"); };
$("#mPrev").onclick = () => { tour.stop(); go(view === "hall" ? 5 : view === 1 ? "hall" : view - 1); };
$("#mNext").onclick = () => { tour.stop(); go(view === "hall" ? 1 : view === 5 ? "hall" : view + 1); };
ui.task.onclick = () => openTask();
ui.tour.onclick = () => tour.on ? tour.stop() : tour.start();
ui.guideBtn.onclick = () => {
  guideOn = !guideOn; ui.guideBtn.classList.toggle("on", guideOn);
  if (guideOn) { App.Speech.speak(ui.guide.textContent, () => { if (tour.on) tour.next(); }).then(() => { if (App.Speech.note) ui.guide.textContent += " (" + App.Speech.note + ")"; }); }
  else App.Speech.stop();
};
$("#mRooms").onclick = () => {
  ui.menu.hidden = !ui.menu.hidden; if (ui.menu.hidden) return;
  ui.menu.innerHTML = "";
  [["hall", "⌂ Музей дәлізі"], ...D.ROOMS.map((r) => [r.n, `${r.n} · ${r.name}`])].forEach(([v, t]) => {
    const b = document.createElement("button"); b.textContent = t; b.onclick = () => { ui.menu.hidden = true; tour.stop(); go(v); }; ui.menu.appendChild(b);
  });
};
$("#mFs").onclick = () => {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  const f = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (f) { try { const p = f.call(stage); p && p.catch && p.catch(() => { ui.guide.textContent = "Бұл құрылғыда толық экран режимі қолжетімсіз."; }); } catch (e) {} }
  else ui.guide.textContent = "Бұл құрылғыда толық экран режимі қолжетімсіз.";
};
document.addEventListener("fullscreenchange", () => setTimeout(resize, 100));
$("#mExit").onclick = exit;
$("#mZin").onclick = () => { orbit.goal.dist *= 0.8; };
$("#mZout").onclick = () => { orbit.goal.dist *= 1.25; };
ui.rot.onclick = () => { rotOn = !rotOn; orbit.auto = rotOn || tour.on; ui.rot.style.borderColor = rotOn ? "var(--gold)" : ""; };
document.addEventListener("keydown", (e) => {
  if (stage.hidden || App.isOverlayOpen()) return;
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === "Escape") { if (!ui.panel.hidden) closePanel(); else if (!ui.menu.hidden) ui.menu.hidden = true; else exit(); }
  else if (e.key === "ArrowLeft") orbit.goal.yaw += 0.15;
  else if (e.key === "ArrowRight") orbit.goal.yaw -= 0.15;
  else if (e.key === "ArrowUp") orbit.goal.pitch -= 0.08;
  else if (e.key === "ArrowDown") orbit.goal.pitch += 0.08;
  else if (e.key === "+" || e.key === "=") orbit.goal.dist *= 0.85;
  else if (e.key === "-") orbit.goal.dist *= 1.18;
});

window.AKZMuseum = { open, exit };
