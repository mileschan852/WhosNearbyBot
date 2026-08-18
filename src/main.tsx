import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App.tsx';
import 'leaflet/dist/leaflet.css';
import './index.css'; // Assuming you have a basic reset here

// Official Telegram Wallet is the ONLY wallet allowed to connect (per owner spec).
// The single-wallet modal only offers the Telegram Wallet entry from the
// canonical TON Connect registry — no other wallet can be picked.
const TONCONNECT_MANIFEST_URL = 'https://teleclaw-dispatch.silent-flower-a7c2.workers.dev/f6710d69cb37/tonconnect-manifest.json';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TonConnectUIProvider
      manifestUrl={TONCONNECT_MANIFEST_URL}
      walletsListConfiguration={{
        includeWallets: [
          {
            appName: 'telegram-wallet',
            name: 'Wallet',
            imageUrl: 'https://config.ton.org/assets/telegram_wallet.png',
            aboutUrl: 'https://wallet.tg/',
            universalLink: 'https://t.me/wallet?attach=wallet',
            bridgeUrl: 'https://walletbot.me/tonconnect-bridge/bridge',
            platforms: ['ios', 'android', 'macos', 'windows', 'linux'],
          },
        ],
      }}
    >
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>,
);
