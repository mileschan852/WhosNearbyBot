import { resolveAppEntry } from '/src/config/resolve-app-entry.js';
import { createFilterRenewalConfirmationReporter } from '/src/utils/analytics.js';

const eventStorageKeyPrefix = '__filter_renewal_dedup_browser_test_events:';

async function prepareRenewalReport() {
  const expectedEntryId = document.body.dataset.appEntry;
  const startParam = expectedEntryId === 'hkmo-date' ? 'gaymode' : null;
  const configResponse = await fetch('/config.json', { cache: 'no-store' });
  if (!configResponse.ok) {
    throw new Error(`App config returned HTTP ${configResponse.status}.`);
  }

  const appConfig = await configResponse.json();
  const entry = resolveAppEntry(appConfig, startParam, location.search);
  if (entry.id !== expectedEntryId) {
    throw new Error(`Expected ${expectedEntryId}, but app config resolved ${entry.id}.`);
  }
  if (typeof navigator.locks?.request !== 'function') {
    throw new Error('This browser does not provide the Web Locks API.');
  }

  const serializedMarker = new URLSearchParams(location.search).get('marker');
  if (!serializedMarker) throw new Error('The shared renewal marker was not provided.');
  const marker = JSON.parse(serializedMarker);
  if (!marker.accountId || !marker.minimumExpiry || marker.entitlement !== 'filter') {
    throw new Error('The test renewal marker is incomplete.');
  }

  const eventStorageKey = `${eventStorageKeyPrefix}${expectedEntryId}`;
  localStorage.removeItem(eventStorageKey);
  window.umami = {
    track(name, data) {
      const previousEvents = JSON.parse(localStorage.getItem(eventStorageKey) || '[]');
      previousEvents.push({ name, data });
      localStorage.setItem(eventStorageKey, JSON.stringify(previousEvents));
    },
  };

  const report = createFilterRenewalConfirmationReporter();
  window.startRenewalReport = async (renewalMarker = marker) => {
    const profile = {
      id: renewalMarker.accountId,
      filter_sub_expiry: new Date(renewalMarker.minimumExpiry).toISOString(),
    };
    const reported = await report('paid', renewalMarker, profile);
    document.body.dataset.reportResult = String(reported);
    return reported;
  };
  window.runNativeLockProbe = async () => {
    const readyKeyPrefix = '__filter_renewal_dedup_browser_test_lock_probe_ready:';
    const otherEntry = expectedEntryId === 'hkmo-date' ? 'nearby' : 'hkmo-date';
    const otherReadyKey = `${readyKeyPrefix}${otherEntry}`;
    localStorage.setItem(`${readyKeyPrefix}${expectedEntryId}`, 'true');

    const deadline = Date.now() + 5_000;
    while (localStorage.getItem(otherReadyKey) !== 'true') {
      if (Date.now() >= deadline) throw new Error('The other app tab did not reach the lock probe.');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return navigator.locks.request(
      '__filter_renewal_dedup_browser_test_lock_probe__',
      { mode: 'exclusive' },
      async () => {
        const key = '__filter_renewal_dedup_browser_test_lock_probe_count__';
        const nextCount = Number(localStorage.getItem(key) || 0) + 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
        localStorage.setItem(key, String(nextCount));
        return nextCount;
      },
    );
  };
  document.body.dataset.ready = 'true';
  document.querySelector('#test-status').textContent = `${entry.label} ready`;
}

void prepareRenewalReport().catch((error) => {
  document.body.dataset.ready = 'failed';
  document.body.dataset.error = error instanceof Error ? error.message : String(error);
  document.querySelector('#test-status').textContent = document.body.dataset.error;
});
