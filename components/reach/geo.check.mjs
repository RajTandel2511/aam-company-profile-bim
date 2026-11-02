// Checks the site plan's screen geometry. Run: node components/reach/geo.check.mjs
import assert from "node:assert/strict";
import * as THREE from "three";
import { HIDDEN, crossing, pxPerUnit, screenAngle, toScreen } from "./geo.ts";

const W = 800;
const H = 600;
const EDGE = 12;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Like the map: pitched down at the ground, looking north at the origin.
const cam = new THREE.PerspectiveCamera(30, W / H, 0.5, 200);
const target = v(0, 0, 0);
const look = (az) => {
  cam.position.set(20 * Math.sin(az), 12, 20 * Math.cos(az));
  cam.lookAt(target);
  cam.updateMatrixWorld();
};
look(0);

// A parallel through the look-at point is a horizontal screen line through mid-height.
near(crossing({ a: v(-50, 0, 0), b: v(50, 0, 0) }, "x", EDGE, cam, W, H), H / 2, "parallel meets the left edge mid-height");
// A meridian through it runs up the middle, so it meets the bottom edge mid-width.
near(crossing({ a: v(0, 0, 16), b: v(0, 0, -20) }, "y", H - EDGE, cam, W, H), W / 2, "meridian meets the bottom edge mid-width");
// Too short to reach the edge, or behind the camera: no tick.
assert.equal(crossing({ a: v(-1, 0, 0), b: v(1, 0, 0) }, "x", EDGE, cam, W, H), HIDDEN, "short segment");
assert.equal(crossing({ a: v(-50, 0, 40), b: v(50, 0, 40) }, "x", EDGE, cam, W, H), HIDDEN, "behind the camera");

// North points straight up while the camera looks north; swinging the camera east leans it clockwise.
const NORTH = v(0, 0, -1);
near(screenAngle(target, NORTH, cam, W, H), 0, "north is up");
look(0.1);
assert.ok(screenAngle(target, NORTH, cam, W, H) > 0, "camera east of the target: north leans right");

// One world unit across the view at the look-at point spans exactly pxPerUnit pixels.
const right = v(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0).normalize();
const p0 = v(0, 0, 0);
const p1 = v(0, 0, 0);
toScreen(p0, target, cam, W, H);
toScreen(p1, target.clone().add(right), cam, W, H);
near(p0.distanceTo(p1), pxPerUnit(cam, target, H), "scale at the centre");

console.log("geo: ok");
