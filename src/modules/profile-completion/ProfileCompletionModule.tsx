import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { focusFirstIncompleteProfileField } from './profile-completion-focus';
import {
  runProfilePreferenceCycleAnnouncement,
  type ProfilePreferenceCycleKey,
} from './profile-completion-announcements';
import {
  DEFAULT_PROFILE_SETUP_ORDER,
  type AppEntryConfig,
  type ProfileSetupSection,
} from '../../config/entries';

export interface ProfileCompletionValues {
  dob: string;
  gender: string;
  seeking: string;
  height: string;
  weight: string;
  rolePref: string;
  safetyPref: string;
  playstylePref: string;
  howManyPref: string;
  wherePref: string | null;
  nonManMode: string;
}

export type ProfileCompletionChangeHandlers = {
  [Key in keyof ProfileCompletionValues]: (
    value: ProfileCompletionValues[Key],
  ) => void;
};

type ProfileCompletionLanguage = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru';

export interface ProfileCompletionModuleProps {
  entry: AppEntryConfig;
  values: ProfileCompletionValues;
  isCompletionFlow: boolean;
  presentation?: 'modal' | 'embedded';
  previewOnly?: boolean;
  language?: ProfileCompletionLanguage;
  missingFields: {
    dob: boolean;
    gender: boolean;
    height: boolean;
    weight: boolean;
  };
  onChange: ProfileCompletionChangeHandlers;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  showCloseButton: boolean;
  errorMessage: string;
  heightOptions: readonly string[];
  weightOptions: readonly string[];
  t: (key: string) => string;
  onCycleRole: () => string;
  onCycleSafety: () => string;
  onCyclePlaystyle: () => string;
  onCycleHowMany: () => string;
  onCycleWhere: () => string | null;
}

const inputStyle = {
  padding: '6px 8px',
  backgroundColor: '#222',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: '4px',
  fontSize: '12px',
};

const completionStatusCopy: Record<ProfileCompletionLanguage, {
  heading: string;
  missingSummary: string;
  readySummary: string;
  previewReadySummary: string;
  missing: string;
  filled: string;
  saved: string;
  setByApp: string;
  identityLocked: string;
  labels: {
    dob: string;
    gender: string;
    height: string;
    weight: string;
    where: string;
  };
}> = {
  en: {
    heading: 'Required details',
    missingSummary: 'Still needed: {fields}',
    readySummary: 'Required details are filled. Save to continue.',
    previewReadySummary: 'Required details are filled in this preview.',
    missing: 'Missing',
    filled: 'Filled',
    saved: 'Saved · locked',
    setByApp: 'Set by this app',
    identityLocked: 'Gender and who you are looking for are set by this app and cannot be changed here.',
    labels: { dob: 'Date of birth', gender: 'Gender', height: 'Height', weight: 'Weight', where: 'Where' },
  },
  'zh-CN': {
    heading: '必填资料',
    missingSummary: '尚缺少：{fields}',
    readySummary: '必填资料已填写，请保存以继续。',
    previewReadySummary: '此预览中的必填资料已填写。',
    missing: '未填写',
    filled: '已填写',
    saved: '已保存（已锁定）',
    setByApp: '由此应用设置',
    identityLocked: '性别和寻找对象由此应用设置，无法在此更改。',
    labels: { dob: '出生日期', gender: '性别', height: '身高', weight: '体重', where: '地点' },
  },
  'zh-TW': {
    heading: '必填資料',
    missingSummary: '尚缺少：{fields}',
    readySummary: '必填資料已填寫，請儲存以繼續。',
    previewReadySummary: '此預覽中的必填資料已填寫。',
    missing: '未填寫',
    filled: '已填寫',
    saved: '已儲存（已鎖定）',
    setByApp: '由此應用設定',
    identityLocked: '性別和尋找對象由此應用設定，無法在此更改。',
    labels: { dob: '出生日期', gender: '性別', height: '身高', weight: '體重', where: '地點' },
  },
  ja: {
    heading: '必須プロフィール項目',
    missingSummary: '未入力：{fields}',
    readySummary: '必須項目が入力されています。保存して続行してください。',
    previewReadySummary: 'このプレビューの必須項目が入力されています。',
    missing: '未入力',
    filled: '入力済み',
    saved: '保存済み・変更不可',
    setByApp: 'アプリで設定',
    identityLocked: '性別と希望する相手はこのアプリで設定されており、ここでは変更できません。',
    labels: { dob: '生年月日', gender: '性別', height: '身長', weight: '体重', where: '場所' },
  },
  ko: {
    heading: '필수 프로필 정보',
    missingSummary: '남은 항목: {fields}',
    readySummary: '필수 정보가 입력되었습니다. 저장하고 계속하세요.',
    previewReadySummary: '미리보기의 필수 정보가 입력되었습니다.',
    missing: '미입력',
    filled: '입력 완료',
    saved: '저장됨 · 변경 불가',
    setByApp: '앱에서 설정됨',
    identityLocked: '성별과 찾는 대상은 이 앱에서 설정되어 여기서 변경할 수 없습니다.',
    labels: { dob: '생년월일', gender: '성별', height: '키', weight: '몸무게', where: '장소' },
  },
  ru: {
    heading: 'Обязательные данные',
    missingSummary: 'Осталось заполнить: {fields}',
    readySummary: 'Обязательные данные заполнены. Сохраните, чтобы продолжить.',
    previewReadySummary: 'Обязательные данные в предпросмотре заполнены.',
    missing: 'Не заполнено',
    filled: 'Заполнено',
    saved: 'Сохранено · заблокировано',
    setByApp: 'Задано приложением',
    identityLocked: 'Пол и предпочтение поиска заданы приложением и здесь не изменяются.',
    labels: { dob: 'Дата рождения', gender: 'Пол', height: 'Рост', weight: 'Вес', where: 'Место' },
  },
};

export default function ProfileCompletionModule({
  entry,
  values,
  isCompletionFlow,
  presentation = 'modal',
  previewOnly = false,
  language = 'en',
  missingFields,
  onChange,
  onSubmit,
  onClose,
  showCloseButton,
  errorMessage,
  heightOptions,
  weightOptions,
  t,
  onCycleRole,
  onCycleSafety,
  onCyclePlaystyle,
  onCycleHowMany,
  onCycleWhere,
}: ProfileCompletionModuleProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [submitAttempt, setSubmitAttempt] = useState(0);
  const [preferenceAnnouncement, setPreferenceAnnouncement] = useState('');
  const isManSeekingMan = values.gender === 'man' && values.seeking === 'men';
  const statusCopy = completionStatusCopy[language];
  const announcePreferenceCycle = (
    preference: ProfilePreferenceCycleKey,
    cycle: () => string | null,
  ) => {
    setPreferenceAnnouncement(
      runProfilePreferenceCycleAnnouncement(preference, cycle, t, statusCopy.labels.where),
    );
  };
  useEffect(() => {
    if (errorMessage && isCompletionFlow) {
      focusFirstIncompleteProfileField(formRef.current);
    }
  }, [errorMessage, isCompletionFlow, submitAttempt]);
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (previewOnly) {
      event.preventDefault();
      return;
    }
    setSubmitAttempt((attempt) => attempt + 1);
    onSubmit(event);
  };
  const canEditMissingField = (field: keyof typeof missingFields) =>
    !isCompletionFlow || missingFields[field];
  const incompleteFieldMarker = (
    field: keyof typeof missingFields,
    value: string,
    locked = false,
  ) => (
    isCompletionFlow && missingFields[field] && !value.trim() && !locked
      ? 'true'
      : undefined
  );
  const requiredFields = [
    { key: 'dob', label: statusCopy.labels.dob, value: values.dob },
    { key: 'gender', label: statusCopy.labels.gender, value: values.gender },
    { key: 'height', label: statusCopy.labels.height, value: values.height },
    { key: 'weight', label: statusCopy.labels.weight, value: values.weight },
  ];
  const missingRequiredFields = requiredFields.filter(({ value }) => !value.trim());
  const fieldStatus = (
    field: keyof typeof missingFields,
    value: string,
    setByApp = false,
    saved = false,
  ) => {
    const state = setByApp && value.trim()
      ? 'entry-default'
      : !value.trim()
        ? 'missing'
        : saved
          ? 'saved'
          : 'filled';
    const label = state === 'entry-default'
      ? statusCopy.setByApp
      : state === 'filled'
        ? statusCopy.filled
        : state === 'saved'
          ? statusCopy.saved
          : statusCopy.missing;
    const color = state === 'missing' ? '#fecaca' : state === 'filled' ? '#bbf7d0' : '#bfdbfe';
    const backgroundColor = state === 'missing'
      ? 'rgba(220, 38, 38, 0.16)'
      : state === 'filled'
        ? 'rgba(22, 163, 74, 0.16)'
        : 'rgba(37, 99, 235, 0.18)';

    return (
      <span
        key={field}
        id={`profile-field-status-${field}`}
        data-testid={`profile-field-status-${field}`}
        data-state={state}
        style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '2px 7px', color, backgroundColor, fontSize: '10px', lineHeight: 1.3, fontWeight: 700, whiteSpace: 'nowrap' }}
      >
        {label}
      </span>
    );
  };
  const sectionOrder = [
    ...new Set([
      ...entry.profileSetup.sectionOrder,
      ...DEFAULT_PROFILE_SETUP_ORDER,
    ]),
  ];

  const renderSection = (section: ProfileSetupSection): ReactNode => {
    switch (section) {
      case 'birthdate':
        return (
          <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <label htmlFor="profile-completion-dob" style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('dob')}</label>
              {isCompletionFlow && fieldStatus('dob', values.dob, false, !missingFields.dob)}
            </div>
            <input
              id="profile-completion-dob"
              type="date"
              value={values.dob}
              onChange={(event) => onChange.dob(event.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }}
              disabled={!canEditMissingField('dob')}
              aria-describedby={isCompletionFlow ? 'profile-field-status-dob' : undefined}
              data-profile-incomplete-editable={incompleteFieldMarker('dob', values.dob)}
              required
            />
          </div>
        );
      case 'identity':
        return (
          <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', width: '100%' }}>
              <label htmlFor="profile-completion-gender" style={{ whiteSpace: 'nowrap' }}>{t('imA')}</label>
              {isCompletionFlow && fieldStatus(
                'gender',
                values.gender,
                entry.profileSetup.lockIdentity && missingFields.gender,
                !missingFields.gender,
              )}
              <select
                id="profile-completion-gender"
                value={values.gender}
                onChange={(event) => onChange.gender(event.target.value)}
                disabled={entry.profileSetup.lockIdentity || !canEditMissingField('gender')}
                style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '6px 4px' }}
                aria-describedby={[
                  isCompletionFlow ? 'profile-field-status-gender' : null,
                  entry.profileSetup.lockIdentity ? 'profile-identity-locked-help' : null,
                ].filter(Boolean).join(' ') || undefined}
                data-profile-incomplete-editable={incompleteFieldMarker(
                  'gender',
                  values.gender,
                  entry.profileSetup.lockIdentity,
                )}
                required
              >
                <option value="man">{t('man')}</option>
                <option value="woman">{t('woman')}</option>
                <option value="non-binary">{t('nonBinary')}</option>
              </select>
              <label htmlFor="profile-completion-seeking" style={{ whiteSpace: 'nowrap' }}>{t('seeking')}</label>
              <select
                id="profile-completion-seeking"
                value={values.seeking}
                onChange={(event) => onChange.seeking(event.target.value)}
                disabled={entry.profileSetup.lockIdentity}
                style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '6px 4px' }}
                aria-describedby={entry.profileSetup.lockIdentity ? 'profile-identity-locked-help' : undefined}
                data-profile-incomplete-editable={
                  isCompletionFlow && !entry.profileSetup.lockIdentity && !values.seeking.trim()
                    ? 'true'
                    : undefined
                }
                required
              >
                <option value="men">{t('men')}</option>
                <option value="women">{t('women')}</option>
                <option value="everyone">{t('everyone')}</option>
              </select>
            </div>
            {entry.profileSetup.lockIdentity && (
              <div
                id="profile-identity-locked-help"
                data-testid="profile-identity-locked"
                role="note"
                style={{ color: '#bfdbfe', fontSize: '10px', lineHeight: 1.35 }}
              >
                {statusCopy.identityLocked}
              </div>
            )}
          </div>
        );
      case 'measurements':
        return (
          <div key={section} style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <label htmlFor="profile-completion-height" style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('height')}</label>
                {isCompletionFlow && fieldStatus('height', values.height, false, !missingFields.height)}
              </div>
              <select
                id="profile-completion-height"
                value={values.height}
                onChange={(event) => onChange.height(event.target.value)}
                style={{ ...inputStyle, padding: '6px' }}
                disabled={!canEditMissingField('height')}
                aria-describedby={isCompletionFlow ? 'profile-field-status-height' : undefined}
                data-profile-incomplete-editable={incompleteFieldMarker('height', values.height)}
                required
              >
                <option value="" disabled>{t('selectHeight')}</option>
                {heightOptions.map((height) => <option key={height} value={height}>{height}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <label htmlFor="profile-completion-weight" style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('weight')}</label>
                {isCompletionFlow && fieldStatus('weight', values.weight, false, !missingFields.weight)}
              </div>
              <select
                id="profile-completion-weight"
                value={values.weight}
                onChange={(event) => onChange.weight(event.target.value)}
                style={{ ...inputStyle, padding: '6px' }}
                disabled={!canEditMissingField('weight')}
                aria-describedby={isCompletionFlow ? 'profile-field-status-weight' : undefined}
                data-profile-incomplete-editable={incompleteFieldMarker('weight', values.weight)}
                required
              >
                <option value="" disabled>{t('selectWeight')}</option>
                {weightOptions.map((weight) => <option key={weight} value={weight}>{weight}</option>)}
              </select>
            </div>
          </div>
        );
      case 'preferences':
        if (!isManSeekingMan) return null;
        return (
          <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div id="profile-preference-cycle-hint" style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic', textAlign: 'center' }}>
              {t('tapToChange')}
            </div>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => announcePreferenceCycle('role', onCycleRole)}
                aria-label={`${t('rolePreference')}: ${t(values.rolePref)}`}
                aria-describedby="profile-preference-cycle-hint"
                data-profile-incomplete-editable={isCompletionFlow && !values.rolePref.trim() ? 'true' : undefined}
                style={{ flex: 1, padding: '10px 2px', backgroundColor: '#e11d48', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
              >
                {t(values.rolePref)}
              </button>
              <button
                type="button"
                onClick={() => announcePreferenceCycle('safety', onCycleSafety)}
                aria-label={`${t('safetyPreference')}: ${t(values.safetyPref)}`}
                aria-describedby="profile-preference-cycle-hint"
                data-profile-incomplete-editable={isCompletionFlow && !values.safetyPref.trim() ? 'true' : undefined}
                style={{ flex: 1, padding: '10px 2px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
              >
                {t(values.safetyPref)}
              </button>
              <button
                type="button"
                onClick={() => announcePreferenceCycle('playstyle', onCyclePlaystyle)}
                aria-label={`${t('playstylePreference')}: ${t(values.playstylePref)}`}
                aria-describedby="profile-preference-cycle-hint"
                data-profile-incomplete-editable={isCompletionFlow && !values.playstylePref.trim() ? 'true' : undefined}
                style={{ flex: 1, padding: '10px 2px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
              >
                {t(values.playstylePref)}
              </button>
              <button
                type="button"
                onClick={() => announcePreferenceCycle('howMany', onCycleHowMany)}
                aria-label={`${t('groupSize')}: ${t(`${values.howManyPref}_setup`)}`}
                aria-describedby="profile-preference-cycle-hint"
                data-profile-incomplete-editable={isCompletionFlow && !values.howManyPref.trim() ? 'true' : undefined}
                style={{ flex: 1, padding: '10px 2px', backgroundColor: '#9333ea', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
              >
                {t(`${values.howManyPref}_setup`)}
              </button>
              <button
                type="button"
                onClick={() => announcePreferenceCycle('where', onCycleWhere)}
                aria-label={`${statusCopy.labels.where}: ${values.wherePref === null ? t('Anywhere') : t(values.wherePref)}`}
                aria-describedby="profile-preference-cycle-hint"
                data-profile-incomplete-editable={isCompletionFlow && values.wherePref === undefined ? 'true' : undefined}
                style={{ flex: 1, padding: '10px 2px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
              >
                {values.wherePref === null ? t('Anywhere') : t(values.wherePref)}
              </button>
            </div>
          </div>
        );
      case 'mode':
        if (isManSeekingMan) return null;
        return (
          <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label htmlFor="profile-completion-mode" style={{ fontSize: '11px', fontWeight: 'bold', color: '#38bdf8' }}>{t('mode')}</label>
            <select
              id="profile-completion-mode"
              value={values.nonManMode}
              onChange={(event) => onChange.nonManMode(event.target.value)}
              style={{ ...inputStyle, padding: '6px', fontSize: '10px' }}
              data-profile-incomplete-editable={isCompletionFlow && !values.nonManMode.trim() ? 'true' : undefined}
              required
            >
              <option value="Browsing only - You cannot send not receive private message from others">{t('browsingOnly')}</option>
              <option value="Online only - You are visible on grid but not on map, map is inaccessible">{t('onlineOnly')}</option>
              <option value="Meet up - You are visible on grid and map">{t('meetUp')}</option>
            </select>
          </div>
        );
    }
  };

  return (
    <div style={presentation === 'modal'
      ? { position: 'fixed', inset: 0, backgroundColor: '#121212', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '12px', boxSizing: 'border-box' }
      : { width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '12px', padding: '16px', width: '100%', maxWidth: presentation === 'modal' ? '420px' : 'none', boxSizing: 'border-box', border: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: 'transparent', border: 'none', color: '#aaa', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        )}
        <h2 style={{ fontSize: '18px', margin: 0, color: '#007bff', textAlign: 'center' }}>{t(entry.profileSetup.titleKey)}</h2>
        <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#ff4d4d', textAlign: 'center', margin: 0, lineHeight: '1.4' }}>{t(entry.profileSetup.warningKey)}</p>
        {isCompletionFlow && (
          <div
            data-testid="profile-completion-status"
            role="status"
            aria-live="polite"
            style={{ border: '1px solid #3b82f6', backgroundColor: 'rgba(37, 99, 235, 0.12)', borderRadius: '6px', padding: '8px 10px', color: '#dbeafe', fontSize: '12px', lineHeight: 1.4 }}
          >
            <strong>{statusCopy.heading}: </strong>
            {missingRequiredFields.length > 0
              ? statusCopy.missingSummary.replace(
                '{fields}',
                missingRequiredFields.map(({ label }) => label).join(', '),
              )
              : previewOnly ? statusCopy.previewReadySummary : statusCopy.readySummary}
          </div>
        )}
        {errorMessage && (
          <div
            data-testid="profile-completion-error"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            style={{ backgroundColor: 'rgba(255, 77, 77, 0.25)', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '6px', borderRadius: '4px', fontSize: '11px', textAlign: 'center' }}
          >
            {errorMessage}
          </div>
        )}
        <form
          ref={formRef}
          onSubmit={handleFormSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
        >
          {sectionOrder.map((section) => (
            <div key={section}>
              {(section === 'preferences' || section === 'mode') && (
                <div style={{ width: '100%', borderTop: '1px solid #444', margin: '4px 0 8px' }} />
              )}
              {renderSection(section)}
            </div>
          ))}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="profile-preference-cycle-announcement"
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {preferenceAnnouncement}
          </div>
          {!previewOnly && (
            <button type="submit" style={{ marginTop: '4px', padding: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>
              {t('saveProfile')}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
