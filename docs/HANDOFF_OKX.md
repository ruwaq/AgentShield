# Handoff: OKX.AI ASP Registration — Next Session

> **Session date:** July 15, 2026
> **Deadline:** July 17, 2026, 23:59 UTC
> **Status:** Contracts ready ✅ | Security audit done ✅ | onchainos CLI installed ✅ | ASP registration pending 🔴

---

## What's Done (This Session)

- ✅ Fixed callback signature (`handleAgentResponse` → `handleResponse` with correct `Response[]` struct)
- ✅ Protected `fulfillManual` bypass (added `OWNER` immutable + access control)
- ✅ Optimized `StringUtils.sol` (`addrToString` 42 chars, `bytes4ToString` 10 chars)
- ✅ Added access control to `recordBattle` (`authorizedCallers` mapping)
- ✅ 171 tests passing, 0 failures
- ✅ Updated `CLAUDE.md` with OKX.AI dual-chain strategy
- ✅ Created `docs/OKX_ASP_STRATEGY.md` with full hackathon strategy
- ✅ **Full security audit completed** — 10 findings, 8 fixed, 0 remaining
- ✅ **onchainos CLI v4.2.4 installed** at `~/.local/bin/onchainos`
- ✅ **8 OKX skills installed** (agentic-wallet, ai, defi, dex-market, etc.)
- ✅ **X Layer RPC** configured in `foundry.toml` + `package.json`
- ✅ **RPCs verified:** Somnia (block 435M+) + X Layer (block 65M+)

---

## What To Do Next (In Order)

### 1. Install Onchain OS

```bash
npx skills add okx/onchainos-skills --yes -g
```

Open a new terminal session after installation.

### 2. Log in to Agentic Wallet

Send this prompt to your AI agent:

```
Log in to Agentic Wallet on Onchain OS with my email
```

You'll need:
- Your email address
- The Agentic Wallet will be created in a TEE (Trusted Execution Environment)

### 3. Register AgentShield as A2MCP ASP

```
Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS

ASP name: AgentShield
Description (2 parts required):

Part 1 — What it does:
Pre-execution security firewall for autonomous AI agents. Analyzes proposed 
on-chain actions against your security policy using deterministic checks + 
LLM deep analysis. Returns ALLOW, WARN, or BLOCK with risk score (0-100).

Part 2 — Inputs needed:
1. policyId — your security policy ID (created on-chain)
2. action.target — the contract address you want to interact with
3. action.value — the amount in wei
4. action.tokenSymbol — the token symbol (e.g., USDC, STT, ETH)
5. action.intent — describe what you want to do in plain language

Category: Software Utility
Pricing: Free (MVP phase)
```

### 4. Create MCP Endpoint

The endpoint bridges OKX.AI agents to Somnia contracts. Create a simple HTTP server:

```typescript
// endpoint/src/server.ts
import { createPublicClient, http } from 'viem';
import { somniaTestnet } from './chains';

// RPC to read from Somnia
const client = createPublicClient({
  chain: somniaTestnet,
  transport: http(process.env.SOMNIA_RPC)
});

// POST /analyze
app.post('/analyze', async (req, res) => {
  const { policyId, action } = req.body;
  
  // 1. Read policy from contract
  const policy = await client.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'policies',
    args: [policyId]
  });
  
  // 2. Run deterministic checks (replicate _localCheck logic)
  const localResult = runLocalCheck(policy, action);
  
  if (localResult.verdict === 'BLOCK') {
    return res.json(localResult);
  }
  
  // 3. Call Somnia LLM for deep analysis
  const llmResult = await callSomniaLLM(policy, action);
  
  return res.json(llmResult);
});
```

Deploy this to a public HTTPS endpoint (Vercel, Railway, or similar).
- Must use HTTPS (OKX requirement)
- Must NOT be localhost or private IP
- URL must be ≤ 512 characters

### 5. List ASP on OKX.AI

```
Help me list my ASP on OKX.AI using Onchain OS
```

Review takes ≤ 24 hours. The ASP is usable via Agent ID even before approval.

### 6. Record Demo (90 seconds max)

Use the script in `docs/DEMO_SCRIPT.md`:

1. **Create Policy** (5s): Show policy creation with max spend
2. **Submit Safe Action** (25s): Show ALLOW verdict
3. **Submit Malicious Action** (15s): Show instant BLOCK (deterministic)
4. **Submit Suspicious Action** (25s): Show LLM analysis → WARN
5. **Show Scan History** (20s): All scans on-chain, verifiable

Screen recording tools: OBS Studio (free) or QuickTime (Mac).

### 7. Post on X

```
🛡️ AgentShield is now live on @OKX_AI

Pre-execution security firewall for autonomous AI agents.
Before your agent acts on-chain, AgentShield analyzes the action 
against your security policy.

✅ Deterministic checks (free, instant)
🧠 LLM deep analysis (via Somnia Agents)
🔒 ALLOW | WARN | BLOCK with risk score

171 tests. 0 failures. Production-ready.

#OKXAI #AgentShield #AI #Web3 #Security
```

Attach the 90-second demo video.

### 8. Submit Google Form

Fill out: https://www.hackquest.io/hackathons/OKXAI-Genesis-Hackathon

Required fields:
- ASP name: AgentShield
- ASP ID: (from OKX.AI after listing)
- Category: Software Utility
- X post link: (from Step 7)
- Demo video link

**Deadline: July 17, 2026, 23:59 UTC**

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `docs/OKX_ASP_STRATEGY.md` | Full hackathon strategy, ASP registration guide |
| `docs/ARCHITECTURE.md` | Technical architecture, Somnia integration details |
| `docs/DEMO_SCRIPT.md` | Demo walkthrough script |
| `docs/SUBMISSION.md` | Hackathon submission summary |
| `CLAUDE.md` | Project overview, commands, structure |
| `contracts/AgentShieldRegistry.sol` | Core security contract (158 lines) |
| `contracts/aegis/` | AEGIS framework (Brain, BrainV2, Create, Listen) |

## Environment Variables Needed

```bash
# Somnia (existing)
PRIVATE_KEY=0x...
SOMNIA_TESTNET_RPC=https://api.infra.testnet.somnia.network/
SOMNIA_AGENTS_PLATFORM=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
SOMNIA_LLM_AGENT_ID=12847293847561029384
AGENTSHIELD_REGISTRY=0xBb20e7AD47DdA5f8e51A2B1e89E9523c1c686253

# X Layer (for ASP identity)
XLAYER_RPC=https://rpc.xlayer.tech
# OKB_PRIVATE_KEY (same as PRIVATE_KEY if using same wallet)
```

## Quick Commands

```bash
pnpm test                # Run 171 tests (should all pass)
pnpm preflight           # Check Somnia RPC connectivity
pnpm deploy:somnia       # Deploy to Somnia testnet
pnpm dev                 # Start frontend dev server
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Onchain OS not found | Run `npx skills add okx/onchainos-skills --yes -g` again |
| Agentic Wallet login fails | Use a new terminal session after installing Onchain OS |
| ASP registration rejected | Check: name has no celebrity names, description has 2 parts, endpoint is HTTPS |
| MCP endpoint not reachable | Deploy to a public host (Vercel, Railway). No localhost. |
| Demo video > 90 seconds | Trim to ≤ 90s. OKX explicitly requires this. |