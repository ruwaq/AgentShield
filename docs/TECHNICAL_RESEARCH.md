# 🔬 Investigación Técnica — Somnia Network

> **Fecha:** 2026-05-29 | **Fuentes:** Docs oficiales, GitHub, Agent Explorer, WebFetch
> **Propósito:** Referencia técnica completa para no repetir errores. Todo lo descubierto sobre la plataforma Somnia.

---

## 1. SOMNIA AGENTS PLATFORM

### 1.1 Direcciones de Contratos

| Red | Chain ID | Dirección de Plataforma |
|-----|----------|------------------------|
| Testnet | 50312 | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| Mainnet | 5031 | `0x5E5205CF39E766118C01636bED000A54D93163E6` |

### 1.2 Interfaz Completa `IAgentRequester`

```solidity
interface IAgentRequester {
    // Request básico: 1 agente, callback simple
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    // Request avanzado: subcomité personalizado + consenso configurable
    function createAdvancedRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        ConsensusType consensusType,
        uint256 timeout
    ) external payable returns (uint256 requestId);

    // Consultas
    function getRequest(uint256 requestId) external view returns (Request memory);
    function hasRequest(uint256 requestId) external view returns (bool);
    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);
}
```

### 1.3 Structs y Enums

```solidity
enum ResponseStatus { None, Pending, Success, Failed, TimedOut }  // 0-4
enum ConsensusType { Majority, Threshold }

struct Response {
    address validator;      // Validador que generó esta respuesta
    bytes result;           // Resultado ABI-encoded
    ResponseStatus status;  // Estado de esta respuesta individual
    uint256 receipt;        // Recibo on-chain
    uint256 timestamp;      // Cuándo se generó
    uint256 executionCost;  // Costo real de ejecución
}

struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;      // Validadores asignados
    Response[] responses;        // Una por validador
    uint256 responseCount;       // Cuántos ya respondieron
    uint256 failureCount;        // Cuántos fallaron
    uint256 threshold;           // Mínimo de respuestas para consenso
    uint256 createdAt;
    uint256 deadline;            // Timeout del request
    ResponseStatus status;       // Estado general del request
    ConsensusType consensusType;
    uint256 remainingBudget;     // Presupuesto no gastado
    uint256 perAgentBudget;      // Presupuesto por agente/validador
}
```

### 1.4 ⚠️ Callback Signature — DISCREPANCIA EN LA DOC

La documentación de Somnia muestra **DOS versiones diferentes** del callback. Hay que verificar contra el contrato deployado.

**Versión 1 (doc principal — con structs tipados):**
```solidity
function handleResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory details
) external;
```

**Versión 2 (doc alternativa — tipos planos, la que usa AgentShield):**
```solidity
function handleAgentResponse(
    uint256 requestId,
    bytes[] calldata responses,
    uint8 status,
    bytes calldata details
) external;
```

> **Acción requerida:** Verificar cuál es la firma real en el contrato deployado en testnet. Si AgentShield usa la incorrecta, el callback nunca se ejecutará.

### 1.5 Tipos de Agentes y sus Métodos

#### LLM Inference Agent

**Modelo:** Qwen3-30B, determinista (temperature=0), corre en consenso de 3 validadores.

```solidity
interface ILLMAgent {
    struct OnchainTool {
        string signature;    // ej. "swap(address token, uint256 amount)"
        string description;  // Descripción para el LLM
    }

    // Inferencia simple de texto con restricciones
    function inferString(
        string memory prompt,
        string memory system,
        bool chainOfThought,
        string[] memory allowedValues  // Valores permitidos (opcional)
    ) external returns (string memory response);

    // Inferencia numérica clampada a rango
    function inferNumber(
        string memory prompt,
        string memory system,
        int256 minValue,
        int256 maxValue,
        bool chainOfThought
    ) external returns (int256 response);

    // Chat multi-turn
    function inferChat(
        string[] memory roles,
        string[] memory messages,
        bool chainOfThought
    ) external returns (string memory response);

    // 🔥 KILLER FEATURE: LLM con herramientas on-chain (Yield & Resume)
    function inferToolsChat(
        string[] calldata roles,
        string[] calldata messages,
        string[] calldata mcpServerUrls,
        OnchainTool[] calldata onchainTools,
        uint256 maxIterations,
        bool chainOfThought
    ) external returns (
        string memory finishReason,       // "stop" o "tool_calls"
        string memory response,
        string[] memory updatedRoles,     // Estado para reanudar
        string[] memory updatedMessages,  // Estado para reanudar
        string[] memory pendingToolCallIds,
        bytes[] memory pendingToolCalls   // Calldata ABI-encoded para ejecutar
    );
}
```

#### LLM Parse Website Agent

```solidity
interface IParseWebsiteAgent {
    function ExtractString(
        string memory key,
        string memory description,
        string[] calldata options,
        string memory prompt,
        string memory url,
        bool resolveUrl,
        uint8 numPages,
        uint8 confidenceThreshold
    ) external returns (string memory);

    function ExtractANumber(
        string memory key,
        string memory description,
        uint256 min,
        uint256 max,
        string memory prompt,
        string memory url,
        bool resolveUrl,
        uint8 numPages,
        uint8 confidenceThreshold
    ) external returns (uint256);
}
```

#### JSON API Agent

```solidity
interface IJsonApiAgent {
    function fetchString(string calldata url, string calldata selector) external returns (string memory);
    function fetchUint(string calldata url, string calldata selector, uint8 decimals) external returns (uint256);
    function fetchInt(string calldata url, string calldata selector, uint8 decimals) external returns (int256);
    function fetchBool(string calldata url, string calldata selector) external returns (bool);
    function fetchStringArray(string calldata url, string calldata selector) external returns (string[] memory);
    function fetchUintArray(string calldata url, string calldata selector, uint8 decimals) external returns (uint256[] memory);
}
```

### 1.6 Agent IDs

| Agente | ID | Estado |
|--------|-----|--------|
| LLM Inference | `12847293847561029384` | ⚠️ **NO documentado oficialmente** — solo aparece en AgentShield |
| LLM Parse Website | `12875401142070969085` | ✅ Confirmado en documentación oficial |
| JSON API | `12345678901234567890` | ⚠️ Solo ejemplo ilustrativo en docs, no es el ID real |

> **Acción requerida:** Verificar el ID real del LLM Agent y JSON API Agent en el [Agent Explorer](https://agents.testnet.somnia.network).

### 1.7 Costos

| Agente | Por validador | Total (×3 validadores) |
|--------|--------------|------------------------|
| JSON API | 0.03 SOMI | 0.12 SOMI |
| LLM Inference | 0.07 SOMI | 0.24 SOMI |
| LLM Parse Website | 0.10 SOMI | 0.33 SOMI |

**Fórmula de depósito:** `msg.value = minPerAgentDeposit(0.01) × 3 + perAgentPrice × 3`

### 1.8 Patrón Yield & Resume (inferToolsChat)

El flujo completo para que un LLM ejecute acciones on-chain:

```
Paso 1: Llamar inferToolsChat con herramientas definidas
        ↓
Paso 2: Si finishReason == "tool_calls":
        - Ejecutar cada pendingToolCalls[i] via targetContract.call(pendingToolCalls[i])
        - Capturar el resultado
        ↓
Paso 3: Adjuntar cada resultado como rol "tool":
        {"tool_call_id": pendingToolCallIds[i], "content": "result string"}
        ↓
Paso 4: Re-llamar inferToolsChat con updatedRoles y updatedMessages
        ↓
        Repetir hasta finishReason == "stop"
```

**Ejemplo de herramienta on-chain:**
```solidity
OnchainTool memory swapTool = OnchainTool({
    signature: "swap(address token, uint256 amount)",
    description: "Swap tokens on a DEX. token: address of token to swap, amount: amount in wei"
});
```

---

## 2. ACCOUNT ABSTRACTION + SESSION KEYS

### 2.1 Direcciones

| Contrato | Dirección |
|----------|-----------|
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Thirdweb Account Factory | `0x4be0ddfebca9a5a4a617dee4dece99e7c862dceb` |

### 2.2 Session Keys — SOLO RPC

**Dato crítico:** No existe API de Solidity para session keys. Todo se maneja vía RPC.

```javascript
// Derivar dirección de sesión
const sessionAddr = await rpcCall("somnia_getSessionAddress", ["0x<seed-32-bytes>"]);

// Enviar transacción de sesión (sin firma del usuario)
const tx = await rpcCall("somnia_sendSessionTransaction", [{
    seed: "0x...",     // 32 bytes — mismo seed usado para derivar
    gas: "0x5208",     // hex
    to: "0x...",       // opcional (deploy si se omite)
    value: "0x0",      // opcional, en hex wei
    data: "0x..."      // opcional, calldata
}]);
```

### 2.3 Limitaciones de Session Keys

- ❌ Sin scopes (no se puede limitar qué contratos llamar)
- ❌ Sin expiry on-chain (no hay timestamp de expiración en el contrato)
- ❌ Sin spending limits (no hay límite de gasto por sesión)
- ❌ Sin Paymaster documentado (no hay gas sponsorship nativo)
- ❌ La cuenta de sesión debe tener fondos propios para gas
- ✅ Permiten "pre-authorize a sequence of transactions" (notas del hard fork Ingot)

### 2.4 Providers de Smart Account

| Provider | Método |
|----------|--------|
| **Thirdweb** | `inAppWallet` + `smartAccount` + `sponsorGas: true` + `factoryAddress` |
| **Privy** | `useCrossAppAccounts` + `sendTransaction` |

### 2.5 Implicaciones para AEGIS

- **AegisExecute NO puede ser un contrato Solidity independiente** que maneje session keys
- La ejecución con verificación AI debe ser: SDK → AegisBrain.think() → si ALLOW → somnia_sendSessionTransaction
- El SDK abstrae todo: `aegis.executeWithGuardian({ to, value, data, intent })`

---

## 3. REACTIVIDAD

### 3.1 On-Chain Reactivity

**Paquete:** `@somnia-chain/reactivity-contracts`
**Solc requerido:** `0.8.30` (⚠️ diferente a nuestro 0.8.24)

#### Interfaces

```solidity
// Precompila en 0x0100
interface ISomniaReactivityPrecompile {
    // System events disponibles
    function BlockTick() external;  // Cada bloque
    function EpochTick() external;  // Cada epoch
    // Schedule: one-shot o recurrente
}

// Tu contrato debe heredar esto
abstract contract SomniaEventHandler {
    // Solo la precompila (0x0100) puede llamar tu handler
    // tx.origin == dueño de la suscripción
    // msg.value == 0
    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal virtual;
}

// Helper para suscripciones
library SomniaExtensions {
    address constant SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS = 0x0100;

    struct SubscriptionFilter {
        bytes32[] eventTopics;  // topic[0] = event selector, resto = filtros
        address origin;         // address(0) = cualquiera
        address emitter;        // Contrato que emite el evento
    }

    struct SubscriptionOptions {
        uint256 priorityFeePerGas;  // Tip al validador
        uint256 maxFeePerGas;       // 0 = sin límite
        uint64 gasLimit;            // Gas para el handler
    }

    function subscribe(address owner, SubscriptionFilter memory filter, SubscriptionOptions memory options)
        internal returns (uint256 subscriptionId);

    function unsubscribe(uint256 subscriptionId) internal;
}
```

#### Ejemplo completo

```solidity
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

contract CounterHandler is SomniaEventHandler {
    uint256 public count;
    uint256 public subscriptionId;

    constructor(uint64 gasLimit) payable {
        // Requiere 32 SOMI mínimo en el contrato
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [ISomniaReactivityPrecompile.BlockTick.selector, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
        });

        SomniaExtensions.SubscriptionOptions memory options = SomniaExtensions.SubscriptionOptions({
            priorityFeePerGas: 1,
            maxFeePerGas: 0,
            gasLimit: gasLimit
        });

        subscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
    }

    function _onEvent(address, bytes32[] calldata, bytes calldata) internal override {
        count += 1;
    }

    function stop() external {
        SomniaExtensions.unsubscribe(subscriptionId);
    }
}
```

#### Datos clave

| Concepto | Valor |
|----------|-------|
| Dirección precompila | `0x0100` |
| Saldo mínimo para suscripción | 32 SOMI |
| Gas para crear suscripción | ~210,000 |
| msg.sender en handler | `0x0100` (solo precompila) |
| tx.origin en handler | dueño de la suscripción |
| msg.value en handler | 0 |
| System events | BlockTick, EpochTick, Schedule |

### 3.2 Off-Chain Reactivity (WebSocket)

**Paquete:** `@somnia-chain/reactivity`

```typescript
import { SDK } from '@somnia-chain/reactivity';
import { createPublicClient, defineChain, webSocket } from 'viem';

const chain = defineChain({
  id: 50312,  // Testnet
  name: 'Somnia Testnet',
  nativeCurrency: { decimals: 18, name: 'STT', symbol: 'STT' },
  rpcUrls: { default: { webSocket: ['wss://api.infra.testnet.somnia.network/ws'] } },
});

const sdk = new SDK({
  public: createPublicClient({ chain, transport: webSocket(chain.rpcUrls.default.webSocket[0]) }),
});

// Escuchar eventos específicos
const sub = await sdk.watch({
  eventContractSources: ['0xTokenAddress'],
  topicOverrides: ['0xTransferEventSignature'],
  ethCalls: [],  // eth_calls adicionales por cada evento
  onData: ({ result }) => {
    const decoded = decodeEventLog({ abi: erc20Abi, topics: result.topics, data: result.data });
    console.log('Transfer:', decoded.args);
  },
  onError: console.error,
});

// Cancelar
await sub.unsubscribe();
```

#### Redes WebSocket

| Red | Chain ID | WebSocket URL |
|-----|----------|---------------|
| Testnet | 50312 | `wss://api.infra.testnet.somnia.network/ws` |
| Mainnet | 5031 | `wss://api.infra.mainnet.somnia.network/ws` |

---

## 4. STREAMS

**Paquete:** `@somnia-chain/streams`

### 4.1 Conceptos

- **Data Streams:** Almacenamiento tipado on-chain (key-value estructurado)
- **Event Streams:** Logs EVM para notificaciones
- Se pueden usar juntos: `setAndEmitEvents()` escribe datos Y emite evento en una tx

### 4.2 API del SDK

```typescript
// Escritura
sdk.set(schemaId, dataId, encodedData);
sdk.emitEvents(schemaId, dataId, encodedData);
sdk.setAndEmitEvents(schemaId, dataId, encodedData);

// Lectura
sdk.getByKey(schemaId, dataId);
sdk.getAtIndex(schemaId, index);
sdk.getBetweenRange(schemaId, startIndex, endIndex);
sdk.getAllPublisherDataForSchema(schemaId, publisher);
sdk.getLastPublishedDataForSchema(schemaId, publisher);
sdk.totalPublisherDataForSchema(schemaId, publisher);

// Reactividad
sdk.subscribe(schemaId, callback);

// Gestión
sdk.registerDataSchemas([schema]);
sdk.registerEventSchemas([schema]);
sdk.computeSchemaId(schema);
sdk.getSchemaFromSchemaId(schemaId);
```

---

## 5. GITHUB — ECOSISTEMA REAL

### 5.1 Repos Oficiales de Somnia

| Repo | Estrellas | Descripción |
|------|-----------|-------------|
| [somnia-chain/somnia-data-streams-sdk](https://github.com/somnia-chain/somnia-data-streams-sdk) | 7★ | SDK oficial de streams |

> **Nota:** La org SomniaNetwork en GitHub tiene muy pocos repos públicos. La mayoría del código está en paquetes npm privados o no open-source.

### 5.2 Proyectos de la Comunidad Relevantes

| Proyecto | Descripción | Relevancia |
|----------|-------------|------------|
| [Kali-Decoder/Somnia-Agentic-examples](https://github.com/Kali-Decoder/Somnia-Agentic-examples) | Ejemplos de agentes en Solidity (13★) | ⭐⭐⭐⭐⭐ — Ejemplos directos de createRequest |
| [icekidtech/somnia-react-autonomous](https://github.com/icekidtech/somnia-react-autonomous) | Librería Solidity+TS para contratos reactivos | ⭐⭐⭐⭐ — Patrones de reactividad |
| [xuanbach0212/somnia-agent-kit](https://github.com/xuanbach0212/somnia-agent-kit) | SDK para AI agents en Somnia | ⭐⭐⭐⭐ — Competidor/Referencia |
| [springmacedonio-sys/Somnia-DeFi-Wallet](https://github.com/springmacedonio-sys/Somnia-DeFi-Wallet) | Smart wallet ERC-4337 + session keys | ⭐⭐⭐ — Implementación de AA |
| [local-optimum/reactive-stt-faucet](https://github.com/local-optimum/reactive-stt-faucet) | Faucet 100% on-chain con reactividad | ⭐⭐⭐ — Ejemplo reactividad pura |
| [wurli-sh/mirra](https://github.com/wurli-sh/mirra) | Copy-trading autónomo on-chain | ⭐⭐⭐ — Agentes autónomos reales |
| [RichWangombe/somnia-reactive-orchestrator](https://github.com/RichWangombe/somnia-reactive-orchestrator) | Orquestador de automatización reactiva | ⭐⭐⭐⭐ — Similar a AegisListen |
| [resolverai/roast-somnia-contracts](https://github.com/resolverai/roast-somnia-contracts) | Contratos de mindshare (8★) | ⭐⭐ |
| [NikhilRaikwar/SomniaX](https://github.com/NikhilRaikwar/SomniaX) | Marketplace de AI agents (5★) | ⭐⭐⭐ — Competencia indirecta |
| [dyvkxking/agentmesh-ai](https://github.com/dyvkxking/agentmesh-ai) | Marketplace on-chain de AI agents | ⭐⭐⭐ — Competencia indirecta |
| [pSJLq/ShinyAudit](https://github.com/pSJLq/ShinyAudit) | Investigator on-chain con 142 tools | ⭐⭐⭐⭐ — Uso avanzado de tools |

### 5.3 Lo que NADIE tiene (nuestra ventaja)

- ❌ Nadie tiene un **pipeline multi-agente on-chain** (orquestador)
- ❌ Nadie integra **reactividad + AI agents** en un solo sistema
- ❌ Nadie tiene **NFTs con personalidad generada por LLM** que evolucionan
- ❌ No hay **framework unificado** — cada proyecto reinventa todo
- ❌ Nadie ofrece **3 líneas de SDK** para pipelines complejos

---

## 6. AGENTATHON

### 6.1 Lo que sabemos

- Existe una página en `encodeclub.com/programmes/agentathon` que menciona "Somnia Agentathon"
- No se pudieron extraer fechas, premios, tracks ni criterios (la página requiere auth/registro)
- Somnia se autodenomina **"The Agentic L1"**
- Partners conocidos: OpenSea, HandsNFT, Netherak Demons, LI.FI, BitGo, Ledger

### 6.2 Lo que buscan (inferido de su messaging)

- Proyectos que usen **múltiples features nativas** de Somnia juntas
- **AI on-chain real** (inferencia determinista en consenso)
- **Reactividad + Agentes** combinados
- Algo que **solo se pueda construir en Somnia**
- No quieren: otro DEX, otro lending, otra copia de Uniswap

---

## 7. LECCIONES APRENDIDAS DE AGENTSHIELD V1

### 7.1 Aciertos

- ✅ `_localCheck()` determinista antes de gastar gas en LLM — patrón correcto
- ✅ `Ownable2Step` + `Pausable` + `ReentrancyGuard` — seguridad sólida
- ✅ Foundry-native tests sin dependencias TypeScript
- ✅ Human-readable ABI en `abi.ts` evita codegen

### 7.2 Errores que NO repetir

| Error | Corrección |
|-------|-----------|
| `DEFAULT_LLM_AGENT_ID` hardcodeado sin verificar | Verificar contra Agent Explorer antes de deploy |
| `handleAgentResponse` usa firma no confirmada | Verificar firma real en contrato deployado |
| `InvalidPolicy()` cuando `scanId==0` — error confuso | Usar errores descriptivos: `RequestNotFound()` |
| No validar `msg.value` mínimo para LLM | Calcular depósito mínimo con `getRequestDeposit()` |
| Tests no cubren callback real | Usar fork test contra testnet o mock más realista |

### 7.3 Patrones que SÍ mantener

- **Fail-safe:** Unexpected LLM output → WARN (nunca ALLOW)
- **Risk scores capped:** Siempre `<= 100` en `_finalize`
- **Reason hash on-chain:** Solo `keccak256`, nunca texto plano
- **Callback restriction:** Solo `somniaAgents` puede llamar

---

## 8. REFERENCIAS RÁPIDAS

### URLs Clave

| Recurso | URL |
|---------|-----|
| Somnia Docs | https://docs.somnia.network |
| Agents — Invoking from Solidity | https://docs.somnia.network/agents/invoking-agents/from-solidity |
| LLM Inference Agent | https://docs.somnia.network/agents/base-agents/llm-inference |
| On-Chain Reactivity | https://docs.somnia.network/developer/reactivity/reactivity-onchain.md |
| Off-Chain Reactivity | https://docs.somnia.network/developer/reactivity/reactivity-offchain.md |
| Account Abstraction | https://docs.somnia.network/developer/building-dapps/account-abstraction.md |
| Streams | https://docs.somnia.network/developer/streams.md |
| Agent Explorer (Testnet) | https://agents.testnet.somnia.network |
| Block Explorer (Testnet) | https://shannon-explorer.somnia.network |
| Somnia Data Streams SDK | https://github.com/somnia-chain/somnia-data-streams-sdk |
| Somnia Agentic Examples | https://github.com/Kali-Decoder/Somnia-Agentic-examples |

### Comandos de Verificación

```bash
# Verificar Agent ID en el explorer
curl -s https://agents.testnet.somnia.network/api/agents | jq '.[] | {id, name}'

# Verificar firma de callback en contrato deployado
cast call 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776 "getRequest(uint256)(tuple)" <requestId> --rpc-url somnia_testnet

# Verificar depósito mínimo
cast call 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776 "getRequestDeposit()(uint256)" --rpc-url somnia_testnet
```

---

> **Usar este documento como referencia antes de tomar cualquier decisión técnica.**
> **Si algo no está claro, verificar contra las fuentes originales listadas arriba.**