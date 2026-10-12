import bustaIcon from '../../assets/Bustagames.jpg';
import tonflipIcon from '../../assets/Tonflip.jpg';
import photifyIcon from '../../assets/Photify.jpg';
import type { StarMenuItemConfig } from '../../config/star-menu.js';

export interface StarMenuRaffleModuleProps {
  open: boolean;
  ticketBusy: boolean;
  countdown: string;
  ticketNotice: string;
  items: StarMenuItemConfig[];
  copy: {
    menu: string;
    ticketButton: string;
    ticketSummary: string;
  };
  onToggle: () => void;
  onBuyTicket: () => void;
  onOpenExternal: (url: string) => void;
}

const externalAppIcons: Record<string, string> = {
  busta: bustaIcon,
  tonflip: tonflipIcon,
  photify: photifyIcon,
};

export default function StarMenuRaffleModule({
  open,
  ticketBusy,
  countdown,
  ticketNotice,
  items,
  copy,
  onToggle,
  onBuyTicket,
  onOpenExternal,
}: StarMenuRaffleModuleProps) {
  return (
    <>
      <aside aria-label={copy.menu} style={{ position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 5000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: 'rgba(30, 30, 30, 0.85)', borderTopLeftRadius: '16px', borderBottomLeftRadius: '16px', boxShadow: '-2px 0px 8px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={copy.menu}
          aria-expanded={open}
          style={{ background: 'none', border: 'none', fontSize: '32px', cursor: 'pointer', padding: 0, lineHeight: 1, filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.6))', transition: 'transform 0.2s ease', transform: open ? 'scale(0.9)' : 'scale(1)' }}
          title={copy.menu}
        >
          ⭐
        </button>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onBuyTicket}
              disabled={ticketBusy}
              aria-label={`${copy.ticketButton}, 100 Telegram Stars. ${copy.ticketSummary}. ${countdown}`}
              style={{ position: 'relative', width: '42px', height: '42px', flex: '0 0 42px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, overflow: 'hidden', background: 'radial-gradient(circle at 32% 25%, #6b5310 0%, #332700 60%, #1e1e1e 100%)', border: '2px solid #f5c518', borderRadius: '50%', color: '#ffe082', cursor: ticketBusy ? 'wait' : 'pointer', opacity: ticketBusy ? 0.72 : 1, boxShadow: '0 2px 10px rgba(0,0,0,0.45), inset 0 0 0 3px rgba(245,197,24,0.14)' }}
            >
              <svg aria-hidden="true" width="30" height="30" viewBox="0 0 48 48" fill="none" style={{ position: 'absolute', inset: 0, margin: 'auto', opacity: 0.72 }}>
                <path d="M9 12h30v7a5 5 0 0 0 0 10v7H9v-7a5 5 0 0 0 0-10v-7Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
                <path d="M24 14v20" stroke="currentColor" strokeWidth="2" strokeDasharray="2 3" />
              </svg>
              <span style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', padding: '2px 1px', borderRadius: '4px', backgroundColor: 'rgba(28,22,4,0.94)', color: '#fff5c7', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '6px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.35px', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.55)' }}>
                {countdown.split(' ').map((part, index) => <span key={index}>{part}</span>)}
              </span>
            </button>
            {items.map((app) => (
              <button
                type="button"
                key={app.id}
                onClick={() => onOpenExternal(app.url)}
                aria-label={app.label}
                title={app.label}
                style={{ width: '46px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {externalAppIcons[app.icon] ? (
                  <img src={externalAppIcons[app.icon]} alt="" style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #555' }} />
                ) : (
                  <span aria-hidden="true" style={{ width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '2px solid #555', backgroundColor: '#303030', color: '#fff', fontSize: '24px' }}>
                    {app.icon}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </aside>
      {ticketNotice && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', right: '12px', bottom: '72px', zIndex: 6000, maxWidth: 'min(260px, calc(100vw - 24px))', padding: '8px 10px', borderRadius: '8px', border: '1px solid #665500', backgroundColor: '#211b05', color: '#ffe082', fontSize: '12px', lineHeight: 1.35, textAlign: 'center', overflowWrap: 'anywhere', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }}>
          {ticketNotice}
        </div>
      )}
    </>
  );
}
