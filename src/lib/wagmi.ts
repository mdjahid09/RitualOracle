import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

// Define Ritual Testnet (Placeholder - update with real RPC/ChainID)
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

export const config = createConfig({
  chains: [ritualTestnet, sepolia, mainnet],
  connectors: [
    injected(),
  ],
  transports: {
    [ritualTestnet.id]: http(),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
});
