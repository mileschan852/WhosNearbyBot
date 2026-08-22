import React, { useState } from 'react'
import styled from 'styled-components'
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react'

const PageContainer = styled.div`
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Title = styled.h1`
  font-size: 22px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 8px;
`

const NFTList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const NFTCard = styled.div`
  background: var(--tg-theme-secondary-bg-color, #f5f5f5);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const NFTRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const NFTName = styled.span`
  font-size: 16px;
  font-weight: 500;
`

const NFTPrice = styled.span`
  font-size: 14px;
  color: var(--tg-theme-hint-color, #888);
`

const MintButton = styled.button<{ disabled?: boolean; minted?: boolean }>`
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: ${p => (p.disabled || p.minted) ? 'default' : 'pointer'};
  background: ${p => p.minted
    ? 'var(--tg-theme-hint-color, #888)'
    : p.disabled
      ? 'rgba(0,0,0,0.08)'
      : 'var(--tg-theme-button-color, #007aff)'
  };
  color: ${p => p.minted
    ? '#fff'
    : p.disabled
      ? 'var(--tg-theme-hint-color, #999)'
      : 'var(--tg-theme-button-text-color, #fff)'
  };
  opacity: ${p => (p.disabled && !p.minted) ? 0.5 : 1};
  transition: opacity 0.15s;
`

const ConnectedBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  padding: 8px;
  background: rgba(76, 217, 100, 0.1);
  border-radius: 8px;
  font-size: 12px;
  color: #4cd964;
`

interface NFTItem {
  id: string
  name: string
  description: string
  basePrice: number // in TON
  currency: 'TON'
  mintedCount: number
  maxSupply: number
}

const NFT_ITEMS: NFTItem[] = [
  {
    id: 'hide-age',
    name: 'Hide Age',
    description: 'Hide your age from other users',
    basePrice: 1,
    currency: 'TON',
    mintedCount: 0,
    maxSupply: 500,
  },
  {
    id: 'unlock-filter',
    name: 'Unlock Filter',
    description: 'Access advanced search filters',
    basePrice: 2,
    currency: 'TON',
    mintedCount: 0,
    maxSupply: 500,
  },
  {
    id: 'invisible',
    name: 'Invisible Mode',
    description: 'Browse without being seen',
    basePrice: 3,
    currency: 'TON',
    mintedCount: 0,
    maxSupply: 500,
  },
]

function getCurrentPrice(basePrice: number, mintedCount: number): number {
  return basePrice + (basePrice * mintedCount)
}

const MintPage: React.FC = () => {
  const [tonConnectUI] = useTonConnectUI()
  const address = useTonAddress()
  const [nftItems, setNftItems] = useState<NFTItem[]>(NFT_ITEMS)
  const [mintingId, setMintingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleMint = async (item: NFTItem) => {
    if (!address) {
      tonConnectUI.openModal()
      return
    }

    if (mintingId) return

    setMintingId(item.id)
    setError(null)

    const price = getCurrentPrice(item.basePrice, item.mintedCount)
    const nanoAmount = BigInt(Math.floor(price * 1_000_000_000))

    try {
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ',
            amount: nanoAmount.toString(),
          },
        ],
      })

      if (result.boc) {
        setNftItems(prev =>
          prev.map(n =>
            n.id === item.id
              ? { ...n, mintedCount: n.mintedCount + 1 }
              : n
          )
        )
      }
    } catch (err: any) {
      setError(err?.message || 'Transaction cancelled')
    } finally {
      setMintingId(null)
    }
  }

  return (
    <PageContainer>
      <Title>Mint NFTs</Title>

      {address && (
        <ConnectedBadge>
          <span>Wallet connected: {address.slice(0, 6)}...{address.slice(-4)}</span>
        </ConnectedBadge>
      )}

      <NFTList>
        {nftItems.map(item => {
          const price = getCurrentPrice(item.basePrice, item.mintedCount)
          const isSoldOut = item.mintedCount >= item.maxSupply

          return (
            <NFTCard key={item.id}>
              <NFTRow>
                <NFTName>{item.name}</NFTName>
                <NFTPrice>{price} {item.currency}</NFTPrice>
              </NFTRow>
              <NFTRow>
                <span style={{ fontSize: 13, color: 'var(--tg-theme-hint-color, #888)' }}>
                  {item.description}
                </span>
                <span style={{ fontSize: 12, color: 'var(--tg-theme-hint-color, #888)' }}>
                  {item.mintedCount}/{item.maxSupply}
                </span>
              </NFTRow>
              <MintButton
                disabled={!address || mintingId === item.id || isSoldOut}
                minted={isSoldOut}
                onClick={() => handleMint(item)}
              >
                {isSoldOut
                  ? 'Sold Out'
                  : mintingId === item.id
                    ? 'Minting...'
                    : !address
                      ? 'Connect Wallet to Mint'
                      : `Mint — ${price} TON`
                }
              </MintButton>
            </NFTCard>
          )
        })}
      </NFTList>

      {error && (
        <div style={{
          padding: 10,
          background: 'rgba(255,59,48,0.1)',
          borderRadius: 8,
          fontSize: 13,
          color: '#ff3b30',
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}
    </PageContainer>
  )
}

export default MintPage