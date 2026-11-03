// Self-check for the HVAC fitting / terminal shapes — run: node components/bim/model/air/shapes.check.mjs  (Node >= 22.18 strips the types)
import assert from "node:assert/strict";
import { register } from "node:module";

const ROOT = new URL("../../../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`export const resolve = (s, c, next) => {
      if (s.startsWith("@/")) return next(${JSON.stringify(ROOT)} + s.slice(2) + ".ts", c);
      if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) return next(s + ".ts", c);
      return next(s, c);
    };`),
);
const S = await import("./shapes.ts");
const L = await import("./layout.ts");
const G = await import("../../geometry.ts");

const near = (a, b, what, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} vs ${b}`);
const bounds = (g) => {
  g.computeBoundingBox();
  return g.boundingBox;
};
/** Triangles as [a, b, c] point triples (indexed or not). */
function* triangles(g) {
  const p = g.getAttribute("position");
  const n = g.index ? g.index.count : p.count;
  const at = (k) => {
    const i = g.index ? g.index.getX(k) : k;
    return [p.getX(i), p.getY(i), p.getZ(i)];
  };
  for (let k = 0; k < n; k += 3) yield [at(k), at(k + 1), at(k + 2)];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Signed volume of a mesh: positive when its faces wind outward. */
const volume = (g) => [...triangles(g)].reduce((v, [a, b, c]) => v + dot(a, cross(b, c)) / 6, 0);

// closed solids wind outward (positive volume) — boxes, extrusions, cylinders merged
const shoe = S.shoeShape();
const transition = S.transitionShape();
const fd = S.fireDamperShape();
const collar = S.collarShape();
const vav = S.vavShape();
const drop = S.dropShape();
const diffuser = S.diffuserShape();
for (const [name, g] of Object.entries({ shoe: shoe.supply, transition: transition.supply, fd: fd.equipment, collar: collar.ret, vav: vav.equipment, diff: diffuser.equipment }))
  assert.ok(volume(g) > 0, `${name} winds outward`);

// shoe: on the main face (z >= 0), flared on the upstream (-x) side only
{
  const b = bounds(shoe.supply);
  near(b.min.z, 0, "shoe starts on the main face");
  near(b.max.z, L.SHOE.len, "shoe length");
  near(b.min.x, -L.SHOE.w / 2 - L.SHOE.flare - 0.05, "plate covers the flare");
  const p = shoe.supply.getAttribute("position");
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > L.SHOE.flare + 1e-6) assert.ok(p.getX(i) >= -L.SHOE.w / 2 - 1e-6, "no flare past the throat");
}
// transition: inlet width 1 at x = 0 tapering to the ratio at its end, flange around the inlet
{
  const b = bounds(transition.supply);
  near(b.min.x, 0, "transition inlet");
  near(b.max.x, S.TRANSITION_LEN, "transition length");
  near(b.max.z, 0.5 + 0.045, "inlet flange");
  const p = transition.supply.getAttribute("position");
  for (let i = 0; i < p.count; i++)
    if (Math.abs(p.getX(i) - S.TRANSITION_LEN) < 1e-6) assert.ok(Math.abs(p.getZ(i)) <= S.TRANSITION_RATIO / 2 + 1e-6, "outlet width");
}
// fire damper sleeve encloses a 1.0 x 0.5 duct; collar hangs under the main
{
  const b = bounds(fd.equipment);
  assert.ok(b.max.x > 0.5 && b.max.y > 0.25 && Math.abs(b.max.z - L.FD.len / 2) < 1e-6);
  // the return main runs 0.1 m under the slab: the whole damper must stay below the soffit
  const top = Math.max(bounds(fd.equipment).max.y, bounds(fd.shade).max.y);
  for (let i = 0; i < G.FLOORS; i++) assert.ok(G.returnY(i) + top < G.ceilingTop(i) - 0.01, `return FD under the soffit L${i + 1}`);
  const c = bounds(collar.ret);
  near(c.max.y, 0, "collar top on the main's underside");
  near(c.min.y, -L.COLLAR.h, "collar depth");
}
// VAV: inlet upstream (z < 0), casing + coil downstream to the lateral start
{
  const b = bounds(vav.equipment);
  near(b.max.z, L.LAT_Z0 - L.VAV.z0, "coil ends where the lateral starts");
  const inlet = bounds(vav.supply);
  near(inlet.max.z, -L.VAV.collar, "inlet meets the collar");
  near(inlet.min.z, -L.VAV.collar - L.VAV.inletLen, "inlet length");
  // the round inlet starts inside every shoe body (past its flange plate, before its outlet), so no gap shows
  const z0 = L.VAV.z0 - L.VAV.collar - L.VAV.inletLen;
  for (const x of [-2, 5, 12]) {
    const zf = L.shoeAt(0, x)[2];
    assert.ok(z0 > zf + L.SHOE.plate && z0 < zf + L.SHOE.len, `inlet inside the shoe at x ${x}`);
  }
  assert.ok(L.VAV.inletR < L.SHOE.h / 2 && L.VAV.inletR < L.SHOE.w / 2, "inlet hides inside the shoe");
}
// drop: hangs from the lateral's underside to the diffuser neck; flex normals face out
{
  for (const g of [drop.equipment, drop.supply, drop.shade]) {
    const b = bounds(g);
    assert.ok(b.max.y <= 1e-6 && b.min.y >= -L.DROP_LEN - 1e-6, "drop inside its span");
  }
  near(bounds(drop.shade).min.y, -L.DROP_LEN, "flex reaches the diffuser neck");
  const p = drop.shade.getAttribute("position");
  const n = drop.shade.getAttribute("normal");
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    if (r > 1e-6) assert.ok((n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i)) / r > 0, "flex faces out");
  }
  const d = bounds(diffuser.shade);
  near(d.max.y, L.DIFF.plate + L.DIFF.pan + L.DIFF.neck, "diffuser neck top");
}
// canvas bellows: every face winds outward, hugging the trunk
{
  const g = S.canvasShape().shade;
  for (const [a, b, c] of triangles(g)) {
    const nrm = cross(sub(b, a), sub(c, a));
    const mid = [(a[0] + b[0] + c[0]) / 3, 0, (a[2] + b[2] + c[2]) / 3];
    assert.ok(dot(nrm, mid) > 0, "canvas faces out");
  }
  const b = bounds(g);
  near(b.max.y - b.min.y, L.CANVAS.h, "canvas height");
  assert.ok(b.max.x > 0.5 && b.max.x < 0.5 + 0.04, "canvas stands just proud of the trunk");
}
// vanes: inside the elbow, each blade turning +z into +x, strung throat -> heel
{
  const g = S.vanesShape().glow;
  const half = 0.45;
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) assert.ok(Math.abs(p.getX(i)) < half && Math.abs(p.getZ(i)) < half && Math.abs(p.getY(i)) < 0.25, "vane inside the elbow");
  const perVane = p.count / 5;
  let lastMid = Infinity;
  for (let k = 0; k < 5; k++) {
    const a = k * perVane;
    const b = a + perVane - 2;
    // start -> end moves +x and +z (an arc from tangent +z to tangent +x)
    assert.ok(p.getX(b) > p.getX(a) && p.getZ(b) > p.getZ(a), "vane turns the flow");
    const m = a + perVane / 2 - 1;
    assert.ok(p.getX(m) < lastMid, "vanes run throat (+x) to heel (-x)");
    lastMid = p.getX(m);
  }
}

console.log("shapes.check: ok");
