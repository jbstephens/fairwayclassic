// Aim direction regression: pressing RIGHT must move the aim arc's endpoint
// RIGHT ON SCREEN (projected through the live game camera), and LEFT left.
// Born 2026-09-17 after v1 shipped with the sign inverted.
// Run: node --experimental-websocket test/aim-direction.mjs
import { serveRepo, launchChrome, openPage, sleep } from './lib.mjs';

const srv = await serveRepo({ port: 8983 });
const chrome = await launchChrome({ port: 9383 });
let fail = 0;
try {
  const page = await openPage(chrome.port, { padStub: false });
  await page.nav(`${srv.url}/index.html`);
  await page.waitFor(`window.__fc && window.__fc.state() === 'title'`, 'title', 15000);

  const key = async (code, ms = 60) => {
    const k = code === 'Space' ? ' ' : code;
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',code:'${code}',bubbles:true}))`);
    await sleep(ms);
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'${k}',code:'${code}',bubbles:true}))`);
  };
  // title -> diffpick -> roundpick -> flyover -> (skip) -> address
  for (const want of ['diffpick', 'roundpick', 'flyover']) {
    await key('Space'); await page.waitFor(`window.__fc.state() === '${want}'`, want, 8000); await sleep(300);
  }
  await sleep(1400); await key('Space');
  await page.waitFor(`window.__fc.state() === 'address'`, 'address', 10000);
  await sleep(400);

  // screen-space X of the arc endpoint, through the real camera
  const screenX = () => page.eval(`(() => {
    const e = window.__fc.arcEnd();
    const v = new THREE.Vector3(e[0], 0, e[1]);
    v.y = groundH(e[0], e[1]);
    v.project(camera);
    return v.x;
  })()`);

  const hold = async (code, ms) => {
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'${code}',code:'${code}',bubbles:true}))`);
    await sleep(ms);
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'${code}',code:'${code}',bubbles:true}))`);
    await sleep(250);
  };

  const x0 = await screenX();
  await hold('ArrowRight', 400);
  const xR = await screenX();
  await hold('ArrowLeft', 800);
  const xL = await screenX();

  const t = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + detail); if (!ok) fail++; };
  t('right key moves arc right on screen', xR > x0 + 0.01, `x ${x0.toFixed(3)} -> ${xR.toFixed(3)}`);
  t('left key moves arc left on screen', xL < xR - 0.01, `x ${xR.toFixed(3)} -> ${xL.toFixed(3)}`);
  t('zero console errors', page.errors.length === 0, page.errors.join(' | ') || 'clean');
} finally {
  chrome.kill();
  await srv.close();
}
process.exit(fail ? 1 : 0);
