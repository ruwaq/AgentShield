// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISomniaAgents} from "../interfaces/ISomniaAgents.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StringUtils} from "../libraries/StringUtils.sol";

/// @title AegisBrain — Pipeline multi-agente on-chain para Somnia
/// @notice Capa de abstracción sobre Somnia Agents Platform que permite:
///         - Encadenar agentes en secuencia (thinkPipeline)
///         - Consenso multi-LLM (multiThink)
///         - LLM con herramientas on-chain (thinkWithTools)
///         - Memoria persistente entre llamadas (remember/recall)
/// @dev El pipeline es ASINCRÓNICO por naturaleza. Cada paso espera el callback de Somnia.
///      Hereda de este contrato y sobreescribe _onPipelineComplete() para recibir resultados.
contract AegisBrain is ReentrancyGuard {
    // ═══════════════════════════════════════════════════════════
    //                          TIPOS
    // ═══════════════════════════════════════════════════════════

    /// @notice Resultado de un pipeline o pensamiento individual
    struct Thought {
        string decision;        // "ALLOW", "WARN", "BLOCK" o string libre
        uint256 riskScore;      // 0-100 (solo relevante para security decisions)
        string reasoning;       // Explicación del LLM
        bytes[] agentResults;   // Resultado crudo de cada agente en el pipeline
        bytes32 memoryHash;     // keccak256 de la memoria guardada (0 si no se usó)
    }

    /// @notice Define un agente a invocar dentro de un pipeline
    struct AgentCall {
        uint256 agentId;        // ID del agente en Somnia (LLM, Parse, JSON API...)
        bytes payload;          // Payload ABI-encoded para el agente
        string resultLabel;     // Etiqueta para inyectar el resultado en el siguiente prompt
    }

    /// @notice Estado interno de un pipeline en ejecución
    struct PipelineState {
        address owner;              // Quién inició el pipeline
        AgentCall[] agentCalls;     // Lista de agentes a ejecutar
        uint256 currentStep;        // Índice del agente actual (0-based)
        bytes[] results;            // Resultados acumulados
        uint256 requestId;          // requestId actual en Somnia
        bool isMultiThink;          // true = multiThink, false = pipeline normal
        uint256 multiAgentCount;    // Número de agentes en multiThink
        uint256 multiThreshold;     // Umbral de consenso para multiThink
        string[] multiDecisions;    // Decisiones acumuladas en multiThink
    }

    /// @notice Herramienta on-chain para inferToolsChat
    struct OnchainTool {
        string signature;    // ej. "swap(address token, uint256 amount)"
        string description;  // Descripción legible para el LLM
    }

    // ═══════════════════════════════════════════════════════════
    //                        ALMACENAMIENTO
    // ═══════════════════════════════════════════════════════════

    /// @notice Plataforma de agentes de Somnia (testnet: 0x037B...C776)
    ISomniaAgents public immutable SOMNIA_AGENTS;

    /// @notice ID del agente LLM por defecto (12847293847561029384)
    uint256 public immutable LLM_AGENT_ID;

    /// @notice Contador de pipelines (usado como ID único)
    uint256 public nextPipelineId = 1;

    /// @notice Pipelines activos (en espera de callback)
    mapping(uint256 => PipelineState) internal pipelines;

    /// @notice Mapping inverso: requestId → pipelineId (para búsqueda O(1) en callbacks)
    mapping(uint256 => uint256) internal requestToPipeline;

    /// @notice Memoria persistente: key → datos
    mapping(bytes32 => bytes) public memoryStore;

    /// @notice Resultados de pipelines completados (para consulta histórica)
    mapping(uint256 => Thought) public pipelineResults;

    // ═══════════════════════════════════════════════════════════
    //                         EVENTOS
    // ═══════════════════════════════════════════════════════════

    event PipelineStarted(
        uint256 indexed pipelineId,
        address indexed owner,
        uint256 agentCount,
        bool isMultiThink
    );

    event PipelineStepCompleted(
        uint256 indexed pipelineId,
        uint256 step,
        uint256 agentId,
        bytes result
    );

    event PipelineCompleted(
        uint256 indexed pipelineId,
        Thought thought
    );

    event PipelineFailed(
        uint256 indexed pipelineId,
        uint256 failedStep,
        string reason
    );

    event MemoryStored(
        bytes32 indexed key,
        address indexed author
    );

    // ═══════════════════════════════════════════════════════════
    //                         ERRORES
    // ═══════════════════════════════════════════════════════════

    error UnauthorizedCallback();
    error PipelineNotFound();
    error PipelineAlreadyComplete();
    error EmptyAgentCalls();
    error InvalidConsensusParams();
    error InvalidDeposit();
    error InsufficientContractBalance();

    // ═══════════════════════════════════════════════════════════
    //                       CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    constructor(address somniaAgentsPlatform, uint256 agentId) {
        SOMNIA_AGENTS = ISomniaAgents(somniaAgentsPlatform);
        // Si no se especifica agentId, usar el LLM Agent ID verificado on-chain
        LLM_AGENT_ID = agentId == 0 ? 12847293847561029384 : agentId;
    }

    // ═══════════════════════════════════════════════════════════
    //                   PIPELINE MULTI-AGENTE
    // ═══════════════════════════════════════════════════════════

    /// @notice Inicia un pipeline secuencial de agentes
    /// @dev Cada agente recibe el resultado del anterior en su prompt.
    ///      El pipeline avanza un paso por callback de Somnia.
    ///      El resultado final se entrega vía _onPipelineComplete().
    /// @param context Prompt inicial (describe la tarea a resolver)
    /// @param agentCalls Lista de agentes a ejecutar en orden
    /// @return pipelineId ID del pipeline (para tracking)
    function thinkPipeline(
        string memory context,
        AgentCall[] memory agentCalls
    ) public payable nonReentrant returns (uint256 pipelineId) {
        if (agentCalls.length == 0) revert EmptyAgentCalls();

        pipelineId = nextPipelineId++;

        // Guardar estado del pipeline
        PipelineState storage state = pipelines[pipelineId];
        state.owner = msg.sender;
        state.currentStep = 0;

        // Copiar los agentCalls al storage (no se puede guardar memory en storage directamente)
        for (uint256 i = 0; i < agentCalls.length; i++) {
            state.agentCalls.push(agentCalls[i]);
        }

        emit PipelineStarted(pipelineId, msg.sender, agentCalls.length, false);

        // Iniciar el primer paso: el prompt es el context + payload del primer agente
        _executeStep(pipelineId, context);
    }

    // ═══════════════════════════════════════════════════════════
    //                   CONSENSO MULTI-LLM
    // ═══════════════════════════════════════════════════════════

    /// @notice Ejecuta N agentes LLM en paralelo y aplica consenso por mayoría
    /// @dev Cada agente analiza el mismo prompt independientemente.
    ///      El consenso se calcula cuando todas las respuestas llegan.
    ///      Umbral típico: 2/3 para 3 agentes, 3/5 para 5 agentes.
    /// @param prompt La pregunta a analizar
    /// @param agentCount Cuántos agentes LLM consultar (3, 5, 7...)
    /// @param consensusThreshold Mínimo de votos iguales para consenso
    /// @return pipelineId ID del pipeline multi-think
    function multiThink(
        string memory prompt,
        uint256 agentCount,
        uint256 consensusThreshold
    ) public payable nonReentrant returns (uint256 pipelineId) {
        if (agentCount < 3 || consensusThreshold > agentCount || consensusThreshold < 2) {
            revert InvalidConsensusParams();
        }

        pipelineId = nextPipelineId++;

        PipelineState storage state = pipelines[pipelineId];
        state.owner = msg.sender;
        state.isMultiThink = true;
        state.multiAgentCount = agentCount;
        state.multiThreshold = consensusThreshold;

        emit PipelineStarted(pipelineId, msg.sender, agentCount, true);

        // Disparar todos los agentes en paralelo
        // Cada uno usa el mismo prompt pero es un request independiente
        for (uint256 i = 0; i < agentCount; i++) {
            _executeMultiThinkAgent(pipelineId, i, prompt);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //                 TOOL-USE (inferToolsChat)
    // ═══════════════════════════════════════════════════════════

    /// @notice Permite al LLM usar herramientas on-chain (inferToolsChat)
    /// @dev El LLM puede decidir llamar otros smart contracts.
    ///      El patrón Yield & Resume se maneja internamente.
    ///      Solo soporta 1 iteración de tool-use en MVP.
    /// @param prompt La tarea a resolver
    /// @param tools Herramientas disponibles para el LLM
    /// @param maxIterations Máximo de iteraciones del bucle tool-use
    /// @return pipelineId ID del pipeline
    function thinkWithTools(
        string memory prompt,
        OnchainTool[] memory tools,
        uint256 maxIterations
    ) public payable nonReentrant returns (uint256 pipelineId) {
        if (tools.length == 0) revert EmptyAgentCalls();

        pipelineId = nextPipelineId++;

        // Construir el payload para inferToolsChat
        // Formato: inferToolsChat(string[] roles, string[] messages, string[] mcpUrls,
        //                       OnchainTool[] tools, uint256 maxIterations, bool chainOfThought)
        string[] memory roles = new string[](1);
        roles[0] = "user";
        string[] memory messages = new string[](1);
        messages[0] = prompt;
        string[] memory mcpUrls = new string[](0);

        bytes memory payload = abi.encodeWithSignature(
            "inferToolsChat(string[],string[],string[],(string,string)[],uint256,bool)",
            roles,
            messages,
            mcpUrls,
            tools,
            maxIterations,
            false // chainOfThought = false para MVP
        );

        // Guardar estado mínimo
        PipelineState storage state = pipelines[pipelineId];
        state.owner = msg.sender;
        state.isMultiThink = false;

        emit PipelineStarted(pipelineId, msg.sender, 1, false);

        // Ejecutar el request
        uint256 deposit = SOMNIA_AGENTS.getRequestDeposit();
        if (address(this).balance < deposit) revert InsufficientContractBalance();
        uint256 requestId = SOMNIA_AGENTS.createRequest{value: deposit}(
            LLM_AGENT_ID,
            address(this),
            this.handleAgentResponse.selector,
            payload
        );
        state.requestId = requestId;
        requestToPipeline[requestId] = pipelineId;
    }

    // ═══════════════════════════════════════════════════════════
    //                     MEMORIA PERSISTENTE
    // ═══════════════════════════════════════════════════════════

    /// @notice Guarda datos en memoria persistente
    /// @param key Clave para recuperar los datos después
    /// @param data Datos a guardar (puede ser ABI-encoded)
    /// @return memoryHash keccak256 de los datos guardados
    function remember(bytes32 key, bytes memory data) external returns (bytes32 memoryHash) {
        memoryHash = keccak256(data);
        memoryStore[key] = data;
        emit MemoryStored(key, msg.sender);
    }

    /// @notice Recupera datos de memoria persistente
    /// @param key Clave de los datos
    /// @return data Los datos guardados (bytes vacío si no existe)
    function recall(bytes32 key) external view returns (bytes memory data) {
        return memoryStore[key];
    }

    // ═══════════════════════════════════════════════════════════
    //              CALLBACK DE SOMNIA (INTERNO)
    // ═══════════════════════════════════════════════════════════

    /// @notice Callback que recibe las respuestas de la plataforma Somnia
    /// @dev SOLO la plataforma puede llamar esta función.
    ///      Es el motor que impulsa cada paso del pipeline.
    ///      Los contratos que heredan NO deben sobreescribir esta función.
    ///      En su lugar, sobreescribir _onPipelineComplete().
    function handleAgentResponse(
        uint256 requestId,
        bytes[] calldata responses,
        uint8 status,
        bytes calldata /* details */
    ) external {
        // Verificación de seguridad: solo la plataforma de Somnia puede llamar
        if (msg.sender != address(SOMNIA_AGENTS)) revert UnauthorizedCallback();

        // Buscar el pipeline asociado a este requestId
        // Recorremos los pipelines activos (en MVP, el requestId se guarda en el estado)
        uint256 pipelineId = _findPipelineByRequestId(requestId);
        if (pipelineId == 0) return; // No es nuestro request, ignorar silenciosamente

        PipelineState storage state = pipelines[pipelineId];

        // Status 2 = Success (ResponseStatus.Success)
        if (status != 2 || responses.length == 0) {
            // El agente falló — registrar y abortar pipeline
            emit PipelineFailed(pipelineId, state.currentStep, "Agent response failed or timed out");
            delete requestToPipeline[requestId];
            delete pipelines[pipelineId];
            return;
        }

        // Decodificar la respuesta del agente
        bytes memory result = responses[0];

        if (state.isMultiThink) {
            _handleMultiThinkResponse(pipelineId, result);
        } else {
            _handlePipelineStep(pipelineId, result);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //                 LÓGICA INTERNA DEL PIPELINE
    // ═══════════════════════════════════════════════════════════

    /// @notice Ejecuta un paso del pipeline: envía el request al agente actual
    /// @param pipelineId ID del pipeline
    /// @param enrichedPrompt Prompt enriquecido con resultados de pasos anteriores
    function _executeStep(uint256 pipelineId, string memory enrichedPrompt) internal {
        PipelineState storage state = pipelines[pipelineId];
        AgentCall memory call = state.agentCalls[state.currentStep];

        // Construir el payload para el agente
        // Asumimos inferString como método por defecto para agentes LLM
        // Para otros agentes (Parse, JSON API), el payload ya viene codificado en AgentCall
        bytes memory payload;
        if (call.payload.length == 0) {
            // Sin payload explícito → usar inferString con el prompt enriquecido
            string[] memory allowed = new string[](0); // sin restricciones
            payload = abi.encodeWithSignature(
                "inferString(string,string,bool,string[])",
                enrichedPrompt,
                "You are an AI agent in a multi-agent pipeline. Respond concisely.",
                false, // chainOfThought
                allowed
            );
        } else {
            // Payload ya codificado por el caller
            payload = call.payload;
        }

        // Enviar request a Somnia
        // Usar el balance del contrato para pagar el depósito
        // (funciona tanto para llamadas externas con msg.value como internas)
        uint256 deposit = SOMNIA_AGENTS.getRequestDeposit();
        if (address(this).balance < deposit) revert InsufficientContractBalance();
        uint256 requestId = SOMNIA_AGENTS.createRequest{value: deposit}(
            call.agentId,
            address(this),
            this.handleAgentResponse.selector,
            payload
        );

        state.requestId = requestId;
        requestToPipeline[requestId] = pipelineId;
    }

    /// @notice Maneja la respuesta de un paso del pipeline secuencial
    function _handlePipelineStep(uint256 pipelineId, bytes memory result) internal {
        PipelineState storage state = pipelines[pipelineId];

        // Guardar resultado de este paso
        state.results.push(result);

        emit PipelineStepCompleted(pipelineId, state.currentStep, state.agentCalls[state.currentStep].agentId, result);

        // Avanzar al siguiente paso
        state.currentStep++;

        if (state.currentStep >= state.agentCalls.length) {
            // Pipeline completo — construir Thought y notificar
            Thought memory thought = _buildThought(state);
            pipelineResults[pipelineId] = thought;
            emit PipelineCompleted(pipelineId, thought);

            // Hook para contratos que heredan
            _onPipelineComplete(pipelineId, thought);

            // Limpiar estado y mappings
            delete requestToPipeline[state.requestId];
            delete pipelines[pipelineId];
        } else {
            // Siguiente paso: enriquecer el prompt con el resultado actual
            string memory enrichedPrompt = _buildEnrichedPrompt(state);
            _executeStep(pipelineId, enrichedPrompt);
        }
    }

    /// @notice Dispara un agente individual para multiThink
    function _executeMultiThinkAgent(uint256 pipelineId, uint256 agentIndex, string memory prompt) internal {
        string[] memory allowed = new string[](3);
        allowed[0] = "ALLOW";
        allowed[1] = "WARN";
        allowed[2] = "BLOCK";

        bytes memory payload = abi.encodeWithSignature(
            "inferString(string,string,bool,string[])",
            prompt,
            "You are a security classifier. Return exactly one token: ALLOW, WARN, or BLOCK.",
            false,
            allowed
        );

        uint256 deposit = SOMNIA_AGENTS.getRequestDeposit();
        if (address(this).balance < deposit) revert InsufficientContractBalance();
        uint256 requestId = SOMNIA_AGENTS.createRequest{value: deposit}(
            LLM_AGENT_ID,
            address(this),
            this.handleAgentResponse.selector,
            payload
        );

        // Guardar el requestId en el estado y en el mapping inverso
        pipelines[pipelineId].requestId = requestId;
        requestToPipeline[requestId] = pipelineId;
    }

    /// @notice Maneja una respuesta de multiThink
    function _handleMultiThinkResponse(uint256 pipelineId, bytes memory result) internal {
        PipelineState storage state = pipelines[pipelineId];

        // Decodificar la decisión del agente
        string memory decision = abi.decode(result, (string));

        state.multiDecisions.push(decision);
        state.results.push(result);

        // ¿Ya respondieron todos?
        if (state.multiDecisions.length >= state.multiAgentCount) {
            // Calcular consenso
            (string memory consensusDecision, uint256 voteCount) = _calculateConsensus(state.multiDecisions);

            Thought memory thought = Thought({
                decision: voteCount >= state.multiThreshold ? consensusDecision : "WARN",
                riskScore: voteCount >= state.multiThreshold ? _consensusRiskScore(consensusDecision) : 70,
                reasoning: string(abi.encodePacked(
                    "Multi-think consensus: ",
                    consensusDecision,
                    " (",
                    StringUtils.uintToString(voteCount),
                    "/",
                    StringUtils.uintToString(state.multiAgentCount),
                    " votes)"
                )),
                agentResults: state.results,
                memoryHash: bytes32(0)
            });

            pipelineResults[pipelineId] = thought;
            emit PipelineCompleted(pipelineId, thought);
            _onPipelineComplete(pipelineId, thought);
            delete requestToPipeline[state.requestId];
            delete pipelines[pipelineId];
        }
        // Si no, esperar más respuestas (el callback llegará para cada agente)
    }

    // ═══════════════════════════════════════════════════════════
    //                     HELPERS INTERNOS
    // ═══════════════════════════════════════════════════════════

    /// @notice Construye el Thought final a partir del estado del pipeline
    function _buildThought(PipelineState storage state) internal view returns (Thought memory) {
        // El último resultado es la decisión final
        bytes memory lastResult = state.results[state.results.length - 1];

        // Intentar decodificar como string (inferString)
        string memory finalDecision = _safeDecodeString(lastResult);

        return Thought({
            decision: finalDecision,
            riskScore: 0, // El pipeline no necesariamente es de seguridad
            reasoning: string(abi.encodePacked(
                "Pipeline of ",
                StringUtils.uintToString(state.agentCalls.length),
                " agents completed"
            )),
            agentResults: state.results,
            memoryHash: bytes32(0)
        });
    }

    /// @notice Enriquece el prompt con resultados de pasos anteriores
    function _buildEnrichedPrompt(PipelineState storage state) internal view returns (string memory) {
        // El último resultado se inyecta en el contexto para el siguiente agente
        string memory lastResult = _safeDecodeString(state.results[state.results.length - 1]);
        string memory label = state.agentCalls[state.currentStep].resultLabel;

        return string(abi.encodePacked(
            "Previous agent result",
            bytes(label).length > 0 ? string(abi.encodePacked(" (", label, ")")) : "",
            ": ",
            lastResult
        ));
    }

    /// @notice Calcula el consenso entre múltiples decisiones
    function _calculateConsensus(string[] memory decisions)
        internal
        pure
        returns (string memory winner, uint256 maxVotes)
    {
        // Contar votos para cada decisión única
        for (uint256 i = 0; i < decisions.length; i++) {
            uint256 count = 1;
            for (uint256 j = i + 1; j < decisions.length; j++) {
                if (keccak256(bytes(decisions[i])) == keccak256(bytes(decisions[j]))) {
                    count++;
                }
            }
            if (count > maxVotes) {
                maxVotes = count;
                winner = decisions[i];
            }
        }
    }

    /// @notice Convierte decisión de consenso a risk score
    function _consensusRiskScore(string memory decision) internal pure returns (uint256) {
        bytes32 h = keccak256(bytes(decision));
        if (h == keccak256(bytes("ALLOW"))) return 20;
        if (h == keccak256(bytes("BLOCK"))) return 95;
        return 60; // WARN o cualquier otra cosa
    }

    /// @notice Decodifica bytes a string de forma segura (no revierte si falla)
    function _safeDecodeString(bytes memory data) internal view returns (string memory) {
        // Si los datos empiezan con el offset de string ABI (32 bytes), decodificar
        if (data.length >= 32) {
            try this._dummyDecode(data) returns (string memory decoded) {
                return decoded;
            } catch {
                return string(data);
            }
        }
        return string(data);
    }

    /// @notice Helper para decodificación segura (necesario por cómo funciona try/catch en Solidity)
    function _dummyDecode(bytes memory data) external pure returns (string memory) {
        return abi.decode(data, (string));
    }

    /// @notice Encuentra el pipelineId asociado a un requestId (O(1))
    function _findPipelineByRequestId(uint256 requestId) internal view returns (uint256) {
        return requestToPipeline[requestId];
    }

    // ═══════════════════════════════════════════════════════════
    //                    HOOKS PARA HERENCIA
    // ═══════════════════════════════════════════════════════════

    /// @notice Hook llamado cuando un pipeline se completa exitosamente
    /// @dev SOBREESCRIBE esta función en tu contrato para recibir resultados.
    ///      NO sobreescribas handleAgentResponse — ese es el motor interno.
    /// @param pipelineId ID del pipeline completado
    /// @param thought Resultado final del pipeline
    function _onPipelineComplete(uint256 pipelineId, Thought memory thought) internal virtual {
        // Por defecto no hace nada — los contratos que heredan lo sobreescriben
        // Suprimir warnings de variables no usadas
        pipelineId;
        thought;
    }

    // ═══════════════════════════════════════════════════════════
    //                       RECEIVE ETH
    // ═══════════════════════════════════════════════════════════

    /// @notice Recibir ETH para financiar requests de agentes
    receive() external payable {}
}