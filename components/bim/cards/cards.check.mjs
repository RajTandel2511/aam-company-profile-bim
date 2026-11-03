// Self-check for the mid-screen element cards. Run: node components/bim/cards/cards.check.mjs
// 1. The schedule: 12-17 cards in story order, every chapter has one, never more than two in their
//    window at once, and every label fits the card.
// 2. The layout (layout.ts) on desktop and phone frames shaped like Story.tsx: cards stay in their
//    region, clear of the story panel, HUD and legend, never on each other or on their own element.
// 3. A report, not an assertion (the camera is drone/track.ts's): how much of each card's window the
//    current track keeps the card's element on screen (cards hide while it isn't).
import assert from "node:assert/strict";
import { register } from "node:module";

// "@/..." and extensionless relative imports, as the TS sources write them
const ROOT = new URL("../../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) spec = new URL(spec.slice(2), ROOT).href;
  if ((spec.startsWith(".") || spec.startsWith("file:")) && !/\\.[cm]?[jt]sx?$/.test(spec)) {
    const base = new URL(spec, ctx.parentURL).href;
    for (const ext of [".ts", ".tsx"]) if (existsSync(fileURLToPath(base + ext))) return next(base + ext, ctx);
  }
  return next(spec, ctx);
}`),
);

const { CARDS, anchorAt } = await import("./registry.ts");
const L = await import("./layout.ts");
const { CHAPTERS, chapterAt } = await import("../timeline.ts");
const THREE = await import("three");
const { sampleTrack } = await import("../drone/track.ts");

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const FADE = 0.005; // ElementCards.FADE
const life = (s, w) => Math.min(clamp((s - w[0]) / FADE), 1 - clamp((s - (w[1] - FADE)) / FADE));

/* ------------------------------------------------------------ schedule -- */

assert.ok(CARDS.length >= 12 && CARDS.length <= 17, `card count ${CARDS.length}`);
assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length, "card ids are unique");
// cards on the air / VRF builders' anchors drop out silently if an anchor id changes — catch that here
for (const id of ["fire-damper", "round-duct", "duct-wrap", "vrf-cu", "branch-box", "cassette", "wall-split"])
  assert.ok(CARDS.some((c) => c.id === id), `card "${id}" lost its anchor (model/air or model/vrf anchors.ts renamed it?)`);
for (const [i, c] of CARDS.entries()) {
  assert.ok(c.show[0] >= 0 && c.show[1] <= 1 && c.show[1] - c.show[0] >= 0.02, `${c.id}: window ${c.show}`);
  if (i > 0) assert.ok(c.show[0] >= CARDS[i - 1].show[0], `${c.id}: cards are listed in story order`);
  assert.ok(c.rows.length >= 2 && c.rows.length <= 3, `${c.id}: 2-3 property rows`);
  for (const [k, v] of c.rows) assert.ok(k.length <= 9 && v.length <= 20, `${c.id}: "${k}: ${v}" fits one row`);
  assert.ok(c.mark.length <= 9 && c.status.every((t) => t.length <= 13), `${c.id}: mark and status fit the header`);
  assert.ok(c.doneAt >= 0 && c.doneAt <= 1, `${c.id}: doneAt`);
  assert.ok(c.at.every(Number.isFinite), `${c.id}: anchor`);
  if (c.path) {
    assert.ok(c.path.length >= 2 && c.path.flat().every(Number.isFinite), `${c.id}: path`);
    // the sliding anchor lands on the path: at a path vertex when the target is that vertex
    const p = anchorAt(c, ...c.path[1], { x: 0, y: 0, z: 0 });
    assert.ok(Math.hypot(p.x - c.path[1][0], p.y - c.path[1][1], p.z - c.path[1][2]) < 1e-9, `${c.id}: anchorAt lands on its path`);
  }
}
for (let k = 0; k <= 10000; k++) {
  const s = k / 10000;
  const n = CARDS.filter((c) => life(s, c.show) > 0).length;
  assert.ok(n <= 2, `${n} cards in their window at story ${s}`);
}
const perChapter = CHAPTERS.map((_, i) => CARDS.filter((c) => chapterAt((c.show[0] + c.show[1]) / 2) === i).length);
CHAPTERS.forEach((ch, i) => assert.ok(perChapter[i] >= 1, `chapter ${ch.id} has a card`));

/* -------------------------------------------------------------- layout -- */

/** Story.tsx at lg+: properties panel left, HUD top right, legend bottom right (px). */
function desktop(w, h, panelH = 560) {
  const g = 48;
  const top = 72;
  const ph = Math.min(panelH, h - top - 30 - 48);
  return {
    w,
    h,
    top,
    bottom: 30,
    gutter: g,
    avoid: [
      { x: g, y: h / 2 + top / 2 - 15 - ph / 2, w: Math.min(420, 0.32 * w), h: ph },
      { x: w - g - 340, y: top + 20, w: 340, h: 140 },
      { x: w - g - 280, y: h - 54 - 284, w: 280, h: 284 },
    ],
  };
}
/** Below lg: the properties sheet at the bottom (phones: 46svh, tablets: 52svh above the status bar). */
function compact(w, h) {
  const md = w >= 768;
  const ph = md ? Math.min(0.52 * h, 430) : Math.min(0.46 * h, 340);
  const panel = md ? { x: 48, y: h - 42 - ph, w: w - 96, h: ph } : { x: 12, y: h - 12 - ph, w: w - 24, h: ph };
  return { w, h, top: md ? 72 : 64, bottom: md ? 30 : 0, gutter: md ? 48 : 20, avoid: [panel] };
}

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const inside = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const within = (r, reg) => r.x >= reg.x - 0.5 && r.y >= reg.y - 0.5 && r.x + r.w <= reg.x + reg.w + 0.5 && r.y + r.h <= reg.y + reg.h + 0.5;
/** an anchor the cards would show for: on screen, below the nav, above the status bar, not under a panel */
function anchor(f) {
  for (;;) {
    const x = 30 + rand() * (f.w - 60);
    const y = f.top + 30 + rand() * (f.h - f.top - f.bottom - 60);
    if (!f.avoid.some((a) => inside(a, x, y))) return [x, y];
  }
}

/** measured card sizes: the full card (lg+) and the slim phone card (no category, two rows) */
const FULL = [
  [256, 196],
  [256, 214],
];
const SLIM = [
  [256, 132],
  [256, 150],
];
const FRAMES = [
  ...[
    [1024, 768],
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1536, 864],
    [1920, 1080],
    [2560, 1440],
  ].map(([w, h]) => ({ f: desktop(w, h), wide: true })),
  ...[
    [390, 844],
    [360, 740],
    [768, 1024],
    [820, 1180],
  ].map(([w, h]) => ({ f: compact(w, h), wide: false })),
];
const stats = [];
const pts = new Float32Array(6);
for (const { f, wide } of FRAMES) {
  const SIZES = wide ? FULL : SLIM;
  const regA = L.rect();
  const regB = L.rect();
  const a = L.rect();
  const b = L.rect();
  const sa = L.region(f, ...SIZES[0], regA);
  const sb = L.region(f, ...SIZES[1], regB);
  const tag = `${f.w}x${f.h}`;
  assert.ok(sa > 0 && sb > 0, `${tag}: room for a card`);
  assert.ok(wide ? sa >= L.MIN_SCALE : sa <= L.COMPACT_SCALE, `${tag}: card scale ${sa}`);
  for (const reg of [regA, regB]) for (const p of f.avoid) assert.ok(!L.overlaps(reg, p, -0.5), `${tag}: region clear of every panel`);
  let second = 0;
  let onAnchor = 0;
  let noRoom = 0;
  const N = 600;
  for (let k = 0; k < N; k++) {
    const [ax, ay] = anchor(f);
    const [bx, by] = anchor(f);
    const memo = { side: 0 };
    const ka = L.place(ax, ay, ...SIZES[0], sa, regA, !wide, null, memo, a);
    if (wide) assert.equal(ka, sa, `${tag}: the first card always places at the region's scale`);
    if (!ka) {
      noRoom++; // phones: no room above or below this element at a readable size
      continue;
    }
    assert.ok(within(a, regA), `${tag}: card inside its region`);
    assert.ok(Math.abs(a.w - SIZES[0][0] * ka) < 0.01 && Math.abs(a.h - SIZES[0][1] * ka) < 0.01, `${tag}: card rect matches its scale`);
    if (inside(a, ax, ay)) onAnchor++;
    else assert.notEqual(L.leader(ax, ay, a.x, a.y, a.w, a.h, 15 * ka, pts), L.SIDE.none, `${tag}: leader lands on the card`);
    // camera drift of a few px: the card may switch sides once (its side ran out of room), never back and forth
    assert.ok(memo.side === 1 || memo.side === -1, `${tag}: place() records its side`);
    let flips = 0;
    for (let t = 0; t < 8; t++) {
      const d = t % 2 ? -6 : 6;
      const before = memo.side;
      if (L.place(ax + d, ay + d, ...SIZES[0], sa, regA, !wide, null, memo, L.rect()) && memo.side !== before) flips++;
    }
    assert.ok(flips <= 1, `${tag}: card flip-flops under drift (${flips} switches)`);
    if (!wide) continue; // phones show one card at a time
    if (!L.place(bx, by, ...SIZES[1], sb, regB, false, a, { side: 0 }, b)) continue;
    second++;
    assert.ok(within(b, regB), `${tag}: second card inside its region`);
    assert.ok(!L.overlaps(a, b, 0), `${tag}: the two cards never overlap`);
  }
  stats.push({
    frame: tag,
    scale: +sa.toFixed(2),
    region: `${Math.round(regA.w)}x${Math.round(regA.h)}`,
    "second fits": wide ? `${Math.round((100 * second) / N)}%` : "-",
    "on own element": `${((100 * onAnchor) / N).toFixed(1)}%`,
    "no room": `${((100 * noRoom) / N).toFixed(1)}%`,
  });
  assert.ok(onAnchor / N < 0.03, `${tag}: cards rarely cover their element (${onAnchor}/${N})`);
  assert.ok(noRoom / N < 0.1, `${tag}: a card nearly always finds room (${noRoom}/${N})`);
}
console.log("layout");
console.table(stats);

/* -------------------------------------------- track coverage (report) -- */

// CameraRig's framing, simplified: insideness widens the lens; the view offset shifts the shot right (desktop) or up (portrait)
const SHELL = { x: 16.6, top: 17.8, z: 10.6, fade: 3.5 };
function insideness(p) {
  const dx = Math.max(Math.abs(p.x) - SHELL.x, 0);
  const dy = Math.max(p.y - SHELL.top, -p.y, 0);
  const dz = Math.max(Math.abs(p.z) - SHELL.z, 0);
  return 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dy, dz), 0, SHELL.fade);
}
const cam = new THREE.PerspectiveCamera(30, 1, 0.5, 700);
const pos = new THREE.Vector3();
const tgt = new THREE.Vector3();
const v = new THREE.Vector3();
function shot(s, f) {
  sampleTrack(s, pos, tgt);
  const k = insideness(pos);
  cam.position.copy(pos);
  cam.lookAt(tgt);
  cam.fov = 30 + 20 * k;
  cam.near = 0.5 - 0.38 * k;
  cam.aspect = f.w / f.h;
  const wide = f.w >= L.WIDE;
  cam.setViewOffset(f.w, f.h, wide ? -0.16 * f.w : 0, wide ? 0 : 0.17 * f.h, f.w, f.h);
  cam.updateMatrixWorld();
}
function onScreen(c, s, f) {
  shot(s, f);
  anchorAt(c, tgt.x, tgt.y, tgt.z, v).applyMatrix4(cam.matrixWorldInverse);
  if (v.z > -0.1) return false;
  v.applyMatrix4(cam.projectionMatrix);
  const x = (v.x + 1) * 0.5 * f.w;
  const y = (1 - v.y) * 0.5 * f.h;
  return x > 0 && x < f.w && y > f.top && y < f.h - f.bottom && !f.avoid.some((a) => inside(a, x, y));
}
const desk = desktop(1440, 900);
const phone = compact(390, 844);
const coverage = CARDS.map((c) => {
  const n = 24;
  let d = 0;
  let p = 0;
  for (let k = 0; k < n; k++) {
    const s = c.show[0] + ((k + 0.5) / n) * (c.show[1] - c.show[0]);
    if (onScreen(c, s, desk)) d++;
    if (onScreen(c, s, phone)) p++;
  }
  return { card: c.mark, chapter: CHAPTERS[chapterAt((c.show[0] + c.show[1]) / 2)].id, window: c.show.map((x) => x.toFixed(3)).join("-"), "in shot 1440": `${Math.round((100 * d) / n)}%`, "in shot 390": `${Math.round((100 * p) / n)}%` };
});
console.log("track coverage (cards hide while their element is off screen)");
console.table(coverage);
console.log(`cards.check: OK — ${CARDS.length} cards, per chapter ${perChapter.join(" / ")}`);
