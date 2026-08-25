// ==========================================  
// Telegram Web App Frontend Code (App.tsx)  
// ==========================================  
  
import { useState, useEffect } from 'react';  
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';  
import MarkerClusterGroup from 'react-leaflet-cluster';  
import L from 'leaflet';  
import { createClient } from '@supabase/supabase-js';  
import { useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';

import bustaIcon from './assets/Bustagames.jpg';
import tonflipIcon from './assets/Tonflip.jpg';
import photifyIcon from './assets/Photify.jpg';
  
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
            language_code?: string;  
          };  
          start_param?: string;  
        };  
        ready?: () => void;  
        expand?: () => void;  
        openTelegramLink?: (url: string) => void;  
        openLink?: (url: string) => void;
        showAlert?: (message: string) => void;  
        openInvoice?: (url: string, callback?: (status: string) => void) => void;  
      };  
    };  
  }  
}  
  
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const PAYMENT_WORKER_URL = import.meta.env.VITE_PAYMENT_WORKER_URL || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  
type LangKey = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru';  
