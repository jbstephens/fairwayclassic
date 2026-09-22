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

# FC-LOOK-1 — the beauty pass + UX bundle (locked 2026-09-17)

John's verdict on v1: "The graphics are .. not good. The holes all look
the same, the trees look like shit, there's no shadows or anything. And
dude … where's all the lush shrubbery? And the player himself looks like
a Lego guy. … Golf courses should be gorgeous." Decided — implement as
written.

## 1. Aim arc visibility (fix)

Thicker, always-readable: bigger arc markers with a dark outline under a
bright core (white core, deep-green/navy rim) so it reads on fairway,
sky, and water alike; slight size taper toward landing; pulsing landing
ring. Must stay legible in bright and shaded parts of the scene.

## 2. Flyover rework (fix — decided choreography)

ONE continuous slow shot, ~8–9 s: start above and behind the CUP looking
back down the hole (green + its hazards fill the frame), fly smoothly
along the hole's centerline toward the tee at gentle height — never
looking straight down, never reversing — and settle seamlessly into the
address camera behind the golfer. Ease-in-out; skippable with SOUTH
after 1 s (unchanged). LOWFX keeps the same path (it's one camera, no
extra cost).

## 3. Bottom-right hole HUD (new)

One panel, bottom-right: a top-down schematic minimap of the current
hole — fairway shape, rough, bunkers (sand color), water, green, tee —
drawn tee-at-bottom → green-at-top along the centerline. Overlaid: ball
dot (per player color), aim line, and the PROJECTED LANDING point from
the live arc sim (updates as you aim and as you change club/power
regime). The club selector lives in this same panel (club name + carry
yds + L1/R1 hint): toggling clubs visibly moves the projected landing
marker on the map. Flat rgba panel (no backdrop-filter), couch-legible,
canvas-drawn map baked per hole (not per frame).

## 4. The look overhaul (the big one)

Adopt the measured-free Pi pretty stack (lab 2026-09-12; PP-LOOK
precedent — this game is single-viewport and low-motion, so it should
EXCEED Powder Peak):
- ACES filmic tone mapping + sRGB output (r147: outputEncoding =
  sRGBEncoding). WATCH the double-sRGB trap: our baked vertex colors are
  display-referred; compensate in the grade (gamma/black/gain knobs).
- Lit pipeline: MeshLambert terrain/scenery with vertex colors (sun
  directional + hemisphere + baked AO in the vertex bake).
- ONE 1024px directional shadow map. LAW: casters CURATED — golfer,
  flag, and the tree/shrub clusters near the play corridor only; terrain
  NEVER casts; everything receives. Blob shadow stays under the ball.
- One fullscreen post pass: vignette + warm grade + saturation, with
  per-scene LOOK_TUNE knobs (PP pattern).
- MSAA on (context antialias:true).
- Sky: richer gradient dome + a low sun glow sprite + a few soft cloud
  sprites (additive/alpha, cap ~15 sprites total).
- `?look=0` escape hatch reverts to the v1 flat pipeline; expose
  `window.__fcLook` internals (toggles + tune knobs) for live kiosk A/B.

Art rebuilds with that pipeline:
- TREES: real layered pines (stacked fronds with color variation, visible
  trunks), plus magnolias/oaks (blob-canopy deciduous) for variety;
  clusters, not picket rows; scale variation; understory.
- LUSH SHRUBBERY EVERYWHERE: azalea banks in bloom (multi-tone pink/
  crimson/white), boxwood hedges, flower beds at tees, pampas plumes on
  7, wisteria/dogwood accents — per-hole planting palette in the hole
  records so holes STOP LOOKING THE SAME (12/13 azalea walls, 2/11
  dogwood whites, 10 camellia reds, 18 gallery-lined finish…).
- Per-hole terrain identity: stronger (still camera-comfortable)
  elevation, mow-stripe contrast, bunker lips with shadowed sand faces,
  water with animated sparkle + reflected-sky gradient, creek banks with
  stones on 12/13.
- GOLFER rebuilt PP-LOOK-3 style (the skier precedent, ~640 tris, merged
  meshes): proper proportions, cap with brim, polo + slacks, articulated
  swing (address waggle, backswing, follow-through hold), P1/P2 outfit
  colors; caddie-bag prop standing nearby at address.
- Budgets (single viewport): steady-state ≤75k tris in view (hard cap
  100k), true draw calls ≤80 counted via GL-context wrap (renderer.info
  undercounts under shadow maps — PP law). Shadow-caster subset ≤~30k
  tris. 60fps on the Pi is still the law; `?fx=low` additionally drops
  the shadow map to blob shadows + halves sprites/particles.

# FC-5 — feel & fidelity bundle (locked 2026-09-19, John's list)

Decided — implement as written, tune numbers for fun.

1. MINIMAP AIM BUG: aiming right moves the map marker LEFT — reversed.
   Fix: with the map oriented tee-bottom→green-top, aim-right must move
   the aim line/landing marker right. Extend test/aim-direction.mjs with
   a minimap-space assertion (same law, map space).
2. MINIMAP ZOOM: inside ~120 yds to the pin, the map zooms to a padded
   window around ball→green; on the green it zooms to the green alone
   (putt line + slope arrows visible). Smooth-eased rescale on state
   change; redraws stay event-driven.
3. PUTTER ANYWHERE: club cycle includes the putter from any turf lie
   (fairway/fringe/rough); bunkers keep the loft-out restriction; water
   drops obviously don't. Auto-suggest logic unchanged (putter auto only
   on green) — free selection just stops overshooting from the fringe.
4. BALL SIZE: comically large today — shrink to reads-as-a-golf-ball
   (roughly half current visual diameter), still visible at address,
   in flight, and on the green at couch distance. Blob shadow scales.
5. SWING DIRECTION BUG: the club travels the wrong way (goes "backwards"
   through impact). Correct sequence, screenshot-verified: backswing
   raises club AWAY from the target behind the golfer, downswing sweeps
   THROUGH the ball TOWARD the target, follow-through wraps high on the
   target side.
6. CADDIE: the bag gets a caddie — Augusta look: white boiler-suit
   jumpsuit, green cap, dark skin tone default with per-player-slot
   variation, bag strapped over the shoulder. Stands relaxed near the
   golfer at address (small idle sway), PP-LOOK-3 low-poly style
   (~400–600 tris, merged). Shadow caster.
7. FLIGHT FEEL: real loft — raise per-club launch (driver ~13°, woods
   ~16°, mid-irons ~20–24°, wedges steeper), higher apex, ~25% longer
   hang time, same carry table (rebalance speed/gravity/drag so carries
   land within ±5 yds of the club table). Arc preview and flight share
   the sim, so the preview follows automatically — assert they still
   match. The shot should feel like a broadcast tracer, not a line drive.
8. PUTT STROKE: putting uses a short pendulum stroke animation (no
   backswing wrap, no follow-through wrap), amplitude scaled to meter
   power.
9. THE CLUBHOUSE (bonus): the white clubhouse with its cupola + veranda
   visible from hole 1 tee, 9 green, and the 18 fairway/green approach;
   two white cabins near 10 tee; low stone bridges over the creek at 12
   and 13 (Hogan/Nelson homage). Merged baked geometry, a few k tris,
   present only in the holes that see them; big live oak by the
   clubhouse. Clubhouse also framed in the title beauty shot if cheap
   (title stays hole 12 otherwise).

# FC-7 — the Augusta sauce: terrain drama (locked 2026-09-20)

John (via a ChatGPT consult he endorsed): Augusta in plan view is "long
corridors with modest bends" — the personality is 3D. "Preserve
Augusta's real overhead routing, but exaggerate/accurately model
elevation, lateral fairway slopes, green contours, strategic bunkering,
and landing-area widths." Do NOT make holes bendier. Decided —
implement as written. Build + verify with OPUS agents (John's call).

1. ELEVATION DRAMA (per-hole profiles, the real course, exaggerated for
   feel but camera-comfortable): 10 = the huge sweeping downhill (~30 yd
   drop); 9/18 = uphill finishes to elevated greens; 6 = high tee over a
   valley; 2 = long downhill; 8 = uphill climb; 1 = rise to a crest then
   down; Amen Corner sits low along the creek. Tee boxes and greens as
   built pads (flat-ish) in sloped land.
2. LATERAL LIFE: fairways crowned/tilted (10 cants left, 13 cants hard
   right-to-left toward the creek, 17 ridge); rough shoulders that
   funnel or repel; mounding around greens.
3. ROLL PHYSICS FOLLOWS THE GROUND: on fairway/rough/green the bounce
   and roll respond to the local gradient (downhill runs out, sidehill
   kicks toward the low side, uphill kills). Fairway funneling must be
   REAL — a drive up 10's right side feeds left off the cant. Roll must
   always terminate (no infinite creep guard).
4. SIDEHILL LIES (lite, instructive): when the ball sits on a cant, HUD
   shows "BALL ABOVE FEET — drifts left" (etc.); the shot gets a small
   lateral bias the aim arc INCLUDES (arc = truth, always). Severity
   capped kid-friendly; Pro slightly stronger.
5. ELEVATION-AWARE CARRY: shots to lower ground fly farther, uphill
   shorter (physics already lands on the real terrain — surface the FACT
   in the HUD: "153 YDS ▼18" and let the suggested club account for it).
6. GREEN COMPLEXES: greens angled to the approach line (12 shallow +
   diagonal, 14 terraced tiers, 9 false front that sheds short balls,
   16 hard right-to-left feeder — a ball landing right trickles toward
   the Sunday pin). Multi-lobe contour fields per green record; putt sim
   + green-read arrows + zoomed minimap all read the same field.
7. STRATEGY DATA PASS: bunker positions moved to guard real landing
   zones and green angles; landing areas width-varied (tight where the
   reward is, generous bailouts); records stay data-driven.
8. LAWS: aim arc and flight share one sim (arc shows the sloped-lie
   bias and elevation); carry table integrity ON FLAT GROUND unchanged;
   one-ground-authority (rendered mesh = physics groundH) holds; flyover
   choreography unchanged (it'll showcase the terrain free); budgets
   unchanged (≤80 true calls, ≤75k target tris, casters curated, bake
   sweep under ~350 ms desktop); 60fps kiosk law; ?look=0 / ?fx=low keep
   working; every existing suite stays green, extended not replaced.

# FC-8 — fairways that feel like land (locked 2026-09-21)

John after playing FC-7: "the greens are much more nuanced and harder,
which is good. But the fairways and environs seem basically the same."
Root cause: greens got a contour FIELD + physics that expresses it every
putt; fairways got macro elevation + cant that play rarely surfaces
(approach shots check up fast, mid-scale land is still smooth). Decided
— implement as written; do NOT touch the greens (they're right).

1. MESO-SCALE LAND IN THE CORRIDOR: add a per-hole undulation layer to
   fairway + rough — swales, rolls, ridgelets at ~18–45 yd wavelength,
   amplitude ~0.8–2.2 yds (per-hole character: 5/14/17 rolling, 7 tight
   ripple, 10/13 long swooping waves layered on the cant, 2/8 stepped
   benches). Deterministic per hole (seeded), part of the ONE analytic
   ground field (mesh = physics, as always). Tee pads/green complexes
   and their surrounds keep their FC-7 shapes (blend margin).
2. THE GROUND MUST READ WITHOUT A HUD: strengthen slope-reading in the
   bake — aspect-based light/shade contrast on fairway (sun-facing
   slopes brighten, cross-slopes shade), mow stripes bending with the
   land, sharper rough/fairway edge where the land tilts. Target: a
   screenshot of any fairway mid-corridor visibly undulates at couch
   distance with the HUD off.
3. DRIVES RIDE THE LAND: tune touch-down + roll so tee shots (DR/woods)
   visibly work with the terrain — landing on a downslope releases and
   runs (10 can gain 25+ yds of rollout), into an upslope kills, sidehill
   landing kicks and curls low-side. Chase cam follows the roll to rest.
   Approach irons keep checking up (don't punish the scoring shot).
   Termination law stays.
4. THE GOLFER FEELS THE LIE: on canted lies the golfer + stance visibly
   tilt with the ground (lean into the hill), and the caddie stands on
   the slope too. Small, readable, never comic.
5. ENVIRONS ALIVE: rough shoulders get hollows/mounds that gather or
   shed (a pulled drive on 5 gathers into a swale, not a uniform rough
   strip); 2–3 collection hollows per hole near landing zones; bunker
   surrounds mound up (faces read from the fairway).
6. LAWS unchanged: greens untouched; routing untouched; one-ground-
   authority; arc = truth (rollout preview: extend the landing ring with
   a short predicted-rollout tail so the player sees the release);
   flat-carry table integrity; camera comfort + flyover contract;
   budgets (≤80 true calls, ≤75k target tris, bake ≤~350ms desktop);
   60fps kiosk; ?look=0 / ?fx=low; all suites green, extended not
   replaced. Pi verification after ship (the bake gets busier — measure
   bake cost AND fps).
