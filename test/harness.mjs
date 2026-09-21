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
    ok((await page.eval('__fc.state()')) === 'diffpick', 'kbd: space starts');
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
    await page.key(' ', 'Space', 32); await sleep(300);
    await page.key(' ', 'Space', 32); await sleep(300);
    await page.key(' ', 'Space', 32);
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
    await page.pressPad('south'); await sleep(250);
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
    ok(JSON.stringify(await page.eval('loadBest()')) === '{}', 'corrupt best JSON is survived');
    await page.eval(`saveBest('amateur', -3); saveBest('pro', 1)`);
    await page.nav(`http://localhost:${HTTP}/?fx=full`);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title reboot');
    const best = await page.eval(`document.getElementById('titleBest').textContent`);
    ok(/AMATEUR.*-3/.test(best) && /PRO.*\+1/.test(best), `best round persists to the title ("${best}")`);
    // PRO mode smoke: select PRO, one full shot resolves clean
    await page.connectPad(0); await sleep(300);
    await page.pressPad('south'); await sleep(250);              // diffpick
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
    for (const want of ['diffpick', 'roundpick', 'flyover']) {   // AMATEUR / FRONT 9
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
    ok((await page.eval('__fc.build')) === 'FC-7-SAUCE', 'build tag is FC-7-SAUCE');
    await sleep(400);
    for (const want of ['diffpick', 'roundpick', 'flyover']) {
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

/* `node --experimental-websocket test/harness.mjs [A|B|…|H]` runs one part
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
if (globalThis.__sweep) {
  console.log('\n18-hole build sweep (ms):');
  console.log(globalThis.__sweep.map(s => `  hole ${String(s.hole).padStart(2)}: ${s.ms}`).join('\n'));
}
process.exit(good && process.exitCode !== 1 ? 0 : 1);
