export interface BottomNavigationModuleProps {
  view: 'grid' | 'map';
  gridVisible: boolean;
  mapVisible: boolean;
  walletConnected: boolean;
  onGrid: () => void;
  onChat: () => void;
  onWallet: () => void;
  onMap: () => void;
  t: (key: string) => string;
}

export default function BottomNavigationModule({
  view,
  gridVisible,
  mapVisible,
  walletConnected,
  onGrid,
  onChat,
  onWallet,
  onMap,
  t,
}: BottomNavigationModuleProps) {
  return (
    <footer style={{ display: 'flex', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderTop: '1px solid #333', zIndex: 10 }}>
      <button onClick={onGrid} aria-label={t('grid')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: view === 'grid' ? '#007bff' : '#888', cursor: 'pointer', position: 'relative' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        <span style={{ fontSize: '12px', marginTop: '4px', color: gridVisible ? '#007bff' : '#ff4d4d' }}>{t('grid')}</span>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: '75%', height: '3px', backgroundColor: gridVisible ? '#4ade80' : '#ff4d4d' }} />
      </button>
      <button onClick={onChat} aria-label={t('chat')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: '#888', cursor: 'pointer', position: 'relative' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        <span style={{ fontSize: '12px', marginTop: '4px' }}>{t('chat')}</span>
      </button>
      <button onClick={onWallet} aria-label={t('wallet')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: walletConnected ? '#007bff' : '#ff4d4d', cursor: 'pointer', position: 'relative' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
        <span style={{ fontSize: '12px', marginTop: '4px', color: walletConnected ? '#007bff' : '#ff4d4d' }}>{t('wallet')}</span>
        <div style={{ position: 'absolute', bottom: 0, left: '25%', right: '50%', height: '3px', backgroundColor: walletConnected ? '#007bff' : '#ff4d4d' }} />
      </button>
      <button onClick={onMap} aria-label={t('map')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: view === 'map' ? '#007bff' : '#888', cursor: 'pointer', position: 'relative' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
        <span style={{ fontSize: '12px', marginTop: '4px' }}>{t('map')}</span>
        <div style={{ position: 'absolute', bottom: 0, left: '50%', right: 0, height: '3px', backgroundColor: mapVisible ? '#4ade80' : '#ff4d4d' }} />
      </button>
    </footer>
  );
}
