/// <reference types="vite/client" />
import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { type Chain } from "viem";

// ═══════════════════════════════════════════════════
// Chain: Somnia Testnet
// ═══════════════════════════════════════════════════

export const somniaTestnet = {
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        import.meta.env.VITE_RPC_URL ||
          "https://api.infra.testnet.somnia.network/",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
} as const satisfies Chain;

// ═══════════════════════════════════════════════════
// Wagmi Config
// ═══════════════════════════════════════════════════

export const config = createConfig({
  chains: [somniaTestnet],
  connectors: [
    // EIP-6963: detecta TODAS las wallets del navegador (MetaMask, Rabby, Rainbow, etc.)
    // sin competir por window.ethereum. Cada wallet se anuncia con su propio provider.
    injected({
      // shimDisconnect: true — necesario para que wagmi detecte cuando el usuario
      // desconecta desde la wallet (no solo desde la dApp)
      shimDisconnect: true,
    }),
    // WalletConnect v2: permite conexión desde wallets mobile (QR + deep link)
    // El projectId se obtiene gratis en https://cloud.reown.com
    walletConnect({
      projectId:
        import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
        "aegis-local-dev", // fallback para desarrollo local
    }),
  ],
  transports: {
    [somniaTestnet.id]: http(),
  },
  // 🧠 Multi-injected provider discovery: si hay múltiples wallets instaladas,
  // wagmi las detecta todas y el usuario elige cuál usar
  multiInjectedProviderDiscovery: true,
});

// ═══════════════════════════════════════════════════
// Constantes del contrato
// ═══════════════════════════════════════════════════

export const AEGIS_ADDRESS = (import.meta.env.VITE_AEGIS_V2 ||
  "0xb30cfD0A823450e287273DEa5A1a7004E265b140") as `0x${string}`;

export const EXPLORER_URL = "https://shannon-explorer.somnia.network";