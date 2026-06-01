/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createPublicClient, createWalletClient, custom, http,
  parseEther, type Address, type Hash
} from "viem";
import { agentShieldAbi } from "./abi";
import "./styles.css";

// ── Config ──
const REGISTRY = (import.meta.env.VITE_AGENTSHIELD_REGISTRY || "0xC1CBD30b6078Ef5Ea2f25b23700c06d4e0a78ACe") as Address;
const RPC = import.meta.env.VITE_RPC_URL || "https://api.infra.testnet.somnia.network/";
const EXPLORER = import.meta.env.VITE_BLOCK_EXPLORER || "https://shannon-explorer.somnia.network";
const AGENTS = import.meta.env.VITE_AGENT_EXPLORER || "https://agents.testnet.somnia.network";
const CHAIN = { id: 50312, name: "Somnia Testnet", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;

import type { EIP1193Provider } from "viem";
declare global { interface Window { ethereum?: EIP1193Provider } }

// ── Helpers ──
const short = (x?: string) => x ? `${x.slice(0, 6)}...${x.slice(-4)}` : "";
const DECISIONS = ["NONE", "ALLOW", "WARN", "BLOCK"] as const;
const LEVELS = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const badgeCls = (d: number) => ["d0", "d1", "d2", "d3"][d] ?? "d0";

type Scan = { scanId: bigint; policyId: bigint; requester: Address; actionHash: Hash; decision: number; riskScore: bigint; riskLevel: number; reasonHash: Hash; requestId: bigint; timestamp: bigint; finalized: boolean };

// ── App ──
function App() {
  const [account, setAccount] = useState<Address>();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [scans, setScans] = useState<Scan[]>([]);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<Hash>();
  const [error, setError] = useState("");

  const publicClient = useMemo(() => createPublicClient({ chain: CHAIN, transport: http(RPC) }), []);
  const wallet = useMemo(() => account ? createWalletClient({ chain: CHAIN, transport: custom(window.ethereum!) }) : null, [account]);

  const connect = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Install MetaMask or Rabby.");
      const w = createWalletClient({ chain: CHAIN, transport: custom(window.ethereum) });
      const [addr] = await w.requestAddresses();
      setAccount(addr);
      setError("");
      window.ethereum.on("accountsChanged", ([a]: string[]) => setAccount(a as Address));
      window.ethereum.on("disconnect", () => setAccount(undefined));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  const loadScans = useCallback(async () => {
    try {
      const nextId = await publicClient.readContract({ address: REGISTRY, abi: agentShieldAbi, functionName: "nextScanId" }) as bigint;
      const total = Number(nextId) - 1;
      if (total <= 0) { setScans([]); return; }
      const ids: bigint[] = [];
      for (let i = total; i >= Math.max(1, total - 20); i--) ids.push(BigInt(i));
      const results = await Promise.all(ids.map(id =>
        publicClient.readContract({ address: REGISTRY, abi: agentShieldAbi, functionName: "getScan", args: [id] }).catch(() => null)
      ));
      setScans(results.filter((s): s is Scan => s !== null));
    } catch { }
  }, [publicClient]);

  useEffect(() => {
    if (!account) return;
    loadScans();
    const id = setInterval(() => { loadScans(); }, 5000);
    return () => clearInterval(id);
  }, [account]);

  const write = useCallback(async (fn: string, args: unknown[], value?: bigint) => {
    if (!wallet || !account) return;
    setBusy(true); setError(""); setTxHash(undefined);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hash = await wallet.writeContract({ account, chain: CHAIN, address: REGISTRY, abi: agentShieldAbi, functionName: fn as any, args: args as any, value });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e; }
    finally { setBusy(false); }
  }, [wallet, account, publicClient]);

  // ── Step 0: Landing ──
  if (!account) {
    return (
      <div className="app">
        <header className="topbar"><span className="logo">AgentShield</span><button onClick={connect} className="btn primary">Connect Wallet</button></header>
        <main className="landing">
          <div className="hero-card">
            <h1>Pre-execution risk guard for autonomous agents</h1>
            <p>AgentShield analyzes every action your agent wants to take — before it executes. Define a security policy, submit proposed actions, and get <span className="green">ALLOW</span>, <span className="yellow">WARN</span>, or <span className="red">BLOCK</span> — powered by Somnia LLM.</p>
            <button onClick={connect} className="btn primary large">Connect Wallet to Start</button>
            {error && <p className="err">{error}</p>}
          </div>
          <div className="steps-preview">
            <div className="step-preview"><span className="num">1</span><b>Define</b> a security policy</div>
            <div className="step-preview"><span className="num">2</span><b>Submit</b> a proposed action</div>
            <div className="step-preview"><span className="num">3</span><b>See</b> the verdict in real-time</div>
          </div>
        </main>
      </div>
    );
  }

  // ── Main: Guided 3-step flow ──
  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">AgentShield</span>
        <div className="topbar-right">
          <a href={AGENTS} target="_blank" rel="noopener" className="pill">Agents</a>
          <a href={EXPLORER + "/address/" + REGISTRY} target="_blank" rel="noopener" className="pill">Contract {short(REGISTRY)}</a>
          <span className="pill">{short(account)}</span>
        </div>
      </header>

      <main className="workspace">
        {/* ── Step Indicator ── */}
        <nav className="stepper">
          {["Policy", "Scan Action", "Results"].map((label, i) => (
            <button key={i} onClick={() => setStep(i as 0 | 1 | 2)} className={step === i ? "active" : ""}>
              <span className="step-num">{i + 1}</span> {label}
            </button>
          ))}
        </nav>

        {/* ── Step 1: Policy ── */}
        {step === 0 && <StepPolicy write={write} busy={busy} txHash={txHash} error={error} />}

        {/* ── Step 2: Scan Action ── */}
        {step === 1 && <StepScan write={write} busy={busy} txHash={txHash} error={error} setError={setError} onDone={() => { loadScans(); setStep(2); }} />}

        {/* ── Step 3: Results ── */}
        {step === 2 && <StepResults scans={scans} onRefresh={loadScans} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// STEP 1: Policy Builder
// ═══════════════════════════════════════════════════
function StepPolicy({ write, busy, txHash, error }: { write: Function; busy: boolean; txHash?: Hash; error: string }) {
  const [maxSpend, setMaxSpend] = useState("50");
  const [pid, setPid] = useState("1");
  const [target, setTarget] = useState("");
  const [done, setDone] = useState<{ policy?: string; target?: string; selector?: string }>({});

  return (
    <section className="step-card">
      <h2>Define Security Policy</h2>
      <p className="desc">Set the rules your agent must follow. Actions violating these rules are automatically blocked.</p>

      <div className="form-group">
        <label>Max spend (STT)</label>
        <div className="input-row">
          <input value={maxSpend} onChange={e => setMaxSpend(e.target.value)} placeholder="50" disabled={busy} />
          <button disabled={busy || !maxSpend} onClick={async () => { await write("createPolicy", [parseEther(maxSpend)]); setDone(d => ({ ...d, policy: maxSpend })); }} className="btn">
            {done.policy ? "✓ Created" : "Create Policy"}
          </button>
        </div>
        {done.policy && <span className="ok">Policy created — max {done.policy} STT</span>}
      </div>

      {done.policy && <>
        <div className="form-group">
          <label>Policy ID</label>
          <input value={pid} onChange={e => setPid(e.target.value)} placeholder="1" disabled={busy} style={{ width: 120 }} />
        </div>

        <div className="form-group">
          <label>Allowed target address</label>
          <div className="input-row">
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="0x1111..." disabled={busy} />
            <button disabled={busy || !target} onClick={async () => { await write("setAllowedTarget", [BigInt(pid), target as Address, true]); setDone(d => ({ ...d, target })); }} className="btn">
              {done.target ? "✓ Allowed" : "Allow Target"}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Allowed function selector</label>
          <div className="input-row">
            <input value="0xa9059cbb" disabled className="mono" style={{ width: 200 }} />
            <button disabled={busy} onClick={async () => { await write("setAllowedSelector", [BigInt(pid), "0xa9059cbb" as `0x${string}`, true]); setDone(d => ({ ...d, selector: "0xa9059cbb" })); }} className="btn">
              {done.selector ? "✓ Allowed" : "Allow Transfer"}
            </button>
          </div>
        </div>
      </>}

      {txHash && <a href={EXPLORER + "/tx/" + txHash} target="_blank" rel="noopener" className="tx-link">View tx: {short(txHash)}</a>}
      {error && <p className="err">{error}</p>}
    </section>
  );
}

// ═══════════════════════════════════════════════════
// STEP 2: Scan Action
// ═══════════════════════════════════════════════════
const DEMOS = [
  { label: "Safe Transfer", icon: "✓", actionType: 0, target: "0x1111111111111111111111111111111111111111", selector: "0x00000000", value: "10", token: "STT", intent: "send safe payment to vendor", color: "green" },
  { label: "Exceed Max Spend", icon: "✗", actionType: 0, target: "0x1111111111111111111111111111111111111111", selector: "0x00000000", value: "100", token: "STT", intent: "drain wallet", color: "red" },
  { label: "Dangerous Approval", icon: "⚠", actionType: 1, target: "0x9999999999999999999999999999999999999999", selector: "0x095ea7b3", value: "0", token: "USDC", intent: "claim fake airdrop", color: "yellow" },
] as const;

function StepScan({ write, busy, txHash, error, setError, onDone }: { write: Function; busy: boolean; txHash?: Hash; error: string; setError: (e: string) => void; onDone: () => void }) {
  const [pid, setPid] = useState("1");
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState({ target: "", value: "", intent: "", token: "STT", actionType: 0 });

  async function submitDemo(demo: typeof DEMOS[number]) {
    await write("submitAction", [
      BigInt(pid),
      { actionType: demo.actionType, target: demo.target as Address, selector: demo.selector, value: parseEther(demo.value), tokenSymbol: demo.token, intent: demo.intent, data: "0x" }
    ], parseEther("0.35"));
    onDone();
  }

  async function submitCustom() {
    const value = form.value || "0";
    if (isNaN(Number(value))) { setError("Invalid amount"); return; }
    await write("submitAction", [
      BigInt(pid),
      { actionType: form.actionType, target: form.target as Address, selector: form.actionType === 1 ? "0x095ea7b3" : "0x00000000", value: parseEther(value), tokenSymbol: form.token, intent: form.intent, data: "0x" }
    ], parseEther("0.35"));
    onDone();
  }

  return (
    <section className="step-card">
      <h2>Scan a Proposed Action</h2>
      <p className="desc">Submit an action your agent wants to execute. AgentShield checks it against your policy and returns a verdict.</p>

      <div className="form-group">
        <label>Policy ID</label>
        <input value={pid} onChange={e => setPid(e.target.value)} style={{ width: 100 }} disabled={busy} />
      </div>

      <div className="demo-grid">
        <h3>Quick Demos</h3>
        {DEMOS.map(d => (
          <button key={d.label} disabled={busy} onClick={() => submitDemo(d)} className={`demo-card ${d.color}`}>
            <span className="demo-icon">{d.icon}</span>
            <div>
              <b>{d.label}</b>
              <span>{d.value} {d.token} — {d.intent}</span>
            </div>
          </button>
        ))}
      </div>

      <button disabled={busy} onClick={() => setCustom(!custom)} className="btn subtle">{custom ? "Hide custom" : "Custom action..."}</button>

      {custom && (
        <div className="custom-form">
          <div className="form-row">
            <select value={form.actionType} onChange={e => setForm(f => ({ ...f, actionType: +e.target.value }))} disabled={busy}>
              <option value={0}>Transfer</option>
              <option value={1}>Approval</option>
              <option value={2}>Contract Call</option>
            </select>
            <input value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder="Target address" disabled={busy} />
            <input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="Amount" disabled={busy} />
            <input value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} placeholder="Token" disabled={busy} />
          </div>
          <input value={form.intent} onChange={e => setForm(f => ({ ...f, intent: e.target.value }))} placeholder="What does the agent want to do?" disabled={busy} />
          <button disabled={busy || !form.target} onClick={submitCustom} className="btn">Submit Custom Action</button>
        </div>
      )}

      {txHash && <a href={EXPLORER + "/tx/" + txHash} target="_blank" rel="noopener" className="tx-link">View tx: {short(txHash)}</a>}
      {error && <p className="err">{error}</p>}
    </section>
  );
}

// ═══════════════════════════════════════════════════
// STEP 3: Results Dashboard
// ═══════════════════════════════════════════════════
function StepResults({ scans, onRefresh }: { scans: Scan[]; onRefresh: () => void }) {
  if (scans.length === 0) {
    return (
      <section className="step-card">
        <h2>Results</h2>
        <p className="desc">No scans yet. Go to <b>Scan Action</b> and submit one of the demos.</p>
      </section>
    );
  }

  return (
    <section className="step-card">
      <div className="section-header">
        <h2>Results</h2>
        <button onClick={onRefresh} className="btn subtle small">Refresh</button>
      </div>

      <div className="scan-feed">
        {scans.map(s => {
          const d = s.decision;
          const finalized = s.finalized;
          return (
            <div key={s.scanId.toString()} className={`scan-row ${finalized ? "" : "pending"}`}>
              <div className="scan-left">
                <span className={`badge ${badgeCls(d)}`}>{DECISIONS[d]}</span>
                <span className="scan-num">#{s.scanId.toString()}</span>
                {!finalized && <span className="pulse" />}
              </div>
              <div className="scan-center">
                <div className="risk-track">
                  <div className="risk-fill" style={{ width: `${Number(s.riskScore)}%`, background: s.riskScore >= 90n ? "#ef4444" : s.riskScore >= 70n ? "#f59e0b" : s.riskScore >= 40n ? "#fbbf24" : "#22c55e" }} />
                </div>
                <span className="risk-label">{s.riskScore.toString()}/100 — {LEVELS[s.riskLevel]}</span>
              </div>
              <div className="scan-right">
                <span>Policy #{s.policyId.toString()}</span>
                {s.requestId > 0n && <span>Req #{s.requestId.toString()}</span>}
                <span className="time">{timeAgo(s.timestamp)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function timeAgo(ts: bigint) {
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);