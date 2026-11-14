import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { resolveAppEntry } from '../src/config/resolve-app-entry.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testDir, '..');
const chromiumBinary = process.env.CHROMIUM_PATH || 'chromium';
const browserAvailable = spawnSync(chromiumBinary, ['--version'], { stdio: 'ignore' }).status === 0;
const appRuntimeConfig = JSON.parse(
  await import('node:fs/promises').then(({ readFile }) =>
    readFile(path.join(appRoot, 'public/config.json'), 'utf8'),
  ),
);
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
    if (child.exitCode !== null) throw new Error(`${label} exited early.\n${logs.join('')}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.\n${logs.join('')}`);
}

function browserBootstrap(scenario) {
  return `(() => {
    const scenario = ${JSON.stringify(scenario)};
    const workerOriginPattern = /\\.workers\\.dev$/;
    const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    const profile = (id, name, gender, seeking = 'men') => ({
      id,
      name,
      username: name.toLowerCase().replaceAll(' ', '_'),
      avatar: '',
      lat: 22.3193,
      lng: 114.1694,
      dob: '1990-01-01',
      gender,
      seeking,
      height: '170',
      weight: '70',
      role_pref: 'Versatile',
      safety_pref: 'Safe',
      playstyle_pref: 'Clean',
      how_many_pref: 'DoesntMatter',
      where_pref: null,
      non_man_mode: 'Meet up',
      is_underage: false,
      hide_age: false,
      hide_age_expiry: null,
      grid_visible: true,
      invisible_expiry: null,
      map_visible: false,
      vip_expiry: null,
      filter_sub_expiry: null,
      edit_profile_pass: false,
      edit_profile_expiry: null,
    });
    const currentProfile = profile('tg_123456', 'Browser admin', 'man');
    const targetProfiles = [
      profile('tg_654321', 'Man target', 'man'),
      profile('tg_654322', 'Woman target', 'woman'),
      profile('tg_654323', 'Nonbinary target', 'non-binary'),
    ];

    window.Telegram = {
      WebApp: {
        initData: 'query_id=force-swap-browser&auth_date=1791676800&hash=synthetic-test-data',
        initDataUnsafe: {
          user: {
            id: 123456,
            first_name: 'Browser admin',
            username: 'browser_admin',
            language_code: 'en',
          },
          ...(scenario.startParam ? { start_param: scenario.startParam } : {}),
        },
        ready() {},
        expand() {},
        showAlert() {},
      },
    };
    window.__forceSwapCalls = [];
    window.__forceSwapResolvers = [];
    window.__forceSwapAlerts = [];
    window.__genderHistoryCalls = [];
    window.__genderHistoryRecords = [];
    window.confirm = () => true;
    window.alert = (message) => window.__forceSwapAlerts.push(String(message));
    window.__forceSwapResolveNext = (result) => {
      const resolve = window.__forceSwapResolvers.shift();
      if (!resolve) throw new Error('There is no pending force-swap response.');
      if (result?.status === 200 && result.payload?.gender === 'woman') {
        window.__genderHistoryRecords.unshift({
          actorTelegramId: '123456',
          previousGender: 'man',
          newGender: 'woman',
          changedAt: '2030-01-02T03:04:05.000Z',
        });
      }
      resolve(result);
    };
    try {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success) {
            queueMicrotask(() => success({
              coords: { latitude: 22.3193, longitude: 114.1694, accuracy: 10 },
            }));
          },
        },
      });
    } catch {}

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.origin === location.origin) return originalFetch(input, init);
      let body = {};
      try { body = JSON.parse(init.body || '{}'); } catch {}
      if (!workerOriginPattern.test(url.hostname)) {
        if (url.pathname.endsWith('/tonconnect-manifest.json')) {
          return json({ url: 'https://example.invalid', name: 'Browser test', iconUrl: 'https://example.invalid/icon.png' });
        }
        return json({});
      }
      switch (url.pathname) {
        case '/api/auth':
          return json({
            profile: currentProfile,
            role: scenario.role,
            bot: scenario.botKey,
            globalVipUntil: scenario.role === 'admin' ? Date.now() + 86_400_000 : 0,
            telegramPremium: false,
          });
        case '/api/profile':
          return json({ updated: true, profile: { ...currentProfile, ...(body.profile || {}) } });
        case '/api/nearby':
          return json(targetProfiles);
        case '/api/admin/profile/gender-change-history':
          window.__genderHistoryCalls.push({ bot: body.bot, targetId: body.target_id });
          return json({
            records: window.__genderHistoryRecords.filter(
              (record) => body.target_id === 'tg_654321',
            ),
          });
        case '/api/force-swap-sex':
          window.__forceSwapCalls.push({ path: url.pathname, bot: body.bot, targetId: body.target_id });
          return new Promise((resolve) => {
            window.__forceSwapResolvers.push(({ status = 200, payload = {} } = {}) => {
              resolve(json(payload, status));
            });
          });
        case '/api/raffle/state':
          return json({
            serverNow: new Date().toISOString(),
            closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            latestDraw: null,
            canPurchase: false,
          });
        case '/api/messages/feed':
          return json({ starsPrice: 0, messages: [] });
        case '/api/access-recovery/recover':
          return json({ pending: null });
        default:
          return json({});
      }
    };
  })();`;
}

class CdpPage {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.browserMessages = [];
    this.socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.method === 'Runtime.exceptionThrown') {
        this.browserMessages.push(message.params.exceptionDetails?.exception?.description
          || message.params.exceptionDetails?.text
          || 'Unspecified browser exception');
      } else if (message.method === 'Runtime.consoleAPICalled') {
        const text = message.params.args?.map((arg) => arg.value || arg.description || '').join(' ');
        if (text) this.browserMessages.push(text);
      }
    });
    this.socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
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
      throw new Error(response.exceptionDetails.exception?.description
        || response.exceptionDetails.text
        || 'Browser expression failed.');
    }
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitForBrowserValue(page, expression, predicate, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await page.evaluate(expression);
      if (predicate(latest)) return latest;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(latest)}\nBrowser messages: ${page.browserMessages.join('\n')}`);
}

async function openTestPage(cdpBase, viteBase, scenario) {
  const targetResponse = await fetch(`${cdpBase}/json/new?about%3Ablank`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Could not create a Chromium page (${targetResponse.status}).`);
  const target = await targetResponse.json();
  const page = new CdpPage(target.webSocketDebuggerUrl);
  await page.ready();
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: browserBootstrap(scenario),
  });
  await page.send('Page.navigate', {
    url: new URL('/test/fixtures/force-swap.browser.html', viteBase).toString(),
  });
  return { page, targetId: target.id };
}

async function closeTestPage(cdpBase, page, targetId) {
  page.close();
  try { await fetch(`${cdpBase}/json/close/${targetId}`); } catch {}
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

async function openProfile(page, name) {
  await page.evaluate(`(() => {
    const initial = ${JSON.stringify(name.charAt(0))};
    const tile = [...document.querySelectorAll('main [aria-hidden="true"]')]
      .find((node) => node.textContent.trim() === initial);
    if (!tile) throw new Error('Could not find the profile tile for ${name}.');
    tile.parentElement.click();
  })()`);
  await waitForBrowserValue(
    page,
    `document.querySelector('h2')?.textContent || ''`,
    (value) => value === name,
    `${name} profile`,
  );
}

async function closeProfile(page) {
  await page.evaluate(`document.querySelector('[style*="rgba(0, 0, 0, 0.7)"]')?.click()`);
  await waitForBrowserValue(
    page,
    `Boolean(document.querySelector('[data-testid="admin-force-swap-sex"]'))`,
    (visible) => !visible,
    'the profile card to close',
  );
}

test('both Telegram entries gate force-swap controls and wait for server confirmation', {
  skip: browserAvailable ? false : 'requires the installed Chromium browser',
  timeout: 120_000,
}, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'force-swap-browser-'));
  const vitePort = await getFreePort();
  const cdpPort = await getFreePort();
  const viteLogs = [];
  const browserLogs = [];
  const vite = spawn(path.join(appRoot, 'node_modules/.bin/vite'), [
    '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort',
  ], { cwd: appRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  vite.stderr.on('data', (chunk) => viteLogs.push(String(chunk)));
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

  const openedPages = [];
  try {
    const viteBase = `http://127.0.0.1:${vitePort}`;
    const cdpBase = `http://127.0.0.1:${cdpPort}`;
    await waitForHttp(`${viteBase}/config.json`, vite, viteLogs, 'Vite');
    await waitForHttp(`${cdpBase}/json/version`, browser, browserLogs, 'Chromium');

    for (const appCase of [
      { entryId: 'nearby', startParam: null, botKey: 'botB' },
      { entryId: 'hkmo-date', startParam: 'gaymode', botKey: 'botA' },
    ]) {
      const entry = resolveAppEntry(appRuntimeConfig, appCase.startParam);
      assert.equal(entry.id, appCase.entryId);
      assert.equal(entry.botKey, appCase.botKey);

      const adminPageInfo = await openTestPage(cdpBase, viteBase, {
        ...appCase,
        role: 'admin',
      });
      openedPages.push({ page: adminPageInfo.page, targetId: adminPageInfo.targetId });
      const { page } = adminPageInfo;
      await waitForBrowserValue(
        page,
        `(() => ({
          mounted: document.querySelector('#root')?.dataset.appMounted || '',
          html: document.querySelector('#root')?.innerHTML || '',
        }))()`,
        (value) => value.mounted === 'true' && value.html.length > 0,
        `${entry.id} app startup`,
      );
      await waitForBrowserValue(
        page,
        `document.querySelectorAll('main [aria-hidden="true"]').length`,
        (count) => count >= 3,
        `${entry.id} nearby profiles`,
      );

      for (const [name, gender, expectedDisabled] of [
        ['Man target', 'man', false],
        ['Woman target', 'woman', false],
        ['Nonbinary target', 'non-binary', true],
      ]) {
        await openProfile(page, name);
        const control = await waitForBrowserValue(
          page,
          `(() => {
            const button = document.querySelector('[data-testid="admin-force-swap-sex"]');
            return button ? { disabled: button.disabled, label: button.getAttribute('aria-label') } : null;
          })()`,
          Boolean,
          `${entry.id} ${gender} force-swap control`,
        );
        assert.equal(control.disabled, expectedDisabled, `${entry.id} ${gender} eligibility`);
        assert.ok(control.label, `${entry.id} control should have an accessible name`);
        await closeProfile(page);
      }

      await openProfile(page, 'Man target');
      await waitForBrowserValue(
        page,
        `Boolean(document.querySelector('[data-testid="profile-gender-change-history"]'))`,
        Boolean,
        `${entry.id} admin gender history section`,
      );
      assert.equal(
        await page.evaluate(
          `document.querySelectorAll('[data-testid="profile-gender-change-history-entry"]').length`,
        ),
        0,
        `${entry.id} profile history starts empty`,
      );

      await page.evaluate(`document.querySelector('[data-testid="admin-force-swap-sex"]').click()`);
      await waitForBrowserValue(
        page,
        `window.__forceSwapCalls.length`,
        (count) => count === 1,
        `${entry.id} first force-swap request`,
      );
      await page.evaluate(`window.__forceSwapResolveNext({
        status: 503,
        payload: { error: 'Temporary test failure' },
      })`);
      await waitForBrowserValue(
        page,
        `window.__forceSwapAlerts.length`,
        (count) => count === 1,
        `${entry.id} failed swap response`,
      );
      assert.equal(
        await page.evaluate(
          `document.querySelectorAll('[data-testid="profile-gender-change-history-entry"]').length`,
        ),
        0,
        `${entry.id} failed swap must not create a history entry`,
      );

      await page.evaluate(`document.querySelector('[data-testid="admin-force-swap-sex"]').click()`);
      await waitForBrowserValue(
        page,
        `window.__forceSwapCalls.length`,
        (count) => count === 2,
        `${entry.id} mismatched force-swap request`,
      );
      await page.evaluate(`window.__forceSwapResolveNext({
        status: 200,
        payload: { gender: 'man' },
      })`);
      await waitForBrowserValue(
        page,
        `window.__forceSwapAlerts.length`,
        (count) => count === 2,
        `${entry.id} mismatched gender response`,
      );
      assert.equal(
        await page.evaluate(
          `document.querySelectorAll('[data-testid="profile-gender-change-history-entry"]').length`,
        ),
        0,
        `${entry.id} mismatched response must not create a history entry`,
      );

      await page.evaluate(`document.querySelector('[data-testid="admin-force-swap-sex"]').click()`);
      await waitForBrowserValue(
        page,
        `window.__forceSwapCalls.length`,
        (count) => count === 3,
        `${entry.id} matching force-swap request`,
      );
      await page.evaluate(`window.__forceSwapResolveNext({
        status: 200,
        payload: { gender: 'woman' },
      })`);
      const historyText = await waitForBrowserValue(
        page,
        `document.querySelector('[data-testid="profile-gender-change-history-entry"]')?.textContent || ''`,
        (value) => value.includes('123456') && value.includes('man') && value.includes('woman'),
        `${entry.id} selected profile gender audit history`,
      );
      assert.match(historyText, /123456/);
      await closeProfile(page);
      await openProfile(page, 'Man target');
      await waitForBrowserValue(
        page,
        `Boolean(document.querySelector('[data-testid="profile-gender-change-history-entry"]'))`,
        Boolean,
        `${entry.id} persisted profile gender audit history`,
      );
      assert.equal(
        await page.evaluate(
          `document.querySelectorAll('[data-testid="profile-gender-change-history-entry"]').length`,
        ),
        1,
        `${entry.id} profile history remains visible after reopening`,
      );

      const swapCalls = await page.evaluate(`window.__forceSwapCalls`);
      assert.deepEqual(
        swapCalls.map(({ bot, targetId }) => ({ bot, targetId })),
        [
          { bot: appCase.botKey, targetId: 'tg_654321' },
          { bot: appCase.botKey, targetId: 'tg_654321' },
          { bot: appCase.botKey, targetId: 'tg_654321' },
        ],
        `${entry.id} sends both swaps through its own app entry and target`,
      );
      const historyCalls = await page.evaluate(`window.__genderHistoryCalls`);
      assert.ok(
        historyCalls.some(({ bot, targetId }) =>
          bot === appCase.botKey && targetId === 'tg_654321'
        ),
        `${entry.id} loads the selected profile history through its own app entry`,
      );

      const nonAdminInfo = await openTestPage(cdpBase, viteBase, {
        ...appCase,
        role: 'user',
      });
      openedPages.push({ page: nonAdminInfo.page, targetId: nonAdminInfo.targetId });
      await waitForBrowserValue(
        nonAdminInfo.page,
        `document.querySelectorAll('main [aria-hidden="true"]').length`,
        (count) => count >= 1,
        `${entry.id} non-admin startup`,
      );
      await openProfile(nonAdminInfo.page, 'Man target');
      assert.equal(
        await nonAdminInfo.page.evaluate(
          `Boolean(document.querySelector('[data-testid="admin-force-swap-sex"]'))`,
        ),
        false,
        `${entry.id} hides the force-swap control from non-admins`,
      );
      assert.deepEqual(
        await nonAdminInfo.page.evaluate(`window.__forceSwapCalls`),
        [],
        `${entry.id} non-admin profile inspection does not send a force-swap request`,
      );
      assert.equal(
        await nonAdminInfo.page.evaluate(
          `Boolean(document.querySelector('[data-testid="profile-gender-change-history"]'))`,
        ),
        false,
        `${entry.id} hides gender audit history from non-admins`,
      );
      assert.deepEqual(
        await nonAdminInfo.page.evaluate(`window.__genderHistoryCalls`),
        [],
        `${entry.id} non-admin profile inspection does not request audit history`,
      );
    }
  } finally {
    for (const { page, targetId } of openedPages) {
      await closeTestPage(`http://127.0.0.1:${cdpPort}`, page, targetId);
    }
    await stopChild(browser);
    await stopChild(vite);
    await rm(tempDir, { recursive: true, force: true });
  }
});
