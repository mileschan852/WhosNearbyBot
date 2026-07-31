import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Forcing Leaflet map pins to use CDNs so they don't break on mobile
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Initialize Supabase client
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
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
    // Tapping directly into the global window object instead of the broken npm package
    const WebApp = (window as any).Telegram?.WebApp;
    
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
      } catch (e) {
        console.warn('Telegram WebApp expansion failed:', e);
      }
    }

    const currentUser = WebApp?.initDataUnsafe?.user;
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
      try {
        const { data } = await supabase.from('profiles').select('*');
        let allProfiles: Profile[] = data || [];

        let currentSelf: Profile;
        if (currentUser) {
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
          currentSelf = allProfiles[0] || {
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

        const others = allProfiles
          .filter(p => p.telegram_id !== currentSelf.telegram_id)
          .map(p => ({
            ...p,
            distance: calculateDistance(currentSelf.latitude, currentSelf.longitude, p.latitude, p.longitude)
          }))
          .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
          .slice(0, 99); 

        setProfiles(others);
      } catch (err) {
        console.error('Error fetching profiles:', err);
      } finally {
        setLoading(false);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchAndSetupProfiles(position.coords.latitude, position.coords.longitude);
        },
        () => {
          fetchAndSetupProfiles(defaultLat, defaultLng);
        },
        { timeout: 10000 }
      );
    } else {
      fetchAndSetupProfiles(defaultLat, defaultLng);
    }
  }, []);

  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current && selfProfile) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([selfProfile.latitude, selfProfile.longitude], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      L.marker([selfProfile.latitude, selfProfile.longitude]).addTo(map)
        .bindPopup('<b>You are here</b>');

      profiles.forEach(p => {
        if (p.latitude && p.longitude) {
          L.marker([p.latitude, p.longitude]).addTo(map)
            .bindPopup(`<b>${p.first_name}</b><br/>${p.distance?.toFixed(1)} km away`);
        }
      });

      mapInstanceRef.current = map;
      
      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [selfProfile, profiles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <p className="text-lg animate-pulse">Loading profiles and map...</p>
      </div>
    );
  }

  const gridItems = selfProfile ? [selfProfile, ...profiles].slice(0, 100) : profiles.slice(0, 100);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white pb-6">
      <div className="w-full h-72 relative shadow-inner border-b border-slate-800">
        <div ref={mapContainerRef} className="w-full h-full z-0 bg-slate-900 absolute inset-0" />
      </div>

      <div className="p-4 flex-1 w-full max-w-4xl mx-auto">
        <h2 className="text-xl font-bold mb-4 tracking-wide">Nearby Profiles</h2>
        <div className="grid grid-cols-5 gap-2 w-full">
          {gridItems.map((profile, index) => {
            const firstPhoto = profile.photos && profile.photos.length > 0 
              ? profile.photos[0] 
              : 'https://via.placeholder.com/150';
            const isSelf = index === 0;

            return (
              <div 
                key={profile.id || index}
                className={`relative aspect-square rounded-xl overflow-hidden bg-slate-900 border ${isSelf ? 'border-amber-400 ring-2 ring-amber-400/50 z-10' : 'border-slate-800'} shadow-md transition-transform active:scale-95`}
              >
                <img 
                  src={firstPhoto} 
                  alt={profile.first_name} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 text-[10px] flex flex-col justify-end">
                  <span className="font-semibold truncate text-white drop-shadow-md">{isSelf ? 'YOU' : profile.first_name}</span>
                  {!isSelf && profile.distance !== undefined && (
                    <span className="text-slate-300 text-[9px] drop-shadow-md">{profile.distance.toFixed(1)} km</span>
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
