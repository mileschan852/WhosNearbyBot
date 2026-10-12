import type { ReactNode } from 'react';

export interface GridFilterModuleProps {
  open: boolean;
  title: string;
  onToggle: () => void;
  children: ReactNode;
}

export default function GridFilterModule({
  open,
  title,
  onToggle,
  children,
}: GridFilterModuleProps) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={title}
        aria-expanded={open}
        style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title={title}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}
