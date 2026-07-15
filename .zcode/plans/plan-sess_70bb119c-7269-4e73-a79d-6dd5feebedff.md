# Plan: Actualizar documentación para OKX.AI ASP + Handoff

## Cambios concretos

### 1. Actualizar `AGENTS.md`
- Agregar OKX.AI como plataforma target
- Actualizar tech stack: Solidity, Foundry, React, Viem, Somnia + OKX.AI
- Agregar comandos nuevos: `preflight:xlayer`, `deploy:xlayer`
- Documentar la estrategia dual-chain: contratos en Somnia, ASP en OKX.AI

### 2. Crear `docs/OKX_ASP_STRATEGY.md`
- Documento completo con la estrategia para el hackathon
- Investigación de lo que OKX realmente busca
- Pasos concretos para registrar el ASP en OKX.AI
- Arquitectura del endpoint MCP
- Checklist previo al deadline (Julio 17)

### 3. Crear `docs/HANDOFF_OKX.md`
- Estado actual del proyecto (qué está hecho)
- Próximos pasos en orden lógico para la siguiente sesión
- Comandos exactos a ejecutar
- Recursos necesarios (Onchain OS, Agentic Wallet, API keys)

### 4. Actualizar `.env.example`
- Agregar variables para X Layer
- Documentar el propósito dual (Somnia + X Layer)

## Orden lógico para la siguiente sesión (Handoff)

1. Instalar Onchain OS CLI
2. Conectar Agentic Wallet
3. Registrar AgentShield como ASP A2MCP en OKX.AI
4. Crear endpoint MCP
5. Grabar demo de 90s
6. Publicar en X con #OKXAI
7. Llenar formulario de HackQuest antes del 17 Julio 23:59 UTC