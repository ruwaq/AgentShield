# Architecture

The MVP uses one contract, one frontend and no backend. `AgentShieldRegistry.sol` stores policies, performs deterministic checks, calls Somnia LLM Inference, handles callbacks and stores scan results.

## Flow

```
User/Agent → submitAction() → _localCheck() → deterministic BLOCK? → return
                ↓ (not blocked)
         SOMNIA_AGENTS.createRequest() → LLM inference → handleResponse()
                ↓
         _parseAgentResponse() → _finalize() → Scan stored on-chain
```

## Somnia Agents Integration (Critical)

### Platform Addresses

| Network | Chain ID | Address |
|---------|----------|---------|
| **Testnet** | `50312` | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| Mainnet | `5031` | `0x5E5205CF39E766118C01636bED000A54D93163E6` |

> ⚠️ `0x5E5205...` is MAINNET only. Using it on testnet causes silent failures.

### Agent IDs

| Agent | ID | Cost per agent |
|-------|-----|----------------|
| LLM Inference | `12847293847561029384` | 0.07 SOMI |
| LLM Parse Website | `12875401142070969085` | 0.10 SOMI |
| JSON API Request | TBD (placeholder `12345678901234567890`) | 0.03 SOMI |

### Callback Signature (THE CRITICAL PART)

The Somnia platform invokes `IAgentRequesterHandler.handleResponse`:

```solidity
function handleResponse(
    uint256 requestId,
    Response[] memory responses,   // struct[], NOT bytes[]
    ResponseStatus status,          // enum, NOT uint8
    Request memory details          // struct, NOT bytes
) external;
```

**If the signature doesn't match exactly, the callback silently never arrives.** This was the root cause of AgentShield v1 callbacks not working. The selector is computed from the full ABI-encoded signature including nested struct types.

### Deposit Formula

```
msg.value = getRequestDeposit() + (perAgentPrice × subcommitteeSize)

Example (LLM Inference, subcommittee=3):
  = 0.03 SOMI (reserve) + (0.07 × 3) = 0.24 SOMI
```

- `getRequestDeposit()` returns only the operations-reserve floor — NOT the total you should send
- Sending only the floor means `perAgentBudget = 0` → rational runners skip the request
- Unspent budget is refunded to the caller via `receive()`

### Subcommittee & Consensus

- Default subcommittee size: **3 validators**
- Each request produces **3 receipts** (one per validator)
- Determinism check: `new Set(receipts.map(r => r.response.result)).size === 1`
- Consensus types: `Majority` (default) or `Threshold`

### Receipts Endpoint

```
GET https://receipts.testnet.agents.somnia.host/agent-receipts
    ?contractAddress=<platform>&requestId=<id>
```

### Gas on Somnia

- Deploy: **31M+ gas** (35M safe; 5M/10M/15M fail)
- Contract calls: **5M+ gas**
- Storage: cached slots = 100 gas; uncached = 1,000,000 gas additional
- **Cancun opcodes (TSTORE/TLOAD/MCOPY) are NOT enabled** on testnet/mainnet
- OpenZeppelin v5 uses `mcopy` in `Bytes.sol` — compiles with `cancun` EVM version but verify bytecode doesn't contain MCOPY before deploying
- Precompiles have 10× to 330× multipliers vs Ethereum
- Logs cost significantly more (e.g., LOG0 with 32 bytes: 8,320 vs 631 on Ethereum)

### LLM Agent ABI (inferString)

```solidity
function inferString(
    string prompt,
    string system,
    bool chainOfThought,
    string[] allowedValues
) returns (string response)
```

Selector: `keccak256("inferString(string,string,bool,string[])")`

## Contract Design

### Deterministic First
`_localCheck()` blocks before spending gas on LLM inference. This catches:
- Exceeds max spend → BLOCK (risk 90)
- Approval to unknown spender → BLOCK (risk 95)
- Unknown target → WARN (risk 65)
- Unknown selector → WARN (risk 60)

### LLM Output Restricted
Only `ALLOW|WARN|BLOCK` accepted via `keccak256` comparison. Unexpected output defaults to `WARN` (fail-safe).

### Security
- `Ownable2Step` for safe ownership transfer
- `Pausable` for emergency stop
- `ReentrancyGuard` on `submitAction`
- Callback restricted to `somniaAgents` platform only (`msg.sender` check)
- Risk scores always capped at 100 via `_finalize` check
- Reason text never stored on-chain — only `keccak256` hash