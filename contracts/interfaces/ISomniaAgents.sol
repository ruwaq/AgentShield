// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISomniaAgents — Interfaz completa de la plataforma de agentes de Somnia
/// @notice Datos verificados contra docs.somnia.network y confirmados por el equipo de Somnia
/// @dev La plataforma es un proxy UUPS.
///
/// # DIRECCIONES DE PLATAFORMA (verificar siempre antes de deploy)
///   - Testnet (chain 50312): 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776
///   - Mainnet (chain 5031):  0x5E5205CF39E766118C01636bED000A54D93163E6
///   ⚠️  Usar la dirección de mainnet en testnet causa fallos silenciosos.
///
/// # AGENT IDs CONFIRMADOS EN TESTNET
///   - LLM Inference:      12847293847561029384  (0.07 SOMI/agente)
///   - LLM Parse Website:  12875401142070969085  (0.10 SOMI/agente)
///   - JSON API Request:   placeholder 12345678901234567890 (0.03 SOMI/agente)
///
/// # CÓMO FUNCIONA EL SUBCÓMITE
///   Cada request se envía a 3 validadores (default). Cada uno ejecuta el agente
///   independientemente y produce un receipt. Si los 3 receipts tienen el mismo
///   response.result, el resultado es determinístico. La plataforma invoca el
///   callback handleResponse() UNA sola vez con el resultado del consenso.
///
/// # FÓRMULA DE DEPÓSITO
///   msg.value = getRequestDeposit() + (perAgentPrice × subcommitteeSize)
///   Ejemplo LLM Inference: 0.03 + (0.07 × 3) = 0.24 SOMI
///   Enviar solo getRequestDeposit() → perAgentBudget = 0 → los runners ignoran el request.
///
/// # RECEIPTS ENDPOINT (para auditar requests)
///   GET https://receipts.testnet.agents.somnia.host/agent-receipts
///       ?contractAddress=<platform>&requestId=<id>
interface ISomniaAgents {
    // ─── Requests ───────────────────────────────────────────

    /// @notice Crea un request básico (1 agente, callback simple)
    /// @param agentId ID del agente (ej. 12847293847561029384 = LLM Inference)
    /// @param callbackAddress Dirección que recibirá el callback
    /// @param callbackSelector Selector de la función de callback (4 bytes)
    ///        ⚠️ CRÍTICO: debe ser el selector de handleResponse() con la firma EXACTA.
    ///        Si no coincide, el callback nunca llega. Usar this.handleResponse.selector.
    /// @param payload Datos ABI-encoded para el agente (ej. abi.encodeWithSignature("inferString(...)", ...))
    /// @return requestId ID del request creado (guardarlo para vincular con el callback)
    /// @dev msg.value debe cubrir reserve + reward. Ver fórmula arriba.
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    /// @notice Crea un request avanzado con subcomité y consenso personalizados
    /// @param subcommitteeSize Número de validadores (default 3, más = más seguro pero más caro)
    /// @param threshold Mínimo de respuestas para consenso
    /// @param consensusType 0 = Majority, 1 = Threshold
    /// @param timeout Tiempo máximo de espera en segundos
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

    // ─── Consultas ──────────────────────────────────────────

    function getRequest(uint256 requestId) external view returns (Request memory);
    function hasRequest(uint256 requestId) external view returns (bool);

    /// @notice Retorna SOLO el piso de operaciones (reserve), NO el depósito total.
    /// @dev Enviar solo este valor como msg.value causa que perAgentBudget = 0
    ///      y los runners ignoran el request. Siempre añadir el reward pot.
    function getRequestDeposit() external view returns (uint256);

    /// @notice Retorna el piso para un tamaño de subcomité específico
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);

    // ─── Tipos ──────────────────────────────────────────────
    // Estos tipos DEBEN coincidir exactamente con los que la plataforma usa.
    // Si cambian del lado de Somnia, hay que actualizarlos aquí.

    enum ResponseStatus { None, Pending, Success, Failed, TimedOut }

    enum ConsensusType { Majority, Threshold }

    /// @dev Cada validador del subcomité produce un Response independiente.
    ///      response[0].result es el que se usa para decodificar la respuesta del LLM.
    struct Response {
        address validator;       // Dirección del validador que ejecutó el agente
        bytes result;            // Resultado ABI-encoded (ej. abi.encode("ALLOW"))
        ResponseStatus status;   // Success=2 significa que el agente terminó correctamente
        uint256 receipt;         // ID del receipt (para auditar vía endpoint HTTP)
        uint256 timestamp;       // Cuándo se completó
        uint256 executionCost;   // Costo real de ejecución reportado por el runner
    }

    /// @dev El struct Request contiene el estado completo del request.
    ///      En el callback, details.responses[] tiene las respuestas de todos los validadores.
    struct Request {
        uint256 id;
        address requester;
        address callbackAddress;
        bytes4 callbackSelector;
        address[] subcommittee;
        Response[] responses;
        uint256 responseCount;
        uint256 failureCount;
        uint256 threshold;
        uint256 createdAt;
        uint256 deadline;
        ResponseStatus status;
        ConsensusType consensusType;
        uint256 remainingBudget;
        uint256 perAgentBudget;
    }
}

/// @title IAgentRequesterHandler — Interfaz que DEBE implementar el contrato que recibe el callback
/// @notice ESTA FIRMA ES CRÍTICA. Si no coincide exactamente, el callback NUNCA llega.
/// @dev La plataforma calcula el selector como:
///      keccak256("handleResponse(uint256,(address,bytes,uint8,uint256,uint256,uint256)[],uint8,(uint256,address,address,bytes4,address[],(address,bytes,uint8,uint256,uint256,uint256)[],uint256,uint256,uint256,uint256,uint256,uint8,uint8,uint256,uint256))")
///
///      ERROR COMÚN (nos pasó): usar bytes[] en vez de Response[].
///      La firma con bytes[] genera un selector DIFERENTE → el callback nunca llega.
///      Este bug afectó a múltiples proyectos del Agentathon. Confirmado por el equipo de Somnia.
///
///      Los tipos Response, ResponseStatus y Request se referencian desde ISomniaAgents
///      porque están definidos dentro de esa interfaz.
interface IAgentRequesterHandler {
    /// @notice Callback invocado por la plataforma cuando un request se completa
    /// @param requestId ID del request retornado por createRequest
    /// @param responses Array de respuestas de cada validador del subcomité (default 3)
    ///        responses[0].result contiene el resultado ABI-encoded del primer validador.
    ///        Si hay consenso, los 3 responses tienen el mismo result.
    /// @param status Estado final del request: Success=2 (OK), Failed=3, TimedOut=4
    /// @param details Struct completo con los detalles del request (incluye todos los responses)
    function handleResponse(
        uint256 requestId,
        ISomniaAgents.Response[] memory responses,
        ISomniaAgents.ResponseStatus status,
        ISomniaAgents.Request memory details
    ) external;
}