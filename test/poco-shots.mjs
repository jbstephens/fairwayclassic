// THE POCO OPEN — the look pass.  1280x720 CDP captures of the course
// select and the holes whose identity is a piece of the real neighborhood.
// Shots land in test/shots-dev/poco/ and are meant to be LOOKED AT.
//   node --experimental-websocket test/poco-shots.mjs
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, sleep, serveRepo, launchChrome, openPage } from './lib.mjs';

const HTTP = 8994, CDP = 9394;
const OUT = path.join(ROOT, 'test', 'shots-dev', 'poco');
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
  await sleep(700);
  await page.screenshot(path.join(OUT, 'coursepick.png'));
  await page.pressPad('down'); await sleep(250);
  await sleep(500);
  await page.screenshot(path.join(OUT, 'coursepick-poco.png'));
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='diffpick'`, 'diffpick', 9000);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='flyover'`, 'flyover', 25000);

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
    [1, 'h1-street-canyon', null],
    [1, 'h1-down-the-street', [120, 0, 300, 0]],
    [2, 'h2-blacktop', [70, 4, 300, 0]],
    [5, 'h5-cloverleaf', [60, -4, 330, -14]],
    [6, 'h6-canal-left', [260, 12, 430, 30]],
    [6, 'h6-canal-tee', null],
    [7, 'h7-carry', null],
    [7, 'h7-carry-edge', [26, 0, 156, 0]],
    [8, 'h8-pond', null],
    [9, 'h9-park-pool', [215, 2, 289, 0]],
  ];
  for (const [n, file, pose] of SHOTS) {
    await address(n);
    if (pose) await stand(pose[0], pose[1], pose[2], pose[3]);
    await page.screenshot(path.join(OUT, file + '.png'));
    const i = await page.eval('__fc.info()');
    const r = await page.eval('__fc.holeRec()');
    console.log(`${file.padEnd(22)} hole ${n}  ${r.name.padEnd(20)} calls ${i.calls} tris ${i.tris}`);
  }
  console.log('errors:', page.errors.length, page.errors.slice(0, 4).join(' | '));
  await page.close();
} finally {
  chrome.kill(); await srv.close();
}
