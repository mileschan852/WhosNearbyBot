import { useEffect, useState, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import { supabase } from './supabaseClient';
import { appConfig } from './config';
import TopBar from './components/TopBar';
import GridArea from './components/GridArea';
import MapArea from './components/MapArea';
import ProfileAndNav from './components/ProfileAndNav';
import FlyingMessages from './components/FlyingMessages';
import type { GridUser, ViewMode } from './types';

export default function App() {
  const [users, setUsers] = useState<GridUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<GridUser | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [, setTgUser] = useState<{ id: number; username?: string; first_name?: string; photo_url?: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Try RPC first, fall back to direct table query
      let data: GridUser[] | null = null;
      let rpcError = false;

      try {
        const result = await supabase.rpc('get_grid_users', {
          p_lat: 0,
          p_lng: 0,
          p_radius_km: 50,
        });
        if (result.error) {
          console.warn('RPC get_grid_users not available:', result.error.message);
          rpcError = true;
        } else {
          data = result.data as GridUser[] | null;
        }
      } catch {
        rpcError = true;
      }

      if (rpcError) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('profiles')
          .select('*')
          .limit(20);

        if (fallbackError) {
          console.warn('Profiles table unavailable:', fallbackError.message);
        } else if (fallbackData && fallbackData.length > 0) {
          data = fallbackData as GridUser[];
        }
      }

      if (data && data.length > 0) {
        setUsers(data);
      } else {
        // Showcase sample users when no data
        const sampleUsers: GridUser[] = [
          { id: '1', telegram_id: '101', first_name: 'Sophie', age: 24, distance_m: 320, intent: 'Dating', is_vip: true },
          { id: '2', telegram_id: '102', first_name: 'Emma', age: 27, distance_m: 850, intent: 'Friends' },
          { id: '3', telegram_id: '103', first_name: 'Lena', age: 22, distance_m: 1500, intent: 'Casual' },
          { id: '4', telegram_id: '104', first_name: 'Mia', age: 25, distance_m: 2100, intent: 'Dating', is_premium: true },
          { id: '5', telegram_id: '105', first_name: 'Zoe', age: 26, distance_m: 430, intent: 'Friends' },
          { id: '6', telegram_id: '106', first_name: 'Ava', age: 23, distance_m: 1200, intent: 'Dating' },
        ];
        setUsers(sampleUsers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initialize Telegram WebApp
    try {
      WebApp.ready();
      WebApp.expand();

      const initData = WebApp.initDataUnsafe;
      if (initData?.user) {
        setTgUser({
          id: initData.user.id,
          username: initData.user.username,
          first_name: initData.user.first_name,
          photo_url: initData.user.photo_url,
        });
      }
    } catch {
      console.warn('Not running in Telegram Mini App environment');
    }

    // Apply theme vars
    document.documentElement.style.setProperty('--bg-color', appConfig.theme.bg);
    document.documentElement.style.setProperty('--primary-color', appConfig.theme.primary);

    fetchUsers();
  }, [fetchUsers]);

  const handleRefresh = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSelectUser = useCallback((user: GridUser) => {
    setSelectedUser(user);
  }, []);

  const handleCloseProfile = useCallback(() => {
    setSelectedUser(null);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  return (
    <div className="app" style={{ backgroundColor: appConfig.theme.bg }}>
      <TopBar onRefresh={handleRefresh} loading={loading} userCount={users.length} />

      <main className="app-content">
        {viewMode === 'grid' ? (
          <GridArea users={users} loading={loading} error={error} onSelectUser={handleSelectUser} />
        ) : (
          <MapArea users={users} loading={loading} error={error} onSelectUser={handleSelectUser} />
        )}
      </main>

      <FlyingMessages visible={users.length > 0} />

      <ProfileAndNav
        selectedUser={selectedUser}
        onClose={handleCloseProfile}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />
    </div>
  );
}
