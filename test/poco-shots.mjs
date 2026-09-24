// THE POCO OPEN — the look pass (FC-10).  1280x720 CDP captures: every
// hole's tee view, a mid-hole view on the three holes whose identity is the
// point, and a flyover frame with the name callouts up.  Shots land in
// test/shots-dev/poco10/ and are meant to be LOOKED AT — the win condition
// is that each one is identifiably a different real place.
//   node --experimental-websocket test/poco-shots.mjs
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, sleep, serveRepo, launchChrome, openPage } from './lib.mjs';

const HTTP = 8994, CDP = 9394;
const OUT = path.join(ROOT, 'test', 'shots-dev', 'poco10');
fs.mkdirSync(OUT, { recursive: true });

const srv = await serveRepo({ port: HTTP });
const chrome = await launchChrome({ port: CDP });
try {
  const page = await openPage(CDP);
  await page.nav(`http://localhost:${HTTP}/`);
  await page.connectPad(0);
  await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title', 15000);
  await sleep(500);

  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='coursepick'`, 'coursepick', 9000);
  await page.pressPad('down'); await sleep(250);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='diffpick'`, 'diffpick', 9000);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='flyover'`, 'flyover', 25000);

  /* the flyover, MID-CALLOUT: proof the floating names actually render.
     A callout lives for about a second and a half as the camera passes it,
     so the capture has to be confirmed on both sides of the shutter. */
  {
    let got = null;
    for (let i = 0; i < 40 && !got; i++) {
      const before = await page.eval('__fc.calloutsVisible()');
      if (!before.length) { await sleep(120); continue; }
      await page.screenshot(path.join(OUT, 'h1-flyover-callout.png'));
      const after = await page.eval('__fc.calloutsVisible()');
      if (after.length) got = after;
    }
    console.log('flyover callouts in frame:', JSON.stringify(got));
  }

  const address = async n => {
    if ((await page.eval('__fc.hole()')) !== n || (await page.eval('__fc.state()')) !== 'flyover') {
      await page.eval(`__fc.gotoHole(${n})`);
      await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${n}`, 'hole ' + n, 30000);
    }
    await sleep(1100);
    await page.pressPad('south');
    await page.waitFor(`__fc.state()==='address'`, 'address ' + n, 20000);
    await sleep(500);
  };
  // stand somewhere and look at something — both in the hole's own (d, off)
  const stand = async (d, off, lookD, lookOff) => {
    await page.eval(`(function(){
      let b = __fc.clWorld(${d}, ${off});
      // never stand inside (or behind) a house — step back along the line
      for (let k = 0; k < 14; k++) {
        const eyeX = b[0] - Math.sin(SHOT.aimAng) * 9, eyeZ = b[1] - Math.cos(SHOT.aimAng) * 9;
        if (__fc.inHouse(b[0], __fc.groundH(b[0], b[1]) + 1, b[1]) < 0 &&
            __fc.inHouse(eyeX, __fc.groundH(eyeX, eyeZ) + 3, eyeZ) < 0) break;
        b = __fc.clWorld(${d} - (k + 1) * 6, ${off} - (k + 1) * 1.6);
      }
      __fc.teleport(b[0], b[1]);
      const t = __fc.clWorld(${lookD}, ${lookOff});
      const p = activeP();
      SHOT.aimAng = Math.atan2(t[0] - p.ball.x, t[1] - p.ball.z);
      SHOT.arcDirty = true; camSnap();
    })()`);
    await sleep(900);
  };

  const SHOTS = [
    // hole, file, [standD, standOff, lookD, lookOff] or null for the tee
    [1, 'h1-tee-soule', null],
    [1, 'h1-mid-street', [150, 2, 330, 0]],
    [2, 'h2-tee', null],
    [3, 'h3-tee', null],
    [3, 'h3-mid-creek', [150, 6, 330, 0]],
    [4, 'h4-tee', null],
    [5, 'h5-tee', null],
    [6, 'h6-tee', null],
    [6, 'h6-mid-canal', [230, 10, 420, 24]],
    [7, 'h7-tee', null],
    [7, 'h7-christ-the-king', 'call0'],
    [8, 'h8-tee', null],
    [8, 'h8-city-hall', 'call0'],
    [2, 'h2-sequoia', 'call0'],
    [9, 'h9-tee', null],
  ];
  /* stand on the hole and LOOK AT the landmark it is named for — the
     identity kit (a steeple, a flagpole, a civic portico) has to be there
     in the frame, not merely in the data */
  const lookAtCallout = async (i) => {
    await page.eval(`(function(){
      const c = CUR.scenery.calls[${i}];
      if (!c) return;
      const p = activeP();
      let bx = c[0] - (c[0] - p.ball.x) * 0.55, bz = c[1] - (c[1] - p.ball.z) * 0.55;
      for (let k = 0; k < 10 && __fc.inHouse(bx, __fc.groundH(bx, bz) + 1, bz) >= 0; k++) {
        bx += (p.ball.x - bx) * 0.2; bz += (p.ball.z - bz) * 0.2;
      }
      __fc.teleport(bx, bz);
      const q = activeP();
      SHOT.aimAng = Math.atan2(c[0] - q.ball.x, c[1] - q.ball.z);
      SHOT.arcDirty = true; camSnap();
    })()`);
    await sleep(900);
  };

  for (const [n, file, pose] of SHOTS) {
    await address(n);
    if (pose === 'call0') await lookAtCallout(0);
    else if (pose) await stand(pose[0], pose[1], pose[2], pose[3]);
    await page.screenshot(path.join(OUT, file + '.png'));
    const i = await page.eval('__fc.info()');
    const r = await page.eval('__fc.holeRec()');
    const loc = await page.eval('__fc.placeAt(activeP().ball.x, activeP().ball.z)');
    console.log(`${file.padEnd(22)} hole ${n}  ${r.name.padEnd(20)} calls ${i.calls} tris ${i.tris}` +
      `  standing on: ${loc || '(unnamed ground)'}`);
  }
  console.log('errors:', page.errors.length, page.errors.slice(0, 4).join(' | '));
  await page.close();
} finally {
  chrome.kill(); await srv.close();
}
