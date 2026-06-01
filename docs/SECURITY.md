# Security Notes

## Included Protections

- **Deterministic hard blocks:** Actions exceeding max spend or approving unknown spenders are blocked before any LLM call
- **Restricted LLM output:** Only `ALLOW|WARN|BLOCK` accepted via `keccak256` comparison
- **Fail-safe default:** Unexpected LLM output defaults to `WARN` (never ALLOW)
- **`Ownable2Step`:** Safe two-step ownership transfer (prevents accidental transfer to wrong address)
- **`Pausable`:** Emergency stop for all new submissions
- **`ReentrancyGuard`:** On `submitAction` to prevent re-entrancy via malicious callbacks
- **Callback restricted:** `handleResponse` only callable by Somnia Agents Platform (`msg.sender` check)
- **Reason hashes:** Reason text never stored on-chain — only `keccak256` hash (saves gas, preserves privacy)
- **Risk score cap:** Always ≤ 100 via `_finalize` check

## Not Included (MVP Scope)

- Full transaction simulation (would require forking)
- External risk APIs (e.g., Chainalysis, GoPlus)
- Smart account / 4337 integration
- Reputation system
- Multi-sig policy management
- Policy deactivation (policies are always active once created; only global `pause()` available)

## Callback Security

The `handleResponse` function is the most security-critical endpoint:

1. **Only the Somnia Agents Platform can call it** — enforced by `msg.sender == address(SOMNIA_AGENTS)`
2. **Signature must match exactly** — the platform computes `keccak256("handleResponse(uint256,(address,bytes,uint8,uint256,uint256,uint256)[],uint8,(uint256,address,address,bytes4,address[],(address,bytes,uint8,uint256,uint256,uint256)[],uint256,uint256,uint256,uint256,uint256,uint8,uint8,uint256,uint256))")` to find the callback
3. **Already-finalized scans cannot be overwritten** — `AlreadyFinalized` revert
4. **Unknown requestIds revert** — `requestToScan[requestId] == 0` check
5. **Malformed LLM responses revert** — `abi.decode(responses[0].result, (string))` will revert on invalid ABI, leaving scan unfinalized (safe state)

## Known Limitations

1. `DEFAULT_LLM_AGENT_ID` hardcoded in contract bytecode — if Somnia changes the agent ID, redeploy needed
2. No `msg.value` minimum validation for LLM inference cost — sending too little means the request times out
3. `handleResponse` with `scanId==0` reverts with `InvalidPolicy()` — misleading error name (should be `InvalidRequest`)
4. No withdraw function for ETH — funds sent to the contract can only be used for LLM inference payments
5. Anyone can submit actions against any policy (no ownership check on `submitAction`) — by design, but worth noting