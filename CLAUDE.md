# CLAUDE.md — AgentShield

@~/.claude/atlas-persona.md

<tech_stack>
- Stack: Solidity, Foundry, React, Viem, Somnia Blockchain, OKX.AI
</tech_stack>

---

## Project

AgentShield is a pre-execution risk guard for autonomous AI agents. Core contracts deployed on **Somnia Testnet** (battle-tested, 171 tests). Registered as an **ASP (Agent Service Provider) on OKX.AI** for the OKX AI Genesis Hackathon.

**Dual-chain strategy:**
- **Somnia Testnet** → Smart contracts (AgentShieldRegistry + AEGIS stack). LLM inference via Somnia Agents Platform.
- **OKX.AI / X Layer** → ASP registration + MCP endpoint. Identity on X Layer (ERC-8004), service listed on OKX.AI marketplace.

**Stack:** Solidity 0.8.24, OpenZeppelin v5, Foundry (forge/cast/anvil), React 18 + Vite + Viem v2, pnpm

## Essential commands

```bash
pnpm build               # forge build
pnpm test                # forge test -v (171 tests)
pnpm test:gas            # forge test --gas-report
pnpm compile             # forge build (alias)
pnpm typecheck           # tsc --noEmit (root + frontend)
pnpm preflight           # cast block-number --rpc-url somnia_testnet
pnpm preflight:xlayer    # cast block-number --rpc-url xlayer
pnpm deploy:somnia       # Deploy to Somnia testnet via forge script
pnpm create-demo-policy  # Create demo policy + allowlist a target
pnpm dev                 # Start Vite dev server (frontend)
pnpm clean               # forge clean + rm artifacts
```

### Foundry-native commands

```bash
forge build                          # Compile contracts
forge test -vvv                      # Run tests with stack traces
forge test --match-test test_create  # Run specific test
forge test --gas-report              # Gas usage report
forge script script/Deploy.s.sol:DeployScript --rpc-url somnia_testnet --broadcast -vvvv
cast balance <address> --rpc-url somnia_testnet
cast call <contract> "getScan(uint256)(tuple)" <scanId> --rpc-url somnia_testnet
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  OKX.AI Marketplace (ASP)                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  AgentShield ASP (A2MCP)                          │  │
│  │  Input:  { tx, policy }                           │  │
│  │  Output: { verdict: ALLOW|WARN|BLOCK, risk: 85 }  │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  MCP Endpoint (off-chain)                         │  │
│  │  - Reads policy from Somnia contracts             │  │
│  │  - Runs deterministic checks                      │  │
│  │  - Calls Somnia LLM for deep analysis             │  │
│  │  - Returns verdict to caller                      │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Somnia Testnet (Smart Contracts)                 │  │
│  │  AgentShieldRegistry + AEGIS Stack                │  │
│  │  171 tests ✅ | 0 failures                        │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Somnia Flow (on-chain):
User/Agent → submitAction() → _localCheck() → deterministic BLOCK? → return
                ↓ (not blocked)
         somniaAgents.createRequest() → LLM inference → handleResponse()
                ↓
         _parseAgentResponse() → _finalize() → Scan stored on-chain
```

## Project structure

```
contracts/
├── AgentShieldRegistry.sol        # Main contract (policy CRUD, submitAction, LLM callback)
├── aegis/
│   ├── AegisBrain.sol             # Multi-agent pipeline engine
│   ├── AegisBrainV2.sol           # Natural Language security engine
│   ├── AegisCreate.sol            # NFT guardians with AI souls
│   └── AegisListen.sol            # On-chain event reactivity
├── interfaces/
│   └── ISomniaAgents.sol          # Somnia Agents Platform interface
└── libraries/
    └── StringUtils.sol            # Gas-optimized string conversions
script/
├── Deploy.s.sol                   # DeployScript + CreateDemoPolicyScript
└── DeployAegis.s.sol              # AEGIS stack deployment
test/
├── AgentShieldRegistry.t.sol      # 24 tests
├── AegisBrain.t.sol               # 31 tests
├── AegisBrainV2.t.sol             # 25 tests
├── AegisCreate.t.sol              # 25 tests
├── AegisListen.t.sol              # 17 tests
├── EdgeCases.t.sol                # 20 tests
└── SecurityAudit.t.sol            # 29 tests
frontend/
├── src/
│   ├── main.tsx                   # AgentShield demo UI
│   ├── aegis-live.tsx             # AEGIS live demo
│   ├── abi.ts                     # Human-readable ABI
│   └── styles.css                 # Dark theme styles
├── index.html
└── package.json
foundry.toml                       # Foundry config (solc 0.8.24, via_ir, optimizer)
docs/
├── OKX_ASP_STRATEGY.md            # Hackathon strategy & ASP registration guide
├── HANDOFF_OKX.md                 # Next-session handoff (step-by-step)
├── ARCHITECTURE.md                # Technical architecture
├── SECURITY.md                    # Security notes
├── SECURITY_AUDIT.md              # Full security audit
├── DEMO_SCRIPT.md                 # Demo walkthrough
├── SUBMISSION.md                  # Hackathon submission summary
├── TECHNICAL_RESEARCH.md          # Deep technical research
└── AEGIS_MASTER_PLAN.md           # AEGIS framework master plan
```

## Key design decisions

- **Deterministic first:** `_localCheck()` blocks before spending gas on LLM inference
- **LLM output restricted:** Only `ALLOW|WARN|BLOCK` accepted via `keccak256` comparison
- **Fail-safe:** Unexpected LLM output defaults to `WARN` (never ALLOW)
- **Foundry-native tests:** 171 Solidity tests using forge-std, no TypeScript mock needed
- **No backend:** Frontend talks directly to RPC via Viem
- **Human-readable ABI:** `abi.ts` avoids codegen dependency in frontend
- **Dual-chain:** Smart contracts on Somnia (battle-tested), ASP listing on OKX.AI

## Recent fixes (July 2026)

1. ✅ **Callback signature fixed** — `handleAgentResponse(bytes[])` → `handleResponse(Response[])`. Was using wrong struct type, causing callbacks to silently fail.
2. ✅ **fulfillManual bypass protected** — Added `OWNER` immutable + `onlyOwner` check to prevent unauthorized ALLOW forcing.
3. ✅ **StringUtils optimized** — `addrToString` now 42 chars (was 66), `bytes4ToString` now 10 chars (was 66). Saves gas, cleaner LLM prompts.
4. ✅ **recordBattle access control** — Added `authorizedCallers` mapping + `setAuthorizedCaller()`. Prevents unlimited NFT leveling.
5. ✅ **171 tests passing** — All 7 test suites green after refactoring.
6. ✅ **Post-audit security hardening (8 fixes)** — 2026-07-15:
   - **M1:** AegisBrain `multiRequestIds[]` tracking + stale pipeline guard in `handleResponse`
   - **M2:** AegisListen `authorizedTriggers` whitelist + `_canTrigger()` access control on `handleEvent`
   - **L3:** `submitAction` validates `msg.value >= getRequestDeposit()` with `InsufficientDeposit` error
   - **L4:** `_bytesToHex` limit raised 64→256 bytes
   - **L5:** `getListenersByOwner` capped at 50 + `getListenersByOwnerPaginated(offset, limit)`
   - **L6:** `foundry.toml` +xlayer RPC endpoint
   - **L7:** `package.json` +preflight:xlayer script
   - **I8:** Removed unused `agentIndex` param from `_executeMultiThinkAgent`
   - **All 171 tests green.** 0 audit findings remaining.

## Security notes

- `Ownable2Step` for safe ownership transfer
- `Pausable` for emergency stop
- `ReentrancyGuard` on `submitAction`
- Callback restricted to `somniaAgents` platform only
- `fulfillManual` restricted to `OWNER` (AegisBrainV2)
- `recordBattle` restricted to `contractOwner` + authorized callers (AegisCreate)
- Risk scores always capped at 100 via `_finalize` check
- Reason text never stored on-chain — only `keccak256` hash

## Next session: OKX.AI ASP Registration

See `docs/HANDOFF_OKX.md` for step-by-step instructions. Priority order:
1. Install Onchain OS CLI
2. Connect Agentic Wallet
3. Register AgentShield as A2MCP ASP on OKX.AI
4. Create MCP endpoint
5. Record 90s demo
6. Post on X with #OKXAI
7. Submit Google Form before July 17, 23:59 UTC