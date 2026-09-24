#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   THE POCO OPEN — offline course converter.  FC-10: THE PLACE IS THE COURSE.

     node test/tools/poco-convert.mjs [--out test/src/p2b-poco.html]

   Reads the two mined source files in test/tools/poco/ plus the routing
   waypoint table below (which lives HERE, per POCO.md), and emits ONE
   generated source part — test/src/p2b-poco.html — defining POCO_HOLES in
   Fairway Classic's own hole-record conventions.

   FC-10 deletes the golf-course furniture.  There is no fairway, no tee box
   and no fringe on this course: the ground the neighborhood actually has IS
   the playfield.  The converter's job is therefore no longer "lay a corridor
   and dress its flanks" — it is "write down the real ground, then prove you
   can play across it":

     · LOTS.  Every street frontage is cut into lots, and a lot is a LAWN
       (watered or summer-dry) with a house standing on it.  The lawn is the
       playable ground; the house is a bumper.
     · WATER IS WATER.  No lot may intersect a water polygon, nor sit below
       the local water surface + 0.3 yd, and the bucket must be DRY: ≥ 3 yd
       of clearance from every water record on the hole, scenery pools and
       canal strips included.
     · THE REACHABILITY LAW.  From the tee lawn to the bucket lawn there is
       always a next landable grassy area within 190 yd carrying a landing
       patch ≥ 8 yd across.  The converter walks the chain and reports the
       worst gap; a break is a re-route, not a warning.
     · THE TELL-WHERE-I-AM KIT.  Street names ride along with the geometry:
       blade signs at real intersections, a shared name table the HUD reads
       as the ball crosses a street, and 2-3 flyover callouts per hole.

   DETERMINISM LAW: no Date, no Math.random anywhere in this file.  Every
   jitter comes from a seeded mulberry32 stream, so re-running the converter
   produces a byte-identical part and a clean diff.

   ── frames ────────────────────────────────────────────────────────────────
   source JSON    local METERS, +x east, +y north, origin (37.944, -122.070)
   game world     YARDS, 1 unit = 1 yd (metres x 1.09361)
   hole-local     tee at origin, first centerline segment along +z, and
                  x = the lateral axis such that FC's +off (which FC treats
                  as the player's LEFT — see the bridge placement in p3) is
                  the player's real-world left.  That keeps the neighborhood
                  UN-MIRRORED on screen: screen-right is the real right.

   ── scenery coordinates (deviation from POCO.md, deliberate) ──────────────
   POCO.md specifies scenery in hole-local (d, off).  It is emitted in
   hole-local (x, z) instead: round-tripping a street vertex through
   (d, off) -> clWorld fans out by up to ~15 yd at a 20-deg dogleg, which is
   enough to drop a house into the middle of the road.  (x, z) is exact, and
   it is also cheaper at runtime (the ground test needs no clDoff).
   CROPPING is still done in (d, off) exactly as POCO.md specifies.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(HERE, 'poco');
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i > 0 ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'test', 'src', 'p2b-poco.html');
})();

const DATA = JSON.parse(fs.readFileSync(path.join(SRC, 'poco_course_data.json'), 'utf8'));
const ELEV = JSON.parse(fs.readFileSync(path.join(SRC, 'poco_elev.json'), 'utf8'));

/* ── geodesy: local metres about the mined origin ── */
const LAT0 = DATA.meta.origin.lat, LON0 = DATA.meta.origin.lon;
const M_LAT = 110540, M_LON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const M2Y = 1.09361;
const llYd = (lat, lon) => [(lon - LON0) * M_LON * M2Y, (lat - LAT0) * M_LAT * M2Y];

/* ── seeded RNG (mulberry32, identical to the game's) ── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ═══════════════ THE ROUTING TABLE ═══════════════
   name / par / waypoints tee -> cup.  `cor` is the corridor halfwidth the
   builder crops and plants to — it is NOT a fairway: FC-10 emits fw 0 and
   there is no short grass anywhere on this course.

   designWater: POCO.md's narrative asks for water on 3 (Murderers Creek
   "crossed twice") and 7 ("forced carry over the canal").  The MINED
   geometry does not put either inside those corridors, so the two crossings
   those holes are NAMED for are authored here, flagged, and reported by the
   budget run.  Every other water record on the course is mined geometry. */
const ROUTES = [
  { n: 1, name: 'Soule Street Canyon', par: 4, cor: 52,
    wp: [[37.94150, -122.07214], [37.94116, -122.07095], [37.94098, -122.06818]],
    tours: ['Soule Avenue', 'Murderers Creek'] },
  { n: 2, name: 'First Bell', par: 4, cor: 54,
    wp: [[37.9440, -122.0695], [37.9444, -122.0680], [37.9447, -122.0662]],
    tours: ['Sequoia Elementary School', 'Sequoia Middle School'] },
  /* 3 tracks the real creek now (FC-10 re-route): the mined polyline runs
     NW out of the corner of the neighborhood, and the centerline crosses it
     twice on the way down, which is what the hole is named for. */
  { n: 3, name: 'Murderers Creek', par: 4, cor: 52,
    wp: [[37.94337, -122.06966], [37.94228, -122.07125], [37.94111, -122.07046]],
    designWater: [{ t: 'creek', d: 0.30, w: 10, name: 'Murderers Creek' },
                  { t: 'creek', d: 0.78, w: 10, name: 'Murderers Creek' }],
    tours: ['Murderers Creek'] },
  { n: 4, name: 'Beatrice Road', par: 5, cor: 54,
    wp: [[37.9415, -122.0705], [37.9398, -122.0704], [37.9385, -122.0698], [37.9378, -122.0693]],
    tours: ['Pleasant Oaks Park'] },
  { n: 5, name: 'The Cloverleaf', par: 4, cor: 54,
    wp: [[37.9378, -122.0693], [37.9372, -122.0658]],
    tours: ['Pleasant Oaks Park'] },
  { n: 6, name: 'The Canal', par: 5, cor: 56,
    wp: [[37.9391, -122.0795], [37.9408, -122.0801], [37.9426, -122.0794]],
    tours: ['Contra Costa Canal'] },
  { n: 7, name: 'Christ the King', par: 3, cor: 46,
    wp: [[37.9463, -122.0801], [37.9468, -122.0786]],
    designWater: [{ t: 'creek', d: 0.29, w: 16, name: 'Contra Costa Canal' }],
    tours: ['Christ The King'] },
  { n: 8, name: 'City Hall Pond', par: 3, cor: 46,
    wp: [[37.9470, -122.0637], [37.9476, -122.0630]],
    tours: ['Pleasant Hill City Hall'] },
  /* 9 really crosses Pleasant Hill Park now (FC-10 re-route): v1's line ran
     150 yd south of the park it is named for, so the lawn, the diamonds and
     the pool at the far end were all outside the corridor. */
  { n: 9, name: 'Park Long Drive', par: 4, cor: 56,
    wp: [[37.95033, -122.06863], [37.95024, -122.06711], [37.94907, -122.06601]],
    tours: ['Pleasant HIll Park'] },
];

/* budget caps */
const CAP_HOUSES = 84, CAP_TREES = 220, CAP_WATER = 26;
const CAP_FENCES = 190, CAP_PROPS = 90, CAP_SIGNS = 7;
/* corridor crops */
const CROP_SOLID = 60;   // houses / trees: real geometry, must be on the mesh
const CROP_REGION = 74;  // flat regions: colour-only, the mesh clip trims them
const ELEV_EXAG = 1.6;   // POCO.md: exaggerate the gentle suburb grade
/* THE LINE OF PLAY.  FC-10 has no fairway, but a ball has to be able to
   leave the tee and reach the pail: nothing solid is built within this of
   the centerline, of the tee, or of the bucket's own lawn. */
const CLEAR_LINE = 9, CLEAR_TEE = 17;
/* the reachability law */
const CHAIN_MAX = 190;      // yd between one landable grassy area and the next
const PATCH_R = 4;          // a landing patch is a disc this big, all grass

/* ── elevation grid: bilinear sample, METRES in, METRES out ── */
function elevM(x, y) {
  const { x0, x1, y0, y1, cols, rows, grid } = ELEV;
  const fx = clamp((x - x0) / (x1 - x0) * (cols - 1), 0, cols - 1);
  const fy = clamp((y1 - y) / (y1 - y0) * (rows - 1), 0, rows - 1);
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const i1 = Math.min(cols - 1, i0 + 1), j1 = Math.min(rows - 1, j0 + 1);
  const u = fx - i0, v = fy - j0;
  return grid[j0][i0] * (1 - u) * (1 - v) + grid[j0][i1] * u * (1 - v) +
         grid[j1][i0] * (1 - u) * v + grid[j1][i1] * u * v;
}

/* ═══════════════ per-hole frame ═══════════════ */
function makeFrame(route) {
  const W = route.wp.map(p => llYd(p[0], p[1]));
  const T = W[0];
  let fx = W[1][0] - T[0], fy = W[1][1] - T[1];
  const fl = Math.hypot(fx, fy); fx /= fl; fy /= fl;
  const lx = -fy, ly = fx;                      // the player's real-world LEFT
  // world yards -> hole-local [x, z]
  const loc = (wx, wy) => [(wx - T[0]) * lx + (wy - T[1]) * ly,
                           (wx - T[0]) * fx + (wy - T[1]) * fy];
  // hole-local [x, z] -> world yards (for the elevation sampler)
  const unloc = (x, z) => [T[0] + x * lx + z * fx, T[1] + x * ly + z * fy];
  const pts = W.map(p => loc(p[0], p[1]).map(r2));
  const segD = [0], tan = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1];
    const L = Math.hypot(dx, dz);
    segD.push(segD[i - 1] + L); tan.push([dx / L, dz / L]);
  }
  const len = segD[segD.length - 1];
  /* FC's clDoff, with ONE deliberate difference: `u` is not clamped on the
     first and last segments, so d EXTRAPOLATES past both ends.  FC clamps
     it, which is right for the game (a ball behind the tee still gets a
     lie) and catastrophic as a CROP: clDoff's `off` is the perpendicular
     distance to the segment's infinite LINE, so a shopping centre 300 yd
     beyond the green reads as (d = len, off = 4) and lands in the corridor.
     Extrapolating d makes the crop mean what it says. */
  const doff = (x, z) => {
    let bd = 0, bo = 0, best = 1e18;
    for (let i = 0; i < tan.length; i++) {
      const ax = pts[i][0], az = pts[i][1], tx = tan[i][0], tz = tan[i][1];
      const L = segD[i + 1] - segD[i];
      let u = (x - ax) * tx + (z - az) * tz;
      if (i > 0) u = Math.max(0, u);
      if (i < tan.length - 1) u = Math.min(L, u);
      const px = ax + tx * u, pz = az + tz * u;
      const dd = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (dd < best) { best = dd; bd = segD[i] + u; bo = (x - px) * tz - (z - pz) * tx; }
    }
    return [bd, bo];
  };
  // exactly FC's clPoint/clWorld (extrapolating past both ends)
  const clPoint = d => {
    let i = 0;
    while (i < segD.length - 2 && d > segD[i + 1]) i++;
    const t = tan[i], p = pts[i], u = d - segD[i];
    return [p[0] + t[0] * u, p[1] + t[1] * u, t[0], t[1]];
  };
  const clWorld = (d, off) => { const p = clPoint(d); return [p[0] + p[3] * off, p[1] - p[2] * off]; };
  // ground elevation in YARDS at a hole-local point, tee-relative + exaggerated
  const wTee = unloc(0, 0);
  const e0 = elevM(wTee[0] / M2Y, wTee[1] / M2Y);
  const elevY = (x, z) => {
    const w = unloc(x, z);
    return (elevM(w[0] / M2Y, w[1] / M2Y) - e0) * M2Y * ELEV_EXAG;
  };
  return { loc, unloc, pts, segD, tan, len, doff, clPoint, clWorld, elevY };
}

/* ═══════════════ geometry helpers ═══════════════ */
function polyClip(ptsLocal, F, dMin, dMax, offMax, step = 6) {
  /* Split a local-space polyline into the runs that lie inside the corridor.
     The mined street geometry is SPARSE — half the ways are a single 2-point
     segment hundreds of yards long — so the line is densified first: testing
     only the original vertices threw away every street that crossed the
     corridor without having a node inside it. */
  const dense = [];
  for (let i = 1; i < ptsLocal.length; i++) {
    const a = ptsLocal[i - 1], b = ptsLocal[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / step));
    if (i === 1) dense.push(a);
    for (let k = 1; k <= n; k++) dense.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  if (!dense.length) return [];
  const runs = []; let cur = [];
  for (const p of dense) {
    const r = F.doff(p[0], p[1]);
    if (r[0] > dMin && r[0] < dMax && Math.abs(r[1]) < offMax) cur.push(p);
    else { if (cur.length > 1) runs.push(cur); cur = []; }
  }
  if (cur.length > 1) runs.push(cur);
  // thin each run back down: keep every vertex that bends the line
  return runs.map(run => {
    const out = [run[0]];
    for (let i = 1; i < run.length - 1; i++) {
      const p = out[out.length - 1], q = run[i], s = run[i + 1];
      const a1 = Math.atan2(q[0] - p[0], q[1] - p[1]), a2 = Math.atan2(s[0] - q[0], s[1] - q[1]);
      let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) > 0.04 || Math.hypot(q[0] - p[0], q[1] - p[1]) > 26) out.push(q);
    }
    out.push(run[run.length - 1]);
    return out;
  });
}
function segPointDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / L2;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t, qz = az + dz * t;
  return (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
}
/* do segments AB and CD cross?  (used for street intersections) */
function segCross(ax, az, bx, bz, cx, cz, dx2, dz2) {
  const r1 = bx - ax, r2 = bz - az, s1 = dx2 - cx, s2 = dz2 - cz;
  const den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * s2 - (cz - az) * s1) / den;
  const u = ((cx - ax) * r2 - (cz - az) * r1) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [ax + r1 * t, az + r2 * t];
}

/* ═══════════════ palettes ═══════════════ */
const WALLS = [0xefe8da, 0xd9c7a6, 0xb9c3a8, 0xa8b6bd, 0xe4d9c0, 0xcfcac0, 0xd8cbb4, 0xc3ccc0];
const ROOFS = [0x6b4a33, 0x4a4a4c, 0x8c5a3c, 0x53412f, 0x5d6366, 0x6e5240];
const BIGCOL = { school: 0xeee9dc, church: 0xf2ece0, civic: 0xe4e2da, retail: 0xdcd6c8,
  commercial: 0xdad4c6, apartments: 0xe0d6c2, sports_centre: 0xdfe0da, roof: 0xd4cec0, yes: 0xe6e0d2 };
const BIGSIZE = { school: [26, 14], church: [22, 14], civic: [24, 15], retail: [20, 14],
  commercial: [20, 14], apartments: [24, 16], sports_centre: [28, 18], roof: [13, 10], yes: [12, 9] };
const STREET_W = { residential: 7, tertiary: 9, secondary: 11, unclassified: 7, living_street: 6 };

/* street names read like signs, not like database rows */
const ABBR = [[/\bAvenue\b/g, 'AVE'], [/\bStreet\b/g, 'ST'], [/\bRoad\b/g, 'RD'],
  [/\bDrive\b/g, 'DR'], [/\bCourt\b/g, 'CT'], [/\bLane\b/g, 'LN'], [/\bPlace\b/g, 'PL'],
  [/\bCircle\b/g, 'CIR'], [/\bBoulevard\b/g, 'BLVD'], [/\bLoop\b/g, 'LOOP'],
  [/\bTerrace\b/g, 'TER'], [/\bWay\b/g, 'WAY']];
function signName(n) {
  let s = String(n || '');
  for (const [re, to] of ABBR) s = s.replace(re, to);
  return s.toUpperCase();
}

/* ═══════════════ the conversion ═══════════════ */
const report = [];
const holes = ROUTES.map((route, hi) => {
  const F = makeFrame(route);
  const rng = mulberry32(90210 + route.n * 7919);
  const len = F.len;
  const yds = Math.round(len);
  const COR = route.cor;

  /* ── elevation + cant profiles (9 stations) ── */
  const elv = [], cant = [];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8, d = f * len;
    const c = F.clWorld(d, 0);
    elv.push([r2(f), r2(F.elevY(c[0], c[1]))]);
    const a = F.clWorld(d, 25), b = F.clWorld(d, -25);
    // FC: h += cant * off, and our off is the player's LEFT -> measure d(h)/d(off)
    cant.push([r2(f), r3(clamp((F.elevY(a[0], a[1]) - F.elevY(b[0], b[1])) / 50, -0.055, 0.055))]);
  }
  const e0 = elv[0][1];
  for (const e of elv) e[1] = r2(e[1] - e0);
  /* the same macro height the game's field() computes (crown and funnel are
     ZERO on poco — a neighborhood is not crowned), so lot rejection and the
     water-level law here agree with the ground the player stands on. */
  const profAt = (tbl, f) => {
    f = clamp(f, 0, 1);
    for (let i = 0; i < tbl.length - 1; i++) {
      if (f <= tbl[i + 1][0] || i === tbl.length - 2) {
        const t = (f - tbl[i][0]) / (tbl[i + 1][0] - tbl[i][0] || 1);
        const s = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
        return tbl[i][1] + (tbl[i + 1][1] - tbl[i][1]) * s;
      }
    }
    return tbl[tbl.length - 1][1];
  };
  const elevAt = d => profAt(elv, d / len);
  const cantAt = d => profAt(cant, d / len);
  const macroH = (x, z) => {
    const r = F.doff(x, z);
    return elevAt(r[0]) + cantAt(r[0]) * clamp(r[1] / 26, -1.7, 1.7) * 26;
  };

  /* ═══════════ mined features, cropped to this corridor ═══════════ */
  const inD = (d, lo, hi) => d > lo && d < hi;
  const cropPt = (wx, wy, offMax, dLo, dHi) => {
    const L = F.loc(wx, wy);
    const r = F.doff(L[0], L[1]);
    if (!inD(r[0], dLo === undefined ? -34 : dLo, dHi === undefined ? len + 46 : dHi)) return null;
    if (Math.abs(r[1]) > offMax) return null;
    return { x: L[0], z: L[1], d: r[0], off: r[1] };
  };
  const yd = p => [p[0] * M2Y, p[1] * M2Y];

  /* ── streets + paths (names travel with the geometry now) ── */
  const streets = [], paths = [];
  for (const s of DATA.streets) {
    const lp = s.pts.map(p => F.loc(...yd(p)));
    for (const run of polyClip(lp, F, -40, len + 54, CROP_REGION)) {
      const w = STREET_W[s.class] || 7;
      const sw = (s.class === 'residential' || s.class === 'living_street') ? 1.6 : 0;
      streets.push({ w, sw, pts: run.map(p => [r2(p[0]), r2(p[1])]), cls: s.class,
        name: s.name || '', sign: s.name ? signName(s.name) : '' });
    }
  }
  for (const s of DATA.paths) {
    const lp = s.pts.map(p => F.loc(...yd(p)));
    for (const run of polyClip(lp, F, -40, len + 54, CROP_REGION)) {
      if (run.length < 2) continue;
      paths.push({ w: 3.2, sw: 0, pts: run.map(p => [r2(p[0]), r2(p[1])]), cls: 'path',
        name: s.name || '', sign: s.name ? signName(s.name) : '' });
    }
  }

  /* ── cul-de-sac discs ── */
  const discs = [];
  for (const c of DATA.culdesacs) {
    const p = cropPt(...yd(c.at), CROP_REGION);
    if (p) discs.push([r2(p.x), r2(p.z), 9]);
  }

  /* ── flat regions: park lawn, blacktop/courts, dirt, decks, verges ── */
  const regions = [], schoolCanopies = [], schoolPts = [], civicPts = [];
  const addRegion = (k, shape, x, z, a, b, rot, tag) =>
    regions.push({ k, s: shape, x: r2(x), z: r2(z), a: r2(a), b: r2(b), rot: r3(rot), t: tag });
  for (const pk of DATA.parks) {
    const p = cropPt(...yd(pk.pts[0]), CROP_REGION + 40, -90, len + 90);
    if (!p) continue;
    const r = pk.name ? 92 : 34;
    addRegion('turf', 'ell', p.x, p.z, r, r, 0, 'park');
  }
  for (const lm of DATA.landmarks) {
    if (!lm.pts || !lm.pts.length) continue;
    const p = cropPt(...yd(lm.pts[0]), CROP_REGION);
    if (!p) continue;
    if (lm.kind === 'school' || lm.kind === 'place_of_worship') {
      schoolPts.push({ p, kind: lm.kind, name: lm.name || '' });
      if (lm.kind === 'school') {
        const rot = rng() * 0.4 - 0.2;
        addRegion('pave', 'rect', p.x, p.z, 24, 18, rot, 'blacktop');
        const c = Math.cos(rot), sn = Math.sin(rot);
        for (const [lu, lv] of [[-14, -6], [14, 6]]) {
          const cx = p.x + lu * c - lv * sn, cz = p.z + lu * sn + lv * c;
          addRegion('pave', 'rect', cx, cz, 8, 14, rot, 'court');
        }
        // the school FIELD: the grass a hole can actually land on
        addRegion('turf', 'ell', p.x - 34 * c, p.z - 34 * sn, 30, 26, 0, 'field');
        schoolCanopies.push({ x: p.x, z: p.z, rot });
      }
    } else if (lm.kind === 'townhall') {
      civicPts.push({ p, name: lm.name || '' });
    }
  }
  for (const pt of DATA.pitches) {
    const p = cropPt(...yd(pt.pts[0]), CROP_REGION);
    if (!p) continue;
    const rot = rng() * Math.PI;
    if (pt.sport === 'baseball') addRegion('dirt', 'ell', p.x, p.z, 14, 14, 0, 'infield');
    else if (pt.sport === 'tennis') addRegion('pave', 'rect', p.x, p.z, 7, 15, rot, 'tennis');
    else if (pt.sport === 'basketball') addRegion('pave', 'rect', p.x, p.z, 9, 16, rot, 'court');
    else if (pt.sport === 'boules') addRegion('dirt', 'rect', p.x, p.z, 5, 12, rot, 'boules');
    else addRegion('turf', 'ell', p.x, p.z, 16, 16, 0, 'pitch');
  }
  for (const pg of DATA.playgrounds) {
    const p = cropPt(...yd(pg.pts[0]), CROP_REGION);
    if (p) addRegion('dirt', 'ell', p.x, p.z, 9, 9, 0, 'playground');
  }

  /* ── water: mined ponds/pools, mined canal (strip), creek crossings ── */
  const water = [], waterNote = [];
  for (const w of DATA.water) {
    if (w.kind !== 'pond') continue;
    const p = cropPt(...yd(w.pts[0]), 58);
    if (!p) continue;
    water.push({ t: 'pond', d: r2(p.d), off: r2(p.off), rx: 17, rz: 14, name: 'CIVIC POND' });
    waterNote.push('pond(mined)');
  }
  const minedPools = [];
  for (const pl of DATA.pools) {
    const p = cropPt(...yd(pl), 52);
    if (!p) continue;
    minedPools.push(p);
    water.push({ t: 'pond', d: r2(p.d), off: r2(p.off), rx: 11, rz: 7, name: 'THE POOL' });
    waterNote.push('pool(mined)');
  }
  for (const w of DATA.water) {
    if (w.kind !== 'canal') continue;
    const inside = [];
    for (const p of w.pts) {
      const L = F.loc(...yd(p));
      const r = F.doff(L[0], L[1]);
      if (r[0] > -30 && r[0] < len + 40 && Math.abs(r[1]) < 96) inside.push(r);
    }
    if (inside.length < 2) continue;
    const offs = inside.map(r => r[1]).sort((a, b) => a - b);
    const off = offs[offs.length >> 1];
    if (Math.abs(off) < 26) continue;         // that is a crossing, not a strip
    let d0 = Math.min(...inside.map(r => r[0])), d1 = Math.max(...inside.map(r => r[0]));
    for (const pth of DATA.paths) {
      if (!/Canal/i.test(pth.name || '')) continue;
      for (const p of pth.pts) {
        const L = F.loc(...yd(p));
        const r = F.doff(L[0], L[1]);
        if (r[0] > -30 && r[0] < len + 40 && Math.abs(r[1] - off) < 34) {
          d0 = Math.min(d0, r[0]); d1 = Math.max(d1, r[0]);
        }
      }
    }
    if (d1 - d0 < 60) continue;
    water.push({ t: 'strip', d0: r2(Math.max(-14, d0)), d1: r2(Math.min(len + 34, d1)),
      off: r2(off), w: 18, name: signName(w.name || 'Contra Costa Canal') });
    waterNote.push('strip(mined canal)');
  }
  for (const w of DATA.water) {
    if (w.kind !== 'stream') continue;
    for (let i = 1; i < w.pts.length; i++) {
      const A = F.loc(...yd(w.pts[i - 1])), B = F.loc(...yd(w.pts[i]));
      const a = F.doff(A[0], A[1]), b = F.doff(B[0], B[1]);
      if ((a[1] > 0) === (b[1] > 0)) continue;                 // no sign change: no crossing
      const t = Math.abs(a[1]) / (Math.abs(a[1]) + Math.abs(b[1]) || 1);
      const d = a[0] + (b[0] - a[0]) * t;
      if (d < 26 || d > len - 26) continue;
      if (water.some(q => q.t === 'creek' && Math.abs(q.d - d) < 40)) continue;
      water.push({ t: 'creek', d: r2(d), w: 11, name: signName(w.name || 'creek') });
      waterNote.push('creek(mined ' + w.name + ')');
    }
  }
  for (const dw of (route.designWater || [])) {
    const d = dw.d * len;
    if (water.some(q => q.t === 'creek' && Math.abs(q.d - d) < 45)) continue;
    water.push({ t: 'creek', d: r2(d), w: dw.w, name: signName(dw.name) });
    waterNote.push('creek(AUTHORED)');
  }

  /* the water LEVELS, resolved exactly the way makeHoleField resolves them,
     so "this lot is under water" means the same thing here and in the game */
  /* A CANAL FALLS WITH THE LAND.  v1 levelled the whole strip at the minimum
     elevation of its run, which put the surface up to two yards over the
     ground at the low end — that is what drowned the houses on 6.  The level
     is taken over a LOCAL window instead (the game's makeHoleField uses the
     identical window), so the water tracks the fall of the towpath. */
  const STRIP_WIN = 28;
  function waterLevel(w, d) {
    if (w.t === 'strip') {
      const at = d === undefined ? (w.d0 + w.d1) / 2 : clamp(d, w.d0, w.d1);
      let wl = 1e9;
      for (let k = -2; k <= 2; k++) {
        wl = Math.min(wl, elevAt(clamp(at + k * STRIP_WIN / 2, w.d0, w.d1)));
      }
      return wl - 0.6;
    }
    if (w.t === 'pond') {
      const cn = cantAt(w.d) * clamp(w.off / 26, -1.7, 1.7) * 26;
      return Math.min(elevAt(w.d), elevAt(w.d - w.rz), elevAt(w.d + w.rz)) + cn - 0.6;
    }
    return Math.min(elevAt(w.d), elevAt(w.d + w.w), elevAt(w.d - w.w)) - 0.6;
  }
  /* how far a hole-local point is OUTSIDE every water footprint (negative =
     in the water), and whether it stands clear of the local water surface. */
  function waterClearOne(w, x, z) {
    const r = F.doff(x, z);
    if (w.t === 'strip') {
      const dd = r[0] < w.d0 ? w.d0 - r[0] : (r[0] > w.d1 ? r[0] - w.d1 : 0);
      return Math.max(dd, Math.abs(r[1] - w.off) - w.w / 2);
    }
    if (w.t === 'pond') {
      const c = F.clWorld(w.d, w.off);
      const rr = Math.hypot((x - c[0]) / w.rx, (z - c[1]) / w.rz);
      return (rr - 1) * Math.min(w.rx, w.rz);
    }
    return Math.abs(r[0] - w.d) - w.w / 2;
  }
  function waterClear(x, z) {
    let m = 1e9;
    for (const w of water) m = Math.min(m, waterClearOne(w, x, z));
    return m;
  }
  /* THE LOCAL water surface — the bank you are standing on, not a pond two
     hundred yards up the hill at a different altitude.  The margin is
     generous (the game's ground carries a yard of noise and meso roll that
     this macro estimate does not), because the harness asserts the law on
     the BUILT ground and a lot that fails there is a shipped bug. */
  const WATER_LOCAL = 16;
  function aboveWater(x, z, margin) {
    const h = macroH(x, z);
    const r = F.doff(x, z);
    for (const w of water) {
      if (waterClearOne(w, x, z) > WATER_LOCAL) continue;
      if (h < waterLevel(w, r[0]) + margin) return false;
    }
    return true;
  }

  /* A WATER STRIP MUST BE SEEN: nothing is built on the bank between the
     line of play and the far edge of a strip. */
  const strip = water.find(w => w.t === 'strip');
  const stripSide = strip ? Math.sign(strip.off) : 0;
  const stripFar = strip ? Math.abs(strip.off) + strip.w / 2 + 3 : 0;
  function stripClear(x, z) {
    if (!strip) return true;
    const r = F.doff(x, z);
    if (r[0] < strip.d0 - 20 || r[0] > strip.d1 + 20) return true;
    return !(Math.sign(r[1]) === stripSide && Math.abs(r[1]) < stripFar);
  }
  /* the canal's own kit: a gravel towpath with a grass verge between it and
     the water — the thing that makes the canal read as a canal */
  if (strip) {
    const dm = (strip.d0 + strip.d1) / 2, dl = strip.d1 - strip.d0;
    const sg = -Math.sign(strip.off);                 // toward the line of play
    const vergeOff = strip.off + sg * (strip.w / 2 + 5);    // 10 yd of bank grass
    const trailOff = strip.off + sg * (strip.w / 2 + 11.8); // then the towpath
    const vw = F.clWorld(dm, vergeOff), tw = F.clWorld(dm, trailOff);
    const ang = Math.atan2(F.clPoint(dm)[2], F.clPoint(dm)[3]);
    addRegion('turf', 'rect', vw[0], vw[1], 5, dl / 2, -ang, 'verge');
    addRegion('pave', 'rect', tw[0], tw[1], 1.8, dl / 2, -ang, 'trail');
  }

  /* ── bunkers: mapped baseball infields inside the corridor ── */
  const bunkers = [];
  for (const pt of DATA.pitches) {
    if (pt.sport !== 'baseball') continue;
    const p = cropPt(...yd(pt.pts[0]), 56, 24, len - 12);
    if (!p) continue;
    bunkers.push([r2(p.d), r2(p.off), 13, 13]);
  }

  /* ═══════════ the green: THE LAWN THE BUCKET SITS ON ═══════════
     FC-10 has no putting surface built out of nowhere — the pail stands on
     a lawn, mown a shade brighter.  So the green record is small (a lot, not
     an Augusta complex) and it is SLID, if it has to be, to ground that is
     dry, off the street, and clear of anything solid. */
  const gr = route.par === 3 ? 8 + rng() * 1.2 : 8.5 + rng() * 1.6;
  let gOffX = 0, gOffZ = 0;   // hole-local offset applied to the cup's lawn
  const green = {
    r: r2(gr), sx: r3((rng() - 0.5) * 0.02), sz: r3((rng() - 0.5) * 0.02),
    ang: Math.round((rng() - 0.5) * 24), mound: route.n === 7 ? 1.6 : r2(0.3 + rng() * 0.25),
    pin: [0, 0],
    lobes: [[r2((rng() - 0.5) * 5), r2((rng() - 0.5) * 4), r2(4 + rng() * 1.2), r2(0.14 + rng() * 0.1)],
            [r2((rng() - 0.5) * 5), r2((rng() - 0.5) * 4), r2(3.6 + rng() * 1.2), r2(-0.1 - rng() * 0.08)]],
  };

  /* ═══════════ the street helpers ═══════════ */
  function nearestStreet(x, z) {
    let best = 1e18, px = 0, pz = 0, w = 7, nm = '';
    for (const s of streets) {
      if (s.cls === 'secondary') continue;
      for (let i = 1; i < s.pts.length; i++) {
        const ax = s.pts[i - 1][0], az = s.pts[i - 1][1];
        const bx = s.pts[i][0], bz = s.pts[i][1];
        const dx = bx - ax, dz = bz - az;
        const L2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
        const qx = ax + dx * t, qz = az + dz * t;
        const dd = (x - qx) * (x - qx) + (z - qz) * (z - qz);
        if (dd < best) { best = dd; px = qx; pz = qz; w = s.w / 2 + s.sw; nm = s.sign; }
      }
    }
    if (best === 1e18) return null;
    return { d: Math.sqrt(best), px, pz, w, name: nm };
  }
  function nearestStreetAngle(x, z) {
    const n = nearestStreet(x, z);
    if (!n || n.d > 90) return null;
    return Math.atan2(n.px - x, n.pz - z);      // FACING the kerb
  }
  function onStreet(x, z, pad) {
    for (const s of [...streets, ...paths]) {
      const hw = s.w / 2 + s.sw + pad;
      for (let i = 1; i < s.pts.length; i++) {
        if (segPointDist2(x, z, s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]) < hw * hw) return true;
      }
    }
    return false;
  }
  function inRegion(g, x, z) {
    const dx = x - g.x, dz = z - g.z;
    const c = Math.cos(g.rot), s = Math.sin(g.rot);
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    return g.s === 'ell' ? (u * u) / (g.a * g.a) + (v * v) / (g.b * g.b) < 1
                         : Math.abs(u) < g.a && Math.abs(v) < g.b;
  }
  const offLine = (x, z) => Math.abs(F.doff(x, z)[1]);

  /* ═══════════ big buildings (real, named / civic footprints) ═══════════ */
  const bigs = [], bigFoot = [], props = [];
  const addProp = (k, x, z, rot, s) => props.push([k, r2(x), r2(z), r3(rot), r2(s === undefined ? 1 : s)]);
  function bigOK(x, z) {
    const r = F.doff(x, z);
    return Math.abs(r[1]) >= CLEAR_LINE + 8 && Math.abs(r[1]) <= CROP_SOLID &&
           r[0] > -30 && r[0] < len + 44;
  }
  for (const b of DATA.buildings) {
    if (b.kind === 'yes' || b.kind === 'no') continue;
    const p = cropPt(...yd(b.pts[0]), CROP_SOLID);
    if (!p || !bigOK(p.x, p.z)) continue;
    const sz = BIGSIZE[b.kind] || [20, 14];
    const rot = nearestStreetAngle(p.x, p.z) ?? 0;
    const h = b.kind === 'roof' ? 3.4 : 5 + rng() * 2;
    const gable = /Christ/i.test(b.name || '');
    bigs.push({ x: r2(p.x), z: r2(p.z), rot: r3(rot), a: sz[0] / 2, b: sz[1] / 2,
      h: r2(h), c: BIGCOL[b.kind] || 0xe0dace, g: gable ? 1 : 0, k: b.kind });
    bigFoot.push({ x: p.x, z: p.z, r: Math.max(sz[0], sz[1]) * 0.62 });
    if (gable) addProp(6, p.x, p.z, rot, 1);            // the steeple
  }
  for (const sc of schoolCanopies) {
    for (const lu of [-21, 21]) {
      const cx = sc.x + lu * Math.cos(sc.rot);
      const cz = sc.z + lu * Math.sin(sc.rot);
      if (!bigOK(cx, cz)) continue;
      bigs.push({ x: r2(cx), z: r2(cz), rot: r3(sc.rot), a: 10, b: 6,
        h: 4.2, c: 0x4a5561, g: 0, k: 'canopy' });
      bigFoot.push({ x: cx, z: cz, r: 10 });
    }
  }
  for (const s of schoolPts) {
    const dup = bigFoot.some(b => (b.x - s.p.x) ** 2 + (b.z - s.p.z) ** 2 < 55 * 55);
    const rot = nearestStreetAngle(s.p.x, s.p.z) ?? 0;
    if (!dup) {
      const sz = s.kind === 'school' ? BIGSIZE.school : BIGSIZE.church;
      let bx = s.p.x + Math.cos(rot) * 30, bz = s.p.z - Math.sin(rot) * 30;
      if (!bigOK(bx, bz)) { bx = s.p.x - Math.cos(rot) * 30; bz = s.p.z + Math.sin(rot) * 30; }
      if (bigOK(bx, bz)) {
        bigs.push({ x: r2(bx), z: r2(bz), rot: r3(rot), a: sz[0] / 2, b: sz[1] / 2,
          h: r2(5.4 + rng()), c: s.kind === 'school' ? BIGCOL.school : BIGCOL.church,
          g: s.kind === 'place_of_worship' ? 1 : 0, k: s.kind });
        bigFoot.push({ x: bx, z: bz, r: Math.max(sz[0], sz[1]) * 0.62 });
        if (s.kind === 'place_of_worship') addProp(6, bx, bz, rot, 1);
      }
    }
    /* THE IDENTITY KIT — a school reads as a SCHOOL: a flagpole by the door
       and two backstops out on the field. */
    if (s.kind === 'school') {
      const c = Math.cos(rot), sn = Math.sin(rot);
      addProp(3, s.p.x + c * 13, s.p.z - sn * 13, rot, 1);           // flagpole
      for (const [lu, lv] of [[-30, -20], [-38, 16]]) {
        const bx = s.p.x + lu * c - lv * sn, bz = s.p.z + lu * sn + lv * c;
        if (Math.abs(F.doff(bx, bz)[1]) < CROP_SOLID) addProp(4, bx, bz, rot + lv * 0.02, 1);
      }
    }
  }
  /* City Hall keeps its civic portico */
  for (const cv of civicPts) {
    const rot = nearestStreetAngle(cv.p.x, cv.p.z) ?? 0;
    if (bigOK(cv.p.x, cv.p.z)) addProp(5, cv.p.x, cv.p.z, rot, 1);
  }

  /* ═══════════ THE RESIDENTIAL LAYER — lots first, houses on them ═══════════
     A lot is a LAWN.  Every one is rejected outright if it touches water, or
     stands below the local water surface: v1 shipped houses under the canal
     and a bucket in the pool, and FC-10's harness asserts both to zero. */
  const houses = [], tramps = [], lotPools = [], lots = [], fences = [], drives = [];
  const blocked = [];
  for (const b of bigFoot) blocked.push([b.x, b.z, b.r]);
  const blockedRects = [];   // long regions (the canal's verge and towpath)
  for (const g of regions) {
    if (g.t === 'park' || g.t === 'field') continue;   // a park does not stop houses on its rim
    /* A LONG REGION IS NOT A CIRCLE.  The canal's verge and towpath are
       400-yd ribbons; blocking them with a bounding circle wiped the entire
       east side of 6 off the map (10 lots on a par 5). */
    if (Math.max(g.a, g.b) > 3 * Math.min(g.a, g.b)) { blockedRects.push(g); continue; }
    blocked.push([g.x, g.z, Math.max(g.a, g.b) + 4]);
  }
  for (const dq of discs) blocked.push([dq[0], dq[1], dq[2] + 3]);
  for (const p of minedPools) blocked.push([p.x, p.z, 12]);
  for (const w of water) {
    if (w.t === 'pond') { const c = F.clWorld(w.d, w.off); blocked.push([c[0], c[1], Math.max(w.rx, w.rz) + 5]); }
  }
  const parkRegions = regions.filter(g => g.t === 'park' || g.t === 'pitch' || g.t === 'field');

  const LOT_W = 18, LOT_D = 30;     // a lot: 18 across the frontage, 30 deep
  const HOUSE_D = 8;                // …with the house 8 deep, 7 back from the kerb
  function lotFree(x, z, r) {
    for (const b of blocked) {
      const dx = x - b[0], dz = z - b[1], rr = b[2] + r;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    for (const g of blockedRects) {
      const dx = x - g.x, dz = z - g.z;
      const c = Math.cos(g.rot), s = Math.sin(g.rot);
      const u = dx * c + dz * s, v = -dx * s + dz * c;
      if (Math.abs(u) < g.a + r && Math.abs(v) < g.b + r) return false;
    }
    for (const g of parkRegions) if (inRegion(g, x, z)) return false;
    return !onStreet(x, z, r * 0.55);
  }
  /* the water law, applied to the WHOLE lot rectangle (centre + corners) */
  function lotDry(x, z, rot, a, b) {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const [u, v] of [[0, 0], [-a, -b], [a, -b], [a, b], [-a, b], [0, -b], [0, b],
                          [-a, 0], [a, 0]]) {
      const px = x + u * c + v * s, pz = z - u * s + v * c;
      if (waterClear(px, pz) < 3) return false;
      if (!aboveWater(px, pz, 2.2)) return false;
    }
    return true;
  }
  function lineClear(x, z, pad) {
    const r = F.doff(x, z);
    if (Math.abs(r[1]) > CLEAR_LINE + pad) return true;
    return r[0] < -20 || r[0] > len + 30;
  }
  /* a house may not stand on the tee lawn, on the bucket lawn, in the lane
     of play between them — or on the canal bank.  A WATER STRIP MUST BE
     SEEN: the canal down the left of 6 is the whole defence of the hole,
     and v1 hid it behind a rank of roofs.  Lawns on that bank are fine (and
     are what the real bank is); roofs and oaks are not. */
  function buildable(x, z, rad) {
    if (!lineClear(x, z, rad)) return false;
    const tee = Math.hypot(x, z);
    if (tee < CLEAR_TEE + rad) return false;
    return stripClear(x, z);
  }

  function addLot(x, z, rot, dry, tag) {
    lots.push({ x: r2(x), z: r2(z), rot: r3(rot), a: r2(LOT_W / 2), b: r2(LOT_D / 2),
      dry: dry ? 1 : 0, t: tag || 'lot', off: offLine(x, z) });
    return lots[lots.length - 1];
  }
  function dropHouse(lotX, lotZ, rot) {
    /* the house sits toward the FRONT of its lot, facing the kerb (rot points
       at the street): +b in lot-local is the street side. */
    const hw = (8 + rng() * 3) / 2, hl = HOUSE_D / 2;
    const fwd = LOT_D / 2 - 7 - hl;              // 7 yd of front lawn
    const x = lotX + Math.sin(rot) * fwd, z = lotZ + Math.cos(rot) * fwd;
    const wallH = 3 + rng();
    const roofH = 1.1 + rng() * 0.7;
    const hip = rng() < 0.42 ? 1 : 0;
    const wc = WALLS[(rng() * WALLS.length) | 0], rc = ROOFS[(rng() * ROOFS.length) | 0];
    const r = F.doff(x, z);
    houses.push({ x: r2(x), z: r2(z), rot: r3(rot), a: r2(hw), b: r2(hl),
      wh: r2(wallH), rh: r2(roofH), hip, wc, rc, off: Math.abs(r[1]), d: r[0] });
    blocked.push([x, z, Math.max(hw, hl) + 1.4]);
    // the driveway: front kerb to the road
    const ns = nearestStreet(x, z);
    if (ns && ns.d < 40) {
      const fx = x + Math.sin(rot) * (hl + 0.6), fz = z + Math.cos(rot) * (hl + 0.6);
      const kL = Math.hypot(ns.px - fx, ns.pz - fz) || 1;
      const kx = fx + (ns.px - fx) / kL * Math.max(0, kL - ns.w * 0.6);
      const kz = fz + (ns.pz - fz) / kL * Math.max(0, kL - ns.w * 0.6);
      if (kL > 2.5) {
        drives.push([r2(fx), r2(fz), r2(kx), r2(kz)]);
        /* the street furniture: a mailbox at the kerb, and every so often a
           hoop over the driveway or a car parked on it */
        addProp(0, kx + (fx - kx) * 0.12, kz + (fz - kz) * 0.12, rot, 1);
        if (rng() < 0.26) addProp(1, kx + (fx - kx) * 0.42, kz + (fz - kz) * 0.42, rot, 1);
        else if (rng() < 0.3) addProp(2, kx + (fx - kx) * 0.3, kz + (fz - kz) * 0.3, rot, 1);
      }
    }
    // the back yard: ~13% get a pool, ~8% a trampoline
    const bx = x - Math.sin(rot) * (hl + 7), bz = z - Math.cos(rot) * (hl + 7);
    const roll = rng();
    if (roll < 0.13 && lotFree(bx, bz, 5) && buildable(bx, bz, 5) && waterClear(bx, bz) > 14) {
      const p = F.doff(bx, bz);
      lotPools.push({ t: 'pond', d: r2(p[0]), off: r2(p[1]), rx: 4.2, rz: 3.0, name: 'THE POOL',
        _o: Math.abs(p[1]), _x: bx, _z: bz });
      blocked.push([bx, bz, 7]);
    } else if (roll < 0.21 && lotFree(bx, bz, 4) && buildable(bx, bz, 4)) {
      tramps.push([r2(bx), r2(bz), 2.6]);
      blocked.push([bx, bz, 5]);
    }
    return { x, z, hw, hl };
  }
  /* THE BACK-YARD FENCE — the thing that turns a lawn hop into a CARRY.
     One run along the back of each lot plus the two side runs, deduped
     against anything already standing nearly on the same line. */
  function fenceSeg(x0, z0, x1, z1) {
    for (const f of fences) {
      const a = segPointDist2((x0 + x1) / 2, (z0 + z1) / 2, f[0], f[1], f[2], f[3]);
      if (a < 2.2 * 2.2) return;
    }
    if (!lineClear((x0 + x1) / 2, (z0 + z1) / 2, 1)) return;
    fences.push([r2(x0), r2(z0), r2(x1), r2(z1)]);
  }
  function lotFences(lx, lz, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const A = LOT_W / 2, B = LOT_D / 2;
    // lot-local (u across, v toward the street) -> world
    const W = (u, v) => [lx + u * c + v * s, lz - u * s + v * c];
    const back0 = W(-A, -B), back1 = W(A, -B);
    fenceSeg(back0[0], back0[1], back1[0], back1[1]);
    const sideA0 = W(-A, -B), sideA1 = W(-A, 1);
    const sideB0 = W(A, -B), sideB1 = W(A, 1);
    fenceSeg(sideA0[0], sideA0[1], sideA1[0], sideA1[1]);
    fenceSeg(sideB0[0], sideB0[1], sideB1[0], sideB1[1]);
  }

  /* (1) lots along every real street frontage, both sides */
  for (const s of streets) {
    if (s.cls === 'secondary') continue;   // no driveways onto the arterial
    const front = s.w / 2 + s.sw + LOT_D / 2 + 1.5;
    let carry = 6 + rng() * 6;
    for (let i = 1; i < s.pts.length; i++) {
      const ax = s.pts[i - 1][0], az = s.pts[i - 1][1];
      const bx = s.pts[i][0], bz = s.pts[i][1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.1) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      const nx = uz, nz = -ux;
      for (let t = carry; t < L; t += LOT_W + 0.6) {
        const px = ax + ux * t, pz = az + uz * t;
        for (const side of [-1, 1]) {
          const cx = px + nx * side * front, cz = pz + nz * side * front;
          const rr = F.doff(cx, cz);
          if (Math.abs(rr[1]) > CROP_SOLID || rr[0] < -30 || rr[0] > len + 44) continue;
          if (!lotFree(cx, cz, 9)) continue;
          if (!lotDry(cx, cz, Math.atan2(-nx * side, -nz * side), LOT_W / 2, LOT_D / 2)) continue;
          const rot = Math.atan2(-nx * side, -nz * side);   // faces the kerb
          /* THE LAWN GOES DOWN EITHER WAY.  A lot that reaches across the
             line of play is still somebody's lawn and still the ground you
             land on; it is the HOUSE that has to stand clear, so the lane
             from the mat to the pail is always playable. */
          addLot(cx, cz, rot, rng() < 0.34);
          /* A FENCE IS A BACK YARD'S FENCE.  Lots that carry no house —
             the open bank of the canal, the lane of play — carry no
             fences either, or the hole grows long tan walls standing in
             the middle of nothing. */
          if (buildable(cx, cz, 8)) { dropHouse(cx, cz, rot); lotFences(cx, cz, rot); }
          blocked.push([cx, cz, LOT_W * 0.42]);   // …after, or the lot blocks its own back yard
        }
        carry = t + LOT_W + 0.6 - L;
      }
      carry = Math.max(0, carry);
    }
  }
  /* (2) GAP FILL: a suburb has no empty blocks.  Walk the corridor flanks
         and drop a lot anywhere a 22-yd neighbourhood is still bare. */
  for (let d = 2; d < len + 34; d += 9) {
    for (const side of [-1, 1]) {
      for (let o = 4; o < CROP_SOLID - 8; o += 12) {
        const w = F.clWorld(d + (rng() - 0.5) * 5, side * (o + (rng() - 0.5) * 4));
        if (!lotFree(w[0], w[1], 10)) continue;
        let near = 1e18;
        for (const l of lots) { const dd = (l.x - w[0]) ** 2 + (l.z - w[1]) ** 2; if (dd < near) near = dd; }
        if (near < 18 * 18) continue;
        const rot = nearestStreetAngle(w[0], w[1]) ??
          (Math.atan2(w[0] - F.clWorld(d, 0)[0], w[1] - F.clWorld(d, 0)[1]) + Math.PI);
        if (!lotDry(w[0], w[1], rot, LOT_W / 2, LOT_D / 2)) continue;
        addLot(w[0], w[1], rot, rng() < 0.34);
        if (buildable(w[0], w[1], 9)) { dropHouse(w[0], w[1], rot); lotFences(w[0], w[1], rot); }
        blocked.push([w[0], w[1], LOT_W * 0.42]);
      }
    }
  }

  /* ═══════════ THE TEE LAWN AND THE BUCKET LAWN ═══════════
     Both are lots with no house on them: the doormat goes down on one, the
     pail stands on the other.  They are placed last so nothing can claim
     their ground, and the bucket's lawn is slid to dry, buildable ground if
     the centerline happens to end in a pond, on the asphalt or in a wall. */
  /* THE MAT GOES ON A LAWN.  A hole's first waypoint lands in the roadway
     or on a school's blacktop often enough — and on this course the tee IS
     a rubber mat on somebody's grass — so the mat, the tee lot and the ball
     slide together to the nearest ground that is grass, dry and unpaved. */
  let mat = [0, 4];
  {
    const cand = [[0, 4]];
    for (let ri = 1; ri <= 6; ri++) {
      for (let a = 0; a < 8; a++) {
        const th = Math.PI * 2 * a / 8 + ri * 0.4;
        cand.push([Math.cos(th) * ri * 4, 4 + Math.sin(th) * ri * 4]);
      }
    }
    for (const c of cand) {
      if (onStreet(c[0], c[1], 4)) continue;
      // the lot that will carry this mat sits 2 yd up the hole from it —
      // test THAT rectangle, or the drowned-lot pass can take it away later
      if (!lotDry(c[0], c[1] + 2, 0, LOT_W / 2, LOT_D / 2)) continue;
      let paved = false;
      for (const g of regions) {
        if (g.k === 'turf') continue;
        if (inRegion(g, c[0], c[1])) { paved = true; break; }
      }
      for (const dq of discs) if ((c[0] - dq[0]) ** 2 + (c[1] - dq[1]) ** 2 < dq[2] * dq[2]) paved = true;
      if (paved) continue;
      mat = c;
      break;
    }
  }
  const teeAng = 0;
  addLot(mat[0], mat[1] + 2, teeAng, false, 'tee');
  lots[lots.length - 1].keep = 1;
  // the pail's lawn: search outward from the centerline end for dry ground
  let gw = F.clWorld(len, 0);
  {
    let bestW = null, bestS = -1e9;
    const cand = [[0, 0]];
    for (let ri = 1; ri <= 7; ri++) {
      for (let a = 0; a < 10; a++) {
        const th = Math.PI * 2 * a / 10 + ri * 0.31;
        cand.push([Math.cos(th) * ri * 4.5, Math.sin(th) * ri * 4.5]);
      }
    }
    for (const [ox, oz] of cand) {
      const x = gw[0] + ox, z = gw[1] + oz;
      const wc = waterClear(x, z);
      if (wc < green.r + 5) continue;
      if (!aboveWater(x, z, 1.0)) continue;
      if (onStreet(x, z, 2.5)) continue;
      let solid = false;
      for (const b of blocked) {
        const dx = x - b[0], dz = z - b[1], rr = b[2] + green.r;
        if (dx * dx + dz * dz < rr * rr) { solid = true; break; }
      }
      for (const h of houses) {
        if (solid) break;
        const dx = x - h.x, dz = z - h.z;
        if (dx * dx + dz * dz < (Math.max(h.a, h.b) + green.r + 2) ** 2) solid = true;
      }
      if (solid) continue;
      const pen = Math.hypot(ox, oz);
      const s = Math.min(wc, 40) - pen * 1.4;
      if (s > bestS) { bestS = s; bestW = [x, z, ox, oz]; }
    }
    if (bestW) { gOffX = bestW[2]; gOffZ = bestW[3]; gw = [bestW[0], bestW[1]]; }
  }
  green.off = [r2(gOffX), r2(gOffZ)];
  addLot(gw[0], gw[1], Math.atan2(gw[0] - F.clWorld(len - 22, 0)[0], gw[1] - F.clWorld(len - 22, 0)[1]) + Math.PI,
    false, 'green');
  lots[lots.length - 1].keep = 1;
  // nothing solid stands on either lawn
  for (let i = houses.length - 1; i >= 0; i--) {
    const h = houses[i];
    if (Math.hypot(h.x - gw[0], h.z - gw[1]) < green.r + 9) houses.splice(i, 1);
  }
  for (let i = fences.length - 1; i >= 0; i--) {
    const f = fences[i];
    const mx = (f[0] + f[2]) / 2, mz = (f[1] + f[3]) / 2;
    if (Math.hypot(mx - gw[0], mz - gw[1]) < green.r + 7 || Math.hypot(mx, mz) < CLEAR_TEE) {
      fences.splice(i, 1);
    }
  }
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    if (Math.hypot(p[1] - gw[0], p[2] - gw[1]) < green.r + 6 || Math.hypot(p[1], p[2]) < CLEAR_TEE ||
        Math.hypot(p[1] - mat[0], p[2] - mat[1]) < 9) {
      props.splice(i, 1);
    }
  }

  /* ═══════════ trees ═══════════ */
  const trees = [];
  const treeFree = (x, z, r) => {
    for (const b of blocked) { const dx = x - b[0], dz = z - b[1], rr = b[2] * 0.5 + r; if (dx * dx + dz * dz < rr * rr) return false; }
    for (const h of houses) { const dx = x - h.x, dz = z - h.z, rr = Math.max(h.a, h.b) + 1.6 + r; if (dx * dx + dz * dz < rr * rr) return false; }
    for (const t of trees) { const dx = x - t[0], dz = z - t[1]; if (dx * dx + dz * dz < 28) return false; }
    for (const f of fences) { if (segPointDist2(x, z, f[0], f[1], f[2], f[3]) < 3.2 * 3.2) return false; }
    return !onStreet(x, z, r + 1.2);
  };
  const addTree = (x, z, kind, s) => {
    const rr = F.doff(x, z);
    if (Math.abs(rr[1]) > CROP_SOLID || rr[0] < -30 || rr[0] > len + 44) return false;
    if (!lineClear(x, z, 3)) return false;
    if (Math.hypot(x, z) < CLEAR_TEE + 3) return false;
    if (Math.hypot(x - gw[0], z - gw[1]) < green.r + 8) return false;
    if (!stripClear(x, z)) return false;
    if (!treeFree(x, z, 2.2)) return false;
    trees.push([r2(x), r2(z), kind, r2(s), Math.abs(rr[1])]);
    return true;
  };
  // riparian corridors: rows along every mined water polyline
  for (const w of DATA.water) {
    const lp = w.pts.map(p => F.loc(...yd(p)));
    for (let i = 1; i < lp.length; i++) {
      const L = Math.hypot(lp[i][0] - lp[i - 1][0], lp[i][1] - lp[i - 1][1]);
      if (L < 0.5) continue;
      const ux = (lp[i][0] - lp[i - 1][0]) / L, uz = (lp[i][1] - lp[i - 1][1]) / L;
      for (let t = 0; t < L; t += 9) {
        for (const side of [-1, 1]) {
          const off = side * (7 + rng() * 7);
          addTree(lp[i - 1][0] + ux * t + uz * off, lp[i - 1][1] + uz * t - ux * off, 0, 0.95 + rng() * 0.5);
        }
      }
    }
  }
  // street trees: a rank in the verge every ~20 yd, with seeded gaps
  for (const s of [...streets, ...paths]) {
    for (let i = 1; i < s.pts.length; i++) {
      const ax = s.pts[i - 1][0], az = s.pts[i - 1][1];
      const L = Math.hypot(s.pts[i][0] - ax, s.pts[i][1] - az);
      if (L < 0.5) continue;
      const ux = (s.pts[i][0] - ax) / L, uz = (s.pts[i][1] - az) / L;
      for (let t = 5; t < L; t += 19 + rng() * 6) {
        if (rng() < 0.24) continue;                  // the seeded gaps
        for (const side of [-1, 1]) {
          const off = side * (s.w / 2 + s.sw + 3.2 + rng() * 1.2);
          addTree(ax + ux * t + uz * off, az + uz * t - ux * off, rng() < 0.16 ? 1 : 0, 0.85 + rng() * 0.45);
        }
      }
    }
  }
  // park clumps — around the rim, never over the grass a hole has to land on
  for (const g of parkRegions) {
    for (let k = 0; k < 22; k++) {
      const a = rng() * Math.PI * 2, rr2 = 0.82 + rng() * 0.3;
      addTree(g.x + Math.cos(a) * g.a * rr2, g.z + Math.sin(a) * g.b * rr2, rng() < 0.2 ? 1 : 0, 1.0 + rng() * 0.6);
    }
  }
  /* THE CANOPY LAW — oaks down both flanks, in the gaps the lots leave */
  for (let d = 2; d < len + 38; d += 6) {
    for (const side of [-1, 1]) {
      for (const band of [6, 16, 28, 42]) {
        if (rng() < 0.2) continue;                       // seeded gaps
        const o = side * (CLEAR_LINE + band + rng() * 6);
        const w = F.clWorld(d + (rng() - 0.5) * 4.5, o);
        addTree(w[0], w[1], rng() < 0.13 ? 1 : 0, 0.8 + rng() * 0.55);
      }
    }
  }

  /* ═══════════ THE POOL KIT: deck + fence around every pool ═══════════ */
  for (const p of [...minedPools.map(q => ({ x: q.x, z: q.z, rx: 11, rz: 7 })),
                   ...lotPools.map(q => ({ x: q._x, z: q._z, rx: 4.2, rz: 3 }))]) {
    if (Math.abs(F.doff(p.x, p.z)[1]) > CROP_REGION) continue;
    addRegion('pave', 'ell', p.x, p.z, p.rx + 3.2, p.rz + 3.2, 0, 'pooldeck');
    const fr = Math.max(p.rx, p.rz) + 4.4;
    for (let k = 0; k < 8; k++) {
      const a0 = Math.PI * 2 * k / 8, a1 = Math.PI * 2 * (k + 1) / 8;
      fenceSeg(p.x + Math.cos(a0) * fr, p.z + Math.sin(a0) * fr * 0.8,
               p.x + Math.cos(a1) * fr, p.z + Math.sin(a1) * fr * 0.8);
    }
  }

  /* ═══════════ THE TELL-WHERE-I-AM KIT ═══════════ */
  const nameTab = [], nameIdx = new Map();
  const nameId = s => {
    if (!s) return -1;
    if (nameIdx.has(s)) return nameIdx.get(s);
    nameIdx.set(s, nameTab.length);
    nameTab.push(s);
    return nameTab.length - 1;
  };
  /* street blade signs at REAL intersections: where two named streets
     actually cross inside the corridor, both blades go up on one post. */
  const signs = [];
  for (let i = 0; i < streets.length; i++) {
    for (let j = i + 1; j < streets.length; j++) {
      const A = streets[i], B = streets[j];
      if (!A.sign || !B.sign || A.sign === B.sign) continue;
      let hit = null;
      for (let p = 1; p < A.pts.length && !hit; p++) {
        for (let q = 1; q < B.pts.length && !hit; q++) {
          hit = segCross(A.pts[p - 1][0], A.pts[p - 1][1], A.pts[p][0], A.pts[p][1],
                         B.pts[q - 1][0], B.pts[q - 1][1], B.pts[q][0], B.pts[q][1]);
        }
      }
      if (!hit) continue;
      const r = F.doff(hit[0], hit[1]);
      if (r[0] < -24 || r[0] > len + 34 || Math.abs(r[1]) > COR + 6) continue;
      if (signs.some(s => (s.x - hit[0]) ** 2 + (s.z - hit[1]) ** 2 < 26 * 26)) continue;
      // stand the post on the corner, out of the roadway
      const ang = Math.atan2(A.pts[1][0] - A.pts[0][0], A.pts[1][1] - A.pts[0][1]);
      const post = [hit[0] + Math.cos(ang) * (A.w / 2 + 2.6), hit[1] - Math.sin(ang) * (A.w / 2 + 2.6)];
      signs.push({ x: r2(post[0]), z: r2(post[1]), rot: r3(ang), a: A.sign, b: B.sign,
        off: Math.abs(r[1]) });
    }
  }
  signs.sort((a, b) => a.off - b.off);
  const signsOut = signs.slice(0, CAP_SIGNS);
  /* …and where a hole has no mined intersection in the corridor, the street
     it plays down still names itself once. */
  if (signsOut.length < 2) {
    const seen = new Set(signsOut.map(s => s.a));
    for (const s of streets) {
      if (signsOut.length >= 2) break;
      if (!s.sign || seen.has(s.sign)) continue;
      // the point on this street that comes NEAREST the line of play — the
      // midpoint of a way that only clips the corridor is off in the weeds
      let bi = -1, bo = 1e9;
      for (let i = 0; i < s.pts.length; i++) {
        const r = F.doff(s.pts[i][0], s.pts[i][1]);
        // the window the PLAYER sees (FC clamps d at the tee; this crop
        // extrapolates it), so a blade just behind the tee still goes up
        if (r[0] < -30 || r[0] > len + 40) continue;
        if (Math.abs(r[1]) < bo) { bo = Math.abs(r[1]); bi = i; }
      }
      if (bi < 0 || bo > 68) continue;
      const p = s.pts[bi], q = s.pts[Math.min(s.pts.length - 1, bi + 1)] || p;
      const ang = Math.atan2(q[0] - p[0], q[1] - p[1]);
      seen.add(s.sign);
      signsOut.push({ x: r2(p[0] + Math.cos(ang) * (s.w / 2 + 2.6)),
        z: r2(p[1] - Math.sin(ang) * (s.w / 2 + 2.6)),
        rot: r3(ang), a: s.sign, b: '', off: bo });
    }
  }
  /* NAMED PLACES: what the HUD calls this ground when the ball crosses it.
     PUBLIC names only, ever (the privacy law) — schools, churches, civic
     buildings, parks.  [x, z, radius, nameIdx] */
  const places = [];
  const addPlace = (x, z, r, label) => {
    if (!label || places.some(p => p[3] === nameId(label))) return;
    places.push([r2(x), r2(z), r, nameId(label)]);
  };
  for (const lm of DATA.landmarks) {
    if (!lm.pts || !lm.pts.length || !lm.name) continue;
    if (!['school', 'place_of_worship', 'townhall', 'fire_station', 'social_facility'].includes(lm.kind)) continue;
    const p = cropPt(...yd(lm.pts[0]), CROP_REGION + 20, -50, len + 60);
    if (p) addPlace(p.x, p.z, 44, signName(lm.name));
  }
  for (const pk of DATA.parks) {
    if (!pk.name) continue;
    const p = cropPt(...yd(pk.pts[0]), CROP_REGION + 50, -90, len + 90);
    if (p) addPlace(p.x, p.z, 90, signName(pk.name));
  }

  /* FLYOVER CALLOUTS: the 2-3 things this hole is a tour of.  Named
     landmarks the route asks for, then the biggest street it plays down. */
  const calls = [];
  const addCall = (x, z, label) => {
    if (calls.length >= 3 || !label) return;
    if (calls.some(c => c[2] === nameId(label))) return;
    calls.push([r2(x), r2(z), nameId(label)]);
  };
  for (const tour of (route.tours || [])) {
    // a landmark by name…
    const lm = DATA.landmarks.find(l => l.name === tour && l.pts && l.pts.length);
    if (lm) {
      const p = cropPt(...yd(lm.pts[0]), CROP_REGION + 30, -60, len + 70);
      if (p) { addCall(p.x, p.z, signName(tour)); continue; }
    }
    const pk = DATA.parks.find(l => l.name === tour);
    if (pk) {
      const p = cropPt(...yd(pk.pts[0]), CROP_REGION + 50, -90, len + 90);
      if (p) { addCall(p.x, p.z, signName(tour)); continue; }
    }
    // …a street the hole plays down…
    const st = streets.filter(s => s.name === tour).sort((a, b) => b.pts.length - a.pts.length)[0];
    if (st) {
      const mid = st.pts[(st.pts.length / 2) | 0];
      addCall(mid[0], mid[1], st.sign);
      continue;
    }
    // …or the water it is named for
    const wt = water.find(w => w.name === signName(tour));
    if (wt) {
      const c = wt.t === 'strip' ? F.clWorld((wt.d0 + wt.d1) / 2, wt.off)
              : wt.t === 'pond' ? F.clWorld(wt.d, wt.off) : F.clWorld(wt.d, 14);
      addCall(c[0], c[1], wt.name);
    }
  }
  // top up from the longest named street in the corridor, then the water
  const byLen = streets.filter(s => s.sign).sort((a, b) => b.pts.length - a.pts.length);
  for (const s of byLen) {
    if (calls.length >= 2) break;
    const mid = s.pts[(s.pts.length / 2) | 0];
    addCall(mid[0], mid[1], s.sign);
  }
  for (const w of water) {
    if (calls.length >= 2) break;
    const c = w.t === 'strip' ? F.clWorld((w.d0 + w.d1) / 2, w.off)
            : w.t === 'pond' ? F.clWorld(w.d, w.off) : F.clWorld(w.d, 14);
    addCall(c[0], c[1], w.name);
  }
  for (const s of signsOut) { nameId(s.a); if (s.b) nameId(s.b); }

  /* ═══════════ budget caps: trim farthest-from-centerline first ═══════════ */
  const trimmed = { houses: 0, trees: 0, water: 0, fences: 0, props: 0 };
  houses.sort((a, b) => a.off - b.off);
  if (houses.length > CAP_HOUSES) { trimmed.houses = houses.length - CAP_HOUSES; houses.length = CAP_HOUSES; }
  const liveLot = new Set(houses.map(h => h.x + ',' + h.z));
  trees.sort((a, b) => a[4] - b[4]);
  const capTrees = Math.min(CAP_TREES, Math.round(40 + len * 0.3));
  if (trees.length > capTrees) { trimmed.trees = trees.length - capTrees; trees.length = capTrees; }
  lotPools.sort((a, b) => a._o - b._o);
  const roomForPools = Math.max(0, CAP_WATER - water.length);
  if (lotPools.length > roomForPools) { trimmed.water = lotPools.length - roomForPools; lotPools.length = roomForPools; }
  for (const p of lotPools) { delete p._o; delete p._x; delete p._z; water.push(p); }
  for (const t of trees) t.length = 4;
  // fences and props: keep the ones nearest the line of play
  const fOff = f => Math.abs(F.doff((f[0] + f[2]) / 2, (f[1] + f[3]) / 2)[1]);
  fences.sort((a, b) => fOff(a) - fOff(b));
  if (fences.length > CAP_FENCES) { trimmed.fences = fences.length - CAP_FENCES; fences.length = CAP_FENCES; }
  props.sort((a, b) => Math.abs(F.doff(a[1], a[2])[1]) - Math.abs(F.doff(b[1], b[2])[1]));
  if (props.length > CAP_PROPS) { trimmed.props = props.length - CAP_PROPS; props.length = CAP_PROPS; }
  lots.sort((a, b) => a.off - b.off);
  void liveLot;
  /* ═══ THE WATER LAW, ENFORCED LAST ═══
     The back-yard pools only became water AFTER the lots were laid out, so
     the law is re-checked here against the finished water list and any lot
     that now touches water — or stands under it — is simply not a lawn.
     (The harness asserts exactly this on the BUILT ground, ×9.) */
  let drowned = 0;
  for (let i = lots.length - 1; i >= 0; i--) {
    const l = lots[i];
    if (l.keep) continue;              // the tee mat's lawn and the pail's
    if (lotDry(l.x, l.z, l.rot, l.a, l.b)) continue;
    drowned++;
    lots.splice(i, 1);
  }
  trimmed.drowned = drowned;
  const houseOut = houses.map(h => [h.x, h.z, h.rot, h.a, h.b, h.wh, h.rh, h.hip, h.wc, h.rc]);
  const lotsOut = lots.map(l => [l.x, l.z, l.rot, l.a, l.b, l.dry]);

  /* ═══════════ THE REACHABILITY LAW ═══════════
     Classify the ground exactly the way the game's index does, then walk the
     chain of landable grassy areas from the tee lawn to the bucket lawn. */
  function isGrass(x, z) {
    // water and sand are never grass
    if (waterClear(x, z) < 0.5) return false;
    for (const b of bunkers) {
      const c = F.clWorld(b[0], b[1]);
      if (Math.hypot((x - c[0]) / b[2], (z - c[1]) / b[3]) < 1) return false;
    }
    // pavement beats grass
    if (onStreet(x, z, 0)) return false;
    for (const d of discs) if ((x - d[0]) ** 2 + (z - d[1]) ** 2 < d[2] * d[2]) return false;
    for (const g of regions) {
      if (g.k !== 'pave' && g.k !== 'dirt') continue;
      if (inRegion(g, x, z)) return false;
    }
    // …a house is not grass, and neither is a fence line
    for (const h of houses) {
      const dx = x - h.x, dz = z - h.z;
      const c = Math.cos(h.rot), s = Math.sin(h.rot);
      const u = dx * c - dz * s, v = dx * s + dz * c;
      if (Math.abs(u) < h.a + 1 && Math.abs(v) < h.b + 1) return false;
    }
    /* a LAWN (watered lot), a park/field, or the canal verge.  Lot frames
       are BOX frames — the same ones boxOut and houseHit use. */
    for (const l of lots) {
      const dx = x - l.x, dz = z - l.z;
      const c = Math.cos(l.rot), s = Math.sin(l.rot);
      const u = dx * c - dz * s, v = dx * s + dz * c;
      if (Math.abs(u) < l.a && Math.abs(v) < l.b) return !l.dry;
    }
    for (const g of regions) {
      if (g.k !== 'turf') continue;
      if (inRegion(g, x, z)) return true;
    }
    return false;
  }
  function patchAt(x, z) {
    if (!isGrass(x, z)) return false;
    for (let a = 0; a < 8; a++) {
      const th = Math.PI * 2 * a / 8;
      if (!isGrass(x + Math.cos(th) * PATCH_R, z + Math.sin(th) * PATCH_R)) return false;
    }
    return true;
  }
  // every landable patch in the corridor, as (d, off)
  const patches = [];
  for (let d = 0; d <= len + 8; d += 7) {
    for (let o = -COR; o <= COR; o += 7) {
      const w = F.clWorld(d, o);
      if (!patchAt(w[0], w[1])) continue;
      patches.push({ d, off: o, x: w[0], z: w[1] });
    }
  }
  /* THE CHAIN, measured properly: the BOTTLENECK path from the tee lawn to
     the bucket lawn — the route whose LONGEST single hop is as short as the
     ground allows.  (A greedy walk answers a different question: it jumps as
     far as it can every time and then reports its own ambition as the gap.)
     Minimax Dijkstra over the landable patches; nodes are the tee, every
     patch, and the pail's lawn. */
  let chainGap = 0, chainOK = true;
  {
    const N = patches.length + 2;
    const TEE = patches.length, CUP = patches.length + 1;
    const px = new Float64Array(N), pz = new Float64Array(N);
    for (let i = 0; i < patches.length; i++) { px[i] = patches[i].x; pz[i] = patches[i].z; }
    px[TEE] = 0; pz[TEE] = 4; px[CUP] = gw[0]; pz[CUP] = gw[1];
    const best = new Float64Array(N).fill(Infinity);
    const done = new Uint8Array(N);
    best[TEE] = 0;
    for (let it = 0; it < N; it++) {
      let u = -1, bv = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && best[i] < bv) { bv = best[i]; u = i; }
      if (u < 0 || u === CUP) break;
      done[u] = 1;
      for (let v = 0; v < N; v++) {
        if (done[v] || v === TEE) continue;
        const dist = Math.hypot(px[v] - px[u], pz[v] - pz[u]);
        if (dist > CHAIN_MAX) continue;
        const w = Math.max(bv, dist);
        if (w < best[v]) best[v] = w;
      }
    }
    chainGap = r2(best[CUP]);
    chainOK = Number.isFinite(best[CUP]);
    if (!chainOK) chainGap = -1;
  }

  /* ═══════════ scenery-coverage witness ═══════════ */
  let covL = 0, covR = 0, covN = 0;
  for (let d = 16; d < len - 10; d += 20) {
    covN++;
    for (const side of [-1, 1]) {
      const w = F.clWorld(d, side * (CLEAR_LINE + 20));
      let hit = !!(strip && Math.sign(side) === stripSide);
      if (!hit) for (const h of houses) if ((h.x - w[0]) ** 2 + (h.z - w[1]) ** 2 < 26 * 26) { hit = true; break; }
      if (!hit) for (const t of trees) if ((t[0] - w[0]) ** 2 + (t[1] - w[1]) ** 2 < 26 * 26) { hit = true; break; }
      if (hit) { if (side > 0) covL++; else covR++; }
    }
  }

  report.push({
    n: route.n, name: route.name, par: route.par, yds, cor: COR,
    relief: r2(Math.max(...elv.map(e => e[1])) - Math.min(...elv.map(e => e[1]))),
    cant: r3(Math.max(...cant.map(c => Math.abs(c[1])))),
    houses: houses.length, lots: lots.length, trees: trees.length, water: water.length,
    streets: streets.length, paths: paths.length, regions: regions.length,
    bigs: bigs.length, bunkers: bunkers.length, discs: discs.length, tramps: tramps.length,
    drives: drives.length, fences: fences.length, props: props.length,
    signs: signsOut.length, calls: calls.length, patches: patches.length,
    stNames: [...new Set(streets.filter(s => s.sign).map(s => s.sign))],
    callNames: calls.map(c => nameTab[c[2]]),
    chainGap: r2(chainGap), chainOK, greenSlide: r2(Math.hypot(gOffX, gOffZ)),
    trimmed, waterNote, covL, covR, covN,
  });

  return {
    n: route.n, name: route.name, par: route.par, yds, bend: [], fw: 0, cor: COR,
    elv, cant, crown: 0, funnel: 0,
    und: { kind: 'roll', amp: 0.9, wl: 26 },
    hol: [], tclump: [],
    bunkers, water,
    green,
    pts: F.pts,
    scenery: {
      streets: streets.map(s => [s.w, s.sw, s.pts, nameId(s.sign)]),
      paths: paths.map(s => [s.w, s.sw, s.pts, nameId(s.sign)]),
      drives: drives.map(d => [3.2, 0, [[d[0], d[1]], [d[2], d[3]]], -1]),
      discs, regions: regions.map(g => [g.k === 'pave' ? 0 : g.k === 'turf' ? 1 : 2,
        g.s === 'ell' ? 0 : 1, g.x, g.z, g.a, g.b, g.rot, g.t]),
      lots: lotsOut,
      houses: houseOut, bigs: bigs.map(b => [b.x, b.z, b.rot, b.a, b.b, b.h, b.c, b.g]),
      trees, tramps, fences, props,
      signs: signsOut.map(s => [s.x, s.z, s.rot, nameId(s.a), s.b ? nameId(s.b) : -1]),
      calls, places, names: nameTab,
      mat: [r2(mat[0]), r2(mat[1]), 0],
    },
  };
});

/* ═══════════════ emit ═══════════════ */
const J = v => JSON.stringify(v);
function holeSrc(H) {
  const S = H.scenery;
  const L = [];
  L.push(`  /* ${H.n} — ${H.name} · par ${H.par} · ${H.yds} yds */`);
  L.push(`  { n: ${H.n}, name: ${J(H.name)}, par: ${H.par}, yds: ${H.yds}, bend: [], fw: 0, cor: ${H.cor},`);
  L.push(`    pts: ${J(H.pts)},`);
  L.push(`    elv: ${J(H.elv)},`);
  L.push(`    cant: ${J(H.cant)}, crown: 0, funnel: 0,`);
  L.push(`    und: ${J(H.und)}, hol: [], tclump: [],`);
  L.push(`    bunkers: ${J(H.bunkers)},`);
  L.push(`    water: ${J(H.water)},`);
  L.push(`    green: ${J(H.green)},`);
  L.push(`    scenery: {`);
  L.push(`      names: ${J(S.names)},`);
  L.push(`      streets: ${J(S.streets)},`);
  L.push(`      paths: ${J(S.paths)},`);
  L.push(`      drives: ${J(S.drives)},`);
  L.push(`      discs: ${J(S.discs)},`);
  L.push(`      regions: ${J(S.regions)},`);
  L.push(`      lots: ${J(S.lots)},`);
  L.push(`      bigs: ${J(S.bigs)},`);
  L.push(`      houses: ${J(S.houses)},`);
  L.push(`      fences: ${J(S.fences)},`);
  L.push(`      props: ${J(S.props)},`);
  L.push(`      signs: ${J(S.signs)},`);
  L.push(`      calls: ${J(S.calls)},`);
  L.push(`      places: ${J(S.places)},`);
  L.push(`      mat: ${J(S.mat)},`);
  L.push(`      trees: ${J(S.trees)},`);
  L.push(`      tramps: ${J(S.tramps)} } },`);
  return L.join('\n');
}

const out = `<script>
/* ═══════════════════════════════════════════════════════════════════════════
   THE POCO OPEN — nine holes of neighborhood bucket golf.  FC-10.

   GENERATED FILE.  Do not hand-edit: re-run

       node test/tools/poco-convert.mjs

   which rebuilds it deterministically from test/tools/poco/*.json plus the
   routing table inside the converter.  OSM geometry © OpenStreetMap
   contributors (ODbL); elevation USGS 3DEP.

   PRIVACY LAW: no resident names, no addresses, no identifiable homes.
   Every residential house below is a PROCEDURAL box on a generated lot;
   only public landmarks keep their real names.

   Records follow the Magnolia conventions in p2-data (pts/segD/tan supplied
   directly, bend: []), with FC-10's POCO-only fields:
     fw: 0        there is NO fairway on this course — the map is the playfield
     cor          corridor halfwidth: what the builder crops and plants to
     water        gains {t:'strip', d0, d1, off, w} — water running PARALLEL
                  to play — and every record carries a display \`name\`
     green.off    how far the pail's lawn was slid off the centerline's end
                  to stand on dry, buildable ground
     scenery      the neighborhood layer, in HOLE-LOCAL (x, z) YARDS:
       names          the hole's string table (streets, landmarks, water)
       streets/paths/drives  [width, sidewalkWidth, [[x,z], ...], nameIdx]
       discs          [[x, z, r], ...]                     cul-de-sac asphalt
       regions        [[kind, shape, x, z, a, b, rot, tag], ...]
                      kind 0 pave · 1 turf · 2 dirt;  shape 0 ellipse · 1 rect
       lots           [[x, z, rot, a, b, dry], ...]   THE LAWNS (dry = scruffy)
       bigs           [[x, z, rot, a, b, h, wallCol, gableFlag], ...]
       houses         [[x, z, rot, a, b, wallH, roofH, hip, wallCol, roofCol], ...]
       fences         [[x0, z0, x1, z1], ...]         back-yard fence runs
       props          [[kind, x, z, rot, scale], ...]
                      0 mailbox · 1 hoop · 2 car · 3 flagpole · 4 backstop
                      · 5 civic portico · 6 steeple
       signs          [[x, z, rot, nameA, nameB], ...] street blades
       calls          [[x, z, nameIdx], ...]           flyover callouts
       places         [[x, z, r, nameIdx], ...]        what the HUD calls it
       mat            [x, z, rot]                      the tee doormat
       trees          [[x, z, kind, scale], ...]       kind 0 oak · 1 conifer
       tramps         [[x, z, r], ...]
   ═══════════════════════════════════════════════════════════════════════════ */
const POCO_HOLES = [
${holes.map(holeSrc).join('\n')}
];
/* centerline precompute — pts are supplied, so this only resolves the
   cumulative distances and unit tangents the (d, off) math reads */
for (const H of POCO_HOLES) {
  H.segD = [0]; H.tan = [];
  for (let i = 1; i < H.pts.length; i++) {
    const dx = H.pts[i][0] - H.pts[i - 1][0], dz = H.pts[i][1] - H.pts[i - 1][1];
    const L = Math.hypot(dx, dz);
    H.segD.push(H.segD[i - 1] + L);
    H.tan.push([dx / L, dz / L]);
  }
  H.len = H.segD[H.segD.length - 1];
}
</${'script'}>
`;
fs.writeFileSync(OUT, out);

/* ═══════════════ the per-hole budget report ═══════════════ */
console.log('\nTHE POCO OPEN — FC-10 converter report');
console.log('  ##  name                  par  yds  cor  relief  cant | lots house trees water fence props sign call strt patch | chain gap  ok  green slide | cover L/R');
let bad = 0;
for (const r of report) {
  if (r.houses > CAP_HOUSES || r.trees > CAP_TREES || r.water > CAP_WATER) bad++;
  if (!r.chainOK || r.chainGap > CHAIN_MAX) bad++;
  console.log(
    `  ${String(r.n).padStart(2)}  ${r.name.padEnd(20)}  ${r.par}   ${String(r.yds).padStart(3)}  ` +
    `${String(r.cor).padStart(3)}  ${String(r.relief).padStart(6)} ${String(r.cant).padStart(6)} | ` +
    `${String(r.lots).padStart(4)} ${String(r.houses).padStart(5)} ${String(r.trees).padStart(5)} ` +
    `${String(r.water).padStart(5)} ${String(r.fences).padStart(5)} ${String(r.props).padStart(5)} ` +
    `${String(r.signs).padStart(4)} ${String(r.calls).padStart(4)} ${String(r.streets).padStart(4)} ${String(r.patches).padStart(5)} | ` +
    `${String(r.chainGap).padStart(9)}  ${r.chainOK ? ' ok' : 'BRK'}  ${String(r.greenSlide).padStart(11)} | ${r.covL}/${r.covR} of ${r.covN}`);
}
console.log('\n  what each hole can name (streets in corridor · callouts):');
for (const r of report) {
  console.log(`    ${String(r.n).padStart(2)}  ${(r.stNames.join(', ') || '(no named street in the corridor)')}` +
    `  ·  ${r.callNames.join(' / ')}`);
}
console.log('\n  water records per hole:');
for (const r of report) console.log(`    ${String(r.n).padStart(2)}  ${r.waterNote.join(', ') || '(none)'}`);
const trims = report.filter(r => Object.values(r.trimmed).some(v => v));
console.log('  trimmed by cap: ' + (trims.length
  ? trims.map(r => `#${r.n} h${r.trimmed.houses}/t${r.trimmed.trees}/w${r.trimmed.water}/f${r.trimmed.fences}/p${r.trimmed.props}/drowned${r.trimmed.drowned}`).join(' ') : 'none'));
console.log(`\n  wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
console.log(bad ? `  ${bad} BUDGET/CHAIN WARNING(S)` : '  all holes within budget, every chain closed');
if (bad) process.exitCode = 1;
