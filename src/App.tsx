import { useEffect, useState, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { createClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix missing Leaflet default marker icons in Vite/Webpack builds
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

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
    try {
      WebApp.ready();
      WebApp.expand();
    } catch {
      // Running outside Telegram WebApp
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
        console.error('Supabase fetch error:', err);
      }

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
      setLoading(false);
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

  // Setup Leaflet map with standard OpenStreetMap tiles, restricted popup triggers on marker click only
  useEffect(() => {
    if (!loading && mapContainerRef.current && !mapInstanceRef.current && selfProfile) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        closePopupOnClick: false,
      }).setView([selfProfile.latitude, selfProfile.longitude], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Self marker
      const selfMarker = L.marker([selfProfile.latitude, selfProfile.longitude]).addTo(map);
      selfMarker.bindPopup(`<b>You (${selfProfile.first_name})</b>`);

      // Profiles markers
      profiles.forEach(p => {
        if (p.latitude && p.longitude) {
          const marker = L.marker([p.latitude, p.longitude]).addTo(map);
          marker.bindPopup(`<b>${p.first_name}</b><br/>${p.distance?.toFixed(1)} km away`);
        }
      });

      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 300);
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
        <p className="text-lg animate-pulse">Loading profiles and map...</p>
      </div>
    );
  }

  // Self is strictly index 0, followed by up to 99 sorted nearby profiles (total 100 items = 20 rows of 5)
  const gridItems = selfProfile ? [selfProfile, ...profiles].slice(0, 100) : profiles.slice(0, 100);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white pb-6">
      {/* Map Container */}
      <div className="w-full h-72 relative">
        <div ref={mapContainerRef} className="w-full h-full z-0 absolute inset-0 bg-slate-900" />
      </div>

      {/* Grid Section: exactly 5 items per row */}
      <div className="p-4 flex-1">
        <h2 className="text-xl font-bold mb-3 tracking-wide">Nearby Profiles</h2>
        <div className="grid grid-cols-5 gap-2 w-full max-w-lg mx-auto">
          {gridItems.map((profile, index) => {
            const firstPhoto = profile.photos && profile.photos.length > 0 
              ? profile.photos[0] 
              : 'https://via.placeholder.com/150';
            const isSelf = index === 0;

            return (
              <div 
                key={profile.id || index}
                className={`relative aspect-square rounded-xl overflow-hidden bg-slate-900 border ${isSelf ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-slate-800'} shadow-md`}
              >
                <img 
                  src={firstPhoto} 
                  alt={profile.first_name} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 text-[10px] flex flex-col justify-end">
                  <span className="font-semibold truncate text-white">{isSelf ? 'You' : profile.first_name}</span>
                  {!isSelf && profile.distance !== undefined && (
                    <span className="text-slate-300 text-[9px]">{profile.distance.toFixed(1)} km</span>
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
