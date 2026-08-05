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
          start_param?: string;
        };
        ready?: () => void;
        expand?: () => void;
        openTelegramLink?: (url: string) => void;
        showAlert?: (message: string) => void;
        openInvoice?: (url: string, callback?: (status: string) => void) => void;
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
  lat: number | null;
  lng: number | null;
  last_seen: string | null;
  gender?: string | null;
  seeking?: string | null;
  dob?: string | null;
  height?: string | null;
  weight?: string | null;
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
  hide_age_expiry?: string | null;
  invisible_expiry?: string | null;
  filter_sub_expiry?: string | null;
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

const formatDistanceBigUnit = (meters?: number) => {
  if (meters === undefined || meters === null) return '0m';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${meters}m`;
};

const calculateAge = (dobString?: string | null) => {
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

const getZodiacSignEmoji = (dobString?: string | null) => {
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

const formatLastSeenBigUnit = (isoString?: string | null) => {
  if (!isoString) return 'Offline';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Online';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return 'Offline';
  }
};

const hasValidSub = (expiry?: string | null) => {
  if (!expiry) return false;
  return new Date(expiry).getTime() > Date.now();
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
  const [isLocationDenied, setIsLocationDenied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showFilterMenu, setShowFilterMenu] = useState<boolean>(false);

  // Filter Active States & Criteria
  const [filterAgeEnabled, setFilterAgeEnabled] = useState<boolean>(false);
  const [minAge, setMinAge] = useState<number>(18);
  const [maxAge, setMaxAge] = useState<number>(80);

  const [filterRoleEnabled, setFilterRoleEnabled] = useState<boolean>(false);
  const [filterRole, setFilterRole] = useState<string>('Bottom');

  const [filterSafetyEnabled, setFilterSafetyEnabled] = useState<boolean>(false);
  const [filterSafety, setFilterSafety] = useState<string>('Raw');

  const [filterPlaystyleEnabled, setFilterPlaystyleEnabled] = useState<boolean>(false);
  const [filterPlaystyle, setFilterPlaystyle] = useState<string>('Party');

  const [filterHowManyEnabled, setFilterHowManyEnabled] = useState<boolean>(false);
  const [filterHowMany, setFilterHowMany] = useState<string>('1on1');

  const [filterWhereEnabled, setFilterWhereEnabled] = useState<boolean>(false);
  const [filterWhere, setFilterWhere] = useState<string>('Travel');

  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);

  // Form input states
  const [dob, setDob] = useState<string>('');
  const [gender, setGender] = useState<string>('man');
  const [seeking, setSeeking] = useState<string>('men');
  const [height, setHeight] = useState<string>('1.8m (5ft 11in)');
  const [weight, setWeight] = useState<string>('74kg (163lbs)');
  
  // Preferences Tags
  const [rolePref, setRolePref] = useState<string>('Bottom');
  const [safetyPref, setSafetyPref] = useState<string>('Raw');
  const [playstylePref, setPlaystylePref] = useState<string>('Party');
  const [howManyPref, setHowManyPref] = useState<string>('1on1');
  const [wherePref, setWherePref] = useState<string>('Travel');

  const [nonManMode, setNonManMode] = useState<string>('Meet up - You are visible on grid and map');
  
  const [hideAge, setHideAge] = useState<boolean>(false);
  const [hideAgeExpiry, setHideAgeExpiry] = useState<string | null>(null);
  const [invisibleExpiry, setInvisibleExpiry] = useState<string | null>(null);
  const [filterSubExpiry, setFilterSubExpiry] = useState<string | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const isGayMode = window.Telegram?.WebApp?.initDataUnsafe?.start_param === 'gaymode' || urlParams.get('mode') === 'gay' || urlParams.get('startapp') === 'gaymode';

  const PAYMENT_WORKER_URL = import.meta.env.VITE_PAYMENT_WORKER_URL || 'https://teleclaw-dispatch.silent-flower-a7c2.workers.dev/287f310dcfbf';

  const [gridVisible, setGridVisible] = useState<boolean>(true);
  const [mapVisible, setMapVisible] = useState<boolean>(false);

  const roleCycleOptions = ['Versatile', 'Top', 'Bottom', 'Side'];
  const safetyCycleOptions = ['Safe', 'Raw'];
  const playstyleSetupCycleOptions = ['Clean', 'Party'];
  const playstyleGridCycleOptions = ['Clean', 'Party', 'Party✓'];
  const howManyCycleOptions = ['1on1', 'Group'];
  const whereCycleOptions = ['Host', 'Travel'];

  const cycleNext = (current: string, options: string[]) => {
    const idx = options.indexOf(current);
    if (idx === -1 || idx === options.length - 1) return options[0];
    return options[idx + 1];
  };

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

  const createInvoiceLink = async (userId: string, type: string): Promise<string | null> => {
    try {
      const res = await fetch(`${PAYMENT_WORKER_URL}/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.invoiceLink || null;
    } catch {
      return null;
    }
  };

  const handleUpdateSelfField = async (fields: Partial<UserProfile>) => {
    if (!currentUser || !supabase) return;
    const updated = { ...currentUser, ...fields };
    setCurrentUser(updated);
    await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
  };

  const handlePurchase = async (itemType: 'hide_age' | 'invisible' | 'filter') => {
    if (!currentUser || !supabase) return;

    if (isAdmin) {
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 30);
      const expiryStr = newExpiry.toISOString();
      
      const updateField: Partial<UserProfile> = {};
      if (itemType === 'hide_age') {
        updateField.hide_age_expiry = expiryStr;
        setHideAgeExpiry(expiryStr);
      }
      if (itemType === 'invisible') {
        updateField.invisible_expiry = expiryStr;
        setInvisibleExpiry(expiryStr);
      }
      if (itemType === 'filter') {
        updateField.filter_sub_expiry = expiryStr;
        setFilterSubExpiry(expiryStr);
      }

      await handleUpdateSelfField(updateField);
      
      const msg = `Admin Bypass: ${itemType} unlocked for 30 days!`;
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(msg);
      } else {
        alert(msg);
      }
      return; 
    }

    const invoiceLink = await createInvoiceLink(currentUser.id, itemType);
    if (invoiceLink && window.Telegram?.WebApp?.openInvoice) {
      window.Telegram.WebApp.openInvoice(invoiceLink, async (status) => {
        if (status === 'paid') {
          if (window.Telegram?.WebApp?.showAlert) {
            window.Telegram.WebApp.showAlert('Payment successful! Your feature is now active.');
          }
          await handleRefresh();
        } else if (status === 'cancelled') {
          console.log('Payment cancelled by user.');
        } else {
          setErrorMessage('Payment failed or pending.');
        }
      });
    } else {
      setErrorMessage('Payment system is currently unavailable.');
    }
  };

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
        gender: u.gender || null,
        seeking: u.seeking || null,
        dob: u.dob || null,
        height: u.height || null,
        weight: u.weight || null,
        role_pref: u.role_pref || null,
        safety_pref: u.safety_pref || null,
        playstyle_pref: u.playstyle_pref || null,
        where_pref: u.where_pref || null,
        how_many_pref: u.how_many_pref || null,
        non_man_mode: u.non_man_mode || null,
        is_underage: u.is_underage || false,
        hide_age: u.hide_age || false,
        grid_visible: u.grid_visible ?? true,
        map_visible: u.map_visible ?? false,
        distance: calculateDistance(lat, lng, u.lat || lat, u.lng || lng),
        hide_age_expiry: u.hide_age_expiry || null,
        invisible_expiry: u.invisible_expiry || null,
        filter_sub_expiry: u.filter_sub_expiry || null,
      })).filter((u) => u.id === currentUserId || u.grid_visible !== false)
        .filter((u) => !isGayMode || u.id === currentUserId || (u.gender === 'man' && u.seeking === 'men'))
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

        const username = tgUser?.username || '';
        const userIsAdmin = username === 'mileschan852' || username === 'HKMembersOnly';
        setIsAdmin(userIsAdmin);

        const savedUserId = localStorage.getItem('whos_nearby_user_id');
        const userId = tgUser?.id ? `tg_${tgUser.id}` : (savedUserId || 'user_' + Math.random().toString(36).substring(2, 9));
        if (!tgUser?.id && !savedUserId) {
          localStorage.setItem('whos_nearby_user_id', userId);
        }

        const userName = tgUser?.first_name || (tgUser?.id ? `User ${tgUser.id}` : 'Test User');
        const userUsername = tgUser?.username || '';
        const userAvatar = tgUser?.photo_url || '';

        if (!navigator.geolocation) {
          setIsLocationDenied(true);
          setIsReady(true);
          return;
        }

        const hasLocation = await new Promise<boolean>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              resolve(true);
            },
            () => resolve(false),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });

        if (!hasLocation) {
          setIsLocationDenied(true);
          setIsReady(true);
          return;
        }

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

        const isManSeekingMan = existingProfile?.gender === 'man' && existingProfile?.seeking === 'men';
        const isFullySetup = existingProfile && 
          existingProfile.dob && 
          existingProfile.gender && 
          existingProfile.seeking && 
          existingProfile.height && 
          existingProfile.weight && 
          (!isManSeekingMan || (existingProfile.role_pref && existingProfile.safety_pref && existingProfile.playstyle_pref && existingProfile.how_many_pref && existingProfile.where_pref)) &&
          (isManSeekingMan || existingProfile.non_man_mode);

        if (existingProfile) {
          if (existingProfile.dob) setDob(existingProfile.dob);
          if (existingProfile.gender) setGender(existingProfile.gender);
          if (existingProfile.seeking) setSeeking(existingProfile.seeking);
          if (existingProfile.height) setHeight(existingProfile.height);
          if (existingProfile.weight) setWeight(existingProfile.weight);
          if (existingProfile.role_pref) {
            setRolePref(existingProfile.role_pref);
            setFilterRole(existingProfile.role_pref);
          }
          if (existingProfile.safety_pref) {
            setSafetyPref(existingProfile.safety_pref);
            setFilterSafety(existingProfile.safety_pref);
          }
          if (existingProfile.playstyle_pref) {
            setPlaystylePref(existingProfile.playstyle_pref);
            setFilterPlaystyle(existingProfile.playstyle_pref);
          }
          if (existingProfile.how_many_pref) {
            setHowManyPref(existingProfile.how_many_pref);
            setFilterHowMany(existingProfile.how_many_pref);
          }
          if (existingProfile.where_pref) {
            setWherePref(existingProfile.where_pref);
            setFilterWhere(existingProfile.where_pref);
          }
          if (existingProfile.non_man_mode) setNonManMode(existingProfile.non_man_mode);

          if (isGayMode) {
            setGender('man');
            setSeeking('men');
          }

          if (typeof existingProfile.hide_age === 'boolean') setHideAge(existingProfile.hide_age);
          if (existingProfile.hide_age_expiry) setHideAgeExpiry(existingProfile.hide_age_expiry);
          if (existingProfile.invisible_expiry) setInvisibleExpiry(existingProfile.invisible_expiry);
          if (existingProfile.filter_sub_expiry) setFilterSubExpiry(existingProfile.filter_sub_expiry);
          if (typeof existingProfile.grid_visible === 'boolean') setGridVisible(existingProfile.grid_visible);
          if (typeof existingProfile.map_visible === 'boolean') setMapVisible(existingProfile.map_visible);
        }

        if (!isFullySetup) {
          setShowProfileSetup(true);
          const blankProfile: UserProfile = {
            id: userId,
            name: userName,
            username: userUsername,
            avatar: userAvatar,
            lat: null,
            lng: null,
            last_seen: null,
            gender: null,
            seeking: null,
            dob: null,
            height: null,
            weight: null,
            role_pref: null,
            safety_pref: null,
            playstyle_pref: null,
            where_pref: null,
            how_many_pref: null,
            non_man_mode: null,
            is_underage: false,
            hide_age: false,
            grid_visible: true,
            map_visible: false,
            hide_age_expiry: null,
            invisible_expiry: null,
            filter_sub_expiry: null,
          };
          setCurrentUser(blankProfile);
        } else {
          const myProfile: UserProfile = {
            id: userId,
            name: userName,
            username: userUsername,
            avatar: userAvatar,
            lat: location.lat,
            lng: location.lng,
            last_seen: new Date().toISOString(),
            gender: existingProfile.gender,
            seeking: existingProfile.seeking,
            dob: existingProfile.dob,
            height: existingProfile.height,
            weight: existingProfile.weight,
            role_pref: isManSeekingMan ? existingProfile.role_pref : null,
            safety_pref: isManSeekingMan ? existingProfile.safety_pref : null,
            playstyle_pref: isManSeekingMan ? existingProfile.playstyle_pref : null,
            where_pref: isManSeekingMan ? existingProfile.where_pref : null,
            how_many_pref: isManSeekingMan ? existingProfile.how_many_pref : null,
            non_man_mode: isManSeekingMan ? null : existingProfile.non_man_mode,
            is_underage: false,
            hide_age: existingProfile.hide_age || false,
            grid_visible: existingProfile.grid_visible ?? true,
            map_visible: existingProfile.map_visible ?? false,
            hide_age_expiry: existingProfile.hide_age_expiry || null,
            invisible_expiry: existingProfile.invisible_expiry || null,
            filter_sub_expiry: existingProfile.filter_sub_expiry || null,
          };
          setCurrentUser(myProfile);
          if (supabase) {
            await fetchUsersData(location.lat, location.lng, userId);
          }
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

  const handleSaveInitialProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!supabase) {
      setErrorMessage('Error saving profile: TypeError: Failed to fetch (Database connection missing or blocked).');
      return;
    }

    if (!dob || !height || !weight || !gender || !seeking) {
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
      if (currentUser) {
        const underageProfile = { 
          ...currentUser, 
          dob, 
          gender,
          seeking,
          is_underage: true 
        };
        await supabase.from('profiles').upsert([underageProfile], { onConflict: 'id' });
      }
      setIsUnderageLocked(true);
      return;
    }

    try {
      const updatedProfile = {
        ...currentUser,
        id: currentUser?.id || 'unknown',
        name: currentUser?.name || 'User',
        avatar: currentUser?.avatar || '',
        lat: location.lat,
        lng: location.lng,
        last_seen: new Date().toISOString(),
        dob,
        height,
        weight,
        gender,
        seeking,
        role_pref: rolePref,
        safety_pref: safetyPref,
        playstyle_pref: playstylePref,
        where_pref: wherePref,
        how_many_pref: howManyPref,
        non_man_mode: nonManMode,
        hide_age: hideAge,
        is_underage: false,
      };

      const { error } = await supabase.from('profiles').upsert([updatedProfile], { onConflict: 'id' });
      
      if (error) {
        setErrorMessage(`Supabase Error: ${error.message}`);
        return;
      }

      setFilterRole(rolePref);
      setFilterSafety(safetyPref);
      setFilterPlaystyle(playstylePref);
      setFilterHowMany(howManyPref);
      setFilterWhere(wherePref);

      setCurrentUser(updatedProfile);
      setShowProfileSetup(false);
      window.location.reload();
    } catch (err: any) {
      console.error('Fetch error:', err);
      setErrorMessage(`Error saving profile: TypeError: Failed to fetch`);
    }
  };

  const handleToggleGrid = async () => {
    if (!currentUser || !supabase) return;
    
    if (gridVisible && !hasValidSub(invisibleExpiry)) {
      await handlePurchase('invisible');
      return;
    }

    const nextVal = !gridVisible;
    setGridVisible(nextVal);
    const updated = { ...currentUser, grid_visible: nextVal };
    setCurrentUser(updated);
    await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
    setView('grid');
    await handleRefresh();
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
    } else {
      setView('grid');
    }
    
    await fetchUsersData(location.lat, location.lng, currentUser.id);
  };

  const checkMatchStatus = (me: UserProfile, target: UserProfile) => {
    if (me.id === target.id) return true;

    // 1. Age Range Filter
    if (filterAgeEnabled) {
      const targetAge = calculateAge(target.dob);
      if (targetAge === null || targetAge < minAge || targetAge > maxAge) {
        return false;
      }
    }

    // 2. Role Preference Filter
    if (filterRoleEnabled) {
      const myRole = filterRole;
      const targetRole = target.role_pref;
      let roleMatch = false;
      if (myRole === 'Versatile' || targetRole === 'Versatile') roleMatch = true;
      else if (myRole === 'Bottom' && targetRole === 'Top') roleMatch = true;
      else if (myRole === 'Top' && targetRole === 'Bottom') roleMatch = true;
      else if (myRole === 'Side' && targetRole === 'Side') roleMatch = true;
      if (!roleMatch) return false;
    }

    // 3. Safety Preference Filter
    if (filterSafetyEnabled) {
      if (filterSafety !== target.safety_pref) return false;
    }

    // 4. Playstyle Preference Filter (Treat Party✓ same as Party)
    if (filterPlaystyleEnabled) {
      const normalizePlaystyle = (p?: string | null) => (p === 'Party✓' ? 'Party' : (p || 'Clean'));
      if (normalizePlaystyle(filterPlaystyle) !== normalizePlaystyle(target.playstyle_pref)) return false;
    }

    // 5. How Many Preference Filter
    if (filterHowManyEnabled) {
      const myHowMany = filterHowMany;
      const targetHowMany = target.how_many_pref;
      let howManyMatch = false;
      if (myHowMany === '1on1' && targetHowMany === '1on1') howManyMatch = true;
      else if (myHowMany === 'Group' && (targetHowMany === 'Group' || targetHowMany === '1on1')) howManyMatch = true;
      else if (targetHowMany === 'Group' && myHowMany === '1on1') howManyMatch = true;
      if (!howManyMatch) return false;
    }

    // 6. Where Preference Filter
    if (filterWhereEnabled) {
      if (filterWhere !== target.where_pref) return false;
    }

    // Default baseline personal matching if filters are not enabled
    const myRole = me.role_pref;
    const targetRole = target.role_pref;
    let roleMatch = false;
    if (myRole === 'Versatile' || targetRole === 'Versatile') roleMatch = true;
    else if (myRole === 'Bottom' && targetRole === 'Top') roleMatch = true;
    else if (myRole === 'Top' && targetRole === 'Bottom') roleMatch = true;
    else if (myRole === 'Side' && targetRole === 'Side') roleMatch = true;

    const safetyMatch = me.safety_pref === target.safety_pref;
    const normalizePlaystyle = (p?: string | null) => (p === 'Party✓' ? 'Party' : (p || 'Clean'));
    const playstyleMatch = normalizePlaystyle(me.playstyle_pref) === normalizePlaystyle(target.playstyle_pref);

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
      alert(`Selected user ID: ${targetUser.id}`);
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

  if (isLocationDenied) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ff4d4d', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', boxSizing: 'border-box' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Location Required</h2>
        <p style={{ fontSize: '16px', color: '#ffffff', maxWidth: '360px', lineHeight: '1.5' }}>
          This app requires location access to function. Please enable location permissions in your browser or Telegram settings and restart the app.
        </p>
      </div>
    );
  }

  const isViewingSelf = selectedProfile ? (currentUser && selectedProfile.id === currentUser.id) : showProfileSetup;
  const activeProfile = isViewingSelf ? currentUser : selectedProfile;

  const targetDob = activeProfile?.dob || '';
  const targetAge = calculateAge(targetDob);
  const targetHideAge = activeProfile?.hide_age ?? false;
  const targetZodiac = getZodiacSignEmoji(targetDob);
  const targetHeight = activeProfile?.height || '';
  const targetWeight = activeProfile?.weight || '';
  const targetDistance = formatDistanceBigUnit(activeProfile?.distance);
  const targetLastSeen = formatLastSeenBigUnit(activeProfile?.last_seen);

  const isOtherMatched = selectedProfile && currentUser ? checkMatchStatus(currentUser, selectedProfile) : false;
  const showSendMessage = selectedProfile && !isViewingSelf && isOtherMatched;

  const gridFilteredUsers = users.filter((u) => u.id === currentUser?.id || u.grid_visible !== false).filter((u) => currentUser ? checkMatchStatus(currentUser, u) : true);
  const mapFilteredUsers = users.filter((u) => (u.id === currentUser?.id ? mapVisible : (u.map_visible === true && u.grid_visible !== false))).filter((u) => currentUser ? checkMatchStatus(currentUser, u) : true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderBottom: '1px solid #333', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>HKMOD ({gridFilteredUsers.length})</h1>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          
          <button 
            onClick={() => {
              if (!hasValidSub(filterSubExpiry)) {
                handlePurchase('filter');
                return;
              }
              setShowFilterMenu(!showFilterMenu);
            }} 
            style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </button>

          <button onClick={handleRefresh} style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
          </button>
        </div>
      </header>

      {/* FILTER DROPDOWN PANEL */}
      {showFilterMenu && (
        <div style={{ backgroundColor: '#1a1a1a', padding: '16px', borderBottom: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '14px', zIndex: 11, maxHeight: '50vh', overflowY: 'auto' }}>
          
          <div style={{ fontSize: '13px', color: hasValidSub(filterSubExpiry) ? '#4ade80' : '#ff4d4d', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{hasValidSub(filterSubExpiry) ? 'Advanced Filters Active' : '🔒 Filters Locked'}</span>
            {!hasValidSub(filterSubExpiry) && (
              <button onClick={() => handlePurchase('filter')} style={{ padding: '4px 8px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Unlock</button>
            )}
          </div>

          {/* Age Range Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input 
              type="checkbox" 
              checked={filterAgeEnabled} 
              onChange={(e) => setFilterAgeEnabled(e.target.checked)} 
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#007bff' }} 
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', opacity: filterAgeEnabled ? 1 : 0.4, pointerEvents: filterAgeEnabled ? 'auto' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold' }}>
                <span>Age Range</span>
                <span style={{ color: '#007bff' }}>{minAge} - {maxAge} yo</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="range" 
                  min="18" 
                  max="80" 
                  value={minAge} 
                  onChange={(e) => setMinAge(Math.min(Number(e.target.value), maxAge))} 
                  style={{ flex: 1, accentColor: '#007bff' }} 
                />
                <input 
                  type="range" 
                  min="18" 
                  max="80" 
                  value={maxAge} 
                  onChange={(e) => setMaxAge(Math.max(Number(e.target.value), minAge))} 
                  style={{ flex: 1, accentColor: '#007bff' }} 
                />
              </div>
            </div>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#333' }} />

          {/* 5 Preference Tags Horizontally in 1 Row */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: '10px', overflowX: 'auto', alignItems: 'center', width: '100%', paddingBottom: '4px' }}>
            
            {/* 1. Role */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <input 
                type="checkbox" 
                checked={filterRoleEnabled} 
                onChange={(e) => setFilterRoleEnabled(e.target.checked)} 
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#e11d48' }} 
              />
              <button 
                type="button" 
                onClick={() => setFilterRole(cycleNext(filterRole, roleCycleOptions))}
                style={{ padding: '6px 8px', backgroundColor: '#e11d48', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', opacity: filterRoleEnabled ? 1 : 0.4, pointerEvents: filterRoleEnabled ? 'auto' : 'none' }}
              >
                {filterRole}
              </button>
            </div>

            {/* 2. Safety */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <input 
                type="checkbox" 
                checked={filterSafetyEnabled} 
                onChange={(e) => setFilterSafetyEnabled(e.target.checked)} 
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }} 
              />
              <button 
                type="button" 
                onClick={() => setFilterSafety(cycleNext(filterSafety, safetyCycleOptions))}
                style={{ padding: '6px 8px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', opacity: filterSafetyEnabled ? 1 : 0.4, pointerEvents: filterSafetyEnabled ? 'auto' : 'none' }}
              >
                {filterSafety}
              </button>
            </div>

            {/* 3. Playstyle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <input 
                type="checkbox" 
                checked={filterPlaystyleEnabled} 
                onChange={(e) => setFilterPlaystyleEnabled(e.target.checked)} 
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#16a34a' }} 
              />
              <button 
                type="button" 
                onClick={() => setFilterPlaystyle(cycleNext(filterPlaystyle, playstyleGridCycleOptions))}
                style={{ padding: '6px 8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', opacity: filterPlaystyleEnabled ? 1 : 0.4, pointerEvents: filterPlaystyleEnabled ? 'auto' : 'none' }}
              >
                {filterPlaystyle}
              </button>
            </div>

            {/* 4. How Many */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <input 
                type="checkbox" 
                checked={filterHowManyEnabled} 
                onChange={(e) => setFilterHowManyEnabled(e.target.checked)} 
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#9333ea' }} 
              />
              <button 
                type="button" 
                onClick={() => setFilterHowMany(cycleNext(filterHowMany, howManyCycleOptions))}
                style={{ padding: '6px 8px', backgroundColor: '#9333ea', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', opacity: filterHowManyEnabled ? 1 : 0.4, pointerEvents: filterHowManyEnabled ? 'auto' : 'none' }}
              >
                {filterHowMany}
              </button>
            </div>

            {/* 5. Where */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <input 
                type="checkbox" 
                checked={filterWhereEnabled} 
                onChange={(e) => setFilterWhereEnabled(e.target.checked)} 
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#d97706' }} 
              />
              <button 
                type="button" 
                onClick={() => setFilterWhere(cycleNext(filterWhere, whereCycleOptions))}
                style={{ padding: '6px 8px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', opacity: filterWhereEnabled ? 1 : 0.4, pointerEvents: filterWhereEnabled ? 'auto' : 'none' }}
              >
                {filterWhere}
              </button>
            </div>

          </div>

        </div>
      )}

      {/* MAIN VIEW */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ display: view === 'grid' ? 'block' : 'none', height: '100%', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', padding: '4px' }}>
            {gridFilteredUsers.map((user, index) => {
              const isOnline = user.last_seen ? (new Date().getTime() - new Date(user.last_seen).getTime() < 15 * 60 * 1000) : false;
              const isSelf = currentUser && user.id === currentUser.id;
              const isEnabled = isSelf ? gridVisible : checkMatchStatus(currentUser!, user);

              return (
                <div 
                  key={user.id || index} 
                  onClick={() => handleCardClick(user)}
                  style={{ position: 'relative', aspectRatio: '1/1', cursor: 'pointer', backgroundColor: '#222', overflow: 'hidden', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isEnabled ? 1 : 0.4, filter: isEnabled ? 'none' : 'grayscale(100%)' }}
                >
                  {user.avatar ? (
                    <img 
                      src={user.avatar} 
                      alt="User" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: '#0088cc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                      U
                    </div>
                  )}
                  
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px', fontSize: '10px', textAlign: 'center' }}>
                    {isSelf ? 'You' : formatDistanceBigUnit(user.distance)}
                  </div>

                  {isOnline && isEnabled && (
                    <div style={{ position: 'absolute', top: '4px', right: '4px', width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%', border: '2px solid #121212' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: view === 'map' ? 'block' : 'none', height: '100%', width: '100%', position: 'relative', flex: 1, zIndex: 1 }}>
          <MapContainer 
            center={[location.lat, location.lng]} 
            zoom={15} 
            style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
            zoomControl={false}
          >
            <MapController center={[location.lat, location.lng]} />
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {mapFilteredUsers.map((user) => {
              const isSelf = currentUser && user.id === currentUser.id;
              const isEnabled = isSelf ? (mapVisible && gridVisible) : checkMatchStatus(currentUser!, user);
              return (
                <Marker 
                  key={user.id} 
                  position={[user.lat || 0, user.lng || 0]} 
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

      {/* PROFILE MODAL / SETUP */}
      {(showProfileSetup || selectedProfile) && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => { setShowProfileSetup(false); setSelectedProfile(null); }}>
          <div style={{ backgroundColor: '#1e1e1e', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '24px 20px 40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ width: '40px', height: '4px', backgroundColor: '#444', borderRadius: '2px', marginBottom: '16px' }} />

            {/* INITIAL SETUP FORM IF NOT FULLY SETUP */}
            {showProfileSetup && (!currentUser?.dob || !currentUser?.height || !currentUser?.weight) ? (
              <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h2 style={{ fontSize: '20px', marginBottom: '8px', color: '#007bff', textAlign: 'center', fontWeight: 'bold' }}>Complete Your Profile</h2>
                <p style={{ fontSize: '13px', color: '#ff4d4d', textAlign: 'center', marginBottom: '16px', fontWeight: 'bold', lineHeight: '1.4' }}>
                  Warning: This cannot be changed in the future.<br/>Information entered here affects who you can see and interact with.
                </p>
                
                {errorMessage && (
                  <div style={{ backgroundColor: 'rgba(255, 77, 77, 0.25)', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '10px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px', width: '100%', boxSizing: 'border-box', textAlign: 'center' }}>
                    {errorMessage}
                  </div>
                )}
                
                <form onSubmit={handleSaveInitialProfile} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  
                  {/* Date of Birth */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Date of Birth:</label>
                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} style={{ padding: '12px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px', colorScheme: 'dark' }} required />
                  </div>

                  {/* Orientation */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Orientation:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px' }}>I'm a</span>
                      <select value={gender} onChange={(e) => setGender(e.target.value)} style={{ flex: 1, padding: '12px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px' }}>
                        <option value="man">man</option>
                      </select>
                      <span style={{ fontSize: '14px' }}>seeking</span>
                      <select value={seeking} onChange={(e) => setSeeking(e.target.value)} style={{ flex: 1, padding: '12px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px' }}>
                        <option value="men">men</option>
                      </select>
                    </div>
                  </div>

                  {/* Height & Weight */}
                  <div style={{ display: 'flex', gap: '10px', width: '100%', marginBottom: '16px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Height:</label>
                      <select value={height} onChange={(e) => setHeight(e.target.value)} style={{ padding: '12px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px' }}>
                        {heightOptions.map((h, idx) => (<option key={idx} value={h}>{h}</option>))}
                      </select>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Weight:</label>
                      <select value={weight} onChange={(e) => setWeight(e.target.value)} style={{ padding: '12px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontSize: '15px' }}>
                        {weightOptions.map((w, idx) => (<option key={idx} value={w}>{w}</option>))}
                      </select>
                    </div>
                  </div>
                  
                  <div style={{ width: '100%', borderTop: '1px solid #333', margin: '8px 0 16px 0' }} />

                  {/* Cycle Tags */}
                  <div style={{ width: '100%', textAlign: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', marginBottom: '10px', display: 'block' }}>tap to change your preference:</span>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setRolePref(cycleNext(rolePref, roleCycleOptions))} style={{ padding: '10px 14px', backgroundColor: '#e11d48', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>{rolePref}</button>
                      <button type="button" onClick={() => setSafetyPref(cycleNext(safetyPref, safetyCycleOptions))} style={{ padding: '10px 14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>{safetyPref}</button>
                      <button type="button" onClick={() => setPlaystylePref(cycleNext(playstylePref, playstyleSetupCycleOptions))} style={{ padding: '10px 14px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>{playstylePref}</button>
                      <button type="button" onClick={() => setHowManyPref(cycleNext(howManyPref, howManyCycleOptions))} style={{ padding: '10px 14px', backgroundColor: '#9333ea', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>{howManyPref}</button>
                      <button type="button" onClick={() => setWherePref(cycleNext(wherePref, whereCycleOptions))} style={{ padding: '10px 14px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>{wherePref}</button>
                    </div>
                  </div>

                  <button type="submit" style={{ marginTop: '10px', padding: '14px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Save Profile & Continue
                  </button>
                </form>
              </div>
            ) : (
              /* VIEW PROFILE CARD */
              <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                
                {/* Avatar Image */}
                <div style={{ width: '90px', height: '90px', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#222', border: '3px solid #007bff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  {activeProfile?.avatar ? (
                    <img src={activeProfile.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>U</span>
                  )}
                </div>

                {/* Sub info: Age / Zodiac, Height, Weight, Distance, Last Online (Name hidden) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', fontSize: '13px', color: '#ccc', marginBottom: '16px', alignItems: 'center', marginTop: '6px' }}>
                  {!targetHideAge && targetAge && <span>{targetAge}yo</span>}
                  {targetZodiac && <span>{targetZodiac}</span>}
                  <span>•</span>
                  <span>{targetHeight}</span>
                  <span>•</span>
                  <span>{targetWeight}</span>
                  <span>•</span>
                  <span>{isViewingSelf ? 'You' : targetDistance}</span>
                  <span>•</span>
                  <span style={{ color: '#4ade80' }}>{targetLastSeen}</span>
                </div>

                {/* HIDE AGE PURCHASE TRIGGER */}
                {isViewingSelf && (
                  <div style={{ display: 'flex', width: '100%', justifyContent: 'center', marginBottom: '14px' }}>
                    <button 
                      type="button" 
                      onClick={async () => {
                        if (!hideAge && !hasValidSub(hideAgeExpiry)) {
                          await handlePurchase('hide_age');
                          return;
                        }
                        const nextHide = !hideAge;
                        setHideAge(nextHide);
                        await handleUpdateSelfField({ hide_age: nextHide });
                      }}
                      style={{ padding: '8px 16px', backgroundColor: hideAge ? '#e11d48' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {hideAge ? 'Age Hidden (Click to Show)' : 'Age Shown (Click to Hide)'}
                    </button>
                  </div>
                )}

                <div style={{ width: '100%', borderTop: '1px solid #333', margin: '4px 0 16px 0' }} />

                {/* Preference Tags */}
                <div style={{ display: 'flex', gap: '6px', width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
                  
                  {/* Role Tag (Greyed out / static on others) */}
                  <div style={{ padding: '10px 10px', backgroundColor: isViewingSelf ? '#e11d48' : '#444', color: isViewingSelf ? '#fff' : '#aaa', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                    {activeProfile?.role_pref || 'Versatile'}
                  </div>

                  {/* Safety Tag (Greyed out / static on others) */}
                  <div style={{ padding: '10px 10px', backgroundColor: isViewingSelf ? '#2563eb' : '#444', color: isViewingSelf ? '#fff' : '#aaa', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                    {activeProfile?.safety_pref || 'Safe'}
                  </div>

                  {/* Playstyle Tag (Toggable between Party and Party✓ on self, greyed out/static on others) */}
                  {isViewingSelf ? (
                    <button 
                      type="button" 
                      onClick={async () => {
                        let nextPlaystyle = playstylePref;
                        if (playstylePref === 'Party') {
                          nextPlaystyle = 'Party✓';
                        } else if (playstylePref === 'Party✓') {
                          nextPlaystyle = 'Party';
                        } else {
                          nextPlaystyle = 'Party';
                        }
                        setPlaystylePref(nextPlaystyle);
                        await handleUpdateSelfField({ playstyle_pref: nextPlaystyle });
                      }}
                      style={{ padding: '10px 10px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
                    >
                      {playstylePref}
                    </button>
                  ) : (
                    <div style={{ padding: '10px 10px', backgroundColor: '#444', color: '#aaa', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                      {activeProfile?.playstyle_pref || 'Clean'}
                    </div>
                  )}

                  {/* How Many Tag (Greyed out / static on others) */}
                  <div style={{ padding: '10px 10px', backgroundColor: isViewingSelf ? '#9333ea' : '#444', color: isViewingSelf ? '#fff' : '#aaa', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                    {activeProfile?.how_many_pref || '1on1'}
                  </div>
                  
                  {/* Where Tag (Toggable between Host and Travel on self, greyed out/static on others) */}
                  {isViewingSelf ? (
                    <button 
                      type="button" 
                      onClick={async () => {
                        const nextWhere = wherePref === 'Host' ? 'Travel' : 'Host';
                        setWherePref(nextWhere);
                        await handleUpdateSelfField({ where_pref: nextWhere });
                      }}
                      style={{ padding: '10px 10px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
                    >
                      {wherePref}
                    </button>
                  ) : (
                    <div style={{ padding: '10px 10px', backgroundColor: '#444', color: '#aaa', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                      {activeProfile?.where_pref || 'Host'}
                    </div>
                  )}
                </div>

                {/* Send Message Button for others if matched */}
                {!isViewingSelf && (
                  showSendMessage ? (
                    <button 
                      type="button" 
                      onClick={() => handleStartChat(selectedProfile!)}
                      style={{ marginTop: '20px', width: '100%', padding: '14px', backgroundColor: '#0088cc', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                      </svg>
                      Send Message
                    </button>
                  ) : (
                    <div style={{ marginTop: '20px', width: '100%', padding: '14px', backgroundColor: '#2a2a2a', color: '#888', border: '1px solid #444', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', textAlign: 'center' }}>
                      Not Preference Matched
                    </div>
                  )
                )}

              </div>
            )}

          </div>
        </div>
      )}

      {/* FOOTER NAVIGATION */}
      <footer style={{ display: 'flex', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderTop: '1px solid #333', zIndex: 10 }}>
        
        {/* GRID TAB */}
        <button 
          onClick={handleToggleGrid}
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
          onClick={handleToggleMap}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: view === 'map' ? '#007bff' : '#888', cursor: 'pointer', position: 'relative' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
          <span style={{ fontSize: '12px', marginTop: '4px' }}>Map</span>
          <div style={{ position: 'absolute', bottom: '0', left: '50%', right: 0, height: '3px', backgroundColor: mapVisible ? '#4ade80' : '#ff4d4d' }} />
        </button>

      </footer>
    </div>
  );
}
