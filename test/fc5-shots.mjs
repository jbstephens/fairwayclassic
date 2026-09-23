// FC-5 screenshot set — the feel & fidelity bundle, eyeballed per the brief.
// Shots land in test/shots/fc5/.  Run:
//   node --experimental-websocket test/fc5-shots.mjs
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, sleep, serveRepo, launchChrome, openPage } from './lib.mjs';

const HTTP = 8988, CDP = 9388;
const SHOTS = path.join(ROOT, 'test', 'shots', 'fc5');
fs.mkdirSync(SHOTS, { recursive: true });

const srv = await serveRepo({ port: HTTP });
const chrome = await launchChrome({ port: CDP });
const page = await openPage(CDP);

async function clip(file, x, y, w, h, scale = 2) {
  const s = await page.c.send('Page.captureScreenshot', {
    format: 'png', clip: { x, y, width: w, height: h, scale },
  });
  fs.writeFileSync(path.join(SHOTS, file), Buffer.from(s.data, 'base64'));
}
const shot = f => page.screenshot(path.join(SHOTS, f));
const waitState = (s, what, t = 12000) => page.waitFor(`__fc.state()==='${s}'`, what, t);

try {
  await page.nav(`http://localhost:${HTTP}/?fx=full`);
  await page.connectPad(0);
  await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
  await sleep(400);
  for (const want of ['coursepick', 'diffpick', 'roundpick', 'flyover']) {   // AMATEUR / FRONT 9
    for (let i = 0; i < 6; i++) {
      await page.pressPad('south'); await sleep(350);
      if ((await page.eval('__fc.state()')) === want) break;
    }
  }
  await waitState('flyover', 'flyover');
  await sleep(1200);
  await page.pressPad('south');
  await waitState('address', 'address');
  await page.eval('__fc.setWind(0,0)');
  await sleep(600);

  // 1. hole-1 tee with the clubhouse
  await shot('01-hole1-tee-clubhouse.png');
  // 10. ball-size sanity at address (clip around golfer + ball)
  await clip('10-ball-size-address.png', 480, 380, 420, 330, 2);
  // 4. caddie close-up (he stands screen-left of the golfer)
  await clip('04-caddie-address.png', 40, 300, 460, 420, 2);

  // 5. swing sequence — backswing / impact / follow-through
  await page.pressPad('south');
  await waitState('meter', 'meter');
  for (let i = 0; i < 240; i++) {
    if ((await page.eval('__fc.meter()')) > 62) break;
    await sleep(20);
  }
  await shot('05a-swing-backswing.png');
  // impact attempt: raw press (no witness wait), rapid capture in the 0.25s swing
  await page.eval(`__press(0,'south',true)`);
  await page.waitFor(`['swing','flight'].includes(__fc.state())`, 'stroke', 4000);
  await shot('05b-swing-impact.png');
  await page.eval(`__press(0,'south',false)`);
  await page.waitFor(`__fc.state()==='flight'`, 'flight', 4000);
  await shot('05c-swing-followthrough.png');
  // 7. ball-in-flight tracer arc (visible loft)
  await sleep(1100);
  await shot('07-ball-in-flight.png');
  await page.waitFor(`__fc.state()==='address' && !__fc.flightOn()`, 'settled', 40000);

  // 9. fairway approach with the zoomed (approach) minimap
  await page.eval(`(() => { const g = __fc.green(); __fc.teleport(g.x - g.tx * 88, g.z - g.tz * 88); })()`);
  await sleep(900);   // eased zoom settles
  await shot('09-approach-zoom-minimap.png');

  // 8. green view with the green-zoom minimap (putt line + slope arrows)
  const pin = await page.eval('__fc.pin()');
  await page.eval(`__fc.teleport(${pin.x - 4.5}, ${pin.z - 3.8})`);
  await sleep(900);
  await shot('08-green-zoom-minimap.png');

  // 6. putt stroke frame — pendulum, no full swing
  await page.pressPad('south');
  await waitState('meter', 'putt meter');
  for (let i = 0; i < 240; i++) {
    if ((await page.eval('__fc.meter()')) > 55) break;
    await sleep(20);
  }
  await shot('06-putt-pendulum.png');
  await page.pressPad('south');
  await page.waitFor(`['address','card'].includes(__fc.state()) && !__fc.flightOn()`, 'putt done', 40000).catch(() => {});

  // 3. hole 12 tee with the stone bridge (Hogan homage)
  const goHole = async n => {
    await page.eval(`__fc.gotoHole(${n})`);
    await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${n}`, 'hole ' + n, 15000);
    await sleep(1300);
    await page.pressPad('south');
    await waitState('address', 'address ' + n);
    await page.eval('__fc.setWind(0,0)');
    await sleep(600);
  };
  await goHole(12);
  await shot('03-hole12-tee-bridge.png');

  // 2. hole 18 approach with the clubhouse beyond the green
  await goHole(18);
  await page.eval(`(() => { const g = __fc.green(); __fc.teleport(g.x - g.tx * 118, g.z - g.tz * 118); })()`);
  await sleep(900);
  await shot('02-hole18-approach-clubhouse.png');

  // bonus check: hole 9 green sees the clubhouse too
  await goHole(9);
  await page.eval(`(() => { const g = __fc.green(); __fc.teleport(g.x - g.tx * 60, g.z - g.tz * 60); })()`);
  await sleep(900);
  await shot('11-hole9-approach-clubhouse.png');

  console.log('errors:', page.errors.length ? page.errors : 'none');
  if (page.errors.length) process.exitCode = 1;
} catch (e) {
  console.error('FC5-SHOTS FAILED:', e.message);
  try { await shot('fail.png'); } catch {}
  process.exitCode = 1;
} finally {
  await page.close();
  chrome.kill();
  await srv.close();
}
