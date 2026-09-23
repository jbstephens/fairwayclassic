# THE POCO OPEN — Fairway Classic course 2 (design, decided 2026-09-22)

Nine holes of bucket golf through the real Poets Corner neighborhood
(Pleasant Hill, CA — the family calls it PoCo). Same engine, same swing,
same physics as Magnolia National; a new WORLD KIND. Real street grid,
real landmarks, real terrain. PRIVACY LAW: no resident names, no
addresses, no identifiable specific homes — residential houses are
procedurally varied on generated lots; only public landmarks are named.

## Source data (checked in, test/tools/poco/)

- `poco_course_data.json` — OSM-mined geometry in LOCAL METERS
  (origin lat 37.944, lon -122.070; +x east, +y north). Arrays:
  streets (named polylines w/ class), paths, water (canal/creek
  polylines + pond polygons), parks, pitches (sport tagged), 
  playgrounds, pools (center points), buildings (real footprints:
  schools/churches/civic/retail), landmarks (named pts/polys),
  culdesacs (named pts). ~72KB.
- `poco_elev.json` — 29×25 elevation grid (meters ASL) over the same
  local frame, row 0 = north edge. Bilinear-sample it.
- UNITS: game world is YARDS (1 unit = 1 yd). meters × 1.09361.

## The 9 holes (routing waypoints, lat/lon; converter turns into H.pts)

Par 36. Yardages are computed along the polyline by the converter
(expect small drift from the proposal card — that's fine, the card is
generated). Each hole: name, par, waypoints tee → cup.

1. **Soule Street Canyon** par 4 — (37.9427,-122.0723) →
   (37.9432,-122.0710) → (37.9438,-122.0694). Fairway = Soule Ave
   itself + front yards; oak canopy both sides.
2. **First Bell** par 4 — (37.9440,-122.0695) → (37.9444,-122.0680) →
   (37.9447,-122.0662). Sequoia Elementary blacktop (painted courts,
   solar canopies as obstacles) to a cup on the Sequoia Middle field.
3. **Murderers Creek** par 4 — (37.9436,-122.0668) →
   (37.9423,-122.0680) → (37.9420,-122.0699). Dogleg tracking the
   creek's riparian tree corridor; the creek is crossed twice.
4. **Beatrice Road** par 5 — (37.9415,-122.0705) → (37.9398,-122.0704)
   → (37.9385,-122.0698) → (37.9378,-122.0693). Long south run to the
   Pleasant Oaks Park entrance.
5. **The Cloverleaf** par 4 — (37.9378,-122.0693) →
   (37.9372,-122.0658). Across Pleasant Oaks' four-diamond cloverleaf;
   every dirt infield plays as a BUNKER (map pitches sport=baseball
   within corridor to bunker records). Tennis courts right = pavement.
6. **The Canal** par 5 — (37.9391,-122.0795) → (37.9408,-122.0801) →
   (37.9426,-122.0794). North along the Contra Costa Canal: water
   strip down the LEFT the whole hole; Canal Trail = cart path ribbon.
7. **Christ the King** par 3 — (37.9463,-122.0801) →
   (37.9468,-122.0786). Tee on the west bank; forced carry over the
   canal to the church lawn amphitheater green (punchbowl: mound ring).
8. **City Hall Pond** par 3 — (37.9470,-122.0637) →
   (37.9476,-122.0630). Island-green feel over the civic duck pond
   (real pond polygons in data near City Hall).
9. **Park Long Drive** par 4 — (37.9490,-122.0685) →
   (37.94885,-122.0655). Across Pleasant Hill Park's lawn over both
   diamonds; cup at the pool gate; the 50m pool is a water hazard
   short-right of the green.

## Architecture: converter → data part → world kind

**Offline converter** `test/tools/poco-convert.mjs` (node, no deps;
run manually, output COMMITTED). Reads the two JSONs + the waypoint
table above (lives in the converter). Emits `test/src/p2b-poco.html`:
one `<script>` block defining `const POCO_HOLES = [...]` and
`const POCO_SCENERY = {...}` in FC's conventions. Deterministic
(seeded mulberry32, no Date/random) so re-runs are stable diffs.

Per hole the converter emits an FC-shaped record with:
- `pts` centerline polyline (yards, tee at origin, first segment +Z —
  i.e. converter rotates/translates the real waypoints into hole-local
  frame exactly like HOLES precompute expects; supply pts/segD/tan
  directly, `bend: []`).
- `par`, `name`, `yds` (computed length), `fw` per hole (14–18; hole
  7/8 par-3s use 8).
- `elv`/`cant` sampled from the elevation grid along the centerline
  (grid is gentle; exaggerate ×1.6 like FC-7 did so the land reads).
  und: roll, amp 0.9, wl 26 everywhere (suburb lawn, not Augusta).
- `green` record at the cup: r 10–13, mild lobes; hole 7 gets
  mound 2.0 (the punchbowl); pin [0,0] (the bucket sits at center).
- `bunkers` from mapped diamond infields (5, 9) as ellipse records.
- `water` from mapped real geometry, three kinds:
  - existing `pond` ellipses (8's pond, 9's pool, mapped pools),
  - existing `creek` crossings where a water polyline crosses the
    centerline (3 twice, 7 the canal carry),
  - NEW `strip` type: `{t:'strip', d0, d1, off, w}` water running
    parallel to play (6's canal). Sim + minimap + builder must all
    honor 'strip'.
- `scenery` (the new neighborhood layer, all corridor-cropped to
  |off| ≤ 60 yd, hole-local (d, off) coords):
  - `streets`: polylines w/ width (residential 7yd, tertiary 9) —
    rendered as asphalt ribbons conforming to ground, sidewalk strips
    (1.5yd concrete) beside residential streets where room allows.
  - `lots`: procedural houses along real street frontages. Generator:
    walk each street polyline, place lots every 13–17yd (seeded jitter)
    offset 12–15yd from street center on both sides; skip where a
    park/pitch/school/real building/water/other street or THE FAIRWAY
    CORRIDOR (|off| < fw+3 of centerline) claims the ground. House =
    rect footprint 8–12 × 7–9yd, wall h 3–4yd, gable or hip roof,
    palette: walls (warm white/tan/sage/gray-blue), roofs (umber/
    charcoal/clay per aerial survey). ~15% of lots get a backyard
    pool ellipse (water hazard!), ~8% a trampoline (bounce pad:
    restitution 1.35, fun not sim).
  - `bigBuildings`: real footprints (schools/church/civic/retail) as
    extruded flat-roof slabs h 5–7yd, school palette off-white; Christ
    the King gets a simple gable + cross gable.
  - `trees`: procedural — dense rows along creek/canal polylines
    (the riparian corridors), street trees every ~20yd with seeded
    gaps, park clumps. Reuse FC's tree bakes/species; oaks dominant.
  - `flat`: blacktop polygons (schoolyards from real school grounds,
    w/ painted court lines baked), park lawns (turf = fairway-speed),
    diamonds' dirt (sand-colored, but only the mapped bunker ellipses
    PLAY as sand — the rest is 'hardpan' = pavement lie).
  - `culdesacs`: asphalt discs at real positions (r 9yd).
- Budget caps enforced BY THE CONVERTER (log + trim): ≤ 90 houses,
  ≤ 260 trees, ≤ 26 scenery water ellipses per hole. Trim farthest-
  from-centerline first. Print a per-hole budget report when run.

**World kind in p3**: `buildHole(idx)` gains a course dimension —
`COURSE = 'magnolia' | 'poco'` selects HOLES vs POCO_HOLES and, for
poco, after the shared ground/green/bunker/water build, runs
`buildPocoScenery(H)`: merged street-ribbon mesh, merged house mesh
(baked vertex AO like FC planting: darker under eaves, lit roof
planes), merged tree bake reuse, pools/canal water using FC's water
material. NO new per-frame cost: everything merged + static, houses
DO NOT cast shadows (curated casters law) — casting stays golfer/
flag/a few hero trees. Skybox/backdrop: existing gradient sky; distant
backdrop ring uses low rooftops + trees instead of pines on poco.

**House collision (the one new sim behavior).** Houses are AABBs in
hole-local (d,off) + height. In tickBall flight/roll: if the ball
enters a house box, reflect off the entered face with restitution 0.42
(walls) / 0.55 (roof planes), SFX.bounce + a new SFX.thunk (woody
door-knock layer, per sfx-quality-bar: noise+body tone, detuned). The
ball must NEVER rest on a roof: while rolling on a roof plane, add
eave-ward shed acceleration until it falls off. No stroke penalty, no
OB — houses are giant bumpers (kid-proof). Trampolines: entering their
disc while falling bounces up at 1.35× |vy| (cap 1 re-bounce per
flight, then normal). Pools/canal/pond/creek = the existing water
penalty flow, unchanged.

**Lie: pavement.** Streets/blacktop/hardpan/cart path = new lie id
'pavement': lieMul 1.0, bounce restitution +40%, roll friction −35%
(ball releases forever on asphalt), putter allowed (it's bucket golf).
Sidehill/HUD text says "PAVEMENT". Detection: point-in street ribbon /
flat polygon sets surface, sampled the same way turf types already are.

**The bucket.** On poco the cup is an ORANGE BUCKET (cylinder r 0.45yd,
h 0.55yd, emissive-warm rim) instead of pin+flag. Capture: ball inside
r 0.45 at ground level with speed < 6 yd/s → SFX new `bucket` (hollow
plastic tonk + rattle, layered synthesis) + existing hole-out flow.
Faster arrivals clank off the rim (reflect, damped, rim SFX). The
aim/minimap pin glyph stays (it's the marker, not the pin mesh).
Flyover + birdie cardinal beat work unchanged (bucket rim perch!).

## Flow / UX

- Title gains course select FIRST: state 'coursepick' between title
  and diffpick — 'MAGNOLIA NATIONAL / the classic 18' and
  'THE POCO OPEN / 9 holes of neighborhood bucket golf'. Pad: up/down
  + south confirm, east back to title. Then diffpick as today. Then
  roundpick ONLY for magnolia; poco goes straight to the 9 (ROUND =
  holes 0..8, label 'THE OPEN 9').
- Scorecard/round-end: par 36 totals; card title 'THE POCO OPEN'.
- Best rounds: localStorage key stays `fairwayclassic_best`, value
  becomes `{magnolia:{amateur,pro}, poco:{...}}`; migrate old flat
  shape into `magnolia` on load. Title shows the best for the course
  the attract flyover is showing (or both, small).
- Minimap: works from the same records; strip water + streets must
  draw (streets = thin gray lines from scenery, cheap polylines).
  DIRECTION LAW: map-space assertion must hold on poco holes too.
- HUD hole banner: 'H3 · MURDERERS CREEK · PAR 4 · 381Y'.
- Wind: calmer than Magnolia (suburb): roll wind at 0.6× strength.

## Verification (Tier 3 bar — build on scripts/verify + FC harness)

- Converter run prints per-hole budget report; commit generated part.
- `bash test/build.sh` green (node --check every block).
- FULL existing suites stay green: harness.mjs (248), aim-direction
  (5), look-verify. Magnolia must be pixel-for-pixel unaffected
  (course select defaults to magnolia for old flows; harness that
  never touches coursepick must pass UNCHANGED).
- NEW poco suite (extend harness.mjs, ~30+ checks): coursepick
  reachable pad-only + keyboard; 9-hole round start; every hole builds
  < 400ms desktop; drive down 1 lands on street → pavement lie text +
  long rollout; house hit → bounce event + never-rests-on-roof
  invariant (fire 40 seeded shots at houses on 1, assert rest never
  inside/on an AABB top); canal strip splash + drop on 6; creek
  carry on 7 short ball = water flow; bucket capture at slow speed,
  rim-out at fast; trampoline bounce fires ≤1; pond hole 8 island
  flow; full 9-hole sim round completes, card shows, best saved under
  poco key + old-key migration test; minimap direction assertion on
  1/3/6; 2P join + pass-and-play on poco; pause/resume; screen-space
  direction law (aim right → ball right of start in SCREEN space).
- Screenshots 1280×720 through real CDP (—mute-audio): coursepick,
  hole 1 address (street canyon reads: houses+oaks+asphalt), 2
  blacktop, 5 diamonds, 6 canal-left, 7 carry, 8 pond, 9 park; LOOK
  at them — programmer-art housing or empty-lot gaps = iterate.
- Perf instrumentation: draw calls ≤ 30, tris ≤ 60k per poco hole
  (report via __fc.info()); bake ms logged per hole.
- Pi AFTER ship (session closer runs it): fps ≥ 60 on 1/6/9 address +
  flight, sweepBuilds worst < 400ms (flyover hides it), lowfx path.

## Out of scope v1 (banked ideas)

Moving hazards (mail truck, joggers, recess crowds), sprinkler
timers, Golf Galaxy pro-shop storefront gag, downtown bonus targets,
PoCo-specific birdie beat, separate arcade menu tile (?course=poco).
