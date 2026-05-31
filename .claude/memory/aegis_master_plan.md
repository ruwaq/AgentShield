---
name: aegis-master-plan
description: Plan maestro AEGIS refinado post-investigación — framework multi-agente + DeFi Guardian demo para Somnia Agentathon
metadata:
  type: project
---

# AEGIS Master Plan (Refinado)

**Fecha:** 2026-05-29
**Estado:** Investigación completa, listo para implementar
**Documentos:** [[AEGIS_MASTER_PLAN.md]] [[TECHNICAL_RESEARCH.md]]

## Estrategia Ganadora

**AEGIS Framework** (plataforma) + **Autonomous DeFi Guardian** (producto demo).

AEGIS es el framework on-chain que permite pipelines de IA multi-agente en Somnia. El DeFi Guardian es la demo: un dragón AI que protege wallets 24/7 usando reactividad on-chain.

## Por qué gana

- Usa 4+ features nativas de Somnia juntas (LLM Agents + Reactivity + AA + Streams + NFTs)
- Llena el gap #1: no existe orquestador multi-agente on-chain en Somnia
- Plataforma, no producto — cualquier dev construye sobre AEGIS
- Demo impactante: dragón AI salvando wallet de un rug pull en tiempo real
- DX first: 3 líneas de SDK vs 200 de boilerplate
- Imposible en otra chain: solo Somnia tiene inferencia determinista on-chain + reactividad

## Roadmap (6 días)

1. **Día 1:** AegisBrain.sol — Pipeline multi-agente + memoria + consensus + tool-use
2. **Día 2:** AegisCreate.sol — NFTs con alma de IA + evolución
3. **Día 3:** AegisListen.sol — Reactividad on-chain → AI triggers
4. **Día 4:** @aegis/sdk — SDK TypeScript + React hooks
5. **Día 5:** Frontend — Demo completa del DeFi Guardian
6. **Día 6:** Pulido final — Tests integración, video demo, deploy, submission

## Hallazgos críticos de investigación

1. **Session keys son SOLO RPC** — AegisExecute NO será contrato independiente. El SDK maneja ejecución.
2. **Callback signature NO confirmada** — La doc muestra 2 versiones. Verificar contra contrato deployado.
3. **DEFAULT_LLM_AGENT_ID no documentado** — Verificar en Agent Explorer.
4. **Solc 0.8.30 para reactividad** — Diferente a nuestro 0.8.24. Solo AegisListen usa 0.8.30.
5. **32 SOMI mínimo** para suscripciones de reactividad on-chain.

**Why:** Después de investigar a fondo la API de Somnia Agents, Account Abstraction, Reactividad, Streams y GitHub, refinamos el plan maestro con datos concretos para maximizar chances en la Agentathon.

**How to apply:** Cargar este memory + TECHNICAL_RESEARCH.md al iniciar cualquier sesión de desarrollo de AEGIS. Empezar siempre por AegisBrain.sol.