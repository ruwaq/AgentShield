# @agentshield/sdk

Pre-execution risk guard for autonomous agents on Somnia.

```bash
npm install @agentshield/sdk
```

## Quick Start

```typescript
import { AgentShield } from "@agentshield/sdk";

const shield = new AgentShield({
  registry: "0xE5F2F5f1D2e635a802e0d649cA769190E7209e80"
});

// Check if an action is safe — 3 lines
const result = await shield.safeCheck({
  policyId: 1n,
  actionType: "TRANSFER",
  target: "0x1111111111111111111111111111111111111111",
  selector: "0x00000000",
  value: "10",
  tokenSymbol: "STT",
  intent: "pay monthly subscription"
});

if (result.allowed) {
  // Execute the transaction
} else {
  // Handle BLOCK or WARN
  console.log(`${result.decision}: risk ${result.riskScore}/100`);
}
```

## React Hooks

```tsx
import { useAgentShield, useScans, useSafeCheck } from "@agentshield/sdk/react";

function App() {
  const { shield, account, connect } = useAgentShield({
    registry: "0xE5F2F5f1D2e635a802e0d649cA769190E7209e80"
  });

  const { scans, loading } = useScans(shield);
  const { check, loading: checking } = useSafeCheck(shield);

  if (!account) return <button onClick={connect}>Connect</button>;

  return (
    <div>
      {/* Live scan dashboard */}
      {scans.map(s => (
        <ScanCard key={s.scanId} scan={s} />
      ))}

      {/* One-click safety check */}
      <button onClick={() => check({ actionType: "TRANSFER", target: "...", ... })}>
        Check Safety
      </button>
    </div>
  );
}
```

## Setup a Policy (one-click)

```typescript
const { policyId } = await shield.setupPolicy({
  maxSpendStt: "50",
  targets: ["0x1111111111111111111111111111111111111111"],
  selectors: ["0xa9059cbb", "0x095ea7b3"]
});
```

## API

### `new AgentShield(config)`
| Option | Type | Default |
|--------|------|---------|
| `registry` | `Address` | **required** |
| `rpcUrl` | `string` | Somnia testnet |
| `chain` | `Chain` | Somnia testnet (50312) |
| `defaultDeposit` | `string` | `"0.35"` |

### Read Methods
- `getScan(scanId)` → `Scan`
- `getScanHuman(scanId)` → `ScanHuman`
- `getLatestScans(count?)` → `Scan[]`
- `getPolicy(policyId)` → `Policy`
- `waitForScanCompletion(scanId, timeoutMs?)` → `Scan`

### Write Methods
- `createPolicy(maxSpendStt)` → `{ hash, policyId }`
- `setupPolicy({ maxSpendStt, targets?, selectors? })` → `{ hash, policyId }`
- `scan(input)` → `Scan` (submits action, waits for LLM response)
- `safeCheck(input)` → `{ decision, riskScore, riskLevel, allowed, reason }`

### React Hooks
- `useAgentShield(config)` — connect wallet + create shield instance
- `useScans(shield, pollMs?)` — live scan polling
- `useScan(shield, scanId)` — watch single scan until finalized
- `useSafeCheck(shield)` — one-shot safety check with loading state