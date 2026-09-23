// THE POCO OPEN — fast dev smoke: boot, pad-only into the 9, build every
// hole, report budgets + build ms + the scenery/sim volumes.  Not part of
// the shipped bar (harness.mjs owns that) — this is the iteration loop.
//   node --experimental-websocket test/poco-smoke.mjs
import { serveRepo, launchChrome, openPage, sleep } from './lib.mjs';

const srv = await serveRepo({ port: 8991 });
const chrome = await launchChrome({ port: 9391 });
try {
  const page = await openPage(chrome.port);
  await page.nav(`${srv.url}/index.html`);
  await page.connectPad(0);
  await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title', 15000);

  await sleep(400);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='coursepick'`, 'coursepick', 8000);
  console.log('coursepick reached pad-only');
  await page.pressPad('down'); await sleep(200);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='diffpick'`, 'diffpick', 8000);
  console.log('course =', await page.eval('__fc.course()'));
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='flyover'`, 'flyover (poco skips roundpick)', 25000);
  console.log('hole', await page.eval('__fc.hole()'), 'build', JSON.stringify(await page.eval('__fc.lastBuild()')));
  await sleep(1200);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='address'`, 'address', 15000);
  console.log('address budget', JSON.stringify(await page.eval('__fc.info()')));
  console.log('holeRec', JSON.stringify(await page.eval('__fc.holeRec()')));
  console.log('bucket', JSON.stringify(await page.eval('__fc.bucket()')));
  console.log('houses', await page.eval('__fc.houses().length'), 'tramps', await page.eval('__fc.tramps().length'));
  console.log('hud', await page.eval('__fc.holeInfoText()'));

  for (let h = 1; h <= 9; h++) {
    await page.eval(`__fc.gotoHole(${h})`);
    await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${h}`, 'hole ' + h, 25000);
    await page.pressPad('south');
    await page.waitFor(`__fc.state()==='address'`, 'address ' + h, 20000);
    await sleep(260);
    const b = await page.eval('__fc.lastBuild()');
    const i = await page.eval('__fc.info()');
    const r = await page.eval('__fc.holeRec()');
    console.log(`H${h} ${r.name.padEnd(20)} par${r.par} ${String(r.yds).padStart(3)}y  build ${b.ms.toFixed(1)}ms  calls ${i.calls}  tris ${i.tris}  houses ${r.scenery.houses} trees ${r.scenery.trees} water ${JSON.stringify(r.water.map(w => w.t))}`);
  }
  console.log('errors:', page.errors.length, page.errors.slice(0, 5).join(' | '));
  await page.close();
} finally {
  chrome.kill(); await srv.close();
}
