import type { FormEventHandler } from 'react';

export interface FlyingMessageDisplayItem {
  id: string;
  text: string;
  from_name: string;
  created_at: string;
}

export interface FlyingMessageModuleProps {
  messages: FlyingMessageDisplayItem[];
  text: string;
  placeholder: string;
  priceLabel: string;
  sendLabel: string;
  status: string;
  inputDisabled: boolean;
  sendDisabled: boolean;
  onTextChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

function flyingMessageLane(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = ((hash << 5) - hash + id.charCodeAt(index)) | 0;
  }
  return 8 + (Math.abs(hash) % 82);
}

export default function FlyingMessageModule({
  messages,
  text,
  placeholder,
  priceLabel,
  sendLabel,
  status,
  inputDisabled,
  sendDisabled,
  onTextChange,
  onSubmit,
}: FlyingMessageModuleProps) {
  return (
    <>
      <div className="flying-message-layer" aria-hidden="true">
        {messages.map((message) => {
          const ageMs = Math.max(0, Date.now() - Date.parse(message.created_at));
          if (ageMs >= 10_000) return null;
          return (
            <div
              key={message.id}
              className="flying-message-item"
              style={{ top: `${flyingMessageLane(message.id)}%`, animationDelay: `-${ageMs / 1000}s` }}
            >
              <span className="flying-message-name">{message.from_name}</span>
              <span className="flying-message-text">{message.text}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'relative', zIndex: 11, height: '52px', minHeight: '52px', backgroundColor: '#1e1e1e', borderTop: '1px solid #333', padding: '6px 12px' }}>
        <form onSubmit={onSubmit} style={{ height: '100%', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            maxLength={200}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={inputDisabled}
            style={{ flex: 1, minWidth: 0, height: '38px', borderRadius: '8px', border: '1px solid #3f4652', backgroundColor: '#121212', color: '#fff', padding: '0 12px', fontSize: '14px', outline: 'none' }}
          />
          <span style={{ minWidth: '42px', textAlign: 'center', color: priceLabel.includes('⭐') ? '#f5c518' : '#4ade80', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            {priceLabel}
          </span>
          <button
            type="submit"
            title={sendLabel}
            aria-label={sendLabel}
            disabled={sendDisabled}
            style={{ width: '38px', height: '38px', flex: '0 0 38px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '8px', color: '#fff', backgroundColor: sendDisabled ? '#3b4656' : '#007bff', cursor: 'pointer' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </form>
        {status && (
          <div role="status" aria-live="polite" style={{ position: 'absolute', bottom: 'calc(100% + 60px)', left: '12px', right: '12px', zIndex: 12, padding: '5px 8px', borderRadius: '6px', backgroundColor: '#202938', color: '#dbeafe', fontSize: '11px', textAlign: 'center', boxShadow: '0 -3px 8px rgba(0,0,0,0.35)' }}>
            {status}
          </div>
        )}
      </div>
    </>
  );
}
