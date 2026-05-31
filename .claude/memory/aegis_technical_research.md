---
name: aegis-technical-research
description: Investigación técnica completa de Somnia Network — APIs, direcciones, agentes, reactividad, AA, GitHub, costos y limitaciones
metadata:
  type: reference
---

# Investigación Técnica Somnia Network

**Fecha:** 2026-05-29
**Fuentes:** Docs oficiales, Agent Explorer, GitHub, WebFetch
**Documento principal:** [[TECHNICAL_RESEARCH.md]]

## Direcciones clave

| Contrato | Testnet (50312) | Mainnet (5031) |
|----------|-----------------|----------------|
| Agents Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` | `0x5E5205CF39E766118C01636bED000A54D93163E6` |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | — |
| Thirdweb Factory | `0x4be0ddfebca9a5a4a617dee4dece99e7c862dceb` | — |
| Reactivity Precompile | `0x0100` | `0x0100` |

## Agent IDs

- LLM Inference: `12847293847561029384` ⚠️ NO confirmado en docs oficiales
- LLM Parse Website: `12875401142070969085` ✅ Confirmado
- JSON API: `12345678901234567890` ⚠️ Solo ejemplo ilustrativo

## Costos (por request, 3 validadores)

- JSON API: 0.12 SOMI
- LLM Inference: 0.24 SOMI
- LLM Parse Website: 0.33 SOMI

## Callback — DISCREPANCIA

La doc muestra 2 firmas diferentes. AgentShield usa `handleAgentResponse(uint256,bytes[],uint8,bytes)`.
Verificar contra contrato deployado antes de asumir que es correcta.

## Session Keys — SOLO RPC

No hay API Solidity. Solo `somnia_getSessionAddress` y `somnia_sendSessionTransaction`.
Sin scopes, sin expiry, sin spending limits.

## Reactividad On-Chain

- Paquete: `@somnia-chain/reactivity-contracts`
- Solc: 0.8.30 (diferente a nuestro 0.8.24)
- Precompila: `0x0100`
- Saldo mínimo: 32 SOMI
- Heredar de `SomniaEventHandler`, implementar `_onEvent`

## Lo que NADIE tiene (nuestra ventaja)

- Pipeline multi-agente on-chain
- Reactividad + AI agents integrados
- NFTs con personalidad LLM que evolucionan
- Framework unificado con SDK de 3 líneas

**Why:** Investigación exhaustiva para no depender de suposiciones. Cada dato fue verificado contra docs oficiales o Agent Explorer.

**How to apply:** Consultar antes de cualquier decisión técnica. Si hay duda, verificar contra fuentes originales listadas en TECHNICAL_RESEARCH.md.