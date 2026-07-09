import { useEffect, useState } from 'react';
import { appConfig } from '../config';

interface TopBarProps {
  onRefresh: () => void;
  loading: boolean;
  userCount: number;
}

export default function TopBar({ onRefresh, loading, userCount }: TopBarProps) {
  const [timeAgo, setTimeAgo] = useState<string>('just now');

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo('recent');
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">Who's Nearby</h1>
        <span className="topbar-count">{userCount} nearby</span>
      </div>
      <div className="topbar-right">
        <span className="topbar-time">{timeAgo}</span>
        <button
          className="topbar-refresh-btn"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh users"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke={appConfig.theme.primary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={loading ? 'spin' : ''}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>
      </div>
    </header>
  );
}
