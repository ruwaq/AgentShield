---
name: foundry-migration
description: Migración de Hardhat a Foundry completada el 2026-05-28 — 24 tests, forge scripts, MCP server configurado
metadata:
  type: project
---

## Migración Hardhat → Foundry (2026-05-28)

### Por qué
- Foundry es el estándar de la industria en 2026 para desarrollo Solidity
- `foundry-mcp-server` es el único MCP que compila/testea/deployea desde Claude Code
- No existe MCP de Hardhat
- Tests en Solidity nativo son más rápidos y legibles que TypeScript/ethers.js

### Lo que se migró

| Componente | Antes (Hardhat) | Ahora (Foundry) |
|------------|----------------|-----------------|
| Compilación | `npx hardhat compile` | `forge build` |
| Tests | TypeScript/ethers.js + chai (mock roto) | Solidity/forge-std (24 tests, 0 fail) |
| Deploy | `scripts/deploy.ts` (ethers.js) | `script/Deploy.s.sol` (forge script) |
| Preflight | `scripts/preflight.ts` | `cast block-number --rpc-url somnia_testnet` |
| Gas report | No tenía | `forge test --gas-report` |
| Claude Code MCP | No tenía | `@pranesh.asp/foundry-mcp-server` en `~/.config/claude/mcp.json` |

### Gas report (resumen)
- Deployment: 2,114,334 gas (~9580 bytes)
- `createPolicy`: 23,650 gas
- `submitAction` (BLOCK determinístico): 284,987 gas
- `submitAction` (pass-through a LLM): 395,000 gas
- `setAllowedTarget`: 24,393 gas
- `handleAgentResponse`: 23,385 gas

### Archivos creados
- `foundry.toml` — config (solc 0.8.24, via_ir, optimizer 200 runs, rpc somnia_testnet)
- `test/AgentShieldRegistry.t.sol` — 24 tests en Solidity
- `script/Deploy.s.sol` — DeployScript + CreateDemoPolicyScript
- `lib/forge-std/` — dependencia git submodule

### Archivos Hardhat (conservados)
- `hardhat.config.ts`, `tsconfig.json`, `scripts/` — se mantienen para compatibilidad
- `package.json` — scripts actualizados para usar forge, mantiene deps Hardhat

### MCP config
`~/.config/claude/mcp.json`:
```json
"foundry": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@pranesh.asp/foundry-mcp-server"],
  "env": { "RPC_URL": "...", "PRIVATE_KEY": "..." }
}
```

### Lo que NO se migró
- Los tests de integración con callback LLM siguen requiriendo testnet real
- El frontend (React/Viem) no cambió — sigue igual
- Hardhat se mantiene instalado por si se necesita para verify/plugins