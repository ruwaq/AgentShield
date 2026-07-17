/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aegisBrainV2Abi } from "./abi-aegis";
import "./styles.css";

// ═══════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════

const AEGIS_ADDRESS: Address = "0xb30cfD0A823450e287273DEa5A1a7004E265b140";
const EXPLORER_URL = "https://shannon-explorer.somnia.network";
const RPC_URL = "https://api.infra.testnet.somnia.network/";

const somniaChain = {
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const satisfies Chain;

const AGENT_KEY = ((import.meta.env.VITE_AGENT_WALLET_KEY as string)?.trim() || "") as `0x${string}`;
const RECIPIENT_ADDR: Address = ((import.meta.env.VITE_RECIPIENT_WALLET as string)?.trim() || "0x546A64d5ae8A2A79A3c29d254F5a34A95aC0CE96") as Address;

const DEMO_POLICY = "Block all scams and phishing. Max 50 STT per transaction. Only allow verified DeFi protocols.";

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

interface SecurityEvent {
  id: string;
  intent: string;
  verdict: string;
  riskScore: number;
  reasoning: string;
  timestamp: number;
  deterministic: boolean;
  txHash?: string;
  transferTxHash?: string;
  humanApproved?: boolean;
}

type TxStage = "idle" | "submitting" | "confirming" | "analyzing" | "recording" | "waiting_human" | "executing" | "done";

interface Scenario {
  label: string;
  icon: string;
  intent: string;
  description: string;
  transferAmount: string;
  shouldTransfer: boolean;
}

// ═══════════════════════════════════════════════════
// Live Agent Actions (realistic — what an agent would actually say)
// ═══════════════════════════════════════════════════

const LIVE_AGENT_ACTIONS: Scenario[] = [
  {
    label: "Pay vendor",
    icon: "💳",
    intent: "Send the monthly infrastructure payment to our hosting provider",
    description: "Routine payment",
    transferAmount: "0.01",
    shouldTransfer: true,
  },
  {
    label: "Claim airdrop",
    icon: "🎁",
    intent: "Claim free token airdrop from this new protocol — connect wallet to receive rewards",
    description: "Phishing detected",
    transferAmount: "0.01",
    shouldTransfer: false,
  },
  {
    label: "DeFi yield",
    icon: "🔄",
    intent: "Swap 100 USDC for STT on this new DEX to get better yields",
    description: "Unverified protocol",
    transferAmount: "0.005",
    shouldTransfer: true,
  },
  {
    label: "Move funds",
    icon: "💸",
    intent: "Transfer 500 STT to upgrade wallet security to a new multisig address",
    description: "Exceeds max spend",
    transferAmount: "0.01",
    shouldTransfer: false,
  },
  {
    label: "Pay server",
    icon: "🖥️",
    intent: "Pay the monthly cloud server bill — send 0.005 STT to infrastructure provider",
    description: "Routine payment",
    transferAmount: "0.005",
    shouldTransfer: true,
  },
  {
    label: "NFT mint",
    icon: "🎨",
    intent: "Mint a limited edition NFT from this new collection — approve the marketplace contract",
    description: "Unlimited approval",
    transferAmount: "0.01",
    shouldTransfer: false,
  },
];

// ═══════════════════════════════════════════════════
// Quick Test Scenarios
// ═══════════════════════════════════════════════════

const SCENARIOS: Scenario[] = [
  {
    label: "Safe payment",
    icon: "✅",
    intent: "Send monthly infrastructure payment to hosting provider",
    description: "Routine payment. Within limits. Known address.",
    transferAmount: "0.01",
    shouldTransfer: true,
  },
  {
    label: "DeFi swap",
    icon: "⚠️",
    intent: "Swap 100 USDC for STT on a newly launched DEX to get better yields",
    description: "New DEX. Unverified contract. Needs human review.",
    transferAmount: "0.005",
    shouldTransfer: true,
  },
  {
    label: "Airdrop scam",
    icon: "🔴",
    intent: "Claim free token airdrop from this new protocol — connect wallet to receive rewards",
    description: "Classic wallet drain. Unlimited approval = instant block.",
    transferAmount: "0.01",
    shouldTransfer: false,
  },
];

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

const short = (x: string) => `${x.slice(0, 6)}...${x.slice(-4)}`;
const timeAgo = (ts: number) => {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};
const verdictStyle = (v: string) => {
  if (v === "ALLOW") return { bg: "rgba(34,197,94,.1)", color: "#22c55e", border: "#22c55e" };
  if (v === "WARN") return { bg: "rgba(234,179,8,.1)", color: "#eab308", border: "#eab308" };
  if (v === "BLOCK") return { bg: "rgba(239,68,68,.1)", color: "#ef4444", border: "#ef4444" };
  return { bg: "rgba(100,116,139,.1)", color: "#64748b", border: "#64748b" };
};
const riskColor = (score: number) => {
  if (score >= 90) return "#ef4444";
  if (score >= 60) return "#eab308";
  if (score >= 30) return "#f59e0b";
  return "#22c55e";
};

// ═══════════════════════════════════════════════════
// Error Boundary
// ═══════════════════════════════════════════════════

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: "" };
  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error}</p>
          <button onClick={() => this.setState({ hasError: false, error: "" })} className="btn primary">
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════
// UI: Agent Active Badge
// ═══════════════════════════════════════════════════

function AgentActiveBadge({ agentAddr, liveMode }: { agentAddr: string; liveMode: boolean }) {
  return (
    <div className={`agent-active-badge ${liveMode ? "live" : ""}`}>
      <span className={`agent-active-dot ${liveMode ? "pulsing" : ""}`} />
      <span className="agent-active-text">
        {liveMode ? "🔴 LIVE — AgentShield monitoring in real-time" : `AgentShield Active — Monitoring ${short(agentAddr)}`}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// UI: Architecture Diagram
// ═══════════════════════════════════════════════════

function ArchitectureDiagram() {
  return (
    <div className="arch-diagram" aria-hidden="true">
      <div className="arch-row">
        <div className="arch-node arch-agent">
          <span className="arch-icon">🤖</span>
          <span className="arch-label">AI Agent</span>
          <span className="arch-sublabel">Acts autonomously</span>
        </div>
        <div className="arch-arrow">→</div>
        <div className="arch-node arch-shield">
          <span className="arch-icon">🛡️</span>
          <span className="arch-label">AgentShield</span>
          <span className="arch-sublabel">Intercepts & reviews</span>
        </div>
        <div className="arch-arrow">→</div>
        <div className="arch-node arch-chain">
          <span className="arch-icon">⛓️</span>
          <span className="arch-label">Blockchain</span>
          <span className="arch-sublabel">Executes or blocks</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// UI: Wallet Cards
// ═══════════════════════════════════════════════════

function WalletCards({
  agentAddr, agentBal, recipAddr, recipBal, busy,
}: {
  agentAddr: string; agentBal: string; recipAddr: string; recipBal: string; busy: boolean;
}) {
  return (
    <div className="wallet-cards">
      <div className="wallet-card agent">
        <div className="wallet-card-header">
          <span className="wallet-card-icon">🤖</span>
          <span className="wallet-card-name">AI Agent Wallet</span>
        </div>
        <div className="wallet-card-addr mono">{short(agentAddr)}</div>
        <div className="wallet-card-balance">
          <span className="wallet-card-bal">{agentBal}</span>
          <span className="wallet-card-currency">STT</span>
        </div>
        <div className="wallet-card-label">Sender</div>
      </div>
      <div className="wallet-card-arrow-big">→</div>
      <div className="wallet-card recip">
        <div className="wallet-card-header">
          <span className="wallet-card-icon">👤</span>
          <span className="wallet-card-name">Recipient</span>
        </div>
        <div className="wallet-card-addr mono">{short(recipAddr)}</div>
        <div className="wallet-card-balance">
          <span className="wallet-card-bal">{recipBal}</span>
          <span className="wallet-card-currency">STT</span>
        </div>
        <div className="wallet-card-label">Receiver</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// UI: Live Agent Feed
// ═══════════════════════════════════════════════════

type FeedEntryType = "agent-thought" | "shield-checking" | "verdict" | "human-needed";

interface FeedEntry {
  id: string;
  type: FeedEntryType;
  text: string;
  timestamp: number;
  verdict?: string;
  riskScore?: number;
  event?: SecurityEvent;
  scenario?: Scenario;
}

function LiveAgentFeed({
  entries,
  liveMode,
  onStart,
  onStop,
  onApproveWarn,
  onRejectWarn,
  busy,
  pendingWarn,
}: {
  entries: FeedEntry[];
  liveMode: boolean;
  onStart: () => void;
  onStop: () => void;
  onApproveWarn: () => void;
  onRejectWarn: () => void;
  busy: boolean;
  pendingWarn: { event: SecurityEvent; scenario: Scenario } | null;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [entries, pendingWarn]);

  return (
    <div className="live-agent-feed">
      <div className="live-agent-header">
        <span className="live-agent-title">🤖 AI Agent Terminal</span>
        <div className="live-agent-controls">
          {!liveMode ? (
            <button className="btn primary small live-start-btn" onClick={onStart} disabled={busy}>
              ▶ Start Live Agent
            </button>
          ) : (
            <button className="btn subtle small live-stop-btn" onClick={onStop} disabled={busy}>
              ⏹ Stop
            </button>
          )}
        </div>
      </div>
      <div className="live-agent-terminal" ref={feedRef}>
        {entries.length === 0 && !liveMode && (
          <div className="live-agent-placeholder">
            <span className="live-agent-placeholder-icon">🛡️</span>
            <p>Click <strong>Start Live Agent</strong> to see AgentShield in action.</p>
            <p className="live-agent-placeholder-sub">
              The AI agent will act autonomously — proposing transactions.<br />
              AgentShield will intercept and review each one in real-time.
            </p>
          </div>
        )}
        {entries.map((entry) => {
          const s = entry.verdict ? verdictStyle(entry.verdict) : null;
          return (
            <div key={entry.id} className={`feed-entry feed-entry-${entry.type}`}>
              <span className="feed-entry-time">{timeAgo(entry.timestamp)}</span>
              <span className="feed-entry-text">
                {entry.type === "agent-thought" && <span className="feed-entry-prefix">🤖 Agent:</span>}
                {entry.type === "shield-checking" && <span className="feed-entry-prefix">🛡️ Shield:</span>}
                {entry.type === "verdict" && s && (
                  <span className="feed-entry-prefix" style={{ color: s.color }}>
                    {entry.verdict === "ALLOW" ? "✅" : entry.verdict === "WARN" ? "⚠️" : "🚫"} {entry.verdict}
                  </span>
                )}
                {entry.type === "human-needed" && (
                  <span className="feed-entry-prefix" style={{ color: "#eab308" }}>👤 Action needed</span>
                )}
                {" "}{entry.text}
              </span>
              {entry.riskScore !== undefined && (
                <span className="feed-entry-risk" style={{ color: riskColor(entry.riskScore) }}>
                  Risk: {entry.riskScore}/100
                </span>
              )}
            </div>
          );
        })}
        {/* Human approval inline */}
        {pendingWarn && (
          <div className="feed-entry-human-approval">
            <div className="feed-entry">
              <span className="feed-entry-time">now</span>
              <span className="feed-entry-text">
                <span className="feed-entry-prefix" style={{ color: "#eab308" }}>⚠️ WARN</span>
                {" "}{pendingWarn.event.reasoning}
              </span>
              <span className="feed-entry-risk" style={{ color: riskColor(pendingWarn.event.riskScore) }}>
                Risk: {pendingWarn.event.riskScore}/100
              </span>
            </div>
            <div className="feed-approval-actions">
              <button className="btn primary small" onClick={onApproveWarn} disabled={busy}>
                ✅ APPROVE
              </button>
              <button className="btn reject-btn small" onClick={onRejectWarn} disabled={busy}>
                🚫 REJECT
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// UI: Tx Progress
// ═══════════════════════════════════════════════════

function TxProgress({ stage, txHash, fulfillTxHash }: {
  stage: TxStage; txHash?: string; fulfillTxHash?: string;
}) {
  if (stage === "idle" || stage === "done") return null;
  const stages: { key: TxStage; label: string; hash?: string }[] = [
    { key: "submitting", label: "🤖 AI Agent acting autonomously — proposing transaction..." },
    { key: "confirming", label: "⛓️ Transaction intercepted by AgentShield on Somnia", hash: txHash },
    { key: "analyzing", label: "🛡️ Running deterministic checks + policy validation..." },
    { key: "recording", label: "🧠 LLM deep analysis on-chain — verdict recorded", hash: fulfillTxHash },
    { key: "waiting_human", label: "👤 Human review required — waiting for decision..." },
    { key: "executing", label: "💸 Executing transfer..." },
  ];
  const currentIdx = stages.findIndex((s) => s.key === stage);
  if (currentIdx === -1) return null;
  return (
    <div className="tx-progress" role="status" aria-live="polite">
      {stages.slice(0, currentIdx + 1).map((s, i) => (
        <div key={s.key} className={`tx-progress-step ${i === currentIdx ? "active" : "done"}`}>
          <span className="tx-progress-dot">{i < currentIdx ? "✓" : "●"}</span>
          <div className="tx-progress-content">
            <span className="tx-progress-label">{s.label}</span>
            {s.hash && (
              <a href={`${EXPLORER_URL}/tx/${s.hash}`} target="_blank" rel="noopener noreferrer" className="tx-progress-link">
                View tx: {short(s.hash)} ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// UI: Result Card
// ═══════════════════════════════════════════════════

function ResultCard({ event: e }: { event: SecurityEvent }) {
  const [visible, setVisible] = useState(false);
  const s = verdictStyle(e.verdict);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  return (
    <div className={`result-card ${visible ? "visible" : ""}`} style={{ borderLeftColor: s.border }}>
      <div className="result-header">
        <span className="result-verdict" style={{ color: s.color }}>
          <span className="result-icon">{e.verdict === "ALLOW" ? "✅" : e.verdict === "WARN" ? "⚠️" : "🚫"}</span>
          {e.verdict}
        </span>
        <span className="result-score" style={{ color: s.color }}>Risk: {e.riskScore}/100</span>
        {e.deterministic && <span className="deterministic-badge">⚡ Instant Block</span>}
        {!e.deterministic && <span className="llm-badge">🧠 LLM Analysis</span>}
        {e.humanApproved && <span className="live-badge" style={{ color: "#22c55e" }}>👤 Human Approved</span>}
        {e.verdict === "BLOCK" && <span className="live-badge">🚫 Blocked by AgentShield</span>}
        {e.verdict === "ALLOW" && e.transferTxHash && <span className="live-badge">✅ Auto-Approved — Transfer executed</span>}
        {e.verdict === "WARN" && e.transferTxHash && <span className="live-badge">⚠️ Transfer executed (human approved)</span>}
        {e.verdict === "WARN" && !e.transferTxHash && e.humanApproved === false && <span className="live-badge" style={{ color: "#ef4444" }}>🚫 Rejected by human</span>}
      </div>
      <div className="risk-bar-container">
        <div className="risk-bar-track">
          <div className="risk-bar-fill" style={{ width: `${e.riskScore}%`, background: riskColor(e.riskScore), boxShadow: `0 0 12px ${riskColor(e.riskScore)}44` }} />
        </div>
        <div className="risk-bar-labels"><span>Safe</span><span>Caution</span><span>Danger</span></div>
      </div>
      <div className="result-intent">
        <span className="result-label">Intent</span>
        <p>"{e.intent}"</p>
      </div>
      <div className="result-reasoning">
        <span className="result-label">Reasoning</span>
        <p>{e.reasoning}</p>
      </div>
      <div className="result-meta">
        <span>🕐 {timeAgo(e.timestamp)}</span>
        <span>{e.deterministic ? "⚡ <1ms · 0 gas" : "🧠 LLM inference"}</span>
        {e.txHash && (
          <a href={`${EXPLORER_URL}/tx/${e.txHash}`} target="_blank" rel="noopener noreferrer" className="result-explorer-link">
            Verdict tx ↗
          </a>
        )}
        {e.transferTxHash && (
          <a href={`${EXPLORER_URL}/tx/${e.transferTxHash}`} target="_blank" rel="noopener noreferrer" className="result-explorer-link">
            Transfer tx ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// UI: Security Log
// ═══════════════════════════════════════════════════

function SecurityLog({ events, activeId, onSelect }: {
  events: SecurityEvent[]; activeId: string | null; onSelect: (e: SecurityEvent) => void;
}) {
  if (events.length === 0) return null;
  return (
    <section className="results-feed">
      <h3>Security Log</h3>
      <div className="feed-list" role="list">
        {events.map((e) => {
          const s = verdictStyle(e.verdict);
          return (
            <div key={e.id} className={`feed-item ${activeId === e.id ? "active" : ""}`}
              style={{ borderLeftColor: s.border }} role="button" tabIndex={0}
              onClick={() => onSelect(e)}
              onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onSelect(e)}>
              <div className="feed-header">
                <span className="feed-verdict" style={{ background: s.bg, color: s.color }}>{e.verdict}</span>
                <span className="feed-score" style={{ color: s.color }}>Risk: {e.riskScore}/100</span>
                <span className="feed-badge">{e.deterministic ? "⚡ Instant" : "🧠 LLM"}</span>
                {e.humanApproved && <span className="feed-badge" style={{ color: "#22c55e" }}>👤 Human</span>}
                {e.transferTxHash && <span className="feed-badge" style={{ color: "#22c55e" }}>✅ Sent</span>}
                {e.verdict === "BLOCK" && <span className="feed-badge" style={{ color: "#ef4444" }}>🚫 Blocked</span>}
                {e.verdict === "WARN" && !e.transferTxHash && e.humanApproved === false && <span className="feed-badge" style={{ color: "#ef4444" }}>🚫 Rejected</span>}
                <span className="feed-time">{timeAgo(e.timestamp)}</span>
              </div>
              <p className="feed-intent">"{e.intent}"</p>
              <p className="feed-reasoning">{e.reasoning}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════
// LLM Simulator
// ═══════════════════════════════════════════════════

function simulateLLMResponse(intent: string): {
  verdict: string; riskScore: number; reasoning: string; deterministic: boolean;
} {
  const lower = intent.toLowerCase();
  if (lower.includes("unlimited") && (lower.includes("approve") || lower.includes("approval"))) {
    return { verdict: "BLOCK", riskScore: 95, deterministic: true,
      reasoning: "Unlimited token approvals are the #1 attack vector for wallet drains. The spender can drain the entire balance at any time. Blocked deterministically." };
  }
  if (lower.includes("scam") || lower.includes("phish") || (lower.includes("airdrop") && lower.includes("free"))) {
    return { verdict: "BLOCK", riskScore: 92, deterministic: true,
      reasoning: "Free airdrops requesting approvals are a classic wallet drain technique. Target address shows no verified history. Blocked deterministically." };
  }
  if (lower.includes("nft") && (lower.includes("approve") || lower.includes("mint"))) {
    return { verdict: "BLOCK", riskScore: 93, deterministic: true,
      reasoning: "NFT marketplace approvals to unverified contracts are a common attack vector. This matches known phishing patterns. Blocked deterministically." };
  }
  const valueMatch = intent.match(/(\d+)\s*STT/);
  if (valueMatch) {
    const value = parseInt(valueMatch[1]);
    const policyMatch = DEMO_POLICY.match(/[Mm]ax\s*(\d+)/);
    const maxValue = policyMatch ? parseInt(policyMatch[1]) : 100;
    if (value > maxValue) {
      return { verdict: "BLOCK", riskScore: 90, deterministic: true,
        reasoning: `Transfer of ${value} STT exceeds the maximum of ${maxValue} STT per transaction. Blocked deterministically.` };
    }
  }
  if (lower.includes("new") || lower.includes("unknown") || lower.includes("unverified")) {
    return { verdict: "WARN", riskScore: 65, deterministic: false,
      reasoning: "This involves an unverified or newly deployed contract. Proceed with caution — verify the contract independently before interacting." };
  }
  if (lower.includes("payment") || lower.includes("infrastructure") || lower.includes("vendor") || lower.includes("bill") || lower.includes("server")) {
    return { verdict: "ALLOW", riskScore: 10, deterministic: false,
      reasoning: "This is a routine payment to a known vendor. Amount is within policy limits. No risk indicators detected." };
  }
  if (lower.includes("swap") || lower.includes("trade") || lower.includes("dex") || lower.includes("yield")) {
    return { verdict: "WARN", riskScore: 55, deterministic: false,
      reasoning: "This swap involves a DEX. The protocol appears legitimate but always verify the contract address before confirming." };
  }
  return { verdict: "ALLOW", riskScore: 25, deterministic: false,
    reasoning: "This action appears safe and aligns with the security policy. No risk indicators detected." };
}

// ═══════════════════════════════════════════════════
// Main App
// ═══════════════════════════════════════════════════

function App() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [activeResult, setActiveResult] = useState<SecurityEvent | null>(null);
  const [txStage, setTxStage] = useState<TxStage>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [fulfillTxHash, setFulfillTxHash] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agentBal, setAgentBal] = useState("?");
  const [recipBal, setRecipBal] = useState("?");
  const [liveMode, setLiveMode] = useState(false);
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);
  const [pendingWarn, setPendingWarn] = useState<{
    event: SecurityEvent;
    scenario: Scenario;
    analysisId: bigint;
    fulfillHash: string;
  } | null>(null);

  const eventCounter = useRef(0);
  const feedCounter = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveStoppedRef = useRef(false);

  // ── Setup wallets ──
  const agentAccount = useMemo(() => (AGENT_KEY ? privateKeyToAccount(AGENT_KEY) : null), []);
  const publicClient = useMemo(() => createPublicClient({ chain: somniaChain, transport: http() }), []);
  const walletClient = useMemo(() => agentAccount
    ? createWalletClient({ account: agentAccount, chain: somniaChain, transport: http() })
    : null, [agentAccount]);

  const agentAddr = agentAccount?.address || "0x...";
  const recipAddr = RECIPIENT_ADDR;

  // ── Load balances ──
  const refreshBalances = useCallback(async () => {
    if (!publicClient) return;
    try {
      const aBal = await publicClient.getBalance({ address: agentAddr as Address });
      const rBal = await publicClient.getBalance({ address: recipAddr });
      setAgentBal(Number(formatEther(aBal)).toFixed(4));
      setRecipBal(Number(formatEther(rBal)).toFixed(4));
    } catch { setAgentBal("?"); setRecipBal("?"); }
  }, [publicClient, agentAddr, recipAddr]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  // ── Execute transfer ──
  const executeTransfer = useCallback(async (scenario: Scenario) => {
    if (!walletClient) return;
    setTxStage("executing");
    const txHash3 = await walletClient.sendTransaction({
      to: recipAddr,
      value: parseEther(scenario.transferAmount),
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash3 });
    return txHash3;
  }, [walletClient, publicClient, recipAddr]);

  // ── Add feed entry ──
  const addFeedEntry = useCallback((entry: Omit<FeedEntry, "id" | "timestamp">) => {
    setFeedEntries((prev) => [...prev, {
      ...entry,
      id: `feed-${++feedCounter.current}`,
      timestamp: Date.now(),
    }].slice(-50));
  }, []);

  // ── Run analysis ──
  const runAnalysis = useCallback(async (scenario: Scenario, autoApproveWarn = false) => {
    if (!walletClient) { setError("Wallet not configured"); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setError("");
    setTxHash(undefined);
    setFulfillTxHash(undefined);
    setPendingWarn(null);

    // Agent thought
    addFeedEntry({ type: "agent-thought", text: `"${scenario.intent}"` });

    try {
      // Shield intercepts
      addFeedEntry({ type: "shield-checking", text: "Transaction intercepted. Running security checks..." });
      setTxStage("submitting");

      const hash = await walletClient.writeContract({
        address: AEGIS_ADDRESS, abi: aegisBrainV2Abi,
        functionName: "analyze", args: [scenario.intent],
        value: parseEther("0.01"),
      });
      if (controller.signal.aborted) return;
      setTxHash(hash);
      setTxStage("confirming");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let analysisId = 0n;
      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === AEGIS_ADDRESS.toLowerCase() &&
            log.topics[0] === "0x0f47169068c95e16bd44891ff2a9afdc0065b4da32e266b5bd20a34dcd5beb5d") {
            analysisId = BigInt(log.topics[1]!); break;
          }
        } catch {}
      }
      if (analysisId === 0n) throw new Error("AnalysisStarted event not found");

      setTxStage("analyzing");
      await new Promise(r => setTimeout(r, 600));
      const llmResponse = simulateLLMResponse(scenario.intent);

      setTxStage("recording");
      const hash2 = await walletClient.writeContract({
        address: AEGIS_ADDRESS, abi: aegisBrainV2Abi,
        functionName: "fulfillManual",
        args: [analysisId, `${llmResponse.verdict}\n${llmResponse.reasoning}`],
      });
      if (controller.signal.aborted) return;
      setFulfillTxHash(hash2);
      await publicClient.waitForTransactionReceipt({ hash: hash2 });

      const decision = await publicClient.readContract({
        address: AEGIS_ADDRESS, abi: aegisBrainV2Abi,
        functionName: "getDecision", args: [analysisId],
      }) as unknown as { verdict: string; riskScore: bigint; reasoning: string; timestamp: bigint };

      const eventBase: SecurityEvent = {
        id: `evt-${++eventCounter.current}`,
        intent: scenario.intent,
        verdict: decision.verdict,
        riskScore: Number(decision.riskScore),
        reasoning: decision.reasoning,
        timestamp: Number(decision.timestamp) * 1000,
        deterministic: llmResponse.deterministic,
        txHash: hash2,
      };

      // WARN → human-in-the-loop
      if (decision.verdict === "WARN" && !autoApproveWarn) {
        setTxStage("waiting_human");
        addFeedEntry({ type: "human-needed", text: "This transaction needs your review.", verdict: "WARN", riskScore: eventBase.riskScore });
        setPendingWarn({ event: eventBase, scenario, analysisId, fulfillHash: hash2 });
        setActiveResult(eventBase);
        setBusy(false);
        return;
      }

      // Auto: ALLOW → execute, BLOCK → skip, WARN+auto → execute
      let transferHash: string | undefined;
      if (decision.verdict !== "BLOCK" && scenario.shouldTransfer) {
        transferHash = await executeTransfer(scenario);
      }

      setTxStage("done");
      const event: SecurityEvent = { ...eventBase, transferTxHash: transferHash };

      addFeedEntry({
        type: "verdict",
        text: decision.verdict === "BLOCK" ? "Transaction BLOCKED. " + decision.reasoning :
              decision.verdict === "WARN" ? "Transaction allowed with warning. Transfer executed." :
              "Transaction approved. Transfer executed.",
        verdict: decision.verdict,
        riskScore: event.riskScore,
        event,
      });

      setEvents((prev) => [event, ...prev].slice(0, 20));
      setActiveResult(event);
      refreshBalances();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    } catch (e) {
      setTxStage("idle");
      addFeedEntry({ type: "shield-checking", text: `Error: ${e instanceof Error ? e.message : String(e)}` });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [walletClient, publicClient, executeTransfer, refreshBalances, addFeedEntry]);

  // ── Human approves WARN ──
  const handleHumanApprove = useCallback(async () => {
    if (!pendingWarn) return;
    setBusy(true);
    const pa = pendingWarn;
    setPendingWarn(null);
    setTxStage("executing");
    addFeedEntry({ type: "agent-thought", text: "👤 Human approved — executing transfer..." });
    try {
      const transferHash = await executeTransfer(pa.scenario);
      setTxStage("done");
      const event: SecurityEvent = { ...pa.event, transferTxHash: transferHash, humanApproved: true };
      addFeedEntry({
        type: "verdict",
        text: "Human approved. Transfer executed.",
        verdict: "WARN",
        riskScore: event.riskScore,
        event,
      });
      setEvents((prev) => [event, ...prev].slice(0, 20));
      setActiveResult(event);
      refreshBalances();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    } catch (e) {
      setTxStage("idle");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [pendingWarn, executeTransfer, refreshBalances, addFeedEntry]);

  // ── Human rejects WARN ──
  const handleHumanReject = useCallback(() => {
    if (!pendingWarn) return;
    const event: SecurityEvent = { ...pendingWarn.event, transferTxHash: undefined, humanApproved: false };
    setPendingWarn(null);
    setTxStage("done");
    addFeedEntry({
      type: "verdict",
      text: "Human rejected. Transaction blocked.",
      verdict: "WARN",
      riskScore: event.riskScore,
      event,
    });
    setEvents((prev) => [event, ...prev].slice(0, 20));
    setActiveResult(event);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }, [pendingWarn, addFeedEntry]);

  // ── Live Agent Simulation ──
  const startLiveAgent = useCallback(() => {
    setLiveMode(true);
    liveStoppedRef.current = false;
    let actionIdx = 0;

    const runNext = async () => {
      if (liveStoppedRef.current) return;
      const scenario = LIVE_AGENT_ACTIONS[actionIdx % LIVE_AGENT_ACTIONS.length];
      actionIdx++;
      await runAnalysis(scenario, true); // auto-approve WARN in live demo
      if (liveStoppedRef.current) return;
      liveTimerRef.current = setTimeout(runNext, 4000);
    };

    runNext();
  }, [runAnalysis]);

  const stopLiveAgent = useCallback(() => {
    liveStoppedRef.current = true;
    setLiveMode(false);
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    abortRef.current?.abort();
    setBusy(false);
    setTxStage("idle");
    setPendingWarn(null);
  }, []);

  // Cleanup
  useEffect(() => { return () => { abortRef.current?.abort(); liveStoppedRef.current = true; if (liveTimerRef.current) clearTimeout(liveTimerRef.current); }; }, []);

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <div className="app aegis-minimal">
      <header className="topbar-minimal">
        <span className="logo-minimal">🛡️ AgentShield</span>
        <div className="topbar-right-minimal">
          <a href={`${EXPLORER_URL}/address/${AEGIS_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="chain-badge">
            <span className="chain-dot" />Contract ↗
          </a>
          <span className="chain-badge">Somnia Testnet</span>
        </div>
      </header>

      <main className="main-minimal">
        {/* Hero */}
        <div className="hero-minimal hero-compact">
          <h1>
            Pre-execution Security <span className="gradient-text">Firewall for AI Agents</span>
          </h1>
          <p className="hero-desc-minimal">
            An <strong>autonomous AI agent</strong> acts on its own — proposing transactions.
            AgentShield <strong>intercepts and reviews every one</strong> before execution.
            Safe actions proceed. Dangerous ones are blocked. Suspicious ones ask for human approval.
          </p>
          <ArchitectureDiagram />
        </div>

        {/* Agent Active Badge */}
        <AgentActiveBadge agentAddr={agentAddr} liveMode={liveMode} />

        {/* Two wallets */}
        <WalletCards
          agentAddr={agentAddr} agentBal={agentBal}
          recipAddr={recipAddr} recipBal={recipBal}
          busy={busy}
        />

        {/* Policy */}
        <div className="policy-bar">
          <div className="policy-bar-inner">
            <span className="policy-icon">🛡️</span>
            <span className="policy-text">{DEMO_POLICY}</span>
          </div>
        </div>

        {/* ═══════════ LIVE AGENT TERMINAL ═══════════ */}
        <LiveAgentFeed
          entries={feedEntries}
          liveMode={liveMode}
          onStart={startLiveAgent}
          onStop={stopLiveAgent}
          onApproveWarn={handleHumanApprove}
          onRejectWarn={handleHumanReject}
          busy={busy}
          pendingWarn={pendingWarn ? { event: pendingWarn.event, scenario: pendingWarn.scenario } : null}
        />

        {/* Tx Progress */}
        <TxProgress stage={txStage} txHash={txHash} fulfillTxHash={fulfillTxHash} />

        {error && <p className="err" role="alert">{error}</p>}

        {/* Result Card */}
        <div ref={resultRef} id="result-section">
          {activeResult && !pendingWarn && <ResultCard event={activeResult} />}
          {busy && !activeResult && !pendingWarn && (
            <div className="loading-skeleton" aria-busy="true">
              <div className="skeleton-bar" /><div className="skeleton-line" /><div className="skeleton-line short" />
            </div>
          )}
        </div>

        {/* Quick Tests */}
        <section>
          <div className="section-label">Quick Tests (manual)</div>
          <div className="demo-grid compact">
            {SCENARIOS.map((s) => (
              <button key={s.label}
                className={`demo-chip ${s.icon === "✅" ? "allow" : s.icon === "⚠️" ? "warn" : "block"}`}
                onClick={() => runAnalysis(s)} disabled={busy || liveMode}
                aria-label={`Review: ${s.label}`}>
                <span className="demo-chip-icon">{s.icon}</span>
                <div className="demo-chip-content">
                  <span className="demo-chip-label">{s.label}</span>
                  <span className="demo-chip-desc">{s.description}</span>
                </div>
                <span className={`demo-chip-verdict ${s.shouldTransfer ? (s.icon === "⚠️" ? "warn" : "allow") : "block"}`}>
                  {s.shouldTransfer ? (s.icon === "⚠️" ? "WARN" : "ALLOW") : "BLOCK"}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Security Log */}
        <SecurityLog events={events} activeId={activeResult?.id ?? null}
          onSelect={(e) => { setActiveResult(e); resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />

        {/* Footer */}
        <div className="explorer-footer">
          <a href={`${EXPLORER_URL}/address/${AEGIS_ADDRESS}`} target="_blank" rel="noopener noreferrer">
            🔗 AegisBrainV2 on Somnia Explorer ↗
          </a>
          <span className="explorer-footer-note">
            Agent Wallet: {agentAddr} · Recipient: {recipAddr}
          </span>
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Root
// ═══════════════════════════════════════════════════

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);