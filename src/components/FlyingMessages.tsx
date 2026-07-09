import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { FlyingMessage } from '../types';

interface FlyingMessagesProps {
  visible: boolean;
}

type AnimatedMessage = FlyingMessage & {
  side: 'left' | 'right';
  top: number;
  delay: number;
};

export default function FlyingMessages({ visible }: FlyingMessagesProps) {
  const [messages, setMessages] = useState<FlyingMessage[]>([]);
  const [animated, setAnimated] = useState<AnimatedMessage[]>([]);

  useEffect(() => {
    if (!visible) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('flying_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setMessages(data);
      }
    };

    fetchMessages();

    // Poll for new messages
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [visible]);

  useEffect(() => {
    if (messages.length === 0) {
      setAnimated([]);
      return;
    }

    const anims: AnimatedMessage[] = messages.map((msg) => ({
      ...msg,
      side: (Math.random() > 0.5 ? 'left' : 'right') as 'left' | 'right',
      top: 10 + Math.random() * 60,
      delay: Math.random() * 3,
    }));

    setAnimated(anims);

    // Clear animated messages after they finish flying
    const timer = setTimeout(() => setAnimated([]), 6000);
    return () => clearTimeout(timer);
  }, [messages]);

  if (!visible || animated.length === 0) return null;

  return (
    <div className="flying-messages-overlay" aria-hidden="true">
      {animated.map((msg, i) => (
        <div
          key={`${msg.id}-${i}`}
          className={`flying-message flying-message-${msg.side}`}
          style={{
            top: `${msg.top}%`,
            animationDelay: `${msg.delay}s`,
          }}
        >
          {msg.from_photo && (
            <img
              src={msg.from_photo}
              alt=""
              className="flying-message-avatar"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flying-message-body">
            <span className="flying-message-name">{msg.from_name}</span>
            <span className="flying-message-text">{msg.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
