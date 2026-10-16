import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const chromiumBinary = process.env.CHROMIUM_PATH || 'chromium';
const browserAvailable = spawnSync(chromiumBinary, ['--version'], { stdio: 'ignore' }).status === 0;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHttp(url, child, logs) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before serving the test page.\n${logs.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for the profile interaction test page.\n${logs.join('')}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

class CdpPage {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Chromium closed the debugging connection.'));
      }
      this.pending.clear();
    });
  }

  async ready() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Chromium debugging connection timed out.')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Could not connect to Chromium debugging.'));
      }, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chromium command timed out: ${method}`));
      }, 15_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description
          || response.exceptionDetails.text
          || 'Browser expression failed.',
      );
    }
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitForTestResult(page, browserLogs) {
  const deadline = Date.now() + 20_000;
  let latest;
  while (Date.now() < deadline) {
    latest = await page.evaluate(`(() => ({
      status: document.body?.dataset.testStatus || '',
      output: document.querySelector('#test-results')?.textContent || '',
    }))()`);
    if (latest.status === 'passed' || latest.status === 'failed') return latest;
    await delay(100);
  }
  throw new Error(`Timed out waiting for the React interaction test.\n${JSON.stringify(latest)}\n${browserLogs.join('')}`);
}

test('each real profile preference button updates its value and polite announcement once', {
  skip: browserAvailable ? false : 'requires the installed Chromium browser',
  timeout: 90_000,
}, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'profile-preference-browser-'));
  const port = await getFreePort();
  const cdpPort = await getFreePort();
  const logs = [];
  const browserLogs = [];
  const vite = spawn(path.join(appRoot, 'node_modules/.bin/vite'), [
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ], { cwd: appRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  vite.stderr.on('data', (chunk) => logs.push(String(chunk)));
  const browser = spawn(chromiumBinary, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${path.join(tempDir, 'chromium-profile')}`,
    'about:blank',
  ], { cwd: appRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', (chunk) => browserLogs.push(String(chunk)));

  let page;
  let targetId;
  try {
    const viteBase = `http://127.0.0.1:${port}`;
    const cdpBase = `http://127.0.0.1:${cdpPort}`;
    await waitForHttp(`${viteBase}/config.json`, vite, logs);
    await waitForHttp(`${cdpBase}/json/version`, browser, browserLogs);
    const targetResponse = await fetch(`${cdpBase}/json/new?about%3Ablank`, { method: 'PUT' });
    assert.ok(targetResponse.ok, `Could not create a Chromium page (${targetResponse.status}).`);
    const target = await targetResponse.json();
    targetId = target.id;
    page = new CdpPage(target.webSocketDebuggerUrl);
    await page.ready();
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Page.navigate', {
      url: new URL('/test/fixtures/profile-preference-interaction.browser.html', viteBase).toString(),
    });
    const pageResult = await waitForTestResult(page, browserLogs);
    assert.equal(
      pageResult.status,
      'passed',
      `The browser interaction test failed.\n${pageResult.output}`,
    );
    const results = JSON.parse(pageResult.output);

    assert.deepEqual(
      results.map(({ field }) => field),
      ['rolePref', 'safetyPref', 'playstylePref', 'howManyPref', 'wherePref'],
    );
    for (const result of results) {
      assert.notEqual(result.displayedValue, result.previousValue, `${result.field} should visibly change`);
      assert.equal(result.callbackCount, 1, `${result.field} callback should run once`);
      assert.equal(result.announcement, result.accessibleName, `${result.field} announcement should match the button`);
      assert.ok(result.announcement.endsWith(`: ${result.displayedValue}`));
      assert.equal(result.announcementMutationCount, 1, `${result.field} should make one live-region update`);
    }
  } finally {
    page?.close();
    if (targetId) {
      try {
        await fetch(`http://127.0.0.1:${cdpPort}/json/close/${targetId}`);
      } catch {}
    }
    await stopChild(browser);
    await stopChild(vite);
    await rm(tempDir, { recursive: true, force: true });
  }
});
