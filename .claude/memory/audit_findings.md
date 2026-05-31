---
name: agentshield-mvp-audit
description: 14 hallazgos encontrados en revisión profunda — 1 crítico, 4 medium, 9 low/nit
metadata:
  type: project
---

14 hallazgos en AgentShield v1.0.0 MVP:

- **CRITICAL**: `DEFAULT_LLM_AGENT_ID` (12847293847561029384) hardcoded en contrato línea 17 y duplicado en deploy.ts línea 5. Si Somnia cambia el Agent ID, contrato inutilizable.
- **MEDIUM**: `handleAgentResponse` línea 87 revierte con `InvalidPolicy()` cuando `scanId==0` — error engañoso, debería ser `InvalidRequestId` o similar
- **MEDIUM**: `submitAction` línea 63 no valida mínimo de `msg.value` para cubrir costo de inferencia LLM
- **MEDIUM**: `requestToScan[requestId]=scanId` línea 80 sin verificar colisión (improbable pero teóricamente posible)
- **MEDIUM**: Eventos `ScanSubmitted`/`RiskRequested` en `extractIds` línea 18 no cubren `ScanFinalized` si se emitiera en misma tx
- **LOW**: Check de política activa línea 65 solo verifica `owner==address(0)`, no cubre políticas huérfanas por transferOwnership
- **LOW**: `_uint()` manual línea 125 en lugar de `Strings.toString` de OZ (micro-optimización válida)
- **LOW**: Sin `<!DOCTYPE html>`, `<html>`, `<head>`, ni meta tags en `frontend/index.html`
- **LOW**: `viaIR:true` en `hardhat.config.ts` línea 7 innecesario para contrato de 130 líneas
- **NIT**: Campo `data` en `ProposedAction` no usado realmente (solo hasheado, no en checks ni prompt)
- **NIT**: Frontend monolítico en `main.tsx` (24 líneas pero un solo componente)
- **NIT**: Sin tests automatizados (aceptable para MVP hackathon)
- **NIT**: Polling no maneja errores de red (si RPC cae, sigue corriendo en silencio)
- **NIT**: Docs (ARCHITECTURE, SECURITY, DEMO_SCRIPT, SUBMISSION) son 1-2 líneas cada uno

**Context:** Revisión del 2026-05-28. MVP funcional para Somnia Agentathon. Arquitectura sólida. Los issues son tradeoffs conscientes de MVP, no bugs de seguridad.