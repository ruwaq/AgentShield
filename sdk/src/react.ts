"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import type { EIP1193Provider } from "viem";
import { AgentShield, type Scan, type ScanHuman, type ShieldConfig, type Decision } from "./index";

declare global { interface Window { ethereum?: EIP1193Provider } }

/**
 * React hook: Connect to AgentShield and get a wallet client.
 * Returns { shield, account, connect, disconnect }
 */
export function useAgentShield(config: ShieldConfig) {
  const [shield] = useState(() => new AgentShield(config));
  const [account, setAccount] = useState<string>();
  const [error, setError] = useState<string>();

  const connect = useCallback(async () => {
    try {
      const eth = window.ethereum;
      if (typeof window === "undefined" || !eth) {
        throw new Error("No wallet detected. Install MetaMask or Rabby.");
      }
      const [addr] = await eth.request({ method: "eth_requestAccounts" });
      setAccount(addr);
      setError(undefined);

      eth.on("accountsChanged", ([a]: string[]) => setAccount(a));
      eth.on("disconnect", () => setAccount(undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return { shield, account, connect, error };
}

/**
 * React hook: Live scan polling with auto-refresh.
 * Returns { scans, loading, error, refresh }
 */
export function useScans(shield: AgentShield, pollMs = 5000) {
  const [scans, setScans] = useState<ScanHuman[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const raw = await shield.getLatestScans(20);
      const human: ScanHuman[] = [];
      for (const s of raw) {
        human.push({
          scanId: s.scanId.toString(), policyId: s.policyId.toString(),
          requester: s.requester, actionHash: s.actionHash,
          decision: AgentShield.decisionLabel(s.decision),
          riskScore: Number(s.riskScore),
          riskLevel: AgentShield.riskLabel(s.riskLevel),
          reasonHash: s.reasonHash, requestId: s.requestId.toString(),
          timestamp: Number(s.timestamp), finalized: s.finalized
        });
      }
      setScans(human);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [shield]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { scans, loading, error, refresh };
}

/**
 * React hook: Watch a specific scan until finalized.
 * Returns { scan, finalized, waiting }
 */
export function useScan(shield: AgentShield, scanId: bigint | undefined) {
  const [scan, setScan] = useState<ScanHuman>();
  const [finalized, setFinalized] = useState(false);

  useEffect(() => {
    if (scanId == null) return;
    let active = true;
    (async () => {
      while (active) {
        const s = await shield.getScanHuman(scanId);
        setScan(s);
        if (s.finalized) { setFinalized(true); break; }
        await new Promise(r => setTimeout(r, 2000));
      }
    })();
    return () => { active = false; };
  }, [shield, scanId]);

  return { scan, finalized, waiting: !finalized };
}

/**
 * React hook: One-shot safe check — scan and get result.
 * Returns { check, result, loading }
 */
export function useSafeCheck(shield: AgentShield) {
  const [result, setResult] = useState<{ decision: Decision; riskScore: number; allowed: boolean }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const check = useCallback(async (params: Parameters<AgentShield["scan"]>[0]) => {
    setLoading(true);
    setError(undefined);
    try {
      const scan = await shield.scan(params);
      const r = {
        decision: AgentShield.decisionLabel(scan.decision),
        riskScore: Number(scan.riskScore),
        allowed: scan.decision === 1
      };
      setResult(r);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally { setLoading(false); }
  }, [shield]);

  return { check, result, loading, error };
}