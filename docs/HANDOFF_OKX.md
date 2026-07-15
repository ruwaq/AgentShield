# Handoff: OKX.AI ASP Registration — Session 2

> **Session date:** July 15, 2026
> **Deadline:** July 17, 2026, 23:59 UTC
> **Status:** ASP registered ✅ | Endpoint deployed ✅ | Frontend live ✅ | Activation pending 🔴

---

## What's Done (This Session)

- ✅ **ASP #5936 registered** on OKX.AI (X Layer, tx: `0x8e72...3f48`)
- ✅ **Frontend unified** — single-page demo, no wallet required, 6 clickable scenarios
- ✅ **Frontend deployed** → https://agentshield-dusky.vercel.app
- ✅ **MCP Endpoint deployed** → https://endpoint-henna.vercel.app/api/analyze
- ✅ **Gemini 2.5 Flash** integrated for real LLM analysis
- ✅ **GitHub repo** → https://github.com/ruwaq/AgentShield
- ✅ **Agentic Wallet** logged in → `prometeodev7@gmail.com`
- ✅ **Wallet address:** `0x28ab0e111de89ac3e6ee435babb71a2723a2d4f5`
- ✅ **171 tests** still passing

---

## What's Pending

### 1. ASP Activation (blocked by A2A communication)
The ASP is registered but not visible on the marketplace. `onchainos agent activate` requires A2A communication setup.

**Required:** Run `claude auth login` in terminal, complete browser OAuth. Then:
```bash
okx-a2a doctor --fix
onchainos agent activate --agent-id 5936 --preferred-language en-US
```

### 2. Update ASP endpoint URL
The ASP has the old endpoint. Update to Gemini-powered one:
```bash
onchainos agent update --agent-id 5936 --service '[{"operation":"update","id":34414,"serviceName":"Security Firewall Analysis","serviceDescription":"Pre-execution security analysis for autonomous AI agents. Checks proposed on-chain actions against your policy using deterministic rules and LLM deep analysis.\n1. policyId (your security policy ID) 2. action.target (contract address) 3. action.value (amount in wei) 4. action.tokenSymbol (e.g., USDC, STT) 5. action.intent (plain language description)","serviceType":"A2MCP","fee":"0","endpoint":"https://endpoint-henna.vercel.app/api/analyze"}]'
```

### 3. HackQuest Submission
- Project: https://www.hackquest.io/es/projects/AgentShield-Pre-Execution-Security-Firewall-for-Autonomous-AI-Agents
- Connect MetaMask wallet
- Fill all fields (see `docs/HACKQUEST_FIELDS.md`)
- Upload 4 images (500x300 or 1280x720)

### 4. Record Demo Video (≤90s)
Use QuickTime or OBS. Show:
1. Open demo site → 6 scenarios visible
2. Click "Phishing airdrop" → BLOCK (instant)
3. Click "Safe vendor payment" → ALLOW
4. Click "Unverified DeFi" → WARN
5. Type custom intent → analyze
6. Show security log

### 5. Post on X
```
🛡️ AgentShield is live on @OKX_AI

Pre-execution security firewall for autonomous AI agents.
✅ Deterministic checks (instant, free)
🧠 Gemini 2.5 Flash deep analysis
🔒 ALLOW | WARN | BLOCK with risk score

171 tests. 0 failures. Production-ready.

Try it: agentshield-dusky.vercel.app
#OKXAI #AgentShield #AI #Web3 #Security
```

### 6. Submit Google Form
Before July 17, 23:59 UTC.

---

## Key URLs

| Resource | URL |
|----------|-----|
| Demo | https://agentshield-dusky.vercel.app |
| MCP Endpoint | https://endpoint-henna.vercel.app/api/analyze |
| GitHub | https://github.com/ruwaq/AgentShield |
| ASP ID | #5936 |
| Contract (Somnia) | 0xBb20e7AD47DdA5f8e51A2B1e89E9523c1c686253 |
| HackQuest | https://www.hackquest.io/es/projects/AgentShield-Pre-Execution-Security-Firewall-for-Autonomous-AI-Agents |

---

## Quick Commands

```bash
# Auth (required before any agent update/activate)
claude auth login
okx-a2a doctor --fix

# Activate ASP
onchainos agent activate --agent-id 5936 --preferred-language en-US

# Check ASP status
onchainos agent get-agents --agent-ids 5936
```

## Environment

```bash
# Wallet
Email: prometeodev7@gmail.com
XLayer Address: 0x28ab0e111de89ac3e6ee435babb71a2723a2d4f5

# Gemini API Key (set in Vercel env vars)
GEMINI_API_KEY=<your-gemini-api-key>
```