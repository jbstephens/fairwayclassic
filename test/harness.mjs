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

    // reach the green (debug teleport), putt out both players
    for (let pi = 0; pi < 2; pi++) {
      await waitState(page, 'address', 'address for putt-out', 20000);
      const turn = await page.eval('__fc.turn()');
      const pin = await page.eval('__fc.pin()');
      await page.eval(`__fc.teleport(${pin.x - 1.8}, ${pin.z - 1.6})`);
      await sleep(200);
      if (pi === 0) {
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
      // putt until this player holes (generous cup; a couple tries at most)
      for (let tries = 0; tries < 6; tries++) {
        const holed = (await page.eval('__fc.players()'))[turn].holed;
        if (holed) break;
        await waitState(page, 'address', 'putt address', 20000);
        if ((await page.eval('__fc.turn()')) !== turn) break;   // other player interleaved
        await lockMeterAt(page, 46);
        await waitShotDone(page);
      }
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
      await page.eval(`__fc.teleport(${pin.x + 1.7}, ${pin.z + 1.5})`);
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
          await page.eval(`__fc.teleport(${pin.x - 1.9}, ${pin.z - 1.4})`);
          await sleep(200);
          birdiePutt = true;
        }
      } else {
        await page.eval(`__fc.teleport(${pin.x + 1.8}, ${pin.z + 1.3})`);
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
        await page.eval(`__fc.teleport(${pin.x - 1.6}, ${pin.z - 1.4})`);
        await sleep(150);
        await page.pressPad('south'); await sleep(150);          // meter start
        await page.pressPad('south');                            // lock — any power holes from 2 yds
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

try {
  await partA();
  await partB();
  await partC();
  await partD();
  await partE();
  await partF();
  await partG();
} catch (e) {
  console.error('\nHARNESS THREW:', e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await srv.close();
}
const good = T.summary();
if (globalThis.__sweep) {
  console.log('\n18-hole build sweep (ms):');
  console.log(globalThis.__sweep.map(s => `  hole ${String(s.hole).padStart(2)}: ${s.ms}`).join('\n'));
}
process.exit(good && process.exitCode !== 1 ? 0 : 1);
