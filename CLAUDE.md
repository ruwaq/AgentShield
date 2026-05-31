# CLAUDE.md — AgentShield

@~/.claude/atlas-persona.md

<tech_stack>
- Stack: Solidity, Foundry, React, Viem, Somnia Blockchain
</tech_stack>

---

## Project

AgentShield is a pre-execution risk guard MVP for autonomous agents on Somnia blockchain. One Solidity contract (~130 LOC) + React/Viem frontend (~25 LOC) + Foundry scripts. No backend.

**Stack:** Solidity 0.8.24, OpenZeppelin v5, Foundry (forge/cast/anvil), React 18 + Vite + Viem v2, pnpm

## Essential commands

```bash
pnpm build               # forge build
pnpm test                # forge test -v (24 tests)
pnpm test:gas            # forge test --gas-report
pnpm compile             # forge build (alias)
pnpm typecheck           # tsc --noEmit (root + frontend)
pnpm preflight           # cast block-number --rpc-url somnia_testnet
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

### Foundry MCP Server
The project uses `@pranesh.asp/foundry-mcp-server` for Claude Code integration:
- `forge build`, `forge test`, `forge script`, `cast` operations directly from Claude Code
- Configured in `~/.config/claude/mcp.json`
- Requires `RPC_URL` and `PRIVATE_KEY` env vars (uses `.env`)

## Architecture

```
User/Agent → submitAction() → _localCheck() → deterministic BLOCK? → return
                ↓ (not blocked)
         somniaAgents.createRequest() → LLM inference → handleAgentResponse()
                ↓
         _parseAgentResponse() → _finalize() → Scan stored on-chain
```

## Project structure

```
contracts/
├── AgentShieldRegistry.sol        # Main contract (policy CRUD, submitAction, LLM callback)
└── interfaces/
    └── ISomniaAgents.sol          # Somnia Agents Platform interface
script/
└── Deploy.s.sol                   # DeployScript + CreateDemoPolicyScript (Foundry)
test/
└── AgentShieldRegistry.t.sol      # 24 forge tests (Solidity-native)
frontend/
├── src/
│   ├── main.tsx                   # Single-component React app
│   ├── abi.ts                     # Human-readable ABI
│   └── styles.css                 # Dark theme styles
├── index.html
└── package.json
foundry.toml                       # Foundry config (solc 0.8.24, via_ir, optimizer)
docs/                              # ARCHITECTURE, SECURITY, DEMO_SCRIPT, SUBMISSION
```

## Key design decisions

- **Deterministic first:** `_localCheck()` blocks before spending gas on LLM inference
- **LLM output restricted:** Only `ALLOW|WARN|BLOCK` accepted via `keccak256` comparison
- **Fail-safe:** Unexpected LLM output defaults to `WARN` (never ALLOW)
- **Foundry-native tests:** 24 Solidity tests using forge-std, no TypeScript mock needed
- **No backend:** Frontend talks directly to RPC via Viem
- **Human-readable ABI:** `abi.ts` avoids codegen dependency in frontend

## Known issues (MVP tradeoffs)

1. `DEFAULT_LLM_AGENT_ID` hardcoded in contract bytecode — if Somnia changes the agent ID, redeploy needed
2. No `msg.value` minimum validation for LLM inference cost
3. `handleAgentResponse` reverts with `InvalidPolicy()` when `scanId==0` — misleading error name
4. `index.html` missing doctype/meta tags — Vite tolerates it
5. LLM callback tests require real Somnia testnet (DummyPlatform doesn't call back)

## Security notes

- `Ownable2Step` for safe ownership transfer
- `Pausable` for emergency stop
- `ReentrancyGuard` on `submitAction`
- Callback restricted to `somniaAgents` platform only
- Risk scores always capped at 100 via `_finalize` check
- Reason text never stored on-chain — only `keccak256` hash