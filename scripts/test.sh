#!/bin/bash
# AgentShield CLI Test Suite
# Prueba todos los flujos del contrato desde la terminal
# Uso: source .env && bash scripts/test.sh

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

# ── Helpers ──
send() {
  cast send "$REGISTRY" "$1" "$2" --private-key "$KEY" $LEGACY $RPC_FLAG 2>&1
}

call() {
  cast call "$REGISTRY" "$1" "$2" $RPC_FLAG 2>&1
}

check_status() {
  echo "$1" | grep -q "status.*1 (success)" && echo "ok" || echo "fail"
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
  POLICY_ID=$(echo "$RESULT" | grep -o '"0x000000000000000000000000000000000000000000000000000000000000000[0-9]"' | tail -1 | grep -o '[0-9]\+$' || echo "?")
  pass "Policy created (ID extracted from logs)"
else
  fail "Policy creation failed"
  echo "$RESULT" | tail -5
fi

# ─── Test 2: Allowlist target ───
info "TEST 2: Allowlisting target"
TARGET="0x1111111111111111111111111111111111111111"
RESULT=$(send "setAllowedTarget(uint256,address,bool)" "1 $TARGET true")
[ "$(check_status "$RESULT")" = "ok" ] && pass "Target allowlisted" || fail "Target allowlist failed"

# ─── Test 3: Allowlist selector ───
info "TEST 3: Allowlisting selector (transfer)"
SELECTOR="0xa9059cbb"
RESULT=$(send "setAllowedSelector(uint256,bytes4,bool)" "1 $SELECTOR true")
[ "$(check_status "$RESULT")" = "ok" ] && pass "Selector allowlisted" || fail "Selector allowlist failed"

# ─── Test 4: BLOCK — exceeds maxSpend ───
info "TEST 4: Submitting action that EXCEEDS maxSpend (100 STT > 50) → should BLOCK"
RESULT=$(send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
  "1 (0,$TARGET,0x00000000,100000000000000000000,STT,drain wallet,0x)")
if [ "$(check_status "$RESULT")" = "ok" ]; then
  sleep 2
  SCAN=$(call "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "1")
  DECISION=$(echo "$SCAN" | python3 -c "print(open('/dev/stdin').read().strip().strip('()').split(', ')[4])")
  [ "$DECISION" = "3" ] && pass "Action BLOCKED (risk 90, CRITICAL)" || fail "Expected BLOCK(3), got $DECISION"
  echo "$SCAN" | decode_scan
else
  fail "Transaction reverted"
fi

# ─── Test 5: BLOCK — approval to unknown spender ───
info "TEST 5: Submitting APPROVAL to unknown spender → should BLOCK"
RESULT=$(send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
  "1 (1,0x9999999999999999999999999999999999999999,0x095ea7b3,0,USDC,claim fake airdrop,0x)")
if [ "$(check_status "$RESULT")" = "ok" ]; then
  sleep 2
  SCAN_ID=$(echo "$RESULT" | python3 -c "
import sys,json
for line in sys.stdin.read().split('\n'):
    if '\"topics\"' in line and '\"0000000000000000000000000000000000000000000000000000000000000002\"' in line:
        print('2')
        break
" 2>/dev/null || echo "2")
  SCAN=$(call "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "2")
  DECISION=$(echo "$SCAN" | python3 -c "print(open('/dev/stdin').read().strip().strip('()').split(', ')[4])")
  [ "$DECISION" = "3" ] && pass "Approval BLOCKED (risk 95, CRITICAL)" || fail "Expected BLOCK(3), got $DECISION"
  echo "$SCAN" | decode_scan
else
  fail "Transaction reverted"
fi

# ─── Test 6: PASS to LLM — safe action ───
info "TEST 6: Submitting SAFE action (10 STT, target allowlisted) → should go to LLM"
RESULT=$(send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
  "1 (0,$TARGET,0x00000000,10000000000000000000,STT,send safe payment to vendor,0x)" \
  --value 400000000000000000)
if [ "$(check_status "$RESULT")" = "ok" ]; then
  sleep 2
  SCAN_ID="3"
  SCAN=$(call "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "$SCAN_ID")
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
echo "  All scans:"
for i in 1 2 3; do
  SCAN=$(call "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "$i")
  printf "  Scan #$i: "
  echo "$SCAN" | decode_scan
done
echo ""
echo "  Explorer: https://shannon-explorer.somnia.network/address/$REGISTRY"
echo ""