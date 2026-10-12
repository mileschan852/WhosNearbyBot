import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App.tsx';
import { loadAppRuntimeConfig } from './config/entries';
import 'leaflet/dist/leaflet.css';
import './index.css'; // Assuming you have a basic reset here

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The app root element is missing.');
const appRoot: HTMLElement = rootElement;
const root = ReactDOM.createRoot(appRoot);

async function startApp() {
  appRoot.dataset.appMounted = 'false';
  try {
    const config = await loadAppRuntimeConfig();
    appRoot.dataset.appMounted = 'true';
    root.render(
      <React.StrictMode>
        <TonConnectUIProvider
          manifestUrl={config.tonConnectManifestUrl}
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
          <App config={config} />
        </TonConnectUIProvider>
      </React.StrictMode>,
    );
  } catch (error) {
    console.error('Unable to start app from its public configuration:', error);
    const message = error instanceof Error ? error.message : 'The app configuration is invalid.';
    appRoot.dataset.appMounted = 'true';
    root.render(
      <main style={{ minHeight: '100vh', padding: '24px', boxSizing: 'border-box', background: '#111', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <section role="alert" aria-live="assertive" style={{ maxWidth: '520px', margin: '10vh auto 0', padding: '20px', border: '1px solid #444', borderRadius: '12px', background: '#1e1e1e' }}>
          <h1 style={{ marginTop: 0, fontSize: '20px' }}>Could not load app settings</h1>
          <p style={{ color: '#d1d5db', lineHeight: 1.5 }}>{message}</p>
          <button type="button" onClick={() => void startApp()} style={{ padding: '10px 16px', border: 0, borderRadius: '8px', background: '#1677ff', color: '#fff', fontWeight: 600 }}>
            Retry
          </button>
        </section>
      </main>,
    );
  }
}

void startApp();
