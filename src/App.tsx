import { useState } from 'react';

import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

// --- MOCK DATA GENERATION ---
// I am generating your 100 closest users here. 
const generateUsers = () => {
  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push({
      id: i,
      name: i === 0 ? 'You' : `User ${i}`,
      isSelf: i === 0,
      distance: i === 0 ? '0m' : `${Math.floor(Math.random() * 500) + 10}m`,
      isOnline: i === 0 ? true : Math.random() > 0.5,
      avatar: `https://i.pravatar.cc/150?u=${i}`,
      lat: 22.3193 + (Math.random() - 0.5) * 0.01, // Near Hong Kong
      lng: 114.1694 + (Math.random() - 0.5) * 0.01,
    });
  }
  return users;
};

const mockUsers = generateUsers();

// --- CUSTOM LEAFLET ICON ---
// This ensures profile pictures show up on the map pins.
const createProfileIcon = (avatarUrl: string) => {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; border: 2px solid #007bff; box-shadow: 0 2px 4px rgba(0,0,0,0.4);"><img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;" /></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

export default function App() {
  const [view, setView] = useState<'grid' | 'map'>('grid');

  const handleStartChat = (userId: number) => {
    // This is where your private message logic will trigger.
    console.log(`Starting private chat with user ID: ${userId}`);
    alert(`Starting private chat with user ${userId}`);
  };

  const handleRefresh = () => {
    console.log('Refreshing user data...');
    // Supabase fetch logic will go here later.
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif' }}>
      
      {/* TOP BAR */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: '60px', backgroundColor: '#1e1e1e', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* App Icon */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>Who's Nearby</h1>
        </div>
        
        {/* Refresh Button */}
        <button onClick={handleRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
          </svg>
        </button>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', padding: '4px' }}>
            {mockUsers.map((user) => (
              <div 
                key={user.id} 
                onClick={() => handleStartChat(user.id)}
                style={{ position: 'relative', aspectRatio: '1/1', cursor: 'pointer', backgroundColor: '#333', overflow: 'hidden', borderRadius: '4px' }}
              >
                <img src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                
                {/* Distance overlay */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px', fontSize: '10px', textAlign: 'center' }}>
                  {user.distance}
                </div>

                {/* Online Indicator */}
                {user.isOnline && (
                  <div style={{ position: 'absolute', top: '4px', right: '4px', width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%', border: '2px solid #121212' }} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <MapContainer 
            center={[22.3193, 114.1694]} 
            zoom={14} 
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {mockUsers.map((user) => (
              <Marker 
                key={user.id} 
                position={[user.lat, user.lng]} 
                icon={createProfileIcon(user.avatar)}
                eventHandlers={{
                  click: () => handleStartChat(user.id),
                }}
              />
            ))}
          </MapContainer>
        )}
      </main>

      {/* BOTTOM NAV BAR */}
      <footer style={{ display: 'flex', height: '60px', backgroundColor: '#1e1e1e', borderTop: '1px solid #333' }}>
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
