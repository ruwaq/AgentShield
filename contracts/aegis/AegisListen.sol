// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisBrain} from "./AegisBrain.sol";

/// @title AegisListen — Reactividad inteligente on-chain
/// @notice Conecta eventos on-chain con pipelines de IA.
///         Cuando un evento ocurre → AegisBrain analiza → ejecuta acción.
///         Sin dependencia de la precompila 0x0100 (funciona con cualquier mecanismo
///         de reactividad o llamadas manuales).
/// @dev Hereda de AegisBrain. Los listeners son disparados por:
///      1. Contratos externos que llaman handleEvent()
///      2. Integración con SomniaEventHandler (0x0100) en contrato separado
///      3. El SDK off-chain vía WebSocket reactivity
contract AegisListen is AegisBrain {
    // ═══════════════════════════════════════════════════════════
    //                          TIPOS
    // ═══════════════════════════════════════════════════════════

    /// @notice Un listener que reacciona a eventos on-chain
    struct Listener {
        address target;             // Contrato a escuchar
        bytes32 eventSignature;     // Topic[0] del evento (keccak256 de la firma)
        bytes aiPipeline;           // AgentCall[] ABI-encoded
        string context;             // Prompt base para el pipeline
        bool active;                // true = escuchando
        uint256 triggerCount;       // Veces que se disparó
        uint256 createdAt;          // Timestamp de creación
        address owner;              // Quién lo creó
    }

    /// @notice Resultado de un trigger de listener
    struct TriggerResult {
        uint256 listenerId;
        uint256 pipelineId;
        uint256 timestamp;
        bytes eventData;
    }

    // ═══════════════════════════════════════════════════════════
    //                        ALMACENAMIENTO
    // ═══════════════════════════════════════════════════════════

    /// @notice Listeners registrados
    mapping(uint256 => Listener) public listeners;

    /// @notice Contador de listeners
    uint256 public nextListenerId = 1;

    /// @notice Resultados de triggers (histórico)
    mapping(uint256 => TriggerResult) public triggerResults;

    /// @notice Contador de triggers
    uint256 public nextTriggerId = 1;

    /// @notice Anti-recursión: evita que un listener se dispare a sí mismo
    mapping(uint256 => bool) internal _triggerLock;

    /// @notice Último trigger ID por listener (O(1) en lugar de loop)
    mapping(uint256 => uint256) public lastTriggerByListener;

    // ═══════════════════════════════════════════════════════════
    //                         EVENTOS
    // ═══════════════════════════════════════════════════════════

    event ListenerCreated(
        uint256 indexed listenerId,
        address indexed owner,
        address indexed target,
        bytes32 eventSignature
    );

    event ListenerTriggered(
        uint256 indexed listenerId,
        uint256 indexed pipelineId,
        bytes eventData
    );

    event ListenerStopped(
        uint256 indexed listenerId
    );

    // ═══════════════════════════════════════════════════════════
    //                         ERRORES
    // ═══════════════════════════════════════════════════════════

    error ListenerNotFound();
    error ListenerInactive();
    error NotListenerOwner();
    error RecursiveTrigger();
    error EmptyPipeline();

    // ═══════════════════════════════════════════════════════════
    //                       CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    constructor(
        address somniaAgentsPlatform,
        uint256 agentId
    ) AegisBrain(somniaAgentsPlatform, agentId) {}

    // ═══════════════════════════════════════════════════════════
    //                   REGISTRO DE LISTENERS
    // ═══════════════════════════════════════════════════════════

    /// @notice Crea un listener que dispara un pipeline de IA cuando ocurre un evento
    /// @dev El pipeline se define como AgentCall[] ABI-encoded.
    ///      Cuando el evento ocurre, el pipeline analiza el evento y decide la acción.
    /// @param target Contrato a escuchar (address(0) = cualquier contrato)
    /// @param eventSignature Topic[0] del evento (keccak256 de la firma)
    /// @param aiPipeline AgentCall[] ABI-encoded (usa abi.encode(agentCalls))
    /// @param context Prompt base para el pipeline de IA
    /// @return listenerId ID del listener creado
    function on(
        address target,
        bytes32 eventSignature,
        bytes memory aiPipeline,
        string memory context
    ) external returns (uint256 listenerId) {
        if (aiPipeline.length == 0) revert EmptyPipeline();

        listenerId = nextListenerId++;

        listeners[listenerId] = Listener({
            target: target,
            eventSignature: eventSignature,
            aiPipeline: aiPipeline,
            context: context,
            active: true,
            triggerCount: 0,
            createdAt: block.timestamp,
            owner: msg.sender
        });

        emit ListenerCreated(listenerId, msg.sender, target, eventSignature);
    }

    /// @notice Desactiva un listener
    function stop(uint256 listenerId) external {
        Listener storage listener = listeners[listenerId];
        if (listener.createdAt == 0) revert ListenerNotFound();
        if (listener.owner != msg.sender) revert NotListenerOwner();
        listener.active = false;
        emit ListenerStopped(listenerId);
    }

    // ═══════════════════════════════════════════════════════════
    //                   MANEJO DE EVENTOS
    // ═══════════════════════════════════════════════════════════

    /// @notice Dispara un listener manualmente con datos de un evento
    /// @dev Puede ser llamado por:
    ///      - Un contrato que hereda de SomniaEventHandler (vía _onEvent)
    ///      - El SDK off-chain (vía WebSocket reactivity)
    ///      - Cualquier EOA o contrato (para integraciones custom)
    /// @param listenerId ID del listener a disparar
    /// @param eventData Datos del evento (topics + data ABI-encoded)
    /// @return pipelineId ID del pipeline de IA iniciado
    function handleEvent(
        uint256 listenerId,
        bytes calldata eventData
    ) external returns (uint256 pipelineId) {
        Listener storage listener = listeners[listenerId];
        if (listener.createdAt == 0) revert ListenerNotFound();
        if (!listener.active) revert ListenerInactive();
        if (_triggerLock[listenerId]) revert RecursiveTrigger();

        // Anti-recursión: bloquear re-entrada para este listener
        _triggerLock[listenerId] = true;

        listener.triggerCount++;

        // Decodificar el pipeline guardado
        AgentCall[] memory agentCalls = abi.decode(listener.aiPipeline, (AgentCall[]));

        // Construir el prompt enriquecido con los datos del evento
        string memory enrichedContext = _buildEventContext(listener.context, eventData);

        // Iniciar el pipeline de IA
        pipelineId = thinkPipeline(enrichedContext, agentCalls);

        // Guardar resultado del trigger
        uint256 triggerId = nextTriggerId++;
        triggerResults[triggerId] = TriggerResult({
            listenerId: listenerId,
            pipelineId: pipelineId,
            timestamp: block.timestamp,
            eventData: eventData
        });
        lastTriggerByListener[listenerId] = triggerId;

        emit ListenerTriggered(listenerId, pipelineId, eventData);

        // Liberar lock
        _triggerLock[listenerId] = false;
    }

    // ═══════════════════════════════════════════════════════════
    //                   CONSULTAS
    // ═══════════════════════════════════════════════════════════

    /// @notice Obtiene todos los datos de un listener
    function getListener(uint256 listenerId) external view returns (Listener memory) {
        if (listeners[listenerId].createdAt == 0) revert ListenerNotFound();
        return listeners[listenerId];
    }

    /// @notice Obtiene el último trigger de un listener (O(1))
    /// @dev Usa el mapping lastTriggerByListener para acceso constante en lugar de loop O(n)
    function getLastTrigger(uint256 listenerId) external view returns (TriggerResult memory) {
        uint256 triggerId = lastTriggerByListener[listenerId];
        if (triggerId == 0) revert ListenerNotFound();
        return triggerResults[triggerId];
    }

    /// @notice Lista todos los listeners activos de un owner
    function getListenersByOwner(address owner) external view returns (uint256[] memory) {
        // Contar primero
        uint256 count;
        uint256 maxId = nextListenerId;
        for (uint256 i = 1; i < maxId; i++) {
            if (listeners[i].owner == owner && listeners[i].active) {
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        uint256 index;
        for (uint256 i = 1; i < maxId; i++) {
            if (listeners[i].owner == owner && listeners[i].active) {
                result[index++] = i;
            }
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════
    //                   HELPERS INTERNOS
    // ═══════════════════════════════════════════════════════════

    /// @notice Enriquece el contexto del pipeline con los datos del evento
    function _buildEventContext(
        string memory baseContext,
        bytes memory eventData
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            baseContext,
            " Event data (hex): 0x",
            _bytesToHex(eventData),
            ". Analyze this event and decide what action to take."
        ));
    }

    /// @notice Convierte bytes a hex string (limitado a 64 bytes para no gastar mucho gas)
    function _bytesToHex(bytes memory data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        uint256 len = data.length > 64 ? 64 : data.length; // Truncar a 64 bytes máximo
        bytes memory str = new bytes(len * 2);
        for (uint256 i = 0; i < len; i++) {
            str[i * 2] = alphabet[uint256(uint8(data[i])) >> 4];
            str[i * 2 + 1] = alphabet[uint256(uint8(data[i])) & 0x0f];
        }
        return string(str);
    }
}