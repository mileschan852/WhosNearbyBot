import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import * as ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import {
  buildProfileHeightOptions,
  buildProfileWeightOptions,
  PROFILE_HOW_MANY_CYCLE_OPTIONS,
  PROFILE_PLAYSTYLE_CYCLE_OPTIONS,
  PROFILE_ROLE_CYCLE_OPTIONS,
  PROFILE_SAFETY_CYCLE_OPTIONS,
  PROFILE_WHERE_CYCLE_OPTIONS,
} from '../src/modules/profile-completion/profile-completion-options.js';

function propertyNameText(name) {
  if (
    ts.isIdentifier(name)
    || ts.isStringLiteral(name)
    || ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

function readAppTranslations(source) {
  const sourceFile = ts.createSourceFile(
    'App.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(({ declarationList }) => [...declarationList.declarations])
    .find(({ name }) => ts.isIdentifier(name) && name.text === 'translations');
  assert.ok(declaration, 'App.tsx should define the app translations');
  assert.ok(
    declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer),
    'App translations should remain an object literal that this check can inspect',
  );

  const languages = {};
  for (const languageProperty of declaration.initializer.properties) {
    if (!ts.isPropertyAssignment(languageProperty)) continue;
    const language = propertyNameText(languageProperty.name);
    const dictionary = languageProperty.initializer;
    if (!language || !ts.isObjectLiteralExpression(dictionary)) continue;

    const translations = {};
    for (const entry of dictionary.properties) {
      if (!ts.isPropertyAssignment(entry)) continue;
      const key = propertyNameText(entry.name);
      if (key && ts.isStringLiteralLike(entry.initializer)) {
        translations[key] = entry.initializer.text;
      }
    }
    languages[language] = translations;
  }
  return languages;
}

function readObjectLiteralValue(node, sourceName) {
  assert.ok(ts.isObjectLiteralExpression(node), `${sourceName} should remain an object literal`);
  const value = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyNameText(property.name);
    if (!key) continue;

    if (ts.isStringLiteralLike(property.initializer)) {
      value[key] = property.initializer.text;
    } else if (ts.isObjectLiteralExpression(property.initializer)) {
      value[key] = readObjectLiteralValue(property.initializer, sourceName);
    }
  }
  return value;
}

function readObjectLiteralVariable(source, sourceName, variableName) {
  const sourceFile = ts.createSourceFile(
    sourceName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(({ declarationList }) => [...declarationList.declarations])
    .find(({ name }) => ts.isIdentifier(name) && name.text === variableName);
  assert.ok(declaration?.initializer, `${sourceName} should define ${variableName}`);
  return readObjectLiteralValue(declaration.initializer, `${sourceName} ${variableName}`);
}

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(new URL('../public/config.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const appTranslations = readAppTranslations(appSource);
const profileCompletionSource = await readFile(
  new URL('../src/modules/profile-completion/ProfileCompletionModule.tsx', import.meta.url),
  'utf8',
);
const profileSetupPreviewSource = await readFile(
  new URL('../src/modules/profile-completion/ProfileSetupPreviewModule.tsx', import.meta.url),
  'utf8',
);
const completionStatusTranslations = readObjectLiteralVariable(
  profileCompletionSource,
  'ProfileCompletionModule.tsx',
  'completionStatusCopy',
);
const profileSetupPreviewTranslations = readObjectLiteralVariable(
  profileSetupPreviewSource,
  'ProfileSetupPreviewModule.tsx',
  'copy',
);
let vite;
let ProfileCompletionModule;
let ProfileSetupPreviewModule;
let runProfilePreferenceCycleAnnouncement;
let focusFirstIncompleteProfileField;
let parseAppRuntimeConfig;
let resolveInitialProfileIdentity;
let profileGenderOptions;
let profileSeekingOptions;

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
  ({
    parseAppRuntimeConfig,
    resolveInitialProfileIdentity,
    PROFILE_GENDER_OPTIONS: profileGenderOptions,
    PROFILE_SEEKING_OPTIONS: profileSeekingOptions,
  } = await vite.ssrLoadModule('/src/config/entries.ts'));
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
    showCloseButton: overrides.showCloseButton ?? false,
    previewOnly: overrides.previewOnly ?? false,
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

function getSelectOptionValues(markup, id) {
  const selectPattern = new RegExp(
    `<select\\b(?=[^>]*\\bid="${id}")[^>]*>([\\s\\S]*?)</select>`,
  );
  const selectMarkup = markup.match(selectPattern)?.[1] ?? '';
  return [...selectMarkup.matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)]
    .map(([, value]) => value);
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function getPreferenceCycleButtons(markup) {
  return [
    ...markup.matchAll(
      /<button\b(?=[^>]*aria-describedby="profile-preference-cycle-hint")[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g,
    ),
  ].map(([, accessibleName, contents]) => ({
    accessibleName: decodeHtmlEntities(accessibleName),
    visibleValue: decodeHtmlEntities(contents.replace(/<[^>]*>/g, '').trim()),
  }));
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

test('saved profile identity is preserved when entering through either app entry', () => {
  const entries = parseAppRuntimeConfig(config).entries;
  const savedProfiles = [
    { gender: 'woman', seeking: 'men' },
    { gender: 'man', seeking: 'women' },
    { gender: 'non-binary', seeking: 'everyone' },
  ];

  for (const entry of Object.values(entries)) {
    for (const savedProfile of savedProfiles) {
      assert.deepEqual(
        resolveInitialProfileIdentity(savedProfile, entry),
        savedProfile,
        `${entry.id} must keep the saved gender and seeking values`,
      );
    }
  }

  assert.match(
    appSource,
    /resolveInitialProfileIdentity\(existingProfile,\s*activeEntry\)/,
    'app initialization must resolve saved identity before applying entry defaults',
  );
});

test('new profiles receive only the selected entry identity defaults', () => {
  const entries = parseAppRuntimeConfig(config).entries;
  const nearbyIdentity = resolveInitialProfileIdentity(null, entries.nearby);
  const hkmoIdentity = resolveInitialProfileIdentity(null, entries['hkmo-date']);

  assert.deepEqual(nearbyIdentity, {
    gender: entries.nearby.profileSetup.defaultGender,
    seeking: entries.nearby.profileSetup.defaultSeeking,
  });
  assert.deepEqual(hkmoIdentity, {
    gender: entries['hkmo-date'].profileSetup.defaultGender,
    seeking: entries['hkmo-date'].profileSetup.defaultSeeking,
  });
  assert.notDeepEqual(
    nearbyIdentity,
    hkmoIdentity,
    'the selected entry must determine the first-time seeking default',
  );
});

test('reset profiles reopen completion with the selected entry defaults as valid options', () => {
  const entries = parseAppRuntimeConfig(config).entries;

  for (const entry of Object.values(entries)) {
    const resetProfile = {
      dob: null,
      gender: null,
      seeking: null,
      height: null,
      weight: null,
    };
    const identity = resolveInitialProfileIdentity(resetProfile, entry);
    const markup = renderCompletionForm(entry, {
      values: {
        dob: '',
        gender: identity.gender,
        seeking: identity.seeking,
        height: '',
        weight: '',
      },
      missingFields: { dob: true, gender: true, height: true, weight: true },
    });

    assert.ok(
      getSelectOptionValues(markup, 'profile-completion-gender').includes(identity.gender),
      `${entry.id} reset gender default must be an available option`,
    );
    assert.ok(
      getSelectOptionValues(markup, 'profile-completion-seeking').includes(identity.seeking),
      `${entry.id} reset seeking default must be an available option`,
    );
    assert.ok(
      markup.includes(`<option value="${identity.gender}" selected="">`),
      `${entry.id} reset gender default must be selected in the reopened form`,
    );
    assert.ok(
      markup.includes(`<option value="${identity.seeking}" selected="">`),
      `${entry.id} reset seeking default must be selected in the reopened form`,
    );
  }

  assert.match(
    appSource,
    /if\s*\(!isFullySetup\)\s*\{\s*setShowProfileSetup\(true\)/,
    'an incomplete reset profile must reopen the profile-completion flow',
  );
});

test('partially saved identity keeps existing values and defaults only missing values', () => {
  const entries = parseAppRuntimeConfig(config).entries;

  for (const entry of Object.values(entries)) {
    assert.deepEqual(
      resolveInitialProfileIdentity({ gender: 'woman' }, entry),
      {
        gender: 'woman',
        seeking: entry.profileSetup.defaultSeeking,
      },
      `${entry.id} must not replace saved gender while filling missing seeking`,
    );
    assert.deepEqual(
      resolveInitialProfileIdentity({ seeking: 'everyone' }, entry),
      {
        gender: entry.profileSetup.defaultGender,
        seeking: 'everyone',
      },
      `${entry.id} must not replace saved seeking while filling missing gender`,
    );
  }
});

test('every supported locked identity default is selectable in the rendered profile form', () => {
  const entryId = 'hkmo-date';
  const formMarkup = renderCompletionForm(
    parseAppRuntimeConfig(config).entries[entryId],
  );

  assert.deepEqual(
    getSelectOptionValues(formMarkup, 'profile-completion-gender'),
    profileGenderOptions.map(({ value }) => value),
  );
  assert.deepEqual(
    getSelectOptionValues(formMarkup, 'profile-completion-seeking'),
    profileSeekingOptions.map(({ value }) => value),
  );

  for (const { value } of profileGenderOptions) {
    const configWithDefault = structuredClone(config);
    configWithDefault.entries[entryId].profileSetup.defaultGender = value;
    const parsedEntry = parseAppRuntimeConfig(configWithDefault).entries[entryId];
    assert.ok(
      getSelectOptionValues(
        renderCompletionForm(parsedEntry),
        'profile-completion-gender',
      ).includes(parsedEntry.profileSetup.defaultGender),
      `${entryId} must render accepted gender default "${value}" as an option`,
    );
  }

  for (const { value } of profileSeekingOptions) {
    const configWithDefault = structuredClone(config);
    configWithDefault.entries[entryId].profileSetup.defaultSeeking = value;
    const parsedEntry = parseAppRuntimeConfig(configWithDefault).entries[entryId];
    assert.ok(
      getSelectOptionValues(
        renderCompletionForm(parsedEntry),
        'profile-completion-seeking',
      ).includes(parsedEntry.profileSetup.defaultSeeking),
      `${entryId} must render accepted seeking default "${value}" as an option`,
    );
  }
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

test('invalid locked identity defaults identify the specific clone entry', () => {
  const cloneId = 'test-clone';
  const cloneConfig = structuredClone(config);
  cloneConfig.entries[cloneId] = {
    ...structuredClone(config.entries['hkmo-date']),
    id: cloneId,
    label: 'Test clone',
  };

  for (const [field, invalidValue] of [
    ['defaultGender', 'alien'],
    ['defaultSeeking', 'none'],
  ]) {
    const invalidCloneConfig = structuredClone(cloneConfig);
    invalidCloneConfig.entries[cloneId].profileSetup[field] = invalidValue;

    assert.throws(
      () => parseAppRuntimeConfig(invalidCloneConfig),
      new RegExp(`entry "${cloneId}".*${field}`),
      `invalid ${field} should identify the clone entry that needs correction`,
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

test('profile completion labels, instructions, and validation text are translated in all six languages', () => {
  const languages = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru'];
  const profileTranslationKeys = [...new Set([
    config.entries.nearby.profileSetup.titleKey,
    config.entries.nearby.profileSetup.warningKey,
    'dob',
    'imA',
    'seeking',
    'height',
    'selectHeight',
    'weight',
    'selectWeight',
    'tapToChange',
    'mode',
    'rolePreference',
    'safetyPreference',
    'playstylePreference',
    'groupSize',
    'Anywhere',
    'saveProfile',
    'close',
    'fillAll',
    'errorSaving',
    ...profileGenderOptions.map(({ labelKey }) => labelKey),
    ...profileSeekingOptions.map(({ labelKey }) => labelKey),
    ...PROFILE_ROLE_CYCLE_OPTIONS,
    ...PROFILE_SAFETY_CYCLE_OPTIONS,
    ...PROFILE_PLAYSTYLE_CYCLE_OPTIONS,
    ...PROFILE_HOW_MANY_CYCLE_OPTIONS.map((value) => `${value}_setup`),
    ...PROFILE_WHERE_CYCLE_OPTIONS.filter((value) => value !== null),
  ])];
  const statusKeys = [
    'heading',
    'missingSummary',
    'readySummary',
    'previewReadySummary',
    'missing',
    'filled',
    'saved',
    'setByApp',
    'identityLocked',
    'warning',
    'editWarning',
  ];
  const statusLabelKeys = ['dob', 'gender', 'height', 'weight', 'where'];
  const modeKeys = ['browsingOnly', 'onlineOnly', 'meetUp'];
  const modeMeaningPhrases = {
    en: {
      browsingOnly: ['send or receive private messages'],
      onlineOnly: ['not on the map', 'map access is disabled'],
      meetUp: ['grid and map'],
    },
    'zh-CN': {
      browsingOnly: ['不能发送或接收私信'],
      onlineOnly: ['不会显示在地图上', '无法使用地图'],
      meetUp: ['网格和地图'],
    },
    'zh-TW': {
      browsingOnly: ['無法傳送或接收私訊'],
      onlineOnly: ['不會顯示在地圖上', '無法使用地圖'],
      meetUp: ['網格和地圖'],
    },
    ja: {
      browsingOnly: ['送信したり受信したりできません'],
      onlineOnly: ['地図には表示されず', '地図も利用できません'],
      meetUp: ['グリッドと地図'],
    },
    ko: {
      browsingOnly: ['메시지를 보내거나 받을 수 없습니다'],
      onlineOnly: ['지도에는 표시되지 않으며', '지도도 사용할 수 없습니다'],
      meetUp: ['그리드와 지도'],
    },
    ru: {
      browsingOnly: ['отправлять и получать личные сообщения'],
      onlineOnly: ['но не на карте', 'карта недоступна'],
      meetUp: ['и в сетке, и на карте'],
    },
  };

  assert.deepEqual(Object.keys(appTranslations).sort(), [...languages].sort());
  assert.deepEqual(Object.keys(completionStatusTranslations).sort(), [...languages].sort());
  assert.deepEqual(Object.keys(profileSetupPreviewTranslations).sort(), [...languages].sort());
  assert.match(
    appSource,
    /translations\[lang\]\?\.\[key\]\s*\|\|\s*translations\['en'\]\[key\]\s*\|\|\s*key/,
    'the app should retain its existing language-to-English-to-key fallback',
  );
  assert.match(appSource, /setErrorMessage\(t\('fillAll'\)\)/);
  assert.match(appSource, /setErrorMessage\(`\$\{t\('errorSaving'\)\}/);

  for (const language of languages) {
    const dictionary = appTranslations[language];
    const statusCopy = completionStatusTranslations[language];
    const englishStatusCopy = completionStatusTranslations.en;

    for (const key of profileTranslationKeys) {
      const value = dictionary[key];
      assert.equal(typeof value, 'string', `${language} should define profile translation ${key}`);
      assert.ok(value.trim(), `${language} profile translation ${key} should not be empty`);
      assert.ok(!value.includes('\uFFFD'), `${language} profile translation ${key} should be valid text`);
      if (language !== 'en') {
        assert.notEqual(value, key, `${language} should not show the untranslated key ${key}`);
      }
    }

    assert.deepEqual(
      Object.keys(statusCopy).sort(),
      [...statusKeys, 'labels', 'modes'].sort(),
      `${language} should provide every profile status message`,
    );
    assert.deepEqual(
      Object.keys(statusCopy.labels).sort(),
      [...statusLabelKeys].sort(),
      `${language} should provide all status field labels`,
    );
    assert.deepEqual(
      Object.keys(statusCopy.modes).sort(),
      [...modeKeys].sort(),
      `${language} should provide all profile mode descriptions`,
    );

    const statusValues = {
      ...Object.fromEntries(statusKeys.map((key) => [key, statusCopy[key]])),
      ...Object.fromEntries(
        statusLabelKeys.map((key) => [`labels.${key}`, statusCopy.labels[key]]),
      ),
      ...Object.fromEntries(
        modeKeys.map((key) => [`modes.${key}`, statusCopy.modes[key]]),
      ),
    };
    const englishStatusValues = {
      ...Object.fromEntries(statusKeys.map((key) => [key, englishStatusCopy[key]])),
      ...Object.fromEntries(
        statusLabelKeys.map((key) => [`labels.${key}`, englishStatusCopy.labels[key]]),
      ),
      ...Object.fromEntries(
        modeKeys.map((key) => [`modes.${key}`, englishStatusCopy.modes[key]]),
      ),
    };
    for (const [key, value] of Object.entries(statusValues)) {
      assert.equal(typeof value, 'string', `${language} should define profile status copy ${key}`);
      assert.ok(value.trim(), `${language} profile status copy ${key} should not be empty`);
      assert.ok(!value.includes('\uFFFD'), `${language} profile status copy ${key} should be valid text`);
      if (language !== 'en') {
        assert.notEqual(
          value,
          englishStatusValues[key],
          `${language} should translate profile status copy ${key}`,
        );
      }
    }

    const previewCopy = profileSetupPreviewTranslations[language];
    const englishPreviewCopy = profileSetupPreviewTranslations.en;
    const previewKeys = [
      'eyebrow',
      'title',
      'intro',
      'selected',
      'identity',
      'locked',
      'editable',
      'lockedDetail',
      'editableDetail',
      'localNotice',
      'unavailable',
    ];
    assert.deepEqual(
      Object.keys(previewCopy).sort(),
      [...previewKeys].sort(),
      `${language} should provide every profile-setup preview label`,
    );
    for (const key of previewKeys) {
      const value = previewCopy[key];
      assert.equal(typeof value, 'string', `${language} should define preview copy ${key}`);
      assert.ok(value.trim(), `${language} preview copy ${key} should not be empty`);
      assert.ok(!value.includes('\uFFFD'), `${language} preview copy ${key} should be valid text`);
      if (language !== 'en') {
        assert.notEqual(value, englishPreviewCopy[key], `${language} should translate preview copy ${key}`);
      }
    }

    const t = (key) => dictionary[key] || appTranslations.en[key] || key;
    const entry = config.entries['hkmo-date'];
    const incompleteMarkup = renderCompletionForm(entry, {
      language,
      t,
      showCloseButton: true,
      errorMessage: t('fillAll'),
      values: {
        dob: '',
        gender: entry.profileSetup.defaultGender,
        seeking: entry.profileSetup.defaultSeeking,
        height: '',
        weight: '',
      },
      missingFields: { dob: true, gender: true, height: true, weight: true },
    });
    assert.ok(incompleteMarkup.includes(t(entry.profileSetup.titleKey)));
    assert.ok(incompleteMarkup.includes(statusCopy.warning));
    assert.ok(incompleteMarkup.includes(t('fillAll')));
    assert.ok(incompleteMarkup.includes(t('close')));
    assert.ok(incompleteMarkup.includes(statusCopy.heading));
    assert.ok(incompleteMarkup.includes(statusCopy.missingSummary.split('{fields}')[0]));
    assert.ok(incompleteMarkup.includes(statusCopy.missing));
    assert.ok(incompleteMarkup.includes(statusCopy.setByApp));
    assert.ok(incompleteMarkup.includes(statusCopy.identityLocked));
    assert.ok(!incompleteMarkup.includes('\uFFFD'), `${language} form should not render replacement characters`);

    const editMarkup = renderCompletionForm(entry, {
      language,
      t,
      isCompletionFlow: false,
    });
    assert.ok(editMarkup.includes(statusCopy.editWarning));
    assert.ok(!editMarkup.includes(statusCopy.warning));
    assert.ok(!editMarkup.includes('\uFFFD'));

    const modeMarkup = renderCompletionForm(config.entries.nearby, {
      language,
      t,
      values: { gender: 'woman', seeking: 'men' },
    });
    for (const modeKey of modeKeys) {
      assert.ok(modeMarkup.includes(statusCopy.modes[modeKey]));
      for (const phrase of modeMeaningPhrases[language][modeKey]) {
        assert.ok(
          statusCopy.modes[modeKey].includes(phrase),
          `${language} ${modeKey} should explain ${phrase}`,
        );
      }
    }
    assert.ok(!modeMarkup.includes('\uFFFD'), `${language} mode options should not render replacement characters`);

    const savingErrorMarkup = renderCompletionForm(entry, {
      language,
      t,
      errorMessage: `${t('errorSaving')} example`,
    });
    assert.ok(savingErrorMarkup.includes(t('errorSaving')));
    assert.ok(!savingErrorMarkup.includes('\uFFFD'));

    const customWarningEntry = structuredClone(entry);
    customWarningEntry.profileSetup.warningKey = 'customProfileWarning';
    const customWarningMarkup = renderCompletionForm(customWarningEntry, {
      language,
      t: (key) => (key === 'customProfileWarning' ? 'Custom profile warning' : t(key)),
    });
    assert.ok(customWarningMarkup.includes('Custom profile warning'));

    const readyMarkup = renderCompletionForm(entry, {
      language,
      t,
      values: { gender: entry.profileSetup.defaultGender, seeking: entry.profileSetup.defaultSeeking },
      missingFields: { dob: true, gender: true, height: true, weight: true },
    });
    assert.ok(readyMarkup.includes(statusCopy.readySummary));
    assert.ok(readyMarkup.includes(statusCopy.filled));

    const savedMarkup = renderCompletionForm(entry, {
      language,
      t,
      values: { gender: entry.profileSetup.defaultGender, seeking: entry.profileSetup.defaultSeeking },
      missingFields: { dob: false, gender: false, height: false, weight: false },
    });
    assert.ok(savedMarkup.includes(statusCopy.saved));

    const previewMarkup = renderCompletionForm(entry, {
      language,
      t,
      previewOnly: true,
      values: { gender: entry.profileSetup.defaultGender, seeking: entry.profileSetup.defaultSeeking },
      missingFields: { dob: true, gender: true, height: true, weight: true },
    });
    assert.ok(previewMarkup.includes(statusCopy.previewReadySummary));
    assert.ok(!previewMarkup.includes('\uFFFD'));

    const ownerPreviewMarkup = renderToStaticMarkup(React.createElement(
      ProfileSetupPreviewModule,
      {
        entries: [config.entries['hkmo-date']],
        language,
        onClose: () => {},
        t,
      },
    ));
    for (const key of [
      'eyebrow',
      'title',
      'intro',
      'selected',
      'identity',
      'locked',
      'lockedDetail',
      'localNotice',
    ]) {
      assert.ok(ownerPreviewMarkup.includes(previewCopy[key]));
    }
    assert.ok(!ownerPreviewMarkup.includes('\uFFFD'));

    const unavailablePreviewMarkup = renderToStaticMarkup(React.createElement(
      ProfileSetupPreviewModule,
      { entries: [], language, onClose: () => {}, t },
    ));
    assert.ok(unavailablePreviewMarkup.includes(previewCopy.unavailable));
    assert.ok(!unavailablePreviewMarkup.includes('\uFFFD'));
  }
});

test('cycle announcements match visible preference labels in all supported languages', () => {
  const languages = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru'];
  assert.deepEqual(Object.keys(appTranslations).sort(), [...languages].sort());

  const cases = [
    {
      preference: 'role',
      field: 'rolePref',
      options: PROFILE_ROLE_CYCLE_OPTIONS,
      buttonIndex: 0,
    },
    {
      preference: 'safety',
      field: 'safetyPref',
      options: PROFILE_SAFETY_CYCLE_OPTIONS,
      buttonIndex: 1,
    },
    {
      preference: 'playstyle',
      field: 'playstylePref',
      options: PROFILE_PLAYSTYLE_CYCLE_OPTIONS,
      buttonIndex: 2,
    },
    {
      preference: 'howMany',
      field: 'howManyPref',
      options: PROFILE_HOW_MANY_CYCLE_OPTIONS,
      buttonIndex: 3,
    },
    {
      preference: 'where',
      field: 'wherePref',
      options: PROFILE_WHERE_CYCLE_OPTIONS,
      buttonIndex: 4,
    },
  ];
  const requiredTranslationKeys = [
    'rolePreference',
    'safetyPreference',
    'playstylePreference',
    'groupSize',
    'Anywhere',
    ...PROFILE_ROLE_CYCLE_OPTIONS,
    ...PROFILE_SAFETY_CYCLE_OPTIONS,
    ...PROFILE_PLAYSTYLE_CYCLE_OPTIONS,
    ...PROFILE_HOW_MANY_CYCLE_OPTIONS.map((value) => `${value}_setup`),
    ...PROFILE_WHERE_CYCLE_OPTIONS.filter((value) => value !== null),
  ];

  for (const language of languages) {
    const dictionary = appTranslations[language];
    const t = (key) => dictionary[key] || appTranslations.en[key] || key;

    for (const key of requiredTranslationKeys) {
      assert.ok(dictionary[key], `${language} should translate ${key}`);
      assert.equal(
        dictionary[key].includes('\uFFFD'),
        false,
        `${language} translation for ${key} should not contain replacement characters`,
      );
      if (language !== 'en') {
        assert.notEqual(
          dictionary[key],
          key,
          `${language} should not fall back to the untranslated ${key} label`,
        );
      }
    }

    const initialMarkup = renderCompletionForm(config.entries.nearby, {
      language,
      t,
    });
    const announcementRegion = initialMarkup.match(
      /<div\b[^>]*data-testid="profile-preference-cycle-announcement"[^>]*>[\s\S]*?<\/div>/,
    )?.[0];
    assert.ok(announcementRegion, `${language} should render the cycle announcement region`);
    assert.match(announcementRegion, /role="status"/);
    assert.match(announcementRegion, /aria-live="polite"/);
    assert.match(announcementRegion, /aria-atomic="true"/);
    assert.match(announcementRegion, />\s*<\/div>$/, 'the live region should start empty');

    for (const cycleCase of cases) {
      for (const nextValue of cycleCase.options) {
        const markup = renderCompletionForm(config.entries.nearby, {
          language,
          t,
          values: { [cycleCase.field]: nextValue },
        });
        const buttons = getPreferenceCycleButtons(markup);
        assert.equal(buttons.length, 5, `${language} should render all five cycle buttons`);

        const button = buttons[cycleCase.buttonIndex];
        const whereButton = buttons[4];
        const whereLabel = whereButton.accessibleName.slice(
          0,
          whereButton.accessibleName.lastIndexOf(': '),
        );
        let cycleCalls = 0;
        const announcement = runProfilePreferenceCycleAnnouncement(
          cycleCase.preference,
          () => {
            cycleCalls += 1;
            return nextValue;
          },
          t,
          whereLabel,
        );

        assert.equal(cycleCalls, 1, `${language} ${cycleCase.preference} should cycle once`);
        assert.equal(
          announcement,
          button.accessibleName,
          `${language} announcement should match the visible button's accessible label`,
        );
        assert.ok(
          announcement.endsWith(`: ${button.visibleValue}`),
          `${language} announcement should use the same visible value as its button`,
        );
        assert.ok(announcement.length <= 120, `${language} announcement should remain concise`);
        assert.doesNotMatch(announcement, /\b(?:undefined|null)\b/i);
      }
    }
  }
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
