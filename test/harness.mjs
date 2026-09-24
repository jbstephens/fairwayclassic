// FAIRWAY CLASSIC — the full verification harness (house rules, Tier 3).
// Drives the REAL input path: stubbed navigator.getGamepads -> controller.js
// -> game; keyboard regression; asserts ZERO console errors at every stage.
// All waits are sim-state waits (window.__fc), never rAF counts.
//
//   node --experimental-websocket test/harness.mjs
//
// Screenshots land in test/shots/.

import path from 'node:path';
import { ROOT, sleep, serveRepo, launchChrome, openPage, makeT } from './lib.mjs';

const HTTP = 8983, CDP = 9383;
const SHOTS = path.join(ROOT, 'test', 'shots');
const T = makeT();
const ok = T.ok.bind(T);

const budgets = [];   // {where, calls, tris}
async function sampleBudget(page, where) {
  const i = await page.eval('__fc.info()');
  budgets.push({ where, calls: i.calls, tris: i.tris });
  return i;
}

async function waitState(page, states, what, timeout = 15000) {
  const list = JSON.stringify(Array.isArray(states) ? states : [states]);
  await page.waitFor(`${list}.includes(__fc.state())`, what, timeout);
}

// press the meter at ~pct (poll-and-press through the real input path)
async function lockMeterAt(page, pct, pad = true) {
  const press = () => pad ? page.pressPad('south', 70) : page.key(' ', 'Space', 32, 60);
  await press();                       // start the meter
  await waitState(page, 'meter', 'meter started', 5000);
  const t0 = Date.now();
  for (;;) {
    const v = await page.eval('__fc.meter()');
    if (Math.abs(v - pct) < 9) break;
    if (Date.now() - t0 > 8000) throw new Error('meter never near ' + pct);
    await sleep(25);
  }
  await press();                       // lock power
}
// wait for the shot to fully resolve (back at an address/card/roundend beat)
async function waitShotDone(page, timeout = 60000) {
  try {
    await page.waitFor(
      `['address','card','roundend'].includes(__fc.state()) && !__fc.flightOn()`,
      'shot resolved', timeout);
  } catch (e) {
    const dump = await page.eval(
      `JSON.stringify({s:__fc.state(),t:__fc.turn(),f:__fc.flightOn(),m:__fc.meter(),p:__fc.players()})`).catch(() => '?');
    throw new Error(e.message + ' | state dump: ' + dump);
  }
}

const srv = await serveRepo({ port: HTTP });
const chrome = await launchChrome({ port: CDP });

/* ════════ PART A — pad path, 2P, amateur, the whole loop ════════ */
async function partA() {
  console.log('\n═══ PART A: pad path (2P, AMATEUR, ALL 18) ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
    ok(true, 'boots to title');
    ok((await page.eval('__fc.hole()')) === 12, 'title beauty shot is hole 12');
    await sleep(900);
    await page.screenshot(path.join(SHOTS, 'title.png'));

    // P2 joins on the title (connect first: a pad's first observed frame
    // never counts as justPressed — the controller treats it as pre-existing)
    await page.connectPad(1);
    await sleep(250);
    await page.pressPad('south', 110, 1);
    await sleep(250);
    ok((await page.eval('__fc.players()')).length === 2, 'P2 joined on title via pad(1) south');

    // difficulty -> round
    await page.pressPad('south'); await sleep(300);
    ok((await page.eval('__fc.state()')) === 'coursepick', 'course pick shown first');
    ok((await page.eval('__fc.course()')) === 'magnolia', 'course select defaults to MAGNOLIA');
    await page.pressPad('south'); await sleep(300);              // MAGNOLIA NATIONAL
    ok((await page.eval('__fc.state()')) === 'diffpick', 'difficulty pick shown');
    await page.pressPad('south'); await sleep(300);              // AMATEUR
    ok((await page.eval('__fc.state()')) === 'roundpick', 'round pick shown');
    ok((await page.eval('__fc.diff()')) === 'amateur', 'difficulty = amateur');
    await page.pressPad('down'); await sleep(150);
    await page.pressPad('down'); await sleep(150);               // ALL 18
    await page.pressPad('south');
    await waitState(page, 'flyover', 'hole 1 flyover', 12000);
    ok((await page.eval('__fc.hole()')) === 1, 'hole 1 building + flyover');
    const b1 = await page.eval('__fc.lastBuild()');
    ok(b1 && b1.ms < 250, `hole 1 build ${b1 && b1.ms.toFixed(1)}ms < 250ms`);
    await sleep(1600);
    await page.screenshot(path.join(SHOTS, 'flyover.png'));
    await page.pressPad('south');                                // skip (allowed after 1s)
    await waitState(page, 'address', 'address after skip', 8000);
    ok(true, 'flyover skips with south');
    await sampleBudget(page, 'hole1 address');

    // club cycling
    const c0 = await page.eval('__fc.club()');
    ok(c0 === 'DR', 'auto-suggests DR off the tee (got ' + c0 + ')');
    await page.pressPad('r1'); await sleep(150);
    const c1 = await page.eval('__fc.club()');
    ok(c1 === '3W', 'R1 cycles club down to 3W (got ' + c1 + ')');
    await page.pressPad('l1'); await sleep(150);
    ok((await page.eval('__fc.club()')) === 'DR', 'L1 cycles back to DR');

    // aiming moves the arc endpoint
    const e0 = await page.eval('__fc.arcEnd()');
    await page.axisPad(0, -1); await sleep(500); await page.axisPad(0, 0);
    await sleep(150);
    const e1 = await page.eval('__fc.arcEnd()');
    const moved = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
    ok(moved > 4, `aim left moves the arc endpoint (${moved.toFixed(1)} yds)`);
    await page.axisPad(0, 1); await sleep(520); await page.axisPad(0, 0);

    // P1 tee shot — full meter cycle
    await lockMeterAt(page, 72);
    await waitState(page, ['swing', 'flight'], 'swing fires', 4000);
    await page.waitFor(`__fc.flightOn()`, 'ball in flight', 4000);
    ok(true, 'meter -> swing -> ball launches');
    await sleep(600);
    await page.screenshot(path.join(SHOTS, 'flight.png'));
    await sampleBudget(page, 'hole1 flight');
    await waitShotDone(page);
    const ps1 = await page.eval('__fc.players()');
    ok(ps1[0].strokes === 1, 'P1 stroke counted');
    ok(Math.hypot(ps1[0].ball.x + 1.2, ps1[0].ball.z - 4) > 60, 'P1 ball flew down the hole');

    // alternating turn: P2 must be up (has not teed)
    ok((await page.eval('__fc.turn()')) === 1, 'turn passes to P2 (pass-and-play)');
    const bannerTxt = await page.eval(`document.getElementById('bannerMain').textContent`);
    ok(/P2/.test(bannerTxt), 'turn banner names P2 ("' + bannerTxt + '")');
    // P2 hits via pad(1)
    await page.eval(`__connectPad(1)`);
    await page.pressPad('south', 70, 1);
    await waitState(page, 'meter', 'P2 meter', 5000);
    await sleep(350);
    await page.pressPad('south', 70, 1);
    await waitShotDone(page);
    ok((await page.eval('__fc.players()'))[1].strokes === 1, 'P2 stroke counted from pad(1)');

    // pause / resume with START
    await waitState(page, 'address', 'address', 8000);
    await page.pressPad('start'); await sleep(300);
    ok((await page.eval('__fc.state()')) === 'pause', 'START pauses');
    await page.screenshot(path.join(SHOTS, 'pause.png'));
    await page.pressPad('start'); await sleep(300);
    ok((await page.eval('__fc.state()')) === 'address', 'START resumes');

    /* reach the green (debug teleport), putt out both players.  FC-7: the
       greens carry real contour now, so the putt-out drives WHOEVER IS
       ACTUALLY UP (honors order alternates after every stroke) and sets the
       ball at tap-in range — the beat under test is holing out and the
       card, not the break on a 2.4-yd putt (that gets its own section). */
    let firstOnGreen = true;
    for (let shot = 0; shot < 16; shot++) {
      if (await page.eval('__fc.players().every(p=>p.holed)')) break;
      await waitState(page, ['address', 'card'], 'address for putt-out', 25000);
      if ((await page.eval('__fc.state()')) === 'card') break;
      const pin = await page.eval('__fc.pin()');
      const sgn = (await page.eval('__fc.turn()')) === 0 ? -1 : 1;
      await page.eval(`__fc.teleport(${pin.x + sgn * 0.9}, ${pin.z + sgn * 0.8})`);
      await sleep(200);
      if (firstOnGreen) {
        firstOnGreen = false;
        ok((await page.eval('__fc.club()')) === 'PT', 'putter auto-selected on the green');
        ok((await page.eval('__fc.lie()')) === 2, 'lie reads GREEN');
        await sleep(300);
        await page.screenshot(path.join(SHOTS, 'green.png'));
        // green-read toggle on NORTH
        await page.pressPad('north'); await sleep(350);
        ok((await page.eval('__fc.state()')) === 'greenread', 'green-read view on north');
        await page.screenshot(path.join(SHOTS, 'greenread.png'));
        await page.pressPad('north'); await sleep(350);
        ok((await page.eval('__fc.state()')) === 'address', 'green-read toggles back');
      }
      await lockMeterAt(page, 46);
      await waitShotDone(page);
    }
    await page.waitFor(`__fc.players().every(p=>p.holed)`, 'both players holed', 60000);
    await waitState(page, 'card', 'scorecard', 15000);
    const ps2 = await page.eval('__fc.players()');
    ok(ps2[0].scores['0'] > 0 && ps2[1].scores['0'] > 0, 'both scores recorded on the card');
    await sleep(400);
    await page.screenshot(path.join(SHOTS, 'scorecard.png'));
    await page.pressPad('south');
    await waitState(page, 'flyover', 'hole 2 flyover', 15000);
    ok((await page.eval('__fc.hole()')) === 2, 'advances to hole 2');

    /* ── water hole: 16 (Redbud, all carry over the pond) ── */
    await page.eval('__fc.gotoHole(16)');
    await waitState(page, 'flyover', 'hole 16 flyover', 15000);
    await sleep(1200);
    await page.pressPad('south');
    await waitState(page, 'address', 'hole 16 address', 8000);
    await page.eval('__fc.setWind(0,0)');
    // P1: pick 8i (60% = ~90 yds -> dead center of the pond)
    for (let i = 0; i < 12; i++) {
      const c = await page.eval('__fc.club()');
      if (c === '8i') break;
      await page.pressPad(CLUB_ORDER.indexOf(c) < CLUB_ORDER.indexOf('8i') ? 'r1' : 'l1', 70);
      await sleep(120);
    }
    ok((await page.eval('__fc.club()')) === '8i', 'clubbed down to 8i for the water test');
    const preStrokes = (await page.eval('__fc.players()'))[0].strokes;
    await lockMeterAt(page, 58);
    await waitShotDone(page);
    const pw = (await page.eval('__fc.players()'))[0];
    ok(pw.strokes === preStrokes + 2, `water costs stroke + penalty (${preStrokes}->${pw.strokes})`);
    ok(pw.lie !== 5, 'dropped on turf, not in the water');
    ok(!pw.holed, 'still playing after the drop');

    // P2 tee shot (short and safe), then P1 waters until the Amateur cap
    await waitState(page, 'address', 'next address', 20000);
    if ((await page.eval('__fc.turn()')) === 1) {
      await lockMeterAt(page, 12);
      await waitShotDone(page);
    }
    for (let i = 0; i < 14; i++) {
      const p0 = (await page.eval('__fc.players()'))[0];
      if (p0.holed) break;
      await waitState(page, 'address', 'cap-loop address', 20000);
      if ((await page.eval('__fc.turn()')) !== 0) {   // P2 interleaves: tiny safe shot
        await lockMeterAt(page, 10);
        await waitShotDone(page);
        continue;
      }
      await page.eval('__fc.setWind(0,0)');
      await lockMeterAt(page, 58);                    // splash again
      await waitShotDone(page);
    }
    const capped = (await page.eval('__fc.players()'))[0];
    ok(capped.holed, 'Amateur stroke cap auto-pickup fired');
    ok(capped.scores['15'] === 6, `cap score = double par (got ${capped.scores['15']})`);

    // P2 finishes 16 (teleport + putt), reach the card
    for (let tries = 0; tries < 8; tries++) {
      const ps = await page.eval('__fc.players()');
      if (ps[1].holed) break;
      await waitState(page, 'card', 'p2 done?', 1200).catch(() => {});
      if ((await page.eval('__fc.state()')) === 'card') break;
      await waitState(page, 'address', 'p2 address', 20000);
      const pin = await page.eval('__fc.pin()');
      await page.eval(`__fc.teleport(${pin.x + 0.9}, ${pin.z + 0.8})`);
      await sleep(200);
      await lockMeterAt(page, 46);
      await waitShotDone(page);
    }
    await waitState(page, 'card', 'hole 16 card', 20000);
    ok(true, 'hole 16 completes to the scorecard');

    /* ── hole 12 (Golden Bell): scenic shots + birdie celebration ── */
    await page.pressPad('south');                                // advance (into some hole)
    await waitState(page, 'flyover', 'next flyover', 15000);
    await page.eval('__fc.gotoHole(12)');
    await waitState(page, 'flyover', 'hole 12 flyover', 15000);
    await sleep(1300);
    await page.pressPad('south');
    await waitState(page, 'address', 'hole 12 address', 8000);
    await page.eval('__fc.setWind(4, 1.2)');
    await sleep(400);
    await page.screenshot(path.join(SHOTS, 'address-12.png'));
    await sampleBudget(page, 'hole12 address');
    // club down to PW so a mid meter lands SHORT of the creek (deterministic)
    for (let i = 0; i < 12; i++) {
      if ((await page.eval('__fc.club()')) === 'PW') break;
      await page.pressPad('r1', 70); await sleep(120);
    }
    // meter mid-fill shot, then lock ~45%
    await page.pressPad('south', 70);
    await waitState(page, 'meter', 'meter', 4000);
    const t0 = Date.now();
    for (;;) {
      const v = await page.eval('__fc.meter()');
      if (v > 40 && v < 60) break;
      if (Date.now() - t0 > 6000) break;
      await sleep(25);
    }
    await page.screenshot(path.join(SHOTS, 'meter.png'));
    await page.pressPad('south', 70);                            // lock -> tee shot
    await page.waitFor('__fc.flightOn()', 'flight', 5000);
    await sleep(500);
    await sampleBudget(page, 'hole12 flight');
    await waitShotDone(page);
    // both players putt out via teleport; P1's second stroke = the birdie
    for (let tries = 0; tries < 8; tries++) {
      const ps = await page.eval('__fc.players()');
      if (ps[0].holed) break;
      await waitState(page, 'address', 'address', 20000);
      const turn = await page.eval('__fc.turn()');
      const pin = await page.eval('__fc.pin()');
      console.log('  [birdie loop]', tries, 'turn', turn,
        JSON.stringify(ps.map(p => ({ s: p.strokes, h: p.holed, lie: p.lie }))),
        'dist', (await page.eval('__fc.dist()')).toFixed(1));
      let birdiePutt = false;
      if (turn === 0) {
        if ((await page.eval('__fc.players()'))[0].strokes === 1) {
          await page.eval(`__fc.teleport(${pin.x - 0.9}, ${pin.z - 0.7})`);
          await sleep(200);
          birdiePutt = true;
        }
      } else {
        await page.eval(`__fc.teleport(${pin.x + 0.9}, ${pin.z + 0.7})`);
        await sleep(200);
      }
      await lockMeterAt(page, 46);
      if (birdiePutt) {
        // FC-6: the birdseed beat — golfer walks up, sprinkles seed, a
        // cardinal drops in.  Witness it, screenshot the bird, then let it
        // play out into the usual party.
        await page.waitFor(`__fc.players()[0].holed`, 'birdie drops', 15000).catch(() => {});
        await page.waitFor(`__fc.state()==='birdiecin'`, 'birdseed beat starts', 4000);
        await page.waitFor(`__fc.cin() >= 2.0`, 'sprinkle beat reached', 8000);
        await page.waitFor(`__fc.birdVisible()`, 'the cardinal arrives', 6000);
        ok(true, 'birdie triggers the birdseed cinematic (walk, sprinkle, bird)');
        await page.waitFor(`__fc.cin() >= 4.0 || __fc.state()!=='birdiecin'`, 'bird pecking', 6000);
        await page.screenshot(path.join(SHOTS, 'celebration.png'));
        await sampleBudget(page, 'celebration');
        await page.waitFor(`__fc.state()!=='birdiecin'`, 'beat ends on its own', 12000);
        ok((await page.eval(`__fc.birdVisible()`)) === false, 'the cardinal leaves when the beat ends');
      }
      await waitShotDone(page);
    }
    const pb = (await page.eval('__fc.players()'))[0];
    ok(pb.holed && pb.scores['11'] === 2, `P1 birdies 12 (score ${pb.scores['11']})`);

    /* ── budgets + 18-hole build sweep ── */
    for (const b of budgets) {
      ok(b.calls <= 80, `draw calls ${b.calls} <= 80 @ ${b.where}`);
      ok(b.tris <= 120000, `tris ${b.tris} <= 120k @ ${b.where}`);
    }
    const sweep = await page.eval('__fc.sweepBuilds()');
    console.log('  build sweep:', sweep.map(s => `#${s.hole}:${s.ms}ms`).join(' '));
    ok(sweep.length === 18, 'all 18 holes build');
    ok(sweep.every(s => s.ms < 250), 'every hole builds < 250ms desktop');
    globalThis.__sweep = sweep;

    ok(page.errors.length === 0, 'ZERO console errors across part A' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally { await page.close(); }
}
const CLUB_ORDER = ['DR', '3W', '5W', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'SW'];

/* ════════ PART B — keyboard-only regression ════════ */
async function partB() {
  console.log('\n═══ PART B: keyboard-only regression ═══');
  const page = await openPage(CDP, { padStub: false });
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
    await page.key(' ', 'Space', 32); await sleep(300);
    ok((await page.eval('__fc.state()')) === 'coursepick', 'kbd: space starts (course pick)');
    await page.key(' ', 'Space', 32); await sleep(300);          // MAGNOLIA
    ok((await page.eval('__fc.state()')) === 'diffpick', 'kbd: course confirm -> difficulty');
    await page.key(' ', 'Space', 32); await sleep(300);          // AMATEUR
    await page.key(' ', 'Space', 32);                            // FRONT 9
    await waitState(page, 'flyover', 'kbd flyover', 15000);
    await sleep(1200);
    await page.key(' ', 'Space', 32);
    await waitState(page, 'address', 'kbd address', 8000);
    ok(true, 'kbd: space skips the flyover');
    // aim with arrows
    const e0 = await page.eval('__fc.arcEnd()');
    await page.key('ArrowLeft', 'ArrowLeft', 37, 450);
    await sleep(150);
    const e1 = await page.eval('__fc.arcEnd()');
    ok(Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) > 3, 'kbd: arrows aim');
    // clubs with up/down (the [ ] pair maps to the same verbs; headless=new
    // deterministically kills BeginFrames after a ']' dispatchKeyEvent at
    // this state — a Chromium quirk, verified game-independent via the
    // eval-equivalent path — so the harness drives the arrow binding)
    const c0 = await page.eval('__fc.club()');
    await page.key('ArrowDown', 'ArrowDown', 40); await sleep(150);
    ok((await page.eval('__fc.club()')) !== c0, 'kbd: club cycles (arrow binding)');
    await page.key('ArrowUp', 'ArrowUp', 38); await sleep(150);
    // scorecard peek on TAB
    await page.key('Tab', 'Tab', 9); await sleep(250);
    ok(await page.eval(`document.getElementById('cardUI').style.display==='block'`), 'kbd: TAB peeks the scorecard');
    await page.key('Tab', 'Tab', 9); await sleep(250);
    ok(await page.eval(`document.getElementById('cardUI').style.display!=='block'`), 'kbd: TAB hides the peek');
    // full shot
    await lockMeterAt(page, 70, false);
    await page.waitFor('__fc.flightOn()', 'kbd flight', 5000);
    await waitShotDone(page);
    ok((await page.eval('__fc.players()'))[0].strokes === 1, 'kbd: full shot cycle lands');
    // ESC pause — LAST headless-kbd assertion: entering pause from a
    // keyboard key deterministically stops BeginFrames in headless=new
    // (environment quirk; part D re-verifies pause+resume in headed Chrome)
    await waitState(page, 'address', 'address', 10000);
    await page.key('Escape', 'Escape', 27); await sleep(250);
    ok((await page.eval('__fc.state()')) === 'pause', 'kbd: ESC pauses');
    ok(page.errors.length === 0, 'ZERO console errors across part B' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally { await page.close(); }
}

/* ════════ PART C — touch pass (virtual pad overlay, no stub) ════════ */
async function partC() {
  console.log('\n═══ PART C: touch (touchpad-v1 overlay) ═══');
  const page = await openPage(CDP, { width: 1180, height: 820, touch: true, padStub: false });
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
    // first tap engages the injected overlay
    await page.tap(590, 300);
    await page.waitFor(`!!document.getElementById('__arcade_touchpad')`, 'touch overlay injected', 5000);
    ok(true, 'first tap engages #__arcade_touchpad');
    await page.waitFor(`document.body.classList.contains('input-pad')`, 'body input-pad', 5000);
    ok(true, 'body gets input-pad while the virtual pad drives');
    // that first tap ALSO acted as a direct-gesture confirm (by design) —
    // state may already be diffpick; from here drive ONLY the virtual pad.
    const south = await page.rectCenter('#__atp-s');
    ok(!!south, 'virtual ✕ button present');
    const tapSouth = async () => { await page.tap(south.x, south.y, 90); await sleep(320); };
    if ((await page.eval('__fc.state()')) === 'title') await tapSouth();
    if ((await page.eval('__fc.state()')) === 'coursepick') await tapSouth();
    if ((await page.eval('__fc.state()')) === 'diffpick') await tapSouth();
    if ((await page.eval('__fc.state()')) === 'roundpick') await tapSouth();
    await waitState(page, 'flyover', 'touch flyover', 15000);
    await sleep(1200);
    await tapSouth();                                            // skip
    await waitState(page, 'address', 'touch address', 8000);
    ok(true, 'virtual pad drives title -> address');
    // aim with the virtual stick (drag the knob left)
    const stick = await page.rectCenter('#__atp-base');
    const a0 = await page.eval('__fc.aim()');
    await page.tStart(3, stick.x, stick.y);
    await page.tMove(3, stick.x - 70, stick.y);
    await sleep(500);
    await page.tEnd(3);
    await sleep(150);
    const a1 = await page.eval('__fc.aim()');
    ok(Math.abs(a1 - a0) > 0.05, `virtual stick aims (${(a1 - a0).toFixed(2)} rad)`);
    // full shot on the virtual ✕
    await tapSouth();
    await waitState(page, 'meter', 'touch meter', 5000);
    await sleep(400);
    await page.screenshot(path.join(SHOTS, 'touch-1180.png'));
    await tapSouth();
    await page.waitFor('__fc.flightOn()', 'touch flight', 6000);
    await waitShotDone(page);
    ok((await page.eval('__fc.players()'))[0].strokes === 1, 'touch: full shot with only the virtual pad');
    ok(page.errors.length === 0, 'ZERO console errors across part C' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally { await page.close(); }
}

/* ════════ PART D — headed arbiter for headless BeginFrame quirks ════════
   headless=new stops producing frames after certain dispatchKeyEvents
   (']' at address; any keyboard-triggered pause).  Headed Chrome on this
   Mac is the arbiter that those exact paths work in a real browser. */
async function partD() {
  console.log('\n═══ PART D: headed-Chrome arbiter (bracket clubs, ESC pause/resume) ═══');
  const fs = await import('node:fs');
  const { spawn } = await import('node:child_process');
  const userDir = fs.mkdtempSync('/tmp/fc-headed-');
  const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--mute-audio', '--no-first-run', '--window-size=1280,760', '--window-position=40,40',
    '--user-data-dir=' + userDir, '--remote-debugging-port=' + (CDP + 1), 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://localhost:${CDP + 1}/json/version`); if (r.ok) break; } catch {}
    await sleep(100);
  }
  const page = await openPage(CDP + 1, { padStub: false });
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
    await page.key(' ', 'Space', 32); await sleep(300);   // coursepick
    await page.key(' ', 'Space', 32); await sleep(300);   // MAGNOLIA
    await page.key(' ', 'Space', 32); await sleep(300);   // AMATEUR
    await page.key(' ', 'Space', 32);                     // FRONT 9
    await waitState(page, 'flyover', 'flyover', 15000);
    await sleep(1100);
    await page.key(' ', 'Space', 32);
    await waitState(page, 'address', 'address', 9000);
    const c0 = await page.eval('__fc.club()');
    await page.key(']', 'BracketRight', 221); await sleep(250);
    ok((await page.eval('__fc.club()')) !== c0, 'headed: ] changes club');
    await page.key('[', 'BracketLeft', 219); await sleep(250);
    ok((await page.eval('__fc.club()')) === c0, 'headed: [ changes it back');
    await page.key('Escape', 'Escape', 27); await sleep(300);
    ok((await page.eval('__fc.state()')) === 'pause', 'headed: ESC pauses');
    await page.key('Escape', 'Escape', 27); await sleep(300);
    ok((await page.eval('__fc.state()')) === 'address', 'headed: ESC resumes');
    ok(page.errors.length === 0, 'ZERO console errors across part D' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally {
    await page.close();
    try { proc.kill(); } catch {}
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {}
  }
}

/* ════════ PART E — turbo FRONT 9 speedrun: full round to the champion beat ════════ */
async function partE() {
  console.log('\n═══ PART E: FRONT 9 speedrun (turbo) — round end + replay beats ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/?turbo=6`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
    await sleep(400);
    await page.pressPad('south'); await sleep(250);              // course pick
    await page.pressPad('south'); await sleep(250);              // MAGNOLIA
    await page.pressPad('south'); await sleep(250);              // AMATEUR
    await page.pressPad('south');                                // FRONT 9
    let sawReplay = false, joined = false, ended = false;
    // wait out swings/flights/replays; return the next actionable beat
    const nextBeat = async () => {
      for (let w = 0; w < 120; w++) {
        const s = await page.eval('__fc.state()');
        if (s === 'replay') { sawReplay = true; await sleep(500); await page.pressPad('south'); }
        else if (s === 'address' && !(await page.eval('__fc.flightOn()'))) return 'address';
        else if (s === 'card' || s === 'roundend') return s;
        await sleep(250);
      }
      throw new Error('speedrun stuck at ' + (await page.eval('__fc.state()')));
    };
    for (let h = 0; h < 9 && !ended; h++) {
      await waitState(page, 'flyover', `hole ${h + 1} flyover`, 25000);
      await sleep(400);
      await page.pressPad('south');                              // skip
      for (;;) {
        const s = await nextBeat();
        if (s === 'roundend') { ended = true; break; }
        if (s === 'card') {
          if (h === 0 && !joined) {
            // P2 joins MID-ROUND on the scorecard via START (design beat)
            await page.connectPad(1); await sleep(300);
            await page.pressPad('start', 110, 1); await sleep(300);
            ok((await page.eval('__fc.players()')).length === 2, 'P2 joins mid-round on the scorecard via START');
            joined = true;
          }
          await page.pressPad('south');
          break;
        }
        const pin = await page.eval('__fc.pin()');
        await page.eval(`__fc.teleport(${pin.x - 0.9}, ${pin.z - 0.8})`);
        await sleep(150);
        await page.pressPad('south'); await sleep(150);          // meter start
        await page.pressPad('south');                            // lock — any power holes from a yard
      }
    }
    await waitState(page, 'roundend', 'round end', 25000);
    ok(true, 'FRONT 9 plays through to the final card');
    ok(sawReplay, 'hole-in-one replay beat fired (drone replay, skippable)');
    const word = await page.eval(`document.getElementById('cardWord').textContent`);
    ok(word.length > 0, `final card verdict shown ("${word}")`);
    await page.screenshot(path.join(SHOTS, 'roundend.png'));
    await page.pressPad('south');
    await waitState(page, 'title', 'back to title', 15000);
    ok(true, 'round end returns to the title');
    ok(page.errors.length === 0, 'ZERO console errors across part E' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally { await page.close(); }
}

/* ════════ PART F — LOWFX flag + best-round persistence & parse guard ════════ */
async function partF() {
  console.log('\n═══ PART F: ?fx=low + best-round storage ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/?fx=low`);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'lowfx title boot');
    ok(await page.eval('LOWFX'), 'LOWFX active via ?fx=low');
    ok((await page.eval(`localStorage.getItem('arcade_lowfx')`)) === '1', 'arcade_lowfx persisted');
    ok((await page.eval('psConfetti.n')) < 84, 'particle pools halved under LOWFX');
    // corrupt best-round survives the parse guard; a real one shows on the title
    await page.eval(`localStorage.setItem('fairwayclassic_best', '{oops')`);
    ok(JSON.stringify(await page.eval('loadBest()')) === '{"magnolia":{},"poco":{}}',
      'corrupt best JSON is survived (now the two-course shape)');
    await page.eval(`saveBest('amateur', -3, 'magnolia'); saveBest('pro', 1, 'magnolia')`);
    await page.nav(`http://localhost:${HTTP}/?fx=full`);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title reboot');
    const best = await page.eval(`document.getElementById('titleBest').textContent`);
    ok(/MAGNOLIA \(AM\).*-3/.test(best) && /MAGNOLIA \(PRO\).*\+1/.test(best),
      `best round persists to the title ("${best}")`);
    // PRO mode smoke: select PRO, one full shot resolves clean
    await page.connectPad(0); await sleep(300);
    await page.pressPad('south'); await sleep(250);              // coursepick
    await page.pressPad('south'); await sleep(250);              // MAGNOLIA -> diffpick
    await page.pressPad('down'); await sleep(200);               // -> PRO
    await page.pressPad('south'); await sleep(250);              // confirm PRO
    await page.pressPad('south');                                // FRONT 9
    await waitState(page, 'flyover', 'pro flyover', 20000);
    ok((await page.eval('__fc.diff()')) === 'pro', 'PRO difficulty selected');
    ok((await page.eval('__fc.wind()')).mph <= 15, 'pro wind within 0-15');
    await sleep(1200);
    await page.pressPad('south');
    await waitState(page, 'address', 'pro address', 9000);
    await lockMeterAt(page, 65);
    await waitShotDone(page);
    ok((await page.eval('__fc.players()'))[0].strokes >= 1, 'pro shot resolves');
    ok(page.errors.length === 0, 'ZERO console errors across part F' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally { await page.close(); }
}

/* ════════ PART G — FC-5: carry sweep, putter-anywhere, pendulum, map zoom ════════ */
async function partG() {
  console.log('\n═══ PART G: FC-5 feel & fidelity ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
    await sleep(400);
    for (const want of ['coursepick', 'diffpick', 'roundpick', 'flyover']) {   // AMATEUR / FRONT 9
      for (let i = 0; i < 6; i++) {
        await page.pressPad('south'); await sleep(350);
        if ((await page.eval('__fc.state()')) === want) break;
      }
    }
    await waitState(page, 'flyover', 'flyover', 15000);
    await sleep(1200);
    await page.pressPad('south');
    await waitState(page, 'address', 'address', 9000);
    await page.eval('__fc.setWind(0,0)');

    /* 1. carry-table integrity: the REAL launchShot+tickBall per club at
       100% power, flat ground, no wind — plus the SHARED arc preview */
    const sweep = await page.eval('JSON.parse(JSON.stringify(__fc.rangeTest()))');
    console.log('  club sweep:\n' + sweep.map(s =>
      `    ${s.club.padEnd(3)} launch ${String(s.launch).padStart(4)}°  carry ${s.carry}/${s.table}  preview ${s.prev}  apex ${s.apex}  hang ${s.hang}s`).join('\n'));
    for (const s of sweep) {
      ok(Math.abs(s.carry - s.table) <= 5, `${s.club}: landed carry ${s.carry} within ±5 yds of table ${s.table}`);
      ok(Math.abs(s.prev - s.carry) <= 5, `${s.club}: arc preview ${s.prev} tracks the flight ${s.carry}`);
    }
    ok(sweep[0].hang >= 3.6 && sweep[0].hang <= 4.5,
      `driver hang ${sweep[0].hang}s in the +25% band (v1 was 3.22s)`);
    globalThis.__clubSweep = sweep;

    /* 2. putter-anywhere (real input), full-swing pose on the way */
    const toPT = async () => {
      for (let i = 0; i < 14; i++) {
        if ((await page.eval('__fc.club()')) === 'PT') return true;
        await page.pressPad('r1', 70); await sleep(110);
      }
      return (await page.eval('__fc.club()')) === 'PT';
    };
    await page.eval('__fc.teleport(...__fc.clWorld(200, 0))'); await sleep(250);
    ok((await page.eval('__fc.lie()')) === 1, 'teleported to a FAIRWAY lie');
    ok(await toPT(), 'putter selectable on the fairway (R1 cycle past SW)');
    await page.pressPad('l1'); await sleep(200);
    ok((await page.eval('__fc.club()')) === 'SW', 'L1 cycles back from putter to SW');
    // full-club meter drives the (fixed-direction) backswing state
    await page.pressPad('south');
    await waitState(page, 'meter', 'meter', 5000);
    await sleep(300);
    ok((await page.eval('__fc.pose()')) === 'back', 'full-club meter holds the backswing pose state');
    await page.pressPad('south');
    await waitShotDone(page);
    await page.eval('__fc.teleport(...__fc.clWorld(200, 26))'); await sleep(250);
    ok((await page.eval('__fc.lie()')) === 0, 'teleported to a ROUGH lie');
    ok(await toPT(), 'putter selectable in the rough');
    await page.eval(`(() => { const g = __fc.green(); const k = g.grx * 1.15;
      __fc.teleport(g.x + g.tz * k, g.z - g.tx * k); })()`);
    await sleep(250);
    ok((await page.eval('__fc.lie()')) === 3, 'teleported to a FRINGE lie');
    ok(await toPT(), 'putter selectable on the fringe');
    // bunker: loft-out law holds — no putter, min club 9i
    await page.eval('__fc.teleport(...__fc.clWorld(295, 22))'); await sleep(250);
    ok((await page.eval('__fc.lie()')) === 4, 'teleported into the fairway BUNKER');
    for (let i = 0; i < 8; i++) { await page.pressPad('r1', 70); await sleep(110); }
    ok((await page.eval('__fc.club()')) === 'SW', 'bunker: cycle stops at SW — putter refused');
    for (let i = 0; i < 8; i++) { await page.pressPad('l1', 70); await sleep(110); }
    ok((await page.eval('__fc.club()')) === '9i', 'bunker: nothing longer than 9i (loft-out law)');

    /* 3. minimap zoom: full ↔ approach at the 120-yd line, green on the green */
    await page.eval('__fc.teleport(...__fc.clWorld(140, 0))'); await sleep(700);
    const dFar = await page.eval('__fc.dist()');
    const sFull = await page.eval('__fc.mapScale()');
    ok(dFar > 120 && (await page.eval('__fc.mapZoom()')) === 'full',
      `map FULL beyond the threshold (${dFar.toFixed(0)} yds)`);
    await page.eval(`(() => { const g = __fc.green();
      __fc.teleport(g.x - g.tx * 90, g.z - g.tz * 90); })()`);
    await sleep(800);
    const dNear = await page.eval('__fc.dist()');
    const sAppr = await page.eval('__fc.mapScale()');
    ok(dNear <= 120 && (await page.eval('__fc.mapZoom()')) === 'approach',
      `map zooms to APPROACH inside 120 (${dNear.toFixed(0)} yds)`);
    ok(sAppr > sFull, `approach frame magnifies (${sFull.toFixed(2)} -> ${sAppr.toFixed(2)} px/yd)`);
    const pin = await page.eval('__fc.pin()');
    await page.eval(`__fc.teleport(${pin.x - 2.2}, ${pin.z - 2.0})`);
    await sleep(800);
    ok((await page.eval('__fc.lie()')) === 2, 'on the GREEN');
    ok((await page.eval('__fc.mapZoom()')) === 'green', 'map zooms to the GREEN alone');
    ok((await page.eval('__fc.mapScale()')) > sAppr, 'green frame magnifies further');

    /* 4. the putt pendulum stroke (real input, real states) */
    await page.pressPad('south');
    await waitState(page, 'meter', 'putt meter', 5000);
    await sleep(300);
    ok((await page.eval('__fc.club()')) === 'PT', 'putter auto-selected on the green');
    ok((await page.eval('__fc.pose()')) === 'pback', 'putt meter drives the PENDULUM back state');
    await page.eval(`window.__poseLog = {}; window.__poseRec = true;
      (function f(){ const p = __fc.pose(); if (p) __poseLog[p] = 1;
        if (window.__poseRec) requestAnimationFrame(f); })()`);
    await page.pressPad('south');                                // stroke
    await sleep(1400);
    const poses = await page.eval(`(window.__poseRec = false, Object.keys(__poseLog))`);
    ok(poses.includes('pthru') || poses.includes('phold'),
      `putt stroke sweeps pendulum-through (saw ${poses.join(',')})`);
    ok(!poses.includes('thru') && !poses.includes('hold') && !poses.includes('back'),
      'no full-swing wrap states during a putt');
    await waitShotDone(page).catch(() => {});

    ok(page.errors.length === 0, 'ZERO console errors across part G' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally { await page.close(); }
}

/* ════════ PART H — FC-7: the Augusta sauce (terrain drama) ════════
   Elevation per hole, one-ground-authority, the funnel, the false front,
   the feeder and the terraces, sidehill lies (HUD + arc = truth), the
   elevation-aware HUD, and the roll TERMINATION LAW across all 18. */
async function partH() {
  console.log('\n═══ PART H: FC-7 terrain drama ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
    ok((await page.eval('__fc.build')) === 'FC-10-PLACE', 'build tag is FC-10-PLACE');
    await sleep(400);
    for (const want of ['coursepick', 'diffpick', 'roundpick', 'flyover']) {
      for (let i = 0; i < 6; i++) {
        await page.pressPad('south'); await sleep(350);
        if ((await page.eval('__fc.state()')) === want) break;
      }
    }
    await waitState(page, 'flyover', 'flyover', 15000);
    await sleep(1300);
    await page.pressPad('south');
    await waitState(page, 'address', 'address', 10000);
    await page.eval('__fc.setWind(0,0)');
    const goHole = async n => {
      await page.eval(`__fc.gotoHole(${n})`);
      await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${n}`, 'hole ' + n, 20000);
      await sleep(1200);
      await page.pressPad('south');
      await waitState(page, 'address', 'address ' + n, 10000);
      await page.eval('__fc.setWind(0,0)');
      await sleep(150);
    };

    /* ── 1. the per-hole elevation record ── */
    const ET = await page.eval('JSON.parse(JSON.stringify(__fc.elevTable()))');
    globalThis.__fc7elev = ET;
    const EH = n => ET[n - 1];
    console.log('  per-hole elevation (yds, tee = 0):\n' + ET.map(r =>
      `    ${String(r.hole).padStart(2)} ${r.name.padEnd(16)} par ${r.par} ${String(r.yds).padStart(3)}y` +
      `  tee ${String(r.tee).padStart(5)}  green ${String(r.green).padStart(6)}  low ${String(r.lo).padStart(6)}` +
      `  high ${String(r.hi).padStart(5)}  relief ${String(r.relief).padStart(5)}  cant ${String(r.cant).padStart(5)}  crown ${r.crown}`).join('\n'));
    ok(EH(10).tee - EH(10).green >= 28,
      `10 Camellia: the big sweeping downhill drops ${(EH(10).tee - EH(10).green).toFixed(1)} yds (>= 28)`);
    ok(EH(9).green - EH(9).tee >= 6 && EH(9).lo <= -8,
      `9: the drive plunges to ${EH(9).lo} then climbs to an elevated green (+${EH(9).green})`);
    ok(EH(18).green - EH(18).tee >= 18, `18 Holly: uphill finish climbs ${EH(18).green} yds`);
    ok(EH(6).lo <= Math.min(EH(6).tee, EH(6).green) - 4,
      `6 Juniper: a real valley (${EH(6).lo}) under the high tee and the green (${EH(6).green})`);
    ok(EH(2).tee - EH(2).green >= 15, `2: the long downhill (${EH(2).tee - EH(2).green} yds)`);
    ok(EH(8).green - EH(8).tee >= 18, `8: the uphill climb (+${EH(8).green} yds)`);
    ok(EH(1).hi >= EH(1).green + 2,
      `1: rises to a crest (${EH(1).hi}) then falls to the green (${EH(1).green})`);
    for (const n of [11, 12, 13])
      ok(EH(n).green <= -3, `${n} (Amen Corner) sits low along the creek (green ${EH(n).green})`);
    ok(ET.every(r => r.relief >= 5), 'every hole carries >= 5 yds of relief — no flat holes left');
    ok(EH(10).cant >= 0.08 && EH(13).cant >= 0.08,
      `10 and 13 carry the big lateral cants (${EH(10).cant} / ${EH(13).cant})`);
    ok(EH(17).crown >= 1.8, `17 Nandina rides a ridge (crown ${EH(17).crown} yds)`);

    /* ── 2. ONE-GROUND-AUTHORITY + the BUILT elevation matches the record ── */
    for (const n of [1, 6, 10, 14, 18]) {
      await goHole(n);
      const a = await page.eval('JSON.parse(JSON.stringify(__fc.groundAudit(600)))');
      ok(a.worst < 0.002,
        `hole ${n}: groundH == the rendered terrain, vertex for vertex (worst ${a.worst} yd over ${a.n}/${a.verts})`);
      const e = await page.eval('JSON.parse(JSON.stringify(__fc.elev()))');
      ok(Math.abs(e.drop - (EH(n).tee - EH(n).green)) <= 2.5,
        `hole ${n}: built tee->pin drop ${e.drop} matches the record ${(EH(n).tee - EH(n).green).toFixed(1)}`);
    }

    /* ── 3. the FUNNEL: a drive up 10's right half finishes LEFT ── */
    await goHole(10);
    const fun = await page.eval(`JSON.parse(JSON.stringify((() => {
      const out = [];
      for (const st of [[240, 9], [200, 10], [280, 11]]) {
        const a = __fc.clWorld(st[0], st[1]), b = __fc.clWorld(st[0] + 20, st[1]);
        const dx = b[0]-a[0], dz = b[1]-a[1], l = Math.hypot(dx, dz);
        const r = __fc.rollFrom(a[0], a[1], dx/l*13, dz/l*13);
        const e = __fc.doff(r.x, r.z);
        out.push({ from: st, offEnd: +e[1].toFixed(2), run: r.moved, t: r.t, surf: r.surf });
      }
      return out;
    })()))`);
    console.log('  hole 10 funnel:', JSON.stringify(fun));
    for (const f of fun)
      ok(f.offEnd < f.from[1] - 1.0 && f.surf === 1,
        `10: a drive running up the right half (off +${f.from[1]}) feeds LEFT to off +${f.offEnd} over ${f.run} yds`);

    /* ── 4. the FALSE FRONT on 9: a ball landing short is SHED back ── */
    await goHole(9);
    const ff = await page.eval(`JSON.parse(JSON.stringify((() => {
      const g = __fc.green();
      const land = __fc.greenWorld(0, -(g.grz + 2));      // 2 yds short of the green
      const tgt = __fc.greenWorld(0, 0);
      const dx = tgt[0]-land[0], dz = tgt[1]-land[1], l = Math.hypot(dx, dz);
      const out = [];
      for (const sp of [4, 8]) {
        const r = __fc.rollFrom(land[0], land[1], dx/l*sp, dz/l*sp);
        out.push({ sp, landAlong: +(-(g.grz + 2)).toFixed(1),
          restAlong: +__fc.greenLoc(r.x, r.z)[1].toFixed(2), surf: r.surf, t: r.t });
      }
      const mid = __fc.greenWorld(0, 2);
      const rm = __fc.rollFrom(mid[0], mid[1], 0, 0);
      out.push({ mid: true, restAlong: +__fc.greenLoc(rm.x, rm.z)[1].toFixed(2), surf: rm.surf, t: rm.t });
      return out;
    })()))`);
    console.log('  hole 9 false front:', JSON.stringify(ff));
    for (const r of ff.filter(x => !x.mid)) {
      ok(r.restAlong < r.landAlong - 0.5,
        `9 false front: a ball landing 2 yds short at ${sp2(r)} rolls BACKWARD to ${r.restAlong}`);
      ok(r.surf !== 2, `9 false front: it is shed off the green (finishes on surface ${r.surf})`);
    }
    const midBall = ff.find(x => x.mid);
    ok(midBall.surf === 2 && midBall.t < 1.5, '9: a ball on the green proper still settles at once');

    /* ── 5. SIDEHILL LIES: the HUD line, and the arc carries the bias ── */
    const sideCases = [[13, 300, 9], [10, 250, 10], [17, 250, 11]];
    for (const c of sideCases) {
      await goHole(c[0]);
      const r = await page.eval(`JSON.parse(JSON.stringify((() => {
        __fc.teleport(...__fc.clWorld(${c[1]}, ${c[2]}));
        const info = __fc.lieInfo();
        const pv = __fc.previewVsFlight(1);
        return { lie: __fc.lie(), info, pv, txt: __fc.shotText() };
      })()))`);
      console.log(`  hole ${c[0]} lie at (${c[1]},${c[2]}):`, JSON.stringify(r.info), 'dev', r.pv.dev);
      ok(r.lie === 1, `hole ${c[0]}: the sidehill probe sits on the fairway`);
      ok(Math.abs(r.info.cross) > 0.03, `hole ${c[0]}: a real cant under the ball (cross ${r.info.cross})`);
      ok(/BALL (ABOVE|BELOW) FEET/.test(r.txt),
        `hole ${c[0]}: the HUD says it — "${(r.txt.match(/BALL[^]*?(left|right)/) || [''])[0]}"`);
      const wantLeft = r.info.cross > 0;
      ok((wantLeft && r.info.bias < 0) || (!wantLeft && r.info.bias > 0),
        `hole ${c[0]}: ${wantLeft ? 'above the feet biases LEFT' : 'below the feet biases RIGHT'} (${r.info.bias} rad)`);
      ok(Math.abs(r.info.bias) <= 0.08, `hole ${c[0]}: the bias stays kid-capped (${r.info.bias} rad <= 0.08)`);
      ok(r.pv.dev >= 0 && r.pv.dev <= 5,
        `hole ${c[0]}: ARC = TRUTH on sloped ground — preview lands ${r.pv.dev} yds from the flight (<= 5)`);
    }
    // Pro biases harder than Amateur off the same lie
    const proBias = await page.eval(`(() => { const a = __fc.lieInfo().bias;
      const d = __fc.diff(); DIFF = 'pro'; const p = __fc.lieInfo().bias; DIFF = d;
      return [a, p]; })()`);
    ok(Math.abs(proBias[1]) > Math.abs(proBias[0]) * 1.2,
      `PRO works the sidehill harder (${proBias[0]} -> ${proBias[1]} rad)`);

    /* ── 6. ELEVATION-AWARE HUD + club suggestion ── */
    await goHole(18);
    const upH = await page.eval(`JSON.parse(JSON.stringify((() => {
      __fc.teleport(...__fc.clWorld(__fc.holeLen() - 150, 0));
      return { txt: __fc.shotText(), dist: __fc.dist(), rise: __fc.lieInfo().rise, club: __fc.club() };
    })()))`);
    console.log('  18 uphill HUD:', JSON.stringify(upH));
    ok(upH.rise >= 5, `18: the pin sits ${upH.rise.toFixed(1)} yds above the ball`);
    ok(/▲\d+/.test(upH.txt), `18: the HUD shows the uphill delta ("${upH.txt.replace(/\s+/g, ' ').trim()}")`);
    await goHole(10);
    const dnH = await page.eval(`JSON.parse(JSON.stringify((() => {
      __fc.teleport(...__fc.clWorld(__fc.holeLen() - 150, 0));
      return { txt: __fc.shotText(), dist: __fc.dist(), rise: __fc.lieInfo().rise, club: __fc.club() };
    })()))`);
    console.log('  10 downhill HUD:', JSON.stringify(dnH));
    ok(dnH.rise <= -5, `10: the pin sits ${(-dnH.rise).toFixed(1)} yds below the ball`);
    ok(/▼\d+/.test(dnH.txt), `10: the HUD shows the downhill delta ("${dnH.txt.replace(/\s+/g, ' ').trim()}")`);
    // and the delta STAYS QUIET when it is not worth a club: 3 rises only
    // 7 yds over 350, so from the middle of the fairway it is inside the band
    await goHole(3);
    const quiet = await page.eval(`JSON.parse(JSON.stringify((() => {
      __fc.teleport(...__fc.clWorld(__fc.holeLen() - 60, 0));
      return { txt: __fc.shotText(), rise: __fc.lieInfo().rise };
    })()))`);
    console.log('  3 gentle HUD:', JSON.stringify(quiet));
    ok(Math.abs(quiet.rise) < 5 && !/[\u25b2\u25bc]/.test(quiet.txt),
      `the delta stays off when it is not worth a club (3: ${quiet.rise.toFixed(1)} yds, no marker)`);
    const order = CLUB_ORDER.indexOf(upH.club) < CLUB_ORDER.indexOf(dnH.club);
    ok(order, `the suggestion takes more club uphill than down from the same 150 yds (${dnH.club} down / ${upH.club} up)`);

    /* ── 7. GREEN COMPLEXES: the diagonal, the terraces, the feeder ── */
    await goHole(12);
    const g12 = await page.eval('JSON.parse(JSON.stringify(__fc.green()))');
    ok(g12.grx > g12.grz * 1.8, `12 Golden Bell: shallow and wide (${g12.grx.toFixed(1)} x ${g12.grz.toFixed(1)})`);
    const diag = await page.eval(`(() => { const g = __fc.green();
      const ap = __fc.clWorld(__fc.holeLen() - 40, 0);
      const app = Math.atan2(g.x - ap[0], g.z - ap[1]);
      const axis = Math.atan2(g.tx, g.tz);
      let d = Math.abs(((axis - app) * 180 / Math.PI + 540) % 360 - 180);
      return +d.toFixed(1); })()`);
    ok(diag > 12, `12: the green is set DIAGONALLY to the approach (${diag} deg off the line)`);
    await goHole(14);
    const ter = await page.eval(`JSON.parse(JSON.stringify((() => {
      const prof = [];
      for (let a = -12; a <= 12; a += 1.5) { const w = __fc.greenWorld(0, a); prof.push(+__fc.groundH(w[0], w[1]).toFixed(2)); }
      let risers = 0;
      for (let i = 1; i < prof.length; i++) if (prof[i] - prof[i-1] > 0.22) risers++;
      return { prof, risers, rise: +(prof[prof.length-1] - prof[0]).toFixed(2) };
    })()))`);
    console.log('  hole 14 terraces:', JSON.stringify(ter));
    ok(ter.rise > 1.4, `14 Chinese Fir: the green climbs ${ter.rise} yds front to back`);
    ok(ter.risers >= 3, `14: it climbs in TERRACES — ${ter.risers} riser samples between flat shelves`);
    await goHole(16);
    const feed = await page.eval(`JSON.parse(JSON.stringify((() => {
      const g = __fc.green(), pinL = __fc.greenLoc(__fc.pin().x, __fc.pin().z), out = [];
      for (const lat of [5, 8]) {
        const p = __fc.greenWorld(lat, 0);
        const r = __fc.rollFrom(p[0], p[1], 0, 0);
        const l = __fc.greenLoc(r.x, r.z);
        out.push({ lat, restLat: +l[0].toFixed(2), t: r.t, surf: r.surf,
          dPin: +Math.hypot(l[0]-pinL[0], l[1]-pinL[1]).toFixed(2),
          dPin0: +Math.hypot(lat-pinL[0], 0-pinL[1]).toFixed(2) });
      }
      return { pinLat: +pinL[0].toFixed(2), out };
    })()))`);
    console.log('  hole 16 feeder:', JSON.stringify(feed));
    ok(feed.pinLat < -3, `16 Redbud: the Sunday pin is cut left (lat ${feed.pinLat})`);
    for (const r of feed.out) {
      ok(r.restLat < r.lat - 4, `16: a ball resting right (lat ${r.lat}) FEEDS left to ${r.restLat}`);
      ok(r.dPin < r.dPin0, `16: the feeder carries it TOWARD the pin (${r.dPin0} -> ${r.dPin} yds)`);
    }

    /* ── 8. LANDING-AREA WIDTHS: tight where the reward is ── */
    await goHole(1);
    const widths = await page.eval(`JSON.parse(JSON.stringify((() => {
      const L = __fc.holeLen(), w = [];
      for (const f of [0.1, 0.3, 0.58, 0.75, 0.95]) w.push(+__fc.fwAt(f * L).toFixed(1));
      return w;
    })()))`);
    console.log('  hole 1 fairway halfwidths:', JSON.stringify(widths));
    ok(Math.max(...widths) - Math.min(...widths) >= 3,
      `1: the landing area pinches (${Math.min(...widths)} yds) and widens again (${Math.max(...widths)} yds)`);

    /* ── 9. THE TERMINATION LAW, all 18 holes ── */
    const sweep = await page.eval('JSON.parse(JSON.stringify(__fc.rollSweep()))');
    globalThis.__fc7roll = sweep;
    console.log('  roll-termination sweep:', sweep.map(s => `#${s.hole}:${s.worst}s`).join(' '));
    const worst = sweep.reduce((a, b) => (b.worst > a.worst ? b : a));
    ok(sweep.every(s => s.worst <= 12),
      `every hole: a ball on the steepest cant comes to rest <= 12 s (worst ${worst.worst}s on #${worst.hole} — ${worst.where})`);
    ok(sweep.every(s => s.capped === 0),
      'no release anywhere needed the 11 s hard floor — the turf stops them honestly');

    ok(page.errors.length === 0, 'ZERO console errors across part H' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally { await page.close(); }
}
const sp2 = r => `${r.sp} yd/s`;

/* ════════ PART I — FC-8: fairways that feel like land ════════
   The meso layer in the corridor (and the gradient laws that keep it from
   out-tilting the hole), drives that ride the land, approach irons that
   still check up, the rollout tail as truth, the environs' collection
   hollows, the stance on a canted lie, and pin sanity on all 18. */
async function partI() {
  console.log('\n═══ PART I: FC-8 fairways that feel like land ═══');
  const page = await openPage(CDP);
  const J = e => `JSON.parse(JSON.stringify(${e}))`;
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
    await sleep(400);
    for (const want of ['coursepick', 'diffpick', 'roundpick', 'flyover']) {
      for (let i = 0; i < 6; i++) {
        await page.pressPad('south'); await sleep(350);
        if ((await page.eval('__fc.state()')) === want) break;
      }
    }
    await waitState(page, 'flyover', 'flyover', 15000);
    await sleep(1300);
    await page.pressPad('south');
    await waitState(page, 'address', 'address', 10000);
    await page.eval('__fc.setWind(0,0)');
    const goHole = async n => {
      await page.eval(`__fc.gotoHole(${n})`);
      await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${n}`, 'hole ' + n, 20000);
      await sleep(1200);
      await page.pressPad('south');
      await waitState(page, 'address', 'address ' + n, 10000);
      await page.eval('__fc.setWind(0,0)');
      await sleep(150);
    };

    /* ── 1. THE MESO LAYER IS REALLY THERE ──
       Measured through the one analytic field, sampled twice at the same
       stations: once live, once with the layer switched off (which IS the
       FC-7 ground).  dev = RMS yards of land added; cur = mean |second
       difference| along the corridor, which a smooth macro ramp cannot
       fake. */
    const UND = await page.eval(J('__fc.undSweep()'));
    globalThis.__fc8und = UND;
    console.log('  per-hole meso layer:\n' + UND.map(u =>
      `    ${String(u.hole).padStart(2)} ${u.kind.padEnd(6)} wl ${String(u.wl).padStart(2)}y` +
      `  relief ${String(u.relief).padStart(5)}  dev ${String(u.dev).padStart(5)}  peak ${String(u.peak).padStart(4)}` +
      `  curve ${String(u.cur).padStart(6)} vs flat ${String(u.curFlat).padStart(6)} (x${u.ratio})` +
      `  gTyp ${u.gTyp}  gMax ${u.gMax}  hollows ${u.hol}`).join('\n'));
    const rolling = UND.filter(u => u.dev >= 0.25 && u.cur > u.curFlat);
    ok(rolling.length >= 12,
      `${rolling.length} holes carry real meso relief (>= 0.25 yd RMS AND more corridor curvature than the FC-7 flat line) — need 12`);
    ok(UND.filter(u => u.cur > u.curFlat).length >= 17,
      `${UND.filter(u => u.cur > u.curFlat).length}/18 holes curve more between the elevation stations than FC-7 did`);
    // the two constants the field builder caps against (UND_GRAD_TYP/_MAX)
    ok(UND.every(u => u.gTyp <= 0.1551), 'THE GRADIENT LAW: no hole\'s typical meso gradient exceeds 0.155');
    ok(UND.every(u => u.gMax <= 0.2801),
      `THE GRADIENT LAW: no hole's worst-case meso gradient exceeds 0.28 — under what fairway turf holds (restGrad 0.34); worst ${Math.max(...UND.map(u => u.gMax))}`);
    ok(UND.filter(u => u.kind === 'ripple').length === 1 && UND[6].kind === 'ripple',
      '7 Pampas is the tight ripple');
    ok(UND[1].kind === 'bench' && UND[7].kind === 'bench', '2 and 8 climb in stepped benches');
    ok([10, 11, 13].every(n => UND[n - 1].kind === 'swoop'),
      '10, 11 and 13 carry long swooping waves under their cants');

    /* ── 2. DRIVES RIDE THE LAND: 10 releases downhill ── */
    await goHole(10);
    const sw10 = await page.eval(J(`[1,0.98,0.96,0.94,0.92,0.9,0.88].map(p => __fc.driveProbe(0,p))`));
    globalThis.__fc8roll10 = sw10;
    console.log('  hole 10 driver sweep (carry / roll / slope at the pitch mark):\n' + sw10.map(d =>
      `    carry ${String(d.carry).padStart(5)}  roll ${String(d.roll).padStart(5)}  slope ${String(d.slope).padStart(8)}  surf ${d.landSurf}`).join('\n'));
    const down10 = sw10.filter(d => d.landSurf === 1 && d.slope < -0.02);
    ok(down10.length > 0, `10: the driver finds falling ground to pitch on (${down10.length} of ${sw10.length} landings)`);
    const best10 = down10.reduce((a, b) => (b.roll > a.roll ? b : a), down10[0] || { roll: -1 });
    ok(best10.roll >= 18,
      `10 CAMELLIA: a drive landing on the downslope RELEASES ${best10.roll} yds (>= 18; flat-ground driver rollout is ~17)`);

    /* ── 3. …and 18's climb kills it ── */
    await goHole(18);
    const sw18 = await page.eval(J(`[1,0.98,0.96,0.94,0.92,0.9].map(p => __fc.driveProbe(0,p))`));
    globalThis.__fc8roll18 = sw18;
    console.log('  hole 18 driver sweep:\n' + sw18.map(d =>
      `    carry ${String(d.carry).padStart(5)}  roll ${String(d.roll).padStart(5)}  slope ${String(d.slope).padStart(8)}  surf ${d.landSurf}`).join('\n'));
    const up18 = sw18.filter(d => d.landSurf === 1 && d.slope >= 0.10);
    ok(up18.length > 0, `18: the driver pitches into the hill (${up18.length} landings on real upslope)`);
    const worstUp = Math.max(...up18.map(d => d.roll));
    ok(worstUp <= 6,
      `18 HOLLY: pitching into the climb kills the run — worst rollout ${worstUp} yds (<= 6)`);

    /* ── 4. THE SIDEHILL KICK on 13 (and its mirror on 8) ──
       Measured in the ball's own travel frame at the pitch mark: on a
       dogleg, centreline `off` gains yards without the ball curling an
       inch, so it cannot answer this question. */
    await goHole(13);
    const s13 = await page.eval(J(`(() => { const o = [];
      for (const ci of [0,1,2,3]) for (const p of [1,0.95,0.9]) {
        __fc.teleport(...__fc.clWorld(4, 0));
        const d = __fc.driveProbe(ci, p);
        o.push({ club: d.club, p, curl: d.curl, roll: d.roll, surf: d.landSurf });
      } return o; })()`));
    const real13 = s13.filter(d => d.surf === 1 && d.roll >= 6);
    console.log('  hole 13 sidehill curl (+ = right of travel):',
      JSON.stringify(real13.map(d => ({ c: d.club, roll: d.roll, curl: d.curl }))));
    ok(real13.length >= 6, `13: ${real13.length} drives get a real release on the cant`);
    ok(real13.every(d => d.curl < 0),
      `13 AZALEA: every one kicks and curls to the LOW side, toward the creek (worst ${Math.max(...real13.map(d => d.curl))} yds)`);
    ok(Math.min(...real13.map(d => d.curl)) <= -1.5,
      `13: and the big releases curl ${Math.min(...real13.map(d => d.curl))} yds — a kick you can see`);
    await goHole(8);
    const s8 = await page.eval(J(`(() => { const o = [];
      for (const ci of [0,1,2]) for (const p of [1,0.95,0.9]) {
        __fc.teleport(...__fc.clWorld(4, 0));
        const d = __fc.driveProbe(ci, p);
        o.push({ curl: d.curl, roll: d.roll, surf: d.landSurf });
      } return o; })()`));
    const real8 = s8.filter(d => d.surf === 1 && d.roll >= 6);
    ok(real8.length && real8.every(d => d.curl > 0),
      `8 (canted the other way) kicks the other way — the kick reads the ground, not the hole (${real8.length} drives)`);

    /* ── 5. …and the SCORING SHOT still checks up ── */
    const appr = [];
    for (const n of [17, 3, 7, 14]) {
      await goHole(n);
      appr.push(await page.eval(J(
        `(() => { __fc.teleport(...__fc.clWorld(__fc.holeLen() - 150, 0)); return __fc.driveProbe(7, 1); })()`)));
    }
    console.log('  8-iron approaches from 150:', JSON.stringify(appr.map(a =>
      ({ carry: a.carry, roll: a.roll, land: a.landSurf, rest: a.restSurf }))));
    ok(appr.every(a => a.landSurf === 2 && a.restSurf === 2),
      'the 8-iron approach still holds the green it lands on (4 holes)');
    ok(appr.every(a => a.roll <= 8),
      `and still checks up — worst rollout ${Math.max(...appr.map(a => a.roll))} yds (<= 8, FC-7 typical)`);

    /* ── 6. ARC = TRUTH INCLUDING THE RELEASE ── */
    const tails = [];
    for (const n of [1, 10, 13]) {
      await goHole(n);
      tails.push({ hole: n, r: await page.eval(J(`__fc.rolloutCheck(0, 1)`)) });
    }
    console.log('  rollout-tail prediction:', JSON.stringify(tails));
    for (const t of tails)
      ok(t.r.err <= 6,
        `hole ${t.hole}: the predicted-rollout tail ends ${t.r.err} yds from where the struck ball rests (<= 6; predicted ${t.r.rollPred} vs real ${t.r.rollReal})`);

    /* ── 7. THE ENVIRONS GATHER: hole 5's swale, in and out ──
       The same pulled drive, twice, with the collection hollows switched
       off and on: the swale has to pull the rest toward its own centre. */
    await goHole(5);
    const hol5 = await page.eval(J('__fc.hollows()'));
    console.log('  hole 5 hollows:', JSON.stringify(hol5));
    ok(hol5.length >= 2 && hol5.some(h => h.a < 0), '5 Magnolia carries collection hollows in its shoulders');
    const ab = await page.eval(J(`(() => { const o = [];
      for (const on of [false, true]) {
        __fc.setHol(on);
        const h = __fc.hollows()[0];
        for (const a of [-0.05,-0.06,-0.07,-0.08,-0.09,-0.10,-0.11]) {
          __fc.teleport(...__fc.clWorld(4, 0));
          __fc.aimBy(a);
          const d = __fc.driveProbe(0, 1);
          o.push({ on, aim: a, restOff: d.restOff,
            dRest: +Math.hypot(d.rest[0]-h.x, d.rest[1]-h.z).toFixed(2) });
        }
      }
      __fc.setHol(true); return o; })()`));
    const offA = ab.filter(d => !d.on), onA = ab.filter(d => d.on);
    const gains = offA.map((d, i) => +(d.dRest - onA[i].dRest).toFixed(2));
    console.log('  hole 5 pulled-drive A/B, yds closer to the swale line with it in:', JSON.stringify(gains));
    ok(gains.filter(g => g > 0).length >= 6,
      `5: the swale pulls a pulled drive toward its line on ${gains.filter(g => g > 0).length}/7 aims`);
    ok(Math.max(...gains) >= 1.0,
      `5: and gathers it up to ${Math.max(...gains)} yds closer than the same drive on FC-7 ground`);
    ok(onA.every((d, i) => Math.abs(d.restOff - offA[i].restOff) < 12),
      '5: the hollow gathers the miss — it does not teleport it (sanity)');

    /* ── 8. THE GOLFER FEELS THE LIE ── */
    await goHole(13);
    await page.eval('__fc.teleport(...__fc.clWorld(300, 10))');
    await sleep(500);
    const tilt = await page.eval(J('__fc.golferTilt()'));
    console.log('  hole 13 stance on the cant:', JSON.stringify(tilt));
    ok(tilt.deg > 1.5, `13: the golfer visibly tilts with the ground (${tilt.deg} deg)`);
    ok(tilt.deg <= 7.05, `13: …and the tilt stays capped, never comic (${tilt.deg} deg <= 7)`);
    ok(Math.abs(tilt.cross) > 0.03, `13: there is a real cant under him (cross ${tilt.cross})`);
    ok((tilt.cross > 0 && tilt.lat < 0) || (tilt.cross < 0 && tilt.lat > 0),
      `13: he leans with the slope, not against it — ground rising to his ${tilt.cross > 0 ? 'right' : 'left'} tips his stance ${tilt.lat < 0 ? 'left' : 'right'} (lat ${tilt.lat})`);
    const flatTilt = await page.eval(J(
      `(() => { __fc.teleport(...__fc.clWorld(4, 0)); return __fc.golferTilt(); })()`));
    await sleep(350);
    const flatTilt2 = await page.eval(J('__fc.golferTilt()'));
    ok(flatTilt2.deg < tilt.deg,
      `and stands straighter on the built tee pad (${flatTilt2.deg} deg vs ${tilt.deg} on the cant)`);
    void flatTilt;

    /* ── 9. PIN SANITY, all 18 (the FC-8 scope addition) ──
       Every cup — hand-set or scored — ≥3 yds inside the green edge, ≥3
       yds off any bunker lip, on ground gentle enough to putt around. */
    const PA = await page.eval(J('__fc.pinAudit()'));
    globalThis.__fc8pins = PA;
    console.log('  pin audit:\n' + PA.map(p =>
      `    ${String(p.hole).padStart(2)}  lat ${String(p.lat).padStart(6)} along ${String(p.along).padStart(6)}` +
      `  ${p.handSet ? 'hand-set' : 'scored  '}  moved ${String(p.moved).padStart(5)}` +
      `  edge ${String(p.edge).padStart(5)}  sand ${String(p.sand).padStart(6)}  ring ${String(p.ring).padStart(6)}`).join('\n'));
    ok(PA.every(p => p.edge >= 3), `every pin sits >= 3 yds inside its green edge (worst ${Math.min(...PA.map(p => p.edge))})`);
    ok(PA.every(p => p.sand >= 3), `every pin sits >= 3 yds off the nearest bunker lip (worst ${Math.min(...PA.map(p => p.sand))})`);
    ok(PA.every(p => p.ring <= 0.135),
      `every cup has puttable ground around it — worst 2.2-yd ring gradient ${Math.max(...PA.map(p => p.ring))} (<= 0.135, green restGrad is 0.15)`);
    ok(PA.every(p => p.relax === 0), 'and every one of them is legal under the STRICT law — no hole needed a relaxation');
    const p16 = PA[15];
    ok(p16.lat < -3 && p16.along < 0,
      `16 REDBUD: the Sunday pin now sits in the low-left GATHER the feeder feeds toward (lat ${p16.lat}, along ${p16.along})`);
    ok(p16.sand >= 3,
      `16: …and off the left bunker's shoulder it used to sit on (${p16.sand} yds of clearance, was ~1)`);

    /* ── 10. the flat reference the rollout claims are measured against ── */
    const FR = await page.eval(J('__fc.flatRollTable()'));
    globalThis.__fc8flat = FR;
    console.log('  flat-ground rollout by club:\n' + FR.map(r =>
      `    ${r.club.padEnd(3)} table ${String(r.table).padStart(3)}  carry ${String(r.carry).padStart(5)}  rest ${String(r.rest).padStart(5)}  roll ${r.roll}`).join('\n'));
    ok(FR.every(r => Math.abs(r.carry - r.table) <= 5),
      'FLAT-CARRY TABLE INTEGRITY: the meso layer never touches flat ground — every carry still lands on its table number');
    const dr = FR[0], pw = FR[9];
    ok(dr.roll > pw.roll * 2.5,
      `the driver runs (${dr.roll} yds) and the wedge sits down (${pw.roll} yds) on the same flat turf`);
    for (let i = 1; i < FR.length; i++)
      if (i <= 9) ok(FR[i].roll <= FR[i - 1].roll + 0.6,
        `${FR[i].club} rolls no further than ${FR[i - 1].club} (${FR[i].roll} <= ${FR[i - 1].roll})`);

    ok(page.errors.length === 0, 'ZERO console errors across part I' +
      (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
  } finally { await page.close(); }
}

/* ════════════════ PART P — THE POCO OPEN (FC-10) ════════════════
   THE PLACE IS THE COURSE.  v1's suite proved the neighborhood existed;
   this one proves the neighborhood IS the hole.  Four laws carry the part:

     · NO GOLF-COURSE FURNITURE.  Region codes 1 (fairway), 3 (fringe) and
       6 (tee box) may not appear anywhere in any poco ground index.  What
       is there instead is pavement, per-lot LAWN, park grass and SCRUFF.
     · THE BUCKET IS DRY.  Every pail on the 9 stands ≥ 3 yd clear of every
       water record on its hole — scenery pools and canal strips included —
       with a puttable ring around it.  (v1 shipped 9's bucket in the pool.)
     · NOBODY LIVES UNDER WATER.  No lot intersects water or stands below
       the local water surface + 0.3 yd, on any of the 9.
     · REACHABILITY.  From the tee lawn to the bucket lawn there is always a
       next landable grassy area within 190 yd — and a bot using the REAL
       integrator and the REAL shot planner gets round every hole in par + 3.

   Plus the kit that answers the question the whole redesign is for — street
   blade signs, the HUD location line, the flyover callouts — and v1's
   surviving invariants (never rests on a roof, bucket capture and rim-out,
   the migration, the minimap direction law).

   Everything is driven through the REAL input path or the REAL
   launchShot/tickBall pipeline.  Magnolia's parts A–I are the control. */
const pocoBudget = [];
async function pocoIn(page, { turbo = 0, fx = '' } = {}) {
  const qs = [turbo ? 'turbo=' + turbo : '', fx].filter(Boolean).join('&');
  await page.nav(`http://localhost:${HTTP}/${qs ? '?' + qs : ''}`);
  await page.connectPad(0);
  await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
  await sleep(400);
  await page.pressPad('south');
  await waitState(page, 'coursepick', 'coursepick', 9000);
  await page.pressPad('down'); await sleep(220);
  await page.pressPad('south');
  await waitState(page, 'diffpick', 'diffpick', 9000);
  await page.pressPad('south');
  await waitState(page, ['flyover', 'trans'], 'poco round start', 25000);
  await waitState(page, 'flyover', 'poco flyover', 25000);
}
// skip the flyover and land on a built, addressable hole
async function pocoAddress(page) {
  await sleep(1150);
  await page.pressPad('south');
  await waitState(page, 'address', 'poco address', 20000);
  await sleep(200);
}
async function pocoHole(page, n) {
  await page.eval(`__fc.gotoHole(${n})`);
  await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${n}`, 'poco hole ' + n, 30000);
  await pocoAddress(page);
}

async function partP() {
  console.log('\n═══ PART P: THE POCO OPEN — the place is the course ═══');

  /* ── P1: the flow ── */
  {
    const page = await openPage(CDP);
    try {
      await page.nav(`http://localhost:${HTTP}/`);
      await page.connectPad(0);
      await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
      await sleep(400);
      await page.pressPad('south');
      await waitState(page, 'coursepick', 'coursepick reachable', 9000);
      ok(true, 'POCO: coursepick is reachable from the title with the pad alone');
      const opts = await page.eval(`document.getElementById('menuOpts').textContent`);
      ok(/MAGNOLIA NATIONAL/.test(opts) && /THE POCO OPEN/.test(opts),
        `POCO: both courses offered ("${opts.replace(/\s+/g, ' ').slice(0, 70)}")`);
      ok((await page.eval(`document.getElementById('menuTitle').textContent`)) === 'CHOOSE YOUR COURSE',
        'POCO: coursepick uses the house menu type (title + mopt rows + hint)');
      ok((await page.eval(`document.querySelectorAll('#menuOpts .mopt').length`)) === 2 &&
         (await page.eval(`document.querySelectorAll('#menuOpts .mopt.sel').length`)) === 1,
        'POCO: coursepick rows are .mopt with exactly one .sel (FC menu styling)');
      await page.pressPad('east');
      await waitState(page, 'title', 'coursepick east -> title', 8000);
      ok(true, 'POCO: east backs coursepick out to the title');
      await page.pressPad('south');
      await waitState(page, 'coursepick', 'coursepick again', 8000);
      await page.pressPad('down'); await sleep(220);
      await page.pressPad('south');
      await waitState(page, 'diffpick', 'diffpick', 9000);
      ok((await page.eval('__fc.course()')) === 'poco', 'POCO: down + ✕ selects THE POCO OPEN');
      await page.pressPad('east'); await sleep(280);
      await page.connectPad(1); await sleep(320);
      await page.pressPad('south', 110, 1); await sleep(320);
      ok((await page.eval('__fc.players()')).length === 2, 'POCO: P2 joins on coursepick with ✕ on pad(1)');
      ok((await page.eval('__fc.state()')) === 'coursepick', 'POCO: the join does not advance the menu');
      await page.pressPad('south');
      await waitState(page, 'diffpick', 'diffpick (2P)', 9000);
      await page.pressPad('south');
      let sawRoundpick = false;
      for (let i = 0; i < 24; i++) {
        if ((await page.eval('__fc.state()')) === 'roundpick') sawRoundpick = true;
        await sleep(40);
      }
      await waitState(page, 'flyover', 'poco flyover', 25000);
      ok(!sawRoundpick, 'POCO: the 9 starts straight off diffpick — roundpick is skipped');
      const rnd = await page.eval('__fc.round()');
      ok(rnd.label === 'THE OPEN 9' && rnd.holes.length === 9,
        `POCO: ROUND is the 9 ("${rnd.label}", ${rnd.holes.length} holes)`);
      ok((await page.eval('__fc.courseHoleCount()')) === 9, 'POCO: the course is 9 holes');
      ok((await page.eval('__fc.build')) === 'FC-10-PLACE', 'POCO: the build tag is FC-10-PLACE');
      const b1 = await page.eval('__fc.lastBuild()');
      ok(b1 && b1.ms < 400, `POCO: hole 1 builds in ${b1 && b1.ms.toFixed(1)}ms (< 400)`);
      /* the flyover NAMES the place before you play it */
      await page.waitFor(`__fc.calloutsVisible().length > 0`, 'hole 1 flyover callout', 14000);
      const seen1 = await page.eval('__fc.calloutsVisible()');
      ok(seen1.length > 0, `POCO: the flyover floats the hole's own landmark names (${JSON.stringify(seen1)})`);
      ok(seen1.every(s => s && s.length > 2), 'POCO: every visible callout carries a real name');
      await pocoAddress(page);
      ok((await page.eval('__fc.calloutsVisible()')).length === 0,
        'POCO: the callouts clear when the flyover ends');
      const hud = await page.eval('__fc.holeInfoText()');
      ok(/HOLE 1/.test(hud) && /Soule Street Canyon/.test(hud) && /PAR 4/.test(hud),
        `POCO: the HUD banner carries the hole name ("${hud}")`);
      const bk = await page.eval('__fc.bucket()');
      ok(bk && Math.abs(bk.r - 0.45) < 1e-6, `POCO: the cup is a BUCKET (r ${bk && bk.r})`);
      ok((await page.eval('flagGrp === null')) === true, 'POCO: no flagstick — the bucket is the hole');
      ok((await page.eval('__fc.pin()')).x !== undefined, 'POCO: the pin marker still exists for the HUD/minimap');
      const par = await page.eval('[...Array(9).keys()].map(i => __fc.holeRec(i).par).reduce((a,b)=>a+b,0)');
      ok(par === 36, `POCO: par 36 over the 9 (got ${par})`);
      ok(page.errors.length === 0, 'POCO: zero console errors through the course pick' +
        (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
    } finally { await page.close(); }
  }

  /* ── P2: THE GROUND TRUTH — no golf-course furniture, anywhere ── */
  {
    const page = await openPage(CDP);
    try {
      await pocoIn(page);
      await pocoAddress(page);
      const census = [];
      for (let h = 1; h <= 9; h++) {
        if (h !== 1) await pocoHole(page, h);
        census.push(await page.eval('__fc.surfCensus(4)'));
      }
      const furniture = census.map((c, i) => ({ h: i + 1, fw: c[1] | 0, fringe: c[3] | 0, tee: c[6] | 0 }))
        .filter(c => c.fw || c.fringe || c.tee);
      ok(furniture.length === 0,
        `POCO LAW: no fairway, no fringe and no tee box anywhere on the 9 (${furniture.length} holes with furniture` +
        (furniture.length ? ': ' + JSON.stringify(furniture.slice(0, 3)) : '') + ')');
      ok(census.every(c => (c[8] | 0) > 0), 'POCO: every hole carries per-lot LAWN (surface 8)');
      ok(census.every(c => (c[9] | 0) > 0), 'POCO: every hole carries SCRUFF (surface 9) — the unclaimed ground');
      ok(census.every(c => (c[7] | 0) > 0), 'POCO: every hole carries PAVEMENT (surface 7)');
      ok(census.every(c => (c[2] | 0) > 0), 'POCO: every hole has the mown lawn the bucket stands on (surface 2)');
      ok(census.filter(c => (c[10] | 0) > 0).length >= 4,
        `POCO: park / field / canal-verge grass appears where the map has it (${census.filter(c => (c[10] | 0) > 0).length} holes)`);

      // the lie NAMES and the lie QUALITY of the new ground
      await pocoHole(page, 1);
      const names = await page.eval(`[8, 9, 10, 7].map(i => SURF_NAMES[i])`);
      ok(JSON.stringify(names) === JSON.stringify(['LAWN', 'SCRUFF', 'PARK GRASS', 'PAVEMENT']),
        `POCO: the HUD has words for the new ground (${JSON.stringify(names)})`);
      const muls = await page.eval(`({ lawn: lieMul(8), scruff: lieMul(9), park: lieMul(10), pave: lieMul(7) })`);
      ok(muls.lawn === 1 && muls.pave === 1 && muls.park === 1,
        'POCO: a watered lawn, a park and the asphalt are all CLEAN lies');
      ok(Math.abs(muls.scruff - 0.75) < 1e-9, `POCO: SCRUFF costs a quarter of the shot (lieMul ${muls.scruff})`);
      ok((await page.eval('surfMu(9) > surfMu(8) && surfMu(8) > surfMu(7)')) === true,
        'POCO: scruff grabs, a lawn rolls, asphalt releases — mu in that order');

      // THE TEE IS A DOORMAT ON A LAWN
      const mat = await page.eval('__fc.doormat()');
      ok(Array.isArray(mat) && mat.length === 3, `POCO: hole 1 has a doormat record (${JSON.stringify(mat)})`);
      const teeLie = await page.eval('__fc.players()[0].lie');
      ok(teeLie === 8 || teeLie === 10,
        `POCO: you tee off a mat lying on GRASS, not a tee box (lie ${teeLie} = ${await page.eval('SURF_NAMES[__fc.players()[0].lie]')})`);
      const matLies = [];
      for (let h = 1; h <= 9; h++) {
        if (h !== 1) await pocoHole(page, h);
        const m = await page.eval('__fc.doormat()');
        matLies.push(await page.eval(`__fc.surfAt(${m[0]}, ${m[1]})`));
      }
      ok(matLies.every(l => l === 8 || l === 10 || l === 2),
        `POCO: every mat on the 9 lies on grass (${JSON.stringify(matLies)})`);

      // PAVEMENT still releases forever (v1's law, re-measured on FC-10 ground)
      await pocoHole(page, 1);
      const st = await page.eval(`(function(){
        const S = CUR.scenery; const out = [];
        for (const s of S.streets) for (const p of s[2]) {
          const d = clDoff(CUR, p[0], p[1]);
          if (d[0] > 40 && d[0] < CUR.len - 40 && surfAt(p[0], p[1]) === 7) out.push([p[0], p[1]]);
        }
        return out;
      })()`);
      ok(st.length > 0, `POCO: hole 1's streets are real ground (${st.length} PAVEMENT samples on the corridor)`);
      await page.eval(`__fc.teleport(${st[0][0]}, ${st[0][1]})`);
      await sleep(250);
      ok((await page.eval('__fc.lie()')) === 7, 'POCO: a ball on the street gets the PAVEMENT lie');
      ok(/PAVEMENT/.test(await page.eval('__fc.shotText()')),
        `POCO: the HUD says PAVEMENT ("${(await page.eval('__fc.shotText()')).slice(0, 80)}")`);
      const roll = await page.eval(`(function(){
        /* roll ALONG the asphalt and along a LAWN, same launch speed, the
           REAL roll model.  (Rolling ACROSS a 7-yd ribbon measures the
           verge on the far side, not the street.) */
        const pv = [], lw = [];
        for (const s of CUR.scenery.streets) {
          const pts = s[2];
          for (let i = 1; i < pts.length && pv.length < 20; i++) {
            const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
            const L = Math.hypot(bx - ax, bz - az);
            if (L < 14) continue;
            const ux = (bx - ax) / L, uz = (bz - az) / L;
            const mx = ax + ux * L * 0.15, mz = az + uz * L * 0.15;
            const d = clDoff(CUR, mx, mz);
            if (d[0] < 20 || d[0] > CUR.len - 30) continue;
            if (surfAt(mx, mz) !== 7) continue;
            pv.push(__fc.rollFrom(mx, mz, ux * 9, uz * 9).moved);
          }
        }
        for (const l of __fc.lots()) {
          if (lw.length > 18) break;
          if (__fc.surfAt(l.x, l.z) !== 8) continue;
          lw.push(__fc.rollFrom(l.x, l.z, 9, 0).moved);
        }
        const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
        return { pave: +mean(pv).toFixed(2), lawn: +mean(lw).toFixed(2), np: pv.length, nl: lw.length };
      })()`);
      ok(roll.np > 3 && roll.nl > 3, `POCO: rollout sampled (${roll.np} pavement, ${roll.nl} lawn)`);
      ok(roll.pave > roll.lawn * 1.2,
        `POCO: the ball releases on asphalt — ${roll.pave} yd vs ${roll.lawn} yd on a lawn`);

      // ── THE KERB: a slow ball cannot climb out of the road ──
      const curbN = await page.eval('__fc.curbs()');
      ok(curbN > 20, `POCO: hole 1's streets carry ${curbN} kerb segments`);
      const gutter = await page.eval(`(function(){
        /* Roll a ball down the road at the kerb, the way a ball that has
           run out of pace actually arrives: mostly along, partly across.
           It must not climb out — it stalls at the lip and what is left of
           its pace runs the gutter line. */
        const out = { tried: 0, held: 0, out: 0, ran: 0, curbs: 0, far: 0 };
        for (const s of CUR.scenery.streets) {
          const pts = s[2], hw = s[0] / 2;
          for (let i = 1; i < pts.length && out.tried < 14; i++) {
            const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
            const L = Math.hypot(bx - ax, bz - az);
            if (L < 16) continue;
            const ux = (bx - ax) / L, uz = (bz - az) / L;
            const nx = uz, nz = -ux;
            for (const side of [-1, 1]) {
              const mx = ax + ux * L * 0.35, mz = az + uz * L * 0.35;
              if (surfAt(mx, mz) !== 7) continue;
              out.tried++;
              // 3 yd/s at the kerb, 3.5 down the road — under the pace that hops it
              const r = __fc.rollFrom(mx, mz, nx * side * 3 + ux * 3.5, nz * side * 3 + uz * 3.5);
              out.curbs += r.curbs;
              const dOut = (r.x - mx) * nx * side + (r.z - mz) * nz * side;
              const dAlong = (r.x - mx) * ux + (r.z - mz) * uz;
              if (dOut < hw + 0.6) out.held++; else out.out++;
              if (dAlong > 1.5) out.ran++;
              if (dAlong > 3) out.far++;
            }
          }
        }
        return out;
      })()`);
      ok(gutter.tried >= 4, `POCO: the kerb is testable on hole 1 (${gutter.tried} rolls at the lip)`);
      ok(gutter.curbs > 0, `POCO KERB: a slow ball really meets the lip (${gutter.curbs} contacts)`);
      ok(gutter.out === 0,
        `POCO KERB: a ball rolling at 3 yd/s NEVER climbs out of the road (${gutter.out}/${gutter.tried} escaped)`);
      ok(gutter.ran >= Math.ceil(gutter.tried * 0.6),
        `POCO KERB: what is left of its pace runs the gutter line (${gutter.ran}/${gutter.tried} ran, ${gutter.far} over 3 yd)`);
      const hop = await page.eval(`(function(){
        // …and pace still hops it: the same roll at 14 yd/s gets out
        let outCount = 0, tried = 0;
        for (const s of CUR.scenery.streets) {
          const pts = s[2], hw = s[0] / 2;
          for (let i = 1; i < pts.length && tried < 8; i++) {
            const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
            const L = Math.hypot(bx - ax, bz - az);
            if (L < 16) continue;
            const ux = (bx - ax) / L, uz = (bz - az) / L, nx = uz, nz = -ux;
            const mx = ax + ux * L * 0.5, mz = az + uz * L * 0.5;
            if (surfAt(mx, mz) !== 7) continue;
            tried++;
            const r = __fc.rollFrom(mx, mz, nx * 14, nz * 14);
            if ((r.x - mx) * nx + (r.z - mz) * nz > hw + 1.5) outCount++;
          }
        }
        return { outCount, tried };
      })()`);
      ok(hop.outCount > 0,
        `POCO KERB: pace still hops the lip — ${hop.outCount}/${hop.tried} rolls at 14 yd/s got out`);

      // ── THE FENCE: what makes a lawn hop a CARRY ──
      const fences = await page.eval('__fc.fences()');
      ok(fences.length > 20, `POCO: hole 1 carries ${fences.length} back-yard fence runs`);
      const fence = await page.eval(`(function(){
        /* Roll a ball AT a fence from 7 yd away.  It must stop on the side
           it came from — no rolling through, no rolling under — and the
           woody thunk must fire.  Then hit the SAME line with a lofted club
           and watch it carry.  That is the whole point of the fence. */
        const heard = { n: 0 };
        const real = SFX.fence;
        SFX.fence = function (v) { heard.n++; return real.call(SFX, v); };
        let tried = 0, blocked = 0, crossed = 0, carried = 0;
        for (const f of __fc.fences()) {
          if (tried >= 10) break;
          if (Math.hypot(f.bx - f.ax, f.bz - f.az) < 6) continue;
          const mx = (f.ax + f.bx) / 2, mz = (f.az + f.bz) / 2;
          const L = Math.hypot(f.bx - f.ax, f.bz - f.az) || 1;
          const ux = (f.bx - f.ax) / L, uz = (f.bz - f.az) / L;
          const nx = uz, nz = -ux;
          const sx = mx + nx * 7, sz = mz + nz * 7;
          if (__fc.surfAt(sx, sz) === 5 || __fc.inHouse(sx, __fc.groundH(sx, sz) + 0.2, sz) >= 0) continue;
          const r = __fc.rollFrom(sx, sz, -nx * 11, -nz * 11);
          // only a roll that got as far as the pickets says anything about them
          const reach = ((sx - r.x) * nx + (sz - r.z) * nz);
          if (reach < 6.4) continue;
          tried++;
          const sideBefore = 1, sideAfter = ((r.x - mx) * nx + (r.z - mz) * nz) > 0 ? 1 : -1;
          if (r.fences > 0) blocked++;
          if (sideAfter !== sideBefore) crossed++;
          // and the carry: a wedge from the same spot flies it
          __fc.teleport(sx, sz);
          const shot = __fc.seededShot(Math.atan2(-nx, -nz), 10, 0.5);
          const over = ((shot.rest[0] - mx) * nx + (shot.rest[2] - mz) * nz) < 0;
          if (over) carried++;
        }
        SFX.fence = real;
        return { tried, blocked, crossed, carried, heard: heard.n };
      })()`);
      ok(fence.tried >= 4, `POCO: the fences are testable on hole 1 (${fence.tried} rolls into one)`);
      ok(fence.tried > 0 && fence.blocked >= Math.ceil(fence.tried * 0.8),
        `POCO FENCE: a rolled ball that reaches the pickets is stopped by them (${fence.blocked}/${fence.tried})`);
      ok(fence.crossed === 0,
        `POCO FENCE: a rolling ball NEVER ends up on the far side (${fence.crossed}/${fence.tried} crossed)`);
      ok(fence.heard > 0, `POCO FENCE: the woody thunk fires on contact (${fence.heard} SFX.fence calls)`);
      ok(fence.carried > 0,
        `POCO FENCE: …and a lofted club carries it — that is the CARRY (${fence.carried}/${fence.tried})`);
      ok((await page.eval(`typeof SFX.curb === 'function' && typeof SFX.fence === 'function'`)) === true,
        'POCO: the kerb tick and the fence thunk are real layered SFX, not beeps');

      // ── HOUSES ARE BUMPERS, AND THE BALL NEVER RESTS ON A ROOF ──
      const houses = await page.eval('__fc.houses()');
      ok(houses.length > 20, `POCO: hole 1 carries ${houses.length} solid houses`);
      const shots = await page.eval(`(function(){
        const hs = __fc.houses();
        const w = __fc.clWorld(70, 0);
        __fc.teleport(w[0], w[1]);
        const out = [];
        for (let k = 0; k < 40; k++) {
          const h = hs[(k * 7) % hs.length];
          const ang = Math.atan2(h.x - w[0], h.z - w[1]);
          const dist = Math.hypot(h.x - w[0], h.z - w[1]);
          let club = CLUBS.length - 1;
          for (let ci = CLUBS.length - 1; ci >= 0; ci--) { if (CLUBS[ci].carry >= dist) { club = ci; break; } }
          const pow = Math.max(0.3, Math.min(1, dist / CLUBS[club].carry)) * (0.93 + 0.0035 * (k % 20));
          out.push(__fc.seededShot(ang, club, Math.min(1, pow)));
        }
        return out;
      })()`);
      ok(shots.length === 40, 'POCO: 40 seeded shots fired into the houses on 1');
      const hit = shots.filter(s => s.houseHits > 0).length;
      ok(hit >= 8, `POCO: the houses are solid — ${hit}/40 seeded shots bounced off one`);
      ok(shots.filter(s => s.onRoof >= 0).length === 0,
        `POCO INVARIANT: no shot EVER rests on a roof (${shots.filter(s => s.onRoof >= 0).length}/40 violations)`);
      ok(shots.filter(s => s.inHouse >= 0).length === 0,
        `POCO INVARIANT: no shot ever rests inside a house (${shots.filter(s => s.inHouse >= 0).length}/40 violations)`);
      ok(shots.every(s => s.ev === 'stopped' || s.ev === 'water' || s.ev === 'holed'),
        'POCO: every one of the 40 shots resolved to a real end state');
      ok(shots.filter(s => s.roofHits > 0).length > 0,
        `POCO: ${shots.filter(s => s.roofHits > 0).length}/40 shots landed on a roof and shed off it`);

      // ── TRAMPOLINES: at most one re-bounce per flight ──
      await page.eval('__fc.setWind(0, 0)');
      const tr = await page.eval(`(function(){
        const ts = __fc.tramps();
        if (!ts.length) return { n: 0, hits: 0, worst: 0, tried: 0 };
        let hits = 0, worst = 0, tried = 0;
        for (const t of ts) {
          for (const ang of [0, 1.047, 2.094, 3.142, 4.189, 5.236]) {
            for (const back of [80, 115, 150]) {
              const fx = t.x - Math.sin(ang) * back, fz = t.z - Math.cos(ang) * back;
              const sf = __fc.surfAt(fx, fz);
              if (sf === 5 || sf === 4) continue;
              if (__fc.inHouse(fx, __fc.groundH(fx, fz) + 0.1, fz) >= 0) continue;
              __fc.teleport(fx, fz);
              const dist = Math.hypot(t.x - fx, t.z - fz);
              let club = CLUBS.length - 1;
              for (let ci = CLUBS.length - 1; ci >= 0; ci--) { if (CLUBS[ci].carry >= dist) { club = ci; break; } }
              const mul = lieMul(__fc.lie());
              const pow = Math.max(0.25, Math.min(1, dist / (CLUBS[club].carry * mul)));
              const r = __fc.seededShot(ang, club, pow);
              tried++;
              if (r.trampHits > 0) hits++;
              if (r.trampHits > worst) worst = r.trampHits;
            }
          }
        }
        return { n: ts.length, hits, worst, tried };
      })()`);
      ok(tr.n > 0, `POCO: hole 1 has ${tr.n} back-yard trampolines`);
      ok(tr.hits > 0, `POCO: real shots bounced off a trampoline (${tr.hits} of ${tr.tried})`);
      ok(tr.worst <= 1, `POCO: a trampoline bounces a flight at most ONCE (worst ${tr.worst})`);

      ok(page.errors.length === 0, 'POCO: zero console errors through the ground-truth tests' +
        (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
    } finally { await page.close(); }
  }

  /* ── P3: WATER — the dry bucket, the drowned lots, and the hazards ── */
  {
    const page = await openPage(CDP);
    try {
      await pocoIn(page);
      await pocoAddress(page);
      const dry = [], drowned = [];
      for (let h = 1; h <= 9; h++) {
        if (h !== 1) await pocoHole(page, h);
        dry.push(await page.eval('__fc.bucketDry()'));
        drowned.push((await page.eval('__fc.underwaterLots()')).length);
      }
      const wet = dry.filter(d => d.pinWater < 3);
      ok(wet.length === 0,
        `POCO LAW (v1 bug): the bucket is DRY on all 9 — ≥3 yd from every water record ` +
        `(worst ${Math.min(...dry.map(d => d.pinWater)).toFixed(1)} yd, ${wet.length} wet)`);
      ok(dry.every(d => d.wetRing === 0),
        `POCO LAW: the whole puttable ring around the pail is dry too (${dry.filter(d => d.wetRing).length} wet rings)`);
      ok(dry.every(d => d.puttable),
        `POCO LAW: the pail stands on its own mown lawn and putts from every side ` +
        `(${dry.filter(d => !d.puttable).map(d => d.hole).join(',') || 'all 9 good'})`);
      ok(drowned.every(n => n === 0),
        `POCO LAW (v1 bug): not one lot on the 9 intersects water or stands under it ` +
        `(${drowned.reduce((a, b) => a + b, 0)} violations across ${JSON.stringify(drowned)})`);

      // 6 — the canal strip
      await pocoHole(page, 6);
      const rec6 = await page.eval('__fc.holeRec()');
      const strip = rec6.water.find(w => w.t === 'strip');
      ok(!!strip, `POCO 6: the Contra Costa Canal is a 'strip' water record (${JSON.stringify(rec6.water.map(w => w.t))})`);
      const stripWet = await page.eval(`(function(){
        const w = CUR.water.find(q => q.t === 'strip');
        let wet = 0, dry = 0;
        for (let d = w.d0 + 6; d < w.d1 - 6; d += 8) {
          const p = __fc.clWorld(d, w.off);
          if (__fc.surfAt(p[0], p[1]) === 5) wet++; else dry++;
        }
        return { wet, dry };
      })()`);
      ok(stripWet.wet > 8 && stripWet.dry <= 1,
        `POCO 6: the strip is WATER down its whole run (${stripWet.wet} wet stations, ${stripWet.dry} dry)`);
      const fall = await page.eval(`(function(){
        /* FC-10: A CANAL FALLS WITH THE LAND.  v1 levelled the whole strip
           at its lowest station, which stood the surface above the ground at
           the low end and drowned the houses there. */
        const w = WATERS.find(q => q.t === 'strip');
        const lv = [];
        for (let k = 0; k <= 6; k++) lv.push(w.lvl(w.d0 + (w.d1 - w.d0) * k / 6));
        return { spread: +(Math.max(...lv) - Math.min(...lv)).toFixed(2) };
      })()`);
      ok(fall.spread > 0.05, `POCO 6: the canal surface falls with its towpath (${fall.spread} yd over the run)`);
      ok(strip.off > 0, `POCO 6: the canal runs down the LEFT of play (off +${strip.off})`);
      const dropped = await page.eval(`(function(){
        const w = CUR.water.find(q => q.t === 'strip');
        const d = (w.d0 + w.d1) / 2;
        const p = __fc.clWorld(d, w.off - w.w / 2 - 7);
        return [p[0], p[1]];
      })()`);
      await page.eval(`__fc.teleport(${dropped[0]}, ${dropped[1]})`);
      await sleep(250);
      for (let i = 0; i < 14 && (await page.eval('__fc.club()')) !== 'PT'; i++) { await page.pressPad('r1'); await sleep(110); }
      ok((await page.eval('__fc.club()')) === 'PT', 'POCO 6: the putter is reachable from the canal bank');
      await page.eval(`(function(){ const w = CUR.water.find(q => q.t === 'strip');
        const p = activeP(); const c = __fc.clWorld((w.d0 + w.d1) / 2, w.off);
        SHOT.aimAng = Math.atan2(c[0] - p.ball.x, c[1] - p.ball.z); SHOT.arcDirty = true; })()`);
      await sleep(150);
      const str0 = (await page.eval('__fc.players()'))[0].strokes;
      await lockMeterAt(page, 96);
      await waitShotDone(page);
      const str1 = (await page.eval('__fc.players()'))[0].strokes;
      ok(str1 === str0 + 2, `POCO 6: a ball in the canal costs the shot AND the penalty (${str0} -> ${str1})`);
      ok((await page.eval('__fc.lie()')) !== 5, 'POCO 6: the drop puts the ball back on dry land');

      // 7 — the carry
      await pocoHole(page, 7);
      const rec7 = await page.eval('__fc.holeRec()');
      ok(rec7.water.some(w => w.t === 'creek'), 'POCO 7: there is water between the tee and the green');
      const carry = await page.eval(`(function(){
        const w = CUR.water.find(q => q.t === 'creek');
        const p = __fc.clWorld(w.d, 0);
        return { d: w.d, wet: __fc.surfAt(p[0], p[1]) === 5 };
      })()`);
      ok(carry.wet && carry.d > 10 && carry.d < 140,
        `POCO 7: the carry sits across the line of play at d ${carry.d.toFixed(0)}`);
      const s70 = (await page.eval('__fc.players()'))[0].strokes;
      await page.eval(`(function(){ const w = CUR.water.find(q => q.t === 'creek');
        const t = __fc.clWorld(Math.max(6, w.d - 20), 0); __fc.teleport(t[0], t[1]); })()`);
      await sleep(250);
      for (let i = 0; i < 14 && (await page.eval('__fc.club()')) !== 'PT'; i++) { await page.pressPad('r1'); await sleep(110); }
      await page.eval(`(function(){ const w = CUR.water.find(q => q.t === 'creek');
        const p = activeP(); const c = __fc.clWorld(w.d, 0);
        SHOT.aimAng = Math.atan2(c[0] - p.ball.x, c[1] - p.ball.z); SHOT.arcDirty = true; })()`);
      await sleep(150);
      await lockMeterAt(page, 96);
      await waitShotDone(page);
      const s71 = (await page.eval('__fc.players()'))[0].strokes;
      ok(s71 >= s70 + 2, `POCO 7: a ball left short is in the water — shot + penalty (${s70} -> ${s71})`);

      // 8 — the civic ponds
      await pocoHole(page, 8);
      const rec8 = await page.eval('__fc.holeRec()');
      ok(rec8.water.filter(w => w.t === 'pond').length >= 2,
        `POCO 8: the civic duck ponds are mapped (${rec8.water.length} water records)`);
      const wetCount = await page.eval(`(function(){
        let wet = 0;
        for (const w of CUR.water) {
          if (w.t !== 'pond') continue;
          const p = __fc.clWorld(w.d, w.off);
          if (__fc.surfAt(p[0], p[1]) === 5) wet++;
        }
        return wet;
      })()`);
      ok(wetCount >= 2, `POCO 8: both ponds really hold water (${wetCount})`);
      ok(page.errors.length === 0, 'POCO: zero console errors through the water tests' +
        (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
    } finally { await page.close(); }
  }

  /* ── P4: THE REACHABILITY LAW — the chain, and a bot that plays it ── */
  {
    const page = await openPage(CDP);
    try {
      await pocoIn(page);
      await pocoAddress(page);
      const chains = [], bots = [];
      for (let h = 1; h <= 9; h++) {
        if (h !== 1) await pocoHole(page, h);
        chains.push(await page.eval('__fc.grassChain(190)'));
        bots.push(await page.eval('__fc.botPlay()'));
      }
      ok(chains.every(c => c.patches >= 8),
        `POCO: every hole offers landable grass patches ≥ 8 yd across (worst ${Math.min(...chains.map(c => c.patches))})`);
      ok(chains.every(c => c.ok),
        `POCO REACHABILITY LAW: tee lawn -> bucket lawn, never a hop over 190 yd ` +
        `(worst gap ${Math.max(...chains.map(c => c.gap)).toFixed(0)} yd on hole ` +
        `${chains.reduce((a, b) => (b.gap > a.gap ? b : a)).hole})`);
      for (const c of chains) {
        ok(c.ok && c.gap > 0,
          `POCO ${c.hole} chain: ${c.patches} landable patches, longest hop ${c.gap} yd`);
      }
      ok(bots.every(b => b.holed),
        `POCO BOT: the bot holes out on every one of the 9 (${bots.filter(b => !b.holed).length} unfinished)`);
      ok(bots.every(b => b.vsPar <= 3),
        `POCO BOT: …in par + 3 or better, every hole (worst ${Math.max(...bots.map(b => b.vsPar))} over on hole ` +
        `${bots.reduce((a, b) => (b.vsPar > a.vsPar ? b : a)).hole})`);
      const tot = bots.reduce((a, b) => a + b.strokes, 0);
      ok(tot <= 36 + 9,
        `POCO BOT: the round goes round — ${tot} strokes for par 36 (${tot - 36 >= 0 ? '+' : ''}${tot - 36})`);
      console.log('  POCO bot card: ' + bots.map(b => `${b.hole}:${b.strokes}`).join(' '));
      ok(page.errors.length === 0, 'POCO: zero console errors through the reachability tests' +
        (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
    } finally { await page.close(); }
  }

  /* ── P5: THE TELL-WHERE-I-AM KIT ── */
  {
    const page = await openPage(CDP);
    try {
      await pocoIn(page);
      await pocoAddress(page);
      // street blade signs, at real intersections, with real names
      const signInfo = [];
      for (let h = 1; h <= 9; h++) {
        if (h !== 1) await pocoHole(page, h);
        const rec = await page.eval('__fc.holeRec()');
        const named = await page.eval(`(function(){
          // does this hole HAVE a named street anywhere near the line of play?
          let n = 0;
          for (const s of CUR.scenery.streets) {
            if (s[3] === undefined || s[3] < 0) continue;
            for (const p of s[2]) {
              const d = clDoff(CUR, p[0], p[1]);
              if (d[0] > -10 && d[0] < CUR.len + 30 && Math.abs(d[1]) < 70) { n++; break; }
            }
          }
          return n;
        })()`);
        signInfo.push({ hole: h, named, signs: await page.eval('__fc.signs()'),
          mesh: await page.eval('__fc.signMesh()'), calls: await page.eval('__fc.callouts()'),
          places: await page.eval('__fc.places()'), name: rec.name });
      }
      const shouldSign = signInfo.filter(s => s.named > 0);
      ok(shouldSign.length >= 7, `POCO: ${shouldSign.length} of the 9 have a named street in the corridor`);
      ok(shouldSign.every(s => s.signs.length >= 1),
        `POCO SIGNS: every hole whose corridor carries a named street has a blade up ` +
        `(${shouldSign.filter(s => !s.signs.length).map(s => s.hole).join(',') || 'all of them'})`);
      ok(signInfo.every(s => s.signs.every(b => b.a && b.a === b.a.toUpperCase())),
        'POCO SIGNS: every blade reads a REAL street name, in sign case');
      ok(signInfo.some(s => s.signs.some(b => b.b)),
        'POCO SIGNS: an intersection puts BOTH names up, on one post');
      ok(signInfo.filter(s => s.mesh).every(s => s.mesh.tex && s.mesh.tris >= 2),
        'POCO SIGNS: the blades are one merged mesh on the shared baked text atlas');
      const totalSigns = signInfo.reduce((a, s) => a + s.signs.length, 0);
      ok(totalSigns >= 14, `POCO SIGNS: ${totalSigns} blades across the 9`);
      // the flyover callouts
      ok(signInfo.every(s => s.calls.length >= 2),
        `POCO CALLOUTS: every hole names 2-3 landmarks in its flyover ` +
        `(worst ${Math.min(...signInfo.map(s => s.calls.length))})`);
      ok(signInfo.every(s => s.calls.length <= 3), 'POCO CALLOUTS: never more than three');
      console.log('  POCO callouts: ' + signInfo.map(s => `${s.hole}:${s.calls.join('/')}`).join('  '));

      // THE HUD LOCATION LINE — on the two holes POCO.md names
      await pocoHole(page, 1);
      const soule = await page.eval(`(function(){
        // the ball goes onto Soule Avenue itself, and the HUD says where it is
        for (const s of CUR.scenery.streets) {
          if (CUR.scenery.names[s[3]] !== 'SOULE AVE') continue;
          for (const p of s[2]) {
            const d = clDoff(CUR, p[0], p[1]);
            if (d[0] > 30 && d[0] < CUR.len - 40) return [p[0], p[1]];
          }
        }
        return null;
      })()`);
      ok(!!soule, 'POCO 1: Soule Avenue really runs down the hole');
      await page.eval(`__fc.locClear && __fc.locClear()`);
      await page.eval(`__fc.teleport(${soule[0]}, ${soule[1]})`);
      await sleep(700);
      ok((await page.eval('__fc.locText()')) === 'SOULE AVE',
        `POCO HUD: the location line names the street under the ball ("${await page.eval('__fc.locText()')}")`);
      ok((await page.eval('__fc.locVisible()')) === true, 'POCO HUD: …and it is actually on screen');
      const fires0 = await page.eval('__fc.locFires()');
      await sleep(600);
      ok((await page.eval('__fc.locFires()')) === fires0,
        'POCO HUD: it is rate-limited — the same place never says itself twice');

      await pocoHole(page, 3);
      const creek = await page.eval(`(function(){
        const w = CUR.water.find(q => q.t === 'creek');
        const p = __fc.clWorld(w.d, 2);
        return [p[0], p[1], w.name];
      })()`);
      ok(creek[2] === 'MURDERERS CREEK', `POCO 3: the creek carries its real name ("${creek[2]}")`);
      await page.eval(`__fc.teleport(${creek[0]}, ${creek[1]})`);
      await sleep(700);
      ok((await page.eval('__fc.locText()')) === 'MURDERERS CREEK',
        `POCO HUD: the creek names itself as the ball crosses it ("${await page.eval('__fc.locText()')}")`);
      const landmarks = signInfo.filter(s => s.places.length > 0);
      ok(landmarks.length >= 4,
        `POCO HUD: ${landmarks.length} holes name a public landmark under the ball (schools, church, city hall, parks)`);
      ok(signInfo.every(s => s.places.every(p => !/\d/.test(p))),
        'PRIVACY LAW: no address, no house number, ever appears in a place name');

      // the minimap carries the strategic layer
      await pocoHole(page, 1);
      const mapInfo = await page.eval(`(function(){
        const H = CUR;
        return { lots: H.scenery.lots.length, streets: H.scenery.streets.length,
          fw: H.fw, draws: __fc.mapDraws() };
      })()`);
      ok(mapInfo.fw === 0, 'POCO MINIMAP: there is no fairway ribbon to draw — fw is 0');
      ok(mapInfo.lots > 10 && mapInfo.streets > 0,
        `POCO MINIMAP: the lawns (${mapInfo.lots}) and the street grid (${mapInfo.streets}) are the map`);
      ok(page.errors.length === 0, 'POCO: zero console errors through the tell-where-I-am tests' +
        (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
    } finally { await page.close(); }
  }

  /* ── P6: the bucket, the direction laws, pause, and the budgets ── */
  {
    const page = await openPage(CDP);
    try {
      await pocoIn(page);
      await pocoAddress(page);
      // the minimap direction law, on the neighborhood's own records
      for (const hn of [1, 3, 6]) {
        if (hn !== 1) await pocoHole(page, hn);
        else { const w = await page.eval('__fc.clWorld(10, 0)'); await page.eval(`__fc.teleport(${w[0]}, ${w[1]})`); await sleep(200); }
        await page.eval('__fc.aimBy(0); MAPS.dirty = true; redrawMap();');
        await sleep(120);
        const m0 = (await page.eval('__fc.mapMarker()'))[0];
        await page.axisPad(0, 1); await sleep(520); await page.axisPad(0, 0); await sleep(200);
        const m1 = (await page.eval('__fc.mapMarker()'))[0];
        await page.axisPad(0, -1); await sleep(900); await page.axisPad(0, 0); await sleep(200);
        const m2 = (await page.eval('__fc.mapMarker()'))[0];
        ok(m1 > m0 + 1.5, `POCO hole ${hn} DIRECTION LAW: aim right moves the map marker RIGHT (${m0.toFixed(1)} -> ${m1.toFixed(1)})`);
        ok(m2 < m1 - 1.5, `POCO hole ${hn} DIRECTION LAW: aim left moves it LEFT (${m1.toFixed(1)} -> ${m2.toFixed(1)})`);
      }
      const sx = () => page.eval(`(() => { const e = __fc.arcEnd();
        const v = new THREE.Vector3(e[0], groundH(e[0], e[1]), e[1]); v.project(camera); return v.x; })()`);
      const s0 = await sx();
      await page.axisPad(0, 1); await sleep(520); await page.axisPad(0, 0); await sleep(220);
      const s1 = await sx();
      ok(s1 > s0, `POCO SCREEN-SPACE LAW: aim right puts the arc right of where it was (${s0.toFixed(3)} -> ${s1.toFixed(3)})`);
      await page.axisPad(0, -1); await sleep(900); await page.axisPad(0, 0); await sleep(220);
      const s2 = await sx();
      ok(s2 < s1, `POCO SCREEN-SPACE LAW: aim left puts it left (${s1.toFixed(3)} -> ${s2.toFixed(3)})`);

      // the flyover still flies the neighborhood comfortably
      await page.eval('__fc.gotoHole(6)');
      await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===6`, 'poco 6 flyover', 30000);
      await page.waitFor(`(__fc.flyRec()||{n:0}).n > 60`, 'poco flyover sampled', 20000);
      const fr = await page.eval('__fc.flyRec()');
      ok(fr.minPitch > -65, `POCO 6 flyover: never pitches below -65 deg (min ${fr.minPitch.toFixed(1)})`);
      ok(fr.mono === true, 'POCO 6 flyover: forward progress never reverses');
      ok(fr.minClear > 2, `POCO 6 flyover: clears the neighborhood it flies (min ${fr.minClear.toFixed(1)} yd)`);
      await pocoAddress(page);

      const slow = await page.eval('__fc.puttAtCup(3, 1.6)');
      ok(slow.ev === 'holed' && (slow.rims || 0) === 0,
        `POCO BUCKET: a ball arriving under 6 yd/s is captured (ev ${slow.ev}, rims ${slow.rims})`);
      const fast = await page.eval('__fc.puttAtCup(13, 1.6)');
      ok((fast.rims || 0) >= 1,
        `POCO BUCKET: a ball arriving hot CLANKS off the rim (rims ${fast.rims}, ev ${fast.ev})`);

      await page.pressPad('start'); await sleep(320);
      ok((await page.eval('__fc.state()')) === 'pause', 'POCO: START pauses the round');
      await page.pressPad('start'); await sleep(320);
      ok((await page.eval('__fc.state()')) === 'address', 'POCO: START resumes it');

      // ── the per-hole budget sweep (build ms + draw calls + tris) ──
      for (let h = 1; h <= 9; h++) {
        await pocoHole(page, h);
        const b = await page.eval('__fc.lastBuild()');
        const i = await page.eval('__fc.info()');
        const r = await page.eval('__fc.holeRec()');
        pocoBudget.push({ hole: h, name: r.name, par: r.par, yds: r.yds,
          ms: +b.ms.toFixed(1), calls: i.calls, tris: i.tris,
          houses: r.scenery.houses, lots: r.scenery.lots, fences: r.scenery.fences,
          trees: r.scenery.trees, signs: r.scenery.signs });
      }
      const worstMs = Math.max(...pocoBudget.map(b => b.ms));
      const worstTris = Math.max(...pocoBudget.map(b => b.tris));
      const worstCalls = Math.max(...pocoBudget.map(b => b.calls));
      ok(worstMs < 400, `POCO: every hole builds under 400ms (worst ${worstMs}ms)`);
      ok(worstTris <= 60000, `POCO: every hole stays under 60k tris (worst ${worstTris})`);
      ok(worstCalls <= 40, `POCO: draw calls never exceed Magnolia's own 40 (worst ${worstCalls})`);
      ok(pocoBudget.every(b => b.houses > 0 && b.trees > 0 && b.lots > 0),
        'POCO: every hole in the 9 carries houses, trees AND lawns');
      ok(pocoBudget.every(b => b.fences > 0), 'POCO: every hole carries back-yard fences');

      ok((await page.eval(`__fc.course('magnolia')`)) === 'magnolia', 'POCO: __fc.course() swaps back to Magnolia');
      ok((await page.eval('__fc.courseHoleCount()')) === 18, 'POCO: Magnolia is 18 holes again');
      ok((await page.eval(`__fc.course('poco')`)) === 'poco', 'POCO: __fc.course() swaps to the 9');
      const sw = await page.eval('__fc.sweepBuilds()');
      ok(sw.length === 9 && sw.every(s => s.ms < 400),
        `POCO: sweepBuilds walks the 9 (worst ${Math.max(...sw.map(s => s.ms))}ms)`);
      ok(page.errors.length === 0, 'POCO: zero console errors through the bucket/budget tests' +
        (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
    } finally { await page.close(); }
  }

  /* ── P7: a full 9-hole round, the card, the best, and the migration ── */
  {
    const page = await openPage(CDP);
    try {
      await page.nav(`http://localhost:${HTTP}/`);
      await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title boot');
      await page.eval(`localStorage.setItem('fairwayclassic_best', JSON.stringify({ amateur: -2, pro: 4 }))`);
      await page.nav(`http://localhost:${HTTP}/`);
      await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title reboot');
      const mig = await page.eval('loadBest()');
      ok(mig.magnolia.amateur === -2 && mig.magnolia.pro === 4,
        `POCO MIGRATION: the v1 flat best lands under magnolia (${JSON.stringify(mig.magnolia)})`);
      ok(mig.poco && Object.keys(mig.poco).length === 0,
        'POCO MIGRATION: the poco slot starts empty');
      const tb = await page.eval(`document.getElementById('titleBest').textContent`);
      ok(/MAGNOLIA \(AM\)/.test(tb) && !/POCO/.test(tb),
        `POCO MIGRATION: the title shows the migrated Magnolia best only ("${tb}")`);

      await pocoIn(page, { turbo: 6 });
      let ended = false, cards = 0;
      const nextBeat = async () => {
        for (let w = 0; w < 140; w++) {
          const s = await page.eval('__fc.state()');
          if (s === 'replay') { await sleep(500); await page.pressPad('south'); }
          else if (s === 'address' && !(await page.eval('__fc.flightOn()'))) return 'address';
          else if (s === 'card' || s === 'roundend') return s;
          await sleep(220);
        }
        throw new Error('poco round stuck at ' + (await page.eval('__fc.state()')));
      };
      for (let h = 0; h < 9 && !ended; h++) {
        await waitState(page, 'flyover', `poco hole ${h + 1} flyover`, 30000);
        await sleep(400);
        await page.pressPad('south');
        for (;;) {
          const s = await nextBeat();
          if (s === 'roundend') { ended = true; break; }
          if (s === 'card') {
            cards++;
            if (cards === 1) {
              await page.connectPad(1); await sleep(320);
              await page.pressPad('start', 110, 1); await sleep(320);
              ok((await page.eval('__fc.players()')).length === 2,
                'POCO: P2 joins mid-round on the scorecard via START');
            }
            await page.pressPad('south');
            break;
          }
          const pin = await page.eval('__fc.pin()');
          await page.eval(`__fc.teleport(${pin.x - 0.85}, ${pin.z - 0.75})`);
          await sleep(150);
          await page.pressPad('south'); await sleep(150);
          await page.pressPad('south');
        }
      }
      await waitState(page, 'roundend', 'poco round end', 30000);
      ok(true, 'POCO: the full 9 plays through to the final card');
      ok(cards === 9, `POCO: a scorecard after every hole of the 9 (${cards})`);
      const title = await page.eval(`document.getElementById('cardTitle').textContent`);
      ok(/THE POCO OPEN/.test(title) && /THE OPEN 9/.test(title),
        `POCO: the final card is THE POCO OPEN's ("${title}")`);
      const parRow = await page.eval(`document.querySelectorAll('#cardTable tr')[1].lastElementChild.textContent`);
      ok(parRow === '36', `POCO: the card totals par 36 (got ${parRow})`);
      await page.screenshot(path.join(SHOTS, 'poco-roundend.png'));
      const best = await page.eval('loadBest()');
      ok(best.poco.amateur !== undefined, `POCO: the round banks a POCO best (${JSON.stringify(best.poco)})`);
      ok(best.magnolia.amateur === -2 && best.magnolia.pro === 4,
        'POCO: banking a POCO best leaves the Magnolia bests alone');
      await page.pressPad('south');
      await waitState(page, 'title', 'poco back to title', 20000);
      ok((await page.eval('__fc.course()')) === 'magnolia', 'POCO: the title goes home to Magnolia');
      ok((await page.eval('__fc.hole()')) === 12, 'POCO: the title beauty shot is Magnolia 12 again');
      const tb2 = await page.eval(`document.getElementById('titleBest').textContent`);
      ok(/MAGNOLIA \(AM\)/.test(tb2) && /POCO \(AM\)/.test(tb2),
        `POCO: the title carries both courses' bests ("${tb2}")`);
      ok(page.errors.length === 0, 'POCO: zero console errors across the full round' +
        (page.errors.length ? ' — ' + page.errors.slice(0, 3).join(' | ') : ''));
    } finally { await page.close(); }
  }
}

/* `node --experimental-websocket test/harness.mjs [A|B|…|I|P]` runs one part
   while iterating; no argument runs the whole standard (the default). */
const ONLY = (process.argv[2] || '').toUpperCase();
const run = (letter, fn) => (!ONLY || ONLY === letter ? fn() : Promise.resolve());
try {
  await run('A', partA);
  await run('B', partB);
  await run('C', partC);
  await run('D', partD);
  await run('E', partE);
  await run('F', partF);
  await run('G', partG);
  await run('H', partH);
  await run('I', partI);
  await run('P', partP);
} catch (e) {
  console.error('\nHARNESS THREW:', e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await srv.close();
}
const good = T.summary();
if (globalThis.__fc7elev) {
  console.log('\nFC-7 per-hole elevation (yds, tee = 0):');
  console.log('  ##  name              par  yds    tee   green     low    high  relief   cant  crown');
  for (const r of globalThis.__fc7elev) {
    console.log(`  ${String(r.hole).padStart(2)}  ${r.name.padEnd(16)}  ${r.par}   ${String(r.yds).padStart(3)}` +
      `  ${String(r.tee).padStart(5)}  ${String(r.green).padStart(6)}  ${String(r.lo).padStart(6)}  ${String(r.hi).padStart(6)}` +
      `  ${String(r.relief).padStart(6)}  ${String(r.cant).padStart(5)}  ${r.crown}`);
  }
}
if (globalThis.__fc7roll) {
  const w = globalThis.__fc7roll.reduce((a, b) => (b.worst > a.worst ? b : a));
  console.log(`\nFC-7 roll termination: worst ${w.worst}s (hole ${w.hole}, ${w.where}); hard-floor hits ` +
    globalThis.__fc7roll.reduce((a, b) => a + b.capped, 0));
}
if (globalThis.__fc8und) {
  console.log('\nFC-8 meso layer per hole (relief = peak-to-trough yds, dev = RMS yds added vs FC-7):');
  console.log('  ##  kind    wl  relief    dev   peak    gTyp    gMax  hollows');
  for (const u of globalThis.__fc8und) {
    console.log(`  ${String(u.hole).padStart(2)}  ${u.kind.padEnd(6)}  ${String(u.wl).padStart(2)}` +
      `  ${String(u.relief).padStart(5)}  ${String(u.dev).padStart(5)}  ${String(u.peak).padStart(5)}` +
      `  ${String(u.gTyp).padStart(6)}  ${String(u.gMax).padStart(6)}  ${String(u.hol).padStart(5)}`);
  }
}
if (globalThis.__fc8flat) {
  const f = globalThis.__fc8flat;
  console.log('\nFC-8 rollout, flat ground: ' + f.map(r => `${r.club} ${r.roll}`).join(' · '));
}
if (globalThis.__fc8roll10 && globalThis.__fc8roll18) {
  const d = globalThis.__fc8roll10.filter(r => r.slope < -0.02);
  const u = globalThis.__fc8roll18.filter(r => r.slope >= 0.10);
  console.log(`FC-8 driver rollout: 10 downslope ${Math.max(...d.map(r => r.roll))} yds · ` +
    `18 into the climb ${Math.max(...u.map(r => r.roll))} yds · flat ${globalThis.__fc8flat ? globalThis.__fc8flat[0].roll : '?'} yds`);
}
if (globalThis.__fc8pins) {
  const P = globalThis.__fc8pins;
  console.log(`FC-8 pin sanity: worst edge ${Math.min(...P.map(p => p.edge))} yd · ` +
    `worst sand ${Math.min(...P.map(p => p.sand))} yd · worst ring grad ${Math.max(...P.map(p => p.ring))} · ` +
    `moved: ${P.filter(p => p.moved > 0.01).map(p => `#${p.hole} ${p.moved}yd`).join(', ') || 'none'}`);
}
if (pocoBudget.length) {
  console.log('\nTHE POCO OPEN — per-hole budget (address view, 1280x720):');
  console.log('  ##  name                  par  yds   build ms  calls    tris  houses   lots  fence  trees  signs');
  for (const b of pocoBudget)
    console.log(`  ${String(b.hole).padStart(2)}  ${b.name.padEnd(20)}  ${b.par}   ${String(b.yds).padStart(3)}` +
      `  ${String(b.ms).padStart(9)}  ${String(b.calls).padStart(5)}  ${String(b.tris).padStart(6)}` +
      `  ${String(b.houses).padStart(6)}  ${String(b.lots).padStart(5)}  ${String(b.fences).padStart(5)}` +
      `  ${String(b.trees).padStart(5)}  ${String(b.signs).padStart(5)}`);
}
if (globalThis.__sweep) {
  console.log('\n18-hole build sweep (ms):');
  console.log(globalThis.__sweep.map(s => `  hole ${String(s.hole).padStart(2)}: ${s.ms}`).join('\n'));
}
process.exit(good && process.exitCode !== 1 ? 0 : 1);
