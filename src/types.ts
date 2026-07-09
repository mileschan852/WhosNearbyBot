export interface GridUser {
  id: string;
  telegram_id: string;
  username?: string;
  first_name?: string;
  age?: number;
  photo_url?: string;
  distance_m?: number;
  intent?: string;
  is_premium?: boolean;
  is_vip?: boolean;
  last_active_at?: string;
}

export interface FlyingMessage {
  id: string;
  text: string;
  from_name: string;
  from_photo?: string;
  created_at: string;
}

export type ViewMode = 'grid' | 'map';
