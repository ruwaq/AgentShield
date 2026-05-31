"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import type { EIP1193Provider } from "viem";
import {
  Aegis, type AegisConfig, type GuardianStats, type Thought,
  type AgentCall, type ListenerConfig
} from "./aegis";

/**
 * React hook: Conecta a AEGIS y gestiona la wallet.
 *
 * @example
 * const { aegis, account, connect } = useAegis({
 *   brain: "0xYourAegisBrainAddress"
 * });
 */
export function useAegis(config: AegisConfig) {
  const [aegis] = useState(() => new Aegis(config));
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

  return { aegis, account, connect, error };
}

/**
 * React hook: Crea y gestiona un guardián NFT.
 *
 * @example
 * const { guardian, createGuardian, loading } = useGuardian(aegis);
 * // Luego: <button onClick={() => createGuardian({ name: "Magnus", archetype: "dragon" })}>
 */
export function useGuardian(aegis: Aegis | undefined) {
  const [guardian, setGuardian] = useState<GuardianStats>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const createGuardian = useCallback(async (config: { name: string; archetype: string }) => {
    if (!aegis) return;
    setLoading(true);
    setError(undefined);
    try {
      const g = await aegis.createGuardian(config);
      setGuardian(g);
      return g;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, [aegis]);

  const refreshGuardian = useCallback(async (tokenId: bigint) => {
    if (!aegis) return;
    try {
      const g = await aegis.getGuardianStats(tokenId);
      setGuardian(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [aegis]);

  return { guardian, createGuardian, refreshGuardian, loading, error };
}

/**
 * React hook: Ejecuta pipelines de IA y obtiene resultados.
 *
 * @example
 * const { think, thinking, lastThought } = useBrain(aegis);
 * // <button onClick={() => think("Analyze this", agentCalls)}>Analyze</button>
 */
export function useBrain(aegis: Aegis | undefined) {
  const [thinking, setThinking] = useState(false);
  const [lastThought, setLastThought] = useState<Thought>();
  const [error, setError] = useState<string>();

  const think = useCallback(async (context: string, agentCalls: AgentCall[]) => {
    if (!aegis) throw new Error("Aegis not connected");
    setThinking(true);
    setError(undefined);
    try {
      const { thought } = await aegis.think(context, agentCalls);
      setLastThought(thought);
      return thought;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setThinking(false);
    }
  }, [aegis]);

  const multiThink = useCallback(async (prompt: string, agentCount = 3, threshold = 2) => {
    if (!aegis) throw new Error("Aegis not connected");
    setThinking(true);
    setError(undefined);
    try {
      const { thought } = await aegis.multiThink(prompt, agentCount, threshold);
      setLastThought(thought);
      return thought;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setThinking(false);
    }
  }, [aegis]);

  return { think, multiThink, thinking, lastThought, error };
}

/**
 * React hook: Gestiona listeners de reactividad.
 *
 * @example
 * const { createListener, listeners, stopListener } = useListeners(aegis);
 */
export function useListeners(aegis: Aegis | undefined) {
  const [listenerIds, setListenerIds] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const createListener = useCallback(async (config: ListenerConfig) => {
    if (!aegis) throw new Error("Aegis not connected");
    setLoading(true);
    setError(undefined);
    try {
      const id = await aegis.onEvent(config);
      setListenerIds(prev => [...prev, id]);
      return id;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, [aegis]);

  const stopListener = useCallback(async (listenerId: bigint) => {
    if (!aegis) throw new Error("Aegis not connected");
    await aegis.stopListener(listenerId);
    setListenerIds(prev => prev.filter(id => id !== listenerId));
  }, [aegis]);

  return { createListener, stopListener, listenerIds, loading, error };
}

/**
 * React hook: Ejecuta transacciones con verificación AI previa.
 *
 * @example
 * const { executeWithGuardian, lastResult } = useAegisExecute(aegis);
 * await executeWithGuardian({ to: "0x...", value: 1n, intent: "Pago mensual" });
 */
export function useAegisExecute(aegis: Aegis | undefined) {
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<{ decision: string; riskScore: number; txHash?: string }>();
  const [error, setError] = useState<string>();

  const executeWithGuardian = useCallback(async (params: {
    to: string; value?: bigint; data?: string; intent: string;
  }) => {
    if (!aegis) throw new Error("Aegis not connected");
    setExecuting(true);
    setError(undefined);
    try {
      const result = await aegis.executeWithGuardian({
        to: params.to as `0x${string}`,
        value: params.value,
        data: params.data as `0x${string}` | undefined,
        intent: params.intent
      });
      setLastResult(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setExecuting(false);
    }
  }, [aegis]);

  return { executeWithGuardian, executing, lastResult, error };
}