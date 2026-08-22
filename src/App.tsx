import { useState, useCallback } from 'react'
import styled, { createGlobalStyle } from 'styled-components'
import { TonConnectUIProvider, useTonConnectUI, useTonAddress } from '@tonconnect/ui-react'

// Pages
import MapPage from './pages/MapPage'
import MintPage from './pages/MintPage'

const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }

  body {
    background: var(--tg-theme-bg-color, #fff);
    color: var(--tg-theme-text-color, #000);
    overflow: hidden;
    height: 100vh;
    width: 100vw;
  }

  #root {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
`

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
`

const PageArea = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
`

const BottomNav = styled.nav`
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: var(--tg-theme-secondary-bg-color, '#f0f0f0');
  border-top: 1px solid rgba(0,0,0,0.08);
  padding: 8px 0;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  flex-shrink: 0;
  position: relative;
`

const NavButton = styled.button<{ active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  padding: 4px 16px;
  cursor: pointer;
  color: ${p => p.active ? 'var(--tg-theme-button-color, #007aff)' : 'var(--tg-theme-hint-color, #999)'};
  font-size: 10px;
  transition: color 0.15s;
  position: relative;

  svg {
    width: 24px;
    height: 24px;
  }
`

const WalletButton = styled(NavButton)`
  .wallet-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4cd964;
    position: absolute;
    top: 4px;
    right: 12px;
  }
`

type Page = 'map' | 'mint'

const TON_MANIFEST_URL = 'https://teleclaw-dispatch.silent-flower-a7c2.workers.dev/f6710d69cb37/tonconnect-manifest.json'

function AppInner() {
  const [page, setPage] = useState<Page>('map')
  const [tonConnectUI] = useTonConnectUI()
  const address = useTonAddress()

  const handleConnect = useCallback(() => {
    if (!address) {
      tonConnectUI.openModal()
    } else {
      tonConnectUI.disconnect()
    }
  }, [address, tonConnectUI])

  return (
    <AppContainer>
      <PageArea>
        {page === 'map' && <MapPage />}
        {page === 'mint' && <MintPage />}
      </PageArea>

      <BottomNav>
        <NavButton active={page === 'map'} onClick={() => setPage('map')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>Map</span>
        </NavButton>

        <NavButton active={page === 'mint'} onClick={() => setPage('mint')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span>Mint</span>
        </NavButton>

        <WalletButton active={false} onClick={handleConnect}>
          {address && <span className="wallet-dot" />}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          <span>{address ? `${address.slice(0,4)}...${address.slice(-4)}` : 'Wallet'}</span>
        </WalletButton>
      </BottomNav>
    </AppContainer>
  )
}

function App() {
  return (
    <>
      <GlobalStyle />
      <TonConnectUIProvider
        manifestUrl={TON_MANIFEST_URL}
        actionsConfiguration={{
          twaReturnUrl: 'https://t.me/clawgospel_bot/hkmo',
        }}
      >
        <AppInner />
      </TonConnectUIProvider>
    </>
  )
}

export default App