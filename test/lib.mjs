// FAIRWAY CLASSIC — headless verification glue (house-rules CDP harness).
// node stdlib + built-in WebSocket only; run under node --experimental-websocket.
// Patterns lifted from gameconsole/lib/harness.mjs (the committed standard).

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

if (typeof globalThis.WebSocket !== 'function') {
  throw new Error('needs built-in WebSocket — run node with --experimental-websocket');
}

// controller.js: fulfilled from the sibling gameconsole repo (read-only).
const CTRL_PATH = path.resolve(ROOT, '..', 'gameconsole', 'lib', 'controller.js');
export const CONTROLLER_JS = fs.readFileSync(CTRL_PATH, 'utf8');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png' };
export function serveRepo({ root = ROOT, port = 8981 } = {}) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        rsp.writeHead(404); rsp.end(); return;
      }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(rsp);
    });
    srv.listen(port, () => res({
      server: srv, port, url: `http://localhost:${port}`,
      close: () => new Promise(r => srv.close(r)),
    }));
  });
}

export async function launchChrome({ port = 9381, extraArgs = [], window = [1280, 720] } = {}) {
  const userDir = fs.mkdtempSync('/tmp/fc-harness-');
  const proc = spawn(CHROME, [
    '--headless=new', '--mute-audio', '--no-first-run', '--enable-unsafe-swiftshader',
    `--window-size=${window[0]},${window[1]}`, '--force-device-scale-factor=1', '--hide-scrollbars',
    '--user-data-dir=' + userDir, '--remote-debugging-port=' + port, ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://localhost:${port}/json/version`); if (r.ok) break; } catch {}
    await sleep(100);
  }
  return {
    proc, port,
    kill() { try { proc.kill(); } catch {} try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {} },
  };
}

export function connectCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const handlers = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
      },
      on(method, fn) { handlers.set(method, fn); },
      close() { try { ws.close(); } catch {} },
    });
    ws.onerror = () => reject(new Error('CDP ws error ' + wsUrl));
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method && handlers.has(m.method)) {
        try { handlers.get(m.method)(m.params); } catch (e) { console.error('CDP handler', e); }
      }
    };
  });
}

// standard-mapping gamepad stub — injected BEFORE page scripts
export const GAMEPAD_STUB = `
window.__pads=[null,null,null,null];
var __N={south:0,east:1,west:2,north:3,l1:4,r1:5,l2:6,r2:7,select:8,start:9,l3:10,r3:11,up:12,down:13,left:14,right:15,home:16};
function __mkPad(i){return {index:i,id:'Stub Standard Pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},function(){return {pressed:false,value:0,touched:false};}),timestamp:performance.now()};}
window.__connectPad=function(i){if(!window.__pads[i])window.__pads[i]=__mkPad(i);window.dispatchEvent(new Event('gamepadconnected'));};
window.__press=function(i,name,down){if(!window.__pads[i])window.__pads[i]=__mkPad(i);var b=window.__pads[i].buttons[__N[name]];b.pressed=down;b.value=down?1:0;window.__pads[i].timestamp=performance.now();};
window.__axis=function(i,ax,v){if(!window.__pads[i])window.__pads[i]=__mkPad(i);window.__pads[i].axes[ax]=v;window.__pads[i].timestamp=performance.now();};
navigator.getGamepads=function(){return window.__pads;};
`;

export const NOISE_RE = /controller\.js|favicon|Failed to load resource|ERR_INTERNET|ERR_NAME_NOT_RESOLVED|net::ERR|swiftshader|GroupMarkerNotSet|Automatic fallback/i;

export async function openPage(cdpPort, { width = 1280, height = 720, inject = [], touch = false, padStub = true } = {}) {
  const r = await fetch(`http://localhost:${cdpPort}/json/new?about:blank`, { method: 'PUT' });
  const target = await r.json();
  const c = await connectCDP(target.webSocketDebuggerUrl);
  const errors = [], rawErrors = [];
  c.on('Runtime.consoleAPICalled', p => {
    if (p.type !== 'error') return;
    const text = 'console.error: ' + (p.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    rawErrors.push(text);
    if (!NOISE_RE.test(text)) errors.push(text);
  });
  c.on('Runtime.exceptionThrown', p => {
    const d = p.exceptionDetails;
    const text = 'exception: ' + (d.exception?.description || d.text || '');
    rawErrors.push(text);
    if (!NOISE_RE.test(text)) errors.push(text);
  });
  c.on('Log.entryAdded', p => {
    if (p.entry.level !== 'error') return;
    const text = 'log: ' + p.entry.text;
    rawErrors.push(text);
    if (p.entry.source !== 'network' && !NOISE_RE.test(text)) errors.push(text);
  });
  c.on('Fetch.requestPaused', async p => {
    try {
      await c.send('Fetch.fulfillRequest', {
        requestId: p.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
        body: Buffer.from(CONTROLLER_JS).toString('base64'),
      });
    } catch {}
  });
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Log.enable');
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*controller.js*' }] });
  await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: !!touch });
  if (touch) {
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await c.send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
  }
  const stubs = padStub ? [GAMEPAD_STUB, ...inject] : inject;
  for (const src of stubs) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: src });

  let loaded; const loadedP = new Promise(res => { loaded = res; });
  c.on('Page.loadEventFired', () => loaded());

  const page = {
    c, errors, rawErrors, target,
    async nav(url) {
      await c.send('Page.navigate', { url });
      await Promise.race([loadedP, sleep(20000)]);
      await page.eval('new Promise(r=>{let n=0;(function f(){if(++n>=5)r(1);else requestAnimationFrame(f);})();})');
    },
    async eval(expr) {
      const res = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 20000 });
      if (res.exceptionDetails) throw new Error('eval failed: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
      return res.result.value;
    },
    async waitFor(expr, what, timeout = 8000) {
      const t0 = Date.now();
      for (;;) {
        if (await page.eval(expr)) return;
        if (Date.now() - t0 > timeout) throw new Error('TIMEOUT waiting for ' + what + ' (' + expr.slice(0, 100) + ')');
        await sleep(60);
      }
    },
    async connectPad(i = 0) { await page.eval(`__connectPad(${i})`); },
    // Hold the button DOWN until the page's ArcadeController actually fires
    // the press event — under SwiftShader the rAF poll can stall >100ms, and
    // a fixed-length hold can fall entirely between two polls (press lost).
    async ensurePressWitness() {
      await page.eval(`window.__pw || (window.__pw = [], window.__rw = [],
        window.ArcadeController && (
          ArcadeController.on('press',   function(e){ __pw.push([e.padIndex, e.button]); }),
          ArcadeController.on('release', function(e){ __rw.push([e.padIndex, e.button]); })))`);
    },
    // Both edges are WITNESSED through the real controller event stream:
    // under SwiftShader a stalled frame can swallow a fixed-length press
    // (down+up inside one poll gap), or merge a release with the NEXT press
    // into one continuously-held button. Holding until the press event fires,
    // and staying released until the release event fires, makes every
    // pressPad an observed, discrete edge on the real input path.
    async pressPad(name, holdMs = 110, i = 0) {
      await page.ensurePressWitness();
      const n0 = await page.eval('__pw.length');
      const r0 = await page.eval('__rw.length');
      await page.eval(`__connectPad(${i});__press(${i},'${name}',true)`);
      const t0 = Date.now();
      for (;;) {
        if (await page.eval(`__pw.slice(${n0}).some(p => p[0] === ${i} && p[1] === '${name}')`)) break;
        if (Date.now() - t0 > 6000) break;   // give up; release anyway
        await sleep(20);
      }
      await page.eval(`__press(${i},'${name}',false)`);
      const t1 = Date.now();
      for (;;) {
        if (await page.eval(`__rw.slice(${r0}).some(p => p[0] === ${i} && p[1] === '${name}')`)) break;
        if (Date.now() - t1 > 6000) break;
        await sleep(20);
      }
    },
    async holdPad(name, down, i = 0) { await page.eval(`__connectPad(${i});__press(${i},'${name}',${down})`); },
    async axisPad(ax, v, i = 0) { await page.eval(`__axis(${i},${ax},${v})`); },
    async key(key, code, vk, holdMs = 90) {
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await sleep(holdMs);
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    },
    // multi-touch (CDP contract: every active point in each event)
    points: new Map(),
    dispatch(type) {
      const touchPoints = [...page.points.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id }));
      return c.send('Input.dispatchTouchEvent', { type, touchPoints });
    },
    async tStart(id, x, y) { page.points.set(id, { x, y }); await page.dispatch('touchStart'); },
    async tMove(id, x, y) { page.points.set(id, { x, y }); await page.dispatch('touchMove'); },
    async tEnd(id) { await page.dispatch('touchEnd'); page.points.delete(id); },
    async tap(x, y, hold = 110) { await page.tStart(9, x, y); await sleep(hold); await page.tEnd(9); },
    async rectCenter(sel) {
      return page.eval(`(function(){ const el = document.querySelector('${sel}'); if (!el) return null;
        const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    },
    async screenshot(file) {
      const s = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    },
    async close() { c.close(); try { await fetch(`http://localhost:${cdpPort}/json/close/${target.id}`); } catch {} },
  };
  return page;
}

// tiny assertion collector
export function makeT() {
  const results = [];
  return {
    results,
    ok(cond, name) {
      results.push({ name, ok: !!cond });
      console.log((cond ? '  PASS ' : '  FAIL ') + name);
      if (!cond) process.exitCode = 1;
      return !!cond;
    },
    summary() {
      const bad = results.filter(r => !r.ok);
      console.log(`\n${results.length - bad.length}/${results.length} assertions passed`);
      if (bad.length) { console.log('FAILURES:'); for (const b of bad) console.log('  - ' + b.name); }
      return bad.length === 0;
    },
  };
}
