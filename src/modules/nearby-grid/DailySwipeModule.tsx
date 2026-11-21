import { useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../../App';
import {
  getDailySwipeDateKey,
  loadDailySwipeProgress,
  saveDailySwipeProgress,
  type DailySwipeProgress,
} from '../../utils/daily-swipe-session.js';
import { hasJpgMainProfileImage } from '../../utils/profile-image.js';

interface DailySwipeModuleProps {
  users: UserProfile[];
  accountId: string | null;
  onRightSwipe: (user: UserProfile) => Promise<boolean>;
  onRefresh: () => void;
  formatDistance: (distance?: number) => string;
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
  onRefresh,
  formatDistance,
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
        hasJpgMainProfileImage(user.avatar),
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

  const advance = async (interested: boolean) => {
    if (!activeUser || actionPending || storageError) return;
    setActionPending(true);
    setSendError(false);
    setDragX(0);

    try {
      if (interested) {
        let sent = false;
        try {
          sent = await onRightSwipe(activeUser);
        } catch {
          sent = false;
        }
        if (!sent) {
          setSendError(true);
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
      void advance(deltaX > 0);
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
                inset: '45% 0 0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                gap: '5px',
                padding: '18px',
                background: 'linear-gradient(transparent, rgba(0,0,0,.86))',
              }}
            >
              <strong style={{ fontSize: '24px' }}>
                {activeUser.name || t('profileImage')}
                {typeof activeUser.age === 'number' ? `, ${activeUser.age}` : ''}
              </strong>
              {typeof activeUser.distance === 'number' && (
                <span style={{ color: '#eee', fontSize: '14px' }}>
                  {formatDistance(activeUser.distance)}
                </span>
              )}
            </div>
          </article>
          <div style={{ display: 'flex', width: 'min(100%, 390px)', gap: '16px' }}>
            <button
              type="button"
              aria-label={t('pass')}
              data-testid="daily-swipe-left"
              disabled={actionPending || storageError}
              onClick={() => void advance(false)}
              style={{ ...actionButtonStyle, flex: 1, color: '#f87171' }}
            >
              {t('pass')}
            </button>
            <button
              type="button"
              aria-label={t('interested')}
              data-testid="daily-swipe-right"
              disabled={actionPending || storageError}
              onClick={() => void advance(true)}
              style={{ ...actionButtonStyle, flex: 1, color: '#fb7185' }}
            >
              ❤️ {t('interested')}
            </button>
          </div>
          {storageError && (
            <p role="alert" style={{ color: '#fca5a5', textAlign: 'center', margin: 0 }}>
              {t('dailySwipeStorageError')}
            </p>
          )}
          {sendError && (
            <p role="alert" style={{ color: '#fca5a5', textAlign: 'center', margin: 0 }}>
              {t('dailySwipeSendFailed')}
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
