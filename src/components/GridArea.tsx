import { appConfig } from '../config';
import type { GridUser } from '../types';

interface GridAreaProps {
  users: GridUser[];
  loading: boolean;
  error: string | null;
  onSelectUser: (user: GridUser) => void;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function formatDistance(meters?: number): string {
  if (!meters) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function GridArea({ users, loading, error, onSelectUser }: GridAreaProps) {
  if (loading) {
    return (
      <div className="grid-area">
        <div className="grid-loading">
          <div className="spinner" />
          <p>Finding people nearby...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid-area">
        <div className="grid-error">
          <p>Something went wrong</p>
          <p className="grid-error-detail">{error}</p>
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="grid-area">
        <div className="grid-empty">
          <div className="grid-empty-icon">👀</div>
          <p>No one nearby yet</p>
          <p className="grid-empty-hint">Check back later or expand your search area</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-area">
      <div className="grid-container">
        {users.map((user) => (
          <button
            key={user.id}
            className="grid-card"
            onClick={() => onSelectUser(user)}
            style={{ '--card-accent': appConfig.theme.primary } as React.CSSProperties}
          >
            <div className="grid-card-photo">
              {user.photo_url ? (
                <img
                  src={user.photo_url}
                  alt={user.first_name || 'User'}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`grid-card-photo-fallback ${user.photo_url ? 'hidden' : ''}`}>
                {getInitials(user.first_name)}
              </div>
              {user.is_vip && <span className="grid-card-vip-badge">VIP</span>}
            </div>
            <div className="grid-card-info">
              <div className="grid-card-name-row">
                <span className="grid-card-name">{user.first_name || 'Anonymous'}</span>
                {user.age && <span className="grid-card-age">{user.age}</span>}
              </div>
              <div className="grid-card-meta">
                {user.distance_m ? (
                  <span className="grid-card-distance">{formatDistance(user.distance_m)}</span>
                ) : null}
                {user.intent && (
                  <span className="grid-card-intent">{user.intent}</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
