import { useState } from 'react';
import ProfileCompletionModule, {
  type ProfileCompletionValues,
} from './ProfileCompletionModule';
import type { AppEntryConfig } from '../../config/entries';
import {
  buildProfileHeightOptions,
  buildProfileWeightOptions,
  PROFILE_HOW_MANY_CYCLE_OPTIONS,
  PROFILE_PLAYSTYLE_CYCLE_OPTIONS,
  PROFILE_ROLE_CYCLE_OPTIONS,
  PROFILE_SAFETY_CYCLE_OPTIONS,
  PROFILE_WHERE_CYCLE_OPTIONS,
} from './profile-completion-options.js';

type PreviewLanguage = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru';

export interface ProfileSetupPreviewModuleProps {
  entries: readonly AppEntryConfig[];
  language: PreviewLanguage;
  onClose: () => void;
  t: (key: string) => string;
}

const copy: Record<PreviewLanguage, {
  eyebrow: string;
  title: string;
  intro: string;
  selected: string;
  identity: string;
  locked: string;
  editable: string;
  lockedDetail: string;
  editableDetail: string;
  localNotice: string;
  unavailable: string;
}> = {
  en: {
    eyebrow: 'OWNER CONFIGURATION CHECK',
    title: 'Profile setup preview',
    intro: 'Compare the completion form each entry presents. Nothing here is a real profile.',
    selected: 'Previewing',
    identity: 'Identity behavior',
    locked: 'Set by app',
    editable: 'Editable',
    lockedDetail: 'Gender and seeking are configured by this entry and locked.',
    editableDetail: 'Gender and seeking start with the configured defaults and remain editable.',
    localNotice: 'Required details start blank. Changes stay in this preview only; nothing is saved or submitted.',
    unavailable: 'No configured entries are available to preview.',
  },
  'zh-CN': {
    eyebrow: '所有者配置检查',
    title: '资料设置预览',
    intro: '比较每个入口展示的资料完善表单。这里不使用真实用户资料。',
    selected: '正在预览',
    identity: '身份设置方式',
    locked: '应用设置',
    editable: '可编辑',
    lockedDetail: '性别和寻找对象由此入口配置并锁定。',
    editableDetail: '性别和寻找对象使用入口默认值，并且可以编辑。',
    localNotice: '必填资料初始为空。更改仅保留在此预览中，不会保存或提交。',
    unavailable: '没有可预览的已配置入口。',
  },
  'zh-TW': {
    eyebrow: '擁有者設定檢查',
    title: '資料設定預覽',
    intro: '比較每個入口顯示的資料填寫表單。這裡不會使用真實使用者資料。',
    selected: '正在預覽',
    identity: '身分設定方式',
    locked: '由應用程式設定',
    editable: '可編輯',
    lockedDetail: '性別和尋找對象由此入口設定並鎖定。',
    editableDetail: '性別和尋找對象使用入口預設值，並且可以編輯。',
    localNotice: '必填資料初始為空。變更僅保留在此預覽中，不會儲存或提交。',
    unavailable: '沒有可預覽的已設定入口。',
  },
  ja: {
    eyebrow: 'オーナー設定の確認',
    title: 'プロフィール設定プレビュー',
    intro: '各エントリーのプロフィール入力フォームを比較できます。実際のプロフィールは使用しません。',
    selected: 'プレビュー中',
    identity: '本人情報の設定',
    locked: 'アプリで設定',
    editable: '編集可能',
    lockedDetail: '性別と希望する相手はこのエントリーで設定され、変更できません。',
    editableDetail: '性別と希望する相手にはエントリーの初期値が入り、編集できます。',
    localNotice: '必須項目は空の状態で始まります。変更はこのプレビュー内だけで、保存・送信されません。',
    unavailable: 'プレビューできる設定済みエントリーがありません。',
  },
  ko: {
    eyebrow: '소유자 설정 확인',
    title: '프로필 설정 미리보기',
    intro: '각 항목에서 표시되는 프로필 작성 양식을 비교합니다. 실제 프로필은 사용하지 않습니다.',
    selected: '미리보기',
    identity: '신원 설정 방식',
    locked: '앱에서 설정',
    editable: '수정 가능',
    lockedDetail: '성별과 찾는 대상은 이 항목에서 설정되며 잠겨 있습니다.',
    editableDetail: '성별과 찾는 대상은 항목의 기본값으로 시작하며 수정할 수 있습니다.',
    localNotice: '필수 정보는 빈 상태로 시작합니다. 변경 사항은 미리보기에만 남으며 저장되거나 제출되지 않습니다.',
    unavailable: '미리볼 수 있는 설정 항목이 없습니다.',
  },
  ru: {
    eyebrow: 'ПРОВЕРКА НАСТРОЕК ВЛАДЕЛЬЦЕМ',
    title: 'Предпросмотр настройки профиля',
    intro: 'Сравните форму заполнения профиля для каждой записи. Реальный профиль не используется.',
    selected: 'Предпросмотр',
    identity: 'Настройка идентичности',
    locked: 'Задано приложением',
    editable: 'Можно изменить',
    lockedDetail: 'Пол и предпочтение поиска заданы этой записью и заблокированы.',
    editableDetail: 'Пол и предпочтение поиска начинаются со значений записи и доступны для изменения.',
    localNotice: 'Обязательные данные изначально пусты. Изменения остаются только в предпросмотре и не сохраняются.',
    unavailable: 'Нет настроенных записей для предпросмотра.',
  },
};

function createPreviewValues(entry: AppEntryConfig): ProfileCompletionValues {
  return {
    dob: '',
    gender: entry.profileSetup.defaultGender,
    seeking: entry.profileSetup.defaultSeeking,
    height: '',
    weight: '',
    rolePref: 'Versatile',
    safetyPref: 'Safe',
    playstylePref: 'Clean',
    howManyPref: '1on1',
    wherePref: null,
    nonManMode: 'Meet up - You are visible on grid and map',
  };
}

function createEmptyPreviewValues(): ProfileCompletionValues {
  return {
    dob: '',
    gender: '',
    seeking: '',
    height: '',
    weight: '',
    rolePref: 'Versatile',
    safetyPref: 'Safe',
    playstylePref: 'Clean',
    howManyPref: '1on1',
    wherePref: null,
    nonManMode: 'Meet up - You are visible on grid and map',
  };
}

const requiredFieldsMissing = {
  dob: true,
  gender: true,
  height: true,
  weight: true,
};

const noop = () => {};

export default function ProfileSetupPreviewModule({
  entries,
  language,
  onClose,
  t,
}: ProfileSetupPreviewModuleProps) {
  const [activeEntryId, setActiveEntryId] = useState(entries[0]?.id ?? '');
  const activeEntry = entries.find((entry) => entry.id === activeEntryId) ?? entries[0];
  const [values, setValues] = useState<ProfileCompletionValues>(() =>
    activeEntry ? createPreviewValues(activeEntry) : createEmptyPreviewValues(),
  );
  const localized = copy[language];

  const update = <Key extends keyof ProfileCompletionValues>(
    key: Key,
    value: ProfileCompletionValues[Key],
  ) => setValues((current) => ({ ...current, [key]: value }));
  const cycle = <Key extends 'rolePref' | 'safetyPref' | 'playstylePref' | 'howManyPref'>(
    key: Key,
    options: readonly ProfileCompletionValues[Key][],
  ): ProfileCompletionValues[Key] => {
    const currentIndex = options.indexOf(values[key]);
    const nextValue = options[(currentIndex + 1) % options.length]!;
    update(key, nextValue);
    return nextValue;
  };
  const cycleWhere = (): string | null => {
    const currentIndex = PROFILE_WHERE_CYCLE_OPTIONS.indexOf(values.wherePref);
    const nextValue =
      PROFILE_WHERE_CYCLE_OPTIONS[(currentIndex + 1) % PROFILE_WHERE_CYCLE_OPTIONS.length]!;
    update('wherePref', nextValue);
    return nextValue;
  };
  const heightOptions = buildProfileHeightOptions('');
  const weightOptions = buildProfileWeightOptions();

  return (
    <section
      aria-labelledby="profile-setup-preview-title"
      style={{
        width: '100%',
        maxWidth: '1080px',
        margin: '0 auto',
        padding: 'clamp(12px, 3vw, 28px)',
        boxSizing: 'border-box',
        color: '#f0eee9',
        backgroundColor: '#17191a',
        border: '1px solid #363b3d',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#9bb9b1', fontSize: '10px', fontWeight: 800, letterSpacing: '0.16em' }}>
            {localized.eyebrow}
          </div>
          <h2 id="profile-setup-preview-title" style={{ margin: '5px 0 4px', fontSize: 'clamp(20px, 3vw, 27px)', lineHeight: 1.12, color: '#f2f0ea' }}>
            {localized.title}
          </h2>
          <p style={{ margin: 0, color: '#aeb6b5', fontSize: '13px', lineHeight: 1.5 }}>
            {localized.intro}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          data-testid="button-close-profile-setup-preview"
          style={{
            flex: '0 0 auto',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: '1px solid #495253',
            color: '#d9e1de',
            backgroundColor: '#222728',
            cursor: 'pointer',
            fontSize: '18px',
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {entries.length === 0 || !activeEntry ? (
        <div role="status" style={{ padding: '20px', border: '1px dashed #525b5b', borderRadius: '10px', color: '#c0c8c5' }}>
          {localized.unavailable}
        </div>
      ) : (
        <>
          <div role="group" aria-label={localized.title} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {entries.map((entry) => {
              const selected = entry.id === activeEntry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setActiveEntryId(entry.id);
                    setValues(createPreviewValues(entry));
                  }}
                  aria-pressed={selected}
                  data-testid={`button-preview-entry-${entry.id}`}
                  style={{
                    border: selected ? '1px solid #8fc4b2' : '1px solid #41494a',
                    backgroundColor: selected ? '#2b423c' : '#202425',
                    color: selected ? '#e5f3ed' : '#b9c2c0',
                    borderRadius: '999px',
                    padding: '8px 13px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: selected ? 750 : 600,
                  }}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>

          <div
            data-testid="preview-entry-identity-behavior"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px 18px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #3d4847',
              backgroundColor: '#202625',
            }}
          >
            <div style={{ minWidth: 0, flex: '1 1 340px' }}>
              <div style={{ color: '#9bb9b1', fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {localized.selected}: {activeEntry.label}
              </div>
              <div style={{ marginTop: '5px', color: '#e0e7e3', fontSize: '12px', lineHeight: 1.5 }}>
                {activeEntry.profileSetup.lockIdentity ? localized.lockedDetail : localized.editableDetail}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
              <span style={{ color: '#aeb6b5', fontSize: '11px' }}>{localized.identity}</span>
              <span style={{
                padding: '5px 9px',
                borderRadius: '999px',
                color: activeEntry.profileSetup.lockIdentity ? '#f0d8a5' : '#b9e4ce',
                backgroundColor: activeEntry.profileSetup.lockIdentity ? '#493d28' : '#294338',
                fontSize: '11px',
                fontWeight: 750,
                whiteSpace: 'nowrap',
              }}>
                {activeEntry.profileSetup.lockIdentity ? localized.locked : localized.editable}
              </span>
            </div>
          </div>

          <div
            role="note"
            data-testid="text-preview-safety-notice"
            style={{ color: '#d2c6a8', backgroundColor: '#302d25', border: '1px solid #514a38', borderRadius: '9px', padding: '10px 12px', fontSize: '12px', lineHeight: 1.5 }}
          >
            {localized.localNotice}
          </div>

          <ProfileCompletionModule
            key={activeEntry.id}
            entry={activeEntry}
            values={values}
            isCompletionFlow
            presentation="embedded"
            previewOnly
            language={language}
            missingFields={requiredFieldsMissing}
            onChange={{
              dob: (value) => update('dob', value),
              gender: (value) => update('gender', value),
              seeking: (value) => update('seeking', value),
              height: (value) => update('height', value),
              weight: (value) => update('weight', value),
              rolePref: (value) => update('rolePref', value),
              safetyPref: (value) => update('safetyPref', value),
              playstylePref: (value) => update('playstylePref', value),
              howManyPref: (value) => update('howManyPref', value),
              wherePref: (value) => update('wherePref', value),
              nonManMode: (value) => update('nonManMode', value),
            }}
            onSubmit={(event) => event.preventDefault()}
            onClose={noop}
            showCloseButton={false}
            errorMessage=""
            heightOptions={heightOptions}
            weightOptions={weightOptions}
            t={t}
            onCycleRole={() => cycle('rolePref', PROFILE_ROLE_CYCLE_OPTIONS)}
            onCycleSafety={() => cycle('safetyPref', PROFILE_SAFETY_CYCLE_OPTIONS)}
            onCyclePlaystyle={() => cycle('playstylePref', PROFILE_PLAYSTYLE_CYCLE_OPTIONS)}
            onCycleHowMany={() => cycle('howManyPref', PROFILE_HOW_MANY_CYCLE_OPTIONS)}
            onCycleWhere={cycleWhere}
          />
        </>
      )}
    </section>
  );
}
