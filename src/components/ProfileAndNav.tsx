import { appConfig } from '../config';
import type { GridUser, ViewMode } from '../types';

interface ProfileAndNavProps {
  selectedUser: GridUser | null;
  onClose: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

function formatDistance(meters?: number): string {
  if (!meters) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function ProfileSheet({ user, onClose }: { user: GridUser; onClose: () => void }) {
  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="profile-close-btn" onClick={onClose} aria-label="Close profile">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="profile-header">
          {user.photo_url ? (
            <img src={user.photo_url} alt={user.first_name || 'User'} className="profile-photo" />
          ) : (
            <div className="profile-photo profile-photo-fallback">
              {(user.first_name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <h2 className="profile-name">
            {user.first_name || 'Anonymous'}
            {user.age ? <span className="profile-age">, {user.age}</span> : null}
          </h2>
          {user.username && (
            <p className="profile-username">@{user.username}</p>
          )}
        </div>

        <div className="profile-details">
          {user.distance_m && (
            <div className="profile-detail-row">
              <span className="profile-detail-label">Distance</span>
              <span className="profile-detail-value">{formatDistance(user.distance_m)}</span>
            </div>
          )}
          {user.intent && (
            <div className="profile-detail-row">
              <span className="profile-detail-label">Seeking</span>
              <span className="profile-detail-value">{user.intent}</span>
            </div>
          )}
          <div className="profile-detail-row">
            <span className="profile-detail-label">Status</span>
            <span className="profile-detail-value">
              {user.is_vip ? '⭐ VIP' : user.is_premium ? '💎 Premium' : 'Free'}
            </span>
          </div>
        </div>

        <button
          className="profile-chat-btn"
          style={{ backgroundColor: appConfig.theme.primary }}
          onClick={() => {
            // In production this would open a chat
            alert(`Chat with ${user.first_name || 'Anonymous'} — coming soon!`);
          }}
        >
          Send Message
        </button>
      </div>
    </div>
  );
}

export default function ProfileAndNav({
  selectedUser,
  onClose,
  viewMode,
  onViewModeChange,
}: ProfileAndNavProps) {
  return (
    <>
      {selectedUser && (
        <ProfileSheet user={selectedUser} onClose={onClose} />
      )}

      <nav className="bottom-nav" role="tablist" aria-label="View mode">
        <button
          role="tab"
          aria-selected={viewMode === 'grid'}
          className={`bottom-nav-btn ${viewMode === 'grid' ? 'active' : ''}`}
          onClick={() => onViewModeChange('grid')}
          style={viewMode === 'grid' ? { color: appConfig.theme.primary } : undefined}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Grid</span>
        </button>
        <button
          role="tab"
          aria-selected={viewMode === 'map'}
          className={`bottom-nav-btn ${viewMode === 'map' ? 'active' : ''}`}
          onClick={() => onViewModeChange('map')}
          style={viewMode === 'map' ? { color: appConfig.theme.primary } : undefined}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>Map</span>
        </button>
      </nav>
    </>
  );
}
