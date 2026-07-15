# HackQuest Form Fields — Copy & Paste

> Project: https://www.hackquest.io/es/projects/AgentShield-Pre-Execution-Security-Firewall-for-Autonomous-AI-Agents

## Basic Info

| Field | Value |
|-------|-------|
| **Name** | AgentShield: Pre-Execution Security Firewall for Autonomous AI Agents |
| **Introduction** | Firewall pre-ejecución para agentes de IA. Audita transacciones en tiempo real usando políticas on-chain (Somnia/X Layer) y análisis de LLMs antes de firmar. Verdicts: ALLOW, WARN, BLOCK. |

## Sectors (select 4)
- ✅ AI
- ✅ Infra
- ✅ DeFi
- ✅ SocialFi

## Technical Tags (select 8)
- ✅ React
- ✅ Next
- ✅ Web3
- ✅ Ethers
- ✅ Solidity
- ✅ Node
- ✅ Go
- ✅ Rust

## Links

| Field | Value |
|-------|-------|
| **MVP Link** | https://agentshield-dusky.vercel.app |
| **Project Link** | https://github.com/ruwaq/AgentShield |
| **X/Twitter** | (your X handle) |

## Wallet
Connect MetaMask wallet. Any X Layer compatible wallet works.

## Deployment Details

| Field | Value |
|-------|-------|
| **Ecosystem** | Somnia |
| **Testnet/Mainnet** | Testnet |
| **Contract Address** | 0xBb20e7AD47DdA5f8e51A2B1e89E9523c1c686253 |
| **Deployed Link** | https://agentshield-dusky.vercel.app |

## Full Description

```
AgentShield is a pre-execution security firewall for autonomous AI agents built for the OKX AI Genesis Hackathon.

🔐 THE PROBLEM
AI agents are increasingly executing on-chain transactions autonomously. Without a security layer, they can approve unlimited token spending, fall for phishing scams, or drain wallets. AgentShield sits between the agent and the blockchain, analyzing every action before it executes.

⚙️ HOW IT WORKS
1. User defines a security policy in plain language (e.g. "Block scams, max 50 STT per tx")
2. AI agent proposes an on-chain action
3. AgentShield runs deterministic checks (instant, free) — catches obvious attacks
4. If not blocked, Gemini 2.5 Flash performs deep LLM analysis
5. Returns verdict: ALLOW, WARN, or BLOCK with risk score (0-100)

🏗️ ARCHITECTURE
- Smart contracts on Somnia Testnet (7 contracts, 171 tests, 0 failures)
- MCP endpoint powered by Gemini 2.5 Flash for real-time AI analysis
- Registered as ASP #5936 on OKX.AI marketplace
- Frontend demo: agentshield-dusky.vercel.app

🛡️ SECURITY
- Deterministic-first: hard blocks cost zero gas, no LLM needed
- Fail-safe: unexpected AI output defaults to WARN, never ALLOW
- On-chain verifiability: all scans stored permanently
- 171 tests, production-ready, not a prototype

🏆 WHY AGENTSHIELD WINS
- Complete product: contracts + endpoint + demo, all functional
- Real security value: protects agents from the #1 attack vectors
- Dual-chain: Somnia for LLM inference, OKX.AI for distribution
- Best Product + Software Utility + Finance Copilot categories
```

## Images (4 required, 500x300 or 1280x720)
Take screenshots from https://agentshield-dusky.vercel.app:
1. Hero page with 6 demo scenarios
2. A BLOCK result (click "Phishing airdrop scam")
3. An ALLOW result (click "Safe vendor payment")
4. The security log with multiple entries