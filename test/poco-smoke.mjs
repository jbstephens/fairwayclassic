// THE POCO OPEN — fast dev smoke (FC-10): boot pad-only into the 9, build
// every hole, and print the four laws the course now lives by — no golf-
// course furniture, a dry bucket, no drowned lots, and a grass chain a bot
// can actually play down.  Not the shipped bar (harness.mjs PART P owns
// that) — this is the iteration loop.
//   node --experimental-websocket test/poco-smoke.mjs [--bot]
import { serveRepo, launchChrome, openPage, sleep } from './lib.mjs';

const BOT = process.argv.includes('--bot');
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
  await page.pressPad('down'); await sleep(200);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='diffpick'`, 'diffpick', 8000);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='flyover'`, 'flyover (poco skips roundpick)', 25000);
  await sleep(1200);
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='address'`, 'address', 15000);

  console.log('##  name                  par   yds   ms  calls    tris  house  lot fence sign call | surfaces');
  for (let h = 1; h <= 9; h++) {
    await page.eval(`__fc.gotoHole(${h})`);
    await page.waitFor(`__fc.state()==='flyover' && __fc.hole()===${h}`, 'hole ' + h, 25000);
    await page.pressPad('south');
    await page.waitFor(`__fc.state()==='address'`, 'address ' + h, 20000);
    await sleep(200);
    const b = await page.eval('__fc.lastBuild()');
    const i = await page.eval('__fc.info()');
    const r = await page.eval('__fc.holeRec()');
    const cen = await page.eval('__fc.surfCensus(4)');
    const NAMES = { 0: 'ROUGH', 1: 'FAIRWAY!', 2: 'green', 3: 'FRINGE!', 4: 'sand', 5: 'water',
      6: 'TEE!', 7: 'pave', 8: 'lawn', 9: 'scruff', 10: 'park' };
    const tot = Object.values(cen).reduce((a, c) => a + c, 0);
    const surf = Object.keys(cen).sort((a, c) => cen[c] - cen[a])
      .map(k => `${NAMES[k]} ${(cen[k] / tot * 100).toFixed(0)}%`).join(' ');
    const dry = await page.eval('__fc.bucketDry()');
    const uw = await page.eval('__fc.underwaterLots()');
    const ch = await page.eval('__fc.grassChain()');
    const lots = await page.eval('__fc.lots().length');
    const fen = await page.eval('__fc.fences().length');
    const sg = await page.eval('__fc.signs().length');
    const co = await page.eval('__fc.callouts()');
    console.log(`${String(h).padStart(2)}  ${r.name.padEnd(20)}  ${r.par}  ${String(r.yds).padStart(4)} ` +
      `${b.ms.toFixed(0).padStart(4)}  ${String(i.calls).padStart(5)}  ${String(i.tris).padStart(6)} ` +
      ` ${String(r.scenery.houses).padStart(5)} ${String(lots).padStart(4)} ${String(fen).padStart(5)} ` +
      `${String(sg).padStart(4)} ${String(co.length).padStart(4)} | ${surf}`);
    console.log(`    bucket: surf ${dry.pinSurf} water ${dry.pinWater}/${dry.ringWater} wetRing ${dry.wetRing}` +
      ` puttable ${dry.puttable} | underwater lots ${uw.length}${uw.length ? ' ' + JSON.stringify(uw[0]) : ''}` +
      ` | chain ${ch.gap} over ${ch.patches} patches ${ch.ok ? 'OK' : 'BROKEN'}` +
      ` | calls ${JSON.stringify(co)}`);
    if (BOT) {
      const t0 = Date.now();
      const bot = await page.eval('__fc.botPlay()');
      console.log(`    BOT: ${bot.strokes} strokes (par ${bot.par}, ${bot.vsPar >= 0 ? '+' : ''}${bot.vsPar})` +
        ` holed ${bot.holed} in ${((Date.now() - t0) / 1000).toFixed(1)}s  ` +
        bot.log.map(l => `${l.kind}->${l.ev}@${l.d}`).join(' '));
    }
  }
  console.log('errors:', page.errors.length, page.errors.slice(0, 5).join(' | '));
  await page.close();
} finally {
  chrome.kill(); await srv.close();
}
