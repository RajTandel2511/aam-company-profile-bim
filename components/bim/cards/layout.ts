/**
 * Where the element cards sit on screen — pure math in CSS px of the canvas (the
 * stage is fixed full-viewport, so canvas px = viewport px).
 *
 *   Desktop (>= WIDE): the free band between the story panel (left) and the HUD /
 *   legend column (right). When that band is narrower than a card, the gap
 *   between the HUD and the legend opens the right column up to it.
 *   Below WIDE: one card, scaled down, in the strip between the nav and the story sheet.
 *
 * No DOM, no THREE, no allocation per call: cards.check.mjs drives it under plain Node.
 */

export type Rect = { x: number; y: number; w: number; h: number };

export type Frame = {
  /** canvas size */
  w: number;
  h: number;
  /** fixed nav (top) and status bar (bottom) heights */
  top: number;
  bottom: number;
  gutter: number;
  /** measured story panel, HUD and legend (zero-size ones dropped) */
  avoid: Rect[];
};

/** The card face a leader lands on. */
export const SIDE = { none: -1, left: 0, right: 1, top: 2, bottom: 3 } as const;

/** Tailwind's lg: the story panel moves to the left, the HUD and legend appear on the right. */
export const WIDE = 1024;
/** px kept clear around panels, the nav and the status bar */
export const GAP = 18;
/** px from the anchor dot to the near edge of its card */
const LEAD = 64;
/** cards ride this far above their anchor */
const RISE = 28;
/** longest straight run of a leader into the card */
const ELBOW = 26;
/** a card is never shown smaller than this on desktop, nor than MIN_COMPACT on phones */
export const MIN_SCALE = 0.8;
export const COMPACT_SCALE = 0.84;
const MIN_COMPACT = 0.62;

export const rect = (): Rect => ({ x: 0, y: 0, w: 0, h: 0 });

function set(r: Rect, x: number, y: number, w: number, h: number): Rect {
  r.x = x;
  r.y = y;
  r.w = w;
  r.h = h;
  return r;
}

/** Clamp to [lo, hi]; lo wins when the range is empty. */
const fit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const isLeft = (f: Frame, a: Rect) => a.x + a.w / 2 < f.w / 2;

/** True if (x, y) lies inside r grown by pad. */
const contains = (r: Rect, x: number, y: number, pad: number) =>
  x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;

export const overlaps = (a: Rect, b: Rect, pad: number) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/**
 * The region a cw × ch card (unscaled px) may use, written into `out`. Returns the
 * scale the card needs to fit it, or 0 when there is no room at a readable size.
 */
export function region(f: Frame, cw: number, ch: number, out: Rect): number {
  if (f.w < WIDE) {
    // phones / tablets: everything above the story sheet (the avoid rect in the lower part of the screen)
    let floor = f.h - f.bottom;
    for (let i = 0; i < f.avoid.length; i++) if (f.avoid[i].y > f.h * 0.3) floor = Math.min(floor, f.avoid[i].y);
    set(out, f.gutter, f.top + 10, f.w - 2 * f.gutter, floor - 12 - (f.top + 10));
    const s = Math.min(COMPACT_SCALE, out.w / cw, out.h / ch);
    return s >= MIN_COMPACT ? s : 0;
  }

  let x0 = f.gutter;
  let x1 = f.w - f.gutter;
  for (let i = 0; i < f.avoid.length; i++) {
    const a = f.avoid[i];
    if (isLeft(f, a)) x0 = Math.max(x0, a.x + a.w + GAP);
    else x1 = Math.min(x1, a.x - GAP);
  }
  const y0 = f.top + GAP;
  const y1 = f.h - f.bottom - GAP;
  set(out, x0, y0, x1 - x0, y1 - y0);
  let best = Math.min(1, out.w / cw, out.h / ch);
  if (best >= 1) return 1;

  // narrow desktop: try every vertical gap of the right column, from the band's left edge to the gutter
  let bx = out.x;
  let by = out.y;
  let bw = out.w;
  let bh = out.h;
  const w = f.w - f.gutter - x0;
  for (let k = -1; k < f.avoid.length; k++) {
    const r = k < 0 ? null : f.avoid[k];
    if (r && isLeft(f, r)) continue;
    const a = r ? r.y + r.h + GAP : y0;
    let b = y1;
    let covered = false;
    for (let j = 0; j < f.avoid.length; j++) {
      const q = f.avoid[j];
      if (isLeft(f, q)) continue;
      if (q.y - GAP < a && a < q.y + q.h + GAP) covered = true;
      else if (q.y - GAP >= a) b = Math.min(b, q.y - GAP);
    }
    if (covered || b <= a) continue;
    const s = Math.min(1, w / cw, (b - a) / ch);
    if (s > best) {
      best = s;
      bx = x0;
      by = a;
      bw = w;
      bh = b - a;
    }
  }
  set(out, bx, by, bw, bh);
  return best >= MIN_SCALE ? best : 0;
}

/** px between the anchor and a card sitting above or below it (phones) */
const CLEAR = 28;
/** px the anchor must cross past the middle before a card changes sides — camera drift never flip-flops it */
const HYST = 40;
/** scale a phone card gives up to stay on its current side of the element */
const STAY = 0.08;

/**
 * Puts a cw × ch card (unscaled px) beside the anchor (ax, ay) inside region `reg`
 * at scale `s` (region()'s, or less on phones), clear of the anchor itself and of
 * `taken` (the card already up, which keeps its spot). `memo.side` is the side it
 * took last frame (+1: right of / above the anchor, -1: left of / below, 0: new) and
 * gets the side it takes now. Writes the scaled card rect into `out`; returns the
 * scale used, 0 when there is no room.
 */
export function place(
  ax: number,
  ay: number,
  cw: number,
  ch: number,
  s: number,
  reg: Rect,
  compact: boolean,
  taken: Rect | null,
  memo: { side: number },
  out: Rect,
): number {
  const prefer = memo.side;
  if (compact) {
    // one card at a time, centred on its element, above or below it — whichever lets it stay larger
    const up = Math.min(s, (ay - CLEAR - reg.y) / ch);
    const down = Math.min(s, (reg.y + reg.h - ay - CLEAR) / ch);
    // the side the card holds wins ties by STAY and may shrink STAY further before giving way: no flip-flop on drift
    const upOk = up >= (prefer > 0 ? MIN_COMPACT - STAY : MIN_COMPACT);
    const downOk = down >= (prefer < 0 ? MIN_COMPACT - STAY : MIN_COMPACT);
    const bias = prefer > 0 ? STAY : prefer < 0 ? -STAY : 0;
    const above = upOk && (!downOk || up + bias >= down);
    if (!above && !downOk) return 0;
    const k = above ? up : down;
    memo.side = above ? 1 : -1;
    const w = cw * k;
    const h = ch * k;
    // (an element beside the sheet, below the strip, gets the card at the strip's foot)
    set(out, fit(ax - w / 2, reg.x, reg.x + reg.w - w), fit(above ? ay - CLEAR - h : ay + CLEAR, reg.y, reg.y + reg.h - h), w, h);
    return k;
  }

  const w = cw * s;
  const h = ch * s;
  const xMax = reg.x + reg.w - w;
  const yMax = reg.y + reg.h - h;
  const right = ax <= reg.x + reg.w / 2 + (prefer > 0 ? HYST : prefer < 0 ? -HYST : 0);
  memo.side = right ? 1 : -1;
  set(out, fit(right ? ax + LEAD : ax - LEAD - w, reg.x, xMax), fit(ay - h / 2 - RISE, reg.y, yMax), w, h);
  if (contains(out, ax, ay, 16)) {
    // never sit on the element: the other side, else above or below it
    out.x = fit(right ? ax - LEAD - w : ax + LEAD, reg.x, xMax);
    if (contains(out, ax, ay, 16)) {
      out.x = fit(right ? ax + LEAD : ax - LEAD - w, reg.x, xMax);
      const above = ay - 24 - h;
      out.y = above >= reg.y ? above : fit(ay + 24, reg.y, yMax);
    }
  }
  if (!taken || !overlaps(out, taken, GAP)) return s;

  // the other card holds its spot: stack on the side nearer this card's element, else beside it
  const up = taken.y - GAP - h;
  const down = taken.y + taken.h + GAP;
  const first = ay < taken.y + taken.h / 2 ? up : down;
  const second = first === up ? down : up;
  if (first >= reg.y && first <= yMax) {
    out.y = first;
    return s;
  }
  if (second >= reg.y && second <= yMax) {
    out.y = second;
    return s;
  }
  out.y = fit(ay - h / 2 - RISE, reg.y, yMax);
  for (let k = 0; k < 2; k++) {
    const x = k === 0 ? taken.x + taken.w + GAP : taken.x - GAP - w;
    if (x < reg.x || x > xMax) continue;
    out.x = x;
    if (!overlaps(out, taken, GAP)) return s;
  }
  return 0;
}

/**
 * The elbowed leader from the anchor (ax, ay) to the card (x, y, w, h): a diagonal
 * from the dot, then a short straight run into the card — into the header
 * (`attachY` px below the card top) on a side face, or into the top / bottom
 * edge when the anchor is above or below the card. Writes [ax, ay, ex, ey, tx, ty]
 * into `pts`; returns the SIDE it lands on (SIDE.none when the anchor is under the card).
 */
export function leader(
  ax: number,
  ay: number,
  x: number,
  y: number,
  w: number,
  h: number,
  attachY: number,
  pts: Float32Array,
): number {
  pts[0] = ax;
  pts[1] = ay;
  if (ax < x || ax > x + w) {
    const left = ax < x;
    const tx = left ? x : x + w;
    const ty = y + attachY;
    const run = Math.min(ELBOW, Math.abs(tx - ax) / 2);
    pts[2] = left ? tx - run : tx + run;
    pts[3] = ty;
    pts[4] = tx;
    pts[5] = ty;
    return left ? SIDE.left : SIDE.right;
  }
  if (ay < y || ay > y + h) {
    const below = ay > y + h;
    const tx = fit(ax, x + 18, x + w - 18);
    const ty = below ? y + h : y;
    const run = Math.min(ELBOW, Math.abs(ty - ay) / 2);
    pts[2] = tx;
    pts[3] = below ? ty + run : ty - run;
    pts[4] = tx;
    pts[5] = ty;
    return below ? SIDE.bottom : SIDE.top;
  }
  pts[2] = pts[4] = ax;
  pts[3] = pts[5] = ay;
  return SIDE.none;
}
