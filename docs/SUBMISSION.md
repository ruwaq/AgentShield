# OKX AI Genesis Hackathon — Submission Summary

> **ASP Name:** AgentShield
> **Category:** Software Utility / Finance Copilot
> **Type:** Agent-to-MCP (A2MCP)
> **Deadline:** July 17, 2026, 23:59 UTC

---

## What AgentShield Does

AgentShield is a **pre-execution security firewall** for autonomous AI agents. Before an agent executes an on-chain action, AgentShield analyzes it against a user-defined security policy and returns a verdict: `ALLOW`, `WARN`, or `BLOCK` with a risk score (0-100).

### Flow:
```
Agent → "Should I approve this 100 USDC transfer?"
              ↓
     AgentShield ASP (MCP)
              ↓
     ┌────────────────────────┐
     │ 1. Deterministic check  │ ← Instant, free
     │ 2. LLM deep analysis    │ ← Somnia Agents Platform
     │ 3. Verdict + risk score │
     └────────────────────────┘
              ↓
     { verdict: "BLOCK", riskScore: 95, reason: "Unlimited approval to unknown contract" }
```

---

## Technical Highlights

- **Dual-chain architecture:** Smart contracts on Somnia Testnet (LLM inference), ASP listing on OKX.AI (distribution)
- **171 tests, 0 failures** — production-ready, not a hackathon prototype
- **Deterministic-first:** Hard policy violations blocked instantly (zero gas for LLM)
- **Fail-safe by design:** Unexpected LLM output → `WARN` (never `ALLOW`). No prompt injection can bypass.
- **On-chain verifiability:** All scans stored permanently. Complete audit trail.
- **7 Solidity contracts** (~1,500 LOC total) + React frontend + MCP endpoint

---

## Why AgentShield Wins

| Category | Why We Win |
|----------|------------|
| **Best Product** | Complete, tested, production-ready. 171 tests. Real security value. |
| **Software Utility** | Directly protects AI agents from scams, phishing, and policy violations. |
| **Finance Copilot** | Critical for DeFi agents — prevents rug pulls, unlimited approvals, and overspending. |
| **Creative Genius** | First on-chain security firewall for autonomous agents. NFT guardians with AI souls. |

---

## Links

- **ASP on OKX.AI:** (after listing)
- **Smart Contracts (Somnia Testnet):** `0xBb20e7AD47DdA5f8e51A2B1e89E9523c1c686253`
- **Somnia Agents Explorer:** https://agents.testnet.somnia.network
- **GitHub:** (repo URL)
- **Demo Video:** (after recording)

---

## Key Learnings (Somnia Integration)

The critical discovery during development was the **callback signature mismatch**. The Somnia Agents Platform invokes `IAgentRequesterHandler.handleResponse(uint256, Response[], ResponseStatus, Request)` — using the wrong signature (e.g., `bytes[]` instead of `Response[]` structs) causes callbacks to silently never arrive. This was confirmed by the Somnia team and affected multiple hackathon projects.

### Correct Integration Pattern

```solidity
// The contract MUST implement this exact interface:
interface IAgentRequesterHandler {
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,   // struct, not bytes
        ResponseStatus status,          // enum, not uint8
        Request memory details          // struct, not bytes
    ) external;
}
```

### Platform Addresses
- Testnet: `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`
- Mainnet: `0x5E5205CF39E766118C01636bED000A54D93163E6`

### Agent IDs
- LLM Inference: `12847293847561029384` (0.07 SOMI/agent)
- LLM Parse Website: `12875401142070969085` (0.10 SOMI/agent)