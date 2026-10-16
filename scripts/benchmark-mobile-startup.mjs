import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromiumBinary = process.env.CHROMIUM_PATH || 'chromium';
const isPagesRun = process.argv.includes('--pages');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const mobileNetwork = {
  latencyMs: 400,
  downloadKbps: 500,
  uploadKbps: 150,
  cpuThrottle: 4,
  viewport: { width: 402, height: 874, deviceScaleFactor: 2 },
  workerResponseDelayMs: 400,
};

if (spawnSync(chromiumBinary, ['--version'], { stdio: 'ignore' }).status !== 0) {
  throw new Error('Chromium is required. Set CHROMIUM_PATH if it is not on PATH.');
}

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
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.\n${logs.join('')}`);
}

function browserBootstrap(scenario) {
  return `(() => {
    const scenario = ${JSON.stringify(scenario)};
    const workerOrigin = 'https://whosnearbybot.mileschan852.workers.dev';
    const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    const profile = {
      id: 'tg_7654321',
      name: 'Startup test user',
      username: 'startup_test',
      avatar: '',
      lat: 22.3193,
      lng: 114.1694,
      last_seen: new Date().toISOString(),
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
      non_man_mode: scenario.entryId === 'hkmo-date'
        ? null
        : 'Meet up - You are visible on grid and map',
      is_underage: false,
      hide_age: false,
      hide_age_expiry: null,
      grid_visible: true,
      invisible_expiry: null,
      map_visible: false,
      vip_expiry: null,
      filter_sub_expiry: null,
    };
    const nearbyProfile = {
      id: 'tg_7654322',
      name: 'Nearby test profile',
      username: 'nearby_test',
      avatar: '',
      lat: 22.3204,
      lng: 114.1701,
      last_seen: new Date().toISOString(),
      gender: scenario.entryId === 'hkmo-date' ? 'man' : 'woman',
      seeking: 'men',
      age: 35,
      height: '170',
      weight: '70',
      role_pref: 'Versatile',
      safety_pref: 'Safe',
      playstyle_pref: 'Clean',
      where_pref: null,
      how_many_pref: 'DoesntMatter',
      non_man_mode: null,
      grid_visible: true,
      map_visible: false,
      distance: 1.2,
      interest_received: false,
    };
    const perf = { appMountedMs: null, gridReadyMs: null, errors: [], workerCalls: [] };
    window.__startupBenchmark = perf;
    const checkReadiness = () => {
      const root = document.getElementById('root');
      if (root?.dataset.appMounted === 'true' && perf.appMountedMs === null) {
        perf.appMountedMs = performance.now();
      }
      if (root && perf.gridReadyMs === null) {
        const visibleTiles = [...root.querySelectorAll('div')]
          .filter((element) => {
            if (element.style.aspectRatio !== '1 / 1' && element.style.aspectRatio !== '1/1') {
              return false;
            }
            const bounds = element.getBoundingClientRect();
            return bounds.width > 0 && bounds.height > 0;
          });
        if (visibleTiles.length > 0) perf.gridReadyMs = performance.now();
      }
    };
    new MutationObserver(checkReadiness).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-app-mounted'],
    });
    window.addEventListener('error', (event) => {
      perf.errors.push(String(event.message || event.error || 'window error'));
    });
    window.addEventListener('unhandledrejection', (event) => {
      perf.errors.push(String(event.reason || 'unhandled rejection'));
    });
    window.setInterval(checkReadiness, 25);

    window.Telegram = {
      WebApp: {
        initData: 'query_id=startup-test&auth_date=1792100000&hash=startup-test',
        initDataUnsafe: {
          user: {
            id: 7654321,
            first_name: 'Startup test user',
            username: 'startup_test',
            language_code: 'en',
          },
          ...(scenario.startParam ? { start_param: scenario.startParam } : {}),
        },
        ready() {},
        expand() {},
        showAlert() {},
        showPopup() {},
        openLink() {},
        openTelegramLink() {},
      },
    };
    try {
      let locationCalls = 0;
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success, error) {
            locationCalls += 1;
            queueMicrotask(() => {
              if (locationCalls === 1) {
                success({
                  coords: { latitude: 22.3193, longitude: 114.1694, accuracy: 10 },
                });
              } else {
                error?.({ code: 2, message: 'Precise-location refresh omitted by benchmark.' });
              }
            });
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
      if (url.origin !== workerOrigin) {
        if (url.pathname.endsWith('/tonconnect-manifest.json')) {
          return json({
            url: 'https://example.invalid',
            name: 'Startup benchmark',
            iconUrl: 'https://example.invalid/icon.png',
          });
        }
        return json({});
      }

      perf.workerCalls.push(url.pathname);
      await new Promise((resolve) => setTimeout(resolve, ${mobileNetwork.workerResponseDelayMs}));
      switch (url.pathname) {
        case '/api/auth':
          return json({
            profile,
            role: 'user',
            bot: scenario.botKey,
            globalVipUntil: 0,
            telegramPremium: false,
          });
        case '/api/profile':
          return json({ updated: true, profile: { ...profile, ...(body.profile || {}) } });
        case '/api/nearby':
          return json([nearbyProfile]);
        case '/api/access-recovery/recover':
          return json({ pending: null });
        case '/api/access-recovery/save':
        case '/api/access-recovery/clear':
          return json({ ok: true });
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
          return json({ ok: true });
      }
    };
  })();`;
}

class CdpPage {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.method) {
        for (const listener of this.listeners.get(message.method) || []) {
          listener(message.params || {});
        }
        return;
      }
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

  on(method, listener) {
    const listeners = this.listeners.get(method) || new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chromium command timed out: ${method}`));
      }, 20_000);
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

async function waitForPageValue(page, expression, predicate, label, timeoutMs = 45_000) {
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

async function openPage(cdpBase, scenario, localBase, browserRequests) {
  const targetResponse = await fetch(`${cdpBase}/json/new?about%3Ablank`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Could not create a Chromium page (${targetResponse.status}).`);
  const target = await targetResponse.json();
  const page = new CdpPage(target.webSocketDebuggerUrl);
  await page.ready();
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: mobileNetwork.latencyMs,
    downloadThroughput: mobileNetwork.downloadKbps * 1024 / 8,
    uploadThroughput: mobileNetwork.uploadKbps * 1024 / 8,
    connectionType: 'cellular4g',
  });
  await page.send('Emulation.setCPUThrottlingRate', { rate: mobileNetwork.cpuThrottle });
  await page.send('Emulation.setDeviceMetricsOverride', {
    ...mobileNetwork.viewport,
    mobile: true,
  });
  await page.send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36',
  });
  await page.send('Network.setBlockedURLs', {
    urls: ['https://telegram.org/js/telegram-web-app.js*'],
  });

  const requestMap = new Map();
  let documentStartTimestamp = null;
  page.on('Network.requestWillBeSent', (event) => {
    if (!/^https?:/.test(event.request.url)) return;
    if (event.type === 'Document' && documentStartTimestamp === null) {
      documentStartTimestamp = event.timestamp;
    }
    requestMap.set(event.requestId, {
      url: event.request.url,
      method: event.request.method,
      type: event.type || 'Other',
      initiator: event.initiator?.type || 'other',
      startTimestamp: event.timestamp,
      responseTimestamp: null,
      endTimestamp: null,
      status: null,
      mimeType: null,
      cacheControl: null,
      contentEncoding: null,
      etag: null,
      xCache: null,
      age: null,
      bytes: null,
      error: null,
    });
  });
  page.on('Network.responseReceived', (event) => {
    const request = requestMap.get(event.requestId);
    if (!request) return;
    request.responseTimestamp = event.timestamp;
    request.status = event.response.status;
    request.mimeType = event.response.mimeType;
    request.cacheControl = event.response.headers?.['cache-control'] ||
      event.response.headers?.['Cache-Control'] || null;
    request.contentEncoding = event.response.headers?.['content-encoding'] ||
      event.response.headers?.['Content-Encoding'] || null;
    request.etag = event.response.headers?.etag || event.response.headers?.ETag || null;
    request.xCache = event.response.headers?.['x-cache'] ||
      event.response.headers?.['X-Cache'] || null;
    request.age = event.response.headers?.age || event.response.headers?.Age || null;
  });
  page.on('Network.loadingFinished', (event) => {
    const request = requestMap.get(event.requestId);
    if (!request) return;
    request.endTimestamp = event.timestamp;
    request.bytes = event.encodedDataLength;
  });
  page.on('Network.loadingFailed', (event) => {
    const request = requestMap.get(event.requestId);
    if (!request) return;
    request.error = event.errorText;
    request.endTimestamp = event.timestamp;
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: browserBootstrap(scenario),
  });

  const url = scenario.url || new URL('/', localBase).toString();
  const navResponse = await page.send('Page.navigate', { url });
  if (navResponse.errorText) throw new Error(`Navigation failed: ${navResponse.errorText}`);
  browserRequests.push({ page, targetId: target.id, requestMap, getDocumentStart: () => documentStartTimestamp });
  return page;
}

async function closePage(cdpBase, record) {
  record.page.close();
  try { await fetch(`${cdpBase}/json/close/${record.targetId}`); } catch {}
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

async function removeTempDirWithRetry(tempDir) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error?.code) || attempt === 5) throw error;
      await delay(250 * (attempt + 1));
    }
  }
}

function compactWaterfall(requestMap, documentStartTimestamp) {
  return [...requestMap.values()]
    .filter((request) => !request.url.includes('telegram-web-app.js') && request.type !== 'Image')
    .map((request) => ({
      url: request.url,
      type: request.type,
      startMs: documentStartTimestamp === null
        ? null
        : Math.round((request.startTimestamp - documentStartTimestamp) * 1000),
      responseMs: request.responseTimestamp === null || documentStartTimestamp === null
        ? null
        : Math.round((request.responseTimestamp - documentStartTimestamp) * 1000),
      endMs: request.endTimestamp === null || documentStartTimestamp === null
        ? null
        : Math.round((request.endTimestamp - documentStartTimestamp) * 1000),
      status: request.status,
      mimeType: request.mimeType,
      contentEncoding: request.contentEncoding,
      cacheControl: request.cacheControl,
      etag: request.etag,
      xCache: request.xCache,
      age: request.age,
      bytes: request.bytes,
      error: request.error,
    }))
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
}

async function benchmarkScenario(cdpBase, localBase, scenario, browserPages) {
  const page = await openPage(cdpBase, scenario, localBase, browserPages);
  try {
    const gridState = await waitForPageValue(
      page,
      `(() => {
        const root = document.getElementById('root');
        const marks = window.__startupBenchmark;
        const tiles = root ? [...root.querySelectorAll('div')].filter((element) =>
          element.style.aspectRatio === '1 / 1' || element.style.aspectRatio === '1/1'
        ).length : 0;
        return {
          mounted: root?.dataset.appMounted === 'true',
          title: document.title,
          tileCount: tiles,
          appMountedMs: marks?.appMountedMs ?? null,
          gridReadyMs: marks?.gridReadyMs ?? null,
          errors: marks?.errors || [],
          workerCalls: marks?.workerCalls || [],
          navigation: (() => {
            const entry = performance.getEntriesByType('navigation')[0];
            const paint = performance.getEntriesByName('first-contentful-paint')[0];
            return entry ? {
              domInteractiveMs: Math.round(entry.domInteractive),
              domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
              loadEventEndMs: Math.round(entry.loadEventEnd),
              responseEndMs: Math.round(entry.responseEnd),
              firstContentfulPaintMs: paint ? Math.round(paint.startTime) : null,
            } : null;
          })(),
        };
      })()`,
      (value) => value?.mounted && value.tileCount > 0 && value.gridReadyMs !== null,
      `${scenario.entryId} grid`,
    );

    const record = browserPages.find((item) => item.page === page);
    const walletPattern = /WalletConnectModule|wallet|tonconnect/i;
    const deadline = Date.now() + 6_000;
    let walletFinished = false;
    while (Date.now() < deadline) {
      const walletRequests = [...record.requestMap.values()].filter((item) =>
        item.type === 'Script' && walletPattern.test(item.url));
      if (walletRequests.some((item) => item.endTimestamp !== null)) {
        walletFinished = true;
        break;
      }
      await delay(100);
    }
    await delay(600);

    const waterfall = compactWaterfall(record.requestMap, record.getDocumentStart());
    const documentStartTimestamp = record.getDocumentStart();
    const imageRequests = [...record.requestMap.values()].filter((request) => request.type === 'Image');
    const imageHosts = imageRequests
      .reduce((summary, request) => {
        const host = new URL(request.url).host;
        const item = summary[host] || { requests: 0, completed: 0, bytes: 0, failed: 0 };
        item.requests += 1;
        item.completed += request.endTimestamp !== null && request.error === null ? 1 : 0;
        item.bytes += request.bytes || 0;
        item.failed += request.error !== null ? 1 : 0;
        summary[host] = item;
        return summary;
      }, {});
    const externalImageSummary = {
      requests: imageRequests.length,
      startedBeforeGrid: imageRequests.filter((request) =>
        documentStartTimestamp !== null &&
        (request.startTimestamp - documentStartTimestamp) * 1000 <= gridState.gridReadyMs).length,
      completed: imageRequests.filter((request) =>
        request.endTimestamp !== null && request.error === null).length,
      failed: imageRequests.filter((request) => request.error !== null).length,
      bytes: imageRequests.reduce((total, request) => total + (request.bytes || 0), 0),
      firstRequestMs: imageRequests.length && documentStartTimestamp !== null
        ? Math.round((Math.min(...imageRequests.map((request) => request.startTimestamp)) -
          documentStartTimestamp) * 1000)
        : null,
      topHosts: Object.entries(imageHosts)
        .sort((a, b) => b[1].requests - a[1].requests)
        .slice(0, 6)
        .map(([host, details]) => ({ host, ...details })),
    };
    const walletRequests = waterfall.filter((request) =>
      request.type === 'Script' && walletPattern.test(request.url));
    const firstWalletStartMs = walletRequests
      .map((request) => request.startMs)
      .filter((value) => value !== null)
      .sort((a, b) => a - b)[0] ?? null;
    const adminRequests = waterfall.filter((request) =>
      /PaymentReviewPanel|vip-campaign-panel|RafflePaymentReviewPanel/i.test(request.url));
    const mapRequests = waterfall.filter((request) => /NearbyMapModule/i.test(request.url));
    const profileSetupRequests = waterfall.filter((request) =>
      /ProfileCompletionModule|ProfileSetupPreviewModule/i.test(request.url));
    const gridReadyMs = gridState.gridReadyMs;
    const walletAfterGrid = firstWalletStartMs === null
      ? null
      : firstWalletStartMs > gridReadyMs;

    assert.equal(gridState.tileCount > 0, true, `${scenario.entryId} should render a profile tile.`);
    assert.equal(gridState.errors.length, 0, `${scenario.entryId} should not throw browser errors: ${gridState.errors.join('; ')}`);
    if (!isPagesRun) {
      assert.notEqual(firstWalletStartMs, null,
        `${scenario.entryId} should request the deferred wallet chunk in the workspace build.`);
    }
    if (walletAfterGrid !== null) {
      assert.equal(walletAfterGrid, true,
        `${scenario.entryId} fetched a wallet chunk before the grid was usable: grid=${gridReadyMs}ms wallet=${firstWalletStartMs}ms`);
    }
    assert.equal(adminRequests.length, 0, `${scenario.entryId} should not fetch admin chunks on the user startup path.`);

    return {
      entryId: scenario.entryId,
      source: isPagesRun ? 'live GitHub Pages' : 'local Vite production preview',
      botKey: scenario.botKey,
      startParam: scenario.startParam,
      profileTileCount: gridState.tileCount,
      appMountedMs: Math.round(gridState.appMountedMs),
      gridReadyMs: Math.round(gridReadyMs),
      walletChunkObserved: firstWalletStartMs !== null,
      firstWalletChunkMs: firstWalletStartMs,
      walletChunkFinished: walletFinished,
      walletChunkAfterGrid: walletAfterGrid,
      adminChunkCount: adminRequests.length,
      mapChunkCount: mapRequests.length,
      profileSetupChunkCount: profileSetupRequests.length,
      firstContentfulPaintMs: gridState.navigation?.firstContentfulPaintMs ?? null,
      domInteractiveMs: gridState.navigation?.domInteractiveMs ?? null,
      navigation: gridState.navigation,
      browserErrors: gridState.errors,
      mockedWorkerCalls: gridState.workerCalls,
      externalImageSummary,
      waterfall,
    };
  } finally {
    const record = browserPages.find((item) => item.page === page);
    if (record) {
      await closePage(cdpBase, record);
      browserPages.splice(browserPages.indexOf(record), 1);
    }
  }
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mobile-startup-benchmark-'));
const cdpPort = await getFreePort();
const previewPort = isPagesRun ? null : await getFreePort();
const browserLogs = [];
const previewLogs = [];
const browserPages = [];
let preview = null;
let browser = null;

try {
  if (!isPagesRun) {
    preview = spawn(path.join(appRoot, 'node_modules/.bin/vite'), [
      'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort',
    ], { cwd: appRoot, stdio: ['ignore', 'ignore', 'pipe'] });
    preview.stderr.on('data', (chunk) => previewLogs.push(String(chunk)));
    await waitForHttp(`http://127.0.0.1:${previewPort}/config.json`, preview, previewLogs, 'Vite production preview');
  }

  browser = spawn(chromiumBinary, [
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
  const cdpBase = `http://127.0.0.1:${cdpPort}`;
  const localBase = isPagesRun ? null : `http://127.0.0.1:${previewPort}`;
  await waitForHttp(`${cdpBase}/json/version`, browser, browserLogs, 'Chromium');

  const scenarios = isPagesRun
    ? [
        {
          entryId: 'nearby',
          startParam: null,
          botKey: 'botB',
          url: 'https://mileschan852.github.io/WhosNearbyBot/',
        },
        {
          entryId: 'hkmo-date',
          startParam: null,
          botKey: 'botA',
          url: 'https://mileschan852.github.io/HKMODate/',
        },
      ]
    : [
        { entryId: 'nearby', startParam: null, botKey: 'botB' },
        { entryId: 'hkmo-date', startParam: 'gaymode', botKey: 'botA' },
      ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(await benchmarkScenario(cdpBase, localBase, scenario, browserPages));
  }

  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    browserVersion: spawnSync(chromiumBinary, ['--version'], { encoding: 'utf8' }).stdout.trim(),
    mode: isPagesRun ? 'live-pages-cold-cache' : 'workspace-build-cold-cache',
    networkProfile: mobileNetwork,
    telegramWebAppSdk: 'stubbed; external Telegram SDK request blocked',
    backend: `Worker responses mocked with ${mobileNetwork.workerResponseDelayMs}ms delay`,
    results,
  }, null, 2));
} finally {
  await Promise.all(browserPages.map((record) => closePage(`http://127.0.0.1:${cdpPort}`, record)));
  await stopChild(browser);
  await stopChild(preview);
  await removeTempDirWithRetry(tempDir);
}
