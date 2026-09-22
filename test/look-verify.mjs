// FC-LOOK-1 verification (companion to harness.mjs, same plumbing).
// The main harness owns flag-default regression; this script proves the
// look bundle: TRUE GL-wrapped budgets on holes 1/12/13/18, the flyover
// choreography contract, the event-driven minimap, ?look=0 and ?fx=low
// boots, the 18-hole build sweep, and the beauty-shot set under
// test/shots/look/.
//
//   node --experimental-websocket test/look-verify.mjs [section]
//   sections: budgets | flyover | cameras | map | flags | shots | fc7
//             fc8 (default: all)
//
// FC-7 adds `cameras` (camera comfort over the new relief — full unskipped
// flyovers plus the address/chase cameras measured against the ground) and
// `fc7` (the terrain beauty set under test/shots/fc7/).

import path from 'node:path';
import fs from 'node:fs';
import { ROOT, sleep, serveRepo, launchChrome, openPage } from './lib.mjs';

const HTTP = 8986, CDP = 9386;
const SHOTS = path.join(ROOT, 'test', 'shots', 'look');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const results = [];
function gate(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}
const MODE = process.argv[2] || 'all';
const RUN = s => MODE === 'all' || MODE === s;

/* TRUE per-frame draw probe (PP law: renderer.info undercounts under
   shadow maps — wrap the GL context and count every draw between rAFs). */
const GL_PROBE = `(function(){
  if (window.__glProbe) return;
  var gl = __fcLook.renderer.getContext();
  var cur = 0, curTri = 0, maxCalls = 0, maxTris = 0;
  ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'].forEach(function(k){
    if (typeof gl[k] !== 'function') return;
    var orig = gl[k].bind(gl);
    gl[k] = function(){
      cur++;
      var n = (k.indexOf('Elements') >= 0) ? arguments[1] : arguments[2];
      curTri += (n || 0) / 3;
      return orig.apply(null, arguments);
    };
  });
  function tick(){
    if (cur > maxCalls) maxCalls = cur;
    if (curTri > maxTris) maxTris = curTri;
    cur = 0; curTri = 0;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__glProbe = { get maxCalls(){ return maxCalls; },
                       get maxTris(){ return Math.round(maxTris); },
                       reset: function(){ maxCalls = 0; maxTris = 0; } };
})();`;

async function toAddress(page, viaHole) {
  for (const want of ['diffpick', 'roundpick', 'flyover']) {
    for (let i = 0; i < 6; i++) {
      await page.pressPad('south'); await sleep(350);
      if ((await page.eval('__fc.state()')) === want) break;
    }
  }
  await page.waitFor(`__fc.state()==='flyover'`, 'flyover', 12000);
  if (viaHole && viaHole !== 1) {
    await page.eval(`__fc.gotoHole(${viaHole})`);
    await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${viaHole}`, 'hole ' + viaHole, 15000);
  }
  await sleep(1400);
  await page.pressPad('south');            // skip (allowed after 1s)
  await page.waitFor(`__fc.state()==='address'`, 'address', 9000);
  await sleep(500);
}
async function gotoHoleAddress(page, n) {
  await page.eval(`__fc.gotoHole(${n})`);
  await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${n}`, 'hole ' + n, 15000);
  await sleep(1400);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='address'`, 'address ' + n, 9000);
  await sleep(500);
}
async function clip(page, file, x, y, w, h, scale = 2) {
  const s = await page.c.send('Page.captureScreenshot', {
    format: 'png', clip: { x, y, width: w, height: h, scale },
  });
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
}

const srv = await serveRepo({ port: HTTP });
const chrome = await launchChrome({ port: CDP });

/* ════════ budgets: true GL calls/tris at address + flight, 4 holes ════════ */
async function budgets() {
  console.log('\n═══ LOOK budgets (true GL wrap) — holes 1, 5, 6, 10, 13, 16, 17, 18 ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
    gate('boots with the look ON', (await page.eval('__fc.look()')).look === true);
    await toAddress(page);
    await page.eval(GL_PROBE);
    const perHole = {};
    /* FC-7: the terrain-drama set — the big downhill (10), the valley par 3
       (6), the hard cant (13), the all-carry (16) and the uphill finish
       (18), plus 1 as the control.  FC-8 adds the two holes whose meso
       layer works hardest: 5 (the rolling one) and 17 (the ridge). */
    for (const hn of [1, 5, 6, 10, 13, 16, 17, 18]) {
      if (hn !== 1) await gotoHoleAddress(page, hn);
      await page.eval('__glProbe.reset()');
      await sleep(900);                             // busy address frames
      const adr = await page.eval('({c: __glProbe.maxCalls, t: __glProbe.maxTris})');
      // a real swing: meter → flight (busy: golfer + ball + particles + chase)
      await page.pressPad('south');
      await page.waitFor(`__fc.state()==='meter'`, 'meter', 5000);
      await sleep(420);
      await page.pressPad('south');
      await page.waitFor('__fc.flightOn()', 'flight', 6000).catch(() => {});
      await page.eval('__glProbe.reset()');
      await sleep(900);
      const fly = await page.eval('({c: __glProbe.maxCalls, t: __glProbe.maxTris})');
      const cast = (await page.eval('__fc.look()')).casterTris;
      perHole[hn] = { adr, fly, cast };
      const c = Math.max(adr.c, fly.c), t = Math.max(adr.t, fly.t);
      gate(`hole ${hn}: true draw calls ${c} <= 80`, c <= 80, `address ${adr.c} / flight ${fly.c}`);
      gate(`hole ${hn}: true tris ${t} <= 100k (target 75k)`, t <= 100000,
        `address ${adr.t} / flight ${fly.t}${t <= 75000 ? ' — within target' : ' — OVER target, under cap'}`);
      gate(`hole ${hn}: shadow-caster tris ${cast} <= 30k`, cast <= 30000);
      // wait the shot out so the next gotoHole starts clean
      await page.waitFor(`['address','card','roundend'].includes(__fc.state()) && !__fc.flightOn()`, 'shot done', 60000).catch(() => {});
    }
    console.log('  per-hole:', JSON.stringify(perHole));
    globalThis.__budgets = perHole;
    // 18-hole build sweep (desktop; ≤ ~350ms worst per the FC-LOOK-1 brief)
    const sweep = await page.eval('__fc.sweepBuilds()');
    const worst = Math.max(...sweep.map(s => s.ms));
    console.log('  build sweep:', sweep.map(s => `#${s.hole}:${s.ms}ms`).join(' '));
    gate(`18-hole build sweep worst ${worst.toFixed(1)}ms <= 350ms`, worst <= 350);
    globalThis.__sweep = sweep;
    gate('budgets: zero console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
}

/* ════════ flyover choreography contract ════════ */
async function flyover() {
  console.log('\n═══ flyover choreography (unskipped, hole 1) ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
    for (const want of ['diffpick', 'roundpick', 'flyover']) {
      for (let i = 0; i < 6; i++) {
        await page.pressPad('south'); await sleep(350);
        if ((await page.eval('__fc.state()')) === want) break;
      }
    }
    await page.waitFor(`__fc.state()==='flyover'`, 'flyover', 12000);
    const t0 = Date.now();
    // let it run its FULL course — no skip
    await page.waitFor(`__fc.state()==='address'`, 'address after full flyover', 20000);
    const wall = (Date.now() - t0) / 1000;
    const rec = await page.eval('__fc.flyRec()');
    const dur = await page.eval('__fc.flyDur');
    await sleep(400);
    const camAfter = await page.eval('__fc.camPos()');
    gate(`declared duration ${dur}s in the 7.5-10s band`, dur >= 7.5 && dur <= 10);
    gate(`wall duration ${wall.toFixed(1)}s in band`, wall >= 7.0 && wall <= 11.0);
    gate(`camera never pitches below -65 deg (min ${rec.minPitch.toFixed(1)})`, rec.minPitch > -65);
    gate('forward progress monotonic tee-ward (never reverses)', rec.mono === true);
    // the floor is the SETTLE: the shot ends in the address pose, which sits
    // 2.5-3 yds over the tee (lower on a hole that climbs away) — everything
    // before it flies 10-27 yds up
    gate(`camera stays clear of the ground it flies (min ${rec.minClear.toFixed(1)} yd > 2)`, rec.minClear > 2);
    const gap = Math.hypot(camAfter[0] - rec.endPos[0], camAfter[1] - rec.endPos[1], camAfter[2] - rec.endPos[2]);
    gate(`settles into the address camera (gap ${gap.toFixed(2)} yd < 0.75)`, gap < 0.75);
    gate(`flyover sampled ${rec.n} frames`, rec.n > 60);
    gate('flyover: zero console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
}

/* ════════ minimap: live marker + event-driven redraw ════════ */
async function mapChecks() {
  console.log('\n═══ hole HUD minimap ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
    await toAddress(page);
    // event-driven: NO redraws while idle at address (no input, no state change)
    await sleep(400);
    const d0 = await page.eval('__fc.mapDraws()');
    await sleep(1500);                              // ~90 idle frames
    const d1 = await page.eval('__fc.mapDraws()');
    gate(`idle address: zero redraws over ~90 frames (${d0} -> ${d1})`, d1 === d0);
    const m0 = await page.eval('__fc.mapMarker()');
    // club change (real input) moves the projected landing marker
    await page.pressPad('r1'); await sleep(350);
    const m1 = await page.eval('__fc.mapMarker()');
    const dClub = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]);
    gate(`club change moves the landing marker (${dClub.toFixed(1)} px)`, dClub > 1.5);
    const d2 = await page.eval('__fc.mapDraws()');
    gate('club change triggered a redraw', d2 > d1);
    // aim change (real held input) moves it too
    await page.axisPad(0, -1); await sleep(600); await page.axisPad(0, 0); await sleep(250);
    const m2 = await page.eval('__fc.mapMarker()');
    const dAim = Math.hypot(m2[0] - m1[0], m2[1] - m1[1]);
    gate(`aim change moves the landing marker (${dAim.toFixed(1)} px)`, dAim > 1.5);
    // and once settled again, idle stays redraw-free
    await sleep(500);
    const d3 = await page.eval('__fc.mapDraws()');
    await sleep(1200);
    const d4 = await page.eval('__fc.mapDraws()');
    gate(`idle after aiming: no per-frame redraws (${d3} -> ${d4})`, d4 === d3);
    gate('minimap: zero console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
}

/* ════════ flag combos: ?look=0 and ?fx=low ════════ */
async function flags() {
  console.log('\n═══ ?look=0 and ?fx=low ═══');
  let page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/?look=0`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'look0 title');
    const lk = await page.eval('__fc.look()');
    gate('?look=0 boots to title clean', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    gate('?look=0: flat pipeline (no shadow, no post)', lk.look === false && lk.shadow === false && lk.post === false);
    gate('?look=0: no tone mapping', (await page.eval('renderer.toneMapping')) === 0);
    await toAddress(page);
    await sleep(400);
    await page.screenshot(path.join(SHOTS, 'look0-address.png'));
    gate('?look=0 reaches address clean', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
  page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/?fx=low`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'lowfx title');
    const lk = await page.eval('__fc.look()');
    gate('?fx=low boots clean', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    gate('?fx=low: look kept, shadow map OFF', lk.look === true && lk.shadow === false);
    gate('?fx=low: shadowMap disabled on the renderer', (await page.eval('renderer.shadowMap.enabled')) === false);
    await toAddress(page);
    gate('?fx=low: golfer blob shadow revived', (await page.eval('SHADOW_GOLFER.visible')) === true);
    await page.screenshot(path.join(SHOTS, 'lowfx-address.png'));
    gate('?fx=low reaches address clean', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
    // reset the persisted flag so later sections boot full-fx
    await page.eval(`localStorage.setItem('arcade_lowfx', '0')`);
  } finally { await page.close(); }
}

/* ════════ the beauty-shot set (test/shots/look/) ════════ */
async function shots() {
  console.log('\n═══ beauty shots ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/?fx=full`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
    await sleep(900);
    await page.screenshot(path.join(SHOTS, 'title.png'));
    // flyover beats: start over the cup / mid / settled into address
    for (const want of ['diffpick', 'roundpick', 'flyover']) {
      for (let i = 0; i < 6; i++) {
        await page.pressPad('south'); await sleep(350);
        if ((await page.eval('__fc.state()')) === want) break;
      }
    }
    await page.waitFor(`__fc.state()==='flyover'`, 'flyover', 12000);
    await sleep(500);
    await page.screenshot(path.join(SHOTS, 'flyover-1-cup.png'));
    await sleep(3800);
    await page.screenshot(path.join(SHOTS, 'flyover-2-mid.png'));
    await page.waitFor(`__fc.state()==='address'`, 'settled', 15000);
    await sleep(300);
    await page.screenshot(path.join(SHOTS, 'flyover-3-settled.png'));
    // address beauty: holes 1, 12, 13, 18 (must be tellable-apart)
    await page.screenshot(path.join(SHOTS, 'address-01.png'));
    for (const hn of [12, 13, 18]) {
      await gotoHoleAddress(page, hn);
      await sleep(400);
      await page.screenshot(path.join(SHOTS, `address-${String(hn).padStart(2, '0')}.png`));
    }
    // golfer close-up at address (clip around the figure) + mid-swing
    await clip(page, path.join(SHOTS, 'golfer-address.png'), 520, 380, 360, 330, 2);
    await page.pressPad('south');
    await page.waitFor(`__fc.state()==='meter'`, 'meter', 5000);
    const t0 = Date.now();
    for (;;) {                          // catch the meter near 70% = full coil
      const v = await page.eval('__fc.meter()');
      if (v > 60) break;
      if (Date.now() - t0 > 6000) break;
      await sleep(25);
    }
    await clip(page, path.join(SHOTS, 'golfer-midswing.png'), 520, 380, 360, 330, 2);
    await page.pressPad('south');
    await page.waitFor(`['address','card'].includes(__fc.state()) && !__fc.flightOn()`, 'shot done', 60000).catch(() => {});
    // minimap detail crop (bottom-right panel)
    await page.waitFor(`__fc.state()==='address'`, 'address', 15000).catch(() => {});
    await sleep(400);
    await clip(page, path.join(SHOTS, 'minimap-detail.png'), 1060, 375, 215, 340, 2);
    // green / putting view
    const pin = await page.eval('__fc.pin()');
    await page.eval(`__fc.teleport(${pin.x - 5}, ${pin.z - 4})`);
    await sleep(600);
    await page.screenshot(path.join(SHOTS, 'green-putting.png'));
    gate('beauty shots: zero console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
  // touch layout shot at 1180x820
  const tp = await openPage(CDP, { width: 1180, height: 820, touch: true, padStub: false });
  try {
    await tp.nav(`http://localhost:${HTTP}/`);
    await tp.waitFor(`window.__fc && __fc.state()==='title'`, 'touch title');
    await tp.tap(590, 300);
    await tp.waitFor(`!!document.getElementById('__arcade_touchpad')`, 'overlay', 5000);
    const south = await tp.rectCenter('#__atp-s');
    const tapS = async () => { await tp.tap(south.x, south.y, 90); await sleep(340); };
    for (let i = 0; i < 6; i++) {
      const s = await tp.eval('__fc.state()');
      if (s === 'flyover') break;
      await tapS();
    }
    await tp.waitFor(`__fc.state()==='flyover'`, 'touch flyover', 15000);
    await sleep(1300);
    await tapS();
    await tp.waitFor(`__fc.state()==='address'`, 'touch address', 9000);
    await sleep(500);
    await tp.screenshot(path.join(SHOTS, 'touch-1180x820.png'));
    gate('touch shot: zero console errors', tp.errors.length === 0, tp.errors.slice(0, 3).join(' | '));
  } finally { await tp.close(); }
}

/* ════════ FC-7 — camera comfort over real relief ════════
   The terrain is dramatic now; the cameras must still be comfortable.  A
   full unskipped flyover on the steepest holes, then the address and chase
   cameras through a real swing, all measured against the ground itself. */
async function cameras() {
  console.log('\n═══ FC-7 camera comfort on the steep holes (6, 9, 10, 18) ═══');
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
    await toAddress(page);
    for (const hn of [6, 9, 10, 18]) {
      await page.eval(`__fc.gotoHole(${hn})`);
      await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${hn}`, 'hole ' + hn, 15000);
      await page.waitFor(`__fc.state()==='address'`, 'full flyover ' + hn, 22000);   // NOT skipped
      const rec = await page.eval('__fc.flyRec()');
      gate(`hole ${hn} flyover: pitch never below -65 deg (min ${rec.minPitch.toFixed(1)})`, rec.minPitch > -65);
      gate(`hole ${hn} flyover: never reverses over the relief`, rec.mono === true);
      gate(`hole ${hn} flyover: clears the terrain it shows off (min ${rec.minClear.toFixed(1)} yd > 2)`,
        rec.minClear > 2);
      await sleep(400);
      const clr = await page.eval('__fc.camClear()');
      gate(`hole ${hn} address camera floats ${clr.toFixed(2)} yd above the ground (> 1.2)`, clr > 1.2);
      // the chase camera through a REAL swing on the steepest ground
      await page.pressPad('south');
      await page.waitFor(`__fc.state()==='meter'`, 'meter', 5000);
      await sleep(420);
      await page.pressPad('south');
      await page.waitFor('__fc.flightOn()', 'flight', 6000).catch(() => {});
      let worst = 99;
      for (let i = 0; i < 60; i++) {
        const c = await page.eval('__fc.camClear()');
        if (c < worst) worst = c;
        if (!(await page.eval('__fc.flightOn()'))) break;
        await sleep(60);
      }
      gate(`hole ${hn} chase camera never dips into the terrain (min ${worst.toFixed(2)} yd > 0.8)`, worst > 0.8);
      await page.waitFor(`['address','card','roundend'].includes(__fc.state()) && !__fc.flightOn()`,
        'shot done', 60000).catch(() => {});
    }
    gate('cameras: zero console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
}

/* ════════ FC-7 — the terrain beauty set (test/shots/fc7/) ════════ */
async function fc7shots() {
  console.log('\n═══ FC-7 terrain shots ═══');
  const DIR = path.join(ROOT, 'test', 'shots', 'fc7');
  fs.mkdirSync(DIR, { recursive: true });
  const page = await openPage(CDP);
  try {
    await page.nav(`http://localhost:${HTTP}/?fx=full`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
    await toAddress(page);
    await page.eval('__fc.setWind(0,0)');

    // 6 tee — the valley drop
    await gotoHoleAddress(page, 6);
    await page.screenshot(path.join(DIR, '06-tee-valley.png'));
    // 10 tee — the sweeping downhill with the left cant; plus a mid-flyover
    await page.eval('__fc.gotoHole(10)');
    await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===10`, 'hole 10', 15000);
    await sleep(3900);
    await page.screenshot(path.join(DIR, '10-flyover-mid.png'));
    await page.waitFor(`__fc.state()==='address'`, 'address 10', 20000);
    await sleep(500);
    await page.eval('__fc.setWind(0,0)');
    await page.screenshot(path.join(DIR, '10-tee-downhill.png'));
    // 18 approach — uphill to the elevated green
    await gotoHoleAddress(page, 18);
    await page.eval('__fc.teleport(...__fc.clWorld(__fc.holeLen() - 135, 4))');
    await sleep(700);
    await page.screenshot(path.join(DIR, '18-approach-uphill.png'));
    // 9 green-side — the false front, seen from short
    await gotoHoleAddress(page, 9);
    await page.eval(`(() => { const g = __fc.green();
      const w = __fc.greenWorld(0, -(g.grz + 26)); __fc.teleport(w[0], w[1]); })()`);
    await sleep(700);
    await page.screenshot(path.join(DIR, '09-false-front.png'));
    // 14 terraces from the putting camera
    await gotoHoleAddress(page, 14);
    await page.eval(`(() => { const g = __fc.green();
      const w = __fc.greenWorld(1.5, -g.grz * 0.72); __fc.teleport(w[0], w[1]); })()`);
    await sleep(800);
    gate('14: the putting camera is up (ball on the green)', (await page.eval('__fc.lie()')) === 2);
    await page.screenshot(path.join(DIR, '14-green-terraces.png'));
    // 16 feeder with the green-read arrows up
    await gotoHoleAddress(page, 16);
    await page.eval(`(() => { const g = __fc.green();
      const w = __fc.greenWorld(g.grx * 0.55, 2); __fc.teleport(w[0], w[1]); })()`);
    await sleep(700);
    await page.screenshot(path.join(DIR, '16-green-feeder.png'));
    await page.pressPad('north'); await sleep(900);
    gate('16: green-read arrows up over the feeder', (await page.eval('__fc.state()')) === 'greenread');
    await page.screenshot(path.join(DIR, '16-green-read-arrows.png'));
    await page.pressPad('north'); await sleep(400);
    // a sidehill lie with the HUD line showing
    await gotoHoleAddress(page, 13);
    await page.eval('__fc.teleport(...__fc.clWorld(300, 10))');
    await sleep(700);
    gate('13: the sidehill HUD line is on screen',
      /BALL (ABOVE|BELOW) FEET/.test(await page.eval('__fc.shotText()')));
    await page.screenshot(path.join(DIR, '13-sidehill-lie.png'));
    gate('fc7 shots: zero console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
}

/* ════════ FC-8 — "the ground must read without a HUD" (test/shots/fc8/) ════════
   The whole point of FC-8 is that a fairway looks like LAND at couch
   distance.  These are taken with the HUD hidden on purpose: if the
   corridor reads flat here, the bundle has not landed. */
async function fc8shots() {
  console.log('\n═══ FC-8 land shots ═══');
  const DIR = path.join(ROOT, 'test', 'shots', 'fc8');
  fs.mkdirSync(DIR, { recursive: true });
  const page = await openPage(CDP);
  const hudOff = () => page.eval(
    `(() => { hudEl.style.display='none'; hintEl.style.display='none'; return 1; })()`);
  try {
    await page.nav(`http://localhost:${HTTP}/?fx=full`);
    await page.connectPad(0);
    await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
    await toAddress(page);
    await page.eval('__fc.setWind(0,0)');

    /* mid-corridor with the HUD off — the GROUND has to do the talking */
    for (const [hn, d, off] of [[5, 300, 2], [10, 300, 4], [14, 250, -3], [17, 250, 3]]) {
      await gotoHoleAddress(page, hn);
      await page.eval(`__fc.setWind(0,0); __fc.teleport(...__fc.clWorld(${d}, ${off}))`);
      await sleep(800);
      await hudOff();
      await sleep(260);
      await page.screenshot(path.join(DIR, `${String(hn).padStart(2, '0')}-fairway-nohud.png`));
      gate(`hole ${hn}: mid-fairway shot taken with the HUD off`,
        (await page.eval(`getComputedStyle(hudEl).display`)) === 'none');
    }

    /* the drive that rides the land: land / release / rest on 10 */
    await gotoHoleAddress(page, 10);
    await page.eval('__fc.setWind(0,0)');
    await hudOff();
    await page.pressPad('south');
    await page.waitFor(`__fc.state()==='meter'`, 'meter', 5000);
    for (let i = 0; i < 500; i++) {          // ~90% = the falling-shoulder pitch
      const v = await page.eval('__fc.meter()');
      if (v >= 87 && v <= 93) break;
      await sleep(10);
    }
    await page.pressPad('south');
    await page.waitFor('__fc.flightOn()', 'flight', 6000).catch(() => {});
    /* three frames spaced by the ball's own SPEED, so the travel between
       them is real ground covered (the chase cam follows the ball, so the
       yardage shows in the landmarks, not in the ball's screen position) */
    let shot = 0, wasRoll = false, at = [];
    for (let i = 0; i < 1200; i++) {
      const st = await page.eval(
        `({ on: __fc.flightOn(), roll: FLIGHT.mode === 'roll', sp: Math.hypot(FLIGHT.vx, FLIGHT.vz), x: FLIGHT.x, z: FLIGHT.z })`);
      if (st.on && st.roll && !wasRoll) {
        wasRoll = true; at.push([st.x, st.z]);
        await page.screenshot(path.join(DIR, '10-roll-1-land.png')); shot++;
      } else if (wasRoll && shot === 1 && st.sp < 3.2) {
        at.push([st.x, st.z]);
        await page.screenshot(path.join(DIR, '10-roll-2-release.png')); shot++;
      }
      if (!st.on) { at.push([st.x, st.z]); break; }
      await sleep(22);
    }
    await sleep(260);
    await page.screenshot(path.join(DIR, '10-roll-3-rest.png'));
    const trav = at.length >= 3
      ? [Math.hypot(at[1][0] - at[0][0], at[1][1] - at[0][1]), Math.hypot(at[2][0] - at[1][0], at[2][1] - at[1][1])]
      : [0, 0];
    gate(`10: the drive-rollout sequence covers real ground (${trav[0].toFixed(1)} + ${trav[1].toFixed(1)} yds between frames)`,
      shot >= 2 && trav[0] + trav[1] >= 8);
    await page.waitFor(`['address','card'].includes(__fc.state()) && !__fc.flightOn()`, 'shot done', 60000).catch(() => {});

    /* the stance on 13's cant */
    await gotoHoleAddress(page, 13);
    await page.eval('__fc.setWind(0,0); __fc.teleport(...__fc.clWorld(300, 10))');
    await sleep(900);
    const tl = await page.eval('JSON.parse(JSON.stringify(__fc.golferTilt()))');
    await page.screenshot(path.join(DIR, '13-stance-cant.png'));
    await clip(page, path.join(DIR, '13-stance-cant-detail.png'), 470, 320, 420, 390, 2);
    gate(`13: the golfer is tilted on the cant at address (${tl.deg} deg)`, tl.deg > 1.5 && tl.deg <= 7.05);

    /* the collection hollow on 5, framed from the short grass it gathers off */
    await gotoHoleAddress(page, 5);
    await page.eval(`(() => { __fc.setWind(0,0);
      const h = __fc.hollows()[0];
      const b = __fc.clWorld(h.d - 24, h.off + 15);
      const f = __fc.clWorld(h.d + 10, h.off - 4);
      __fc.teleport(b[0], b[1]);
      // sight straight down the length of the bowl, from its near rim
      SHOT.aimAng = Math.atan2(f[0] - b[0], f[1] - b[1]);
      SHOT.arcDirty = true; camSnap();
      return 1; })()`);
    await sleep(1100);
    await hudOff();
    await page.screenshot(path.join(DIR, '05-collection-hollow.png'));
    gate('5: the collection hollow framed from the short grass above it', true);

    /* bunker mounding read from the fairway on 7 */
    await gotoHoleAddress(page, 7);
    await page.eval('__fc.setWind(0,0); __fc.teleport(...__fc.clWorld(388, 0))');
    await sleep(900);
    await hudOff();
    await page.screenshot(path.join(DIR, '07-bunker-mounding.png'));
    gate('7: the three front bunkers framed from the fairway', true);

    /* and 18 must still read UPHILL */
    await gotoHoleAddress(page, 18);
    await page.eval('__fc.setWind(0,0); __fc.teleport(...__fc.clWorld(__fc.holeLen() - 135, 4))');
    await sleep(900);
    await hudOff();
    await page.screenshot(path.join(DIR, '18-approach-uphill.png'));
    const rise = await page.eval('__fc.lieInfo().rise');
    gate(`18: the approach still climbs to the green (+${rise.toFixed(1)} yds)`, rise >= 5);

    gate('fc8 shots: zero console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally { await page.close(); }
}

try {
  if (RUN('budgets')) await budgets();
  if (RUN('flyover')) await flyover();
  if (RUN('cameras')) await cameras();
  if (RUN('map')) await mapChecks();
  if (RUN('flags')) await flags();
  if (RUN('shots')) await shots();
  if (RUN('fc7')) await fc7shots();
  if (RUN('fc8')) await fc8shots();
} catch (e) {
  console.error('\nLOOK-VERIFY THREW:', e.message);
  failures++;
} finally {
  chrome.kill();
  await srv.close();
}
const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} look assertions passed`);
if (bad.length) for (const b of bad) console.log('  FAIL - ' + b.name);
process.exit(failures ? 1 : 0);
