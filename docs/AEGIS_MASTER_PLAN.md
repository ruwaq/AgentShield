# 🧬 AEGIS — Autonomous Execution & Generative Intelligence System

> **Framework on-chain para pipelines de IA multi-agente en Somnia**
>
> Fecha: 2026-05-29 | Estado: Investigación completa, listo para implementar
> Proyecto base: AgentShield v1.0.0 | Target: Somnia Agentathon

---

## 0. ESTRATEGIA GANADORA

### Lo que construimos

**AEGIS Framework** (plataforma) + **Autonomous DeFi Guardian** (producto demo)

```
┌─────────────────────────────────────────────────┐
│                 A E G I S                        │
│   Framework on-chain para pipelines de IA       │
│                                                  │
│  AegisBrain.sol    AegisCreate.sol              │
│  AegisListen.sol   @aegis/sdk                   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │     DEMO: Autonomous DeFi Guardian       │   │
│  │                                          │   │
│  │  "Un dragón AI que protege tu wallet     │   │
│  │   24/7 usando reactividad on-chain"      │   │
│  │                                          │   │
│  │  Construido sobre AEGIS en 3 líneas      │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Por qué esto gana

| Factor | Evidencia |
|--------|-----------|
| **Usa 4+ features nativas** | LLM Agents + Reactivity + AA + Streams + NFTs |
| **Llena el gap #1 de Somnia** | No existe orquestador multi-agente on-chain |
| **Plataforma, no producto** | Cualquier dev construye sobre AEGIS |
| **Demo impactante** | Dragón AI salvando wallet de un rug pull en tiempo real |
| **DX first** | 3 líneas de SDK vs 200 de boilerplate |
| **Imposible en otra chain** | Solo Somnia tiene inferencia determinista on-chain + reactividad |

---

## 1. VISIÓN

Somnia construyó los ladrillos (agentes individuales, AA, reactividad, streams). Lo que falta es el arquitecto que los une.

**AEGIS es el framework on-chain que permite a cualquier desarrollador o usuario crear pipelines de IA multi-agente, NFTs con personalidad generada por AI, wallets inteligentes con guardianes autónomos, y aplicaciones reactivas — todo en 3 líneas de código.**

---

## 2. ARQUITECTURA TÉCNICA

### 2.1 Contratos del Core

```
contracts/
├── AgentShieldRegistry.sol        # EXISTENTE: guardián v1 (130 LOC)
├── aegis/
│   ├── AegisBrain.sol             # DÍA 1: Pipeline multi-agente + memoria + consensus
│   ├── AegisCreate.sol            # DÍA 2: NFT con alma de IA + evolución
│   └── AegisListen.sol            # DÍA 3: Reactividad on-chain → AI triggers
└── interfaces/
    ├── ISomniaAgents.sol          # EXISTENTE (a actualizar con interfaz completa)
    └── IAegisPlugin.sol           # NUEVO: plugin interface para extensibilidad
```

### 2.2 AegisBrain.sol — El corazón

```solidity
contract AegisBrain {
    // Pipeline multi-agente: encadena LLM → Parse Web → JSON API → LLM
    function thinkPipeline(
        string memory context,
        AgentCall[] memory agentCalls
    ) external payable returns (Thought memory);

    // Multi-LLM consensus: N agentes votan, mayoría decide
    function multiThink(
        string memory prompt,
        uint256 agentCount,
        uint256 consensusThreshold
    ) external payable returns (Decision memory);

    // inferToolsChat wrapper: LLM puede llamar otros contratos
    function thinkWithTools(
        string memory prompt,
        OnchainTool[] memory tools,
        uint256 maxIterations
    ) external payable returns (Thought memory);

    // Memoria persistente entre llamadas
    mapping(bytes32 => bytes) public memoryStore;
    function remember(bytes32 key, bytes memory data) external;
    function recall(bytes32 key) external view returns (bytes memory);
}
```

### 2.3 AegisCreate.sol — NFTs con alma

```solidity
contract AegisCreate is ERC721, AegisBrain {
    struct Soul {
        string personalityPrompt;    // "Eres Magnus, un draco anciano..."
        bytes32[] memoryHashes;      // Recuerdos de interacciones
        uint256 level;               // Evoluciona con el uso
        uint256 createdAt;
        string[] traits;             // Rasgos generados por IA
    }

    function mintGuardian(string memory name, string memory archetype)
        external payable returns (uint256 tokenId);

    function tokenURI(uint256 tokenId) public view override returns (string memory);
    function evolve(uint256 tokenId, bytes calldata event) external returns (uint256);
}
```

### 2.4 AegisListen.sol — Reactividad inteligente

```solidity
contract AegisListen is SomniaEventHandler, AegisBrain {
    struct Listener {
        address target;
        bytes32 eventSignature;
        bytes aiPipeline;        // AgentCalls[] encoded
        bool active;
        uint256 triggerCount;
    }

    function on(address target, bytes32 eventSignature, bytes memory aiPipeline)
        external returns (bytes32 listenerId);

    // Hereda _onEvent de SomniaEventHandler
    // Evento → Brain analiza → Decide → Ejecuta
}
```

### 2.5 NOTA: AegisExecute REDISEÑADO

**Hallazgo crítico:** Session keys en Somnia son solo RPC, no tienen API de Solidity.
→ AegisExecute NO será un contrato independiente. En su lugar:

1. El **frontend/SDK** maneja session keys vía `somnia_sendSessionTransaction`
2. La **verificación AI previa** se hace con AegisBrain antes de enviar la tx
3. El **SDK** abstrae todo: `aegis.executeWithGuardian(tx, intent)`

---

## 3. STACK TECNOLÓGICO

| Capa | Tecnología | Versión | Nota |
|------|-----------|---------|------|
| **Contratos core** | Solidity + Foundry | 0.8.24 | Mismo que AgentShield |
| **Contratos reactividad** | Solidity | **0.8.30** | Requerido por SomniaEventHandler |
| **AI Agents** | Somnia Agents Platform | Testnet `0x037B...` | LLM + Parse + JSON API |
| **Reactividad** | `@somnia-chain/reactivity-contracts` | latest | Precompila `0x0100` |
| **SDK** | TypeScript + Viem v2 | - | Mismo stack que @agentshield/sdk |
| **Frontend** | React 18 + Vite | - | Mismo stack del MVP |
| **NFT** | ERC-721 + metadata on-chain | - | URI generada por LLM |
| **AA (frontend)** | Thirdweb / Privy | - | Session keys vía RPC |

### Dependencias npm

```json
{
    "@somnia-chain/reactivity-contracts": "latest",
    "@somnia-chain/reactivity": "latest",
    "@somnia-chain/streams": "latest",
    "@openzeppelin/contracts": "^5.0.0",
    "viem": "^2.0.0"
}
```

---

## 4. ROADMAP DE IMPLEMENTACIÓN (6 DÍAS)

### Día 1: `AegisBrain.sol` — El corazón
- [ ] Pipeline multi-agente (`thinkPipeline`)
- [ ] Memoria persistente (`remember`, `recall`)
- [ ] Multi-LLM consensus (`multiThink`)
- [ ] Tool-use wrapper (`thinkWithTools` → `inferToolsChat`)
- [ ] Tests unitarios (20+ tests)
- [ ] Gas report

**Verificación:** `forge test --match-contract AegisBrain -vvv`

### Día 2: `AegisCreate.sol` — NFTs con alma
- [ ] ERC-721 base + metadata on-chain
- [ ] `mintGuardian` con personalidad LLM
- [ ] `tokenURI` dinámico generado por IA
- [ ] `evolve` por eventos (nivel, traits, cicatrices)
- [ ] Tests (15+ tests)

**Verificación:** `forge test --match-contract AegisCreate -vvv`

### Día 3: `AegisListen.sol` — Reactividad inteligente
- [ ] Heredar de `SomniaEventHandler`
- [ ] Suscripción a eventos con filtros
- [ ] `_onEvent` → `thinkPipeline` → acción
- [ ] Protección anti-recursión
- [ ] Tests con mock de precompila

**Verificación:** `forge test --match-contract AegisListen -vvv`

### Día 4: `@aegis/sdk` — SDK para desarrolladores
- [ ] Clase `Aegis` principal
- [ ] Métodos: `think`, `createGuardian`, `listen`, `executeWithGuardian`
- [ ] React hooks (`useAegis`, `useGuardian`, `useBrain`)
- [ ] TypeScript types completos
- [ ] Documentación de API

**Verificación:** `pnpm typecheck && pnpm build`

### Día 5: Frontend — Demo completa
- [ ] Onboarding: conectar wallet → crear guardián NFT
- [ ] Dashboard: actividad, nivel, cicatrices
- [ ] Demo en vivo: submit acción → AI analiza → veredicto animado
- [ ] NFT viewer con traits dinámicos
- [ ] Mobile responsive

**Verificación:** `pnpm dev`

### Día 6: Pulido final
- [ ] Tests de integración end-to-end
- [ ] Video demo (< 3 min)
- [ ] README + documentación completa
- [ ] Deploy a Somnia testnet
- [ ] Submission

---

## 5. DEMO PARA EL VIDEO (DeFi Guardian)

### Escena 1: El problema (15 seg)
> "Todos los días se pierden millones en DeFi por hacks, rugs y liquidaciones. Los humanos no pueden monitorear 24/7."

### Escena 2: La solución (30 seg)
> Usuario conecta wallet → clic en "Crear Guardián" → LLM genera personalidad:
> 🐉 **MAGNUS** — "He protegido tesoros por milenios. Tu wallet está bajo mi ala."

### Escena 3: Protección en acción (45 seg)
> 3 escenarios en tiempo real:
> 1. **Transferencia normal** → ALLOW ✅ ("Pago seguro, joven constructor")
> 2. **Aprobación a estafa** → BLOCK ❌ ("¡Este contrato huele a rug pull! Creado hace 2 bloques.")
> 3. **Liquidación inminente** → WARN ⚠️ + acción defensiva automática

### Escena 4: Evolución (30 seg)
> Dashboard muestra: 150 transacciones protegidas, 0 hacks, 12 cicatrices de batalla
> El NFT cambió visualmente — ahora tiene armadura de batalla

### Escena 5: DX (30 seg)
> Código en pantalla: 3 líneas = guardián completo
> ```typescript
> const aegis = new Aegis({ account: wallet });
> const guardian = await aegis.createGuardian({ name: "Magnus", archetype: "dragon" });
> aegis.listen("TransferIn", async (e) => { /* AI analiza y protege */ });
> ```

### Escena 6: Cierre (15 seg)
> "AEGIS — Autonomous Execution & Generative Intelligence System"
> "Construido 100% sobre Somnia Agents & Reactivity"

---

## 6. VENTAJAS COMPETITIVAS

| Factor | Por qué AEGIS gana |
|--------|-------------------|
| **Llena el gap** | Somnia tiene agentes individuales. AEGIS los orquesta. |
| **Plataforma, no producto** | Cualquier dev construye juegos, DeFi, NFTs, oráculos sobre AEGIS |
| **DX first** | 3 líneas de SDK vs 200 de boilerplate |
| **UX con personalidad** | NFTs con alma generada por IA = engagement emocional |
| **Usa TODO Somnia** | LLM + Parse + AA + Session Keys + Reactivity + Streams |
| **Multiplica ecosistema** | Más devs sobre AEGIS = más apps en Somnia |
| **Mercado secundario** | Guardianes NFT con buen historial valen más |
| **Demostrable** | Video impactante: dragón protegiendo wallet en tiempo real |
| **Imposible en otra chain** | Solo Somnia tiene inferencia determinista on-chain |

---

## 7. DX: ANTES VS DESPUÉS

### Antes (sin AEGIS) — ~200 líneas

```typescript
// Cada dev tiene que:
// 1. Conocer la dirección de la plataforma
// 2. Codificar el payload manualmente
// 3. Implementar callback handleResponse
// 4. Manejar estados (pending, success, failed, timeout)
// 5. Verificar msg.sender en el callback
// 6. Parsear respuestas
// 7. Trackear requestIds
// 8. Calcular depósitos correctamente
// ~200 líneas cada vez
```

### Después (con AEGIS) — 3 líneas

```typescript
import { Aegis } from "@aegis/sdk";
const aegis = new Aegis({ account: wallet });

// 1 línea: pensar
const { decision, riskScore } = await aegis.think("¿Es segura esta tx?", { action });

// 1 línea: crear guardián
const guardian = await aegis.createGuardian({ name: "Magnus", archetype: "dragon" });

// 1 línea: escuchar y reaccionar
aegis.listen("TransferIn", async (e) => {
  const risk = await aegis.think(`Recibí ${e.value} STT de ${e.from}`);
  if (risk.decision === "WARN") await aegis.notify(risk);
});
```

---

## 8. ESTRUCTURA DE ARCHIVOS

```
AgentShield/
├── contracts/
│   ├── AgentShieldRegistry.sol        # EXISTENTE: guardián v1
│   ├── aegis/
│   │   ├── AegisBrain.sol             # NUEVO: Pipeline multi-agente
│   │   ├── AegisCreate.sol            # NUEVO: NFT + AI
│   │   └── AegisListen.sol            # NUEVO: Reactividad + AI
│   └── interfaces/
│       ├── ISomniaAgents.sol          # ACTUALIZAR: interfaz completa
│       └── IAegisPlugin.sol           # NUEVO: plugin interface
│
├── test/
│   ├── AgentShieldRegistry.t.sol      # EXISTENTE: 24 tests
│   ├── AegisBrain.t.sol               # NUEVO
│   ├── AegisCreate.t.sol              # NUEVO
│   ├── AegisListen.t.sol              # NUEVO
│   └── AegisIntegration.t.sol         # NUEVO: tests end-to-end
│
├── sdk/src/
│   ├── index.ts                       # EXISTENTE: @agentshield/sdk
│   ├── aegis.ts                       # NUEVO: SDK de AEGIS
│   └── aegis-react.ts                 # NUEVO: hooks de AEGIS
│
├── frontend/src/
│   ├── main.tsx                       # EXISTENTE: demo actual
│   └── AegisDemo.tsx                  # NUEVO: demo completa
│
├── script/
│   ├── Deploy.s.sol                   # EXISTENTE
│   └── DeployAegis.s.sol              # NUEVO
│
└── docs/
    ├── AEGIS_MASTER_PLAN.md           # ESTE DOCUMENTO (plan refinado)
    ├── TECHNICAL_RESEARCH.md          # Investigación técnica completa
    ├── ARCHITECTURE.md                # Arquitectura detallada
    ├── SECURITY.md                    # Consideraciones de seguridad
    └── DEMO_SCRIPT.md                 # Script del video demo
```

---

## 9. REFERENCIAS

- [Somnia Docs](https://docs.somnia.network)
- [Somnia Agents — Invoking from Solidity](https://docs.somnia.network/agents/invoking-agents/from-solidity)
- [LLM Inference Agent](https://docs.somnia.network/agents/base-agents/llm-inference)
- [On-Chain Reactivity](https://docs.somnia.network/developer/reactivity/reactivity-onchain.md)
- [Off-Chain Reactivity](https://docs.somnia.network/developer/reactivity/reactivity-offchain.md)
- [Agent Explorer Testnet](https://agents.testnet.somnia.network)
- [Block Explorer Testnet](https://shannon-explorer.somnia.network)
- [Somnia Data Streams SDK](https://github.com/somnia-chain/somnia-data-streams-sdk)
- [Somnia Agentic Examples](https://github.com/Kali-Decoder/Somnia-Agentic-examples)

---

> **Próximo paso:** `AegisBrain.sol` — el pipeline multi-agente es el corazón del sistema.
> **Siguiente sesión:** "Cargá el plan AEGIS y empezá con AegisBrain.sol"