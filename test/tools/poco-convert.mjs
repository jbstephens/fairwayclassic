#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   THE POCO OPEN — offline course converter.

     node test/tools/poco-convert.mjs [--out test/src/p2b-poco.html]

   Reads the two mined source files in test/tools/poco/ plus the routing
   waypoint table below (which lives HERE, per POCO.md), and emits ONE
   generated source part — test/src/p2b-poco.html — defining POCO_HOLES in
   Fairway Classic's own hole-record conventions.

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
   it is also cheaper at runtime (the pavement test needs no clDoff).
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

/* ═══════════════ THE ROUTING TABLE (POCO.md, verbatim) ═══════════════
   name / par / waypoints tee -> cup.  fw is the fairway halfwidth; POCO.md
   fixes the par-3s (7, 8) at 8 and the rest in the 14-18 band.

   designWater: POCO.md's narrative asks for water on 3 (Murderers Creek
   "crossed twice") and 7 ("forced carry over the canal").  The MINED
   geometry does not put either inside those corridors — Murderers Creek's
   nearest approach to hole 3's centerline is 46 yd BEYOND the green and
   165 yd right of it, and the Contra Costa Canal crosses hole 7's line 73
   yd BEHIND the tee.  Those two holes are named for their water and the
   par-3 IS the carry, so the crossings are authored here, flagged, and
   reported by the budget run.  Every other water record on the course is
   mined geometry. */
const ROUTES = [
  { n: 1, name: 'Soule Street Canyon', par: 4, fw: 15,
    wp: [[37.9427, -122.0723], [37.9432, -122.0710], [37.9438, -122.0694]] },
  { n: 2, name: 'First Bell', par: 4, fw: 16,
    wp: [[37.9440, -122.0695], [37.9444, -122.0680], [37.9447, -122.0662]] },
  { n: 3, name: 'Murderers Creek', par: 4, fw: 15,
    wp: [[37.9436, -122.0668], [37.9423, -122.0680], [37.9420, -122.0699]],
    designWater: [{ t: 'creek', d: 0.30, w: 10 }, { t: 'creek', d: 0.78, w: 10 }] },
  { n: 4, name: 'Beatrice Road', par: 5, fw: 17,
    wp: [[37.9415, -122.0705], [37.9398, -122.0704], [37.9385, -122.0698], [37.9378, -122.0693]] },
  { n: 5, name: 'The Cloverleaf', par: 4, fw: 16,
    wp: [[37.9378, -122.0693], [37.9372, -122.0658]] },
  { n: 6, name: 'The Canal', par: 5, fw: 17,
    wp: [[37.9391, -122.0795], [37.9408, -122.0801], [37.9426, -122.0794]] },
  { n: 7, name: 'Christ the King', par: 3, fw: 8,
    wp: [[37.9463, -122.0801], [37.9468, -122.0786]],
    designWater: [{ t: 'creek', d: 0.29, w: 16 }] },
  { n: 8, name: 'City Hall Pond', par: 3, fw: 8,
    wp: [[37.9470, -122.0637], [37.9476, -122.0630]] },
  { n: 9, name: 'Park Long Drive', par: 4, fw: 16,
    wp: [[37.9490, -122.0685], [37.94885, -122.0655]] },
];

/* budget caps (POCO.md) */
const CAP_HOUSES = 90, CAP_TREES = 260, CAP_WATER = 26;
/* corridor crops */
const CROP_SOLID = 62;   // houses / trees: real geometry, must be on the mesh
const CROP_REGION = 76;  // flat regions: colour-only, the mesh clip trims them
const ELEV_EXAG = 1.6;   // POCO.md: exaggerate the gentle suburb grade

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
     corridor without having a node inside it (measured: 0 streets on 5 of
     the 9 holes). */
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

/* ═══════════════ palettes ═══════════════ */
const WALLS = [0xefe8da, 0xd9c7a6, 0xb9c3a8, 0xa8b6bd, 0xe4d9c0, 0xcfcac0, 0xd8cbb4, 0xc3ccc0];
const ROOFS = [0x6b4a33, 0x4a4a4c, 0x8c5a3c, 0x53412f, 0x5d6366, 0x6e5240];
const BIGCOL = { school: 0xeee9dc, church: 0xf2ece0, civic: 0xe4e2da, retail: 0xdcd6c8,
  commercial: 0xdad4c6, apartments: 0xe0d6c2, sports_centre: 0xdfe0da, roof: 0xd4cec0, yes: 0xe6e0d2 };
const BIGSIZE = { school: [26, 14], church: [22, 14], civic: [24, 15], retail: [20, 14],
  commercial: [20, 14], apartments: [24, 16], sports_centre: [28, 18], roof: [13, 10], yes: [12, 9] };
const STREET_W = { residential: 7, tertiary: 9, secondary: 11, unclassified: 7, living_street: 6 };

/* ═══════════════ the conversion ═══════════════ */
const report = [];
const holes = ROUTES.map((route, hi) => {
  const F = makeFrame(route);
  const rng = mulberry32(90210 + route.n * 7919);
  const len = F.len;
  const yds = Math.round(len);

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
  // tee is the datum
  const e0 = elv[0][1];
  for (const e of elv) e[1] = r2(e[1] - e0);

  /* ── the green ── */
  const gr = route.par === 3 ? 10 + rng() * 2 : 11 + rng() * 2;
  const green = {
    r: r2(gr), sx: r3((rng() - 0.5) * 0.026), sz: r3((rng() - 0.5) * 0.026),
    ang: Math.round((rng() - 0.5) * 24), mound: route.n === 7 ? 2.0 : r2(0.9 + rng() * 0.5),
    pin: [0, 0],
    lobes: [[r2((rng() - 0.5) * 7), r2((rng() - 0.5) * 6), r2(5.5 + rng() * 1.5), r2(0.26 + rng() * 0.18)],
            [r2((rng() - 0.5) * 7), r2((rng() - 0.5) * 6), r2(5 + rng() * 1.5), r2(-0.2 - rng() * 0.16)]],
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

  /* ── streets + paths ── */
  const streets = [], paths = [], barriers = [];
  for (const s of DATA.streets) {
    const lp = s.pts.map(p => F.loc(...yd(p)));
    for (const run of polyClip(lp, F, -40, len + 54, CROP_REGION)) {
      const w = STREET_W[s.class] || 7;
      const sw = (s.class === 'residential' || s.class === 'living_street') ? 1.6 : 0;
      streets.push({ w, sw, pts: run.map(p => [r2(p[0]), r2(p[1])]), cls: s.class, name: s.name || '' });
    }
  }
  for (const s of DATA.paths) {
    const lp = s.pts.map(p => F.loc(...yd(p)));
    for (const run of polyClip(lp, F, -40, len + 54, CROP_REGION)) {
      if (run.length < 2) continue;
      paths.push({ w: 3.2, sw: 0, pts: run.map(p => [r2(p[0]), r2(p[1])]), cls: 'path', name: s.name || '' });
    }
  }

  /* ── cul-de-sac discs ── */
  const discs = [];
  for (const c of DATA.culdesacs) {
    const p = cropPt(...yd(c.at), CROP_REGION);
    if (p) discs.push([r2(p.x), r2(p.z), 9]);
  }

  /* ── flat regions: park lawn (turf), blacktop/courts (pave), dirt ── */
  const regions = [], schoolCanopies = [];
  const addRegion = (k, shape, x, z, a, b, rot, tag) =>
    regions.push({ k, s: shape, x: r2(x), z: r2(z), a: r2(a), b: r2(b), rot: r3(rot), t: tag });
  for (const pk of DATA.parks) {
    const p = cropPt(...yd(pk.pts[0]), CROP_REGION + 40, -90, len + 90);
    if (!p) continue;
    const r = pk.name ? 92 : 34;
    addRegion('turf', 'ell', p.x, p.z, r, r, 0, 'park');
  }
  // schools: blacktop apron at the landmark (the school BUILDING follows in
  // the big-footprint pass, which seeds itself off these)
  const schoolPts = [];
  for (const lm of DATA.landmarks) {
    if (!lm.pts || !lm.pts.length) continue;
    if (lm.kind !== 'school' && lm.kind !== 'place_of_worship') continue;
    const p = cropPt(...yd(lm.pts[0]), CROP_REGION);
    if (!p) continue;
    schoolPts.push({ p, kind: lm.kind });
    if (lm.kind === 'school') {
      const rot = rng() * 0.4 - 0.2;
      addRegion('pave', 'rect', p.x, p.z, 24, 18, rot, 'blacktop');
      // two painted courts on the apron, and the solar canopies beside them
      const c = Math.cos(rot), sn = Math.sin(rot);
      for (const [lu, lv] of [[-14, -6], [14, 6]]) {
        const cx = p.x + lu * c - lv * sn, cz = p.z + lu * sn + lv * c;
        addRegion('pave', 'rect', cx, cz, 8, 14, rot, 'court');
      }
      schoolCanopies.push({ x: p.x, z: p.z, rot });
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

  /* ── water: mined ponds/pools, mined canal (strip), mined creek crossings ── */
  const water = [], waterNote = [];
  // (a) mined ponds
  for (const w of DATA.water) {
    if (w.kind !== 'pond') continue;
    const p = cropPt(...yd(w.pts[0]), 58);
    if (!p) continue;
    water.push({ t: 'pond', d: r2(p.d), off: r2(p.off), rx: 17, rz: 14 });
    waterNote.push('pond(mined)');
  }
  // (b) mined pools — a real hazard wherever one sits in the corridor
  const minedPools = [];
  for (const pl of DATA.pools) {
    const p = cropPt(...yd(pl), 52);
    if (!p) continue;
    minedPools.push(p);
    water.push({ t: 'pond', d: r2(p.d), off: r2(p.off), rx: 11, rz: 7 });
    waterNote.push('pool(mined)');
  }
  // (c) canal / creek running ALONGSIDE play -> the new 'strip' record
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
    // the towpath proves how far the canal really runs beside the hole
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
    water.push({ t: 'strip', d0: r2(Math.max(-14, d0)), d1: r2(Math.min(len + 34, d1)), off: r2(off), w: 18 });
    waterNote.push('strip(mined canal)');
  }
  // (d) mined creek crossings of the centerline
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
      water.push({ t: 'creek', d: r2(d), w: 11 });
      waterNote.push('creek(mined ' + w.name + ')');
    }
  }
  // (e) POCO.md's authored crossings where the mined geometry has none
  for (const dw of (route.designWater || [])) {
    const d = dw.d * len;
    if (water.some(q => q.t === 'creek' && Math.abs(q.d - d) < 45)) continue;
    water.push({ t: 'creek', d: r2(d), w: dw.w });
    waterNote.push('creek(AUTHORED)');
  }

  /* A WATER STRIP MUST BE SEEN.  The canal down the left of 6 is the hole's
     whole defence, and the first cut buried it: a rank of houses and a
     riparian row stood between the fairway and the water, so from the short
     grass you saw a tree line and a roof and no canal at all.  So NOTHING is
     built on the bank between the play corridor and the far edge of a strip
     — the far bank keeps its trees and its houses. */
  const strip = water.find(w => w.t === 'strip');
  const stripSide = strip ? Math.sign(strip.off) : 0;
  const stripFar = strip ? Math.abs(strip.off) + strip.w / 2 + 3 : 0;
  function stripClear(x, z) {
    if (!strip) return true;
    const r = F.doff(x, z);
    if (r[0] < strip.d0 - 20 || r[0] > strip.d1 + 20) return true;
    return !(Math.sign(r[1]) === stripSide && Math.abs(r[1]) < stripFar);
  }

  /* ── bunkers: mapped baseball infields inside the corridor ── */
  const bunkers = [];
  for (const pt of DATA.pitches) {
    if (pt.sport !== 'baseball') continue;
    const p = cropPt(...yd(pt.pts[0]), 56, 24, len - 12);
    if (!p) continue;
    bunkers.push([r2(p.d), r2(p.off), 13, 13]);
  }

  /* ═══════════ big buildings (real, named / civic footprints) ═══════════ */
  const bigs = [], bigFoot = [];
  /* A PUBLIC BUILDING NEVER STRADDLES THE LINE OF PLAY.  The first cut put a
     32-yd solar canopy across the 2nd fairway and the address camera woke up
     inside it.  (Houses already obey this through offCorridor.) */
  function bigOK(x, z) {
    const r = F.doff(x, z);
    return Math.abs(r[1]) >= route.fw + 5 && Math.abs(r[1]) <= CROP_SOLID &&
           r[0] > -30 && r[0] < len + 44;
  }
  for (const b of DATA.buildings) {
    if (b.kind === 'yes' || b.kind === 'no') continue;
    const p = cropPt(...yd(b.pts[0]), CROP_SOLID);
    if (!p || !bigOK(p.x, p.z)) continue;
    const sz = BIGSIZE[b.kind] || [20, 14];
    // face the nearest street if there is one, else square to the hole
    const rot = nearestStreetAngle(p.x, p.z) ?? 0;
    const h = b.kind === 'roof' ? 3.4 : 5 + rng() * 2;
    const gable = /Christ/i.test(b.name || '');
    bigs.push({ x: r2(p.x), z: r2(p.z), rot: r3(rot), a: sz[0] / 2, b: sz[1] / 2,
      h: r2(h), c: BIGCOL[b.kind] || 0xe0dace, g: gable ? 1 : 0, k: b.kind });
    bigFoot.push({ x: p.x, z: p.z, r: Math.max(sz[0], sz[1]) * 0.62 });
  }
  /* solar canopies over the school yard — POCO.md wants them as OBSTACLES,
     so they are emitted as big-building boxes: the ball bounces off them. */
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
  /* a mapped school / church with no mined footprint still gets its building:
     Sequoia Elementary (hole 2) is a NAME in the data, not a polygon, and the
     hole is called First Bell.  The slab sits off the blacktop apron. */
  for (const s of schoolPts) {
    if (bigFoot.some(b => (b.x - s.p.x) ** 2 + (b.z - s.p.z) ** 2 < 55 * 55)) continue;
    const rot = nearestStreetAngle(s.p.x, s.p.z) ?? 0;
    const sz = s.kind === 'school' ? BIGSIZE.school : BIGSIZE.church;
    // push it clear of the blacktop it serves, along the street's normal
    let bx = s.p.x + Math.cos(rot) * 30, bz = s.p.z - Math.sin(rot) * 30;
    if (!bigOK(bx, bz)) { bx = s.p.x - Math.cos(rot) * 30; bz = s.p.z + Math.sin(rot) * 30; }
    if (!bigOK(bx, bz)) continue;
    bigs.push({ x: r2(bx), z: r2(bz), rot: r3(rot), a: sz[0] / 2, b: sz[1] / 2,
      h: r2(5.4 + rng()), c: s.kind === 'school' ? BIGCOL.school : BIGCOL.church,
      g: s.kind === 'place_of_worship' ? 1 : 0, k: s.kind });
    bigFoot.push({ x: bx, z: bz, r: Math.max(sz[0], sz[1]) * 0.62 });
  }

  /* the nearest street, and the point on it a driveway would meet.
     A HOUSE FACES ITS STREET: the front normal points at the kerb, not
     along the kerb (the first cut of this had every lot showing its gable
     end to the road, which is what made the first screenshots read as a
     row of sheds). */
  function nearestStreet(x, z) {
    let best = 1e18, px = 0, pz = 0, w = 7;
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
        if (dd < best) { best = dd; px = qx; pz = qz; w = s.w / 2 + s.sw; }
      }
    }
    if (best === 1e18) return null;
    return { d: Math.sqrt(best), px, pz, w };
  }
  function nearestStreetAngle(x, z) {
    const n = nearestStreet(x, z);
    if (!n || n.d > 90) return null;
    return Math.atan2(n.px - x, n.pz - z);      // FACING the kerb
  }

  /* ═══════════ the residential layer ═══════════ */
  const houses = [], tramps = [], lotPools = [];
  const blocked = [];   // circles that claim ground: buildings, regions, water, discs
  for (const b of bigFoot) blocked.push([b.x, b.z, b.r]);
  for (const g of regions) {
    if (g.t === 'park') continue;    // a park does not stop houses on its far rim
    blocked.push([g.x, g.z, Math.max(g.a, g.b) + 4]);
  }
  for (const dq of discs) blocked.push([dq[0], dq[1], dq[2] + 3]);
  for (const p of minedPools) blocked.push([p.x, p.z, 12]);
  for (const w of water) {
    if (w.t === 'pond') { const c = F.clWorld(w.d, w.off); blocked.push([c[0], c[1], Math.max(w.rx, w.rz) + 5]); }
  }
  const parkRegions = regions.filter(g => g.t === 'park' || g.t === 'pitch');

  function inRegion(g, x, z) {
    const dx = x - g.x, dz = z - g.z;
    const c = Math.cos(g.rot), s = Math.sin(g.rot);
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    return g.s === 'ell' ? (u * u) / (g.a * g.a) + (v * v) / (g.b * g.b) < 1
                         : Math.abs(u) < g.a && Math.abs(v) < g.b;
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
  function lotFree(x, z, r) {
    for (const b of blocked) {
      const dx = x - b[0], dz = z - b[1], rr = b[2] + r;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    for (const g of parkRegions) if (inRegion(g, x, z)) return false;
    if (!stripClear(x, z)) return false;
    return !onStreet(x, z, r * 0.55);
  }
  /* THE FAIRWAY CORRIDOR claims its own ground (POCO.md): |off| < fw + 3 */
  function offCorridor(x, z) {
    const r = F.doff(x, z);
    return Math.abs(r[1]) > route.fw + 3;
  }
  const drives = [];
  function dropHouse(x, z, rot, seedOrder) {
    const hw = (8 + rng() * 4) / 2, hl = (7 + rng() * 2) / 2;
    const wallH = 3 + rng();
    const roofH = 1.1 + rng() * 0.7;
    const hip = rng() < 0.42 ? 1 : 0;
    const wc = WALLS[(rng() * WALLS.length) | 0], rc = ROOFS[(rng() * ROOFS.length) | 0];
    const r = F.doff(x, z);
    houses.push({ x: r2(x), z: r2(z), rot: r3(rot), a: r2(hw), b: r2(hl),
      wh: r2(wallH), rh: r2(roofH), hip, wc, rc, off: Math.abs(r[1]), d: r[0] });
    blocked.push([x, z, Math.max(hw, hl) + 2.6]);
    // the driveway: front kerb to the road.  Reads as suburbia at a glance
    // and plays as pavement, which is the whole joke of the course.
    const ns = nearestStreet(x, z);
    if (ns && ns.d < 40) {
      const fx = x + Math.sin(rot) * (hl + 0.6), fz = z + Math.cos(rot) * (hl + 0.6);
      const kL = Math.hypot(ns.px - fx, ns.pz - fz) || 1;
      const kx = fx + (ns.px - fx) / kL * Math.max(0, kL - ns.w * 0.6);
      const kz = fz + (ns.pz - fz) / kL * Math.max(0, kL - ns.w * 0.6);
      if (kL > 2.5) drives.push([r2(fx), r2(fz), r2(kx), r2(kz)]);
    }
    // the back yard: ~15% get a pool, ~8% a trampoline
    const bx = x - Math.sin(rot + Math.PI / 2) * (hl + 7), bz = z - Math.cos(rot + Math.PI / 2) * (hl + 7);
    const roll = rng();
    if (roll < 0.15 && lotFree(bx, bz, 5) && offCorridor(bx, bz)) {
      const p = F.doff(bx, bz);
      lotPools.push({ t: 'pond', d: r2(p[0]), off: r2(p[1]), rx: 4.2, rz: 3.0, _o: Math.abs(p[1]) });
      blocked.push([bx, bz, 7]);
    } else if (roll < 0.23 && lotFree(bx, bz, 4) && offCorridor(bx, bz)) {
      tramps.push([r2(bx), r2(bz), 2.6]);
      blocked.push([bx, bz, 5]);
    }
    void seedOrder;
  }

  // (1) REAL residential footprints first — the mined 'yes' buildings
  for (const b of DATA.buildings) {
    if (b.kind !== 'yes') continue;
    const p = cropPt(...yd(b.pts[0]), CROP_SOLID);
    if (!p) continue;
    if (!offCorridor(p.x, p.z) || !lotFree(p.x, p.z, 6)) continue;
    dropHouse(p.x, p.z, nearestStreetAngle(p.x, p.z) ?? 0, 0);
  }
  // (2) lots along every real street frontage, both sides (POCO.md generator)
  for (const s of streets) {
    if (s.cls === 'secondary') continue;   // no driveways onto the arterial
    const front = s.w / 2 + s.sw + (11 + rng() * 3);
    // resample the polyline every 13-17 yd
    let carry = 8 + rng() * 6;
    for (let i = 1; i < s.pts.length; i++) {
      const ax = s.pts[i - 1][0], az = s.pts[i - 1][1];
      const bx = s.pts[i][0], bz = s.pts[i][1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.1) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      const nx = uz, nz = -ux;
      for (let t = carry; t < L; t += 13 + rng() * 4) {
        const px = ax + ux * t, pz = az + uz * t;
        for (const side of [-1, 1]) {
          const jx = (rng() - 0.5) * 2.2;
          const hx = px + nx * side * front + ux * jx, hz = pz + nz * side * front + uz * jx;
          const rr = F.doff(hx, hz);
          if (Math.abs(rr[1]) > CROP_SOLID || rr[0] < -30 || rr[0] > len + 44) continue;
          if (!offCorridor(hx, hz) || !lotFree(hx, hz, 7)) continue;
          // the front normal points AT the kerb: -n * side
          dropHouse(hx, hz, Math.atan2(-nx * side, -nz * side), 1);
        }
        carry = t + 13 + rng() * 4 - L;
      }
      carry = Math.max(0, carry);
    }
  }
  // (3) GAP FILL: a suburb has no empty lots.  Walk the corridor flanks and
  //     plant a house anywhere a 20-yd neighbourhood is still bare.
  for (let d = 4; d < len + 32; d += 9) {
    for (const side of [-1, 1]) {
      for (let o = route.fw + 12; o < CROP_SOLID - 6; o += 13) {
        const w = F.clWorld(d + (rng() - 0.5) * 6, side * (o + (rng() - 0.5) * 5));
        if (!lotFree(w[0], w[1], 9)) continue;
        if (!offCorridor(w[0], w[1])) continue;
        let near = 1e18;
        for (const h of houses) { const dd = (h.x - w[0]) ** 2 + (h.z - w[1]) ** 2; if (dd < near) near = dd; }
        if (near < 16 * 16) continue;
        dropHouse(w[0], w[1], nearestStreetAngle(w[0], w[1]) ??
          Math.atan2(w[0] - F.clWorld(d, 0)[0], w[1] - F.clWorld(d, 0)[1]) + Math.PI, 2);
      }
    }
  }

  /* ═══════════ trees ═══════════ */
  const trees = [];
  const treeFree = (x, z, r) => {
    for (const b of blocked) { const dx = x - b[0], dz = z - b[1], rr = b[2] * 0.5 + r; if (dx * dx + dz * dz < rr * rr) return false; }
    for (const h of houses) { const dx = x - h.x, dz = z - h.z, rr = Math.max(h.a, h.b) + 1.6 + r; if (dx * dx + dz * dz < rr * rr) return false; }
    for (const t of trees) { const dx = x - t[0], dz = z - t[1]; if (dx * dx + dz * dz < 24) return false; }
    return !onStreet(x, z, r + 1.2);
  };
  const addTree = (x, z, kind, s) => {
    const rr = F.doff(x, z);
    if (Math.abs(rr[1]) > CROP_SOLID || rr[0] < -30 || rr[0] > len + 44) return false;
    if (Math.abs(rr[1]) < route.fw + 2) return false;
    if (!stripClear(x, z)) return false;
    if (!treeFree(x, z, 2.2)) return false;
    trees.push([r2(x), r2(z), kind, r2(s), Math.abs(rr[1])]);
    return true;
  };
  // riparian corridors: dense rows along every mined water polyline
  for (const w of DATA.water) {
    const lp = w.pts.map(p => F.loc(...yd(p)));
    for (let i = 1; i < lp.length; i++) {
      const L = Math.hypot(lp[i][0] - lp[i - 1][0], lp[i][1] - lp[i - 1][1]);
      if (L < 0.5) continue;
      const ux = (lp[i][0] - lp[i - 1][0]) / L, uz = (lp[i][1] - lp[i - 1][1]) / L;
      for (let t = 0; t < L; t += 8) {
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
      for (let t = 5; t < L; t += 18 + rng() * 6) {
        if (rng() < 0.22) continue;                  // the seeded gaps
        for (const side of [-1, 1]) {
          const off = side * (s.w / 2 + s.sw + 3.2 + rng() * 1.6);
          addTree(ax + ux * t + uz * off, az + uz * t - ux * off, rng() < 0.16 ? 1 : 0, 0.85 + rng() * 0.45);
        }
      }
    }
  }
  // park clumps
  for (const g of parkRegions) {
    for (let k = 0; k < 26; k++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng());
      addTree(g.x + Math.cos(a) * g.a * rr, g.z + Math.sin(a) * g.b * rr, rng() < 0.2 ? 1 : 0, 1.0 + rng() * 0.6);
    }
  }
  /* THE CANOPY LAW — every corridor carries oaks down both flanks, from the
     first cut out to the crop.  Suburbia's trees stand in front yards and
     between houses, so this runs AFTER the lots and simply takes the gaps. */
  for (let d = 2; d < len + 38; d += 5.5) {
    for (const side of [-1, 1]) {
      for (const band of [4, 13, 24, 36, 48]) {
        if (rng() < 0.18) continue;                       // seeded gaps
        const o = side * (route.fw + band + rng() * 6);
        const w = F.clWorld(d + (rng() - 0.5) * 4.5, o);
        addTree(w[0], w[1], rng() < 0.13 ? 1 : 0, 0.8 + rng() * 0.55);
      }
    }
  }

  /* ═══════════ budget caps: trim farthest-from-centerline first ═══════════ */
  const trimmed = { houses: 0, trees: 0, water: 0 };
  houses.sort((a, b) => a.off - b.off);
  if (houses.length > CAP_HOUSES) { trimmed.houses = houses.length - CAP_HOUSES; houses.length = CAP_HOUSES; }
  trees.sort((a, b) => a[4] - b[4]);
  // POCO.md's cap is 260; a 99-yd corridor with 260 trees in it is a forest,
  // not a neighbourhood, so the cap also scales with the ground on offer
  const capTrees = Math.min(CAP_TREES, Math.round(42 + len * 0.33));
  if (trees.length > capTrees) { trimmed.trees = trees.length - capTrees; trees.length = capTrees; }
  lotPools.sort((a, b) => a._o - b._o);
  const roomForPools = Math.max(0, CAP_WATER - water.length);
  if (lotPools.length > roomForPools) { trimmed.water = lotPools.length - roomForPools; lotPools.length = roomForPools; }
  for (const p of lotPools) { delete p._o; water.push(p); }
  for (const t of trees) t.length = 4;
  // houses keep only what the builder needs
  const houseOut = houses.map(h => [h.x, h.z, h.rot, h.a, h.b, h.wh, h.rh, h.hip, h.wc, h.rc]);

  /* ═══════════ scenery-coverage witness (both sides, where streets exist) ═══════════ */
  let covL = 0, covR = 0, covN = 0;
  for (let d = 16; d < len - 10; d += 20) {
    covN++;
    for (const side of [-1, 1]) {
      const w = F.clWorld(d, side * (route.fw + 22));
      // water counts as scenery: the canal bank on 6 is DELIBERATELY open
      let hit = !!(strip && Math.sign(side) === stripSide);
      if (!hit) for (const h of houses) if ((h.x - w[0]) ** 2 + (h.z - w[1]) ** 2 < 26 * 26) { hit = true; break; }
      if (!hit) for (const t of trees) if ((t[0] - w[0]) ** 2 + (t[1] - w[1]) ** 2 < 26 * 26) { hit = true; break; }
      if (hit) { if (side > 0) covL++; else covR++; }
    }
  }

  report.push({
    n: route.n, name: route.name, par: route.par, yds, fw: route.fw,
    relief: r2(Math.max(...elv.map(e => e[1])) - Math.min(...elv.map(e => e[1]))),
    cant: r3(Math.max(...cant.map(c => Math.abs(c[1])))),
    houses: houses.length, trees: trees.length, water: water.length,
    streets: streets.length, paths: paths.length, regions: regions.length,
    bigs: bigs.length, bunkers: bunkers.length, discs: discs.length, tramps: tramps.length,
    drives: drives.length,
    trimmed, waterNote, covL, covR, covN,
  });

  return {
    n: route.n, name: route.name, par: route.par, yds, bend: [], fw: route.fw,
    elv, cant, crown: 0.3, funnel: 0.5,
    und: { kind: 'roll', amp: 0.9, wl: 26 },
    hol: [], tclump: [],
    bunkers, water,
    green,
    pts: F.pts,
    scenery: {
      streets: streets.map(s => [s.w, s.sw, s.pts]),
      paths: paths.map(s => [s.w, s.sw, s.pts]),
      drives: drives.map(d => [3.2, 0, [[d[0], d[1]], [d[2], d[3]]]]),
      discs, regions: regions.map(g => [g.k === 'pave' ? 0 : g.k === 'turf' ? 1 : 2,
        g.s === 'ell' ? 0 : 1, g.x, g.z, g.a, g.b, g.rot, g.t]),
      houses: houseOut, bigs: bigs.map(b => [b.x, b.z, b.rot, b.a, b.b, b.h, b.c, b.g]),
      trees, tramps,
    },
  };
});

/* ═══════════════ emit ═══════════════ */
const J = v => JSON.stringify(v);
function holeSrc(H) {
  const S = H.scenery;
  const L = [];
  L.push(`  /* ${H.n} — ${H.name} · par ${H.par} · ${H.yds} yds */`);
  L.push(`  { n: ${H.n}, name: ${J(H.name)}, par: ${H.par}, yds: ${H.yds}, bend: [], fw: ${H.fw},`);
  L.push(`    pts: ${J(H.pts)},`);
  L.push(`    elv: ${J(H.elv)},`);
  L.push(`    cant: ${J(H.cant)}, crown: ${H.crown}, funnel: ${H.funnel},`);
  L.push(`    und: ${J(H.und)}, hol: [], tclump: [],`);
  L.push(`    bunkers: ${J(H.bunkers)},`);
  L.push(`    water: ${J(H.water)},`);
  L.push(`    green: ${J(H.green)},`);
  L.push(`    scenery: {`);
  L.push(`      streets: ${J(S.streets)},`);
  L.push(`      paths: ${J(S.paths)},`);
  L.push(`      drives: ${J(S.drives)},`);
  L.push(`      discs: ${J(S.discs)},`);
  L.push(`      regions: ${J(S.regions)},`);
  L.push(`      bigs: ${J(S.bigs)},`);
  L.push(`      houses: ${J(S.houses)},`);
  L.push(`      trees: ${J(S.trees)},`);
  L.push(`      tramps: ${J(S.tramps)} } },`);
  return L.join('\n');
}

const out = `<script>
/* ═══════════════════════════════════════════════════════════════════════════
   THE POCO OPEN — nine holes of neighborhood bucket golf.

   GENERATED FILE.  Do not hand-edit: re-run

       node test/tools/poco-convert.mjs

   which rebuilds it deterministically from test/tools/poco/*.json plus the
   routing table inside the converter.  OSM geometry © OpenStreetMap
   contributors (ODbL); elevation USGS 3DEP.

   PRIVACY LAW: no resident names, no addresses, no identifiable homes.
   Every residential house below is a PROCEDURAL box on a generated lot;
   only public landmarks keep their real footprints.

   Records follow the Magnolia conventions in p2-data (pts/segD/tan supplied
   directly, bend: []), plus two POCO-only fields:
     water  gains  {t:'strip', d0, d1, off, w}  — water running PARALLEL to
            play (the Contra Costa Canal down the left of 6).
     scenery  the neighborhood layer, in HOLE-LOCAL (x, z) YARDS:
       streets/paths/drives  [width, sidewalkWidth, [[x,z], ...]]
       discs          [[x, z, r], ...]                     cul-de-sac asphalt
       regions        [[kind, shape, x, z, a, b, rot, tag], ...]
                      kind 0 pave · 1 turf · 2 dirt;  shape 0 ellipse · 1 rect
       bigs           [[x, z, rot, a, b, h, wallCol, gableFlag], ...]
       houses         [[x, z, rot, a, b, wallH, roofH, hip, wallCol, roofCol], ...]
       trees          [[x, z, kind, scale], ...]           kind 0 oak · 1 conifer
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
const CARD = { 1: 309, 2: 328, 3: 381, 4: 472, 5: 343, 6: 444, 7: 156, 8: 99, 9: 288 };
console.log('\nTHE POCO OPEN — converter budget report');
console.log('  ##  name                  par  yds  card   d%   fw  relief  cant | houses trees water bunk | street path rgn big disc tramp drives | cover L/R');
let bad = 0;
for (const r of report) {
  const dp = ((r.yds - CARD[r.n]) / CARD[r.n] * 100);
  if (Math.abs(dp) > 15) bad++;
  if (r.houses > CAP_HOUSES || r.trees > CAP_TREES || r.water > CAP_WATER) bad++;
  console.log(
    `  ${String(r.n).padStart(2)}  ${r.name.padEnd(20)}  ${r.par}   ${String(r.yds).padStart(3)}  ` +
    `${String(CARD[r.n]).padStart(4)} ${dp.toFixed(1).padStart(5)}%  ${String(r.fw).padStart(2)}  ` +
    `${String(r.relief).padStart(6)} ${String(r.cant).padStart(6)} | ` +
    `${String(r.houses).padStart(6)} ${String(r.trees).padStart(5)} ${String(r.water).padStart(5)} ${String(r.bunkers).padStart(4)} | ` +
    `${String(r.streets).padStart(6)} ${String(r.paths).padStart(4)} ${String(r.regions).padStart(3)} ${String(r.bigs).padStart(3)} ` +
    `${String(r.discs).padStart(4)} ${String(r.tramps).padStart(5)} ${String(r.drives).padStart(6)} | ${r.covL}/${r.covR} of ${r.covN}`);
}
console.log('\n  water records per hole:');
for (const r of report) console.log(`    ${String(r.n).padStart(2)}  ${r.waterNote.join(', ') || '(none)'}`);
const trims = report.filter(r => r.trimmed.houses || r.trimmed.trees || r.trimmed.water);
console.log('  trimmed by cap: ' + (trims.length
  ? trims.map(r => `#${r.n} h${r.trimmed.houses}/t${r.trimmed.trees}/w${r.trimmed.water}`).join(' ') : 'none'));
console.log(`\n  wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
console.log(bad ? `  ${bad} BUDGET WARNING(S)` : '  all holes within budget');
if (bad) process.exitCode = 1;
