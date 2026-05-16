import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected, walletConnect, metaMask } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { reconnect } from '@wagmi/core';

// Define Ritual Testnet
export const ritualTestnet = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: {
    name: 'Ritual',
    symbol: 'RITUAL',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.ritualfoundation.org'],
    },
  },
  blockExplorers: {
    default: { name: 'Ritual Explorer', url: 'https://explorer.ritualfoundation.org' },
  },
  testnet: true,
});

// Use a projectId from WalletConnect (Cloud)
// Users should replace this with their own at https://cloud.walletconnect.com
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '3fcc6b4468c7849c493c0bc589417852';

export const config = createConfig({
  chains: [ritualTestnet, sepolia, mainnet],
  connectors: [
    injected(),
    metaMask(),
    walletConnect({
      projectId,
      showQrModal: true,
    }),
  ],
  transports: {
    [ritualTestnet.id]: http(),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
});

// Reconnect on load - moved to better handle environment constraints
// reconnect(config);
