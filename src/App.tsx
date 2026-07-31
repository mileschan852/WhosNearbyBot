import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Profile {
  id: string;
  username: string;
  latitude: number;
  longitude: number;
  last_seen: string;
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Haversine formula to calculate distance in kilometers
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCurrentLocation({ lat, lng });

        try {
          // Fetch profiles from Supabase
          const { data, error: fetchError } = await supabase
            .from('profiles')
            .select('*');

          if (fetchError) throw fetchError;

          if (data) {
            // Sort profiles by distance using Haversine formula
            const sortedProfiles = data.map((profile: Profile) => ({
              ...profile,
              distance: calculateDistance(lat, lng, profile.latitude, profile.longitude)
            })).sort((a: any, b: any) => a.distance - b.distance);

            setProfiles(sortedProfiles);
          }
        } catch (err: any) {
          setError(err.message || 'Failed to fetch profiles');
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Who's Nearby</h1>
      
      {loading && <p>Loading nearby profiles...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {!loading && !error && (
        <div>
          {currentLocation && (
            <p style={{ fontSize: '14px', color: '#666' }}>
              Your Location: {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px', marginTop: '20px' }}>
            {profiles.map((profile) => {
              const isOnline = new Date().getTime() - new Date(profile.last_seen).getTime() < 15 * 60 * 1000;
              
              return (
                <div key={profile.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', background: '#fafafa' }}>
                  <h3 style={{ margin: '0 0 10px 0' }}>{profile.username || 'Anonymous'}</h3>
                  <p style={{ margin: '5px 0', fontSize: '13px' }}>
                    Distance: {((profile as any).distance).toFixed(2)} km
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                    <span style={{
                      height: '10px',
                      width: '10px',
                      backgroundColor: isOnline ? '#28a745' : '#ccc',
                      borderRadius: '50%',
                      display: 'inline-block',
                      marginRight: '8px'
                    }}></span>
                    <span style={{ fontSize: '12px', color: '#555' }}>
                      {isOnline ? 'Online recently' : 'Offline'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
