export interface NearbyGridUser {
  id: string;
  name?: string | null;
  avatar?: string | null;
  distance?: number;
  last_seen?: string | null;
  grid_visible?: boolean;
}

export interface NearbyGridModuleProps<User extends NearbyGridUser> {
  users: User[];
  currentUserId: string | null;
  isOnline: (lastSeen?: string | null) => boolean;
  passesFilter: (user: User) => boolean;
  formatDistance: (distance?: number) => string;
  onSelectProfile: (user: User) => void;
  t: (key: string) => string;
}

export default function NearbyGridModule<User extends NearbyGridUser>({
  users,
  currentUserId,
  isOnline,
  passesFilter,
  formatDistance,
  onSelectProfile,
  t,
}: NearbyGridModuleProps<User>) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', padding: '4px' }}>
        {users.map((user, index) => {
          const isSelf = currentUserId !== null && user.id === currentUserId;
          const matches = passesFilter(user);
          const isUserVisible = user.grid_visible !== false;
          const opacity = isUserVisible ? (matches ? 1 : 0.68) : 0.32;
          const distanceText = formatDistance(user.distance);
          const online = isOnline(user.last_seen);

          return (
            <div
              key={user.id || index}
              onClick={() => onSelectProfile(user)}
              style={{ position: 'relative', aspectRatio: '1/1', cursor: 'pointer', backgroundColor: '#222', overflow: 'hidden', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity }}
            >
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundColor: '#0088cc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt={user.name || ''}
                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
              {online && (
                <div aria-label="Online" style={{ position: 'absolute', top: '4px', right: '4px', width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%', border: '2px solid #121212', zIndex: 2 }} />
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px', fontSize: '10px', textAlign: 'center' }}>
                {isSelf ? t('you') : distanceText}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
