import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import * as ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const LANGUAGES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru'];
const INTENTIONALLY_UNTRANSLATED_LABEL_KEYS = new Set(['Party✓']);
const SCREEN_COPY_CONSTANTS = [
  'FILTER_UI_COPY',
  'FILTER_EARLY_RENEWAL_PROMPT_COPY',
  'PAID_FEATURE_NOTICE_COPY',
  'FILTER_CYCLE_COPY',
  'PROFILE_INTEREST_COPY',
  'SCREEN_HELP_COPY',
  'NO_DISCOVERY_MODULES_COPY',
  'DAILY_SWIPE_COPY',
  'flyingMessageCopy',
  'raffleUiCopy',
];

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function readInitializer(node, sourceFile) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = propertyNameText(property.name);
        if (key) value[key] = readInitializer(property.initializer, sourceFile);
      } else if (ts.isMethodDeclaration(property)) {
        const key = propertyNameText(property.name);
        if (key) value[key] = { translationNodeKind: 'function' };
      }
    }
    return value;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => readInitializer(element, sourceFile));
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return { translationNodeKind: 'function' };
  }
  return {
    translationNodeKind: 'dynamic',
    source: node.getText(sourceFile),
  };
}

function shapeOf(value) {
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return ['array', ...value.map(shapeOf)];
  if (value && typeof value === 'object' && value.translationNodeKind) {
    return value.translationNodeKind;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, shapeOf(nested)]),
    );
  }
  return typeof value;
}

function stringLeaves(value, path = []) {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((nested, index) => stringLeaves(nested, [...path, String(index)]));
  }
  if (value && typeof value === 'object' && !value.translationNodeKind) {
    return Object.entries(value).flatMap(([key, nested]) =>
      stringLeaves(nested, [...path, key]));
  }
  return [];
}

function placeholderTokens(value) {
  return [...value.matchAll(/\{[^{}]+\}/g)].map(([token]) => token).sort();
}

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const mapSource = await readFile(new URL('../src/components/MapView.tsx', import.meta.url), 'utf8');
const appSourceFile = ts.createSourceFile(
  'App.tsx',
  appSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declarations = appSourceFile.statements
  .filter(ts.isVariableStatement)
  .flatMap(({ declarationList }) => [...declarationList.declarations]);

function readAppConstant(name) {
  const declaration = declarations.find(
    ({ name: declarationName }) =>
      ts.isIdentifier(declarationName) && declarationName.text === name,
  );
  assert.ok(declaration?.initializer, `App.tsx should define ${name}`);
  return readInitializer(declaration.initializer, appSourceFile);
}

const appTranslations = readAppConstant('translations');
const howManyGroupLabels = readAppConstant('HOW_MANY_GROUP_LABELS');
const profileUpdateOfferCopy = readAppConstant('PROFILE_UPDATE_OFFER_COPY');
const screenCopies = Object.fromEntries(
  SCREEN_COPY_CONSTANTS.map((name) => [name, readAppConstant(name)]),
);
let vite;
let BottomNavigationModule;
let NearbyGridModule;
let DailySwipeModule;
let FlyingMessageModule;

before(async () => {
  vite = await createServer({
    root: appRoot,
    configFile: false,
    plugins: [react()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  ({ default: BottomNavigationModule } = await vite.ssrLoadModule(
    '/src/modules/navigation/BottomNavigationModule.tsx',
  ));
  ({ default: NearbyGridModule } = await vite.ssrLoadModule(
    '/src/modules/nearby-grid/NearbyGridModule.tsx',
  ));
  ({ default: DailySwipeModule } = await vite.ssrLoadModule(
    '/src/modules/nearby-grid/DailySwipeModule.tsx',
  ));
  ({ default: FlyingMessageModule } = await vite.ssrLoadModule(
    '/src/modules/flying-message/FlyingMessageModule.tsx',
  ));
});

after(async () => {
  await vite?.close();
});

test('all app labels cover six languages without missing, garbled, or raw-key copy', () => {
  assert.deepEqual(Object.keys(appTranslations).sort(), [...LANGUAGES].sort());
  const english = appTranslations.en;
  const englishKeys = Object.keys(english).sort();

  for (const language of LANGUAGES) {
    const dictionary = appTranslations[language];
    assert.deepEqual(
      Object.keys(dictionary).sort(),
      englishKeys,
      `${language} should define the same app translation keys as English`,
    );

    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, 'string', `${language} ${key} should be a string`);
      assert.ok(value.trim(), `${language} ${key} should not be empty`);
      assert.ok(!value.includes('\uFFFD'), `${language} ${key} should not contain replacement characters`);
      if (language !== 'en' && !INTENTIONALLY_UNTRANSLATED_LABEL_KEYS.has(key)) {
        assert.notEqual(value, key, `${language} ${key} should not render its translation key`);
      }
      assert.deepEqual(
        placeholderTokens(value),
        placeholderTokens(english[key]),
        `${language} ${key} should preserve the English interpolation placeholders`,
      );
    }
  }
});

test('group-only profile/filter labels and reset-offer copy are complete in every language', () => {
  const groupLabels = {
    en: 'Groups Only',
    'zh-CN': '仅限群组',
    'zh-TW': '僅限群組',
    ja: 'グループのみ',
    ko: '그룹 전용',
    ru: 'Только группы',
  };
  const offerFields = ['title', 'body', 'useNow', 'forfeit', 'failed', 'resetAllConfirm'];
  assert.deepEqual(Object.keys(profileUpdateOfferCopy).sort(), [...LANGUAGES].sort());

  for (const language of LANGUAGES) {
    assert.equal(howManyGroupLabels[language], groupLabels[language]);
    assert.deepEqual(Object.keys(profileUpdateOfferCopy[language]).sort(), [...offerFields].sort());
    for (const value of Object.values(profileUpdateOfferCopy[language])) {
      assert.ok(value.trim(), `${language} reset-offer copy should not be empty`);
    }
  }

  assert.match(appSource, /howManyLabel\(activeProfile\.how_many_pref\)/);
  assert.match(appSource, /VipGrantNoticeDialog/);
  assert.match(appSource, /api\/rewards\/ack/);
  assert.match(appSource, /if \(pendingProfileUpdateOfferAt\)/);
  assert.match(appSource, /else if\s*\(!isFullySetup\)\s*\{\s*setShowProfileSetup\(true\)/);
  assert.doesNotMatch(appSource, /profileSetupWasForfeited/);
});

test('screen-specific copy is complete and valid in every supported language', () => {
  for (const [name, copyByLanguage] of Object.entries(screenCopies)) {
    assert.deepEqual(
      Object.keys(copyByLanguage).sort(),
      [...LANGUAGES].sort(),
      `${name} should define every supported language`,
    );
    const englishShape = shapeOf(copyByLanguage.en);
    const englishLeaves = new Map(
      stringLeaves(copyByLanguage.en).map(([path, value]) => [path.join('.'), value]),
    );

    for (const language of LANGUAGES) {
      const copy = copyByLanguage[language];
      assert.deepEqual(shapeOf(copy), englishShape, `${language} ${name} should have all English copy fields`);
      for (const [path, value] of stringLeaves(copy)) {
        const label = `${language} ${name}.${path.join('.') || 'value'}`;
        assert.ok(value.trim(), `${label} should not be empty`);
        assert.ok(!value.includes('\uFFFD'), `${label} should not contain replacement characters`);
        if (language !== 'en') {
          assert.notEqual(value, path.at(-1), `${label} should not render an untranslated copy key`);
        }
        const englishValue = englishLeaves.get(path.join('.'));
        if (englishValue !== undefined) {
          assert.deepEqual(
            placeholderTokens(value),
            placeholderTokens(englishValue),
            `${label} should preserve the English interpolation placeholders`,
          );
        }
      }
    }
  }
});

test('untranslated labels retain the English fallback behavior', () => {
  assert.match(
    appSource,
    /const t = \(key: string\) =>[\s\S]*translations\[lang\]\?\.\[key\][\s\S]*translations\['en'\]\[key\][\s\S]*\|\|\s*key;/,
    'the app translator should continue falling back to English before exposing a key',
  );

  const fixture = { en: { intentionalFallback: 'English fallback copy' }, 'zh-CN': {} };
  const resolve = (language, key) => fixture[language]?.[key] || fixture.en[key] || key;
  assert.equal(resolve('zh-CN', 'intentionalFallback'), fixture.en.intentionalFallback);
});

test('grid, swipe, chat, and wallet navigation labels render accessibly in all languages', () => {
  for (const language of LANGUAGES) {
    const dictionary = {
      ...appTranslations[language],
      ...screenCopies.DAILY_SWIPE_COPY[language],
    };
    const markup = renderToStaticMarkup(React.createElement(BottomNavigationModule, {
      view: 'swipe',
      gridVisible: true,
      mapVisible: true,
      walletConnected: false,
      onGrid: () => {},
      onSwipe: () => {},
      onChat: () => {},
      onWallet: () => {},
      onMap: () => {},
      t: (key) => dictionary[key] || appTranslations.en[key] || key,
    }));

    for (const key of ['grid', 'swipe', 'chat', 'wallet', 'map']) {
      assert.ok(markup.includes(dictionary[key]), `${language} navigation should show ${key}`);
      assert.ok(
        markup.includes(`aria-label="${dictionary[key]}"`),
        `${language} ${key} navigation button should have a localized accessible name`,
      );
    }
    assert.ok(!markup.includes('\uFFFD'), `${language} navigation should not render replacement characters`);
  }
});

test('grid cards localize online status, profile image text, interest badge, and self label', () => {
  for (const language of LANGUAGES) {
    const dictionary = appTranslations[language];
    const markup = renderToStaticMarkup(React.createElement(NearbyGridModule, {
      users: [{
        id: 'current-user',
        name: null,
        avatar: 'https://example.com/profile.jpg',
        last_seen: '2026-10-21T00:00:00.000Z',
        interest_received: true,
      }],
      currentUserId: 'current-user',
      isOnline: () => true,
      passesFilter: () => true,
      formatDistance: () => '1 km',
      onSelectProfile: () => {},
      t: (key) => dictionary[key] || appTranslations.en[key] || key,
      interestLabel: screenCopies.PROFILE_INTEREST_COPY[language].received,
    }));

    assert.ok(markup.includes(`alt="${dictionary.profileImage}"`), `${language} grid photo fallback should be localized`);
    assert.ok(
      markup.includes(`role="img" aria-label="${dictionary.online}"`),
      `${language} online indicator should be announced in the selected language`,
    );
    assert.ok(
      markup.includes(`aria-label="${screenCopies.PROFILE_INTEREST_COPY[language].received}"`),
      `${language} interest badge should have a localized accessible name`,
    );
    assert.ok(markup.includes(dictionary.you), `${language} should label the current user's card`);
    assert.ok(!markup.includes('\uFFFD'), `${language} grid should not render replacement characters`);
  }
});

test('Swipe renders visible Telegram-photo profiles and accessible pass/interest actions', () => {
  const language = 'en';
  const dictionary = {
    ...appTranslations[language],
    ...screenCopies.DAILY_SWIPE_COPY[language],
  };
  const markup = renderToStaticMarkup(React.createElement(DailySwipeModule, {
    users: [
      {
        id: 'candidate-photo',
        name: 'Uploaded Telegram photo',
        avatar: 'https://images.example/telegram-photo?file=primary',
        karma: 3,
        known_request_state_known: true,
        grid_visible: true,
        age: 34,
        hide_age: false,
        last_seen: '2026-11-20T10:00:00.000Z',
        height: '180 cm',
        weight: '75 kg',
        role_pref: 'Top',
        safety_pref: 'Safe',
        playstyle_pref: 'Party',
        how_many_pref: 'group',
        where_pref: 'Host',
      },
      {
        id: 'candidate-hidden',
        name: 'Hidden photo',
        avatar: 'https://images.example/hidden-photo',
        grid_visible: false,
      },
      {
        id: 'candidate-no-photo',
        name: 'No uploaded photo',
        avatar: '',
        grid_visible: true,
      },
      {
        id: 'candidate-http',
        name: 'Insecure photo',
        avatar: 'http://images.example/insecure-photo',
        grid_visible: true,
        known_request_state_known: true,
      },
      {
        id: 'candidate-known',
        name: 'Previously known profile',
        avatar: 'https://images.example/known.jpg',
        grid_visible: true,
        known_request_state_known: true,
        known_request_blocked: true,
      },
    ],
    accountId: 'viewer',
    onRightSwipe: async () => true,
    onKnown: async () => true,
    onSwipeDecision: () => {},
    onRefresh: () => {},
    formatDistance: () => '1 km',
    formatLastSeen: () => '2h ago',
    formatHowMany: (value) => value === 'group' ? 'Groups Only' : value || '',
    showPreferenceTags: true,
    t: (key) => dictionary[key] || appTranslations.en[key] || key,
  }));

  assert.ok(markup.includes('data-testid="daily-swipe-card-candidate-photo"'));
  assert.ok(markup.includes('Uploaded Telegram photo'));
  assert.ok(markup.includes('data-testid="daily-swipe-last-online"'));
  assert.ok(markup.includes('Last online'));
  assert.ok(markup.includes('2h ago'));
  assert.ok(markup.includes('180 cm'));
  assert.ok(markup.includes('75 kg'));
  assert.ok(markup.includes('Groups Only'));
  assert.ok(markup.includes('Karma: 3'));
  assert.ok(markup.includes('aria-label="Pass"'));
  assert.ok(markup.includes('aria-label="Interested"'));
  assert.ok(markup.includes('aria-label="Known"'));
  assert.ok(markup.includes('data-testid="daily-swipe-known"'));
  assert.ok(markup.includes('aria-label="Skip for later (tomorrow)"'));
  assert.ok(markup.includes('data-testid="daily-swipe-later"'));
  assert.ok(!markup.includes('Hidden photo'));
  assert.ok(!markup.includes('No uploaded photo'));
  assert.ok(!markup.includes('Insecure photo'));
  assert.ok(!markup.includes('Previously known profile'));
});

test('flying-message composer and payment status are localized for all languages', () => {
  for (const language of LANGUAGES) {
    const copy = screenCopies.flyingMessageCopy[language];
    const markup = renderToStaticMarkup(React.createElement(FlyingMessageModule, {
      messages: [],
      text: '',
      placeholder: copy.placeholder,
      priceLabel: copy.free,
      sendLabel: copy.send,
      status: copy.paymentProcessing,
      statusPersistent: true,
      dismissLabel: copy.dismiss,
      inputDisabled: false,
      sendDisabled: false,
      onTextChange: () => {},
      onSubmit: (event) => event.preventDefault(),
      onDismissStatus: () => {},
    }));

    for (const value of [
      copy.placeholder,
      copy.free,
      copy.send,
      copy.paymentProcessing,
      copy.dismiss,
    ]) {
      assert.ok(markup.includes(value), `${language} flying-message UI should render ${value}`);
    }
    assert.ok(markup.includes(`aria-label="${copy.placeholder}"`));
    assert.ok(markup.includes(`aria-label="${copy.send}"`));
    assert.ok(!markup.includes('\uFFFD'), `${language} flying-message UI should not render replacement characters`);
  }
});

test('map and profile-card image alternatives use localized copy', () => {
  assert.match(mapSource, /profileImageLabel:\s*string;/);
  assert.match(mapSource, /image\.alt\s*=\s*user\.name\s*\|\|\s*profileImageLabel;/);
  assert.match(appSource, /profileImageLabel=\{t\('profileImage'\)\}/);
  assert.match(appSource, /alt=\{activeProfile\.name\s*\|\|\s*t\('profileImage'\)\}/);
  assert.ok(!mapSource.includes('\uFFFD'));
  assert.ok(!appSource.includes('\uFFFD'), 'App.tsx should contain no replacement characters');
});
