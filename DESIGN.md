# FAIRWAY CLASSIC — design (locked 2026-09-16)

3D third-person golf for Stephens Arcade. 18 holes modeled on Augusta
National (in-game the course is called "Magnolia National" — flower hole
names kept, trademark names avoided). 1–2 players pass-and-play.
Amateur/Pro selectable per round. Decided — implement as written, tune
numbers for fun.

## Core loop

Flyover intro of the hole → address the ball (third-person camera behind
the golfer, looking down the fairway) → pick a club (aim arc previews
carry) → aim left/right (arc follows) → press to start the power meter,
press to stop it → swing cinematic-lite → camera follows the ball in
flight → ball settles (bounce + roll by surface) → repeat until holed →
green: same two-press meter with the putter and a flat aim line →
scorecard beat → next hole flyover.

Central tension: club choice + power timing vs. hazards and wind. One
shot is always simple (two presses); the course supplies the drama.

## Course — 18 holes, par 72, ~7,000 yds

Holes are DATA, not hand geometry: each hole is a record {par, yards,
centerline polyline (tee→elbow→green), fairway width profile, hazards
(bunker ellipses, water polygons, tree bands), green position/size/slope,
elevation profile}. A hole builder extrudes terrain + bakes vertex colors
from that record at hole load. Only ONE hole exists in the scene at a
time; previous hole geometry is disposed. Bakes fire at hole transition
(a loading beat), never mid-play.

The 18 records mirror the real course (name, par, yards, dogleg, signature
hazards):

 1 Tea Olive        P4 445  dogleg R, uphill, fairway bunker R
 2 Pink Dogwood     P5 575  dogleg L, downhill, 2 greenside bunkers
 3 Flowering Peach  P4 350  straight, 4 fairway bunkers L, small green
 4 Flowering Crab   P3 240  long par-3, bunkers front-R and L
 5 Magnolia         P4 495  dogleg L, uphill, 2 deep fairway bunkers L
 6 Juniper          P3 180  elevated tee, big drop to green, bunker R
 7 Pampas           P4 450  straight tight tree chute, 3 bunkers front
 8 Yellow Jasmine   P5 570  uphill, fairway bunker R, no greenside sand
 9 Carolina Cherry  P4 460  downhill drive then uphill, 2 bunkers L, false front
10 Camellia         P4 495  big downhill, sweeping dogleg L, bunker fairway-R
11 White Dogwood    P4 520  downhill, POND hugging green-L (Amen Corner)
12 Golden Bell      P3 155  Rae's Creek in front, shallow diagonal green,
                            bunker front + 2 back, swirling wind
13 Azalea           P5 545  dogleg L around trees, creek crossing in front
                            of green, 4 bunkers behind, azalea banks
14 Chinese Fir      P4 440  no bunkers at all, wild terraced green
15 Firethorn        P5 550  pond in front of green, bunker R — risk/reward
16 Redbud           P3 170  all carry over pond, green slopes hard R-to-L
17 Nandina          P4 440  straight, 2 bunkers at green
18 Holly            P4 465  dogleg R, uphill finish, 2 bunkers at the elbow,
                            2 at the green

Visual identity per hole: pines everywhere, white-sand bunkers, azalea
banks (pink instanced blobs) on 12/13, dogwood whites on 2/11, water =
dark reflective-looking baked blue, mown fairway stripes baked into
vertex colors, white flagstick + yellow flag.

## Shot mechanic (the two-press meter — decided)

- State ADDRESS: golfer stands at ball. Club auto-suggested by distance
  remaining; L1/R1 (or d-pad up/down, or [ ] keys) cycles clubs. The AIM
  ARC — a dotted 3D trajectory arc for a 100% shot with the current club,
  wind included — renders to the landing point with a landing ring.
  Left/right (stick, d-pad, arrows, or drag on touch) rotates aim; the
  arc follows live. HUD: hole #, par, distance to pin, club + carry yds,
  wind arrow + mph, stroke count, P1/P2 tag.
- Press SOUTH (✕ / space / click / tap): power meter starts filling
  0→100% and oscillates back down until pressed again.
- Second press: locks power, golfer swings (short anticipation, ~0.25 s),
  ball launches at power% of club carry along the aimed arc.
- No third accuracy press (kid-simple). Pro mode adds mild power-based
  spread instead (see Difficulty).
- Putter (auto-only club on green): arc becomes a flat aim line with
  distance ticks; meter maxes at an adaptive range (~2.5× distance to
  hole); green slope curves the roll.

## Ball flight & surfaces

Projectile + gravity, wind as constant lateral/longitudinal accel in
flight, per-club loft sets launch angle. Bounce/roll by surface:
green (soft bounce, long true roll w/ slope), fairway (normal), rough
(kills roll, next shot 70% power, wider spread), bunker (plugs, next
shot 55% power, must loft out), trees (canopy collision knocks ball
down), cart path none — keep it turf. Water/OB: splash/rustle beat,
+1 stroke, drop at entry point (Amateur) / proper drop-behind line (Pro).

Clubs (carry yds at 100%): DR 260 / 3W 230 / 5W 210 / 4i 195 / 5i 185 /
6i 175 / 7i 162 / 8i 150 / 9i 138 / PW 120 / SW 85 / Putter (green only).

## Camera (third person, behind the golfer)

- FLYOVER: at each hole start, a ~6 s spline from above the green flying
  the hole in reverse to settle behind the tee — skippable with SOUTH
  after 1 s. This is the cinematic beat; make it lovely (show the
  hazards the player is about to fear).
- ADDRESS: over-the-shoulder behind golfer, slightly above, looking down
  the aim line; rotates with aim.
- FLIGHT: camera chases the ball (smoothed follow, slight FOV widen at
  high speed), then eases to the lie for the next ADDRESS.
- GREEN: putting view from behind ball toward hole, pin visible;
  overhead green-read toggle on NORTH (△) showing slope arrows.

## Players & flow

- Title: FAIRWAY CLASSIC over a beauty shot of hole 12; "P1 PRESS ✕" /
  "P2 PRESS ✕ TO JOIN"; difficulty pick (AMATEUR / PRO) then round pick
  (FRONT 9 / BACK 9 / ALL 18). Best round on localStorage
  `fairwayclassic_best` (strokes vs par for 18, per difficulty).
- Pass-and-play: order = farthest from hole hits next (real golf);
  banner "MARIA — 145 YDS — YOUR SHOT" between turns. P2 can join on the
  title or via START on the scorecard between holes. pad(1) drives P2 if
  present; otherwise one pad passes.
- Scorecard after each hole: strokes, par word (BIRDIE! etc.), running
  total vs par; both players' rows in 2P.
- Celebrations (cinematic beats, short): birdie = flag ripple + chime;
  eagle/albatross = firework sparkle over green; hole-in-one = full
  replay of the flight from a drone angle. Water = gentle "plunk" +
  encouraging text (instructive not descriptive, e.g. "Try a shorter
  club to lay up short of the creek").
- Round end: final scorecard, champion banner in 2P, best-round save,
  back to title. START pauses anytime (resume/restart hole/quit round).

## Difficulty (selectable per round — decided)

- AMATEUR: wind 0–8 mph, drop at water entry, stroke cap = double par
  then auto-hole ("picked up — nice try!"), putt aim line shows curve
  preview, meter oscillates slower.
- PRO: wind 0–15 mph, proper drops, no stroke cap, faster meter, mild
  power-dependent spread (full-power shots drift more), putt preview
  shows slope arrows only, firmer greens.

## Controls summary

Pad: L1/R1 club · stick/d-pad ←→ aim · ✕ meter start/stop + confirm ·
△ green-read/scorecard peek · START pause · (SELECT+START and PS button
reserved by shell — never bind).
Keyboard: ←→ aim · [ ] or ↑↓ club · SPACE meter/confirm · TAB scorecard ·
ESC/ENTER pause.
Mouse/touch: click/tap = meter start/stop; horizontal drag on the world =
aim. Virtual pad comes free from controller.js — build NO custom touch
buttons.

## Audio (John's bar: "this is everything for a golf game")

Swing + contact MUST NOT sound 8-bit. Layered physical WebAudio synthesis:
swing = band-passed noise sweep scaled to power; contact = ms-scale noise
transient + damped resonant thump, character per club (driver hollow
"pock", iron "click", sand thud + scatter, putter soft "tock"), slight
per-shot random variation; cup drop = satisfying descending rattle.
Melodic chimes stay warm (sine/FM), never harsh square-wave.

## Tech (house recipe — Powder Peak/PW2 doctrine, verbatim)

three.js r147 vendored+inlined; fixed 1280×720 backbuffer, pixelRatio 1,
antialias false, stencil false, high-performance; CSS-transform letterbox
stage; merged BufferGeometry with baked vertex colors (no normals/UVs) on
MeshBasicMaterial for ALL terrain/scenery; golfer + flag as Lambert/Toon
primitives lit by exactly 2 lights (directional + hemisphere); NO shadow
maps — blob shadows; fog + gradient sky dome load-bearing; fixed 60 Hz
sim, accumulator, ≤5 catch-up ticks, edge-latched buttons; preallocated
particle pools (sand puff, water splash, confetti) with DynamicDrawUsage;
no per-frame allocations, scratch vectors; matrixAutoUpdate=false on
statics. Budgets asserted via renderer.info in the harness: ≤80 draw
calls, ≤120k tris. LOWFX (`?fx=low` / localStorage `arcade_lowfx`) halves
particle pools and skips the flyover sway.

Build: test/src/p*.html parts assembled by test/build.sh (glob order,
p1-head first). NEVER hand-edit index.html.
