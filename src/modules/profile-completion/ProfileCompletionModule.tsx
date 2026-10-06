import type { FormEvent, ReactNode } from 'react';
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

export interface ProfileCompletionModuleProps {
  entry: AppEntryConfig;
  values: ProfileCompletionValues;
  onChange: ProfileCompletionChangeHandlers;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  showCloseButton: boolean;
  errorMessage: string;
  heightOptions: readonly string[];
  weightOptions: readonly string[];
  t: (key: string) => string;
  onCycleRole: () => void;
  onCycleSafety: () => void;
  onCyclePlaystyle: () => void;
  onCycleHowMany: () => void;
  onCycleWhere: () => void;
}

const inputStyle = {
  padding: '6px 8px',
  backgroundColor: '#222',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: '4px',
  fontSize: '12px',
};

export default function ProfileCompletionModule({
  entry,
  values,
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
  const isManSeekingMan = values.gender === 'man' && values.seeking === 'men';
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
            <label style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('dob')}</label>
            <input
              type="date"
              value={values.dob}
              onChange={(event) => onChange.dob(event.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }}
              required
            />
          </div>
        );
      case 'identity':
        return (
          <div key={section} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', width: '100%' }}>
            <span style={{ whiteSpace: 'nowrap' }}>{t('imA')}</span>
            <select
              value={values.gender}
              onChange={(event) => onChange.gender(event.target.value)}
              disabled={entry.profileSetup.lockIdentity}
              style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '6px 4px' }}
            >
              <option value="man">{t('man')}</option>
              <option value="woman">{t('woman')}</option>
              <option value="non-binary">{t('nonBinary')}</option>
            </select>
            <span style={{ whiteSpace: 'nowrap' }}>{t('seeking')}</span>
            <select
              value={values.seeking}
              onChange={(event) => onChange.seeking(event.target.value)}
              disabled={entry.profileSetup.lockIdentity}
              style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '6px 4px' }}
            >
              <option value="men">{t('men')}</option>
              <option value="women">{t('women')}</option>
              <option value="everyone">{t('everyone')}</option>
            </select>
          </div>
        );
      case 'measurements':
        return (
          <div key={section} style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('height')}</label>
              <select
                value={values.height}
                onChange={(event) => onChange.height(event.target.value)}
                style={{ ...inputStyle, padding: '6px' }}
                required
              >
                <option value="" disabled>{t('selectHeight')}</option>
                {heightOptions.map((height) => <option key={height} value={height}>{height}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('weight')}</label>
              <select
                value={values.weight}
                onChange={(event) => onChange.weight(event.target.value)}
                style={{ ...inputStyle, padding: '6px' }}
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
            <div style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic', textAlign: 'center' }}>
              {t('tapToChange')}
            </div>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
              <button type="button" onClick={onCycleRole} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#e11d48', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>{t(values.rolePref)}</button>
              <button type="button" onClick={onCycleSafety} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>{t(values.safetyPref)}</button>
              <button type="button" onClick={onCyclePlaystyle} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>{t(values.playstylePref)}</button>
              <button type="button" onClick={onCycleHowMany} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#9333ea', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>{t(`${values.howManyPref}_setup`)}</button>
              <button type="button" onClick={onCycleWhere} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>{values.wherePref === null ? t('Anywhere') : t(values.wherePref)}</button>
            </div>
          </div>
        );
      case 'mode':
        if (isManSeekingMan) return null;
        return (
          <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#38bdf8' }}>{t('mode')}</label>
            <select
              value={values.nonManMode}
              onChange={(event) => onChange.nonManMode(event.target.value)}
              style={{ ...inputStyle, padding: '6px', fontSize: '10px' }}
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
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#121212', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '12px', boxSizing: 'border-box' }}>
      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '12px', padding: '16px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', border: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
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
        {errorMessage && (
          <div style={{ backgroundColor: 'rgba(255, 77, 77, 0.25)', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '6px', borderRadius: '4px', fontSize: '11px', textAlign: 'center' }}>
            {errorMessage}
          </div>
        )}
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {sectionOrder.map((section) => (
            <div key={section}>
              {(section === 'preferences' || section === 'mode') && (
                <div style={{ width: '100%', borderTop: '1px solid #444', margin: '4px 0 8px' }} />
              )}
              {renderSection(section)}
            </div>
          ))}
          <button type="submit" style={{ marginTop: '4px', padding: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>
            {t('saveProfile')}
          </button>
        </form>
      </div>
    </div>
  );
}
