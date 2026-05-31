import {
  createPublicClient, createWalletClient, custom, http, parseEther, formatEther,
  type Address, type Hash, type PublicClient, type WalletClient, type Chain, type Transport,
  type EIP1193Provider
} from "viem";

declare global { interface Window { ethereum?: EIP1193Provider } }

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type Decision = "NONE" | "ALLOW" | "WARN" | "BLOCK";
export type RiskLevel = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ActionType = "TRANSFER" | "APPROVE" | "CONTRACT_CALL";

export interface Scan {
  scanId: bigint; policyId: bigint; requester: Address;
  actionHash: Hash; decision: number; riskScore: bigint;
  riskLevel: number; reasonHash: Hash; requestId: bigint;
  timestamp: bigint; finalized: boolean;
}

export interface ScanHuman {
  scanId: string; policyId: string; requester: string;
  actionHash: string; decision: Decision; riskScore: number;
  riskLevel: RiskLevel; reasonHash: string; requestId: string;
  timestamp: number; finalized: boolean;
}

export interface ProposedAction {
  actionType: 0 | 1 | 2;
  target: Address; selector: `0x${string}`; value: bigint;
  tokenSymbol: string; intent: string; data: `0x${string}`;
}

export interface PolicyInput {
  target: Address; selector: `0x${string}`; value: string;
  tokenSymbol: string; intent: string;
  actionType: ActionType;
}

export interface ShieldConfig {
  registry: Address;
  rpcUrl?: string;
  chain?: Chain;
  defaultDeposit?: string;
}

const DECISIONS: Record<number, Decision> = { 0: "NONE", 1: "ALLOW", 2: "WARN", 3: "BLOCK" };
const LEVELS: Record<number, RiskLevel> = { 0: "UNKNOWN", 1: "LOW", 2: "MEDIUM", 3: "HIGH", 4: "CRITICAL" };
const ACTION_MAP: Record<ActionType, 0 | 1 | 2> = { TRANSFER: 0, APPROVE: 1, CONTRACT_CALL: 2 };

const DEFAULT_ABI = [
  { type:"function", name:"createPolicy", stateMutability:"nonpayable", inputs:[{name:"maxSpend",type:"uint256"}], outputs:[{name:"policyId",type:"uint256"}] },
  { type:"function", name:"setAllowedTarget", stateMutability:"nonpayable", inputs:[{name:"policyId",type:"uint256"},{name:"target",type:"address"},{name:"allowed",type:"bool"}], outputs:[] },
  { type:"function", name:"setAllowedSelector", stateMutability:"nonpayable", inputs:[{name:"policyId",type:"uint256"},{name:"selector",type:"bytes4"},{name:"allowed",type:"bool"}], outputs:[] },
  { type:"function", name:"submitAction", stateMutability:"payable", inputs:[{name:"policyId",type:"uint256"},{name:"action",type:"tuple",components:[{name:"actionType",type:"uint8"},{name:"target",type:"address"},{name:"selector",type:"bytes4"},{name:"value",type:"uint256"},{name:"tokenSymbol",type:"string"},{name:"intent",type:"string"},{name:"data",type:"bytes"}]}], outputs:[{name:"scanId",type:"uint256"},{name:"requestId",type:"uint256"}] },
  { type:"function", name:"getScan", stateMutability:"view", inputs:[{name:"scanId",type:"uint256"}], outputs:[{name:"",type:"tuple",components:[{name:"scanId",type:"uint256"},{name:"policyId",type:"uint256"},{name:"requester",type:"address"},{name:"actionHash",type:"bytes32"},{name:"decision",type:"uint8"},{name:"riskScore",type:"uint256"},{name:"riskLevel",type:"uint8"},{name:"reasonHash",type:"bytes32"},{name:"requestId",type:"uint256"},{name:"timestamp",type:"uint256"},{name:"finalized",type:"bool"}]}] },
  { type:"function", name:"policies", stateMutability:"view", inputs:[{name:"policyId",type:"uint256"}], outputs:[{name:"owner",type:"address"},{name:"maxSpend",type:"uint256"},{name:"active",type:"bool"}] },
  { type:"function", name:"nextScanId", stateMutability:"view", inputs:[], outputs:[{name:"",type:"uint256"}] },
  { type:"function", name:"nextPolicyId", stateMutability:"view", inputs:[], outputs:[{name:"",type:"uint256"}] },
  { type:"event", name:"ScanSubmitted", inputs:[{indexed:true,name:"scanId",type:"uint256"},{indexed:true,name:"policyId",type:"uint256"},{indexed:false,name:"actionHash",type:"bytes32"}], anonymous:false },
  { type:"event", name:"RiskRequested", inputs:[{indexed:true,name:"scanId",type:"uint256"},{indexed:true,name:"requestId",type:"uint256"}], anonymous:false },
  { type:"event", name:"ScanFinalized", inputs:[{indexed:true,name:"scanId",type:"uint256"},{indexed:false,name:"decision",type:"uint8"},{indexed:false,name:"riskScore",type:"uint256"},{indexed:false,name:"riskLevel",type:"uint8"},{indexed:false,name:"reasonHash",type:"bytes32"}], anonymous:false },
  { type:"event", name:"PolicyCreated", inputs:[{indexed:true,name:"policyId",type:"uint256"},{indexed:true,name:"owner",type:"address"},{indexed:false,name:"maxSpend",type:"uint256"}], anonymous:false }
] as const;

const DEFAULT_RPC = "https://api.infra.testnet.somnia.network/";

const somniaChain = { id:50312, name:"Somnia Testnet", nativeCurrency:{name:"STT",symbol:"STT",decimals:18}, rpcUrls:{default:{http:[DEFAULT_RPC]}} } as const satisfies Chain;

// ═══════════════════════════════════════════════════════
// Main SDK Class
// ═══════════════════════════════════════════════════════

export class AgentShield {
  readonly registry: Address;
  readonly publicClient: PublicClient;
  readonly config: Required<ShieldConfig>;

  constructor(config: ShieldConfig) {
    this.registry = config.registry;
    this.config = {
      registry: config.registry,
      rpcUrl: config.rpcUrl ?? DEFAULT_RPC,
      chain: config.chain ?? somniaChain,
      defaultDeposit: config.defaultDeposit ?? "0.35"
    };
    this.publicClient = createPublicClient({
      chain: this.config.chain,
      transport: http(this.config.rpcUrl)
    });
  }

  // ── Read methods (no wallet needed) ──

  async getScan(scanId: bigint): Promise<Scan> {
    return this.publicClient.readContract({
      address: this.registry, abi: DEFAULT_ABI,
      functionName: "getScan", args: [scanId]
    }) as unknown as Scan;
  }

  async getScanHuman(scanId: bigint): Promise<ScanHuman> {
    const s = await this.getScan(scanId);
    return {
      scanId: s.scanId.toString(), policyId: s.policyId.toString(),
      requester: s.requester, actionHash: s.actionHash,
      decision: AgentShield.decisionLabel(s.decision),
      riskScore: Number(s.riskScore),
      riskLevel: AgentShield.riskLabel(s.riskLevel),
      reasonHash: s.reasonHash, requestId: s.requestId.toString(),
      timestamp: Number(s.timestamp), finalized: s.finalized
    };
  }

  async getLatestScans(count = 20): Promise<Scan[]> {
    const nextId = await this.publicClient.readContract({
      address: this.registry, abi: DEFAULT_ABI, functionName: "nextScanId"
    }) as bigint;
    const total = Number(nextId) - 1;
    if (total <= 0) return [];
    const scans: Scan[] = [];
    const start = Math.max(1, total - count + 1);
    for (let i = total; i >= start; i--) {
      try { scans.push(await this.getScan(BigInt(i))); } catch {}
    }
    return scans;
  }

  async getPolicy(policyId: bigint): Promise<{ owner: Address; maxSpend: bigint; active: boolean }> {
    const [owner, maxSpend, active] = await this.publicClient.readContract({
      address: this.registry, abi: DEFAULT_ABI, functionName: "policies", args: [policyId]
    }) as [Address, bigint, boolean];
    return { owner, maxSpend, active };
  }

  async waitForScanCompletion(scanId: bigint, timeoutMs = 90000): Promise<Scan> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const scan = await this.getScan(scanId);
      if (scan.finalized) return scan;
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`Scan #${scanId} not finalized within ${timeoutMs}ms`);
  }

  // ── Write methods (wallet needed) ──

  private async _walletClient(): Promise<{ client: WalletClient; account: Address }> {
    const eth = window.ethereum;
    if (typeof window === "undefined" || !eth) {
      throw new Error("No wallet found. Install MetaMask or Rabby.");
    }
    const client = createWalletClient({
      chain: this.config.chain,
      transport: custom(eth)
    });
    const [account] = await client.requestAddresses();
    return { client, account };
  }

  async createPolicy(maxSpendStt: string): Promise<{ hash: Hash; policyId: bigint }> {
    const { client, account } = await this._walletClient();
    const maxSpend = parseEther(maxSpendStt);
    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.registry,
      abi: DEFAULT_ABI, functionName: "createPolicy", args: [maxSpend]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    const nextId = await this.publicClient.readContract({
      address: this.registry, abi: DEFAULT_ABI, functionName: "nextPolicyId"
    }) as bigint;
    return { hash, policyId: nextId - 1n };
  }

  async setupPolicy(options: {
    maxSpendStt: string;
    targets?: Address[];
    selectors?: `0x${string}`[];
  }): Promise<{ hash: Hash; policyId: bigint }> {
    const { client, account } = await this._walletClient();
    const maxSpend = parseEther(options.maxSpendStt);

    // 1. Create policy
    const hash1 = await client.writeContract({
      account, chain: this.config.chain, address: this.registry,
      abi: DEFAULT_ABI, functionName: "createPolicy", args: [maxSpend]
    });
    await this.publicClient.waitForTransactionReceipt({ hash: hash1 });

    const nextId = await this.publicClient.readContract({
      address: this.registry, abi: DEFAULT_ABI, functionName: "nextPolicyId"
    }) as bigint;
    const policyId = nextId - 1n;

    // 2. Allowlist targets
    for (const target of options.targets ?? []) {
      const hash = await client.writeContract({
        account, chain: this.config.chain, address: this.registry,
        abi: DEFAULT_ABI, functionName: "setAllowedTarget",
        args: [policyId, target, true]
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
    }

    // 3. Allowlist selectors
    for (const selector of options.selectors ?? []) {
      const hash = await client.writeContract({
        account, chain: this.config.chain, address: this.registry,
        abi: DEFAULT_ABI, functionName: "setAllowedSelector",
        args: [policyId, selector, true]
      });
      await this.publicClient.waitForTransactionReceipt({ hash });
    }

    return { hash: hash1, policyId };
  }

  async scan(input: PolicyInput & { policyId?: bigint }): Promise<Scan> {
    const policyId = input.policyId ?? 1n;
    const { client, account } = await this._walletClient();
    const action: ProposedAction = {
      actionType: ACTION_MAP[input.actionType],
      target: input.target,
      selector: input.selector,
      value: parseEther(input.value),
      tokenSymbol: input.tokenSymbol,
      intent: input.intent,
      data: "0x"
    };
    const deposit = parseEther(this.config.defaultDeposit);
    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.registry,
      abi: DEFAULT_ABI, functionName: "submitAction",
      args: [policyId, action], value: deposit
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Extract scanId from events
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: DEFAULT_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "ScanSubmitted") {
          const { scanId } = decoded.args as { scanId: bigint };
          return this.waitForScanCompletion(scanId);
        }
      } catch {}
    }
    throw new Error("ScanSubmitted event not found in receipt");
  }

  async safeCheck(input: PolicyInput & { policyId?: bigint }): Promise<{
    decision: Decision; riskScore: number; riskLevel: RiskLevel;
    allowed: boolean; reason: string;
  }> {
    const scan = await this.scan(input);
    const decision = AgentShield.decisionLabel(scan.decision);
    return {
      decision,
      riskScore: Number(scan.riskScore),
      riskLevel: AgentShield.riskLabel(scan.riskLevel),
      allowed: decision === "ALLOW",
      reason: decision === "ALLOW" ? "Action approved by AgentShield"
        : decision === "WARN" ? "Action flagged — review before executing"
        : "Action blocked — violates security policy"
    };
  }

  // ── Watchers ──

  watchScans(onScan: (scan: Scan) => void, pollMs = 4000) {
    return this.publicClient.watchContractEvent({
      address: this.registry, abi: DEFAULT_ABI,
      eventName: "ScanFinalized", pollingInterval: pollMs,
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            const decoded = decodeEventLog({ abi: DEFAULT_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName === "ScanFinalized") {
              const { scanId } = decoded.args as { scanId: bigint };
              onScan(await this.getScan(scanId));
            }
          } catch {}
        }
      }
    });
  }

  // ── Static helpers ──

  static decisionLabel(n: number): Decision { return DECISIONS[n] ?? "NONE"; }
  static riskLabel(n: number): RiskLevel { return LEVELS[n] ?? "UNKNOWN"; }
  static formatStt(wei: bigint): string { return formatEther(wei); }
}

// Need decodeEventLog from viem
import { decodeEventLog } from "viem";