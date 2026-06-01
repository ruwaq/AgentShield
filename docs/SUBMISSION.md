# Submission Summary

AgentShield is a pre-execution risk guard for autonomous agents on Somnia. Before an autonomous agent acts on-chain, AgentShield checks the action against a policy and uses a Somnia LLM Agent to return `ALLOW`, `WARN`, or `BLOCK`.

## What It Does

1. **Policy Creation:** Users define security policies (max spend, allowed targets, allowed selectors)
2. **Action Submission:** Agents submit proposed actions before execution
3. **Deterministic Check:** Hard blocks for policy violations (no LLM cost)
4. **LLM Inference:** Actions within policy are analyzed by Somnia's LLM agent
5. **Verdict:** `ALLOW` (safe), `WARN` (caution), or `BLOCK` (dangerous)

## Technical Highlights

- **Single contract** (~140 LOC Solidity) + React frontend (~330 LOC) — no backend
- **Foundry-native tests:** 171 tests, all passing
- **Somnia-native:** Uses Somnia Agents Platform for trustless LLM inference with 3-validator consensus
- **Fail-safe by design:** Unexpected LLM output defaults to `WARN`, never `ALLOW`
- **Gas-efficient:** Deterministic blocks skip LLM inference entirely

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

### Deposit Formula
`msg.value = getRequestDeposit() + (perAgentPrice × subcommitteeSize)`

## Links

- Contract (testnet): `0xBb20e7AD47DdA5f8e51A2B1e89E9523c1c686253`
- Somnia Agents: https://agents.testnet.somnia.network
- Docs: https://docs.somnia.network
- Receipts API: https://receipts.testnet.agents.somnia.host/agent-receipts