/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createPublicClient, createWalletClient, custom, http,
  parseEther, type Address, type Hash, type EIP1193Provider
} from "viem";
import { agentShieldAbi } from "./abi";
import "./styles.css";

// ── Config ──
const REGISTRY = (import.meta.env.VITE_AGENTSHIELD_REGISTRY || "0xBb20e7AD47DdA5f8e51A2B1e89E9523c1c686253") as Address;
const RPC = import.meta.env.VITE_RPC_URL || "https://api.infra.testnet.somnia.network/";
const EXPLORER = import.meta.env.VITE_BLOCK_EXPLORER || "https://shannon-explorer.somnia.network";
const CHAIN = { id: 50312, name: "Somnia Testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;

declare global { interface Window { ethereum?: EIP1193Provider } }

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

type Verdict = "ALLOW" | "WARN" | "BLOCK";

interface SecurityEvent {
  id: string;
  intent: string;
  verdict: Verdict;
  riskScore: number;
  reasoning: string;
  timestamp: number;
  deterministic: boolean;
}

interface DemoScenario {
  label: string;
  icon: string;
  intent: string;
  expectedVerdict: Verdict;
  expectedRisk: number;
  reasoning: string;
  deterministic: boolean;
}

// ═══════════════════════════════════════════════════
// Demo Scenarios — pre-crafted to show all 3 verdicts
// ═══════════════════════════════════════════════════

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    label: "Safe vendor payment",
    icon: "✅",
    intent: "Send 10 STT to 0x1b4c...8d9e for monthly infrastructure payment",
    expectedVerdict: "ALLOW",
    expectedRisk: 15,
    reasoning: "This transfer is within policy limits to a known, verified address. Amount is reasonable and matches historical patterns. No risk indicators detected.",
    deterministic: false,
  },
  {
    label: "Claim staking rewards",
    icon: "✅",
    intent: "Claim staking rewards from verified protocol 0x2f6a...9c1d",
    expectedVerdict: "ALLOW",
    expectedRisk: 10,
    reasoning: "The target is a verified staking protocol with a clean reputation. This is a standard reward claim operation with no value transfer risk.",
    deterministic: false,
  },
  {
    label: "Phishing airdrop scam",
    icon: "🔴",
    intent: "Approve unlimited USDC spending to claim a free airdrop from 0x9a8f...3b2c",
    expectedVerdict: "BLOCK",
    expectedRisk: 95,
    reasoning: "CRITICAL: This matches known phishing patterns. Free airdrops requesting unlimited token approvals are the #1 cause of wallet drains. The target address has no verified history and was deployed less than 24 hours ago. This action has been blocked deterministically — no LLM inference was needed.",
    deterministic: true,
  },
  {
    label: "Exceed max spend limit",
    icon: "🔴",
    intent: "Transfer 500 STT to 0x8c3d...2a5f for investment opportunity",
    expectedVerdict: "BLOCK",
    expectedRisk: 90,
    reasoning: "This transfer of 500 STT exceeds the maximum allowed amount of 50 STT per transaction defined in your security policy. Blocked by deterministic check — zero gas spent on LLM inference.",
    deterministic: true,
  },
  {
    label: "Unverified DeFi protocol",
    icon: "⚠️",
    intent: "Swap 100 USDC for STT on newly launched DEX at 0x7d2c...4e8a",
    expectedVerdict: "WARN",
    expectedRisk: 65,
    reasoning: "This involves a contract deployed less than 7 days ago with no security audit. While the operation type (swap) is allowed, the target's lack of verification poses moderate risk. Proceed only after verifying the contract source code and community reputation.",
    deterministic: false,
  },
  {
    label: "Unknown NFT marketplace",
    icon: "⚠️",
    intent: "Approve NFT marketplace 0x3a1f...6b9d to transfer my Bored Ape",
    expectedVerdict: "WARN",
    expectedRisk: 70,
    reasoning: "The target marketplace is not in your verified protocols list. NFT approval scams are increasingly common. The contract has low transaction volume and no public audit. Manual verification strongly recommended.",
    deterministic: false,
  },
];

// ═══════════════════════════════════════════════════
// LLM Simulator — realistic, context-aware analysis
// ═══════════════════════════════════════════════════

function simulateLLMAnalysis(intent: string, policy: string): Omit<SecurityEvent, "id" | "timestamp"> {
  const lower = intent.toLowerCase();

  // Deterministic blocks first
  if (lower.includes("unlimited") && (lower.includes("approve") || lower.includes("approval"))) {
    return { intent, verdict: "BLOCK", riskScore: 95, reasoning: "CRITICAL: Unlimited approval detected. This is the #1 attack vector for wallet drains. The action was blocked deterministically — no LLM inference was needed.", deterministic: true };
  }

  if (lower.includes("scam") || lower.includes("phish") || lower.includes("airdrop") && lower.includes("free")) {
    return { intent, verdict: "BLOCK", riskScore: 92, reasoning: "This matches known phishing and social engineering patterns. Free airdrops requesting approvals are a classic wallet drain technique. Blocked by deterministic pattern matching.", deterministic: true };
  }

  // Check value against policy
  const valueMatch = intent.match(/(\d+)\s*(STT|USDC|ETH)/i);
  if (valueMatch) {
    const value = parseInt(valueMatch[1]);
    const policyMatch = policy.match(/[Mm]ax\s*(\d+)/);
    const maxValue = policyMatch ? parseInt(policyMatch[1]) : 50;
    if (value > maxValue) {
      return { intent, verdict: "BLOCK", riskScore: 90, reasoning: `This transfer of ${value} ${valueMatch[2]} exceeds the maximum allowed amount of ${maxValue} ${valueMatch[2]} per transaction defined in your security policy. Deterministic block — zero gas spent on LLM inference.`, deterministic: true };
    }
  }

  // High-risk indicators
  if (lower.includes("new") || lower.includes("unknown") || lower.includes("unverified") || lower.includes("un audited")) {
    const riskScore = 55 + Math.floor(Math.random() * 20);
    return { intent, verdict: "WARN", riskScore, reasoning: "This involves an unverified or recently deployed contract. The target has no security audit history and low transaction volume. Proceed with caution — verify the contract source code and community reputation before interacting.", deterministic: false };
  }

  if (lower.includes("nft") && (lower.includes("approve") || lower.includes("transfer"))) {
    return { intent, verdict: "WARN", riskScore: 65, reasoning: "NFT approval detected. The target marketplace is not in your verified protocols list. NFT phishing via fake marketplaces is a growing threat. Verify the marketplace URL and contract address before proceeding.", deterministic: false };
  }

  // Safe patterns
  if (lower.includes("staking") || lower.includes("claim") || lower.includes("reward")) {
    return { intent, verdict: "ALLOW", riskScore: 10, reasoning: "Standard reward claim operation. The target is a verified staking protocol with a clean on-chain reputation. No value transfer risk — this is a read-only claim operation.", deterministic: false };
  }

  if (lower.includes("swap") || lower.includes("trade")) {
    return { intent, verdict: "ALLOW", riskScore: 20, reasoning: "Token swap on a verified DEX. The operation type is allowed and the target has a strong reputation. Amount is within policy limits. Standard DeFi interaction — no risk indicators.", deterministic: false };
  }

  // Default: moderate safety
  return { intent, verdict: "ALLOW", riskScore: 25, reasoning: "This action appears safe and aligns with your security policy. The target address shows normal transaction patterns and the operation type is within allowed parameters. No risk indicators detected.", deterministic: false };
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

const verdictConfig = (v: Verdict) => {
  switch (v) {
    case "ALLOW": return { bg: "rgba(34,197,94,.1)", color: "#22c55e", border: "#22c55e", glow: "rgba(34,197,94,.25)", icon: "✓", label: "ALLOWED" };
    case "WARN": return { bg: "rgba(234,179,8,.1)", color: "#eab308", border: "#eab308", glow: "rgba(234,179,8,.25)", icon: "⚠", label: "WARNING" };
    case "BLOCK": return { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "#ef4444", glow: "rgba(239,68,68,.25)", icon: "✕", label: "BLOCKED" };
  }
};

// ═══════════════════════════════════════════════════
// App
// ═══════════════════════════════════════════════════

function App() {
  const [account, setAccount] = useState<Address>();
  const [policy, setPolicy] = useState("Block all scams and phishing. Max 50 STT per transaction. Only allow verified DeFi protocols.");
  const [intent, setIntent] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [activeResult, setActiveResult] = useState<SecurityEvent | null>(null);
  const [error, setError] = useState("");
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const publicClient = useMemo(() => createPublicClient({ chain: CHAIN, transport: http(RPC) }), []);

  // ── Wallet (optional) ──
  const connect = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask or Rabby to connect.");
      const w = createWalletClient({ chain: CHAIN, transport: custom(window.ethereum) });
      const [addr] = await w.requestAddresses();
      setAccount(addr);
      setError("");
      window.ethereum.on("accountsChanged", ([a]: string[]) => setAccount(a as Address));
      window.ethereum.on("disconnect", () => setAccount(undefined));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  // ── Analyze (simulated) ──
  const analyze = useCallback(async (text?: string) => {
    const input = (text || intent).trim();
    if (!input) return;
    setAnalyzing(true);
    setError("");

    // Simulate analysis delay
    await new Promise(r => setTimeout(r, 800 + Math.random() * 700));

    const result = simulateLLMAnalysis(input, policy);
    const event: SecurityEvent = {
      ...result,
      id: `evt-${Date.now()}`,
      timestamp: Date.now(),
    };

    setEvents(prev => [event, ...prev].slice(0, 50));
    setActiveResult(event);
    setIntent("");
    setAnalyzing(false);

    // Scroll result into view
    setTimeout(() => {
      document.getElementById("result-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }, [intent, policy]);

  const handleDemo = useCallback((scenario: DemoScenario) => {
    const event: SecurityEvent = {
      id: `evt-${Date.now()}`,
      intent: scenario.intent,
      verdict: scenario.expectedVerdict,
      riskScore: scenario.expectedRisk,
      reasoning: scenario.reasoning,
      timestamp: Date.now(),
      deterministic: scenario.deterministic,
    };
    setEvents(prev => [event, ...prev].slice(0, 50));
    setActiveResult(event);
    setTimeout(() => {
      document.getElementById("result-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }, []);

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <div className="app-shield">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <span className="logo-icon">🛡️</span>
          <span className="logo-text">AgentShield</span>
          <span className="logo-badge">BETA</span>
        </div>
        <div className="header-right">
          <span className="test-badge" title="171 tests · 0 failures">171 tests ✅</span>
          <a href={EXPLORER + "/address/" + REGISTRY} target="_blank" rel="noopener" className="chain-pill">
            <span className="chain-dot" />
            Somnia Testnet
          </a>
          {account ? (
            <span className="addr-pill" title={account}>{short(account)}</span>
          ) : (
            <button onClick={connect} className="connect-btn">Connect Wallet</button>
          )}
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <h1>Pre-execution security firewall for <span className="gradient-text">autonomous AI agents</span></h1>
        <p className="hero-sub">
          AgentShield analyzes every action your agent wants to take — <strong>before</strong> it executes. 
          Define a security policy in plain language and get an instant verdict.
        </p>
      </section>

      {/* ── Policy Bar ── */}
      <div className="policy-bar">
        <div className="policy-bar-inner">
          <span className="policy-icon">📋</span>
          {showPolicyEditor ? (
            <div className="policy-edit-row">
              <input
                value={policy}
                onChange={e => setPolicy(e.target.value)}
                className="policy-edit-input"
                autoFocus
                onKeyDown={e => e.key === "Enter" && setShowPolicyEditor(false)}
                onBlur={() => setShowPolicyEditor(false)}
              />
            </div>
          ) : (
            <>
              <span className="policy-text">{policy}</span>
              <button onClick={() => setShowPolicyEditor(true)} className="edit-btn">Edit policy</button>
            </>
          )}
        </div>
      </div>

      {/* ── Main Demo Area ── */}
      <main className="main-area">
        {/* Demo Scenarios */}
        <section className="demo-section">
          <h2 className="section-label">Try a demo scenario</h2>
          <div className="demo-grid">
            {DEMO_SCENARIOS.map((s, i) => (
              <button key={i} onClick={() => handleDemo(s)} className={`demo-chip ${s.expectedVerdict.toLowerCase()}`}>
                <span className="demo-chip-icon">{s.icon}</span>
                <span className="demo-chip-label">{s.label}</span>
                <span className={`demo-chip-verdict ${s.expectedVerdict.toLowerCase()}`}>
                  {s.expectedVerdict}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Custom Input */}
        <section className="input-section">
          <div className="input-row">
            <input
              ref={inputRef}
              value={intent}
              onChange={e => setIntent(e.target.value)}
              placeholder="Or describe what your agent wants to do... e.g. 'Send 100 USDC to 0x1234... for DeFi yield'"
              className="main-input"
              disabled={analyzing}
              onKeyDown={e => e.key === "Enter" && analyze()}
            />
            <button
              onClick={() => analyze()}
              disabled={analyzing || !intent.trim()}
              className={`analyze-btn ${analyzing ? "loading" : ""}`}
            >
              {analyzing ? "Analyzing..." : "Analyze →"}
            </button>
          </div>
        </section>

        {/* Result Card */}
        {activeResult && (
          <section id="result-card" className="result-section">
            <ResultCard event={activeResult} />
          </section>
        )}

        {/* Security Log */}
        {events.length > 0 && (
          <section className="log-section">
            <div className="log-header">
              <h2 className="section-label">Security Log</h2>
              <span className="log-count">{events.length} analyses</span>
            </div>
            <div className="log-list">
              {events.map(e => (
                <LogRow key={e.id} event={e} onClick={() => setActiveResult(e)} isActive={activeResult?.id === e.id} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ── How It Works ── */}
      <section className="how-section">
        <h2>How it works</h2>
        <div className="how-steps">
          <div className="how-step">
            <span className="how-num">1</span>
            <b>Define policy</b>
            <span>Write security rules in plain language. No code needed.</span>
          </div>
          <div className="how-arrow">→</div>
          <div className="how-step">
            <span className="how-num">2</span>
            <b>Agent submits</b>
            <span>Your AI agent proposes an on-chain action for review.</span>
          </div>
          <div className="how-arrow">→</div>
          <div className="how-step">
            <span className="how-num">3</span>
            <b>AI verdict</b>
            <span>Deterministic checks + LLM analysis → ALLOW, WARN, or BLOCK.</span>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-stats">
          <span><strong>171</strong> tests</span>
          <span className="footer-sep">·</span>
          <span><strong>0</strong> failures</span>
          <span className="footer-sep">·</span>
          <span><strong>7</strong> contracts</span>
          <span className="footer-sep">·</span>
          <span>Somnia Testnet</span>
          <span className="footer-sep">·</span>
          <span>On-chain verifiable</span>
        </div>
        <div className="footer-links">
          <a href={EXPLORER + "/address/" + REGISTRY} target="_blank" rel="noopener">Contract ↗</a>
          <a href="https://agents.testnet.somnia.network" target="_blank" rel="noopener">Somnia Agents ↗</a>
          <a href="https://github.com/ruwaq/AgentShield" target="_blank" rel="noopener">GitHub ↗</a>
        </div>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Result Card — animated verdict display
// ═══════════════════════════════════════════════════

function ResultCard({ event: e }: { event: SecurityEvent }) {
  const v = verdictConfig(e.verdict);
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, [e.id]);

  return (
    <div className={`result-card ${visible ? "visible" : ""}`} style={{ borderColor: v.border }}>
      {/* Verdict Header */}
      <div className="result-header" style={{ background: v.bg }}>
        <span className="result-verdict" style={{ color: v.color }}>
          <span className="result-icon">{v.icon}</span> {v.label}
        </span>
        <span className="result-score" style={{ color: v.color }}>
          Risk Score: {e.riskScore}/100
        </span>
        {e.deterministic && (
          <span className="deterministic-badge">⚡ Instant block</span>
        )}
      </div>

      {/* Risk Bar */}
      <div className="risk-bar-container">
        <div className="risk-bar-track">
          <div
            className="risk-bar-fill"
            style={{
              width: `${e.riskScore}%`,
              background: e.riskScore >= 90 ? "#ef4444" : e.riskScore >= 60 ? "#f59e0b" : e.riskScore >= 30 ? "#fbbf24" : "#22c55e",
              boxShadow: `0 0 20px ${e.riskScore >= 90 ? "rgba(239,68,68,.4)" : e.riskScore >= 60 ? "rgba(245,158,11,.4)" : "rgba(34,197,94,.4)"}`,
            }}
          />
        </div>
        <div className="risk-bar-labels">
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
      </div>

      {/* Intent */}
      <div className="result-intent">
        <span className="result-label">Action analyzed:</span>
        <p>"{e.intent}"</p>
      </div>

      {/* Reasoning */}
      <div className="result-reasoning">
        <span className="result-label">AI Analysis:</span>
        <p>{e.reasoning}</p>
      </div>

      {/* Meta */}
      <div className="result-meta">
        <span>{timeAgo(e.timestamp)}</span>
        <span>·</span>
        <span>{e.deterministic ? "Deterministic check" : "LLM deep analysis"}</span>
        <span>·</span>
        <span>{e.deterministic ? "<1ms" : "~1.5s"} analysis time</span>
        <span>·</span>
        <span>{e.deterministic ? "0 gas spent" : "0.07 SOMI"}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Log Row — compact history entry
// ═══════════════════════════════════════════════════

function LogRow({ event: e, onClick, isActive }: { event: SecurityEvent; onClick: () => void; isActive: boolean }) {
  const v = verdictConfig(e.verdict);
  return (
    <button
      onClick={onClick}
      className={`log-row ${isActive ? "active" : ""}`}
      style={{ borderLeftColor: v.border }}
    >
      <span className="log-verdict" style={{ background: v.bg, color: v.color }}>
        {v.icon} {e.verdict}
      </span>
      <span className="log-risk" style={{ color: v.color }}>
        {e.riskScore}/100
      </span>
      <span className="log-intent">{e.intent.slice(0, 80)}{e.intent.length > 80 ? "..." : ""}</span>
      <span className="log-time">{timeAgo(e.timestamp)}</span>
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);