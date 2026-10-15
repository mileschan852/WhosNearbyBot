import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import {
  buildProfileHeightOptions,
  buildProfileWeightOptions,
} from '../src/modules/profile-completion/profile-completion-options.js';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(new URL('../public/config.json', import.meta.url), 'utf8'));
let vite;
let ProfileCompletionModule;
let ProfileSetupPreviewModule;
let runProfilePreferenceCycleAnnouncement;
let focusFirstIncompleteProfileField;
let parseAppRuntimeConfig;

before(async () => {
  vite = await createServer({
    root: appRoot,
    configFile: false,
    plugins: [react()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  ({ default: ProfileCompletionModule } = await vite.ssrLoadModule(
    '/src/modules/profile-completion/ProfileCompletionModule.tsx',
  ));
  ({ runProfilePreferenceCycleAnnouncement } = await vite.ssrLoadModule(
    '/src/modules/profile-completion/profile-completion-announcements.ts',
  ));
  ({ default: ProfileSetupPreviewModule } = await vite.ssrLoadModule(
    '/src/modules/profile-completion/ProfileSetupPreviewModule.tsx',
  ));
  ({ focusFirstIncompleteProfileField } = await vite.ssrLoadModule(
    '/src/modules/profile-completion/profile-completion-focus.ts',
  ));
  ({ parseAppRuntimeConfig } = await vite.ssrLoadModule('/src/config/entries.ts'));
});

after(async () => {
  await vite?.close();
});

function renderCompletionForm(entry, overrides = {}) {
  const values = {
    dob: '1990-01-01',
    gender: 'man',
    seeking: 'men',
    height: '170cm (5ft 7in)',
    weight: '70kg',
    rolePref: 'Versatile',
    safetyPref: 'Safe',
    playstylePref: 'Clean',
    howManyPref: '1on1',
    wherePref: null,
    nonManMode: 'Meet up',
    ...overrides.values,
  };
  const missingFields = {
    dob: false,
    gender: false,
    height: false,
    weight: false,
    ...overrides.missingFields,
  };
  const noop = () => {};
  const onChange = Object.fromEntries(
    Object.keys(values).map((key) => [key, noop]),
  );
  return renderToStaticMarkup(React.createElement(ProfileCompletionModule, {
    entry,
    values,
    isCompletionFlow: overrides.isCompletionFlow ?? true,
    language: overrides.language ?? 'en',
    missingFields,
    onChange,
    onSubmit: noop,
    onClose: noop,
    showCloseButton: false,
    errorMessage: overrides.errorMessage ?? '',
    heightOptions: buildProfileHeightOptions(values.height),
    weightOptions: values.weight ? [values.weight] : ['70kg'],
    t: overrides.t ?? ((key) => key),
    onCycleRole: noop,
    onCycleSafety: noop,
    onCyclePlaystyle: noop,
    onCycleHowMany: noop,
    onCycleWhere: noop,
  }));
}

function getFormControls(markup) {
  return {
    birthDate: markup.match(/<input\b[^>]*type="date"[^>]*>/)?.[0] ?? '',
    selects: [...markup.matchAll(/<select\b[^>]*>/g)].map(([tag]) => tag),
    preferenceButtons: [...markup.matchAll(/<button type="button"[^>]*>/g)].map(([tag]) => tag),
  };
}

test('completion locks saved core details, leaves preferences editable, and preserves both entry lock settings', () => {
  assert.equal(config.entries.nearby.profileSetup.lockIdentity, false);
  assert.equal(config.entries['hkmo-date'].profileSetup.lockIdentity, true);

  for (const entry of Object.values(config.entries)) {
    const controls = getFormControls(renderCompletionForm(entry));
    assert.match(controls.birthDate, /disabled=""/);
    assert.match(controls.selects[0], /disabled=""/, `${entry.id} saved gender should be locked`);
    assert.equal(
      controls.selects[1].includes('disabled=""'),
      entry.profileSetup.lockIdentity,
      `${entry.id} seeking control should preserve its identity-lock setting`,
    );
    assert.match(controls.selects[2], /disabled=""/, `${entry.id} saved height should be locked`);
    assert.match(controls.selects[3], /disabled=""/, `${entry.id} saved weight should be locked`);
    assert.equal(controls.preferenceButtons.length, 5);
    assert.ok(
      controls.preferenceButtons.every((button) => !button.includes('disabled=""')),
      `${entry.id} preference controls should remain editable`,
    );
  }
});

test('runtime config accepts supported defaults for locked identity fields', () => {
  const parsedConfig = parseAppRuntimeConfig(config);
  assert.equal(parsedConfig.entries['hkmo-date'].profileSetup.defaultGender, 'man');
  assert.equal(parsedConfig.entries['hkmo-date'].profileSetup.defaultSeeking, 'men');

  const alternateValidDefaults = structuredClone(config);
  alternateValidDefaults.entries['hkmo-date'].profileSetup.defaultGender = 'non-binary';
  alternateValidDefaults.entries['hkmo-date'].profileSetup.defaultSeeking = 'everyone';
  const parsedAlternateConfig = parseAppRuntimeConfig(alternateValidDefaults);
  assert.equal(parsedAlternateConfig.entries['hkmo-date'].profileSetup.defaultGender, 'non-binary');
  assert.equal(parsedAlternateConfig.entries['hkmo-date'].profileSetup.defaultSeeking, 'everyone');
});

test('profile setup previews identify each entry and keep all edits local', () => {
  const renderPreview = (entries) => renderToStaticMarkup(React.createElement(
    ProfileSetupPreviewModule,
    {
      entries,
      language: 'en',
      onClose: () => {},
      t: (key) => key,
    },
  ));
  const configuredEntries = Object.values(config.entries);
  const allEntriesMarkup = renderPreview(configuredEntries);
  const nearbyMarkup = renderPreview([config.entries.nearby]);
  const hkmoMarkup = renderPreview([config.entries['hkmo-date']]);

  assert.ok(allEntriesMarkup.includes('data-testid="button-preview-entry-nearby"'));
  assert.ok(allEntriesMarkup.includes('data-testid="button-preview-entry-hkmo-date"'));
  assert.ok(allEntriesMarkup.includes('Previewing:'));
  assert.ok(
    allEntriesMarkup.includes('Who&#x27;s Nearby') || allEntriesMarkup.includes("Who's Nearby"),
  );
  assert.ok(allEntriesMarkup.includes('Changes stay in this preview only; nothing is saved or submitted.'));

  const nearbySelects = [...nearbyMarkup.matchAll(/<select\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(nearbySelects[0].includes('disabled=""'), false);
  assert.equal(nearbySelects[1].includes('disabled=""'), false);
  assert.ok(nearbyMarkup.includes('value="man" selected=""'));
  assert.ok(nearbyMarkup.includes('value="women" selected=""'));
  assert.ok(nearbyMarkup.includes('Still needed: Date of birth, Height, Weight'));

  const hkmoSelects = [...hkmoMarkup.matchAll(/<select\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(hkmoSelects[0].includes('disabled=""'), true);
  assert.equal(hkmoSelects[1].includes('disabled=""'), true);
  assert.ok(hkmoMarkup.includes('Gender and seeking are configured by this entry and locked.'));
  assert.ok(hkmoMarkup.includes('value="man" selected=""'));
  assert.ok(hkmoMarkup.includes('value="men" selected=""'));
  assert.ok(hkmoMarkup.includes('value="35kg (77lbs)"'));
  assert.equal(allEntriesMarkup.includes('type="submit"'), false);
  assert.equal(hkmoMarkup.includes('type="submit"'), false);
});

test('profile weight options are shared between the live form and its preview', () => {
  const options = buildProfileWeightOptions();
  assert.equal(options.length, 126);
  assert.equal(options[0], '35kg (77lbs)');
  assert.equal(options.at(-1), '160kg (353lbs)');
});

test('runtime config rejects empty or unsupported defaults when identity is locked', () => {
  const invalidDefaults = [
    ['defaultGender', ''],
    ['defaultGender', 'alien'],
    ['defaultGender', null],
    ['defaultSeeking', ''],
    ['defaultSeeking', 'none'],
    ['defaultSeeking', null],
  ];

  for (const [field, invalidValue] of invalidDefaults) {
    const invalidConfig = structuredClone(config);
    invalidConfig.entries['hkmo-date'].profileSetup[field] = invalidValue;

    assert.throws(
      () => parseAppRuntimeConfig(invalidConfig),
      new RegExp(`entry "hkmo-date".*${field}`),
      `${field}=${JSON.stringify(invalidValue)} should be rejected for a locked entry`,
    );
  }
});

test('unlocked entries do not require identity defaults to use locked-field values', () => {
  const unlockedDefaults = structuredClone(config);
  unlockedDefaults.entries.nearby.profileSetup.defaultGender = '';
  unlockedDefaults.entries.nearby.profileSetup.defaultSeeking = 'not-a-select-option';

  const parsedConfig = parseAppRuntimeConfig(unlockedDefaults);
  assert.equal(parsedConfig.entries.nearby.profileSetup.defaultGender, '');
  assert.equal(parsedConfig.entries.nearby.profileSetup.defaultSeeking, 'not-a-select-option');
});

test('missing details stay completable and configured identity locks keep their defaults', () => {
  for (const entry of Object.values(config.entries)) {
    const controls = getFormControls(renderCompletionForm(entry, {
      values: {
        dob: '',
        gender: entry.profileSetup.defaultGender,
        seeking: entry.profileSetup.defaultSeeking,
        height: '',
        weight: '',
      },
      missingFields: { dob: true, gender: true, height: true, weight: true },
    }));

    assert.ok(controls.birthDate && !controls.birthDate.includes('disabled=""'));
    assert.equal(
      controls.selects[0].includes('disabled=""'),
      entry.profileSetup.lockIdentity,
      `${entry.id} gender editability should follow its identity-lock setting`,
    );
    assert.equal(
      controls.selects[1].includes('disabled=""'),
      entry.profileSetup.lockIdentity,
      `${entry.id} seeking editability should follow its identity-lock setting`,
    );
    assert.ok(!controls.selects[2].includes('disabled=""'), `${entry.id} missing height should be editable`);
    assert.ok(!controls.selects[3].includes('disabled=""'), `${entry.id} missing weight should be editable`);
    assert.ok(
      renderCompletionForm(entry, {
        values: {
          gender: entry.profileSetup.defaultGender,
          seeking: entry.profileSetup.defaultSeeking,
        },
        missingFields: { gender: true },
      }).includes(`value="${entry.profileSetup.defaultGender}" selected=""`),
      `${entry.id} should render its configured default gender`,
    );
  }
});

test('completion status lists required details still missing and updates as values are filled', () => {
  const entry = config.entries.nearby;
  const missingMarkup = renderCompletionForm(entry, {
    values: { dob: '', height: '', weight: '' },
    missingFields: { dob: true, height: true, weight: true, gender: false },
  });

  assert.ok(missingMarkup.includes('data-testid="profile-completion-status"'));
  assert.ok(missingMarkup.includes('Still needed: Date of birth, Height, Weight'));
  assert.match(missingMarkup, /data-testid="profile-field-status-dob" data-state="missing"/);
  assert.match(missingMarkup, /data-testid="profile-field-status-height" data-state="missing"/);
  assert.match(missingMarkup, /data-testid="profile-field-status-weight" data-state="missing"/);

  const filledMarkup = renderCompletionForm(entry, {
    values: { dob: '1990-01-01', height: '170cm', weight: '70kg' },
    missingFields: { dob: true, height: true, weight: true, gender: false },
  });

  assert.ok(filledMarkup.includes('Required details are filled. Save to continue.'));
  assert.match(filledMarkup, /data-testid="profile-field-status-dob" data-state="filled"/);
  assert.match(filledMarkup, /data-testid="profile-field-status-height" data-state="filled"/);
  assert.match(filledMarkup, /data-testid="profile-field-status-weight" data-state="filled"/);
});

test('entry-locked identity defaults are labeled separately from editable fields', () => {
  const hkmoMarkup = renderCompletionForm(config.entries['hkmo-date'], {
    values: {
      gender: config.entries['hkmo-date'].profileSetup.defaultGender,
      seeking: config.entries['hkmo-date'].profileSetup.defaultSeeking,
    },
    missingFields: { gender: true },
  });
  const nearbyMarkup = renderCompletionForm(config.entries.nearby);

  assert.ok(hkmoMarkup.includes('data-testid="profile-identity-locked"'));
  assert.match(hkmoMarkup, /data-testid="profile-field-status-gender" data-state="entry-default"/);
  assert.ok(!nearbyMarkup.includes('data-testid="profile-identity-locked"'));
  assert.match(nearbyMarkup, /data-testid="profile-field-status-gender" data-state="saved"/);
  assert.match(nearbyMarkup, /data-testid="profile-field-status-dob" data-state="saved"/);
});

test('every profile control has an accessible name and its state is described', () => {
  const entry = config.entries.nearby;
  const markup = renderCompletionForm(entry, {
    values: { gender: 'man', seeking: 'men' },
  });

  for (const id of [
    'profile-completion-dob',
    'profile-completion-gender',
    'profile-completion-seeking',
    'profile-completion-height',
    'profile-completion-weight',
  ]) {
    assert.ok(markup.includes(`for="${id}"`), `${id} should have a programmatically associated label`);
    assert.ok(markup.includes(`id="${id}"`), `${id} should exist in the form`);
  }

  const controls = getFormControls(markup);
  assert.equal(controls.preferenceButtons.length, 5);
  for (const [index, fieldName] of [
    'rolePreference',
    'safetyPreference',
    'playstylePreference',
    'groupSize',
    'Where',
  ].entries()) {
    assert.ok(
      controls.preferenceButtons[index].includes(`aria-label="${fieldName}:`),
      `${fieldName} cycle button should name its field and current value`,
    );
    assert.ok(controls.preferenceButtons[index].includes('aria-describedby="profile-preference-cycle-hint"'));
  }
  const modeMarkup = renderCompletionForm(entry, {
    values: { gender: 'woman', seeking: 'men' },
  });
  assert.ok(modeMarkup.includes('for="profile-completion-mode"'));
  assert.ok(modeMarkup.includes('id="profile-completion-mode"'));

  const hkmoControls = getFormControls(renderCompletionForm(config.entries['hkmo-date']));
  assert.match(hkmoControls.birthDate, /aria-describedby="profile-field-status-dob"/);
  assert.match(hkmoControls.selects[2], /aria-describedby="profile-field-status-height"/);
  assert.match(hkmoControls.selects[3], /aria-describedby="profile-field-status-weight"/);
  assert.match(hkmoControls.selects[0], /aria-describedby="profile-field-status-gender profile-identity-locked-help"/);
  assert.match(hkmoControls.selects[1], /aria-describedby="profile-identity-locked-help"/);
  assert.ok(renderCompletionForm(config.entries['hkmo-date']).includes('Saved · locked'));
});

test('each cycled preference announces only its new value through a polite status region', () => {
  const translations = {
    rolePreference: 'Role preference',
    safetyPreference: 'Safety',
    playstylePreference: 'Style',
    groupSize: 'Group size',
    group_setup: 'Groups',
    Top: 'Top',
    Raw: 'Raw',
    Party: 'Party',
    Anywhere: 'Anywhere',
  };
  const t = (key) => translations[key] ?? key;
  const cases = [
    ['role', 'Top', 'Role preference: Top'],
    ['safety', 'Raw', 'Safety: Raw'],
    ['playstyle', 'Party', 'Style: Party'],
    ['howMany', 'group', 'Group size: Groups'],
    ['where', null, 'Where: Anywhere'],
  ];

  for (const [preference, nextValue, expected] of cases) {
    let cycleCalls = 0;
    const announcement = runProfilePreferenceCycleAnnouncement(
      preference,
      () => {
        cycleCalls += 1;
        return nextValue;
      },
      t,
      'Where',
    );
    assert.equal(cycleCalls, 1, `${preference} should cycle exactly once`);
    assert.equal(announcement, expected);
    assert.equal(announcement.includes('Required details'), false);
  }

  const markup = renderCompletionForm(config.entries.nearby);
  const announcementRegion = markup.match(
    /<div\b[^>]*data-testid="profile-preference-cycle-announcement"[^>]*>[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(announcementRegion, 'the cycle announcement live region should render');
  assert.match(announcementRegion, /role="status"/);
  assert.match(announcementRegion, /aria-live="polite"/);
  assert.match(announcementRegion, /aria-atomic="true"/);
  assert.match(announcementRegion, />\s*<\/div>$/, 'the live region should start empty');
});

test('save errors are announced and focus targets the first incomplete editable field', () => {
  const markup = renderCompletionForm(config.entries.nearby, {
    values: {
      dob: '',
      height: '',
      weight: '',
      rolePref: '',
    },
    missingFields: { dob: true, height: true, weight: true },
    errorMessage: 'Please fill in all required questions to continue.',
  });
  assert.match(markup, /data-testid="profile-completion-error"[^>]*role="alert"[^>]*aria-live="assertive"/);
  assert.match(markup, /id="profile-completion-dob"[^>]*data-profile-incomplete-editable="true"/);

  let focused = false;
  let queriedSelector = '';
  const fakeField = { focus: () => { focused = true; } };
  const didFocus = focusFirstIncompleteProfileField({
    querySelector: (selector) => {
      queriedSelector = selector;
      return fakeField;
    },
  });

  assert.equal(didFocus, true);
  assert.equal(queriedSelector, '[data-profile-incomplete-editable="true"]:not(:disabled)');
  assert.equal(focused, true);
  assert.equal(focusFirstIncompleteProfileField({ querySelector: () => null }), false);
});

test('a saved height below the new minimum stays selected and locked in partial profiles', () => {
  const savedHeight = '150cm (4ft 11in)';
  const options = buildProfileHeightOptions(savedHeight);
  assert.equal(options[0], savedHeight);
  assert.equal(options[1], '152cm (5ft 0in)');
  assert.equal(options.filter((height) => height === savedHeight).length, 1);

  for (const entry of Object.values(config.entries)) {
    const markup = renderCompletionForm(entry, {
      values: {
        dob: '',
        height: savedHeight,
        weight: '',
      },
      missingFields: { dob: true, gender: false, height: false, weight: true },
    });
    const controls = getFormControls(markup);

    assert.ok(!controls.birthDate.includes('disabled=""'));
    assert.match(controls.selects[2], /disabled=""/);
    assert.ok(!controls.selects[3].includes('disabled=""'));
    assert.ok(markup.includes(`<option value="${savedHeight}" selected="">${savedHeight}</option>`));
  }
});
