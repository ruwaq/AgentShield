# AgentShield — Pre-Execution Risk Guard for Autonomous Agents

**AgentShield** analyzes every action your autonomous agent wants to execute *before* it happens. Define a security policy, submit proposed actions, and get **ALLOW**, **WARN**, or **BLOCK** — powered by Somnia LLM Inference.

> Built for [Somnia Blockchain](https://somnia.network) testnet (chain ID 50312).

---

## Architecture

```
User/Agent → submitAction() → _localCheck() → deterministic BLOCK? → return
                ↓ (not blocked)
         somniaAgents.createRequest() → LLM inference → handleAgentResponse()
                ↓
         _parseAgentResponse() → _finalize() → Scan stored on-chain
```

**Key principle:** Deterministic checks first (max spend, allowlists, selectors). Only actions that pass local checks are sent to the LLM, saving gas on obviously malicious actions.

---

## Project Structure

```
contracts/
├── AgentShieldRegistry.sol        # Main contract — policy CRUD, submitAction, LLM callback
├── interfaces/
│   └── ISomniaAgents.sol          # Somnia Agents Platform interface
├── aegis/                         # Advanced AI pipeline contracts
│   ├── AegisBrain.sol             # Multi-agent pipeline engine (thinkPipeline, multiThink)
│   ├── AegisBrainV2.sol           # Natural Language security engine (zero-config)
│   ├── AegisCreate.sol            # NFT guardians with AI-generated personalities
│   └── AegisListen.sol            # On-chain event reactivity → AI pipelines
└── libraries/
    └── StringUtils.sol            # Shared gas-efficient string conversion utilities

script/
├── Deploy.s.sol                   # DeployScript + CreateDemoPolicyScript
└── DeployAegis.s.sol              # Aegis contracts deployment

test/
├── AgentShieldRegistry.t.sol      # 24 tests — core contract
├── SecurityAudit.t.sol            # 29 tests — 12 attack vectors
├── EdgeCases.t.sol                # 20 tests — concurrency, gas, timestamps
├── AegisBrain.t.sol               # 31 tests — pipeline engine
├── AegisBrainV2.t.sol             # 25 tests — NL security engine
├── AegisCreate.t.sol              # 25 tests — NFT guardians
└── AegisListen.t.sol              # 17 tests — event reactivity

frontend/
├── src/
│   ├── main.tsx                   # AgentShield demo (3-step guided flow)
│   ├── aegis-demo.tsx             # Aegis SDK interactive demo
│   ├── aegis-v2.tsx               # Natural Language security UI
│   ├── aegis-live.tsx             # Wagmi + AegisBrainV2 live app
│   ├── abi.ts                     # Human-readable ABI (AgentShieldRegistry)
│   └── abi-aegis.ts               # Human-readable ABI (AegisBrainV2)
└── package.json

sdk/
├── src/
│   ├── aegis.ts                   # Aegis SDK — 3 lines to integrate AI pipelines
│   ├── aegis-react.ts             # React hooks for Aegis
│   ├── index.ts                   # AgentShield SDK
│   └── react.ts                   # React hooks for AgentShield
└── package.json

docs/                              # Architecture, security, demo scripts
```

---

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [pnpm](https://pnpm.io/installation) >= 9
- Node.js >= 20

### Install

```bash
pnpm install
```

### Build & Test

```bash
# Compile contracts
pnpm build

# Run all 171 tests
pnpm test

# Gas report
pnpm test:gas

# TypeScript type checking
pnpm typecheck
```

### Deploy to Somnia Testnet

```bash
# Copy and fill environment variables
cp .env.example .env

# Deploy AgentShieldRegistry
pnpm deploy:somnia

# Create a demo policy
pnpm create-demo-policy
```

### Frontend

```bash
pnpm dev
```

Opens a 3-step guided flow: **Define Policy → Scan Action → View Results**.

---

## Contracts

### AgentShieldRegistry

The core security contract. ~130 LOC.

| Function | Description |
|----------|-------------|
| `createPolicy(maxSpend)` | Create a security policy |
| `setAllowedTarget(policyId, target, allowed)` | Allowlist/blocklist addresses |
| `setAllowedSelector(policyId, selector, allowed)` | Allowlist/blocklist function selectors |
| `submitAction(policyId, action)` | Submit an action for risk analysis |
| `handleAgentResponse(requestId, responses, status, details)` | Callback from Somnia LLM |
| `getScan(scanId)` | Retrieve scan results |

**Security features:** Ownable2Step, Pausable, ReentrancyGuard, callback restricted to Somnia platform, fail-safe defaults to WARN.

### AegisBrain

Multi-agent pipeline engine. Chain N AI agents in sequence, run consensus across multiple LLMs, or use tool-use agents.

### AegisBrainV2

Zero-config security. Users describe their policy in natural language ("Protect me from DeFi scams"). The LLM interprets the policy and classifies every action.

### AegisCreate

NFT guardians with AI-generated personalities. Each guardian has a unique soul created by LLM, evolves through battles, and stores memories on-chain.

### AegisListen

On-chain event reactivity. Create listeners that trigger AI pipelines when blockchain events occur.

---

## SDK

```typescript
import { Aegis, LLM_AGENT_ID } from "@agentshield/sdk";

const aegis = new Aegis({ brain: "0x..." });

// Run an AI pipeline
const { thought } = await aegis.think("Analyze this transaction", [
  { agentId: LLM_AGENT_ID, payload: "0x", resultLabel: "analysis" }
]);

console.log(thought.decision);  // ALLOW | WARN | BLOCK
console.log(thought.riskScore); // 0-100
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, OpenZeppelin v5, Foundry |
| Blockchain | Somnia Testnet (chain 50312) |
| Frontend | React 18, Vite, Viem v2, Wagmi |
| SDK | TypeScript, Viem |
| Package Manager | pnpm 9 |
| CI | GitHub Actions (forge fmt + build + test + typecheck + frontend build) |

---

## Testing

**171 tests, 0 failures** across 7 test suites:

- `AgentShieldRegistry.t.sol` — 24 tests (policy CRUD, allowlists, scans, pause, events)
- `SecurityAudit.t.sol` — 29 tests (reentrancy, callback spoofing, double-finalize, overflow, front-running, DoS, LLM manipulation, policy attacks, access control)
- `EdgeCases.t.sol` — 20 tests (concurrency, gas limits, timestamps, large data, state transitions, ownership, zero address)
- `AegisBrain.t.sol` — 31 tests (pipeline, multi-think, tool-use, memory, callbacks)
- `AegisBrainV2.t.sol` — 25 tests (NL policies, analyze, deep analyze, stats, memory)
- `AegisCreate.t.sol` — 25 tests (mint, reveal, battle, evolve, tokenURI, withdraw)
- `AegisListen.t.sol` — 17 tests (listeners, triggers, anti-recursion, multi-event)

---

## Environment Variables

See `.env.example`:

| Variable | Description |
|----------|-------------|
| `PRIVATE_KEY` | Deployer private key |
| `SOMNIA_TESTNET_RPC` | Somnia testnet RPC URL |
| `SOMNIA_AGENTS_PLATFORM` | Somnia Agents Platform address |
| `SOMNIA_LLM_AGENT_ID` | LLM Inference agent ID |
| `AGENTSHIELD_REGISTRY` | Deployed registry address (for scripts) |
| `DEMO_TARGET` | Target address for demo policy |

---

## License

MIT