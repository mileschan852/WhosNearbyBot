import { useEffect, useState, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { createClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// FORCED FIX: Override Leaflet's default icon paths to use CDNs. 
// This prevents Vite from crashing during asset compilation (which causes the blank screen).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Initialize Supabase client safely
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface Profile {
  id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  photos: string[];
  latitude: number;
  longitude: number;
  distance?: number;
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selfProfile, setSelfProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch {
      // Failsafe if running outside Telegram
    }

    const currentUser = WebApp.initDataUnsafe?.user;
    const defaultLat = 22.3193; 
    const defaultLng = 114.1694;

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; 
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const fetchAndSetupProfiles = async (userLat: number, userLng: number) => {
      let allProfiles: Profile[] = [];
      try {
        const { data } = await supabase.from('profiles').select('*');
        if (data) allProfiles = data;
      } catch (err) {
        console.error('Database fetch error:', err);
      }

      // 1. Establish YOU strictly as the central user
      let currentSelf: Profile;
      if (currentUser && currentUser.id) {
        const found = allProfiles.find(p => p.telegram_id === currentUser.id);
        currentSelf = found || {
          id: 'self-local',
          telegram_id: currentUser.id,
          username: currentUser.username || 'self',
          first_name: currentUser.first_name || 'Me',
          photos: currentUser.photo_url ? [currentUser.photo_url] : ['https://via.placeholder.com/150'],
          latitude: userLat,
          longitude: userLng,
        };
      } else {
        currentSelf = {
          id: 'self-mock',
          telegram_id: 0,
          username: 'myself',
          first_name: 'Me',
          photos: ['https://via.placeholder.com/150'],
          latitude: userLat,
          longitude: userLng,
        };
      }

      setSelfProfile(currentSelf);

      // 2. Calculate distance for everyone else and sort them
      const others = allProfiles
        .filter(p => p.telegram_id !== currentSelf.telegram_id)
        .map(p => ({
          ...p,
          distance: calculateDistance(currentSelf.latitude, currentSelf.longitude, p.latitude, p.longitude)
        }))
        .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
        .slice(0, 99); // Up to 99 others

      setProfiles(others);
      setLoading(false);
    };

    // Failsafe Geolocation: Force it to proceed if browser hangs
    let geoResolved = false;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (geoResolved) return; geoResolved = true;
          fetchAndSetupProfiles(position.coords.latitude, position.coords.longitude);
        },
        () => {
          if (geoResolved) return; geoResolved = true;
          fetchAndSetupProfiles(defaultLat, defaultLng);
        },
        { timeout: 5000 }
      );
      
      setTimeout(() => {
        if (!geoResolved) {
          geoResolved = true;
          fetchAndSetupProfiles(defaultLat, defaultLng);
        }
      }, 6000);
    } else {
      geoResolved = true;
      fetchAndSetupProfiles(defaultLat, defaultLng);
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!loading && mapContainerRef.current && !mapInstanceRef.current && selfProfile) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([selfProfile.latitude, selfProfile.longitude], 14);

      // Standard OSM tiles - guaranteed to load
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Add You
      L.marker([selfProfile.latitude, selfProfile.longitude]).addTo(map)
        .bindPopup(`<b>You (${selfProfile.first_name})</b>`);

      // Add Others
      profiles.forEach(p => {
        if (p.latitude && p.longitude) {
          L.marker([p.latitude, p.longitude]).addTo(map)
            .bindPopup(`<b>${p.first_name}</b><br/>${p.distance?.toFixed(1)} km away`);
        }
      });

      mapInstanceRef.current = map;
      
      // Force map to recognize its container size
      setTimeout(() => {
        map.invalidateSize();
      }, 400);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading, selfProfile, profiles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <p className="text-lg animate-pulse font-semibold">Loading your world...</p>
      </div>
    );
  }

  // FORCE you to be the absolute first item in the array
  const gridItems = selfProfile ? [selfProfile, ...profiles] : profiles;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white pb-6 overflow-x-hidden">
      
      {/* Map Section */}
      <div className="w-full relative shadow-inner border-b border-slate-800" style={{ height: '300px' }}>
        <div ref={mapContainerRef} className="w-full h-full bg-slate-900 z-0" />
      </div>

      {/* Grid Section */}
      <div className="p-4 flex-1 w-full max-w-2xl mx-auto">
        <h2 className="text-xl font-bold mb-4 tracking-wide text-center">Nearby Profiles</h2>
        
        {/* Strictly forced 5-column grid */}
        <div 
          className="grid gap-2" 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            width: '100%'
          }}
        >
          {gridItems.map((profile, index) => {
            const firstPhoto = profile.photos && profile.photos.length > 0 
              ? profile.photos[0] 
              : 'https://via.placeholder.com/150';
            
            // You are strictly index 0
            const isSelf = index === 0;

            return (
              <div 
                key={profile.id || `profile-${index}`}
                className={`relative aspect-square rounded-xl overflow-hidden bg-slate-900 border ${isSelf ? 'border-amber-400 ring-2 ring-amber-400/80 z-10' : 'border-slate-800'} shadow-md`}
              >
                <img 
                  src={firstPhoto} 
                  alt={profile.first_name} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1 flex flex-col justify-end items-center text-center">
                  <span className="font-bold truncate text-white text-[10px] w-full leading-tight">
                    {isSelf ? 'YOU' : profile.first_name}
                  </span>
                  {!isSelf && profile.distance !== undefined && (
                    <span className="text-slate-300 text-[9px] font-medium leading-tight">
                      {profile.distance.toFixed(1)} km
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
