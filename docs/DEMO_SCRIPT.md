# Demo Script

## Prerequisites

- MetaMask or Rabby wallet with Somnia Testnet (Chain ID `50312`) configured
- STT testnet tokens (request via Discord or faucet)
- At least **0.5 STT** (0.24 for LLM deposit + gas)

## Steps

### 1. Create Policy
Create a security policy with max spend `50 STT`.
- Calls `createPolicy(50 ether)`
- Returns `policyId = 1`

### 2. Allowlist Target
Allow the agent to interact with a trusted address.
- Calls `setAllowedTarget(1, <target>, true)`
- Calls `setAllowedSelector(1, 0xa9059cbb, true)` (ERC20 transfer selector)

### 3. Submit Safe Transfer (Should ALLOW)
Submit a `10 STT` transfer to the allowlisted target.
- Calls `submitAction(1, {actionType: TRANSFER, target: <allowed>, value: 10 ether, ...})` with `msg.value = 0.35 STT`
- Local check passes → LLM inference requested
- Wait ~30-60 seconds for callback
- Expected: `ALLOW` with low risk score

### 4. Submit Approval to Unknown Spender (Should BLOCK)
Submit an approval to an address NOT in the allowlist.
- Calls `submitAction(1, {actionType: APPROVE, target: <unknown>, ...})`
- Local check catches this → **immediate BLOCK** (no LLM call needed)
- Expected: `BLOCK` with risk score 95

### 5. Submit Spend Above Policy (Should BLOCK)
Submit a transfer exceeding the `50 STT` max spend.
- Calls `submitAction(1, {actionType: TRANSFER, value: 100 ether, ...})`
- Local check catches this → **immediate BLOCK** (no LLM call needed)
- Expected: `BLOCK` with risk score 90

### 6. Verify on Explorer
- Check scan results via `getScan(scanId)`
- Verify LLM request on [Somnia Agents Explorer](https://agents.testnet.somnia.network)
- Check receipts: `GET https://receipts.testnet.agents.somnia.host/agent-receipts?contractAddress=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776&requestId=<id>`

## Expected Results

| Action | Decision | Risk | LLM Called? |
|--------|----------|------|-------------|
| Safe transfer (10 STT, allowed target) | ALLOW | ~20 | Yes |
| Approval to unknown spender | BLOCK | 95 | No (deterministic) |
| Transfer exceeding max spend (100 STT) | BLOCK | 90 | No (deterministic) |
| Transfer to unknown target | WARN | ~60 | Yes |

## Troubleshooting

- **Callback never arrives:** Verify the contract implements `IAgentRequesterHandler.handleResponse` with the EXACT signature. The selector must match what the platform computes.
- **Transaction fails with no revert reason:** Check you're using the correct platform address for your network (testnet ≠ mainnet).
- **Request times out:** You may have sent insufficient deposit. Use `getRequestDeposit() + (perAgentPrice × 3)`.
- **Out of gas:** Somnia requires 31M+ for deploys, 5M+ for contract calls.