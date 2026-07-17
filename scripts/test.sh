#!/bin/bash
# AgentShield CLI Test Suite
# Prueba todos los flujos del contrato desde la terminal
# Uso: bash scripts/test.sh

# Load environment variables from .env if present
if [ -f .env ]; then
  source .env
elif [ -f ../.env ]; then
  source ../.env
fi

set -e

REGISTRY="${AGENTSHIELD_REGISTRY:-0xE5F2F5f1D2e635a802e0d649cA769190E7209e80}"
RPC="${SOMNIA_TESTNET_RPC:-https://api.infra.testnet.somnia.network/}"
KEY="${PRIVATE_KEY}"
RPC_FLAG="--rpc-url $RPC"
LEGACY="--legacy"

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${CYAN}→ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

# Event Hashes
SIG_POLICY_CREATED="0x601882301d3e3fce7fe3a99d4bb17ef5b6699b417bdd29f2bfb82e19fcbcb660"
SIG_SCAN_SUBMITTED="0xef6b813e9b26f9b17acad22f2661b6733fb62c3c1763e8f1026cc4b0bd33f5ce"

# ── Helpers ──
send() {
  local func="$1"
  shift
  cast send "$REGISTRY" "$func" "$@" --private-key "$KEY" $LEGACY $RPC_FLAG 2>&1
}

call() {
  local func="$1"
  shift
  cast call "$REGISTRY" "$func" "$@" $RPC_FLAG 2>&1
}

check_status() {
  echo "$1" | grep -q "status.*1 (success)" && echo "ok" || echo "fail"
}

get_indexed_arg() {
  local result="$1"
  local sig_hash="$2"
  local idx="$3"
  echo "$result" | python3 -c "
import sys, json
try:
    for line in sys.stdin.read().split('\n'):
        if line.strip().startswith('logs'):
            logs_str = line.split('logs', 1)[1].strip()
            logs = json.loads(logs_str)
            for log in logs:
                if log.get('topics') and log['topics'][0] == '$sig_hash':
                    val = log['topics'][$idx]
                    print(int(val, 16))
                    sys.exit(0)
except Exception as e:
    pass
print('?')
"
}

decode_scan() {
  # Decode getScan tuple output
  echo "$1" | python3 -c "
import sys
line = sys.stdin.read().strip().strip('()')
parts = [p.strip() for p in line.split(', ')]
if len(parts) >= 11:
  decisions = ['NONE','ALLOW','WARN','BLOCK']
  levels = ['UNKNOWN','LOW','MEDIUM','HIGH','CRITICAL']
  print(f'  decision={decisions[int(parts[4])]} risk={parts[5]} level={levels[int(parts[6])]} finalized={parts[10]} requestId={parts[8]}')
"
}

# ── Test Suite ──
echo ""
echo "══════════════════════════════════════════════"
echo "  AgentShield CLI Test Suite"
echo "  Contract: $REGISTRY"
echo "══════════════════════════════════════════════"
echo ""

# ─── Test 1: Create Policy ───
info "TEST 1: Creating policy (maxSpend = 50 STT)"
RESULT=$(send "createPolicy(uint256)" "50000000000000000000")
if [ "$(check_status "$RESULT")" = "ok" ]; then
  POLICY_ID=$(get_indexed_arg "$RESULT" "$SIG_POLICY_CREATED" 1)
  if [ "$POLICY_ID" = "?" ]; then
    fail "Failed to extract Policy ID from transaction logs"
    exit 1
  fi
  pass "Policy created with ID: $POLICY_ID"
else
  fail "Policy creation failed"
  echo "$RESULT" | tail -5
  exit 1
fi

# ─── Test 2: Allowlist target ───
info "TEST 2: Allowlisting target for policy $POLICY_ID"
TARGET="0x1111111111111111111111111111111111111111"
RESULT=$(send "setAllowedTarget(uint256,address,bool)" "$POLICY_ID" "$TARGET" "true")
[ "$(check_status "$RESULT")" = "ok" ] && pass "Target allowlisted" || fail "Target allowlist failed"

# ─── Test 3: Allowlist selector ───
info "TEST 3: Allowlisting selector (transfer) for policy $POLICY_ID"
SELECTOR="0xa9059cbb"
RESULT=$(send "setAllowedSelector(uint256,bytes4,bool)" "$POLICY_ID" "$SELECTOR" "true")
[ "$(check_status "$RESULT")" = "ok" ] && pass "Selector allowlisted" || fail "Selector allowlist failed"

# ─── Test 4: BLOCK — exceeds maxSpend ───
info "TEST 4: Submitting action that EXCEEDS maxSpend (100 STT > 50) → should BLOCK"
RESULT=$(send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
  "$POLICY_ID" "(0,$TARGET,0x00000000,100000000000000000000,STT,drain wallet,0x)")
if [ "$(check_status "$RESULT")" = "ok" ]; then
  SCAN_ID_4=$(get_indexed_arg "$RESULT" "$SIG_SCAN_SUBMITTED" 1)
  sleep 2
  SCAN=$(call "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "$SCAN_ID_4")
  DECISION=$(echo "$SCAN" | python3 -c "print(open('/dev/stdin').read().strip().strip('()').split(', ')[4])")
  [ "$DECISION" = "3" ] && pass "Action BLOCKED (risk 90, CRITICAL)" || fail "Expected BLOCK(3), got $DECISION"
  echo "$SCAN" | decode_scan
else
  fail "Transaction reverted"
fi

# ─── Test 5: BLOCK — approval to unknown spender ───
info "TEST 5: Submitting APPROVAL to unknown spender → should BLOCK"
RESULT=$(send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
  "$POLICY_ID" "(1,0x9999999999999999999999999999999999999999,0x095ea7b3,0,USDC,claim fake airdrop,0x)")
if [ "$(check_status "$RESULT")" = "ok" ]; then
  SCAN_ID_5=$(get_indexed_arg "$RESULT" "$SIG_SCAN_SUBMITTED" 1)
  sleep 2
  SCAN=$(call "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "$SCAN_ID_5")
  DECISION=$(echo "$SCAN" | python3 -c "print(open('/dev/stdin').read().strip().strip('()').split(', ')[4])")
  [ "$DECISION" = "3" ] && pass "Approval BLOCKED (risk 95, CRITICAL)" || fail "Expected BLOCK(3), got $DECISION"
  echo "$SCAN" | decode_scan
else
  fail "Transaction reverted"
fi

# ─── Test 6: PASS to LLM — safe action ───
info "TEST 6: Submitting SAFE action (10 STT, target allowlisted) → should go to LLM"
RESULT=$(send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
  "$POLICY_ID" "(0,$TARGET,0x00000000,10000000000000000000,STT,send safe payment to vendor,0x)" \
  --value 400000000000000000)
if [ "$(check_status "$RESULT")" = "ok" ]; then
  SCAN_ID_6=$(get_indexed_arg "$RESULT" "$SIG_SCAN_SUBMITTED" 1)
  sleep 2
  SCAN=$(call "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "$SCAN_ID_6")
  FINALIZED=$(echo "$SCAN" | python3 -c "print(open('/dev/stdin').read().strip().strip('()').split(', ')[10])")
  if [ "$FINALIZED" = "true" ]; then
    pass "LLM responded (scan finalized)"
    echo "$SCAN" | decode_scan
  else
    warn "Waiting for LLM callback... (scan not finalized yet)"
    echo "  Request ID: $(echo "$SCAN" | python3 -c "print(open('/dev/stdin').read().strip().strip('()').split(', ')[8])")"
    echo "  Check: https://agents.testnet.somnia.network"
  fi
else
  fail "Transaction reverted (check deposit amount)"
fi

# ─── Summary ───
echo ""
echo "══════════════════════════════════════════════"
echo "  Test Summary"
echo "══════════════════════════════════════════════"
echo ""
echo "  All scans created in this session:"
for id in "$SCAN_ID_4" "$SCAN_ID_5" "$SCAN_ID_6"; do
  if [ "$id" != "?" ] && [ -n "$id" ]; then
    SCAN=$(call "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "$id")
    printf "  Scan #$id: "
    echo "$SCAN" | decode_scan
  fi
done
echo ""
echo "  Explorer: https://shannon-explorer.somnia.network/address/$REGISTRY"
echo ""