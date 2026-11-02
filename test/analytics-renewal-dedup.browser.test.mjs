import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createPendingAccessRecheck } from '../src/utils/access-entitlements.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testDir, '..');
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

async function waitForHttp(url, child, logs, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited early.\n${logs.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.\n${logs.join('')}`);
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

async function waitForPageState(page, expression, predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await page.evaluate(expression);
      if (predicate(latest)) return latest;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}. Latest browser state: ${JSON.stringify(latest)}`);
}

async function openTestTab(cdpBase, viteBase, fixturePath, marker) {
  const targetResponse = await fetch(`${cdpBase}/json/new?about%3Ablank`, { method: 'PUT' });
  if (!targetResponse.ok) {
    throw new Error(`Could not create a Chromium tab (${targetResponse.status}).`);
  }

  const target = await targetResponse.json();
  const page = new CdpPage(target.webSocketDebuggerUrl);
  await page.ready();
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  const url = new URL(fixturePath, viteBase);
  url.searchParams.set('marker', JSON.stringify(marker));
  if (fixturePath.includes('/hkmo-date/')) url.searchParams.set('mode', 'gay');
  await page.send('Page.navigate', { url: url.toString() });
  return { page, targetId: target.id };
}

async function closeTestTab(cdpBase, tab) {
  tab.page.close();
  try {
    await fetch(`${cdpBase}/json/close/${tab.targetId}`);
  } catch {}
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

function makeRenewalMarker({
  accountId = 'tg_browser_test_account_19370',
  location = 'active_filter_subscription',
  minimumExpiry,
} = {}) {
  const now = Date.now();
  const marker = createPendingAccessRecheck({
    accountId,
    entitlement: 'filter',
    startedAt: now,
    createdAt: now,
    minimumExpiry: minimumExpiry ?? now + 29 * 24 * 60 * 60 * 1000,
    location,
    allowActiveRenewal: true,
  }, now);
  assert.ok(marker, 'the test fixture should create a valid synthetic renewal marker');
  return marker;
}

test('real Web Locks deduplicate each renewal separately across Who’s Nearby and HKMO Date tabs', {
  skip: browserAvailable ? false : 'requires the installed Chromium browser',
  timeout: 90_000,
}, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'renewal-dedup-browser-'));
  const vitePort = await getFreePort();
  const cdpPort = await getFreePort();
  const viteLogs = [];
  const browserLogs = [];
  const vite = spawn(path.join(appRoot, 'node_modules/.bin/vite'), [
    '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort',
  ], { cwd: appRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  vite.stderr.on('data', (chunk) => viteLogs.push(String(chunk)));

  const browserEnvironment = { ...process.env };
  delete browserEnvironment.DBUS_SESSION_BUS_ADDRESS;
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
  ], { cwd: appRoot, stdio: ['ignore', 'ignore', 'pipe'], env: browserEnvironment });
  browser.stderr.on('data', (chunk) => browserLogs.push(String(chunk)));

  const tabs = [];
  try {
    const viteBase = `http://127.0.0.1:${vitePort}`;
    const cdpBase = `http://127.0.0.1:${cdpPort}`;
    await waitForHttp(`${viteBase}/config.json`, vite, viteLogs, 'Vite');
    await waitForHttp(`${cdpBase}/json/version`, browser, browserLogs, 'Chromium', 30_000);

    const marker = makeRenewalMarker();
    const secondMarker = makeRenewalMarker({
      accountId: marker.accountId,
      minimumExpiry: marker.minimumExpiry + 24 * 60 * 60 * 1000,
      location: 'filter_expiry_notice',
    });
    const entries = [
      {
        id: 'nearby',
        path: '/test/fixtures/renewal-dedup/whos-nearby/',
      },
      {
        id: 'hkmo-date',
        path: '/test/fixtures/renewal-dedup/hkmo-date/',
      },
    ];

    for (const entry of entries) {
      const tab = await openTestTab(cdpBase, viteBase, entry.path, marker);
      tabs.push(tab);
      const readyState = await waitForPageState(
        tab.page,
        `({
          ready: document.body?.dataset.ready || '',
          error: document.body?.dataset.error || '',
          entry: document.body?.dataset.appEntry || '',
        })`,
        (state) => state?.ready === 'true' || state?.ready === 'failed',
        `${entry.id} renewal reporter setup`,
      );
      assert.equal(readyState.ready, 'true', `${entry.id} setup error: ${readyState.error}`);
      assert.equal(readyState.entry, entry.id);
      assert.equal(await tab.page.evaluate('typeof navigator.locks?.request'), 'function',
        `${entry.id} uses the browser's real Web Locks API`);
      assert.equal(await tab.page.evaluate('typeof localStorage.getItem'), 'function',
        `${entry.id} uses the browser's real localStorage`);
    }

    await tabs[0].page.evaluate(`(() => {
      localStorage.removeItem('__filter_renewal_dedup_browser_test_lock_probe_count__');
      localStorage.removeItem('__filter_renewal_dedup_browser_test_lock_probe_ready:nearby');
      localStorage.removeItem('__filter_renewal_dedup_browser_test_lock_probe_ready:hkmo-date');
    })()`);
    const lockProbeResults = await Promise.all(
      tabs.map(({ page }) => page.evaluate('window.runNativeLockProbe()')),
    );
    assert.deepEqual([...lockProbeResults].sort(), [1, 2],
      `the browser must serialize same-origin tab locks; results=${JSON.stringify(lockProbeResults)}`);

    const reportResults = await Promise.all(
      tabs.map(({ page }) => page.evaluate('window.startRenewalReport()')),
    );
    const secondReportResults = await Promise.all(
      tabs.map(({ page }) =>
        page.evaluate(`window.startRenewalReport(${JSON.stringify(secondMarker)})`)
      ),
    );
    const replayResults = await Promise.all(
      tabs.map(({ page }) => page.evaluate(`(async () => [
        await window.startRenewalReport(${JSON.stringify(marker)}),
        await window.startRenewalReport(${JSON.stringify(secondMarker)}),
      ])()`)),
    );
    const finalState = await tabs[0].page.evaluate(`(() => {
      const eventKeys = [
        '__filter_renewal_dedup_browser_test_events:nearby',
        '__filter_renewal_dedup_browser_test_events:hkmo-date',
      ];
      const events = eventKeys.flatMap((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      });
      const claimKeys = Object.keys(localStorage)
        .filter((key) => key.startsWith('whos-nearby:filter-renewal-confirmed:v1:'));
      const allStorage = [...Object.keys(localStorage), ...Object.values(localStorage)];
      return {
        events,
        claimKeys,
        claimValues: claimKeys.map((key) => localStorage.getItem(key)),
        accountIdStored: allStorage.some((value) => value.includes(${JSON.stringify(marker.accountId)})),
        paymentMarkerStored: allStorage.some((value) =>
          value.includes(${JSON.stringify(String(marker.minimumExpiry))}) ||
          value.includes(${JSON.stringify(String(secondMarker.minimumExpiry))})
        ),
      };
    })()`);

    assert.equal(reportResults.filter(Boolean).length, 1,
      `both tabs racing on the first marker should produce one claim; results=${JSON.stringify(reportResults)}, state=${JSON.stringify(finalState)}`);
    assert.equal(reportResults.filter((reported) => reported === false).length, 1,
      'the losing tab should observe the existing cross-window claim');
    assert.equal(secondReportResults.filter(Boolean).length, 1,
      `the later expiry marker should produce one separate claim; results=${JSON.stringify(secondReportResults)}, state=${JSON.stringify(finalState)}`);
    assert.equal(secondReportResults.filter((reported) => reported === false).length, 1,
      'the losing tab should observe the later marker’s cross-window claim');
    assert.deepEqual(replayResults, [[false, false], [false, false]],
      'replaying either marker from either tab must remain deduplicated');
    assert.equal(finalState.events.length, 2,
      'each distinct renewal should produce exactly one confirmation event');
    const expectedEvents = [
      { name: 'filter_renewal_confirmed', data: { location: marker.location } },
      { name: 'filter_renewal_confirmed', data: { location: secondMarker.location } },
    ].sort((left, right) => left.data.location.localeCompare(right.data.location));
    assert.deepEqual(
      [...finalState.events].sort((left, right) => left.data.location.localeCompare(right.data.location)),
      expectedEvents,
      'both event payloads should contain only their approved non-identifying location',
    );
    assert.ok(finalState.events.every((event) => Object.keys(event.data).length === 1 &&
      typeof event.data.location === 'string'));
    assert.equal(finalState.claimKeys.length, 2, 'the two markers should have separate persistent claims');
    assert.equal(finalState.accountIdStored, false, 'the account identifier must not be stored in the claim or event');
    assert.equal(finalState.paymentMarkerStored, false,
      'expiry markers must not be stored in analytics event data or dedup claims');
  } catch (error) {
    const context = [
      `Vite logs:\n${viteLogs.join('')}`,
      `Chromium logs:\n${browserLogs.join('')}`,
    ].join('\n');
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${context}`, { cause: error });
  } finally {
    const cdpBase = `http://127.0.0.1:${cdpPort}`;
    await Promise.all(tabs.map((tab) => closeTestTab(cdpBase, tab)));
    await stopChild(browser);
    await stopChild(vite);
    await rm(tempDir, { recursive: true, force: true });
  }
});
