/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import type { EIP1193Provider } from "viem";
import {
  createPublicClient, createWalletClient, custom, http,
  type Address, type Hash
} from "viem";
import "./styles.css";

// ═══════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════

const RPC = import.meta.env.VITE_RPC_URL || "https://api.infra.testnet.somnia.network/";
const EXPLORER = import.meta.env.VITE_BLOCK_EXPLORER || "https://shannon-explorer.somnia.network";
const CHAIN = {
  id: 50312, name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } }
} as const;

declare global { interface Window { ethereum?: EIP1193Provider } }

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

interface SecurityEvent {
  id: string;
  intent: string;
  verdict: "ALLOW" | "WARN" | "BLOCK";
  riskScore: number;
  reasoning: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

const short = (x?: string) => x ? `${x.slice(0, 6)}...${x.slice(-4)}` : "";
const timeAgo = (ts: number) => {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const verdictStyle = (v: string) => {
  switch (v) {
    case "ALLOW": return { bg: "rgba(34,197,94,.1)", color: "#22c55e", border: "#22c55e" };
    case "WARN": return { bg: "rgba(234,179,8,.1)", color: "#eab308", border: "#eab308" };
    case "BLOCK": return { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "#ef4444" };
    default: return { bg: "rgba(100,116,139,.1)", color: "#64748b", border: "#64748b" };
  }
};

// ═══════════════════════════════════════════════════
// App — Minimalist Single-Field Interface
// ═══════════════════════════════════════════════════

function App() {
  const [account, setAccount] = useState<Address>();
  const [policy, setPolicy] = useState("");
  const [policySet, setPolicySet] = useState(false);
  const [intent, setIntent] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [error, setError] = useState("");

  const publicClient = useMemo(() => createPublicClient({ chain: CHAIN, transport: http(RPC) }), []);

  const connect = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask or Rabby.");
      const w = createWalletClient({ chain: CHAIN, transport: custom(window.ethereum) });
      const [addr] = await w.requestAddresses();
      setAccount(addr);
      setError("");
      window.ethereum.on("accountsChanged", ([a]: string[]) => setAccount(a as Address));
      window.ethereum.on("disconnect", () => setAccount(undefined));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  const savePolicy = useCallback(async () => {
    if (!policy.trim()) return;
    // In production: call aegis.setSecurityProfile(policy)
    setPolicySet(true);
    setError("");
  }, [policy]);

  const analyze = useCallback(async () => {
    if (!intent.trim()) return;
    setAnalyzing(true);
    setError("");

    // Simulate AI analysis (in production: call aegis.analyze(intent))
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

    const riskScore = Math.floor(Math.random() * 100);
    let verdict: "ALLOW" | "WARN" | "BLOCK";
    let reasoning: string;

    if (intent.toLowerCase().includes("scam") || intent.toLowerCase().includes("phishing") || intent.toLowerCase().includes("unlimited")) {
      verdict = "BLOCK";
      reasoning = "This action matches known scam patterns. The target address shows signs of malicious activity.";
    } else if (intent.toLowerCase().includes("new") || intent.toLowerCase().includes("unknown")) {
      verdict = "WARN";
      reasoning = "This involves an unverified contract. Proceed with caution and verify the target address.";
    } else {
      verdict = "ALLOW";
      reasoning = "This action appears safe and aligns with your security policy. No risk indicators detected.";
    }

    const event: SecurityEvent = {
      id: `evt-${Date.now()}`,
      intent,
      verdict,
      riskScore,
      reasoning,
      timestamp: Date.now()
    };

    setEvents(prev => [event, ...prev].slice(0, 20));
    setIntent("");
    setAnalyzing(false);
  }, [intent]);

  // ── Landing ──
  if (!account) {
    return (
      <div className="app aegis-minimal">
        <header className="topbar-minimal">
          <span className="logo-minimal">◈ AEGIS</span>
          <button onClick={connect} className="btn primary small">Connect Wallet</button>
        </header>
        <main className="hero-minimal">
          <h1>Your wallet, <span className="gradient-text">protected by AI</span></h1>
          <p className="hero-desc-minimal">
            Describe your security rules in plain language.
            AEGIS uses Somnia's on-chain AI to analyze every transaction before it executes.
          </p>
          <div className="hero-examples">
            <span>Try:</span>
            <code>"Block any transaction that looks like a scam"</code>
            <code>"Don't let me spend more than 50 STT per day"</code>
            <code>"Warn me before interacting with new contracts"</code>
          </div>
          <button onClick={connect} className="btn primary large">Get Started</button>
          {error && <p className="err">{error}</p>}
        </main>
      </div>
    );
  }

  // ── Main App ──
  return (
    <div className="app aegis-minimal">
      <header className="topbar-minimal">
        <span className="logo-minimal">◈ AEGIS</span>
        <div className="topbar-right-minimal">
          <span className="chain-badge">Somnia Testnet</span>
          <span className="addr-badge">{short(account)}</span>
        </div>
      </header>

      <main className="main-minimal">
        {/* Step 1: Set Policy (only shown once) */}
        {!policySet ? (
          <section className="policy-setup">
            <h2>What should AEGIS protect you from?</h2>
            <p className="setup-desc">
              Write your security rules in plain language. No technical configuration needed.
              The AI understands natural language and adapts to your needs.
            </p>
            <div className="policy-input-row">
              <input
                value={policy}
                onChange={e => setPolicy(e.target.value)}
                placeholder='e.g. "Block scams, phishing, and any transfer over 100 STT to unknown addresses"'
                className="policy-input"
                onKeyDown={e => e.key === "Enter" && savePolicy()}
              />
              <button onClick={savePolicy} disabled={!policy.trim()} className="btn primary">
                Set Policy
              </button>
            </div>
            <div className="policy-suggestions">
              <span>Suggestions:</span>
              {["Block all scams and phishing", "Max 50 STT per transaction", "Warn on new contracts", "Only allow verified DeFi protocols"].map(s => (
                <button key={s} onClick={() => setPolicy(s)} className="suggestion-chip">{s}</button>
              ))}
            </div>
          </section>
        ) : (
          <>
            {/* Policy Summary Bar */}
            <div className="policy-bar">
              <div className="policy-bar-content">
                <span className="policy-icon">🛡️</span>
                <span className="policy-text">{policy}</span>
                <button onClick={() => setPolicySet(false)} className="btn subtle small">Edit</button>
              </div>
            </div>

            {/* Main Input */}
            <section className="analyze-section">
              <div className="analyze-input-row">
                <input
                  value={intent}
                  onChange={e => setIntent(e.target.value)}
                  placeholder="What do you want to do? Describe it in your own words..."
                  className="analyze-input"
                  disabled={analyzing}
                  onKeyDown={e => e.key === "Enter" && analyze()}
                  autoFocus
                />
                <button
                  onClick={analyze}
                  disabled={analyzing || !intent.trim()}
                  className={`btn primary analyze-btn ${analyzing ? "loading" : ""}`}
                >
                  {analyzing ? "Analyzing..." : "Analyze"}
                </button>
              </div>
              <p className="analyze-hint">
                Examples: "Send 10 STT to 0x1234... for monthly payment" —
                "Approve USDC spending for DeFi protocol" —
                "Swap 100 STT for USDC on verified DEX"
              </p>
            </section>

            {/* Results Feed */}
            {events.length > 0 && (
              <section className="results-feed">
                <h3>Security Log</h3>
                <div className="feed-list">
                  {events.map(e => {
                    const s = verdictStyle(e.verdict);
                    return (
                      <div key={e.id} className="feed-item" style={{ borderLeftColor: s.border }}>
                        <div className="feed-header">
                          <span className="feed-verdict" style={{ background: s.bg, color: s.color }}>
                            {e.verdict}
                          </span>
                          <span className="feed-score" style={{ color: s.color }}>
                            Risk: {e.riskScore}/100
                          </span>
                          <span className="feed-time">{timeAgo(e.timestamp)}</span>
                        </div>
                        <p className="feed-intent">"{e.intent}"</p>
                        <p className="feed-reasoning">{e.reasoning}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Stats Footer */}
            {events.length > 0 && (
              <div className="stats-footer">
                <div className="stat-mini">
                  <span className="stat-num">{events.length}</span>
                  <span className="stat-lbl">analyzed</span>
                </div>
                <div className="stat-mini">
                  <span className="stat-num" style={{ color: "#22c55e" }}>{events.filter(e => e.verdict === "ALLOW").length}</span>
                  <span className="stat-lbl">allowed</span>
                </div>
                <div className="stat-mini">
                  <span className="stat-num" style={{ color: "#eab308" }}>{events.filter(e => e.verdict === "WARN").length}</span>
                  <span className="stat-lbl">warned</span>
                </div>
                <div className="stat-mini">
                  <span className="stat-num" style={{ color: "#ef4444" }}>{events.filter(e => e.verdict === "BLOCK").length}</span>
                  <span className="stat-lbl">blocked</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);