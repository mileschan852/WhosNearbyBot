import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

async function waitForHttp(url, child, logs, label, timeoutMs = 20_000) {
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

function browserBootstrap() {
  return `(() => {
    const workerOrigin = 'https://whosnearbybot.mileschan852.workers.dev';
    const incompleteProfileScenario = new URLSearchParams(location.search).has('incomplete');
    const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    const currentProfile = {
      id: 'tg_7001',
      name: 'Grid Viewer',
      username: 'grid_viewer',
      avatar: '',
      dob: '1990-01-01',
      gender: 'man',
      seeking: 'women',
      height: '170',
      weight: incompleteProfileScenario ? '' : '70',
      non_man_mode: 'Meet up',
      role_pref: null,
      safety_pref: null,
      playstyle_pref: null,
      how_many_pref: null,
      where_pref: null,
      is_underage: false,
      grid_visible: true,
      map_visible: false,
      hide_age: false,
      invisible_expiry: null,
      vip_expiry: null,
      filter_sub_expiry: null,
    };
    const mapVisibleProfile = {
      id: 'tg_7002',
      name: 'Map Pin Profile',
      username: 'map_pin_profile',
      avatar: '',
      gender: 'woman',
      seeking: 'men',
      dob: '1992-06-12',
      age: 34,
      last_seen: new Date().toISOString(),
      grid_visible: true,
      map_visible: true,
      lat: 22.3245,
      lng: 114.1694,
      distance: 650,
    };
    const state = { requests: [], nearbyResponses: [] };
    window.__mapViewSwitchE2e = state;
    window.Telegram = {
      WebApp: {
        initData: 'query_id=map-view-test&auth_date=1791676800&hash=map-view-test',
        initDataUnsafe: {
          user: {
            id: 7001,
            first_name: 'Grid Viewer',
            username: 'grid_viewer',
            language_code: 'en',
          },
        },
        ready() {},
        expand() {},
        showAlert() {},
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
      if (url.origin === location.origin) {
        const response = await originalFetch(input, init);
        if (incompleteProfileScenario && url.pathname === '/config.json') {
          const config = await response.json();
          const entry = config.entries?.[config.defaultEntryId];
          if (entry?.modules) {
            entry.modules.gridFilter = false;
            entry.modules.map = true;
          }
          return json(config);
        }
        return response;
      }
      if (url.origin !== workerOrigin) {
        if (url.pathname.endsWith('/tonconnect-manifest.json')) {
          return json({ url: 'https://example.invalid', name: 'Map test', iconUrl: 'https://example.invalid/icon.png' });
        }
        return json({});
      }

      let body = {};
      try { body = JSON.parse(init.body || '{}'); } catch {}
      state.requests.push({ path: url.pathname, body });

      switch (url.pathname) {
        case '/api/auth':
          return json({
            profile: { ...currentProfile },
            role: 'user',
            bot: 'botB',
            globalVipUntil: 0,
            telegramPremium: false,
          });
        case '/api/profile':
          Object.assign(currentProfile, body.profile || {});
          return json({ updated: true, profile: { ...currentProfile } });
        case '/api/nearby': {
          const isMapRequest = body.mapRequest === true;
          const returnedProfile = { ...mapVisibleProfile };
          if (!isMapRequest) {
            delete returnedProfile.lat;
            delete returnedProfile.lng;
          }
          state.nearbyResponses.push({
            mapRequest: isMapRequest,
            includesCoordinates: typeof returnedProfile.lat === 'number' &&
              typeof returnedProfile.lng === 'number',
          });
          return json([returnedProfile]);
        }
        case '/api/map/activities':
          return json({ parties: [], cruisingSpots: [], partyPostPrice: 0, effectivePartyPostPrice: 0 });
        case '/api/messages/feed':
          return json({ starsPrice: 0, messages: [] });
        case '/api/raffle/state':
          return json({
            serverNow: new Date().toISOString(),
            closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            latestDraw: null,
            canPurchase: false,
          });
        case '/api/access-recovery/recover':
          return json({ pending: null });
        case '/api/access-recovery/save':
        case '/api/access-recovery/clear':
          return json({ ok: true });
        case '/api/profile/check':
          return json({ profile: { ...currentProfile } });
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

async function waitForPageState(page, expression, predicate, label, timeoutMs = 20_000) {
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

test('Grid to Map renders a coordinate pin, then returns to Grid without map coordinates', {
  skip: browserAvailable ? false : 'requires the installed Chromium browser',
  timeout: 120_000,
}, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'map-view-switch-browser-'));
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

  let page;
  let targetId;
  try {
    const viteBase = `http://127.0.0.1:${vitePort}`;
    const cdpBase = `http://127.0.0.1:${cdpPort}`;
    await waitForHttp(`${viteBase}/config.json`, vite, viteLogs, 'Vite');
    await waitForHttp(`${cdpBase}/json/version`, browser, browserLogs, 'Chromium', 30_000);

    const targetResponse = await fetch(`${cdpBase}/json/new?about%3Ablank`, { method: 'PUT' });
    assert.ok(targetResponse.ok, `Could not create a Chromium tab (${targetResponse.status}).`);
    const target = await targetResponse.json();
    targetId = target.id;
    page = new CdpPage(target.webSocketDebuggerUrl);
    await page.ready();
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Network.setBlockedURLs', { urls: ['https://tile.openstreetmap.org/*'] });
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 402,
      height: 874,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: browserBootstrap() });
    await page.send('Page.navigate', {
      url: `${viteBase}/test/fixtures/map-view-switch.browser.html?incomplete=1`,
    });

    const incompleteState = await waitForPageState(
      page,
      `(() => ({
        completion: !!document.querySelector('[data-testid="profile-completion-status"]'),
        grid: !!document.querySelector('[data-testid="bottom-navigation-grid"]'),
        map: !!document.querySelector('button[aria-label="Map"]'),
        authRequests: window.__mapViewSwitchE2e?.requests?.filter((request) => request.path === '/api/auth').length || 0,
        mapActivityRequests: window.__mapViewSwitchE2e?.requests?.filter((request) => request.path === '/api/map/activities').length || 0,
      }))()`,
      (state) => state.completion && state.authRequests > 0 && !state.grid &&
        !state.map && state.mapActivityRequests === 0,
      'an incomplete profile to remain on the completion screen without loading Map',
    );
    assert.equal(incompleteState.mapActivityRequests, 0);

    await page.send('Page.navigate', {
      url: `${viteBase}/test/fixtures/map-view-switch.browser.html`,
    });

    await waitForPageState(
      page,
      `(() => ({
        grid: !!document.querySelector('[data-testid="bottom-navigation-grid"]'),
        map: !!document.querySelector('button[aria-label="Map"]'),
        requests: window.__mapViewSwitchE2e?.requests?.filter((request) => request.path === '/api/auth').length || 0,
        readyState: document.readyState,
        url: location.href,
        body: document.body?.innerText?.slice(0, 400) || '',
        rootMarkup: document.querySelector('#root')?.innerHTML?.slice(0, 500) || '',
        bootstrapLoaded: !!window.__mapViewSwitchE2e,
      }))()`,
      (state) => state.grid && state.map && state.requests > 0,
      'the real app and its Grid/Map navigation',
    );

    const mapRequestStart = await page.evaluate(
      `window.__mapViewSwitchE2e.nearbyResponses.length`,
    );
    await page.evaluate(`document.querySelector('button[aria-label="Map"]').click()`);

    const mapState = await waitForPageState(
      page,
      `(() => {
        const responses = window.__mapViewSwitchE2e.nearbyResponses;
        const mapResponse = responses.slice(${mapRequestStart}).find((item) => item.mapRequest);
        const map = document.querySelector('.leaflet-container');
        const bounds = map?.getBoundingClientRect();
        const pins = [...document.querySelectorAll('.leaflet-marker-icon.custom-map-pin')];
        const profilePin = pins.find((pin) => pin.textContent.trim() === 'M');
        return {
          mapResponse,
          mapWidth: bounds?.width || 0,
          mapHeight: bounds?.height || 0,
          profilePin: profilePin ? {
            visible: profilePin.getBoundingClientRect().width > 0,
            hasImage: !!profilePin.querySelector('img'),
          } : null,
        };
      })()`,
      (state) => state.mapResponse?.includesCoordinates === true &&
        state.mapWidth > 0 && state.mapHeight > 0 && state.profilePin?.visible === true,
      'the map response and its no-photo profile pin',
    );
    assert.equal(mapState.mapResponse.mapRequest, true);
    assert.equal(mapState.mapResponse.includesCoordinates, true);
    assert.equal(mapState.profilePin.hasImage, false, 'the Worker profile should render without an uploaded photo');

    const gridRequestStart = await page.evaluate(
      `window.__mapViewSwitchE2e.nearbyResponses.length`,
    );
    await page.evaluate(`document.querySelector('button[aria-label="Map"]').click()`);
    const gridState = await waitForPageState(
      page,
      `(() => {
        const responses = window.__mapViewSwitchE2e.nearbyResponses;
        const gridResponse = responses.slice(${gridRequestStart}).find((item) => !item.mapRequest);
        const mapButton = document.querySelector('button[aria-label="Map"]');
        const gridButton = document.querySelector('[data-testid="bottom-navigation-grid"]');
        const map = document.querySelector('.leaflet-container');
        return {
          gridResponse,
          mapSelected: mapButton?.style.color === 'rgb(0, 123, 255)',
          gridSelected: gridButton?.style.color === 'rgb(0, 123, 255)',
          mapHidden: (map?.getBoundingClientRect().width || 0) === 0,
        };
      })()`,
      (state) => state.gridResponse !== undefined && state.gridSelected &&
        !state.mapSelected && state.mapHidden,
      'Grid to be visible again with a coordinate-free response',
    );
    assert.equal(gridState.gridResponse.mapRequest, false);
    assert.equal(gridState.gridResponse.includesCoordinates, false);
  } finally {
    if (page) page.close();
    if (targetId) {
      try {
        await fetch(`http://127.0.0.1:${cdpPort}/json/close/${targetId}`);
      } catch {}
    }
    await Promise.all([stopChild(browser), stopChild(vite)]);
    await rm(tempDir, { recursive: true, force: true });
  }
});
