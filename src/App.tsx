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
        openTelegramLink?: (url: string) => void;
        showAlert?: (message: string) => void;
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
  username?: string;
  avatar: string;
  lat: number;
  lng: number;
  last_seen: string;
  gender?: string;
  seeking?: string;
  dob?: string;
  height?: string;
  weight?: string;
  role_pref?: string | null;
  safety_pref?: string | null;
  playstyle_pref?: string | null;
  where_pref?: string | null;
  how_many_pref?: string | null;
  non_man_mode?: string | null;
  is_underage?: boolean;
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

// --- HELPER: CALCULATE AGE FROM DOB ---
const calculateAge = (dobString?: string) => {
  if (!dobString) return null;
  try {
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
};

// --- MAP CONTROLLER & RESIZE FIXER ---
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.invalidateSize();
      map.setView(center, 15, { animate: true });
    }
  }, [center, map]);
  return null;
}

// --- CUSTOM LEAFLET ICON ---
const createProfileIcon = (user: UserProfile, isEnabled: boolean, isSelf: boolean) => {
  let innerHtml = '';
  if (user.avatar) {
    innerHtml = `<img src="${user.avatar}" style="width: 100%; height: 100%; object-fit: cover;" />`;
  } else {
    const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
    innerHtml = `<div style="width: 100%; height: 100%; background-color: #0088cc; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">${initial}</div>`;
  }

  const opacity = isEnabled ? '1' : '0.3';
  const filter = isEnabled ? 'none' : 'grayscale(100%)';
  const borderColor = isSelf ? '#00ffff' : (isEnabled ? '#007bff' : '#555');

  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; border: 3px solid ${borderColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.6); background-color: #222; opacity: ${opacity}; filter: ${filter}; display: flex; align-items: center; justify-content: center;">${innerHtml}</div>`,
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
  const [showProfileSetup, setShowProfileSetup] = useState<boolean>(false);
  const [isUnderageLocked, setIsUnderageLocked] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Profile Drawer State
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);

  // Setup Form State
  const [gender, setGender] = useState<string>('man');
  const [seeking, setSeeking] = useState<string>('women');
  const [dob, setDob] = useState<string>('1995-01-01');
  const [height, setHeight] = useState<string>('1.7m (5ft 7in)');
  const [weight, setWeight] = useState<string>('70kg (154lbs)');

  // Man seeking Men preferences
  const [rolePref, setRolePref] = useState<string>('Versatile');
  const [safetyPref, setSafetyPref] = useState<string>('Safe');
  const [playstylePref, setPlaystylePref] = useState<string>('Clean');
  const [wherePref, setWherePref] = useState<string>('Host');
  const [howManyPref, setHowManyPref] = useState<string>('1on1');

  // Non-man seeking men preferences (Radio option state)
  const [nonManMode, setNonManMode] = useState<string>('Meet up');

  // Tracking existing saved fields to lock them if they were already filled
  const [savedGender, setSavedGender] = useState<string>('');
  const [savedSeeking, setSavedSeeking] = useState<string>('');
  const [savedDob, setSavedDob] = useState<string>('');
  const [savedHeight, setSavedHeight] = useState<string>('');
  const [savedWeight, setSavedWeight] = useState<string>('');

  // Generate Height Options (1.0m to 3.0m by 0.1m)
  const heightOptions = [];
  for (let i = 10; i <= 30; i++) {
    const m = (i / 10).toFixed(1);
    const cm = i * 10;
    const totalInches = Math.round(cm / 2.54);
    const ft = Math.floor(totalInches / 12);
    const inch = totalInches % 12;
    heightOptions.push(`${m}m (${ft}ft ${inch}in)`);
  }

  // Generate Weight Options (35kg to 160kg)
  const weightOptions = [];
  for (let kg = 35; kg <= 160; kg += 1) {
    const lbs = Math.round(kg * 2.20462);
    weightOptions.push(`${kg}kg (${lbs}lbs)`);
  }

  useEffect(() => {
    const initApp = async () => {
      try {
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.ready?.();
          window.Telegram.WebApp.expand?.();
        }

        let tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (!tgUser) {
          await new Promise((res) => setTimeout(res, 300));
          tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        }

        const userId = tgUser?.id ? `tg_${tgUser.id}` : (localStorage.getItem('whos_nearby_user_id') || 'user_' + Math.random().toString(36).substring(2, 9));
        if (!tgUser?.id && !localStorage.getItem('whos_nearby_user_id')) {
          localStorage.setItem('whos_nearby_user_id', userId);
        }

        const userName = tgUser?.first_name || (tgUser?.id ? `User ${tgUser.id}` : 'Test User');
        const userUsername = tgUser?.username || '';
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
              { enableHighAccuracy: true, timeout: 5000 }
            );
          });
        }

        setLocation({ lat, lng });

        let existingProfile: any = null;
        if (supabase) {
          const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
          if (data) {
            existingProfile = data;
          }
        }

        if (existingProfile?.is_underage) {
          setIsUnderageLocked(true);
          setIsReady(true);
          return;
        }

        if (existingProfile) {
          if (existingProfile.gender) {
            setGender(existingProfile.gender);
            setSavedGender(existingProfile.gender);
          }
          if (existingProfile.seeking) {
            setSeeking(existingProfile.seeking);
            setSavedSeeking(existingProfile.seeking);
          }
          if (existingProfile.dob) {
            setDob(existingProfile.dob);
            setSavedDob(existingProfile.dob);
          }
          if (existingProfile.height) {
            setHeight(existingProfile.height);
            setSavedHeight(existingProfile.height);
          }
          if (existingProfile.weight) {
            setWeight(existingProfile.weight);
            setSavedWeight(existingProfile.weight);
          }
          if (existingProfile.role_pref) setRolePref(existingProfile.role_pref);
          if (existingProfile.safety_pref) setSafetyPref(existingProfile.safety_pref);
          if (existingProfile.playstyle_pref) setPlaystylePref(existingProfile.playstyle_pref);
          if (existingProfile.where_pref) setWherePref(existingProfile.where_pref);
          if (existingProfile.how_many_pref) setHowManyPref(existingProfile.how_many_pref);
          if (existingProfile.non_man_mode) setNonManMode(existingProfile.non_man_mode);
        }

        const isFullySetup = existingProfile && existingProfile.gender && existingProfile.seeking && existingProfile.dob && existingProfile.height && existingProfile.weight;
        if (!isFullySetup) {
          setShowProfileSetup(true);
        }

        const isManSeekingMenProfile = (existingProfile?.gender === 'man' && existingProfile?.seeking === 'men');

        const myProfile: UserProfile = {
          id: userId,
          name: userName,
          username: userUsername,
          avatar: userAvatar,
          lat,
          lng,
          last_seen: new Date().toISOString(),
          gender: existingProfile?.gender || '',
          seeking: existingProfile?.seeking || 'women',
          dob: existingProfile?.dob || '',
          height: existingProfile?.height || '',
          weight: existingProfile?.weight || '',
          role_pref: existingProfile?.role_pref || 'Versatile',
          safety_pref: existingProfile?.safety_pref || 'Safe',
          playstyle_pref: existingProfile?.playstyle_pref || 'Clean',
          where_pref: existingProfile?.where_pref || 'Host',
          how_many_pref: existingProfile?.how_many_pref || '1on1',
          non_man_mode: isManSeekingMenProfile ? 'Meet up' : (existingProfile?.non_man_mode || 'Meet up'),
          is_underage: false,
        };

        setCurrentUser(myProfile);

        if (supabase) {
          await supabase.from('profiles').upsert([myProfile], { onConflict: 'id' });

          const { data, error } = await supabase.from('profiles').select('*');
          if (!error && data && Array.isArray(data)) {
            const processed = data.map((u: any) => ({
              id: u.id || 'unknown',
              name: u.name || 'User',
              username: u.username || '',
              avatar: u.avatar || '',
              lat: typeof u.lat === 'number' ? u.lat : lat,
              lng: typeof u.lng === 'number' ? u.lng : lng,
              last_seen: u.last_seen || new Date().toISOString(),
              gender: u.gender || '',
              seeking: u.seeking || 'women',
              dob: u.dob || '',
              height: u.height || '',
              weight: u.weight || '',
              role_pref: u.role_pref || '',
              safety_pref: u.safety_pref || '',
              playstyle_pref: u.playstyle_pref || '',
              where_pref: u.where_pref || '',
              how_many_pref: u.how_many_pref || '',
              non_man_mode: (u.gender === 'man' && u.seeking === 'men') ? 'Meet up' : (u.non_man_mode || 'Meet up'),
              is_underage: u.is_underage || false,
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
        console.error('Initialization error:', err);
      } finally {
        setIsReady(true);
      }
    };

    initApp();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!gender || !seeking || !dob || !height || !weight) {
      setErrorMessage('Please fill out all required fields above the dividing line.');
      return;
    }

    const isNonManSeekingMen = gender !== 'man' && seeking === 'men';
    if (isNonManSeekingMen && !nonManMode) {
      setErrorMessage('Please select a valid account mode preference.');
      return;
    }

    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 18) {
      if (currentUser && supabase) {
        const underageProfile = {
          ...currentUser,
          dob,
          is_underage: true,
        };
        await supabase.from('profiles').upsert([underageProfile], { onConflict: 'id' });
      }
      setIsUnderageLocked(true);
      return;
    }

    if (!currentUser || !supabase) return;

    const isManSeekingMen = gender === 'man' && seeking === 'men';

    const updatedProfile = {
      id: currentUser.id,
      name: currentUser.name,
      username: currentUser.username || '',
      avatar: currentUser.avatar || '',
      lat: currentUser.lat,
      lng: currentUser.lng,
      last_seen: new Date().toISOString(),
      gender,
      seeking,
      dob,
      height,
      weight,
      role_pref: isManSeekingMen ? rolePref : null,
      safety_pref: isManSeekingMen ? safetyPref : null,
      playstyle_pref: isManSeekingMen ? playstylePref : null,
      where_pref: isManSeekingMen ? wherePref : null,
      how_many_pref: isManSeekingMen ? howManyPref : null,
      non_man_mode: isManSeekingMen ? 'Meet up' : nonManMode,
      is_underage: false,
    };

    const { error } = await supabase.from('profiles').upsert([updatedProfile], { onConflict: 'id' });
    if (error) {
      console.error('Supabase save error:', error);
      setErrorMessage(`Error saving profile: ${error.message}`);
      return;
    }

    setCurrentUser(updatedProfile);
    setShowProfileSetup(false);
    window.location.reload();
  };

  const handleRefresh = async () => {
    if (!currentUser || !supabase) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (!error && data && Array.isArray(data)) {
        const processed = data.map((u: any) => ({
          id: u.id || 'unknown',
          name: u.name || 'User',
          username: u.username || '',
          avatar: u.avatar || '',
          lat: typeof u.lat === 'number' ? u.lat : location.lat,
          lng: typeof u.lng === 'number' ? u.lng : location.lng,
          last_seen: u.last_seen || new Date().toISOString(),
          gender: u.gender || '',
          seeking: u.seeking || 'women',
          dob: u.dob || '',
          height: u.height || '',
          weight: u.weight || '',
          role_pref: u.role_pref || '',
          safety_pref: u.safety_pref || '',
          playstyle_pref: u.playstyle_pref || '',
          where_pref: u.where_pref || '',
          how_many_pref: u.how_many_pref || '',
          non_man_mode: (u.gender === 'man' && u.seeking === 'men') ? 'Meet up' : (u.non_man_mode || 'Meet up'),
          is_underage: u.is_underage || false,
          distance: calculateDistance(location.lat, location.lng, u.lat || location.lat, u.lng || location.lng),
        })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
        setUsers(processed);
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    }
  };

  const checkMatchStatus = (me: UserProfile, target: UserProfile) => {
    if (me.id === target.id) return true;
    if (me.gender !== 'man' || me.seeking !== 'men') return true;

    if (target.seeking === 'man & women') return true;

    const myRole = me.role_pref;
    const targetRole = target.role_pref;
    let roleMatch = false;
    if (myRole === 'Versatile' || targetRole === 'Versatile') roleMatch = true;
    else if (myRole === 'Bottom' && targetRole === 'Top') roleMatch = true;
    else if (myRole === 'Top' && targetRole === 'Bottom') roleMatch = true;
    else if (myRole === 'Side' && targetRole === 'Side') roleMatch = true;

    const safetyMatch = me.safety_pref === target.safety_pref;
    const playstyleMatch = me.playstyle_pref === target.playstyle_pref;

    const myHowMany = me.how_many_pref;
    const targetHowMany = target.how_many_pref;
    let howManyMatch = false;
    if (myHowMany === '1on1' && targetHowMany === '1on1') howManyMatch = true;
    else if (myHowMany === 'Group' && (targetHowMany === 'Group' || targetHowMany === '1on1')) howManyMatch = true;
    else if (targetHowMany === 'Group' && myHowMany === '1on1') howManyMatch = true;

    return roleMatch && safetyMatch && playstyleMatch && howManyMatch;
  };

  const handleCardClick = (targetUser: UserProfile) => {
    setSelectedProfile(targetUser);
  };

  const handleStartChat = (targetUser: UserProfile) => {
    if (targetUser.username) {
      const chatUrl = `https://t.me/${targetUser.username}`;
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(chatUrl);
      } else {
        window.open(chatUrl, '_blank');
      }
    } else if (targetUser.id.startsWith('tg_')) {
      const rawTgId = targetUser.id.replace('tg_', '');
      const profileUrl = `https://t.me/user?id=${rawTgId}`;
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(profileUrl);
      } else {
        window.open(profileUrl, '_blank');
      }
    } else {
      alert(`Selected user: ${targetUser.name}`);
    }
    setSelectedProfile(null);
  };

  if (!isReady) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif' }}>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (isUnderageLocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ff4d4d', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', boxSizing: 'border-box' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Access Denied</h2>
        <p style={{ fontSize: '16px', color: '#ffffff', maxWidth: '360px', lineHeight: '1.5' }}>
          The app is for adults only. Access has been locked for this account due to age restrictions.
        </p>
      </div>
    );
  }

  if (showProfileSetup) {
    const isNonManSeekingMenForm = gender !== 'man' && seeking === 'men';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif', padding: '20px', boxSizing: 'border-box', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <h2 style={{ fontSize: '22px', marginBottom: '4px', color: '#007bff' }}>Complete Your Profile</h2>
        <p style={{ fontSize: '13px', color: '#ff4d4d', marginBottom: '16px', fontWeight: 'bold' }}>This cannot be modified later.</p>
        
        {errorMessage && (
          <div style={{ backgroundColor: 'rgba(255, 77, 77, 0.25)', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '10px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '420px', width: '100%', margin: '0 auto', paddingBottom: '40px' }}>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>I'm a:</label>
              <select 
                value={gender} 
                onChange={(e) => !savedGender && setGender(e.target.value)} 
                disabled={Boolean(savedGender)}
                style={{ padding: '12px', backgroundColor: savedGender ? '#1a1a1a' : '#222', color: savedGender ? '#888' : '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', WebkitAppearance: 'menulist', cursor: savedGender ? 'not-allowed' : 'pointer' }}
              >
                <option value="man">Man</option>
                <option value="woman">Woman</option>
              </select>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Seeking:</label>
              <select 
                value={seeking} 
                onChange={(e) => !savedSeeking && setSeeking(e.target.value)} 
                disabled={Boolean(savedSeeking)}
                style={{ padding: '12px', backgroundColor: savedSeeking ? '#1a1a1a' : '#222', color: savedSeeking ? '#888' : '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', WebkitAppearance: 'menulist', cursor: savedSeeking ? 'not-allowed' : 'pointer' }}
              >
                <option value="women">Women</option>
                <option value="men">Men</option>
                <option value="man & women">Men & Women</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Height:</label>
              <select 
                value={height} 
                onChange={(e) => !savedHeight && setHeight(e.target.value)} 
                disabled={Boolean(savedHeight)}
                style={{ padding: '12px', backgroundColor: savedHeight ? '#1a1a1a' : '#222', color: savedHeight ? '#888' : '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', WebkitAppearance: 'menulist', cursor: savedHeight ? 'not-allowed' : 'pointer' }}
              >
                {heightOptions.map((h, idx) => (
                  <option key={idx} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Weight:</label>
              <select 
                value={weight} 
                onChange={(e) => !savedWeight && setWeight(e.target.value)} 
                disabled={Boolean(savedWeight)}
                style={{ padding: '12px', backgroundColor: savedWeight ? '#1a1a1a' : '#222', color: savedWeight ? '#888' : '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', WebkitAppearance: 'menulist', cursor: savedWeight ? 'not-allowed' : 'pointer' }}
              >
                {weightOptions.map((w, idx) => (
                  <option key={idx} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Date of Birth:</label>
            <input 
              type="date" 
              value={dob} 
              onChange={(e) => !savedDob && setDob(e.target.value)} 
              disabled={Boolean(savedDob)}
              style={{ padding: '12px', backgroundColor: savedDob ? '#1a1a1a' : '#222', color: savedDob ? '#888' : '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', colorScheme: 'dark', cursor: savedDob ? 'not-allowed' : 'pointer' }} 
              required 
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #444', margin: '10px 0' }} />

          {gender === 'man' && seeking === 'men' && (
            <>
              <p style={{ fontSize: '13px', color: '#007bff', fontWeight: 'bold', margin: '0 0 4px 0' }}>Preferences (Man seeking Men):</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: '#aaa' }}>Role:</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['Top', 'Versatile', 'Bottom', 'Side'].map((opt) => (
                    <button type="button" key={opt} onClick={() => setRolePref(opt)} style={{ flex: 1, minWidth: '70px', padding: '8px', backgroundColor: rolePref === opt ? '#007bff' : '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: '#aaa' }}>Safety:</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['Raw', 'Safe'].map((opt) => (
                    <button type="button" key={opt} onClick={() => setSafetyPref(opt)} style={{ flex: 1, padding: '8px', backgroundColor: safetyPref === opt ? '#007bff' : '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: '#aaa' }}>Playstyle:</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['Clean', 'Party'].map((opt) => (
                    <button type="button" key={opt} onClick={() => setPlaystylePref(opt)} style={{ flex: 1, padding: '8px', backgroundColor: playstylePref === opt ? '#007bff' : '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: '#aaa' }}>Where?</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['Host', 'Travel'].map((opt) => (
                    <button type="button" key={opt} onClick={() => setWherePref(opt)} style={{ flex: 1, padding: '8px', backgroundColor: wherePref === opt ? '#007bff' : '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: '#aaa' }}>How many?</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['1on1', 'Group'].map((opt) => (
                    <button type="button" key={opt} onClick={() => setHowManyPref(opt)} style={{ flex: 1, padding: '8px', backgroundColor: howManyPref === opt ? '#007bff' : '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {isNonManSeekingMenForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Account Mode:</label>
              
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '6px', border: nonManMode === 'Just browsing' ? '1px solid #007bff' : '1px solid #333' }}>
                <input type="radio" name="nonManMode" value="Just browsing" checked={nonManMode === 'Just browsing'} onChange={(e) => setNonManMode(e.target.value)} style={{ marginTop: '2px' }} />
                <div>
                  <strong style={{ fontSize: '14px', display: 'block', color: '#fff' }}>Just browsing</strong>
                  <span style={{ fontSize: '12px', color: '#ff4d4d', display: 'block', marginTop: '2px' }}>You will not be able to interact with other users but view when on grid and map</span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '6px', border: nonManMode === 'Online interactions' ? '1px solid #007bff' : '1px solid #333' }}>
                <input type="radio" name="nonManMode" value="Online interactions" checked={nonManMode === 'Online interactions'} onChange={(e) => setNonManMode(e.target.value)} style={{ marginTop: '2px' }} />
                <div>
                  <strong style={{ fontSize: '14px', display: 'block', color: '#fff' }}>Online interactions</strong>
                  <span style={{ fontSize: '12px', color: '#ff4d4d', display: 'block', marginTop: '2px' }}>You are only visible on Grid not on map, your map will be disabled.</span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', backgroundColor: '#1a1a1a', padding: '10px', borderRadius: '6px', border: nonManMode === 'Meet up' ? '1px solid #007bff' : '1px solid #333' }}>
                <input type="radio" name="nonManMode" value="Meet up" checked={nonManMode === 'Meet up'} onChange={(e) => setNonManMode(e.target.value)} style={{ marginTop: '2px' }} />
                <div>
                  <strong style={{ fontSize: '14px', display: 'block', color: '#fff' }}>Meet up</strong>
                  <span style={{ fontSize: '12px', color: '#ff4d4d', display: 'block', marginTop: '2px' }}>You have full function of grid and map but others will be able to see your location too.</span>
                </div>
              </label>
            </div>
          )}

          <button type="submit" style={{ marginTop: '10px', padding: '14px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
            Save & Enter Grid
          </button>
        </form>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (currentUser && u.id === currentUser.id) return true;
    if (!currentUser?.gender || !currentUser?.seeking || !u.gender || !u.seeking) return false;

    const mySeeking = currentUser.seeking.toLowerCase();
    const theirGender = u.gender.toLowerCase();

    if (mySeeking === 'men' && theirGender !== 'man') return false;
    if (mySeeking === 'women' && theirGender !== 'woman') return false;
    if (mySeeking === 'man & women' && theirGender !== 'man' && theirGender !== 'woman') return false;

    return true;
  });

  const mapFilteredUsers = filteredUsers.filter((u) => {
    if (currentUser && u.id === currentUser.id) return true;
    if (u.non_man_mode === 'Online interactions') return false;
    return true;
  });

  const sortedGridUsers = currentUser 
    ? [
        { ...currentUser, distance: 0 }, 
        ...filteredUsers.filter(u => u.id !== currentUser.id)
      ]
    : filteredUsers;

  const isCurrentUserOnlineInteractions = currentUser?.gender !== 'man' && currentUser?.seeking === 'men' && currentUser?.non_man_mode === 'Online interactions';

  // Selected Profile Drawer logic checks
  const isSelectedSelf = selectedProfile && currentUser && selectedProfile.id === currentUser.id;
  const isSelectedEnabled = selectedProfile ? (isSelectedSelf || checkMatchStatus(currentUser!, selectedProfile)) : false;
  const isSelectedJustBrowsing = currentUser?.gender !== 'man' && currentUser?.seeking === 'men' && currentUser?.non_man_mode === 'Just browsing';
  const showSendMessageButton = selectedProfile && !isSelectedSelf && !isSelectedJustBrowsing && isSelectedEnabled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderBottom: '1px solid #333', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>Who's Nearby ({filteredUsers.length})</h1>
        </div>
        
        <button onClick={handleRefresh} style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
          </svg>
        </button>
      </header>

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ display: view === 'grid' ? 'block' : 'none', height: '100%', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', padding: '4px' }}>
            {sortedGridUsers.map((user, index) => {
              const isOnline = user.last_seen ? (new Date().getTime() - new Date(user.last_seen).getTime() < 15 * 60 * 1000) : false;
              const isSelf = currentUser && user.id === currentUser.id;
              const isEnabled = isSelf || checkMatchStatus(currentUser!, user);

              return (
                <div 
                  key={user.id || index} 
                  onClick={() => handleCardClick(user)}
                  style={{ position: 'relative', aspectRatio: '1/1', cursor: 'pointer', backgroundColor: '#222', overflow: 'hidden', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isEnabled ? 1 : 0.4, filter: isEnabled ? 'none' : 'grayscale(100%)' }}
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

                  {isOnline && isEnabled && (
                    <div style={{ position: 'absolute', top: '4px', right: '4px', width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%', border: '2px solid #121212' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {isCurrentUserOnlineInteractions ? (
          <div style={{ display: view === 'map' ? 'flex' : 'none', height: '100%', justifyContent: 'center', alignItems: 'center', color: '#888', textAlign: 'center', padding: '20px' }}>
            <p>Map is disabled in Online interactions mode.</p>
          </div>
        ) : (
          <div style={{ display: view === 'map' ? 'block' : 'none', height: '100%', width: '100%', position: 'relative', flex: 1 }}>
            <MapContainer 
              center={[location.lat, location.lng]} 
              zoom={15} 
              style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
              zoomControl={false}
            >
              <MapController center={[location.lat, location.lng]} />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              {mapFilteredUsers.map((user) => {
                const isSelf = currentUser && user.id === currentUser.id;
                const isEnabled = isSelf || checkMatchStatus(currentUser!, user);
                return (
                  <Marker 
                    key={user.id} 
                    position={[user.lat, user.lng]} 
                    icon={createProfileIcon(user, isEnabled, Boolean(isSelf))}
                    eventHandlers={{
                      click: () => handleCardClick(user),
                    }}
                  />
                );
              })}
            </MapContainer>
          </div>
        )}

      </main>

      {/* --- TELEGRAM BOTTOM SHEET PROFILE DRAWER --- */}
      {selectedProfile && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => setSelectedProfile(null)}>
          <div style={{ backgroundColor: '#1e1e1e', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '24px 20px 40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%', boxSizing: 'border-box', animation: 'slideUp 0.3s ease-out' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ width: '40px', height: '4px', backgroundColor: '#444', borderRadius: '2px', marginBottom: '4px' }} />

            <div style={{ width: '90px', height: '90px', borderRadius: '50%</i>', overflow: 'hidden', backgroundColor: '#333', border: '3px solid #007bff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selectedProfile.avatar ? (
                <img src={selectedProfile.avatar} alt={selectedProfile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{selectedProfile.name ? selectedProfile.name.charAt(0).toUpperCase() : 'U'}</span>
              )}
            </div>

            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '20px', margin: '0 0 4px 0', fontWeight: 'bold' }}>
                {selectedProfile.name} {calculateAge(selectedProfile.dob) ? `, ${calculateAge(selectedProfile.dob)}` : ''}
              </h3>
              <p style={{ fontSize: '13px', color: '#aaa', margin: 0 }}>
                {selectedProfile.id === currentUser?.id ? 'Your Profile' : `${selectedProfile.distance ?? 0}m away`}
              </p>
            </div>

            {currentUser?.gender === 'man' && currentUser?.seeking === 'men' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', backgroundColor: '#262626', padding: '10px', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}>
                <span style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#333', borderRadius: '4px' }}>Role: {selectedProfile.role_pref || 'N/A'}</span>
                <span style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#333', borderRadius: '4px' }}>Safety: {selectedProfile.safety_pref || 'N/A'}</span>
                <span style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#333', borderRadius: '4px' }}>Play: {selectedProfile.playstyle_pref || 'N/A'}</span>
                <span style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#333', borderRadius: '4px' }}>Where: {selectedProfile.where_pref || 'N/A'}</span>
                <span style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#333', borderRadius: '4px' }}>Qty: {selectedProfile.how_many_pref || 'N/A'}</span>
              </div>
            )}

            {showSendMessageButton && (
              <button 
                onClick={() => handleStartChat(selectedProfile)}
                style={{ width: '100%', padding: '14px', backgroundColor: '#0088cc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '6px' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                Send Message
              </button>
            )}

          </div>
        </div>
      )}

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
        
        {!isCurrentUserOnlineInteractions && (
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
        )}
      </footer>
    </div>
  );
}
