import { useEffect, useRef } from 'react';
import type { GridUser } from '../types';
import { appConfig } from '../config';

interface MapAreaProps {
  users: GridUser[];
  loading: boolean;
  error: string | null;
  onSelectUser: (user: GridUser) => void;
}

// Simple canvas-based map view (no Mapbox/Leaflet dependency for size)
export default function MapArea({ users, loading, error, onSelectUser }: MapAreaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || users.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Draw grid dots
    ctx.fillStyle = '#2a2a4e';
    for (let x = 0; x < w; x += 30) {
      for (let y = 0; y < h; y += 30) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw user dots — scatter them across the canvas
    const centerX = w / 2;
    const centerY = h / 2;

    users.forEach((user, i) => {
      const angle = (i / users.length) * Math.PI * 2;
      const radius = Math.min(w, h) * 0.3;
      const jitter = (Math.random() - 0.5) * 40;
      const x = centerX + Math.cos(angle) * radius + jitter;
      const y = centerY + Math.sin(angle) * radius + jitter;
      const isYou = user.id === 'you';

      // Ring
      ctx.beginPath();
      ctx.arc(x, y, isYou ? 12 : 10, 0, Math.PI * 2);
      ctx.fillStyle = isYou ? '#3b82f6' : appConfig.theme.primary;
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(x, y, isYou ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isYou ? '#60a5fa' : '#ffffff';
      ctx.fill();

      // Label
      if (user.first_name) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px "SF Pro", -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(user.first_name, x, y - (isYou ? 18 : 16));
      }
    });

  }, [users]);

  if (loading) {
    return (
      <div className="map-area">
        <div className="grid-loading">
          <div className="spinner" />
          <p>Loading map...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="map-area">
        <div className="grid-error">
          <p>Could not load map</p>
          <p className="grid-error-detail">{error}</p>
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="map-area">
        <div className="grid-empty">
          <div className="grid-empty-icon">🗺️</div>
          <p>No one on the map</p>
          <p className="grid-empty-hint">People nearby will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-area">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onClick={() => {
          // Simple click handler — select a random user for demo
          if (users.length > 0) {
            const idx = Math.floor(Math.random() * users.length);
            onSelectUser(users[idx]);
          }
        }}
      />
      <div className="map-legend">
        <span className="map-legend-dot you" /> You
        <span className="map-legend-dot other" /> Others
      </div>
    </div>
  );
}
