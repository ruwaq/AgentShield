# 🔐 Auditoría de Seguridad — AEGIS Framework

> **Fecha:** 2026-05-29 | **Alcance:** AegisBrain.sol, AegisCreate.sol, AegisListen.sol
> **Tests:** 146/146 pasan | **Compilación:** Exitosa (0.8.24, cancun, via_ir)

---

## RESUMEN EJECUTIVO

| Categoría | Hallazgos |
|-----------|-----------|
| 🔴 Crítico | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 3 |
| 🔵 Low / Nit | 5 |
| ✅ Buenas prácticas confirmadas | 8 |

**Veredicto:** Los contratos son seguros para MVP. El hallazgo High tiene mitigación parcial. Los Medium son aceptables para la fase actual con plan de remediación clara.

---

## 🔴 CRÍTICO — 0 hallazgos

No se encontraron vulnerabilidades críticas.

---

## 🟠 HIGH — 1 hallazgo

### H-1: `_executeMultiThinkAgent` no verifica saldo suficiente del contrato

**Archivo:** `AegisBrain.sol:427-433`
**Severidad:** High
**Estado:** Requiere fix

**Descripción:** `_executeMultiThinkAgent` envía `{value: deposit}` sin verificar que el contrato tenga saldo suficiente. Si el contrato se queda sin ETH, los requests de multiThink fallarán silenciosamente (el require en `_executeStep` sí existe, pero en `_executeMultiThinkAgent` no).

**Línea vulnerable:**
```solidity
// AegisBrain.sol:427-433
uint256 deposit = somniaAgents.getRequestDeposit();
uint256 requestId = somniaAgents.createRequest{value: deposit}(  // ← No verifica balance
    llmAgentId, address(this), this.handleAgentResponse.selector, payload
);
```

**Impacto:** Si el contrato no tiene fondos suficientes, la transacción revierte. En el contexto de multiThink, esto podría dejar el pipeline en estado inconsistente (algunos agentes ya fueron despachados, otros no).

**Mitigación actual parcial:** `_executeStep` (usado por `thinkPipeline`) SÍ tiene `require(address(this).balance >= deposit)`. Pero `_executeMultiThinkAgent` y `thinkWithTools` no.

**Fix recomendado:**
```solidity
function _executeMultiThinkAgent(...) internal {
    uint256 deposit = somniaAgents.getRequestDeposit();
    require(address(this).balance >= deposit, "Insufficient contract balance");
    // ... rest of function
}
```

---

## 🟡 MEDIUM — 3 hallazgos

### M-1: `_calculateConsensus` tiene complejidad O(n²) y cuenta votos duplicados

**Archivo:** `AegisBrain.sol:520-538`
**Severidad:** Medium
**Estado:** Aceptable para MVP (n ≤ 7)

**Descripción:** El algoritmo de consenso usa doble loop para contar votos. Para n=5 agentes, esto es 10 comparaciones — aceptable. Pero si n crece a 50+, el gas se dispara. Además, el algoritmo cuenta el mismo voto múltiples veces (aunque `maxVotes` solo guarda el máximo, lo cual es correcto).

**Recomendación:** Para producción, usar un mapping temporal que cuente votos en O(n).

### M-2: `recordBattle` no tiene control de acceso

**Archivo:** `AegisCreate.sol:173-201`
**Severidad:** Medium
**Estado:** Diseño intencional, documentar

**Descripción:** Cualquiera puede llamar `recordBattle` para cualquier tokenId. Esto permite "spam" de batallas falsas para subir de nivel artificialmente.

**Razón del diseño:** En el ecosistema AEGIS, `recordBattle` es llamado por AegisListen (contrato confiable) o por el SDK después de verificar eventos reales on-chain. No se restringe acceso porque:
1. El guardián es del usuario — si quiere "farmear" niveles, es su NFT
2. Las batallas falsas no afectan a otros usuarios
3. La evolución es cosmética (no tiene valor económico directo)

**Recomendación:** Si se añaden recompensas económicas al nivel, añadir `onlyAegisListen` modifier.

### M-3: `_safeDecodeString` expone `_dummyDecode` como external

**Archivo:** `AegisBrain.sol:549-564`
**Severidad:** Medium
**Estado:** Requiere fix

**Descripción:** `_dummyDecode` es `external pure` para permitir `try/catch`. Pero al ser external, cualquiera puede llamarlo. Aunque es `pure` (no lee estado), expone una función innecesaria en la ABI.

**Fix recomendado:** No es explotable (es pure), pero es mala práctica. Se puede eliminar el try/catch y asumir que los resultados de Somnia siempre son strings ABI-encoded válidos.

---

## 🔵 LOW / NIT — 5 hallazgos

### L-1: `agentIndex` no usado en `_executeMultiThinkAgent`

**Archivo:** `AegisBrain.sol:413`
**Severidad:** Low (warning de compilador)

El parámetro `agentIndex` se declaró para tracking pero no se usa. Se puede quitar o usar en el evento.

### L-2: `multiScores` declarado pero nunca usado

**Archivo:** `AegisBrain.sol:47`
**Severidad:** Low

El campo `multiScores` en `PipelineState` nunca se escribe ni se lee. Ocupa storage innecesariamente.

### L-3: `extraData` declarado pero nunca usado

**Archivo:** `AegisBrain.sol:48`
**Severidad:** Low

Mismo caso — campo reservado para uso futuro pero no implementado.

### L-4: `thinkWithTools` usa `msg.value` en lugar del balance del contrato

**Archivo:** `AegisBrain.sol:259-260`
**Severidad:** Low

A diferencia de `_executeStep` que usa `address(this).balance`, `thinkWithTools` requiere `msg.value`. Esto es inconsistente y puede confundir a integradores.

### L-5: `tokenURI` puede revertir por gas si `battleScars` es muy grande

**Archivo:** `AegisCreate.sol:233-253`
**Severidad:** Low

Si un guardián acumula miles de cicatrices, `_buildAttributes` podría gastar demasiado gas. El límite práctico es ~100 cicatrices.

---

## ✅ BUENAS PRÁCTICAS CONFIRMADAS

1. ✅ **ReentrancyGuard en AegisBrain** — `thinkPipeline`, `multiThink`, `thinkWithTools` usan `nonReentrant`
2. ✅ **Callback restringido** — `handleAgentResponse` solo acepta llamadas de `somniaAgents`
3. ✅ **Anti-recursión en AegisListen** — `_triggerLock` evita que un listener se dispare a sí mismo
4. ✅ **Fail-safe en consenso** — Sin mayoría clara → WARN (nunca ALLOW)
5. ✅ **Risk scores capped** — `_consensusRiskScore` siempre devuelve ≤ 95
6. ✅ **Delete de storage** — Pipelines completados/falidos limpian su estado
7. ✅ **ERC-721 safeMint** — `_safeMint` en lugar de `_mint` (verifica recepción)
8. ✅ **Immutable para direcciones** — `somniaAgents` y `llmAgentId` son inmutables

---

## RECOMENDACIONES PRIORIZADAS

| Prioridad | Acción | Esfuerzo |
|-----------|--------|----------|
| 1 | Añadir `require(address(this).balance >= deposit)` en `_executeMultiThinkAgent` | 1 línea |
| 2 | Añadir `require(address(this).balance >= deposit)` en `thinkWithTools` | 1 línea |
| 3 | Eliminar campos no usados de `PipelineState` (`multiScores`, `extraData`) | 2 líneas |
| 4 | Documentar que `recordBattle` es permissionless por diseño | Doc |
| 5 | Considerar eliminar `_dummyDecode` external o hacerla internal con assembly | Refactor |

---

## CONCLUSIÓN

Los contratos AEGIS son **seguros para MVP y demo en la Agentathon**. El único hallazgo High (falta de verificación de saldo) tiene fix trivial. Los hallazgos Medium son compensaciones de diseño documentadas o aceptables para la fase actual.

**Prueba de cobertura:** 146 tests cubren:
- Flujos felices (pipeline, multiThink, mint, evolución, listeners)
- Edge cases (fallos, parámetros inválidos, callbacks no autorizados)
- Seguridad (acceso restringido, anti-recursión, fail-safe)
- Integración (evento → pipeline → callback → resultado)