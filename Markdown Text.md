# AgentShield — Pre-execution Risk Guard for Autonomous Agents on Somnia

## 1. Resumen ejecutivo
AgentShield es una capa de seguridad previa a la ejecución para agentes autónomos. Antes de que un agente ejecute una acción on-chain —por ejemplo transferir fondos, aprobar un token, interactuar con un contrato o exceder una política de gasto— AgentShield analiza la acción, calcula un riesgo y devuelve una decisión estructurada: ALLOW, WARN o BLOCK.

## 2. Problema
La nueva economía de agentes necesita wallets y acciones autónomas. Pero un agente con capacidad de firmar o ejecutar transacciones puede equivocarse, ser manipulado por datos externos, exceder límites de gasto o interactuar con contratos peligrosos. Las herramientas actuales de seguridad Web3 están muy enfocadas en humanos antes de firmar; AgentShield se enfoca en humanos y, sobre todo, en agentes autónomos.

## 3. Solución
AgentShield permite definir una política de seguridad para un agente y analizar cada acción propuesta antes de ejecutarla. El sistema combina reglas determinísticas, inferencia LLM de Somnia Agents y registro on-chain del resultado.

## 4. MVP
El MVP debe incluir:
- Crear una política de agente: gasto máximo, contratos permitidos, funciones permitidas.
- Enviar una acción propuesta: transfer, approve, contract call.
- Invocar un Somnia Agent para clasificar riesgo.
- Guardar en contrato: scanId, actionHash, decision, riskScore, reasonHash, requestId.
- Mostrar resultado y receipt en frontend.

## 5. Decisiones posibles
- ALLOW: acción dentro de política y bajo riesgo.
- WARN: posible riesgo, requiere revisión humana.
- BLOCK: viola política o tiene riesgo crítico.

## 6. Demo recomendada
Demo 1: acción segura.
- Policy: max spend 50 STT, target allowlisted.
- Action: send 10 STT to approved contract.
- Result: ALLOW, risk 15.

Demo 2: approval peligroso.
- Intent: claim airdrop.
- Action: approve unlimited USDC to unknown contract.
- Result: BLOCK, risk 95.

Demo 3: agente excede política.
- Policy: max spend 20 STT.
- Action: send 100 STT.
- Result: BLOCK, risk 90.

## 7. Arquitectura
Frontend:
- Policy Builder
- Action Simulator Form
- Risk Result Panel
- Receipt Viewer

Smart Contract:
- AgentShieldRegistry.sol
- createPolicy()
- submitAction()
- requestRiskAnalysis()
- handleAgentResponse()
- getScan()

Somnia Agent:
- LLM classification: ALLOW/WARN/BLOCK
- LLM numeric scoring: 0-100
- Optional text summary hashed on-chain

## 8. Prompt base del agente
System:
You are AgentShield, a pre-execution risk classifier for autonomous blockchain agents. You must classify proposed on-chain actions according to the user's security policy and common Web3 risk patterns. Return a structured decision only.

User prompt:
Policy:
{policy}

Proposed Action:
{action}

User/Agent Intent:
{intent}

Risk rules:
- Unlimited approvals to unknown spenders are high risk.
- Actions exceeding max spend are blocked.
- Unknown contracts are at least warning unless explicitly justified.
- If user intent and transaction effect mismatch, block.
- If within policy and low impact, allow.

Return:
Decision: ALLOW/WARN/BLOCK
RiskScore: 0-100
RiskLevel: LOW/MEDIUM/HIGH/CRITICAL
Reason: short explanation
SafeAlternative: short recommendation

## 9. Smart contract data model
Policy:
- owner
- maxSpend
- allowedTargets mapping
- allowedSelectors mapping
- active

Scan:
- scanId
- policyId
- requester
- actionHash
- decision
- riskScore
- reasonHash
- requestId
- timestamp

## 10. Roadmap de 7 días
Día 1: configurar repo, leer docs Somnia Agents, preparar README.
Día 2: contrato AgentShieldRegistry.
Día 3: integración con Somnia LLM Inference para ALLOW/WARN/BLOCK.
Día 4: frontend con Policy Builder y Action Form.
Día 5: callbacks, requestId, receipts.
Día 6: casos de demo y pulido visual.
Día 7: video, README final, deploy y submission.

## 11. Por qué puede ganar
- Es agent-first: protege agentes antes de actuar.
- Tiene autonomía: el agente clasifica riesgo sin humano en el loop.
- Es composable: otras dApps pueden consultar risk scores.
- Tiene utilidad real: wallets, agent wallets, DeFi bots, payment agents.
- Usa Somnia de forma nativa: LLM inference, callbacks, receipts y on-chain records.

## 12. Limitaciones del MVP
- No hace simulación completa tipo Tenderly.
- No reemplaza auditoría de contratos.
- No garantiza seguridad absoluta.
- Clasifica riesgos a partir de política, heurísticas e IA.

## 13. Extensiones futuras
- Integración con APIs de seguridad externas.
- Simulación de balance changes.
- Registry público de acciones revisadas.
- Session keys y smart accounts.
- Agent reputation basada en historial de acciones seguras.
- Plugins para wallets y dApps.



