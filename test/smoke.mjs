// quick iteration smoke: boot, title shot, start a round, address shot,
// dump state + renderer info + screenshots into test/shots-dev/
import path from 'node:path';
import { ROOT, sleep, serveRepo, launchChrome, openPage } from './lib.mjs';

const HTTP = 8981, CDP = 9381;
const SHOTS = path.join(ROOT, 'test', 'shots-dev');

const srv = await serveRepo({ port: HTTP });
const chrome = await launchChrome({ port: CDP });
const page = await openPage(CDP);
try {
  await page.nav(`http://localhost:${HTTP}/`);
  await page.connectPad(0);
  await page.waitFor(`window.__fc && __fc.state()==='title'`, 'title');
  await sleep(600);
  await page.screenshot(path.join(SHOTS, 'smoke-title.png'));
  console.log('title info', JSON.stringify(await page.eval('__fc.info()')));
  // into the round
  await page.pressPad('south'); await sleep(300);
  await page.pressPad('south'); await sleep(300);   // AMATEUR
  await page.pressPad('south'); await sleep(300);   // FRONT 9
  await page.waitFor(`__fc.state()==='flyover'`, 'flyover', 12000);
  await sleep(2500);
  await page.screenshot(path.join(SHOTS, 'smoke-flyover.png'));
  await page.pressPad('south');   // skip
  await page.waitFor(`__fc.state()==='address'`, 'address', 8000);
  await sleep(800);
  await page.screenshot(path.join(SHOTS, 'smoke-address.png'));
  console.log('address info', JSON.stringify(await page.eval('__fc.info()')));
  console.log('lastBuild', JSON.stringify(await page.eval('__fc.lastBuild()')));
  console.log('players', JSON.stringify(await page.eval('__fc.players()')));
  console.log('club', await page.eval('__fc.club()'), 'dist', await page.eval('__fc.dist()'));
  // meter + shot
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='meter'`, 'meter');
  await sleep(700);
  await page.screenshot(path.join(SHOTS, 'smoke-meter.png'));
  await page.pressPad('south');
  await page.waitFor(`__fc.state()==='flight'`, 'flight', 4000);
  await sleep(1500);
  await page.screenshot(path.join(SHOTS, 'smoke-flight.png'));
  console.log('flight info', JSON.stringify(await page.eval('__fc.info()')));
  await page.waitFor(`__fc.state()==='address'||__fc.state()==='settle'`, 'settled', 20000);
  await sleep(1200);
  await page.screenshot(path.join(SHOTS, 'smoke-settled.png'));
  console.log('players after shot', JSON.stringify(await page.eval('__fc.players()')));
  console.log('\nerrors:', page.errors.length ? page.errors : 'none');
  if (page.rawErrors.length) console.log('raw (noise-filtered out):', page.rawErrors.slice(0, 5));
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
  try { await page.screenshot(path.join(SHOTS, 'smoke-fail.png')); } catch {}
  console.log('errors:', page.errors);
  process.exitCode = 1;
} finally {
  await page.close();
  chrome.kill();
  await srv.close();
}
