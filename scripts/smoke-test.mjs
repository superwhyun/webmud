import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'mud-smoke-'));
const processes = [];
let browser;

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function launch(script, args, env, cwd = root) {
  const child = spawn(process.execPath, [join(root, script), ...args], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  processes.push(child);
  return () => logs;
}
async function waitReady(url, logs) {
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready: ${url}\n${logs()}`);
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timeout);
}

try {
  const serverPort = await freePort();
  const clientPort = await freePort();
  const api = `http://127.0.0.1:${serverPort}`;
  const site = `http://127.0.0.1:${clientPort}`;
  const serverLogs = launch('server/dist/index.js', [], {
    PORT: String(serverPort), DB_PATH: join(temporary, 'test.sqlite'), DEFAULT_ADMIN_PASSWORD: 'smoke-password',
  });
  const clientLogs = launch('node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', String(clientPort), '--strictPort'], { MUD_SERVER_URL: api }, join(root, 'client'));
  await Promise.all([waitReady(`${api}/health`, serverLogs), waitReady(site, clientLogs)]);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const intervals = new Set();
    const keydowns = new Set();
    const originalInterval = window.setInterval.bind(window);
    const originalClear = window.clearInterval.bind(window);
    window.setInterval = (handler, delay, ...args) => {
      const id = originalInterval(handler, delay, ...args);
      if (delay === 100) intervals.add(id);
      return id;
    };
    window.clearInterval = (id) => { intervals.delete(id); originalClear(id); };
    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    document.addEventListener = (type, listener, options) => { if (type === 'keydown') keydowns.add(listener); originalAdd(type, listener, options); };
    document.removeEventListener = (type, listener, options) => { if (type === 'keydown') keydowns.delete(listener); originalRemove(type, listener, options); };
    window.gameResources = () => ({ timers: intervals.size, keydowns: keydowns.size });
  });
  async function login() {
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('smoke-password');
    await page.locator('#auth-form button[type=submit]').click();
  }
  async function resources(expected) {
    assert.deepEqual(await page.evaluate(() => window.gameResources()), expected);
  }
  await page.goto(site);
  await login();
  await page.locator('#character-name').fill('검증용사');
  await page.locator('#character-form button[type=submit]').click();
  await page.locator('#room-header').filter({ hasText: '광장' }).waitFor();
  await resources({ timers: 1, keydowns: 2 });
  await page.locator('#command').fill('say 리팩토링검증');
  await page.locator('#command').press('Enter');
  await page.locator('#terminal .line-say').filter({ hasText: '리팩토링검증' }).waitFor();
  for (let i = 0; i < 3; i++) {
    await page.locator('#admin-entry').click();
    await page.locator('#admin-accounts-body tr').first().waitFor();
    await resources({ timers: 1, keydowns: 1 });
    await page.locator('#admin-back').click();
    await page.locator('#room-header').filter({ hasText: '광장' }).waitFor();
    await resources({ timers: 1, keydowns: 2 });
    await page.locator('#builder-entry').click();
    await page.locator('#builder-canvas g').first().waitFor();
    await resources({ timers: 1, keydowns: 1 });
    await page.locator('#builder-back').click();
    await page.locator('#command').waitFor();
    await resources({ timers: 1, keydowns: 2 });
  }
  await page.locator('#inventory-button').click();
  await page.locator('#character-sheet-modal').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#character-sheet-modal').waitFor({ state: 'hidden' });
  await page.locator('#logout-button').click();
  await page.locator('#auth-form').waitFor();
  await resources({ timers: 0, keydowns: 0 });
  await login();
  await page.locator('#room-header').filter({ hasText: '광장' }).waitFor();
  await resources({ timers: 1, keydowns: 2 });
  assert.equal(await page.locator('#terminal').getByText('리팩토링검증', { exact: false }).count(), 0);
  assert.deepEqual(errors, []);
  await page.locator('#logout-button').click();
  await resources({ timers: 0, keydowns: 0 });
  console.log('Browser smoke passed: login, character creation, chat, 3 admin/builder round trips, modal Escape, logout/relogin; no leaked timers or keyboard listeners, no page errors.');
} finally {
  await browser?.close();
  await Promise.all(processes.map(stop));
  await rm(temporary, { recursive: true, force: true });
}
