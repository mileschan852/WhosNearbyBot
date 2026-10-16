import { useEffect } from 'react';
import {
  TonConnectUIProvider,
  useTonConnectUI,
  useTonWallet,
} from '@tonconnect/ui-react';

interface WalletConnectionControllerProps {
  actionRequest: number;
  onConnectionChange: (connected: boolean) => void;
}

interface WalletConnectModuleProps extends WalletConnectionControllerProps {
  manifestUrl: string;
}

function WalletConnectionController({
  actionRequest,
  onConnectionChange,
}: WalletConnectionControllerProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  useEffect(() => {
    onConnectionChange(Boolean(wallet));
  }, [wallet, onConnectionChange]);

  useEffect(() => {
    if (actionRequest === 0) return;

    let active = true;
    void (async () => {
      try {
        await tonConnectUI.connectionRestored;
        if (!active) return;
        if (tonConnectUI.wallet) {
          await tonConnectUI.disconnect();
        } else {
          await tonConnectUI.openSingleWalletModal('telegram-wallet');
        }
      } catch (error) {
        console.error(
          tonConnectUI.wallet ? 'Wallet disconnect error:' : 'Wallet connect error:',
          error,
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [actionRequest, tonConnectUI]);

  return null;
}

export default function WalletConnectModule({
  manifestUrl,
  actionRequest,
  onConnectionChange,
}: WalletConnectModuleProps) {
  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
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
      <WalletConnectionController
        actionRequest={actionRequest}
        onConnectionChange={onConnectionChange}
      />
    </TonConnectUIProvider>
  );
}
