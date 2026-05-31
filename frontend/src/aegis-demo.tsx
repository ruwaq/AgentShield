/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createPublicClient, createWalletClient, custom, http,
  parseEther, formatEther, type Address, type Hash, type EIP1193Provider
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

type View = "dashboard" | "pipeline" | "policies" | "audit";

interface PipelineStep {
  id: string;
  agentType: "LLM" | "Parse" | "JSON" | "Custom";
  agentId: string;
  label: string;
  description: string;
}

interface SecurityEvent {
  id: string;
  timestamp: number;
  pipelineId: string;
  agentCount: number;
  decision: "ALLOW" | "WARN" | "BLOCK";
  riskScore: number;
  target: string;
  intent: string;
  duration: number;
  txHash: string;
}

interface AgentPolicy {
  id: string;
  name: string;
  maxValue: string;
  allowedTargets: string[];
  allowedSelectors: string[];
  active: boolean;
  createdAt: number;
  eventsProcessed: number;
}

// ═══════════════════════════════════════════════════
// Mock Data (would come from on-chain in production)
// ═══════════════════════════════════════════════════

const MOCK_EVENTS: SecurityEvent[] = [
  { id: "evt-1", timestamp: Date.now() - 120000, pipelineId: "pipe-42", agentCount: 3, decision: "BLOCK", riskScore: 95, target: "0x9a8f...3b2c", intent: "approve unlimited USDC to unknown contract", duration: 4.2, txHash: "0xae3f..." },
  { id: "evt-2", timestamp: Date.now() - 300000, pipelineId: "pipe-41", agentCount: 2, decision: "ALLOW", riskScore: 15, target: "0x1b4c...8d9e", intent: "transfer 10 STT for infrastructure payment", duration: 3.1, txHash: "0x7c2d..." },
  { id: "evt-3", timestamp: Date.now() - 600000, pipelineId: "pipe-40", agentCount: 5, decision: "WARN", riskScore: 65, target: "0x4e2a...7f1b", intent: "contract call to unverified DeFi protocol", duration: 5.8, txHash: "0xf91a..." },
  { id: "evt-4", timestamp: Date.now() - 900000, pipelineId: "pipe-39", agentCount: 3, decision: "BLOCK", riskScore: 90, target: "0x8c3d...2a5f", intent: "transfer 500 STT to new address", duration: 4.0, txHash: "0x3b7e..." },
  { id: "evt-5", timestamp: Date.now() - 1200000, pipelineId: "pipe-38", agentCount: 2, decision: "ALLOW", riskScore: 10, target: "0x2f6a...9c1d", intent: "claim staking rewards from verified protocol", duration: 2.5, txHash: "0xd45c..." },
  { id: "evt-6", timestamp: Date.now() - 1800000, pipelineId: "pipe-37", agentCount: 3, decision: "ALLOW", riskScore: 20, target: "0x5b8e...1a3f", intent: "swap 100 USDC for STT on verified DEX", duration: 3.3, txHash: "0x6a1b..." },
  { id: "evt-7", timestamp: Date.now() - 2400000, pipelineId: "pipe-36", agentCount: 4, decision: "WARN", riskScore: 55, target: "0x7d2c...4e8a", intent: "interact with newly deployed contract", duration: 4.7, txHash: "0x9f3e..." },
  { id: "evt-8", timestamp: Date.now() - 3600000, pipelineId: "pipe-35", agentCount: 3, decision: "BLOCK", riskScore: 98, target: "0x3a1f...6b9d", intent: "approve NFT marketplace with reported phishing history", duration: 3.9, txHash: "0x2c8a..." },
];

const MOCK_POLICIES: AgentPolicy[] = [
  { id: "pol-1", name: "Default Security Policy", maxValue: "50 STT", allowedTargets: ["0x1b4c...8d9e", "0x5b8e...1a3f"], allowedSelectors: ["transfer(address,uint256)", "swap(address,uint256)"], active: true, createdAt: Date.now() - 86400000, eventsProcessed: 42 },
  { id: "pol-2", name: "DeFi Interaction Policy", maxValue: "500 STT", allowedTargets: ["0x5b8e...1a3f", "0x2f6a...9c1d"], allowedSelectors: ["swap(address,uint256)", "stake(uint256)", "claim()"], active: true, createdAt: Date.now() - 172800000, eventsProcessed: 18 },
];

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

const short = (x?: string) => x ? `${x.slice(0, 6)}...${x.slice(-4)}` : "";
const timeAgo = (ts: number) => {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const decisionBadge = (d: string) => {
  switch (d) {
    case "ALLOW": return { cls: "badge-allow", icon: "✓" };
    case "WARN": return { cls: "badge-warn", icon: "⚠" };
    case "BLOCK": return { cls: "badge-block", icon: "✕" };
    default: return { cls: "", icon: "" };
  }
};

const riskColor = (score: number) => {
  if (score >= 90) return "#ef4444";
  if (score >= 70) return "#f59e0b";
  if (score >= 40) return "#fbbf24";
  return "#22c55e";
};

// ═══════════════════════════════════════════════════
// App
// ═══════════════════════════════════════════════════

function App() {
  const [account, setAccount] = useState<Address>();
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");

  const publicClient = useMemo(() => createPublicClient({ chain: CHAIN, transport: http(RPC) }), []);

  const connect = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask or Rabby to continue.");
      const w = createWalletClient({ chain: CHAIN, transport: custom(window.ethereum) });
      const [addr] = await w.requestAddresses();
      setAccount(addr);
      setError("");
      window.ethereum.on("accountsChanged", ([a]: string[]) => setAccount(a as Address));
      window.ethereum.on("disconnect", () => setAccount(undefined));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  if (!account) {
    return (
      <div className="app aegis-enterprise">
        <header className="topbar-enterprise">
          <div className="logo-area">
            <span className="logo-icon">◈</span>
            <span className="logo-text">AEGIS</span>
            <span className="logo-badge">BETA</span>
          </div>
          <button onClick={connect} className="btn primary">Connect Wallet</button>
        </header>
        <main className="landing-enterprise">
          <div className="hero-enterprise">
            <div className="hero-badge">SOMNIA AGENTATHON 2026</div>
            <h1>On-Chain AI Agent Orchestration</h1>
            <p className="hero-desc">
              AEGIS is a framework for building multi-agent AI pipelines on Somnia.
              Chain LLM inference, web parsing, and API agents into autonomous security
              systems that analyze, decide, and act — all on-chain.
            </p>
            <div className="hero-metrics">
              <div className="metric">
                <span className="metric-value">3</span>
                <span className="metric-label">Agent Types</span>
              </div>
              <div className="metric">
                <span className="metric-value">100%</span>
                <span className="metric-label">On-Chain</span>
              </div>
              <div className="metric">
                <span className="metric-value">0.03</span>
                <span className="metric-label">SOMI / Request</span>
              </div>
              <div className="metric">
                <span className="metric-value">&lt;5s</span>
                <span className="metric-label">Avg. Pipeline</span>
              </div>
            </div>
            <button onClick={connect} className="btn primary large">Connect Wallet to Launch</button>
            {error && <p className="err">{error}</p>}
          </div>
          <div className="hero-diagram">
            <div className="diagram-node">User Action</div>
            <div className="diagram-arrow">→</div>
            <div className="diagram-node highlight">AEGIS Pipeline</div>
            <div className="diagram-arrow">→</div>
            <div className="diagram-node">LLM Agent</div>
            <div className="diagram-arrow">→</div>
            <div className="diagram-node">Parse Agent</div>
            <div className="diagram-arrow">→</div>
            <div className="diagram-node">Decision</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app aegis-enterprise">
      <header className="topbar-enterprise">
        <div className="logo-area">
          <span className="logo-icon">◈</span>
          <span className="logo-text">AEGIS</span>
          <span className="logo-badge">TESTNET</span>
        </div>
        <nav className="nav-links">
          <button onClick={() => setView("dashboard")} className={view === "dashboard" ? "nav-active" : ""}>Dashboard</button>
          <button onClick={() => setView("pipeline")} className={view === "pipeline" ? "nav-active" : ""}>Pipeline Builder</button>
          <button onClick={() => setView("policies")} className={view === "policies" ? "nav-active" : ""}>Policies</button>
          <button onClick={() => setView("audit")} className={view === "audit" ? "nav-active" : ""}>Audit Log</button>
        </nav>
        <div className="topbar-right">
          <span className="chain-indicator">
            <span className="chain-dot" />
            Somnia Testnet
          </span>
          <span className="address-badge">{short(account)}</span>
        </div>
      </header>

      <main className="workspace-enterprise">
        {view === "dashboard" && <Dashboard events={MOCK_EVENTS} policies={MOCK_POLICIES} />}
        {view === "pipeline" && <PipelineBuilder />}
        {view === "policies" && <PolicyManager policies={MOCK_POLICIES} />}
        {view === "audit" && <AuditLog events={MOCK_EVENTS} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════

function Dashboard({ events, policies }: { events: SecurityEvent[]; policies: AgentPolicy[] }) {
  const totalEvents = events.length;
  const blocked = events.filter(e => e.decision === "BLOCK").length;
  const allowed = events.filter(e => e.decision === "ALLOW").length;
  const warned = events.filter(e => e.decision === "WARN").length;
  const avgRisk = Math.round(events.reduce((s, e) => s + e.riskScore, 0) / events.length);
  const avgDuration = (events.reduce((s, e) => s + e.duration, 0) / events.length).toFixed(1);
  const activePolicies = policies.filter(p => p.active).length;

  return (
    <div className="dashboard-enterprise">
      <div className="page-header">
        <h2>Security Overview</h2>
        <span className="page-subtitle">Real-time agent pipeline monitoring</span>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KpiCard label="Events Processed" value={String(totalEvents)} sub="Last 24h" trend="+12%" trendUp />
        <KpiCard label="Threats Blocked" value={String(blocked)} sub={`${Math.round((blocked/totalEvents)*100)}% of total`} trend="+3%" trendUp />
        <KpiCard label="Avg Risk Score" value={String(avgRisk)} sub="/100" trend="-8%" trendUp={false} />
        <KpiCard label="Avg Pipeline Time" value={`${avgDuration}s`} sub={`${events.length} pipelines`} trend="-0.3s" trendUp={false} />
        <KpiCard label="Active Policies" value={String(activePolicies)} sub={`${policies.length} total`} />
        <KpiCard label="Agent Requests" value="156" sub="Last 24h" trend="+22%" trendUp />
      </div>

      {/* Decision Distribution */}
      <div className="panel-grid">
        <div className="panel">
          <h3 className="panel-title">Decision Distribution</h3>
          <div className="decision-bars">
            <div className="decision-bar">
              <span className="bar-label">ALLOW</span>
              <div className="bar-track"><div className="bar-fill allow" style={{ width: `${(allowed/totalEvents)*100}%` }} /></div>
              <span className="bar-value">{allowed}</span>
            </div>
            <div className="decision-bar">
              <span className="bar-label">WARN</span>
              <div className="bar-track"><div className="bar-fill warn" style={{ width: `${(warned/totalEvents)*100}%` }} /></div>
              <span className="bar-value">{warned}</span>
            </div>
            <div className="decision-bar">
              <span className="bar-label">BLOCK</span>
              <div className="bar-track"><div className="bar-fill block" style={{ width: `${(blocked/totalEvents)*100}%` }} /></div>
              <span className="bar-value">{blocked}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="panel">
          <h3 className="panel-title">Recent Activity</h3>
          <div className="activity-list">
            {events.slice(0, 5).map(e => {
              const b = decisionBadge(e.decision);
              return (
                <div key={e.id} className="activity-row">
                  <span className={`activity-badge ${b.cls}`}>{b.icon} {e.decision}</span>
                  <span className="activity-intent">{e.intent.slice(0, 60)}...</span>
                  <span className="activity-time">{timeAgo(e.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Risk Timeline */}
      <div className="panel">
        <h3 className="panel-title">Risk Score Timeline</h3>
        <div className="timeline">
          {[...events].reverse().map(e => (
            <div key={e.id} className="timeline-point" style={{ left: `${((Date.now() - e.timestamp) / 3600000) * 100}%` }}>
              <div className="timeline-dot" style={{ background: riskColor(e.riskScore) }} title={`${e.riskScore}/100 — ${e.decision}`} />
            </div>
          ))}
          <div className="timeline-line" />
        </div>
        <div className="timeline-labels">
          <span>6h ago</span><span>3h ago</span><span>1h ago</span><span>Now</span>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, trend, trendUp }: { label: string; value: string; sub?: string; trend?: string; trendUp?: boolean }) {
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <div className="kpi-footer">
        {sub && <span className="kpi-sub">{sub}</span>}
        {trend && <span className={`kpi-trend ${trendUp ? "up" : "down"}`}>{trend}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Pipeline Builder
// ═══════════════════════════════════════════════════

const AGENT_TYPES = [
  { type: "LLM" as const, name: "LLM Inference", desc: "Qwen3-30B deterministic inference. Classifies, analyzes, generates text.", icon: "🧠", cost: "0.07 SOMI" },
  { type: "Parse" as const, name: "Web Parser", desc: "Extracts structured data from websites using browser rendering + LLM.", icon: "🌐", cost: "0.10 SOMI" },
  { type: "JSON" as const, name: "JSON API", desc: "Fetches and parses JSON API endpoints. Price feeds, metadata, oracles.", icon: "📡", cost: "0.03 SOMI" },
  { type: "Custom" as const, name: "Custom Agent", desc: "Any Somnia-registered agent with a known ID and ABI.", icon: "⚙️", cost: "varies" },
];

function PipelineBuilder() {
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [context, setContext] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const addStep = (type: PipelineStep["agentType"]) => {
    const agent = AGENT_TYPES.find(a => a.type === type)!;
    setSteps([...steps, {
      id: `step-${steps.length + 1}`,
      agentType: type,
      agentId: type === "LLM" ? "12847293847561029384" : type === "Parse" ? "12875401142070969085" : "",
      label: "",
      description: agent.desc
    }]);
  };

  const removeStep = (id: string) => setSteps(steps.filter(s => s.id !== id));

  const moveStep = (id: string, dir: -1 | 1) => {
    const idx = steps.findIndex(s => s.id === id);
    if (idx < 0 || idx + dir < 0 || idx + dir >= steps.length) return;
    const next = [...steps];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    setSteps(next);
  };

  const totalCost = steps.reduce((sum, s) => {
    if (s.agentType === "LLM") return sum + 0.07;
    if (s.agentType === "Parse") return sum + 0.10;
    if (s.agentType === "JSON") return sum + 0.03;
    return sum + 0.05;
  }, 0);

  return (
    <div className="pipeline-builder">
      <div className="page-header">
        <h2>Pipeline Builder</h2>
        <span className="page-subtitle">Chain multiple AI agents into a sequential analysis pipeline</span>
      </div>

      <div className="pipeline-layout">
        {/* Agent Palette */}
        <div className="agent-palette">
          <h3>Available Agents</h3>
          {AGENT_TYPES.map(a => (
            <button key={a.type} onClick={() => addStep(a.type)} className="agent-card">
              <span className="agent-icon">{a.icon}</span>
              <div className="agent-info">
                <b>{a.name}</b>
                <span>{a.desc}</span>
                <span className="agent-cost">{a.cost} per validator</span>
              </div>
              <span className="add-icon">+</span>
            </button>
          ))}
        </div>

        {/* Pipeline Canvas */}
        <div className="pipeline-canvas">
          <div className="canvas-header">
            <h3>Pipeline Configuration</h3>
            {steps.length > 0 && (
              <span className="pipeline-stats">
                {steps.length} steps · {(totalCost * 3).toFixed(2)} SOMI total (×3 validators)
              </span>
            )}
          </div>

          <div className="form-group">
            <label>Analysis Context</label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Describe what this pipeline should analyze. This becomes the initial prompt for the first agent.&#10;&#10;Example: Analyze whether this blockchain transaction poses a security risk. Consider: target address reputation, value amount, function selector, and intent description."
              rows={4}
            />
          </div>

          {steps.length === 0 ? (
            <div className="empty-canvas">
              <span className="empty-icon">⊞</span>
              <p>Add agents from the palette to build your pipeline.</p>
              <p className="empty-hint">Each agent's output feeds into the next agent's prompt.</p>
            </div>
          ) : (
            <div className="pipeline-steps">
              {steps.map((step, i) => (
                <div key={step.id} className="pipeline-step">
                  <div className="step-number">{i + 1}</div>
                  <div className="step-content">
                    <div className="step-header">
                      <span className="step-type">{AGENT_TYPES.find(a => a.type === step.agentType)?.icon} {AGENT_TYPES.find(a => a.type === step.agentType)?.name}</span>
                      <div className="step-actions">
                        <button onClick={() => moveStep(step.id, -1)} disabled={i === 0} className="step-btn" title="Move up">↑</button>
                        <button onClick={() => moveStep(step.id, 1)} disabled={i === steps.length - 1} className="step-btn" title="Move down">↓</button>
                        <button onClick={() => removeStep(step.id)} className="step-btn remove" title="Remove">×</button>
                      </div>
                    </div>
                    <input
                      value={step.label}
                      onChange={e => {
                        const next = steps.map(s => s.id === step.id ? { ...s, label: e.target.value } : s);
                        setSteps(next);
                      }}
                      placeholder="Result label (e.g. 'risk_analysis', 'url_check')"
                      className="step-label-input"
                    />
                    {i < steps.length - 1 && <div className="step-connector">↓ feeds into next agent</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {steps.length > 0 && (
            <div className="pipeline-actions">
              <button onClick={() => setShowPreview(!showPreview)} className="btn subtle">
                {showPreview ? "Hide" : "Show"} Code Preview
              </button>
              <button className="btn primary" disabled={!context.trim()}>
                Deploy Pipeline
              </button>
            </div>
          )}

          {showPreview && steps.length > 0 && (
            <div className="code-preview">
              <pre>{`// AEGIS Pipeline — ${steps.length} agents
const pipeline = await aegis.think(${JSON.stringify(context.slice(0, 50))}..., [
${steps.map(s => `  { agentId: ${s.agentType}_AGENT_ID, payload: "0x", resultLabel: "${s.label || s.agentType.toLowerCase()}_result" }`).join(",\n")}
]);

// Result available in pipeline.thought
console.log(pipeline.thought.decision);  // ALLOW | WARN | BLOCK
console.log(pipeline.thought.riskScore); // 0-100
console.log(pipeline.thought.reasoning); // LLM explanation`}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Policy Manager
// ═══════════════════════════════════════════════════

function PolicyManager({ policies }: { policies: AgentPolicy[] }) {
  return (
    <div className="policy-manager">
      <div className="page-header">
        <h2>Security Policies</h2>
        <span className="page-subtitle">Define rules that agents must follow. Violations are automatically blocked.</span>
        <button className="btn primary" style={{ marginTop: 16 }}>+ New Policy</button>
      </div>

      <div className="policy-list">
        {policies.map(p => (
          <div key={p.id} className={`policy-card ${p.active ? "" : "inactive"}`}>
            <div className="policy-header">
              <div className="policy-title">
                <h3>{p.name}</h3>
                <span className={`status-dot ${p.active ? "active" : ""}`} />
                <span className="status-text">{p.active ? "Active" : "Inactive"}</span>
              </div>
              <span className="policy-id">ID: {p.id}</span>
            </div>

            <div className="policy-details">
              <div className="policy-field">
                <span className="field-label">Max Transaction Value</span>
                <span className="field-value mono">{p.maxValue}</span>
              </div>
              <div className="policy-field">
                <span className="field-label">Events Processed</span>
                <span className="field-value">{p.eventsProcessed}</span>
              </div>
              <div className="policy-field">
                <span className="field-label">Created</span>
                <span className="field-value">{new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="policy-targets">
              <span className="field-label">Allowed Targets ({p.allowedTargets.length})</span>
              <div className="target-list">
                {p.allowedTargets.map((t, i) => (
                  <code key={i} className="target-tag">{t}</code>
                ))}
              </div>
            </div>

            <div className="policy-targets">
              <span className="field-label">Allowed Selectors ({p.allowedSelectors.length})</span>
              <div className="target-list">
                {p.allowedSelectors.map((s, i) => (
                  <code key={i} className="target-tag selector">{s}</code>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Audit Log
// ═══════════════════════════════════════════════════

function AuditLog({ events }: { events: SecurityEvent[] }) {
  const [filter, setFilter] = useState<"ALL" | "ALLOW" | "WARN" | "BLOCK">("ALL");
  const filtered = filter === "ALL" ? events : events.filter(e => e.decision === filter);

  return (
    <div className="audit-log">
      <div className="page-header">
        <h2>Audit Log</h2>
        <span className="page-subtitle">Complete history of agent pipeline decisions</span>
      </div>

      <div className="audit-filters">
        {(["ALL", "ALLOW", "WARN", "BLOCK"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`filter-btn ${filter === f ? "active" : ""}`}>
            {f === "ALL" ? "All" : f} {f === "ALL" ? `(${events.length})` : `(${events.filter(e => e.decision === f).length})`}
          </button>
        ))}
      </div>

      <div className="audit-table">
        <div className="audit-header">
          <span className="col-time">Time</span>
          <span className="col-decision">Decision</span>
          <span className="col-risk">Risk</span>
          <span className="col-pipeline">Pipeline</span>
          <span className="col-agents">Agents</span>
          <span className="col-duration">Duration</span>
          <span className="col-intent">Intent</span>
          <span className="col-target">Target</span>
        </div>
        {filtered.map(e => {
          const b = decisionBadge(e.decision);
          return (
            <div key={e.id} className="audit-row">
              <span className="col-time">{timeAgo(e.timestamp)}</span>
              <span className="col-decision">
                <span className={`inline-badge ${b.cls}`}>{b.icon} {e.decision}</span>
              </span>
              <span className="col-risk">
                <span className="risk-pill" style={{ background: riskColor(e.riskScore) }}>{e.riskScore}</span>
              </span>
              <span className="col-pipeline mono">{e.pipelineId}</span>
              <span className="col-agents">{e.agentCount}</span>
              <span className="col-duration mono">{e.duration}s</span>
              <span className="col-intent" title={e.intent}>{e.intent.slice(0, 50)}...</span>
              <span className="col-target mono">{short(e.target)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);