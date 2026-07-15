# OKX AI Genesis Hackathon — AgentShield ASP Strategy

> **Deadline: July 17, 2026, 23:59 UTC**
> **Prize pool: $100,000 USD**
> **Objective: List AgentShield as an ASP on OKX.AI**

---

## What OKX Actually Wants

After researching the hackathon requirements, here's what matters:

| Requirement | Details |
|-------------|---------|
| **Build an ASP** | An Agent Service Provider that solves a real-world use case |
| **List on OKX.AI** | Must pass internal review and go live on the marketplace |
| **Post on X** | With #OKXAI, including a demo ≤ 90 seconds |
| **Submit Google Form** | Before July 17, 23:59 UTC |
| **Blockchain** | NOT specified — any chain works. Focus is on the ASP, not the chain |
| **Crypto or non-crypto** | Both welcome |

### What judges evaluate:
- **Best Product:** "strongest product experience, service completeness, and user value"
- **Creative Genius:** "best creativity"
- **Revenue Rocket:** revenue, orders, and positive reviews during the campaign
- **Category awards:** Finance Copilot, Software Utility, Lifestyle Companion, Artistic Excellence
- **Social Buzz:** social traction and community reach

**AgentShield fits:** Software Utility + Finance Copilot + Best Product

---

## AgentShield as an ASP

### Service Type: Agent-to-MCP (A2MCP)

AgentShield is a **security firewall** that other AI agents call before executing on-chain actions.

```
Other Agent → "Should I approve this 100 USDC transfer?"
                    ↓
           AgentShield ASP (MCP Endpoint)
                    ↓
           ┌─────────────────────────┐
           │ 1. Deterministic checks  │ ← On-chain (Somnia)
           │ 2. LLM deep analysis     │ ← Somnia Agents Platform
           │ 3. Verdict + risk score  │
           └─────────────────────────┘
                    ↓
           { verdict: "BLOCK", riskScore: 95, reason: "Unlimited approval to unknown contract" }
```

### MCP Endpoint Specification

```
POST /analyze
Content-Type: application/json

{
  "policyId": 1,
  "action": {
    "actionType": "TRANSFER",
    "target": "0x...",
    "selector": "0xa9059cbb",
    "value": "100000000000000000000",
    "tokenSymbol": "USDC",
    "intent": "Send 100 USDC to buy NFT"
  }
}

Response:
{
  "scanId": 42,
  "verdict": "ALLOW",
  "riskScore": 20,
  "riskLevel": "LOW",
  "reason": "Action is within deterministic policy checks.",
  "actionHash": "0x..."
}
```

---

## Step-by-Step: Register AgentShield as ASP on OKX.AI

### Step 1: Install Onchain OS

```bash
npx skills add okx/onchainos-skills --yes -g
```

This installs the OKX Onchain OS skills package globally. Open a new terminal session after installation.

### Step 2: Log in to Agentic Wallet

Send this prompt to your AI agent (Claude Code, Codex, etc.):

```
Log in to Agentic Wallet on Onchain OS with my email
```

The Agentic Wallet runs in a Trusted Execution Environment (TEE). Your private key is never exposed.

### Step 3: Register as A2MCP ASP

Send this prompt:

```
Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS

ASP Details:
- Name: AgentShield
- Description: |
  Pre-execution security firewall for autonomous AI agents. 
  Before your agent executes an on-chain action, AgentShield 
  analyzes it against your security policy and returns 
  ALLOW, WARN, or BLOCK with a risk score (0-100).
  
  Inputs needed from user:
  1. policyId (your security policy ID)
  2. action (target address, value, token, intent description)
- Category: Software Utility / Finance
- Pricing: Free (MVP) or pay-per-call via x402
```

### Step 4: List ASP on OKX.AI

```
Help me list my ASP on OKX.AI using Onchain OS
```

Review takes ~24 hours. Even before approval, the ASP is usable via its Agent ID.

### Step 5: Record Demo (90 seconds max)

Demo script (see `docs/DEMO_SCRIPT.md` for full version):

1. **Create Policy** (5s): User creates a security policy with max spend 50 STT
2. **Submit Safe Action** (25s): Agent submits a 10 STT transfer → ALLOW
3. **Submit Malicious Action** (15s): Agent submits approval to unknown spender → BLOCK (deterministic)
4. **Submit Suspicious Action** (25s): Agent submits to unknown target → LLM analyzes → WARN
5. **Show Scan History** (20s): All scans stored on-chain, verifiable

### Step 6: Post on X

Template:

```
🛡️ AgentShield is now live on @OKX_AI

Pre-execution security firewall for autonomous AI agents.

Before your agent acts on-chain, AgentShield checks:
✅ Deterministic policy checks (free, instant)
🧠 LLM deep analysis (via Somnia Agents)
🔒 Verdict: ALLOW | WARN | BLOCK

171 tests. 0 failures. Production-ready.

#OKXAI #AgentShield #AI #Web3 #Security
```

Attach: 90-second demo video or screen recording.

### Step 7: Submit Google Form

Fill out the HackQuest form with:
- ASP name: AgentShield
- ASP ID: (from OKX.AI after listing)
- Category: Software Utility
- X post link: (from Step 6)
- Demo link: (video URL)

---

## Architecture Decisions

### Why Somnia for contracts + OKX.AI for ASP?

| Decision | Rationale |
|----------|-----------|
| **Contracts on Somnia** | Battle-tested (171 tests), native LLM inference via Somnia Agents Platform, STT testnet tokens are free |
| **ASP on OKX.AI** | This is what the hackathon evaluates — the ASP listing, not the blockchain |
| **X Layer for identity only** | ASP registration requires ERC-8004 identity on X Layer. Minimal gas cost (OKX sponsors identity fees) |
| **MCP endpoint off-chain** | Bridges OKX.AI agents to Somnia contracts. Handles RPC calls, prompt building, and response formatting |

### Why A2MCP over A2A?

- **A2MCP is simpler:** No negotiation, no escrow, no arbitration. Instant pay-per-call or free.
- **Fits the use case:** Security checks are API calls — send a transaction, get a verdict. No negotiation needed.
- **Faster listing:** A2MCP services have fewer review requirements than A2A.

---

## Competitive Advantages

1. **Battle-tested:** 171 tests, 0 failures. Not a hackathon prototype — it's production-ready.
2. **Deterministic-first architecture:** Hard blocks cost zero gas. LLM only called when needed.
3. **Fail-safe defaults:** Unexpected LLM output → WARN (never ALLOW). No prompt injection can bypass.
4. **Dual-chain:** Somnia for LLM inference, OKX.AI for distribution. Best of both worlds.
5. **On-chain verifiability:** All scans stored permanently. Anyone can audit the security history.

---

## Timeline

| Date | Task |
|------|------|
| July 15 | ✅ Contracts fixed (callback signature, security, gas optimization) |
| July 15 | ✅ 171 tests passing |
| July 15 | Install Onchain OS + Agentic Wallet |
| July 16 | Register ASP on OKX.AI |
| July 16 | Create MCP endpoint |
| July 16 | Record demo video |
| July 16 | Post on X with #OKXAI |
| July 17 | Submit Google Form (before 23:59 UTC) |
| July 17+ | Wait for OKX.AI review (≤ 24 hours) |