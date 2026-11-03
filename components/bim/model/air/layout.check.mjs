// Self-check for the HVAC coordination layout — run: node components/bim/model/air/layout.check.mjs  (Node >= 22.18 strips the types)
import assert from "node:assert/strict";
import { register } from "node:module";

// layout.ts imports extensionless modules and "@/lib/..." (tsconfig alias): resolve both to .ts for this run
const ROOT = new URL("../../../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`export const resolve = (s, c, next) => {
      if (s.startsWith("@/")) return next(${JSON.stringify(ROOT)} + s.slice(2) + ".ts", c);
      if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) return next(s + ".ts", c);
      return next(s, c);
    };`),
);
const L = await import("./layout.ts");
const G = await import("../../geometry.ts");
const { STORY } = await import("../../timeline.ts");
const { AIR_ANCHORS } = await import("./anchors.ts");
const H = STORY.hvac;

const inside = (w, outer, what) => assert.ok(w[0] >= outer[0] - 1e-9 && w[1] <= outer[1] + 1e-9 && w[0] < w[1], `${what}: [${w}] not in [${outer}]`);

// every window nests inside its STORY window
L.W_FD_SUPPLY.forEach((w, i) => inside(w, H.fittings, `supply FD L${i + 1}`));
L.W_FD_RETURN.forEach((w, i) => inside(w, H.fittings, `return FD L${i + 1}`));
L.W_VANES.forEach((w, i) => inside(w, H.fittings, `vanes L${i + 1}`));
L.W_TRANSITION.flat().forEach((w) => inside(w, H.fittings, "transition"));
inside(L.W_CANVAS, H.fittings, "canvas");
L.W_SHOE.flat().forEach((w) => inside(w, H.fittings, "shoe"));
L.COLLARS.forEach((c) => inside(c.window, H.fittings, "return collar"));
L.W_VAV.flat().forEach((w) => inside(w, H.vav, "VAV"));
L.W_LATERAL.flat().forEach((w) => inside(w, H.terminals, "lateral"));
L.DROPS.forEach((d) => {
  inside(d.drop, H.round, "drop");
  inside(d.diffuser, H.round, "diffuser");
});
L.HANGERS.forEach((h) => inside(h.window, H.hangers, "hanger"));
L.FLOOR_INDEX.forEach((i) => L.wrapParts(i).forEach((p) => inside(p.window, H.wrap, `wrap L${i + 1}`)));
L.W_ROOF_FANS.forEach((w) => inside(w, STORY.exhaust.fans, "roof fan"));

// order: main is up before its shoes; shoe -> VAV -> lateral; lateral (and its wrap) before the floor's wrap
L.FLOOR_INDEX.forEach((i) =>
  G.SUPPLY.lateralsX.forEach((x, j) => {
    assert.ok(L.passAt(L.W_SUPPLY[i], L.alongMain(x + 0.3) / L.MAIN_LEN) <= L.W_SHOE[i][j][0], `main reaches shoe L${i + 1}/${j}`);
    assert.ok(L.W_SHOE[i][j][1] <= L.W_VAV[i][j][0] + 1e-9, "shoe before VAV");
    assert.ok(L.W_VAV[i][j][1] - 0.002 <= L.W_LATERAL[i][j][0] + 0.002, "VAV settles as the lateral starts");
    const wraps = L.wrapParts(i);
    assert.ok(L.W_LATERAL[i][j][1] <= wraps[3 + j].window[0], `lateral built before its wrap L${i + 1}/${j}`);
  }),
);
L.COLLARS.forEach((c) => assert.ok(c.window[1] <= c.neck[0] + 1e-9 && c.neck[0] < c.grille[0], "collar -> neck -> grille"));

// the split main tiles the original path; transitions sit in the gaps
L.FLOOR_INDEX.forEach((i) => {
  const parts = L.mainParts(i);
  const lens = parts.map((p) => L.pathLength(p.path));
  parts.forEach((p, k) => assert.ok(Math.abs(p.to - p.from - lens[k]) < 1e-9, "part length = its span"));
  L.TRANSITIONS.forEach((t, k) => assert.ok(Math.abs(parts[k + 1].from - parts[k].to - (t.x1 - t.x0)) < 1e-9, "gap = transition"));
});
assert.ok(Math.abs(L.MAIN_LEN - 26.25) < 1e-9);

// clearances --------------------------------------------------------------
const segDist2D = (px, pz, a, b) => {
  const [ax, az, bx, bz] = [a[0], a[2], b[0], b[2]];
  const L2 = (bx - ax) ** 2 + (bz - az) ** 2;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / L2)) : 0;
  return Math.hypot(px - ax - t * (bx - ax), pz - az - t * (bz - az));
};
/** plan distance from (x, z) to the floor's horizontal VRF branch pieces */
const vrfDist = (i, x, z) =>
  Math.min(
    ...G.vrfBranches(i).flatMap((p) => p.slice(1).map((b, k) => (Math.abs(b[1] - p[k][1]) > 1e-9 ? Infinity : segDist2D(x, z, p[k], b)))),
  );
const PIPE = 0.06; // generous insulated refrigerant radius
L.DROPS.forEach((d) => assert.ok(vrfDist(d.floor, d.top[0], d.top[2]) > G.SUPPLY.diffuser / 2 + PIPE, "drop / diffuser clear of VRF"));
L.FLOOR_INDEX.forEach((i) =>
  G.SUPPLY.lateralsX.forEach((x) => {
    // VAV casing + side kit (actuator, enclosure) footprint, sampled
    for (let z = L.VAV.z0 - 0.5; z <= L.LAT_Z0; z += 0.05)
      for (const dx of [-0.36, 0, 0.5]) assert.ok(vrfDist(i, x + dx, z) > PIPE + 0.05, `VAV head clear of VRF L${i + 1} x${x}`);
  }),
);
// hangers: VRF passes 0.92 under the soffit; struts and rods must not sit over a branch they would cut
L.HANGERS.forEach((h) => {
  const i = G.LEVELS.findIndex((l) => Math.abs(l.y - G.SLAB_T - h.top) < 1e-9) - 1;
  const bottom = h.c[1] - L.TRAPEZE.strut;
  if (bottom < G.vrfY(i) + PIPE + 0.02) {
    const half = h.span / 2 + L.TRAPEZE.overhang;
    for (let s = -half; s <= half; s += 0.05) {
      const x = h.c[0] + (h.across === 0 ? s : 0);
      const z = h.c[2] + (h.across === 2 ? s : 0);
      assert.ok(vrfDist(i, x, z) > PIPE + 0.05, `strut clear of VRF at ${x.toFixed(2)}, ${z.toFixed(2)} L${i + 1}`);
    }
  }
  // rods stay out of the controls runs at the soffit
  for (const s of [-h.span / 2, h.span / 2]) {
    const x = h.c[0] + (h.across === 0 ? s : 0);
    const z = h.c[2] + (h.across === 2 ? s : 0);
    const route = G.sensorRoutes[i];
    for (let k = 1; k < route.length; k++) {
      const a = route[k - 1];
      const b = route[k];
      if (Math.abs(a[1] - b[1]) < 1e-9) assert.ok(segDist2D(x, z, a, b) > 0.15, `rod clear of controls at ${x}, ${z}`);
    }
  }
  // struts clear the columns
  for (const cx of G.GRID_X) for (const cz of G.GRID_Z) assert.ok(Math.hypot(h.c[0] - cx, h.c[2] - cz) > h.span / 2 + 0.5, "column clear");
});
// supply struts hang below the wrap and its bands; return struts below the flanges
assert.ok(L.WRAP.proud > 0.057 + 0.005, "wrap clears the 0.057 proud start flanges");
// the drop has room: spin-in + spiral + flex
assert.ok(L.DROP_LEN > L.DROP.spin + L.DROP.spiral + 0.05, `drop length ${L.DROP_LEN}`);

// anchors: six cards, each inside the stage, windows ordered
assert.equal(AIR_ANCHORS.length, 6);
for (const a of AIR_ANCHORS) {
  assert.ok(a.window[1] - a.window[0] >= 0.02 - 1e-9 && a.at.every(Number.isFinite), a.id);
  assert.ok(Math.abs(a.at[0]) < 17 && a.at[1] > 0 && a.at[1] < 20 && Math.abs(a.at[2]) < 11, `${a.id} inside the model`);
}

console.log("layout.check: ok");
for (const a of AIR_ANCHORS) console.log(`  ${a.id.padEnd(14)} at [${a.at.map((v) => v.toFixed(2))}]  window [${a.window.map((v) => v.toFixed(4))}]`);
