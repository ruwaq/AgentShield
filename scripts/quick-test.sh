#!/bin/bash
# AgentShield Quick Test — prueba una acción específica desde CLI
# Uso: bash scripts/quick-test.sh <test-name>
# Tests disponibles:
#   create-policy  - Crear una policy
#   allowlist       - Allowlistear target y selector
#   safe-transfer  - Transfer seguro (debería ir a LLM)
#   exceed-spend   - Exceder maxSpend (BLOCK)
#   unknown-approve - Approval a unknown spender (BLOCK)
#   scan <id>      - Leer un scan
#   policy <id>    - Leer una policy
#   balance        - Ver balance del contrato

# Load environment variables from .env if present
if [ -f .env ]; then
  source .env
elif [ -f ../.env ]; then
  source ../.env
fi

set -e
R="${AGENTSHIELD_REGISTRY:-0xE5F2F5f1D2e635a802e0d649cA769190E7209e80}"
RP="${SOMNIA_TESTNET_RPC:-https://api.infra.testnet.somnia.network/}"
K="${PRIVATE_KEY}"
T="0x1111111111111111111111111111111111111111"
S="0xa9059cbb"

send() { cast send "$R" "$1" "$2" --private-key "$K" --legacy --rpc-url "$RP" 2>&1 | grep -E "status|transactionHash"; }
view() { cast call "$R" "$1" "$2" --rpc-url "$RP" 2>&1; }

CMD="${1:-help}"
case "$CMD" in
  create-policy)
    echo "Creating policy (50 STT max)..."
    send "createPolicy(uint256)" "50000000000000000000"
    ;;
  allowlist)
    echo "Allowlisting target=$T selector=$S..."
    send "setAllowedTarget(uint256,address,bool)" "1 $T true"
    send "setAllowedSelector(uint256,bytes4,bool)" "1 $S true"
    ;;
  safe-transfer)
    echo "Safe transfer (10 STT → LLM)..."
    send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
      "1 (0,$T,0x00000000,10000000000000000000,STT,safe payment,0x)" \
      --value 350000000000000000
    ;;
  exceed-spend)
    echo "BLOCK: 100 STT > 50 max..."
    send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
      "1 (0,$T,0x00000000,100000000000000000000,STT,drain,0x)"
    ;;
  unknown-approve)
    echo "BLOCK: approval to unknown spender..."
    send "submitAction(uint256,(uint8,address,bytes4,uint256,string,string,bytes))" \
      "1 (1,0x9999999999999999999999999999999999999999,0x095ea7b3,0,USDC,fake airdrop,0x)"
    ;;
  scan)
    ID="${2:-1}"
    echo "Scan #$ID:"
    view "getScan(uint256)((uint256,uint256,address,bytes32,uint8,uint256,uint8,bytes32,uint256,uint256,bool))" "$ID"
    ;;
  policy)
    ID="${2:-1}"
    echo "Policy #$ID:"
    view "policies(uint256)((address,uint256,bool))" "$ID"
    ;;
  balance)
    echo "Contract balance:"
    cast balance "$R" --rpc-url "$RP"
    ;;
  *)
    echo "Usage: bash scripts/quick-test.sh <test-name>"
    echo ""
    echo "Tests: create-policy | allowlist | safe-transfer | exceed-spend | unknown-approve"
    echo "Query: scan <id> | policy <id> | balance"
    ;;
esac