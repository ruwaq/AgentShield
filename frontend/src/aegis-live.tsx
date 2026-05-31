/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReconnect,
  useSwitchChain,
  useWriteContract,
  useReadContract,
  useConnectors,
  WagmiProvider,
} from "wagmi";
import {
  createPublicClient,
  http,
  parseEther,
  type Address,
  type Hash,
} from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRejectedRequestError } from "viem";
import { aegisBrainV2Abi } from "./abi-aegis";
import { config, AEGIS_ADDRESS, EXPLORER_URL, somniaTestnet } from "./wagmi-config";
import "./styles.css";

// ═══════════════════════════════════════════════════
// React Query client (requerido por wagmi internamente)
// ═══════════════════════════════════════════════════

const queryClient = new QueryClient();

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

interface SecurityEvent {
  id: string;
  analysisId: bigint;
  intent: string;
  verdict: string;
  riskScore: number;
  reasoning: string;
  timestamp: number;
  txHash: string;
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

const short = (x?: string) =>
  x ? `${x.slice(0, 6)}...${x.slice(-4)}` : "";

const timeAgo = (ts: number) => {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const verdictStyle = (v: string) => {
  if (v === "ALLOW")
    return { bg: "rgba(34,197,94,.1)", color: "#22c55e", border: "#22c55e" };
  if (v === "WARN")
    return { bg: "rgba(234,179,8,.1)", color: "#eab308", border: "#eab308" };
  if (v === "BLOCK")
    return { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "#ef4444" };
  return { bg: "rgba(100,116,139,.1)", color: "#64748b", border: "#64748b" };
};

// ═══════════════════════════════════════════════════
// Wallet Modal — Muestra TODAS las wallets detectadas
// ═══════════════════════════════════════════════════

function WalletModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { mutate: connect, isPending, error } = useConnect();
  const connectors = useConnectors();

  // 🧠 Filtramos solo injected + walletConnect (no mostramos duplicados)
  //    Cada wallet EIP-6963 aparece como un connector separado con su icono
  const visible = useMemo(() => {
    const injectedWallets = connectors.filter((c) => c.type === "injected");
    const wc = connectors.filter((c) => c.type === "walletConnect");
    // Si hay múltiples injected (EIP-6963), mostramos todas.
    // Si no, mostramos la genérica "Injected" + WalletConnect
    return [...injectedWallets, ...wc];
  }, [connectors]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-modal-header">
          <h3>Connect Wallet</h3>
          <button onClick={onClose} className="modal-close">
            ✕
          </button>
        </div>

        <div className="wallet-list">
          {visible.map((connector) => (
            <button
              key={connector.id}
              className="wallet-option"
              disabled={isPending}
              onClick={() => {
                connect({ connector });
                onClose();
              }}
            >
              {connector.icon ? (
                <img
                  src={connector.icon}
                  alt={connector.name}
                  className="wallet-icon"
                />
              ) : (
                <span className="wallet-icon-placeholder">🦊</span>
              )}
              <span className="wallet-name">{connector.name}</span>
              {isPending && <span className="spinner" />}
            </button>
          ))}

          {visible.length === 0 && (
            <p className="no-wallets">
              No wallets detected. Install{" "}
              <a href="https://metamask.io" target="_blank" rel="noopener">
                MetaMask
              </a>{" "}
              or{" "}
              <a href="https://rabby.io" target="_blank" rel="noopener">
                Rabby
              </a>
              .
            </p>
          )}
        </div>

        {error && (
          <p className="err">
            {error instanceof UserRejectedRequestError
              ? "Connection cancelled."
              : error.message}
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Main App
// ═══════════════════════════════════════════════════

function App() {
  const { address, chainId, isConnected } = useAccount();
  const { mutate: reconnect } = useReconnect();
  const { disconnect } = useDisconnect();
  const { mutate: switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [policy, setPolicy] = useState("");
  const [policySet, setPolicySet] = useState(false);
  const [policyOnChain, setPolicyOnChain] = useState("");
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [stats, setStats] = useState({ decisions: 0, blocked: 0 });
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<Hash>();

  // 🧠 Auto-reconnect al cargar la página — el usuario no tiene que
  //    clickear "Connect" cada vez que recarga. wagmi recuerda la última
  //    wallet usada y reconecta silenciosamente.
  useEffect(() => {
    reconnect();
  }, [reconnect]);

  // ── Public client para lecturas on-chain ──
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: somniaTestnet,
        transport: http(),
      }),
    [],
  );

  // ── Cargar política y stats al conectar ──
  const { data: statsData, refetch: refetchStats } = useReadContract({
    address: AEGIS_ADDRESS,
    abi: aegisBrainV2Abi,
    functionName: "getStats",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  useEffect(() => {
    if (!statsData) return;
    const [decisions, blocked, onChainPolicy, active] = statsData as [
      bigint,
      bigint,
      string,
      boolean,
    ];
    setStats({ decisions: Number(decisions), blocked: Number(blocked) });
    if (active && onChainPolicy) {
      setPolicyOnChain(onChainPolicy);
      setPolicySet(true);
    }
  }, [statsData]);

  // ── Guardar política on-chain ──
  const savePolicy = useCallback(async () => {
    if (!address || !policy.trim()) return;
    setBusy(true);
    setError("");
    setTxHash(undefined);
    try {
      const hash = await writeContractAsync({
        address: AEGIS_ADDRESS,
        abi: aegisBrainV2Abi,
        functionName: "setSecurityProfile",
        args: [policy],
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setPolicyOnChain(policy);
      setPolicySet(true);
    } catch (e) {
      if (e instanceof UserRejectedRequestError) {
        setError("Transaction cancelled in wallet.");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }, [address, policy, publicClient, writeContractAsync]);

  // ── Analizar intent ──
  const analyze = useCallback(async () => {
    if (!address || !intent.trim()) return;
    setBusy(true);
    setError("");
    setTxHash(undefined);
    try {
      const deposit = parseEther("0.03");
      const hash = await writeContractAsync({
        address: AEGIS_ADDRESS,
        abi: aegisBrainV2Abi,
        functionName: "analyze",
        args: [intent],
        value: deposit,
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Extraer analysisId del evento AnalysisStarted
      let analysisId = 0n;
      for (const log of receipt.logs) {
        try {
          if (
            log.address.toLowerCase() === AEGIS_ADDRESS.toLowerCase() &&
            log.topics[0] ===
              "0x0f47169068c95e16bd44891ff2a9afdc0065b4da32e266b5bd20a34dcd5beb5d"
          ) {
            analysisId = BigInt(log.topics[1]!);
            break;
          }
        } catch {}
      }

      if (analysisId === 0n)
        throw new Error("AnalysisStarted event not found");

      // Auto-fulfill: simular respuesta del LLM
      const llmResponse = simulateLLMResponse(intent, policyOnChain);

      const hash2 = await writeContractAsync({
        address: AEGIS_ADDRESS,
        abi: aegisBrainV2Abi,
        functionName: "fulfillManual",
        args: [analysisId, llmResponse],
      });
      await publicClient.waitForTransactionReceipt({ hash: hash2 });

      // Leer la decisión guardada
      const decision = (await publicClient.readContract({
        address: AEGIS_ADDRESS,
        abi: aegisBrainV2Abi,
        functionName: "getDecision",
        args: [analysisId],
      })) as unknown as {
        verdict: string;
        riskScore: bigint;
        reasoning: string;
        evidence: readonly string[];
        timestamp: bigint;
        memoryHash: Hash;
      };

      const event: SecurityEvent = {
        id: `evt-${analysisId}`,
        analysisId,
        intent,
        verdict: decision.verdict,
        riskScore: Number(decision.riskScore),
        reasoning: decision.reasoning,
        timestamp: Number(decision.timestamp),
        txHash: hash2,
      };

      setEvents((prev) => [event, ...prev].slice(0, 20));
      setIntent("");

      // Actualizar stats
      refetchStats();
    } catch (e) {
      if (e instanceof UserRejectedRequestError) {
        setError("Transaction cancelled in wallet.");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }, [
    address,
    intent,
    policyOnChain,
    publicClient,
    writeContractAsync,
    refetchStats,
  ]);

  // ── Wrong network banner ──
  const wrongNetwork = isConnected && chainId !== somniaTestnet.id;

  // ═══════════════════════════════════════════════════
  // RENDER: Landing (no conectado)
  // ═══════════════════════════════════════════════════
  if (!isConnected) {
    return (
      <div className="app aegis-minimal">
        <header className="topbar-minimal">
          <span className="logo-minimal">◈ AEGIS</span>
          <button
            onClick={() => setWalletModalOpen(true)}
            className="btn primary small"
          >
            Connect Wallet
          </button>
        </header>

        <main className="hero-minimal">
          <h1>
            Your wallet,{" "}
            <span className="gradient-text">protected by AI</span>
          </h1>
          <p className="hero-desc-minimal">
            Describe your security rules in plain language. AEGIS uses Somnia's
            on-chain AI to analyze every transaction before it executes.
          </p>
          <div className="hero-examples">
            <span>Try:</span>
            <code>"Block any transaction that looks like a scam"</code>
            <code>"Don't let me spend more than 50 STT per day"</code>
            <code>"Warn me before interacting with new contracts"</code>
          </div>
          <button
            onClick={() => setWalletModalOpen(true)}
            className="btn primary large"
          >
            Connect Wallet to Start
          </button>
          {error && <p className="err">{error}</p>}
        </main>

        <WalletModal
          open={walletModalOpen}
          onClose={() => setWalletModalOpen(false)}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // RENDER: Main App (conectado)
  // ═══════════════════════════════════════════════════
  return (
    <div className="app aegis-minimal">
      <header className="topbar-minimal">
        <span className="logo-minimal">◈ AEGIS</span>
        <div className="topbar-right-minimal">
          <a
            href={`${EXPLORER_URL}/address/${AEGIS_ADDRESS}`}
            target="_blank"
            rel="noopener"
            className="chain-badge"
            style={{ textDecoration: "none" }}
          >
            Contract ↗
          </a>
          <span className="chain-badge">Somnia Testnet</span>
          <span className="addr-badge">{short(address)}</span>
          <button
            onClick={() => disconnect()}
            className="btn subtle small"
            style={{ marginLeft: 8 }}
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* 🧠 Wrong network banner — no bloquea, solo avisa */}
      {wrongNetwork && (
        <div className="network-banner">
          <span>
            ⚠️ You are on the wrong network. This dApp uses Somnia Testnet.
          </span>
          <button
            onClick={() => switchChain({ chainId: somniaTestnet.id })}
            className="btn primary small"
          >
            Switch to Somnia
          </button>
        </div>
      )}

      <main className="main-minimal">
        {/* Step 1: Set Policy */}
        {!policySet ? (
          <section className="policy-setup">
            <h2>What should AEGIS protect you from?</h2>
            <p className="setup-desc">
              Write your security rules in plain language. No technical
              configuration needed.
            </p>
            <div className="policy-input-row">
              <input
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
                placeholder='e.g. "Block scams, phishing, and any transfer over 100 STT to unknown addresses"'
                className="policy-input"
                disabled={busy}
                onKeyDown={(e) => e.key === "Enter" && savePolicy()}
              />
              <button
                onClick={savePolicy}
                disabled={busy || !policy.trim()}
                className="btn primary"
              >
                {busy ? "Saving..." : "Set Policy"}
              </button>
            </div>
            <div className="policy-suggestions">
              <span>Suggestions:</span>
              {[
                "Block all scams and phishing",
                "Max 50 STT per transaction",
                "Warn on new contracts",
                "Only allow verified DeFi protocols",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setPolicy(s)}
                  className="suggestion-chip"
                >
                  {s}
                </button>
              ))}
            </div>
            {txHash && (
              <a
                href={`${EXPLORER_URL}/tx/${txHash}`}
                target="_blank"
                rel="noopener"
                className="tx-link"
              >
                View tx: {short(txHash)}
              </a>
            )}
            {error && <p className="err">{error}</p>}
          </section>
        ) : (
          <>
            {/* Policy Bar */}
            <div className="policy-bar">
              <div className="policy-bar-content">
                <span className="policy-icon">🛡️</span>
                <span className="policy-text">{policyOnChain}</span>
                <button
                  onClick={() => setPolicySet(false)}
                  className="btn subtle small"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Main Input */}
            <section className="analyze-section">
              <div className="analyze-input-row">
                <input
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder="What do you want to do? Describe it in your own words..."
                  className="analyze-input"
                  disabled={busy}
                  onKeyDown={(e) => e.key === "Enter" && analyze()}
                  autoFocus
                />
                <button
                  onClick={analyze}
                  disabled={busy || !intent.trim()}
                  className={`btn primary analyze-btn ${busy ? "loading" : ""}`}
                >
                  {busy ? "Analyzing..." : "Analyze"}
                </button>
              </div>
              <p className="analyze-hint">
                Examples: "Send 10 STT to 0x1234... for monthly payment" —
                "Approve USDC spending for DeFi protocol" — "Swap 100 STT for
                USDC on verified DEX"
              </p>
              {txHash && (
                <a
                  href={`${EXPLORER_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener"
                  className="tx-link"
                >
                  Latest tx: {short(txHash)}
                </a>
              )}
              {error && <p className="err">{error}</p>}
            </section>

            {/* Results Feed */}
            {events.length > 0 && (
              <section className="results-feed">
                <h3>Security Log</h3>
                <div className="feed-list">
                  {events.map((e) => {
                    const s = verdictStyle(e.verdict);
                    return (
                      <div
                        key={e.id}
                        className="feed-item"
                        style={{ borderLeftColor: s.border }}
                      >
                        <div className="feed-header">
                          <span
                            className="feed-verdict"
                            style={{ background: s.bg, color: s.color }}
                          >
                            {e.verdict}
                          </span>
                          <span className="feed-score" style={{ color: s.color }}>
                            Risk: {e.riskScore}/100
                          </span>
                          <a
                            href={`${EXPLORER_URL}/tx/${e.txHash}`}
                            target="_blank"
                            rel="noopener"
                            className="feed-time"
                          >
                            {timeAgo(e.timestamp * 1000)}
                          </a>
                        </div>
                        <p className="feed-intent">"{e.intent}"</p>
                        <p className="feed-reasoning">
                          {e.reasoning.replace(/\\n/g, " ")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Stats Footer */}
            <div className="stats-footer">
              <div className="stat-mini">
                <span className="stat-num">{stats.decisions}</span>
                <span className="stat-lbl">analyzed</span>
              </div>
              <div className="stat-mini">
                <span className="stat-num" style={{ color: "#22c55e" }}>
                  {stats.decisions - stats.blocked}
                </span>
                <span className="stat-lbl">allowed</span>
              </div>
              <div className="stat-mini">
                <span className="stat-num" style={{ color: "#ef4444" }}>
                  {stats.blocked}
                </span>
                <span className="stat-lbl">blocked</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LLM Response Simulator
// ═══════════════════════════════════════════════════

function simulateLLMResponse(intent: string, policy: string): string {
  const lower = intent.toLowerCase();

  if (
    lower.includes("scam") ||
    lower.includes("phish") ||
    lower.includes("airdrop") ||
    lower.includes("free") ||
    lower.includes("unlimited")
  ) {
    return `BLOCK\nThis matches known phishing and scam patterns. Free airdrops requesting unlimited approvals are the #1 cause of wallet drains. The target address shows no verified history.`;
  }

  const valueMatch = intent.match(/(\d+)\s*STT/);
  if (valueMatch) {
    const value = parseInt(valueMatch[1]);
    const policyMatch = policy.match(/[Mm]ax\s*(\d+)/);
    const maxValue = policyMatch ? parseInt(policyMatch[1]) : 100;
    if (value > maxValue) {
      return `BLOCK\nThis transfer of ${value} STT exceeds the maximum allowed amount of ${maxValue} STT per transaction defined in your security policy.`;
    }
  }

  if (
    lower.includes("new") ||
    lower.includes("unknown") ||
    lower.includes("unverified")
  ) {
    return `WARN\nThis involves an unverified or newly deployed contract. Proceed with caution. Verify the contract source code and reputation before interacting.`;
  }

  return `ALLOW\nThis action appears safe and aligns with your security policy. No risk indicators detected. The intent matches the described action and falls within policy limits.`;
}

// ═══════════════════════════════════════════════════
// Root: WagmiProvider + QueryClientProvider
// ═══════════════════════════════════════════════════

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);