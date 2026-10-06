import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import type { UserProfile } from '../App';

interface MapViewProps {
  location: { lat: number; lng: number };
  currentUser: UserProfile | null;
  users: UserProfile[];
  gridVisible: boolean;
  isOnline: (lastSeen?: string | null) => boolean;
  onSelectProfile: (user: UserProfile) => void;
}

function MapController({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.setView([latitude, longitude], 15, { animate: true });
  }, [latitude, longitude, map]);
  return null;
}

function safeAvatarUrl(avatar: string): string | null {
  try {
    const url = new URL(avatar, window.location.href);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function createProfileIcon(user: UserProfile, isEnabled: boolean, isSelf: boolean, isOnline: boolean) {
  const borderColor = isSelf ? '#00ffff' : (isEnabled ? '#007bff' : '#555');
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'relative',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    overflow: 'visible',
    border: `3px solid ${borderColor}`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
    backgroundColor: '#222',
    opacity: isEnabled ? '1' : '0.3',
    filter: isEnabled ? 'none' : 'grayscale(100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const avatar = document.createElement('div');
  Object.assign(avatar.style, {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const avatarUrl = user.avatar ? safeAvatarUrl(user.avatar) : null;
  if (avatarUrl) {
    const image = document.createElement('img');
    image.src = avatarUrl;
    image.alt = user.name || 'Profile image';
    image.loading = 'lazy';
    Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'cover' });
    avatar.appendChild(image);
  } else {
    const initial = document.createElement('div');
    initial.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
    Object.assign(initial.style, {
      width: '100%',
      height: '100%',
      backgroundColor: '#0088cc',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      fontSize: '14px',
    });
    avatar.appendChild(initial);
  }
  root.appendChild(avatar);

  if (isOnline) {
    const onlineDot = document.createElement('div');
    Object.assign(onlineDot.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      width: '10px',
      height: '10px',
      backgroundColor: '#4ade80',
      borderRadius: '50%',
      border: '2px solid #121212',
      zIndex: '10',
    });
    root.appendChild(onlineDot);
  }

  return L.divIcon({
    className: 'custom-map-pin',
    html: root,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export default function MapView({
  location,
  currentUser,
  users,
  gridVisible,
  isOnline,
  onSelectProfile,
}: MapViewProps) {
  return (
    <MapContainer
      center={[location.lat, location.lng]}
      zoom={15}
      style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
      zoomControl={false}
    >
      <MapController latitude={location.lat} longitude={location.lng} />
      <TileLayer
        className="dark-map-tiles"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <MarkerClusterGroup chunkedLoading>
        {currentUser && (
          <Marker
            key="self-pin"
            position={[location.lat, location.lng]}
            icon={createProfileIcon(currentUser, gridVisible, true, isOnline(currentUser.last_seen))}
            eventHandlers={{ click: () => onSelectProfile(currentUser) }}
          />
        )}
        {users.map((user) => {
          if (typeof user.lat !== 'number' || typeof user.lng !== 'number') return null;
          return (
            <Marker
              key={user.id}
              position={[user.lat, user.lng]}
              icon={createProfileIcon(user, user.grid_visible !== false, false, isOnline(user.last_seen))}
              eventHandlers={{ click: () => onSelectProfile(user) }}
            />
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
