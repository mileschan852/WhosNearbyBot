import assert from 'node:assert/strict';
import vm from 'node:vm';

const SHARED_GUI_VERSION = 'current-hash.js-current-hash.css';

function createBrowserHarness() {
  const timers = [];
  const head = [];
  const body = [];
  const root = {
    dataset: { appMounted: 'false' },
    innerHTML: 'Loading HKMO Date…',
  };

  const window = {
    location: { reload() {} },
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
  };
  const document = {
    createElement(tagName) {
      return { tagName: tagName.toLowerCase() };
    },
    getElementById(id) {
      return id === 'root' ? root : null;
    },
    head: {
      appendChild(element) {
        head.push(element);
      },
    },
    body: {
      appendChild(element) {
        body.push(element);
      },
    },
  };

  return { window, document, root, timers, head, body };
}

function runInlineScripts(html, harness) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes))
    .map(([, , source]) => source);

  assert.ok(scripts.length >= 2, 'HKMO Date must include its load-error and shared-GUI loader scripts.');
  assert.match(
    html,
    /<div\b[^>]*id=["']root["'][^>]*data-app-mounted=["']false["']/i,
    'HKMO Date root must start in an unmounted state so the timeout can report a failure.',
  );
  assert.match(html, /Loading HKMO Date/i, 'HKMO Date must show a loading state before the GUI mounts.');

  const context = {
    Date,
    document: harness.document,
    window: harness.window,
  };
  for (const source of scripts) {
    vm.runInNewContext(source, context, { timeout: 1000 });
  }
}

function markerElement(harness) {
  const marker = harness.head.find(
    (element) => element.tagName === 'script' && element.src?.includes('/shared-gui-build.js?'),
  );
  assert.ok(marker, 'HKMO Date must request the shared GUI build marker.');
  return marker;
}

function loadedAssets(harness) {
  const stylesheet = harness.head.find((element) => element.rel === 'stylesheet');
  const application = harness.body.find((element) => element.type === 'module');
  assert.ok(stylesheet, 'HKMO Date must load the shared stylesheet wrapper.');
  assert.ok(application, 'HKMO Date must load the shared JavaScript wrapper.');
  return { stylesheet, application };
}

export function assertHKMODateLoaderContract(html) {
  const sharedGuiBase = html.match(/const sharedGuiBase\s*=\s*['"]([^'"]+)['"]/);
  const fallbackVersion = html.match(/const fallbackVersion\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(sharedGuiBase, 'HKMO Date must configure a shared GUI host.');
  assert.match(sharedGuiBase[1], /^https:\/\//, 'The shared GUI host must use HTTPS.');
  assert.ok(fallbackVersion?.[1], 'HKMO Date must retain a fallback GUI version.');
  assert.match(
    html,
    /role=["']alert["'][\s\S]*?HKMO Date did not load[\s\S]*?Reload/i,
    'HKMO Date must show an accessible reload message if the app does not mount.',
  );

  const current = createBrowserHarness();
  runInlineScripts(html, current);
  const currentMarker = markerElement(current);
  current.window.__WHOSNEARBY_SHARED_GUI_BUILD__ = { version: SHARED_GUI_VERSION };
  currentMarker.onload();
  const currentAssets = loadedAssets(current);
  const expectedVersion = encodeURIComponent(SHARED_GUI_VERSION);
  assert.equal(
    currentAssets.stylesheet.href,
    `${sharedGuiBase[1]}/assets/shared-gui.css?v=${expectedVersion}`,
  );
  assert.equal(
    currentAssets.application.src,
    `${sharedGuiBase[1]}/assets/shared-gui.js?v=${expectedVersion}`,
  );
  currentMarker.onerror?.();
  assert.equal(current.head.filter((element) => element.rel === 'stylesheet').length, 1);
  assert.equal(current.body.filter((element) => element.type === 'module').length, 1);

  const fallback = createBrowserHarness();
  runInlineScripts(html, fallback);
  markerElement(fallback).onerror();
  const fallbackAssets = loadedAssets(fallback);
  const fallbackKey = encodeURIComponent(fallbackVersion[1]);
  assert.equal(
    fallbackAssets.stylesheet.href,
    `${sharedGuiBase[1]}/assets/shared-gui.css?v=${fallbackKey}`,
  );
  assert.equal(
    fallbackAssets.application.src,
    `${sharedGuiBase[1]}/assets/shared-gui.js?v=${fallbackKey}`,
  );

  const missingVersion = createBrowserHarness();
  runInlineScripts(html, missingVersion);
  missingVersion.window.__WHOSNEARBY_SHARED_GUI_BUILD__ = { version: '' };
  markerElement(missingVersion).onload();
  assert.equal(
    loadedAssets(missingVersion).application.src,
    `${sharedGuiBase[1]}/assets/shared-gui.js?v=${fallbackKey}`,
  );

  const failedMount = createBrowserHarness();
  runInlineScripts(html, failedMount);
  const timeout = failedMount.timers.find(({ delay }) => delay === 12000);
  assert.ok(timeout, 'HKMO Date must set a bounded timeout for a failed GUI mount.');
  timeout.callback();
  assert.match(failedMount.root.innerHTML, /role="alert"/);
  assert.match(failedMount.root.innerHTML, /HKMO Date did not load/);
  assert.match(failedMount.root.innerHTML, /Reload/);

  const successfulMount = createBrowserHarness();
  runInlineScripts(html, successfulMount);
  successfulMount.root.dataset.appMounted = 'true';
  successfulMount.timers.find(({ delay }) => delay === 12000)?.callback();
  assert.equal(successfulMount.root.innerHTML, 'Loading HKMO Date…');

  return {
    sharedGuiBase: sharedGuiBase[1],
    fallbackVersion: fallbackVersion[1],
    currentVersion: SHARED_GUI_VERSION,
  };
}
