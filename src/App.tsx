import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';

// --- TELEGRAM WEB APP DECLARATION ---
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
          };
        };
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

// --- SUPABASE CLIENT SETUP ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  lat: number;
  lng: number;
  last_seen: string;
  distance?: number;
}

// --- HELPER: CALCULATE DISTANCE (Haversine formula) ---
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  try {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  } catch {
    return 0;
  }
};

// --- MAP CONTROLLER ---
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.setView(center, 15, { animate: false });
    }
  }, [center, map]);
  return null;
}

// --- CUSTOM LEAFLET ICON ---
const createProfileIcon = (user: UserProfile) => {
  let innerHtml = '';
  if (user.avatar) {
    innerHtml = `<img src="${user.avatar}" style="width: 100%; height: 100%; object-fit: cover;" />`;
  } else {
    const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
    innerHtml = `<div style="width: 100%; height: 100%; background-color: #0088cc; color: #fff; display: flex; align-items: center; justifyContent: center; font-weight: bold; font-size: 14px;">${initial}</div>`;
  }

  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; border: 2px solid #007bff; box-shadow: 0 2px 4px rgba(0,0,0,0.4); background-color: #222;">${innerHtml}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

export default function App() {
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ lat: 22.3193, lng: 114.1694 });
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    const initApp = async () => {
      try {
        // Initialize Telegram WebApp API
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.ready?.();
          window.Telegram.WebApp.expand?.();
        }

        // Give Telegram client container a brief moment to inject user payload if needed
        let tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (!tgUser) {
          await new Promise((res) => setTimeout(res, 200));
          tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        }

        const userId = tgUser?.id ? `tg_${tgUser.id}` : (localStorage.getItem('whos_nearby_user_id') || 'user_' + Math.random().toString(36).substring(2, 9));
        if (!tgUser?.id && !localStorage.getItem('whos_nearby_user_id')) {
          localStorage.setItem('whos_nearby_user_id', userId);
        }

        const userName = tgUser?.first_name || 'You';
        const userAvatar = tgUser?.photo_url || '';

        let lat = 22.3193;
        let lng = 114.1694;

        if (navigator.geolocation) {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
                resolve();
              },
              () => resolve(),
              { enableHighAccuracy: true, timeout: 4000 }
            );
          });
        }

        setLocation({ lat, lng });

        const myProfile: UserProfile = {
          id: userId,
          name: userName,
          avatar: userAvatar,
          lat,
          lng,
          last_seen: new Date().toISOString(),
        };

        setCurrentUser(myProfile);

        if (supabase) {
          await supabase.from('profiles').upsert([myProfile], { onConflict: 'id' });
          const { data, error } = await supabase.from('profiles').select('*');
          if (!error && data && Array.isArray(data)) {
            const processed = data.map((u: any) => ({
              id: u.id || 'unknown',
              name: u.name || 'User',
              avatar: u.avatar || '',
              lat: typeof u.lat === 'number' ? u.lat : lat,
              lng: typeof u.lng === 'number' ? u.lng : lng,
              last_seen: u.last_seen || new Date().toISOString(),
              distance: calculateDistance(lat, lng, u.lat || lat, u.lng || lng),
            })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
            setUsers(processed);
          } else {
            setUsers([myProfile]);
          }
        } else {
          setUsers([myProfile]);
        }
      } catch (err) {
        console.error('Initialization error caught safely:', err);
      } finally {
        setIsReady(true);
      }
    };

    initApp();
  }, []);

  const handleRefresh = async () => {
    if (!currentUser || !supabase) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (!error && data && Array.isArray(data)) {
        const processed = data.map((u: any) => ({
          id: u.id || 'unknown',
          name: u.name || 'User',
          avatar: u.avatar || '',
          lat: typeof u.lat === 'number' ? u.lat : location.lat,
          lng: typeof u.lng === 'number' ? u.lng : location.lng,
          last_seen: u.last_seen || new Date().toISOString(),
          distance: calculateDistance(location.lat, location.lng, u.lat || location.lat, u.lng || location.lng),
        })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
        setUsers(processed);
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    }
  };

  const handleStartChat = (targetUserId: string) => {
    if (currentUser && targetUserId === currentUser.id) return;
    alert(`Starting private chat with user ${targetUserId}`);
  };

  if (!isReady) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif' }}>
        <p>Syncing Telegram profile and loading nearby users...</p>
      </div>
    );
  }

  const sortedGridUsers = currentUser 
    ? [
        { ...currentUser, distance: 0 }, 
        ...users.filter(u => u.id !== currentUser.id)
      ]
    : users;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* TOP BAR */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderBottom: '1px solid #333', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>Who's Nearby</h1>
        </div>
        
        <button onClick={handleRefresh} style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
          </svg>
        </button>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        
        {/* GRID VIEW */}
        <div style={{ display: view === 'grid' ? 'block' : 'none', height: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', padding: '4px' }}>
            {sortedGridUsers.map((user, index) => {
              const isOnline = user.last_seen ? (new Date().getTime() - new Date(user.last_seen).getTime() < 15 * 60 * 1000) : false;
              const isSelf = currentUser && user.id === currentUser.id;

              return (
                <div 
                  key={user.id || index} 
                  onClick={() => handleStartChat(user.id)}
                  style={{ position: 'relative', aspectRatio: '1/1', cursor: 'pointer', backgroundColor: '#222', overflow: 'hidden', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {user.avatar ? (
                    <img 
                      src={user.avatar} 
                      alt={user.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: '#0088cc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                      {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px', fontSize: '10px', textAlign: 'center' }}>
                    {isSelf ? 'You' : `${user.distance ?? 0}m`}
                  </div>

                  {isOnline && (
                    <div style={{ position: 'absolute', top: '4px', right: '4px', width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%', border: '2px solid #121212' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* MAP VIEW */}
        <div style={{ display: view === 'map' ? 'block' : 'none', height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}>
          <MapContainer 
            center={[location.lat, location.lng]} 
            zoom={15} 
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <MapController center={[location.lat, location.lng]} />
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {users.map((user) => (
              <Marker 
                key={user.id} 
                position={[user.lat, user.lng]} 
                icon={createProfileIcon(user)}
                eventHandlers={{
                  click: () => handleStartChat(user.id),
                }}
              />
            ))}
          </MapContainer>
        </div>

      </main>

      {/* BOTTOM NAV BAR */}
      <footer style={{ display: 'flex', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderTop: '1px solid #333', zIndex: 10 }}>
        <button 
          onClick={() => setView('grid')}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: view === 'grid' ? '#007bff' : '#888', cursor: 'pointer' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span style={{ fontSize: '12px', marginTop: '4px' }}>Grid</span>
        </button>
        
        <button 
          onClick={() => setView('map')}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: view === 'map' ? '#007bff' : '#888', cursor: 'pointer' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
          <span style={{ fontSize: '12px', marginTop: '4px' }}>Map</span>
        </button>
      </footer>
    </div>
  );
}
