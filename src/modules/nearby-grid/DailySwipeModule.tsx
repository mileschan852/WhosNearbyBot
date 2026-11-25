import { useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../../App';
import {
  getDailySwipeDateKey,
  loadDailySwipeProgress,
  saveDailySwipeProgress,
  type DailySwipeProgress,
} from '../../utils/daily-swipe-session.js';
import { hasUploadedMainProfileImage } from '../../utils/profile-image.js';

interface DailySwipeModuleProps {
  users: UserProfile[];
  accountId: string | null;
  onRightSwipe: (user: UserProfile) => Promise<boolean>;
  onKnown: (user: UserProfile) => Promise<boolean>;
  onSwipeDecision: (user: UserProfile, direction: 'left' | 'right') => void;
  onRefresh: () => void;
  formatDistance: (distance?: number) => string;
  formatLastSeen: (lastSeen?: string | null) => string;
  formatHowMany: (value?: string | null) => string;
  showPreferenceTags: boolean;
  t: (key: string) => string;
}

const getProgress = (accountId: string | null, dateKey: string): DailySwipeProgress =>
  loadDailySwipeProgress(getStorage(), accountId, dateKey);

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export default function DailySwipeModule({
  users,
  accountId,
  onRightSwipe,
  onKnown,
  onSwipeDecision,
  onRefresh,
  formatDistance,
  formatLastSeen,
  formatHowMany,
  showPreferenceTags,
  t,
}: DailySwipeModuleProps) {
  const [session, setSession] = useState(() => {
    const dateKey = getDailySwipeDateKey();
    return { dateKey, progress: getProgress(accountId, dateKey) };
  });
  const { dateKey, progress } = session;
  const [actionPending, setActionPending] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [failedAction, setFailedAction] = useState<'interest' | 'known' | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDateKey = getDailySwipeDateKey();
      setSession((previous) => {
        if (previous.dateKey === nextDateKey) return previous;
        return {
          dateKey: nextDateKey,
          progress: getProgress(accountId, nextDateKey),
        };
      });
      setStorageError(false);
      setSendError(false);
      setFailedAction(null);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [accountId]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const candidates = useMemo(
    () => users
      .filter((user) =>
        user.id !== accountId &&
        user.grid_visible !== false &&
        user.known_review_state_known === true &&
        user.known_reviewed !== true &&
        hasUploadedMainProfileImage(user.avatar),
      )
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id)),
    [users, accountId],
  );
  const seenIds = new Set(progress.seenIds);
  const remainingUsers = candidates.filter((user) => !seenIds.has(user.id));
  const seenCandidateCount = candidates.length - remainingUsers.length;
  const activeUser = progress.completed ? undefined : remainingUsers[0];
  const complete = progress.completed ||
    (candidates.length > 0 && remainingUsers.length === 0);

  const advance = async (direction: 'left' | 'right' | 'later' | 'known') => {
    if (!activeUser || actionPending || storageError) return;
    setActionPending(true);
    setSendError(false);
    setFailedAction(null);
    setDragX(0);

    try {
      if (direction === 'right') {
        let sent = false;
        try {
          sent = await onRightSwipe(activeUser);
        } catch {
          sent = false;
        }
        if (!sent) {
          setSendError(true);
          setFailedAction('interest');
          return;
        }
      }
      if (direction === 'known') {
        let sent = false;
        try {
          sent = await onKnown(activeUser);
        } catch {
          sent = false;
        }
        if (!sent) {
          setSendError(true);
          setFailedAction('known');
          return;
        }
      }

      const nextSeenIds = [...progress.seenIds, activeUser.id];
      const next = {
        dateKey,
        seenIds: nextSeenIds,
        completed: candidates.every((user) => nextSeenIds.includes(user.id)),
      };
      if (!saveDailySwipeProgress(getStorage(), accountId, next)) {
        setStorageError(true);
        return;
      }
      if (direction === 'left' || direction === 'right') onSwipeDecision(activeUser, direction);
      setSession((previous) =>
        previous.dateKey === dateKey
          ? { ...previous, progress: next }
          : previous,
      );
    } finally {
      setActionPending(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (pointerStart.current?.id === event.pointerId) {
      setDragX(event.clientX - pointerStart.current.x);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    setIsDragging(false);
    if (!start || start.id !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) >= 80 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      void advance(deltaX > 0 ? 'right' : 'left');
    } else {
      setDragX(0);
    }
  };

  if (!accountId) return null;

  return (
    <section
      aria-label={t('swipe')}
      data-testid="daily-swipe-screen"
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        padding: '12px',
        overflowY: 'auto',
        color: '#fff',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '20px' }}>{t('swipe')}</h1>
      {complete ? (
        <p role="status" data-testid="daily-swipe-complete" style={{ textAlign: 'center', color: '#ccc' }}>
          {t('dailySwipeComplete')}
        </p>
      ) : !activeUser ? (
        <div style={{ textAlign: 'center', color: '#ccc' }}>
          <p role="status">{t('dailySwipeEmpty')}</p>
          <button type="button" onClick={onRefresh} style={actionButtonStyle}>
            {t('refresh')}
          </button>
        </div>
      ) : (
        <>
          <p aria-live="polite" style={{ margin: 0, color: '#aaa', fontSize: '13px' }}>
            {seenCandidateCount + 1} / {candidates.length}
          </p>
          <article
            aria-label={`${t('swipeProfile')}: ${activeUser.name || t('profileImage')}`}
            data-testid={`daily-swipe-card-${activeUser.id}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              pointerStart.current = null;
              setIsDragging(false);
              setDragX(0);
            }}
            style={{
              position: 'relative',
              width: 'min(100%, 390px)',
              aspectRatio: '0.78',
              maxHeight: '58dvh',
              overflow: 'hidden',
              borderRadius: '18px',
              background: '#222',
              touchAction: 'pan-y',
              userSelect: 'none',
              transform: `translateX(${dragX}px) rotate(${dragX / 24}deg)`,
              transition: prefersReducedMotion || isDragging
                ? 'none'
                : 'transform 180ms ease',
              boxShadow: '0 12px 36px rgba(0,0,0,.35)',
            }}
          >
            <img
              src={activeUser.avatar || ''}
              alt={activeUser.name || t('profileImage')}
              draggable={false}
              loading="lazy"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                inset: '38% 0 0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                gap: '7px',
                padding: '14px',
                background: 'linear-gradient(transparent, rgba(0,0,0,.86))',
                overflowY: 'auto',
              }}
            >
              <strong style={{ fontSize: '24px' }}>
                {activeUser.name || t('profileImage')}
                {!activeUser.hide_age && typeof activeUser.age === 'number' ? `, ${activeUser.age}` : ''}
              </strong>
              {typeof activeUser.karma === 'number' && (
                <span data-testid="daily-swipe-karma" style={{ fontSize: '13px', fontWeight: 700 }}>
                  {t('karma')}: {activeUser.karma}
                </span>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 10px', color: '#eee', fontSize: '12px' }}>
                {typeof activeUser.distance === 'number' && (
                  <span data-testid="daily-swipe-distance">{formatDistance(activeUser.distance)}</span>
                )}
                <span data-testid="daily-swipe-last-online">
                  {t('lastOnline')}: {formatLastSeen(activeUser.last_seen)}
                </span>
              </div>
              <div data-testid="daily-swipe-profile-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {activeUser.height && <span style={statChipStyle}>{t('height')} {activeUser.height}</span>}
                {activeUser.weight && <span style={statChipStyle}>{t('weight')} {activeUser.weight}</span>}
                {showPreferenceTags && activeUser.role_pref && <span style={statChipStyle}>{t(activeUser.role_pref)}</span>}
                {showPreferenceTags && activeUser.safety_pref && <span style={statChipStyle}>{t(activeUser.safety_pref)}</span>}
                {showPreferenceTags && activeUser.playstyle_pref && <span style={statChipStyle}>{t(activeUser.playstyle_pref)}</span>}
                {showPreferenceTags && activeUser.how_many_pref && <span style={statChipStyle}>{formatHowMany(activeUser.how_many_pref)}</span>}
                {showPreferenceTags && (
                  <span style={statChipStyle}>
                    {activeUser.where_pref ? t(activeUser.where_pref) : t('Anywhere')}
                  </span>
                )}
              </div>
            </div>
          </article>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', width: 'min(100%, 390px)', gap: '8px' }}>
            <button
              type="button"
              aria-label={t('pass')}
              data-testid="daily-swipe-left"
              disabled={actionPending || storageError}
              onClick={() => void advance('left')}
              style={{ ...actionButtonStyle, minWidth: 0, padding: '10px 4px', color: '#f87171' }}
            >
              {t('pass')}
            </button>
            <button
              type="button"
              aria-label={t('dailySwipeLater')}
              title={t('dailySwipeLater')}
              data-testid="daily-swipe-later"
              disabled={actionPending || storageError}
              onClick={() => void advance('later')}
              style={{ ...actionButtonStyle, minWidth: 0, padding: '10px 4px', color: '#fbbf24' }}
            >
              ?
            </button>
            <button
              type="button"
              aria-label={t('interested')}
              data-testid="daily-swipe-right"
              disabled={actionPending || storageError}
              onClick={() => void advance('right')}
              style={{ ...actionButtonStyle, minWidth: 0, padding: '10px 4px', color: '#fb7185' }}
            >
              ❤️ {t('interested')}
            </button>
            <button
              type="button"
              aria-label={t('known')}
              data-testid="daily-swipe-known"
              disabled={actionPending || storageError || activeUser.known_review_state_known !== true || activeUser.known_reviewed === true}
              onClick={() => void advance('known')}
              style={{ ...actionButtonStyle, minWidth: 0, padding: '10px 4px', color: '#93c5fd' }}
            >
              {t('known')}
            </button>
          </div>
          {storageError && (
            <p role="alert" style={{ color: '#fca5a5', textAlign: 'center', margin: 0 }}>
              {t('dailySwipeStorageError')}
            </p>
          )}
          {sendError && (
            <p role="alert" style={{ color: '#fca5a5', textAlign: 'center', margin: 0 }}>
              {t(failedAction === 'known' ? 'dailySwipeKnownFailed' : 'dailySwipeSendFailed')}
            </p>
          )}
          {actionPending && (
            <p role="status" style={{ color: '#ccc', margin: 0 }}>{t('dailySwipeSending')}</p>
          )}
        </>
      )}
    </section>
  );
}

const statChipStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid rgba(255,255,255,.2)',
  borderRadius: '12px',
  background: 'rgba(18,18,18,.78)',
  color: '#fff',
  fontSize: '11px',
  lineHeight: 1.25,
};

const actionButtonStyle: React.CSSProperties = {
  minHeight: '48px',
  padding: '10px 18px',
  border: '1px solid #444',
  borderRadius: '24px',
  background: '#1f1f1f',
  color: '#fff',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
};
