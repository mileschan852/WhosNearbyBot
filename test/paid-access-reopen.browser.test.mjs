import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { resolveAppEntry } from '../src/config/resolve-app-entry.js';
import {
  ACCESS_RECHECK_TIMEOUT_MS,
  createPendingAccessRecheck,
  PENDING_ACCESS_RECHECK_STORAGE_KEY,
} from '../src/utils/access-entitlements.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testDir, '..');
const chromiumBinary = process.env.CHROMIUM_PATH || 'chromium';
const browserAvailable = spawnSync(chromiumBinary, ['--version'], { stdio: 'ignore' }).status === 0;
const appRuntimeConfig = JSON.parse(
  await import('node:fs/promises').then(({ readFile }) =>
    readFile(path.join(appRoot, 'public/config.json'), 'utf8'),
  ),
);

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

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

function makeMarker(accountId, entitlement) {
  const now = Date.now();
  const startedAt = now - ACCESS_RECHECK_TIMEOUT_MS - 10_000;
  const marker = createPendingAccessRecheck({
    accountId,
    entitlement,
    startedAt,
    createdAt: startedAt,
    minimumExpiry: now + 29 * 24 * 60 * 60 * 1000,
  }, now);
  assert.ok(marker, `expected a valid persisted ${entitlement} marker`);
  return marker;
}

function browserBootstrap(scenario) {
  return `(() => {
    const scenario = ${JSON.stringify(scenario)};
    const storageKey = ${JSON.stringify(PENDING_ACCESS_RECHECK_STORAGE_KEY)};
    const workerOrigin = 'https://whosnearbybot.mileschan852.workers.dev';
    const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    const profile = (id) => ({
      id,
      name: 'Paid access test',
      username: 'paid_access_test',
      avatar: '',
      lat: 22.3193,
      lng: 114.1694,
      dob: '1990-01-01',
      gender: 'man',
      seeking: scenario.entryId === 'hkmo-date' ? 'men' : 'women',
      height: '170',
      weight: '70',
      role_pref: 'Versatile',
      safety_pref: 'Safe',
      playstyle_pref: 'Clean',
      how_many_pref: 'DoesntMatter',
      where_pref: null,
      non_man_mode: null,
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

    const currentProfile = profile(scenario.currentAccountId);
    const checkedProfile = profile(
      scenario.checkedProfileAccountId || scenario.marker.accountId,
    );
    const confirmedExpiry = new Date(scenario.marker.minimumExpiry + 60_000).toISOString();
    if (scenario.entitlement === 'hideAge') {
      checkedProfile.hide_age = true;
      checkedProfile.hide_age_expiry = confirmedExpiry;
    } else if (scenario.entitlement === 'invisible') {
      checkedProfile.grid_visible = false;
      checkedProfile.invisible_expiry = confirmedExpiry;
    }

    localStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify(scenario.marker));
    window.__paidAccessBrowserCalls = [];
    window.__paidAccessMockProfileCheck = checkedProfile;
    window.__paidAccessInvoiceOpenCount = 0;
    window.Telegram = {
      WebApp: {
        initData: 'query_id=browser-test&auth_date=1791676800&hash=browser-test',
        initDataUnsafe: {
          user: {
            id: Number(scenario.currentAccountId.replace(/^tg_/, '')),
            first_name: 'Paid access test',
            username: 'paid_access_test',
            language_code: 'en',
          },
          ...(scenario.startParam ? { start_param: scenario.startParam } : {}),
        },
        ready() {},
        expand() {},
        showAlert() {},
        openInvoice() {
          window.__paidAccessInvoiceOpenCount += 1;
          throw new Error('The reopen test must not create or open an invoice.');
        },
      },
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
      const isWorker = url.origin === workerOrigin;
      if (isWorker) window.__paidAccessBrowserCalls.push({ path: url.pathname, bot: body.bot || null });
      if (!isWorker) {
        if (url.pathname.endsWith('/tonconnect-manifest.json')) {
          return json({
            url: 'https://example.invalid',
            name: 'Browser test',
            iconUrl: 'https://example.invalid/icon.png',
          });
        }
        return json({});
      }

      switch (url.pathname) {
        case '/api/auth':
          return json({
            profile: currentProfile,
            role: 'user',
            bot: scenario.botKey,
            globalVipUntil: 0,
            telegramPremium: false,
          });
        case '/api/access-recovery/recover':
          return json({ pending: null });
        case '/api/access-recovery/save':
        case '/api/access-recovery/clear':
          return json({ ok: true });
        case '/api/profile':
          return json({
            updated: true,
            profile: { ...currentProfile, ...(body.profile || {}) },
          });
        case '/api/profile/check':
          return json({ profile: checkedProfile });
        case '/api/nearby':
          return json([]);
        case '/api/raffle/state':
          return json({
            serverNow: new Date().toISOString(),
            closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            latestDraw: null,
            canPurchase: false,
          });
        case '/api/messages/feed':
          return json({ starsPrice: 0, messages: [] });
        default:
          return json({ error: 'Unmocked endpoint in browser test.' }, 404);
      }
    };
  })();`;
}

class CdpPage {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
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
      throw new Error(response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text || 'Browser expression failed.');
    }
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitForPageValue(page, expression, predicate, label, timeoutMs = 15_000) {
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

async function openTestPage(cdpBase, viteBase, scenario) {
  const targetResponse = await fetch(`${cdpBase}/json/new?about%3Ablank`, { method: 'PUT' });
  if (!targetResponse.ok) {
    throw new Error(`Could not create a Chromium page (${targetResponse.status}).`);
  }
  const target = await targetResponse.json();
  const page = new CdpPage(target.webSocketDebuggerUrl);
  await page.ready();
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 402,
    height: 874,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: browserBootstrap(scenario),
  });
  const url = new URL('/test/fixtures/paid-access-reopen.browser.html', viteBase);
  url.searchParams.set('case', scenario.name);
  await page.send('Page.navigate', { url: url.toString() });
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

test('reopened paid access renders only after the correct account is confirmed in each app', {
  skip: browserAvailable ? false : 'requires the installed Chromium browser',
  timeout: 120_000,
}, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'paid-access-browser-'));
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

  try {
    const viteBase = `http://127.0.0.1:${vitePort}`;
    const cdpBase = `http://127.0.0.1:${cdpPort}`;
    await waitForHttp(`${viteBase}/config.json`, vite, viteLogs, 'Vite');
    await waitForHttp(`${cdpBase}/json/version`, browser, browserLogs, 'Chromium', 30_000);

    const appEntries = [
      {
        entryId: 'nearby',
        startParam: null,
        botKey: 'botB',
      },
      {
        entryId: 'hkmo-date',
        startParam: 'gaymode',
        botKey: 'botA',
      },
    ];

    for (const appCase of appEntries) {
      const resolvedEntry = resolveAppEntry(appRuntimeConfig, appCase.startParam);
      assert.equal(resolvedEntry.id, appCase.entryId);
      assert.equal(resolvedEntry.botKey, appCase.botKey);

      for (const entitlement of ['hideAge', 'invisible']) {
        const marker = makeMarker('tg_654321', entitlement);
        const successText = entitlement === 'hideAge'
          ? 'Your age is hidden until'
          : 'Your profile is hidden until';
        const pendingText = entitlement === 'hideAge'
          ? 'Your Hide Age pass purchase is not confirmed yet.'
          : 'Your invisibility pass purchase is not confirmed yet.';
        const scenario = {
          ...appCase,
          name: `${appCase.entryId}-${entitlement}-confirmed`,
          currentAccountId: marker.accountId,
          marker,
          entitlement,
        };
        const { page, targetId } = await openTestPage(cdpBase, viteBase, scenario);
        try {
          const beforeRetry = await waitForPageValue(
            page,
            `(() => {
              const status = [...document.querySelectorAll('[role="status"]')]
                .find((node) => node.textContent.includes(${JSON.stringify(pendingText)}));
              const rectangle = status?.getBoundingClientRect();
              return {
                mounted: document.getElementById('root')?.dataset.appMounted === 'true',
                pendingText: status?.innerText || '',
                visible: Boolean(rectangle?.width && rectangle?.height),
                marker: localStorage.getItem(${JSON.stringify(PENDING_ACCESS_RECHECK_STORAGE_KEY)}),
              };
            })()`,
            (state) => state?.mounted && state.pendingText.includes(pendingText) && state.visible,
            `${appCase.entryId} ${entitlement} pending state`,
          );
          assert.ok(beforeRetry.marker, 'the pending marker survives the app reopen');
          const clicked = await page.evaluate(`(() => {
            const status = [...document.querySelectorAll('[role="status"]')]
              .find((node) => node.textContent.includes(${JSON.stringify(pendingText)}));
            const button = [...(status?.querySelectorAll('button') || [])]
              .find((candidate) => candidate.textContent.trim() === 'Check again');
            if (!button) return false;
            button.click();
            return true;
          })()`);
          assert.equal(clicked, true, `${appCase.entryId} exposes a retry action`);

          const afterRetry = await waitForPageValue(
            page,
            `(() => {
              const statuses = [...document.querySelectorAll('[role="status"]')];
              const success = statuses.find((node) => node.textContent.includes(${JSON.stringify(successText)}));
              const rectangle = success?.getBoundingClientRect();
              return {
                text: document.body.innerText,
                successText: success?.innerText || '',
                successVisible: Boolean(rectangle?.width && rectangle?.height),
                marker: localStorage.getItem(${JSON.stringify(PENDING_ACCESS_RECHECK_STORAGE_KEY)}),
                calls: window.__paidAccessBrowserCalls || [],
              };
            })()`,
            (state) => state?.successVisible &&
              state.successText.includes(successText) &&
              !state.text.includes(pendingText) &&
              state.marker === null,
            `${appCase.entryId} ${entitlement} confirmed success state`,
          );
          const profileChecks = afterRetry.calls.filter((call) => call.path === '/api/profile/check');
          assert.ok(profileChecks.length > 0, 'recovery checks the profile through the Worker');
          assert.ok(profileChecks.every((call) => call.bot === appCase.botKey),
            `${appCase.entryId} sends the configured bot identity to the Worker`);
          assert.equal(afterRetry.calls.some((call) => call.path === '/create-invoice'), false,
            'recovery never creates a paid invoice');
        } finally {
          await closeTestPage(cdpBase, page, targetId);
        }
      }

      const marker = makeMarker('tg_654321', appCase.entryId === 'nearby' ? 'hideAge' : 'invisible');
      const successText = marker.entitlement === 'hideAge'
        ? 'Your age is hidden until'
        : 'Your profile is hidden until';
      const scenario = {
        ...appCase,
        name: `${appCase.entryId}-different-account`,
        currentAccountId: 'tg_654322',
        marker,
        entitlement: marker.entitlement,
      };
      const { page, targetId } = await openTestPage(cdpBase, viteBase, scenario);
      try {
        const state = await waitForPageValue(
          page,
          `(() => ({
            mounted: document.getElementById('root')?.dataset.appMounted === 'true',
            authenticated: (window.__paidAccessBrowserCalls || []).some((call) => call.path === '/api/auth'),
            recovered: (window.__paidAccessBrowserCalls || []).some((call) => call.path === '/api/access-recovery/recover'),
            storedMarker: localStorage.getItem(${JSON.stringify(PENDING_ACCESS_RECHECK_STORAGE_KEY)}),
            calls: window.__paidAccessBrowserCalls || [],
            text: document.body.innerText,
            successVisible: [...document.querySelectorAll('[role="status"]')]
              .some((node) => node.textContent.includes(${JSON.stringify(successText)})),
          }))()`,
          (value) => value?.mounted && value.authenticated && value.recovered,
          `${appCase.entryId} account-scoped recovery`,
        );
        const storedMarker = JSON.parse(state.storedMarker);
        assert.equal(storedMarker.accountId, 'tg_654321',
          'switching accounts must not erase the previous account marker');
        assert.equal(state.successVisible, false,
          'an entitlement belonging to the previous account must not appear as this account’s success');
        assert.equal(state.calls.some((call) => call.path === '/api/profile/check'), false,
          'the different account must not trigger the old account’s paid-profile check');
      } finally {
        await closeTestPage(cdpBase, page, targetId);
      }

      const wrongResponseMarker = makeMarker(
        'tg_654323',
        appCase.entryId === 'nearby' ? 'hideAge' : 'invisible',
      );
      const wrongResponseAccountId = 'tg_654324';
      const wrongResponseSuccessText = wrongResponseMarker.entitlement === 'hideAge'
        ? 'Your age is hidden until'
        : 'Your profile is hidden until';
      const wrongResponsePendingText = wrongResponseMarker.entitlement === 'hideAge'
        ? 'Your Hide Age pass purchase is not confirmed yet.'
        : 'Your invisibility pass purchase is not confirmed yet.';
      const wrongResponseScenario = {
        ...appCase,
        name: `${appCase.entryId}-wrong-profile-check-account`,
        currentAccountId: wrongResponseMarker.accountId,
        checkedProfileAccountId: wrongResponseAccountId,
        marker: wrongResponseMarker,
        entitlement: wrongResponseMarker.entitlement,
      };
      const { page: wrongResponsePage, targetId: wrongResponseTargetId } =
        await openTestPage(cdpBase, viteBase, wrongResponseScenario);
      try {
        const beforeRetry = await waitForPageValue(
          wrongResponsePage,
          `(() => {
            const status = [...document.querySelectorAll('[role="status"]')]
              .find((node) => node.textContent.includes(${JSON.stringify(wrongResponsePendingText)}));
            const rectangle = status?.getBoundingClientRect();
            return {
              mounted: document.getElementById('root')?.dataset.appMounted === 'true',
              pendingText: status?.innerText || '',
              visible: Boolean(rectangle?.width && rectangle?.height),
              marker: localStorage.getItem(${JSON.stringify(PENDING_ACCESS_RECHECK_STORAGE_KEY)}),
            };
          })()`,
          (state) => state?.mounted &&
            state.pendingText.includes(wrongResponsePendingText) &&
            state.visible &&
            Boolean(state.marker),
          `${appCase.entryId} wrong-profile response pending state`,
        );
        assert.equal(
          JSON.parse(beforeRetry.marker).accountId,
          wrongResponseMarker.accountId,
          'the local marker matches the signed-in account before checking the Worker profile',
        );
        const clicked = await wrongResponsePage.evaluate(`(() => {
          const status = [...document.querySelectorAll('[role="status"]')]
            .find((node) => node.textContent.includes(${JSON.stringify(wrongResponsePendingText)}));
          const button = [...(status?.querySelectorAll('button') || [])]
            .find((candidate) => candidate.textContent.trim() === 'Check again');
          if (!button) return false;
          button.click();
          return true;
        })()`);
        assert.equal(clicked, true, `${appCase.entryId} exposes a retry action`);

        const afterRetry = await waitForPageValue(
          wrongResponsePage,
          `(() => {
            const profile = window.__paidAccessMockProfileCheck || {};
            const calls = window.__paidAccessBrowserCalls || [];
            const profileChecks = calls.filter((call) => call.path === '/api/profile/check');
            const markerText = localStorage.getItem(${JSON.stringify(PENDING_ACCESS_RECHECK_STORAGE_KEY)});
            const statuses = [...document.querySelectorAll('[role="status"]')];
            const success = statuses.find((node) =>
              node.textContent.includes(${JSON.stringify(wrongResponseSuccessText)}));
            const expiry = ${JSON.stringify(wrongResponseMarker.entitlement)} === 'hideAge'
              ? profile.hide_age_expiry
              : profile.invisible_expiry;
            const checkedProfileActive = ${JSON.stringify(wrongResponseMarker.entitlement)} === 'hideAge'
              ? profile.hide_age === true && Date.parse(expiry) > Date.now()
              : profile.grid_visible === false && Date.parse(expiry) > Date.now();
            return {
              marker: markerText ? JSON.parse(markerText) : null,
              checkedProfileId: profile.id || null,
              checkedProfileActive,
              profileCheckCount: profileChecks.length,
              profileChecksUseConfiguredBot: profileChecks.every((call) => call.bot === ${JSON.stringify(appCase.botKey)}),
              successVisible: Boolean(success?.getBoundingClientRect()?.width &&
                success?.getBoundingClientRect()?.height),
              successTextPresent: document.body.innerText.includes(${JSON.stringify(wrongResponseSuccessText)}),
              cleared: calls.some((call) => call.path === '/api/access-recovery/clear'),
              paymentCalls: calls.filter((call) => /(invoice|payment|transaction|checkout)/i.test(call.path)),
              invoiceOpenCount: window.__paidAccessInvoiceOpenCount || 0,
            };
          })()`,
          (state) => state?.profileCheckCount >= 6 &&
            state.checkedProfileId === wrongResponseAccountId &&
            state.marker?.accountId === wrongResponseMarker.accountId,
          `${appCase.entryId} wrong-account Worker profile checks`,
        );
        assert.equal(afterRetry.checkedProfileActive, true,
          'the mocked Worker response has an active entitlement, but for another Telegram account');
        assert.equal(afterRetry.profileChecksUseConfiguredBot, true,
          `${appCase.entryId} sends its configured bot identity to the Worker`);
        assert.equal(afterRetry.marker.accountId, wrongResponseMarker.accountId,
          'a different account profile cannot clear the current account pending marker');
        assert.equal(afterRetry.successVisible, false,
          'an entitlement on another account cannot display a success notice');
        assert.equal(afterRetry.successTextPresent, false,
          'the wrong-account entitlement is never presented as success');
        assert.equal(afterRetry.cleared, false,
          'the app does not clear the pending marker after a mismatched profile check');
        assert.deepEqual(afterRetry.paymentCalls, [],
          'recovery does not create an invoice or paid transaction');
        assert.equal(afterRetry.invoiceOpenCount, 0,
          'recovery does not open a Telegram invoice');
      } finally {
        await closeTestPage(cdpBase, wrongResponsePage, wrongResponseTargetId);
      }
    }
  } catch (error) {
    const context = [
      `Vite logs:\n${viteLogs.join('')}`,
      `Chromium logs:\n${browserLogs.join('')}`,
    ].join('\n');
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${context}`, { cause: error });
  } finally {
    await stopChild(browser);
    await stopChild(vite);
    await rm(tempDir, { recursive: true, force: true });
  }
});
