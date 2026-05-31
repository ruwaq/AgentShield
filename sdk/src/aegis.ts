/**
 * @aegis/sdk — Autonomous Execution & Generative Intelligence System
 *
 * 3 líneas para integrar pipelines de IA multi-agente en Somnia:
 *
 *   const aegis = new Aegis({ brain: "0x...", create: "0x...", listen: "0x..." });
 *   const guardian = await aegis.createGuardian({ name: "Magnus", archetype: "dragon" });
 *   aegis.listen("Transfer(address,address,uint256)", async (event) => { ... });
 */

import {
  createPublicClient, createWalletClient, custom, http, parseEther,
  decodeEventLog, encodeAbiParameters, type Address, type Hash,
  type PublicClient, type WalletClient, type Chain, type Transport,
  type EIP1193Provider
} from "viem";

declare global { interface Window { ethereum?: EIP1193Provider } }

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export interface AegisConfig {
  /** Dirección de AegisBrain (o AegisCreate/AegisListen — comparten dirección) */
  brain: Address;
  /** Dirección de AegisCreate (NFT guardianes). Si es la misma que brain, omitir. */
  create?: Address;
  /** Dirección de AegisListen (reactividad). Si es la misma que brain, omitir. */
  listen?: Address;
  /** RPC URL (default: Somnia testnet) */
  rpcUrl?: string;
  /** Chain config (default: Somnia testnet 50312) */
  chain?: Chain;
  /** Depósito por request de agente (default: 0.03 SOMI) */
  agentDeposit?: string;
}

export interface GuardianConfig {
  name: string;
  archetype: "dragon" | "knight" | "phoenix" | "fox" | "void-knight" | string;
}

export interface GuardianStats {
  tokenId: bigint;
  name: string;
  archetype: string;
  personality: string;
  level: number;
  experience: number;
  battlesWon: number;
  battlesTotal: number;
  scarsCount: number;
  revealed: boolean;
}

export interface AgentCall {
  agentId: bigint;
  payload: `0x${string}`;
  resultLabel: string;
}

export interface Thought {
  decision: string;
  riskScore: number;
  reasoning: string;
  agentResults: readonly `0x${string}`[];
  memoryHash: Hash;
}

export interface ListenerConfig {
  target: Address;
  eventSignature: `0x${string}`;
  agentCalls: AgentCall[];
  context: string;
}

export interface ListenerInfo {
  listenerId: bigint;
  target: Address;
  eventSignature: `0x${string}`;
  active: boolean;
  triggerCount: number;
  owner: Address;
}

export interface TriggerResult {
  listenerId: bigint;
  pipelineId: bigint;
  timestamp: number;
  eventData: `0x${string}`;
}

// ═══════════════════════════════════════════════════════
// ABI (human-readable fragments)
// ═══════════════════════════════════════════════════════

const AEGIS_BRAIN_ABI = [
  // Pipeline
  {
    type: "function", name: "thinkPipeline",
    inputs: [
      { name: "context", type: "string" },
      { name: "agentCalls", type: "tuple[]", components: [
        { name: "agentId", type: "uint256" },
        { name: "payload", type: "bytes" },
        { name: "resultLabel", type: "string" }
      ]}
    ],
    outputs: [{ name: "pipelineId", type: "uint256" }],
    stateMutability: "payable"
  },
  // Multi-think
  {
    type: "function", name: "multiThink",
    inputs: [
      { name: "prompt", type: "string" },
      { name: "agentCount", type: "uint256" },
      { name: "consensusThreshold", type: "uint256" }
    ],
    outputs: [{ name: "pipelineId", type: "uint256" }],
    stateMutability: "payable"
  },
  // Tool-use
  {
    type: "function", name: "thinkWithTools",
    inputs: [
      { name: "prompt", type: "string" },
      { name: "tools", type: "tuple[]", components: [
        { name: "signature", type: "string" },
        { name: "description", type: "string" }
      ]},
      { name: "maxIterations", type: "uint256" }
    ],
    outputs: [{ name: "pipelineId", type: "uint256" }],
    stateMutability: "payable"
  },
  // Memory
  {
    type: "function", name: "remember",
    inputs: [
      { name: "key", type: "bytes32" },
      { name: "data", type: "bytes" }
    ],
    outputs: [{ name: "memoryHash", type: "bytes32" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function", name: "recall",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "data", type: "bytes" }],
    stateMutability: "view"
  },
  // Pipeline results
  {
    type: "function", name: "pipelineResults",
    inputs: [{ name: "pipelineId", type: "uint256" }],
    outputs: [
      { name: "decision", type: "string" },
      { name: "riskScore", type: "uint256" },
      { name: "reasoning", type: "string" },
      { name: "memoryHash", type: "bytes32" }
    ],
    stateMutability: "view"
  },
  // Events
  {
    type: "event", name: "PipelineStarted",
    inputs: [
      { indexed: true, name: "pipelineId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "agentCount", type: "uint256" },
      { indexed: false, name: "isMultiThink", type: "bool" }
    ]
  },
  {
    type: "event", name: "PipelineCompleted",
    inputs: [
      { indexed: true, name: "pipelineId", type: "uint256" },
      { indexed: false, name: "thought", type: "tuple", components: [
        { name: "decision", type: "string" },
        { name: "riskScore", type: "uint256" },
        { name: "reasoning", type: "string" },
        { name: "agentResults", type: "bytes[]" },
        { name: "memoryHash", type: "bytes32" }
      ]}
    ]
  },
  {
    type: "event", name: "PipelineFailed",
    inputs: [
      { indexed: true, name: "pipelineId", type: "uint256" },
      { indexed: false, name: "failedStep", type: "uint256" },
      { indexed: false, name: "reason", type: "string" }
    ]
  }
] as const;

const AEGIS_CREATE_ABI = [
  // Mint
  {
    type: "function", name: "mintGuardian",
    inputs: [
      { name: "name", type: "string" },
      { name: "archetype", type: "string" }
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "payable"
  },
  // Battle
  {
    type: "function", name: "recordBattle",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "victory", type: "bool" },
      { name: "memoryText", type: "string" }
    ],
    outputs: [{ name: "newLevel", type: "uint256" }],
    stateMutability: "nonpayable"
  },
  // Evolve
  {
    type: "function", name: "evolve",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "eventDescription", type: "string" }
    ],
    outputs: [{ name: "newLevel", type: "uint256" }],
    stateMutability: "nonpayable"
  },
  // Stats
  {
    type: "function", name: "getGuardianStats",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "archetype", type: "string" },
      { name: "personality", type: "string" },
      { name: "level", type: "uint256" },
      { name: "experience", type: "uint256" },
      { name: "battlesWon", type: "uint256" },
      { name: "battlesTotal", type: "uint256" },
      { name: "scarsCount", type: "uint256" },
      { name: "revealed", type: "bool" }
    ],
    stateMutability: "view"
  },
  // Token URI
  {
    type: "function", name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view"
  },
  // Owner
  {
    type: "function", name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view"
  },
  // Mint price
  {
    type: "function", name: "mintPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  // Events
  {
    type: "event", name: "GuardianMinted",
    inputs: [
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "archetype", type: "string" }
    ]
  },
  {
    type: "event", name: "GuardianRevealed",
    inputs: [
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: false, name: "personality", type: "string" },
      { indexed: false, name: "visualTraits", type: "string" }
    ]
  },
  {
    type: "event", name: "GuardianEvolved",
    inputs: [
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: false, name: "newLevel", type: "uint256" },
      { indexed: false, name: "scar", type: "string" }
    ]
  }
] as const;

const AEGIS_LISTEN_ABI = [
  // Create listener
  {
    type: "function", name: "on",
    inputs: [
      { name: "target", type: "address" },
      { name: "eventSignature", type: "bytes32" },
      { name: "aiPipeline", type: "bytes" },
      { name: "context", type: "string" }
    ],
    outputs: [{ name: "listenerId", type: "uint256" }],
    stateMutability: "nonpayable"
  },
  // Stop listener
  {
    type: "function", name: "stop",
    inputs: [{ name: "listenerId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  // Handle event
  {
    type: "function", name: "handleEvent",
    inputs: [
      { name: "listenerId", type: "uint256" },
      { name: "eventData", type: "bytes" }
    ],
    outputs: [{ name: "pipelineId", type: "uint256" }],
    stateMutability: "nonpayable"
  },
  // Get listener
  {
    type: "function", name: "getListener",
    inputs: [{ name: "listenerId", type: "uint256" }],
    outputs: [
      { name: "target", type: "address" },
      { name: "eventSignature", type: "bytes32" },
      { name: "aiPipeline", type: "bytes" },
      { name: "context", type: "string" },
      { name: "active", type: "bool" },
      { name: "triggerCount", type: "uint256" },
      { name: "createdAt", type: "uint256" },
      { name: "owner", type: "address" }
    ],
    stateMutability: "view"
  },
  // Events
  {
    type: "event", name: "ListenerCreated",
    inputs: [
      { indexed: true, name: "listenerId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "target", type: "address" },
      { indexed: false, name: "eventSignature", type: "bytes32" }
    ]
  },
  {
    type: "event", name: "ListenerTriggered",
    inputs: [
      { indexed: true, name: "listenerId", type: "uint256" },
      { indexed: true, name: "pipelineId", type: "uint256" },
      { indexed: false, name: "eventData", type: "bytes" }
    ]
  }
] as const;

// ═══════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════

const DEFAULT_RPC = "https://api.infra.testnet.somnia.network/";
const somniaTestnet = {
  id: 50312, name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_RPC] } }
} as const satisfies Chain;

// ═══════════════════════════════════════════════════════
// Main Aegis SDK Class
// ═══════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecodedEventArgs = Record<string, any>;

export class Aegis {
  readonly brain: Address;
  readonly create: Address;
  readonly listen: Address;
  readonly publicClient: PublicClient;
  readonly config: Required<AegisConfig>;

  constructor(config: AegisConfig) {
    this.brain = config.brain;
    this.create = config.create ?? config.brain;
    this.listen = config.listen ?? config.brain;
    this.config = {
      brain: config.brain,
      create: this.create,
      listen: this.listen,
      rpcUrl: config.rpcUrl ?? DEFAULT_RPC,
      chain: config.chain ?? somniaTestnet,
      agentDeposit: config.agentDeposit ?? "0.03"
    };
    this.publicClient = createPublicClient({
      chain: this.config.chain,
      transport: http(this.config.rpcUrl)
    });
  }

  // ═══════════════════════════════════════════════════════
  // Wallet
  // ═══════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════
  // THINK — Pipeline multi-agente
  // ═══════════════════════════════════════════════════════

  /**
   * Ejecuta un pipeline de agentes de IA.
   * Encadena N agentes en secuencia: el output de cada uno alimenta al siguiente.
   *
   * @example
   * const thought = await aegis.think("Analyze this transaction", [
   *   { agentId: LLM_AGENT_ID, payload: "0x", resultLabel: "analysis" }
   * ]);
   */
  async think(
    context: string,
    agentCalls: AgentCall[]
  ): Promise<{ pipelineId: bigint; thought: Thought }> {
    const { client, account } = await this._walletClient();
    const deposit = parseEther(this.config.agentDeposit);

    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.brain,
      abi: AEGIS_BRAIN_ABI, functionName: "thinkPipeline",
      args: [context, agentCalls], value: deposit
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Extract pipelineId from PipelineStarted event
    let pipelineId = 0n;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AEGIS_BRAIN_ABI, data: log.data, topics: log.topics
        });
        if (decoded.eventName === "PipelineStarted") {
          const args = decoded.args as DecodedEventArgs;
          pipelineId = (args.pipelineId as bigint) ?? 0n;
          break;
        }
      } catch {}
    }

    if (pipelineId === 0n) throw new Error("PipelineStarted event not found");

    // Wait for pipeline completion
    const thought = await this._waitForPipeline(pipelineId);
    return { pipelineId, thought };
  }

  /**
   * Consenso multi-LLM: N agentes votan, mayoría decide.
   *
   * @example
   * const result = await aegis.multiThink("Is this safe?", 3, 2);
   */
  async multiThink(
    prompt: string,
    agentCount: number = 3,
    threshold: number = 2
  ): Promise<{ pipelineId: bigint; thought: Thought }> {
    const { client, account } = await this._walletClient();
    const deposit = parseEther(this.config.agentDeposit) * BigInt(agentCount);

    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.brain,
      abi: AEGIS_BRAIN_ABI, functionName: "multiThink",
      args: [prompt, BigInt(agentCount), BigInt(threshold)], value: deposit
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    let pipelineId = 0n;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AEGIS_BRAIN_ABI, data: log.data, topics: log.topics
        });
        if (decoded.eventName === "PipelineStarted") {
          const args = decoded.args as DecodedEventArgs;
          pipelineId = (args.pipelineId as bigint) ?? 0n;
          break;
        }
      } catch {}
    }

    const thought = await this._waitForPipeline(pipelineId);
    return { pipelineId, thought };
  }

  /**
   * Espera a que un pipeline se complete (escuchando el evento PipelineCompleted).
   */
  private async _waitForPipeline(pipelineId: bigint, timeoutMs = 120000): Promise<Thought> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        // Try reading pipelineResults — if it returns non-empty, pipeline is done
        const result = await this.publicClient.readContract({
          address: this.brain, abi: AEGIS_BRAIN_ABI,
          functionName: "pipelineResults", args: [pipelineId]
        }) as [string, bigint, string, Hash];

        if (result[0] !== "") {
          return {
            decision: result[0],
            riskScore: Number(result[1]),
            reasoning: result[2],
            agentResults: [], // Not available via this getter
            memoryHash: result[3]
          };
        }
      } catch {
        // Pipeline not complete yet
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`Pipeline #${pipelineId} not completed within ${timeoutMs}ms`);
  }

  // ═══════════════════════════════════════════════════════
  // CREATE — NFT Guardianes
  // ═══════════════════════════════════════════════════════

  /**
   * Crea un guardián NFT con personalidad generada por IA.
   * El guardián se mintea inmediatamente pero su personalidad se revela
   * cuando el LLM responde (toma unos segundos).
   *
   * @example
   * const guardian = await aegis.createGuardian({ name: "Magnus", archetype: "dragon" });
   * console.log(guardian.personality); // "I am Magnus, ancient dragon of the void..."
   */
  async createGuardian(
    config: GuardianConfig
  ): Promise<GuardianStats> {
    const { client, account } = await this._walletClient();

    // Get mint price
    const mintPrice = await this.publicClient.readContract({
      address: this.create, abi: AEGIS_CREATE_ABI, functionName: "mintPrice"
    }) as bigint;

    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.create,
      abi: AEGIS_CREATE_ABI, functionName: "mintGuardian",
      args: [config.name, config.archetype], value: mintPrice
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    // Extract tokenId from GuardianMinted event
    let tokenId = 0n;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AEGIS_CREATE_ABI, data: log.data, topics: log.topics
        });
        if (decoded.eventName === "GuardianMinted") {
          const args = decoded.args as DecodedEventArgs;
          tokenId = (args.tokenId as bigint) ?? 0n;
          break;
        }
      } catch {}
    }

    if (tokenId === 0n) throw new Error("GuardianMinted event not found");

    // Wait for revelation (LLM callback)
    return this._waitForRevelation(tokenId);
  }

  /**
   * Espera a que el guardián sea revelado por el LLM.
   */
  private async _waitForRevelation(tokenId: bigint, timeoutMs = 120000): Promise<GuardianStats> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const stats = await this.getGuardianStats(tokenId);
      if (stats.revealed) return stats;
      await new Promise(r => setTimeout(r, 2000));
    }
    // Return unrevealed stats after timeout
    return this.getGuardianStats(tokenId);
  }

  /**
   * Obtiene las estadísticas de un guardián.
   */
  async getGuardianStats(tokenId: bigint): Promise<GuardianStats> {
    const [name, archetype, personality, level, experience, battlesWon, battlesTotal, scarsCount, revealed] =
      await this.publicClient.readContract({
        address: this.create, abi: AEGIS_CREATE_ABI,
        functionName: "getGuardianStats", args: [tokenId]
      }) as [string, string, string, bigint, bigint, bigint, bigint, bigint, boolean];

    return {
      tokenId, name, archetype, personality,
      level: Number(level), experience: Number(experience),
      battlesWon: Number(battlesWon), battlesTotal: Number(battlesTotal),
      scarsCount: Number(scarsCount), revealed
    };
  }

  /**
   * Registra una batalla para un guardián (lo hace evolucionar).
   */
  async recordBattle(
    tokenId: bigint,
    victory: boolean,
    memoryText: string
  ): Promise<{ newLevel: number; hash: Hash }> {
    const { client, account } = await this._walletClient();
    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.create,
      abi: AEGIS_CREATE_ABI, functionName: "recordBattle",
      args: [tokenId, victory, memoryText]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    let newLevel = 0;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AEGIS_CREATE_ABI, data: log.data, topics: log.topics
        });
        if (decoded.eventName === "GuardianEvolved") {
          const args = decoded.args as DecodedEventArgs;
          newLevel = Number(args.newLevel);
        }
      } catch {}
    }

    return { newLevel, hash };
  }

  // ═══════════════════════════════════════════════════════
  // LISTEN — Reactividad
  // ═══════════════════════════════════════════════════════

  /**
   * Crea un listener que dispara un pipeline de IA cuando ocurre un evento.
   *
   * @example
   * const listenerId = await aegis.onEvent({
   *   target: "0xTokenAddress",
   *   eventSignature: "0xddf252ad...", // keccak256("Transfer(address,address,uint256)")
   *   agentCalls: [{ agentId: LLM_AGENT_ID, payload: "0x", resultLabel: "analysis" }],
   *   context: "A transfer occurred. Analyze if it's suspicious."
   * });
   */
  async onEvent(config: ListenerConfig): Promise<bigint> {
    const { client, account } = await this._walletClient();

    // Encode agentCalls as bytes
    const { encodeAbiParameters } = await import("viem");
    // Simple ABI encoding of AgentCall[]
    // We use a manual approach since we need tuple encoding
    const pipelineBytes = this._encodeAgentCalls(config.agentCalls);

    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.listen,
      abi: AEGIS_LISTEN_ABI, functionName: "on",
      args: [config.target, config.eventSignature as `0x${string}`, pipelineBytes, config.context]
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AEGIS_LISTEN_ABI, data: log.data, topics: log.topics
        });
        if (decoded.eventName === "ListenerCreated") {
          const args = decoded.args as DecodedEventArgs;
          return (args.listenerId as bigint) ?? 0n;
        }
      } catch {}
    }

    throw new Error("ListenerCreated event not found");
  }

  /**
   * Dispara manualmente un listener con datos de evento.
   * Útil para integraciones off-chain (WebSocket reactivity).
   */
  async triggerListener(listenerId: bigint, eventData: `0x${string}`): Promise<bigint> {
    const { client, account } = await this._walletClient();
    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.listen,
      abi: AEGIS_LISTEN_ABI, functionName: "handleEvent",
      args: [listenerId, eventData]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AEGIS_LISTEN_ABI, data: log.data, topics: log.topics
        });
        if (decoded.eventName === "ListenerTriggered") {
          const args = decoded.args as DecodedEventArgs;
          return (args.pipelineId as bigint) ?? 0n;
        }
      } catch {}
    }

    throw new Error("ListenerTriggered event not found");
  }

  /**
   * Detiene un listener.
   */
  async stopListener(listenerId: bigint): Promise<Hash> {
    const { client, account } = await this._walletClient();
    return client.writeContract({
      account, chain: this.config.chain, address: this.listen,
      abi: AEGIS_LISTEN_ABI, functionName: "stop", args: [listenerId]
    });
  }

  /**
   * Obtiene información de un listener.
   */
  async getListener(listenerId: bigint): Promise<ListenerInfo> {
    const [target, eventSignature, , , active, triggerCount, , owner] =
      await this.publicClient.readContract({
        address: this.listen, abi: AEGIS_LISTEN_ABI,
        functionName: "getListener", args: [listenerId]
      }) as [Address, `0x${string}`, `0x${string}`, string, boolean, bigint, bigint, Address];

    return {
      listenerId, target,
      eventSignature: eventSignature as `0x${string}`,
      active, triggerCount: Number(triggerCount), owner
    };
  }

  // ═══════════════════════════════════════════════════════
  // MEMORY
  // ═══════════════════════════════════════════════════════

  /**
   * Guarda datos en la memoria persistente on-chain.
   */
  async remember(key: `0x${string}`, data: `0x${string}`): Promise<{ hash: Hash; memoryHash: Hash }> {
    const { client, account } = await this._walletClient();
    const hash = await client.writeContract({
      account, chain: this.config.chain, address: this.brain,
      abi: AEGIS_BRAIN_ABI, functionName: "remember", args: [key, data]
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return { hash, memoryHash: receipt.logs[0]?.topics[1] as Hash ?? "0x" };
  }

  /**
   * Recupera datos de la memoria persistente.
   */
  async recall(key: `0x${string}`): Promise<`0x${string}`> {
    return this.publicClient.readContract({
      address: this.brain, abi: AEGIS_BRAIN_ABI,
      functionName: "recall", args: [key]
    }) as Promise<`0x${string}`>;
  }

  // ═══════════════════════════════════════════════════════
  // EXECUTE — Acción con verificación AI
  // ═══════════════════════════════════════════════════════

  /**
   * Ejecuta una transacción con verificación AI previa.
   * 1. El LLM analiza la intención
   * 2. Si ALLOW → ejecuta la tx
   * 3. Si WARN → notifica pero ejecuta
   * 4. Si BLOCK → revierte
   *
   * @example
   * const result = await aegis.executeWithGuardian({
   *   to: "0x...",
   *   value: parseEther("1"),
   *   data: "0x",
   *   intent: "Pago mensual de suscripción"
   * });
   */
  async executeWithGuardian(params: {
    to: Address;
    value?: bigint;
    data?: `0x${string}`;
    intent: string;
  }): Promise<{ decision: string; riskScore: number; txHash?: Hash }> {
    // Step 1: AI analysis
    const { thought } = await this.think(params.intent, [{
      agentId: 12847293847561029384n, // LLM Agent ID
      payload: "0x",
      resultLabel: "security_check"
    }]);

    if (thought.decision === "BLOCK") {
      return { decision: "BLOCK", riskScore: thought.riskScore };
    }

    // Step 2: Execute if not blocked
    const { client, account } = await this._walletClient();
    const txHash = await client.sendTransaction({
      account, chain: this.config.chain,
      to: params.to, value: params.value ?? 0n, data: params.data ?? "0x"
    });

    return {
      decision: thought.decision,
      riskScore: thought.riskScore,
      txHash
    };
  }

  // ═══════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════

  /**
   * Codifica AgentCall[] a bytes para almacenar en el listener.
   */
  private _encodeAgentCalls(calls: AgentCall[]): `0x${string}` {
    // ABI encode AgentCall[] as tuple[]
    const encoded = encodeAbiParameters(
      [{ type: "tuple[]", components: [
        { name: "agentId", type: "uint256" },
        { name: "payload", type: "bytes" },
        { name: "resultLabel", type: "string" }
      ]}],
      [calls]
    );
    return encoded as `0x${string}`;
  }

  /**
   * Escucha eventos PipelineCompleted para un pipeline específico.
   */
  watchPipeline(
    pipelineId: bigint,
    onComplete: (thought: Thought) => void,
    onError?: (error: Error) => void
  ) {
    return this.publicClient.watchContractEvent({
      address: this.brain, abi: AEGIS_BRAIN_ABI,
      eventName: "PipelineCompleted",
      onLogs: (logs) => {
        for (const log of logs) {
          try {
            const decoded = decodeEventLog({
              abi: AEGIS_BRAIN_ABI, data: log.data, topics: log.topics
            });
            if (decoded.eventName === "PipelineCompleted") {
              const args = decoded.args as DecodedEventArgs;
              if (args.pipelineId === pipelineId) {
                onComplete({
                  decision: args.thought.decision,
                  riskScore: Number(args.thought.riskScore),
                  reasoning: args.thought.reasoning,
                  agentResults: args.thought.agentResults,
                  memoryHash: args.thought.memoryHash
                });
              }
            }
          } catch (e) {
            onError?.(e as Error);
          }
        }
      }
    });
  }
}

// ═══════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════

/** LLM Inference Agent ID (verificado on-chain 2026-05-29) */
export const LLM_AGENT_ID = 12847293847561029384n;

/** LLM Parse Website Agent ID (confirmado en docs) */
export const PARSE_WEBSITE_AGENT_ID = 12875401142070969085n;

/** Somnia Agents Platform — Testnet */
export const PLATFORM_TESTNET = "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776" as const;

/** Somnia Agents Platform — Mainnet */
export const PLATFORM_MAINNET = "0x5E5205CF39E766118C01636bED000A54D93163E6" as const;

/** EntryPoint v0.7 — Somnia */
export const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;

/** Reactivity Precompile */
export const REACTIVITY_PRECOMPILE = "0x0100" as const;