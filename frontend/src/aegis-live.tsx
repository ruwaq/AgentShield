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
  type Hash,
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
}

type TxStage = "idle" | "submitting" | "confirming" | "analyzing" | "recording" | "executing" | "done";

interface Scenario {
  label: string;
  icon: string;
  intent: string;
  description: string;
  transferAmount: string; // e.g. "0.01" ether
  shouldTransfer: boolean;
}

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
// Scenarios
// ═══════════════════════════════════════════════════

const SCENARIOS: Scenario[] = [
  {
    label: "Safe payment to vendor",
    icon: "✅",
    intent: "Send 0.01 STT to vendor for monthly infrastructure payment",
    description: "The AI agent wants to pay a known vendor. Amount is within policy limits. Expected: ALLOW, transfer executes.",
    transferAmount: "0.01",
    shouldTransfer: true,
  },
  {
    label: "Unverified DeFi swap",
    icon: "⚠️",
    intent: "Swap 100 USDC for STT on a newly launched DEX at 0x7d2c4e8a1f3b5c7d9e2f4a6b8c0d2e4f6a8b0c",
    description: "The AI agent found a new DEX. The contract is unverified — AgentShield warns but allows. Expected: WARN, transfer allowed.",
    transferAmount: "0.005",
    shouldTransfer: true,
  },
  {
    label: "Phishing airdrop scam",
    icon: "🔴",
    intent: "Approve unlimited USDC spending to claim a free airdrop from 0x9a8f7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f",
    description: "The AI agent was tricked by a phishing site. Unlimited approval = classic wallet drain. Expected: BLOCK, transfer rejected.",
    transferAmount: "0.01",
    shouldTransfer: false,
  },
];

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
// UI: Architecture Diagram
// ═══════════════════════════════════════════════════

function ArchitectureDiagram() {
  return (
    <div className="arch-diagram" aria-hidden="true">
      <div className="arch-row">
        <div className="arch-node arch-agent">
          <span className="arch-icon">🤖</span>
          <span className="arch-label">AI Agent</span>
          <span className="arch-sublabel">Proposes tx</span>
        </div>
        <div className="arch-arrow">→</div>
        <div className="arch-node arch-shield">
          <span className="arch-icon">🛡️</span>
          <span className="arch-label">AgentShield</span>
          <span className="arch-sublabel">Reviews tx</span>
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
  agentAddr,
  agentBal,
  recipAddr,
  recipBal,
  busy,
}: {
  agentAddr: string;
  agentBal: string;
  recipAddr: string;
  recipBal: string;
  busy: boolean;
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
// UI: Info Panel
// ═══════════════════════════════════════════════════

function InfoPanel({
  icon, title, children, variant = "info",
}: { icon: string; title: string; children: React.ReactNode; variant?: "info" | "success" | "warning" | "tip" }) {
  return (
    <div className={`info-panel info-${variant}`}>
      <div className="info-panel-header">
        <span className="info-panel-icon">{icon}</span>
        <span className="info-panel-title">{title}</span>
      </div>
      <div className="info-panel-body">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// UI: Tx Progress
// ═══════════════════════════════════════════════════

function TxProgress({ stage, txHash, fulfillTxHash, transferTxHash }: {
  stage: TxStage; txHash?: string; fulfillTxHash?: string; transferTxHash?: string;
}) {
  if (stage === "idle") return null;
  const stages: { key: TxStage; label: string; hash?: string }[] = [
    { key: "submitting", label: "Submitting analysis to AgentShield..." },
    { key: "confirming", label: "Confirmed on Somnia Testnet", hash: txHash },
    { key: "analyzing", label: "Running deterministic + LLM checks..." },
    { key: "recording", label: "Verdict recorded on-chain", hash: fulfillTxHash },
    { key: "executing", label: "Executing transfer..." },
    { key: "done", label: "✅ Complete" },
  ];
  const currentIdx = stages.findIndex((s) => s.key === stage);
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
        {e.verdict === "BLOCK" && <span className="live-badge">🚫 Transfer blocked</span>}
        {e.verdict !== "BLOCK" && e.transferTxHash && <span className="live-badge">✅ Transfer executed</span>}
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
                {e.transferTxHash && <span className="feed-badge" style={{ color: "#22c55e" }}>✅ Sent</span>}
                {e.verdict === "BLOCK" && <span className="feed-badge" style={{ color: "#ef4444" }}>🚫 Blocked</span>}
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
      reasoning: "Unlimited token approvals are the #1 attack vector for wallet drains. The spender can drain the entire balance at any time. This matches known phishing patterns. Blocked deterministically." };
  }
  if (lower.includes("scam") || lower.includes("phish") || (lower.includes("airdrop") && lower.includes("free"))) {
    return { verdict: "BLOCK", riskScore: 92, deterministic: true,
      reasoning: "Free airdrops requesting approvals are a classic wallet drain technique. Target address shows no verified history. Blocked deterministically." };
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
  if (lower.includes("payment") || lower.includes("infrastructure") || lower.includes("vendor")) {
    return { verdict: "ALLOW", riskScore: 10, deterministic: false,
      reasoning: "This is a routine payment to a known vendor. Amount is within policy limits. No risk indicators detected." };
  }
  if (lower.includes("swap") || lower.includes("trade") || lower.includes("dex")) {
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
  const [transferTxHash, setTransferTxHash] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agentBal, setAgentBal] = useState("?");
  const [recipBal, setRecipBal] = useState("?");

  const eventCounter = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  // ── Run analysis + transfer ──
  const runReview = useCallback(async (scenario: Scenario) => {
    if (!walletClient) { setError("Wallet not configured"); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setError("");
    setTxHash(undefined);
    setFulfillTxHash(undefined);
    setTransferTxHash(undefined);
    setTxStage("submitting");
    setActiveResult(null);

    try {
      // Step 1: Submit analysis to AgentShield
      const hash = await walletClient.writeContract({
        address: AEGIS_ADDRESS, abi: aegisBrainV2Abi,
        functionName: "analyze", args: [scenario.intent],
        value: parseEther("0.01"),
      });
      if (controller.signal.aborted) return;
      setTxHash(hash);
      setTxStage("confirming");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Extract analysisId
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
      const llmResponse = simulateLLMResponse(scenario.intent);

      // Step 2: Record verdict
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

      let transferHash: string | undefined;

      // Step 3: Execute transfer if ALLOW or WARN
      if (scenario.shouldTransfer && (decision.verdict === "ALLOW" || decision.verdict === "WARN")) {
        setTxStage("executing");
        const txHash3 = await walletClient.sendTransaction({
          to: recipAddr,
          value: parseEther(scenario.transferAmount),
        });
        if (controller.signal.aborted) return;
        transferHash = txHash3;
        setTransferTxHash(txHash3);
        await publicClient.waitForTransactionReceipt({ hash: txHash3 });
      }

      setTxStage("done");

      const event: SecurityEvent = {
        id: `evt-${++eventCounter.current}`,
        intent: scenario.intent,
        verdict: decision.verdict,
        riskScore: Number(decision.riskScore),
        reasoning: decision.reasoning,
        timestamp: Number(decision.timestamp),
        deterministic: llmResponse.deterministic,
        txHash: hash2,
        transferTxHash: transferHash,
      };

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
  }, [walletClient, publicClient, recipAddr, refreshBalances]);

  // Cleanup
  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

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
            An <strong>autonomous AI agent</strong> proposes a transaction.
            AgentShield <strong>reviews it before execution</strong> using
            deterministic checks + LLM analysis. If safe, the transfer
            happens. If dangerous, it's blocked.
          </p>
          <ArchitectureDiagram />
        </div>

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

        {/* Scenarios */}
        <InfoPanel icon="🧪" title="Click a scenario to see AgentShield review it" variant="info">
          <p>
            Each scenario shows the <strong>AI Agent proposing a transaction</strong>.
            AgentShield analyzes it on-chain. If the verdict is ALLOW or WARN, the
            STT transfer executes automatically. If BLOCK, the transfer is rejected.
          </p>
        </InfoPanel>

        <section>
          <div className="section-label">Select a transaction to review</div>
          <div className="demo-grid">
            {SCENARIOS.map((s) => (
              <button key={s.label}
                className={`demo-chip ${s.icon === "✅" ? "allow" : s.icon === "⚠️" ? "warn" : "block"}`}
                onClick={() => runReview(s)} disabled={busy}
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

        {/* Tx Progress */}
        <TxProgress stage={txStage} txHash={txHash} fulfillTxHash={fulfillTxHash} transferTxHash={transferTxHash} />

        {error && <p className="err" role="alert">{error}</p>}

        {/* Result Card */}
        <div ref={resultRef} id="result-section">
          {activeResult && <ResultCard event={activeResult} />}
          {busy && !activeResult && (
            <div className="loading-skeleton" aria-busy="true">
              <div className="skeleton-bar" /><div className="skeleton-line" /><div className="skeleton-line short" />
            </div>
          )}
        </div>

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