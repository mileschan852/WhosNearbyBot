import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';

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
  hide_age?: boolean;
  grid_visible?: boolean;
  map_visible?: boolean;
  distance?: number;
}

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

const getZodiacSignEmoji = (dobString?: string) => {
  if (!dobString) return '';
  try {
    const date = new Date(dobString);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '♈';
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '♉';
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return '♊';
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return '♋';
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '♌';
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '♍';
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return '♎';
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return '♏';
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return '♐';
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '♑';
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '♒';
    return '♓';
  } catch {
    return '';
  }
};

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

  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);

  const [dob, setDob] = useState<string>('1995-01-01');
  const [height, setHeight] = useState<string>('1.7m (5ft 7in)');
  const [weight, setWeight] = useState<string>('70kg (154lbs)');
  const [hideAge, setHideAge] = useState<boolean>(false);

  const roleOptions = ['Top', 'Versatile', 'Bottom', 'Side'];
  const safetyOptions = ['Safe', 'Raw'];
  const playstyleOptions = ['Clean', 'Party'];
  const whereOptions = ['Host', 'Travel'];
  const howManyOptions = ['1on1', 'Group'];

  const [rolePref, setRolePref] = useState<string>('Versatile');
  const [safetyPref, setSafetyPref] = useState<string>('Safe');
  const [playstylePref, setPlaystylePref] = useState<string>('Clean');
  const [wherePref, setWherePref] = useState<string>('Host');
  const [howManyPref, setHowManyPref] = useState<string>('1on1');

  const [gridVisible, setGridVisible] = useState<boolean>(true);
  const [mapVisible, setMapVisible] = useState<boolean>(false);

  const heightOptions = [];
  for (let i = 10; i <= 30; i++) {
    const m = (i / 10).toFixed(1);
    const cm = i * 10;
    const totalInches = Math.round(cm / 2.54);
    const ft = Math.floor(totalInches / 12);
    const inch = totalInches % 12;
    heightOptions.push(`${m}m (${ft}ft ${inch}in)`);
  }

  const weightOptions = [];
  for (let kg = 35; kg <= 160; kg += 1) {
    const lbs = Math.round(kg * 2.20462);
    weightOptions.push(`${kg}kg (${lbs}lbs)`);
  }

  const fetchUsersData = async (lat: number, lng: number, currentUserId: string) => {
    if (!supabase) return;
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
        gender: u.gender || 'man',
        seeking: u.seeking || 'men',
        dob: u.dob || '',
        height: u.height || '',
        weight: u.weight || '',
        role_pref: u.role_pref || '',
        safety_pref: u.safety_pref || '',
        playstyle_pref: u.playstyle_pref || '',
        where_pref: u.where_pref || '',
        how_many_pref: u.how_many_pref || '',
        non_man_mode: u.non_man_mode || 'Meet up',
        is_underage: u.is_underage || false,
        hide_age: u.hide_age || false,
        grid_visible: u.grid_visible ?? true,
        map_visible: u.map_visible ?? false,
        distance: calculateDistance(lat, lng, u.lat || lat, u.lng || lng),
      })).filter((u) => u.id === currentUserId || u.grid_visible !== false)
        .sort((a, b) => (a.distance || 0) - (b.distance || 0));
      
      setUsers(processed);
    }
  };

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
          if (existingProfile.dob) setDob(existingProfile.dob);
          if (existingProfile.height) setHeight(existingProfile.height);
          if (existingProfile.weight) setWeight(existingProfile.weight);
          if (existingProfile.role_pref) setRolePref(existingProfile.role_pref);
          if (existingProfile.safety_pref) setSafetyPref(existingProfile.safety_pref);
          if (existingProfile.playstyle_pref) setPlaystylePref(existingProfile.playstyle_pref);
          if (existingProfile.where_pref) setWherePref(existingProfile.where_pref);
          if (existingProfile.how_many_pref) setHowManyPref(existingProfile.how_many_pref);
          if (typeof existingProfile.hide_age === 'boolean') setHideAge(existingProfile.hide_age);
          if (typeof existingProfile.grid_visible === 'boolean') setGridVisible(existingProfile.grid_visible);
          if (typeof existingProfile.map_visible === 'boolean') setMapVisible(existingProfile.map_visible);
        }

        const isFullySetup = existingProfile && existingProfile.dob && existingProfile.height && existingProfile.weight;
        if (!isFullySetup) {
          setShowProfileSetup(true);
        }

        const myProfile: UserProfile = {
          id: userId,
          name: userName,
          username: userUsername,
          avatar: userAvatar,
          lat,
          lng,
          last_seen: new Date().toISOString(),
          gender: 'man',
          seeking: 'men',
          dob: existingProfile?.dob || '',
          height: existingProfile?.height || '',
          weight: existingProfile?.weight || '',
          role_pref: existingProfile?.role_pref || 'Versatile',
          safety_pref: existingProfile?.safety_pref || 'Safe',
          playstyle_pref: existingProfile?.playstyle_pref || 'Clean',
          where_pref: existingProfile?.where_pref || 'Host',
          how_many_pref: existingProfile?.how_many_pref || '1on1',
          is_underage: false,
          hide_age: existingProfile?.hide_age || false,
          grid_visible: existingProfile?.grid_visible ?? true,
          map_visible: existingProfile?.map_visible ?? false,
        };

        setCurrentUser(myProfile);

        if (supabase) {
          await supabase.from('profiles').upsert([myProfile], { onConflict: 'id' });
          await fetchUsersData(lat, lng, userId);
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

  const handleRefresh = async () => {
    if (!currentUser || !supabase) return;
    const lastRefreshKey = `last_refresh_${currentUser.id}`;
    const lastRefreshTime = Number(localStorage.getItem(lastRefreshKey) || 0);
    const now = Date.now();

    if (now - lastRefreshTime < 5 * 60 * 1000) {
      return;
    }

    localStorage.setItem(lastRefreshKey, now.toString());
    await fetchUsersData(location.lat, location.lng, currentUser.id);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!dob || !height || !weight) {
      setErrorMessage('Please fill out all required fields.');
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

    const updatedProfile = {
      ...currentUser,
      last_seen: new Date().toISOString(),
      dob,
      height,
      weight,
      role_pref: rolePref,
      safety_pref: safetyPref,
      playstyle_pref: playstylePref,
      where_pref: wherePref,
      how_many_pref: howManyPref,
      hide_age: hideAge,
      grid_visible: gridVisible,
      map_visible: mapVisible,
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

  const handleToggleGrid = async () => {
    if (!currentUser || !supabase) return;
    const nextVal = !gridVisible;
    setGridVisible(nextVal);
    const updated = { ...currentUser, grid_visible: nextVal };
    setCurrentUser(updated);
    await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
    await fetchUsersData(location.lat, location.lng, currentUser.id);
  };

  const handleToggleMap = async () => {
    if (!currentUser || !supabase) return;
    const nextVal = !mapVisible;
    setMapVisible(nextVal);
    const updated = { ...currentUser, map_visible: nextVal };
    setCurrentUser(updated);
    await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
    
    if (nextVal) {
      setView('map');
    } else if (view === 'map') {
      setView('grid');
    }
    
    await fetchUsersData(location.lat, location.lng, currentUser.id);
  };

  const handleQuickWhereUpdate = async (val: string) => {
    if (!currentUser || !supabase) return;
    setWherePref(val);
    const updated = { ...currentUser, where_pref: val };
    setCurrentUser(updated);
    await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
  };

  const checkMatchStatus = (me: UserProfile, target: UserProfile) => {
    if (me.id === target.id) return true;
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

  const cycleOption = (current: string, options: string[], setter: (val: string) => void) => {
    const idx = options.indexOf(current);
    const nextIdx = (idx + 1) % options.length;
    setter(options[nextIdx]);
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

  const isViewingSelf = selectedProfile ? (currentUser && selectedProfile.id === currentUser.id) : showProfileSetup;
  const activeProfile = isViewingSelf ? currentUser : selectedProfile;
  
  const targetDob = activeProfile?.dob || dob;
  const targetHeight = activeProfile?.height || height;
  const targetWeight = activeProfile?.weight || weight;
  const targetHideAge = activeProfile?.hide_age ?? hideAge;
  
  const targetRole = activeProfile?.role_pref || rolePref;
  const targetSafety = activeProfile?.safety_pref || safetyPref;
  const targetPlaystyle = activeProfile?.playstyle_pref || playstylePref;
  const targetWhere = activeProfile?.where_pref || wherePref;
  const targetHowMany = activeProfile?.how_many_pref || howManyPref;

  const isOtherMatched = selectedProfile && currentUser ? checkMatchStatus(currentUser, selectedProfile) : false;
  const showSendMessage = selectedProfile && !isViewingSelf && isOtherMatched;

  const gridFilteredUsers = users.filter((u) => u.id === currentUser?.id || u.grid_visible !== false);
  const mapFilteredUsers = users.filter((u) => (u.id === currentUser?.id ? mapVisible : (u.map_visible === true && u.grid_visible !== false)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderBottom: '1px solid #333', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>Who's Nearby ({gridFilteredUsers.length})</h1>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={handleRefresh} style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
          </button>
        </div>
      </header>

      {/* MAIN VIEW */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ display: view === 'grid' ? 'block' : 'none', height: '100%', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', padding: '4px' }}>
            {gridFilteredUsers.map((user, index) => {
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

      </main>

      {/* PROFILE SETUP / VIEW MODAL */}
      {(showProfileSetup || selectedProfile) && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => { setShowProfileSetup(false); setSelectedProfile(null); }}>
          <div style={{ backgroundColor: '#1e1e1e', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '24px 20px 40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ width: '40px', height: '4px', backgroundColor: '#444', borderRadius: '2px', marginBottom: '16px' }} />

            <h2 style={{ fontSize: '20px', marginBottom: '4px', color: '#007bff', textAlign: 'center' }}>
              {isViewingSelf ? 'Complete Your Profile' : `${activeProfile?.name || 'User'}'s Profile`}
            </h2>
            <p style={{ fontSize: '13px', color: '#888', marginBottom: '16px', fontWeight: 'bold', textAlign: 'center' }}>
              {isViewingSelf 
                ? 'Update your personal details below' 
                : `${!targetHideAge && calculateAge(targetDob) ? `${calculateAge(targetDob)}yo ` : ''}${getZodiacSignEmoji(targetDob)} • ${selectedProfile?.distance ?? 0}m away`
              }
            </p>
            
            {errorMessage && (
              <div style={{ backgroundColor: 'rgba(255, 77, 77, 0.25)', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '10px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px', width: '100%', maxWidth: '420px', boxSizing: 'border-box' }}>
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '420px', width: '100%', margin: '0 auto' }}>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Height:</label>
                  <select 
                    value={isViewingSelf ? height : targetHeight} 
                    onChange={(e) => isViewingSelf && setHeight(e.target.value)} 
                    disabled={!isViewingSelf}
                    style={{ padding: '12px', backgroundColor: !isViewingSelf ? '#1a1a1a' : '#222', color: !isViewingSelf ? '#888' : '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', WebkitAppearance: 'menulist', cursor: !isViewingSelf ? 'not-allowed' : 'pointer' }}
                  >
                    {heightOptions.map((h, idx) => (
                      <option key={idx} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Weight:</label>
                  <select 
                    value={isViewingSelf ? weight : targetWeight} 
                    onChange={(e) => isViewingSelf && setWeight(e.target.value)} 
                    disabled={!isViewingSelf}
                    style={{ padding: '12px', backgroundColor: !isViewingSelf ? '#1a1a1a' : '#222', color: !isViewingSelf ? '#888' : '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', WebkitAppearance: 'menulist', cursor: !isViewingSelf ? 'not-allowed' : 'pointer' }}
                  >
                    {weightOptions.map((w, idx) => (
                      <option key={idx} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
              </div>

              {isViewingSelf && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Date of Birth:</label>
                    <input 
                      type="date" 
                      value={dob} 
                      onChange={(e) => setDob(e.target.value)} 
                      style={{ padding: '12px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', colorScheme: 'dark', cursor: 'pointer' }} 
                      required 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '130px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Age Display:</label>
                    <select
                      value={hideAge ? 'hide' : 'show'}
                      onChange={(e) => setHideAge(e.target.value === 'hide')}
                      style={{ padding: '12px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}
                    >
                      <option value="show">Show Age</option>
                      <option value="hide">Hide Age</option>
                    </select>
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid #444', margin: '10px 0' }} />

              <p style={{ fontSize: '13px', color: '#007bff', fontWeight: 'bold', margin: '0 0 6px 0' }}>Preference:</p>

              <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                <button type="button" onClick={() => isViewingSelf && cycleOption(rolePref, roleOptions, setRolePref)} disabled={!isViewingSelf} style={{ flex: 1, padding: '10px 4px', backgroundColor: '#e11d48', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: isViewingSelf ? 'pointer' : 'not-allowed', textAlign: 'center', opacity: isViewingSelf ? 1 : 0.7 }}>
                  {isViewingSelf ? rolePref : targetRole}
                </button>
                <button type="button" onClick={() => isViewingSelf && cycleOption(safetyPref, safetyOptions, setSafetyPref)} disabled={!isViewingSelf} style={{ flex: 1, padding: '10px 4px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: isViewingSelf ? 'pointer' : 'not-allowed', textAlign: 'center', opacity: isViewingSelf ? 1 : 0.7 }}>
                  {isViewingSelf ? safetyPref : targetSafety}
                </button>
                <button type="button" onClick={() => isViewingSelf && cycleOption(playstylePref, playstyleOptions, setPlaystylePref)} disabled={!isViewingSelf} style={{ flex: 1, padding: '10px 4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: isViewingSelf ? 'pointer' : 'not-allowed', textAlign: 'center', opacity: isViewingSelf ? 1 : 0.7 }}>
                  {isViewingSelf ? playstylePref : targetPlaystyle}
                </button>
                <button type="button" onClick={() => isViewingSelf && cycleOption(howManyPref, howManyOptions, setHowManyPref)} disabled={!isViewingSelf} style={{ flex: 1, padding: '10px 4px', backgroundColor: '#9333ea', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: isViewingSelf ? 'pointer' : 'not-allowed', textAlign: 'center', opacity: isViewingSelf ? 1 : 0.7 }}>
                  {isViewingSelf ? howManyPref : targetHowMany}
                </button>
                <button type="button" onClick={() => cycleOption(isViewingSelf ? wherePref : targetWhere, whereOptions, (val) => isViewingSelf ? setWherePref(val) : handleQuickWhereUpdate(val))} style={{ flex: 1, padding: '10px 4px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>
                  {isViewingSelf ? wherePref : targetWhere}
                </button>
              </div>

              {isViewingSelf ? (
                <button type="submit" style={{ marginTop: '10px', padding: '14px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Save Profile
                </button>
              ) : (
                showSendMessage ? (
                  <button 
                    type="button" 
                    onClick={() => handleStartChat(selectedProfile!)}
                    style={{ marginTop: '10px', padding: '14px', backgroundColor: '#0088cc', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                    Send Message
                  </button>
                ) : (
                  <div style={{ marginTop: '10px', padding: '14px', backgroundColor: '#2a2a2a', color: '#888', border: '1px solid #444', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', textAlign: 'center' }}>
                    Not Preference Matched
                  </div>
                )
              )}
            </form>
          </div>
        </div>
      )}

      {/* FOOTER NAVIGATION WITH ON/OFF STATUS LIGHTS */}
      <footer style={{ display: 'flex', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderTop: '1px solid #333', zIndex: 10 }}>
        
        {/* GRID TAB */}
        <button 
          onClick={() => {
            setView('grid');
            handleToggleGrid();
          }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: view === 'grid' ? '#007bff' : '#888', cursor: 'pointer', position: 'relative' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span style={{ fontSize: '12px', marginTop: '4px' }}>Grid</span>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: '50%', height: '3px', backgroundColor: gridVisible ? '#4ade80' : '#ff4d4d' }} />
        </button>
        
        {/* MAP TAB */}
        <button 
          onClick={() => {
            if (!mapVisible) {
              handleToggleMap();
            } else {
              setView(view === 'map' ? 'grid' : 'map');
            }
          }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: view === 'map' ? '#007bff' : '#888', cursor: 'pointer', position: 'relative' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
          <span style={{ fontSize: '12px', marginTop: '4px' }}>Map</span>
          <div style={{ position: 'absolute', bottom: 0, left: '50%', right: 0, height: '3px', backgroundColor: mapVisible ? '#4ade80' : '#ff4d4d' }} />
        </button>

      </footer>
    </div>
  );
}
