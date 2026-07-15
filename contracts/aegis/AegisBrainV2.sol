// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISomniaAgents} from "../interfaces/ISomniaAgents.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StringUtils} from "../libraries/StringUtils.sol";

/// @title AegisBrainV2 — Natural Language Security Engine
/// @notice El usuario describe lo que quiere proteger en lenguaje natural.
///         El LLM arma el pipeline automáticamente, decide qué agentes usar,
///         y aprende de cada interacción.
/// @dev Zero-config: sin allowlists, sin selectores, sin políticas técnicas.
///      El usuario solo escribe: "Protégeme de estafas en DeFi"
contract AegisBrainV2 is ReentrancyGuard {
    // ═══════════════════════════════════════════════════════════
    //                          TIPOS
    // ═══════════════════════════════════════════════════════════

    /// @notice Resultado de una decisión de seguridad
    struct SecurityDecision {
        string verdict;         // ALLOW, WARN, BLOCK
        uint256 riskScore;      // 0-100
        string reasoning;       // Explicación en lenguaje natural
        string[] evidence;      // Evidencia recolectada (URLs, datos)
        uint256 timestamp;
        bytes32 memoryHash;     // Hash de la memoria guardada
    }

    /// @notice Perfil de seguridad de un usuario (NL policy)
    struct SecurityProfile {
        string naturalLanguagePolicy;  // ej. "Protégeme de estafas DeFi y no permitas transfers > 100 STT"
        uint256 createdAt;
        uint256 lastUpdated;
        uint256 decisionsMade;
        uint256 threatsBlocked;
        bool active;
    }

    /// @notice Paso de un pipeline auto-generado
    struct PipelineStep {
        uint256 agentId;        // Qué agente usar
        string agentType;       // "LLM", "PARSE", "JSON"
        string purpose;         // Qué hace este paso (generado por LLM)
        bytes payload;          // Payload ABI-encoded
    }

    /// @notice Estado de un análisis en curso
    struct AnalysisState {
        address owner;
        string intent;              // Qué quiere hacer el usuario
        PipelineStep[] steps;       // Pipeline auto-generado
        uint256 currentStep;
        bytes[] results;
        uint256 requestId;
        string[] evidenceCollected;
    }

    // ═══════════════════════════════════════════════════════════
    //                        ALMACENAMIENTO
    // ═══════════════════════════════════════════════════════════

    ISomniaAgents public immutable SOMNIA_AGENTS;
    uint256 public immutable LLM_AGENT_ID;

    /// @notice Dueño del contrato (para funciones administrativas restringidas)
    address public immutable OWNER;

    /// @notice Perfiles de seguridad por usuario
    mapping(address => SecurityProfile) public profiles;

    /// @notice Análisis en curso
    mapping(uint256 => AnalysisState) internal analyses;
    uint256 public nextAnalysisId = 1;

    /// @notice Historial de decisiones
    mapping(uint256 => SecurityDecision) public decisions;

    /// @notice Memoria persistente (key → datos)
    mapping(bytes32 => bytes) public memoryStore;

    /// @notice requestId → analysisId
    mapping(uint256 => uint256) internal requestToAnalysis;

    // ═══════════════════════════════════════════════════════════
    //                         EVENTOS
    // ═══════════════════════════════════════════════════════════

    event ProfileCreated(address indexed user, string policy);
    event AnalysisStarted(uint256 indexed analysisId, address indexed user, string intent);
    event EvidenceCollected(uint256 indexed analysisId, string source, string data);
    event DecisionMade(uint256 indexed analysisId, string verdict, uint256 riskScore);
    event MemoryStored(bytes32 indexed key, address indexed author);

    // ═══════════════════════════════════════════════════════════
    //                         ERRORES
    // ═══════════════════════════════════════════════════════════

    error UnauthorizedCallback();
    error AnalysisNotFound();
    error EmptyIntent();
    error InsufficientDeposit();
    error InsufficientContractBalance();
    error UnauthorizedAccess();

    // ═══════════════════════════════════════════════════════════
    //                       CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    constructor(address platform, uint256 agentId) {
        SOMNIA_AGENTS = ISomniaAgents(platform);
        LLM_AGENT_ID = agentId == 0 ? 12847293847561029384 : agentId;
        OWNER = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════
    //              NATURAL LANGUAGE POLICY ENGINE
    // ═══════════════════════════════════════════════════════════

    /// @notice Crea o actualiza un perfil de seguridad con lenguaje natural
    /// @dev Zero-config: el usuario escribe lo que quiere en sus propias palabras.
    ///      El LLM interpreta la política y la aplica en cada análisis.
    /// @param naturalLanguagePolicy Descripción en lenguaje natural de las reglas de seguridad
    ///        Ejemplos:
    ///        - "Protégeme de estafas DeFi, no permitas transfers > 100 STT"
    ///        - "Solo quiero interactuar con contratos verificados en Somnia"
    ///        - "Bloquea cualquier cosa que parezca un rug pull o phishing"
    function setSecurityProfile(
        string memory naturalLanguagePolicy
    ) external returns (uint256 profileId) {
        SecurityProfile storage profile = profiles[msg.sender];

        if (profile.createdAt == 0) {
            profile.createdAt = block.timestamp;
            emit ProfileCreated(msg.sender, naturalLanguagePolicy);
        }

        profile.naturalLanguagePolicy = naturalLanguagePolicy;
        profile.lastUpdated = block.timestamp;
        profile.active = true;

        return uint256(uint160(msg.sender));
    }

    // ═══════════════════════════════════════════════════════════
    //              AUTO-PIPELINE: ANALYZE INTENT
    // ═══════════════════════════════════════════════════════════

    /// @notice Analiza una intención en lenguaje natural y devuelve un veredicto de seguridad
    /// @dev El LLM automáticamente:
    ///      1. Interpreta la intención del usuario
    ///      2. Decide qué datos necesita (JSON API, Parse Website)
    ///      3. Recolecta evidencia
    ///      4. Emite un veredicto basado en la política NL del usuario
    /// @param intent Qué quiere hacer el usuario (ej. "Enviar 100 STT a 0x... para comprar un NFT")
    /// @return analysisId ID del análisis (resultado disponible vía callback)
    function analyze(
        string memory intent
    ) external payable nonReentrant returns (uint256 analysisId) {
        if (bytes(intent).length == 0) revert EmptyIntent();

        analysisId = nextAnalysisId++;
        AnalysisState storage state = analyses[analysisId];
        state.owner = msg.sender;
        state.intent = intent;

        emit AnalysisStarted(analysisId, msg.sender, intent);

        // Construir el prompt que le pide al LLM que analice la intención
        // contra la política NL del usuario
        string memory policy = profiles[msg.sender].naturalLanguagePolicy;
        string memory prompt = _buildAnalysisPrompt(intent, policy);

        // Paso 1: LLM analiza la intención contra la política
        string[] memory allowed = new string[](3);
        allowed[0] = "ALLOW";
        allowed[1] = "WARN";
        allowed[2] = "BLOCK";

        bytes memory payload = abi.encodeWithSignature(
            "inferString(string,string,bool,string[])",
            prompt,
            _systemPrompt(),
            true, // chainOfThought = true para mejor razonamiento
            allowed
        );

        uint256 deposit = SOMNIA_AGENTS.getRequestDeposit();
        if (address(this).balance < deposit) revert InsufficientContractBalance();

        uint256 requestId = SOMNIA_AGENTS.createRequest{value: deposit}(
            LLM_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );

        state.requestId = requestId;
        requestToAnalysis[requestId] = analysisId;
    }

    // ═══════════════════════════════════════════════════════════
    //              AUTO-PIPELINE: DEEP ANALYSIS
    // ═══════════════════════════════════════════════════════════

    /// @notice Análisis profundo: LLM + JSON API + Parse Website en secuencia
    /// @dev El LLM primero decide qué datos externos necesita, luego los recolecta,
    ///      y finalmente emite un veredicto informado.
    /// @param intent Qué quiere hacer el usuario
    /// @param targetAddress Dirección del contrato/destino a verificar
    /// @param valueWei Valor en wei de la operación
    /// @return analysisId ID del análisis
    function deepAnalyze(
        string memory intent,
        address targetAddress,
        uint256 valueWei
    ) external payable nonReentrant returns (uint256 analysisId) {
        if (bytes(intent).length == 0) revert EmptyIntent();

        analysisId = nextAnalysisId++;
        AnalysisState storage state = analyses[analysisId];
        state.owner = msg.sender;
        state.intent = intent;

        emit AnalysisStarted(analysisId, msg.sender, intent);

        string memory policy = profiles[msg.sender].naturalLanguagePolicy;

        // Paso 1: LLM decide qué investigar
        string memory investigationPrompt = string(abi.encodePacked(
            "A user wants to: ", intent, ". ",
            "Target address: ", StringUtils.addrToString(targetAddress), ". ",
            "Value: ", StringUtils.uintToString(valueWei), " wei. ",
            "Their security policy is: ", policy, ". ",
            "What external data would you need to make a security decision? ",
            "Respond with a JSON array of data sources needed. ",
            "Example: [\"check if address is a known scam\", \"verify contract age\", \"check token reputation\"]"
        ));

        // Iniciar con LLM para planificar la investigación
        bytes memory payload = abi.encodeWithSignature(
            "inferString(string,string,bool,string[])",
            investigationPrompt,
            "You are a security investigator. List what data you need to assess risk.",
            true,
            new string[](0) // sin restricciones — queremos su razonamiento completo
        );

        uint256 deposit = SOMNIA_AGENTS.getRequestDeposit();
        if (address(this).balance < deposit) revert InsufficientContractBalance();

        uint256 requestId = SOMNIA_AGENTS.createRequest{value: deposit}(
            LLM_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );

        state.requestId = requestId;
        requestToAnalysis[requestId] = analysisId;
    }

    // ═══════════════════════════════════════════════════════════
    //              FULFILL MANUAL (para testnet)
    // ═══════════════════════════════════════════════════════════

    /// @notice Completa manualmente un análisis con una respuesta simulada del LLM.
    /// @dev RESTRINGIDO al OWNER del contrato. Solo para testnet/demo.
    ///      En producción, el callback de Somnia llama a handleResponse.
    function fulfillManual(
        uint256 analysisId,
        string memory llmResponse
    ) external {
        if (msg.sender != OWNER) revert UnauthorizedAccess();
        AnalysisState storage state = analyses[analysisId];
        if (state.owner == address(0)) revert AnalysisNotFound();

        // Clasificar la respuesta
        (string memory verdict, uint256 riskScore, string memory reasoning) = _classifyResponse(llmResponse);

        // Guardar decisión
        SecurityDecision memory decision = SecurityDecision({
            verdict: verdict,
            riskScore: riskScore,
            reasoning: reasoning,
            evidence: state.evidenceCollected,
            timestamp: block.timestamp,
            memoryHash: _saveToMemory(analysisId, llmResponse)
        });

        decisions[analysisId] = decision;

        // Actualizar perfil
        SecurityProfile storage profile = profiles[state.owner];
        profile.decisionsMade++;
        if (keccak256(bytes(verdict)) == keccak256(bytes("BLOCK"))) {
            profile.threatsBlocked++;
        }

        emit DecisionMade(analysisId, verdict, riskScore);

        // Limpiar
        delete analyses[analysisId];
    }

    // ═══════════════════════════════════════════════════════════
    //              CALLBACK DE SOMNIA
    // ═══════════════════════════════════════════════════════════

    /// @notice Callback invocado por Somnia Agents cuando un request se completa.
    /// @dev Esta es la firma EXACTA que los validadores llaman. Si no coincide, el callback nunca llega.
    ///      Usa Response[] (struct), no bytes[] — esa era la causa del bug anterior.
    function handleResponse(
        uint256 requestId,
        ISomniaAgents.Response[] calldata responses,
        ISomniaAgents.ResponseStatus status,
        ISomniaAgents.Request calldata /* details */
    ) external {
        if (msg.sender != address(SOMNIA_AGENTS)) revert UnauthorizedCallback();

        uint256 analysisId = requestToAnalysis[requestId];
        if (analysisId == 0) return;

        AnalysisState storage state = analyses[analysisId];

        // Status Success = 2
        if (status != ISomniaAgents.ResponseStatus.Success || responses.length == 0) {
            // Falló — guardar como WARN por seguridad
            SecurityDecision memory fallbackDecision = SecurityDecision({
                verdict: "WARN",
                riskScore: 70,
                reasoning: "AI analysis unavailable. Defaulting to WARN for safety.",
                evidence: state.evidenceCollected,
                timestamp: block.timestamp,
                memoryHash: bytes32(0)
            });
            decisions[analysisId] = fallbackDecision;
            emit DecisionMade(analysisId, "WARN", 70);
            delete requestToAnalysis[requestId];
            delete analyses[analysisId];
            return;
        }

        // Decodificar respuesta del LLM desde el struct Response
        string memory llmResponse = abi.decode(responses[0].result, (string));

        // Clasificar la respuesta
        (string memory verdict, uint256 riskScore, string memory reasoning) = _classifyResponse(llmResponse);

        // Guardar decisión
        SecurityDecision memory decision = SecurityDecision({
            verdict: verdict,
            riskScore: riskScore,
            reasoning: reasoning,
            evidence: state.evidenceCollected,
            timestamp: block.timestamp,
            memoryHash: _saveToMemory(analysisId, llmResponse)
        });

        decisions[analysisId] = decision;

        // Actualizar perfil
        SecurityProfile storage profile = profiles[state.owner];
        profile.decisionsMade++;
        if (keccak256(bytes(verdict)) == keccak256(bytes("BLOCK"))) {
            profile.threatsBlocked++;
        }

        emit DecisionMade(analysisId, verdict, riskScore);

        // Limpiar
        delete requestToAnalysis[requestId];
        delete analyses[analysisId];
    }

    // ═══════════════════════════════════════════════════════════
    //              MEMORIA PERSISTENTE
    // ═══════════════════════════════════════════════════════════

    function remember(bytes32 key, bytes memory data) external returns (bytes32) {
        bytes32 hash = keccak256(data);
        memoryStore[key] = data;
        emit MemoryStored(key, msg.sender);
        return hash;
    }

    function recall(bytes32 key) external view returns (bytes memory) {
        return memoryStore[key];
    }

    // ═══════════════════════════════════════════════════════════
    //              CONSULTAS
    // ═══════════════════════════════════════════════════════════

    function getDecision(uint256 analysisId) external view returns (SecurityDecision memory) {
        return decisions[analysisId];
    }

    function getProfile(address user) external view returns (SecurityProfile memory) {
        return profiles[user];
    }

    function getStats(address user) external view returns (
        uint256 decisionsMade,
        uint256 threatsBlocked,
        string memory policy,
        bool active
    ) {
        SecurityProfile storage p = profiles[user];
        return (p.decisionsMade, p.threatsBlocked, p.naturalLanguagePolicy, p.active);
    }

    // ═══════════════════════════════════════════════════════════
    //              HELPERS INTERNOS
    // ═══════════════════════════════════════════════════════════

    function _buildAnalysisPrompt(
        string memory intent,
        string memory policy
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            "You are a blockchain security classifier. ",
            "A user wants to perform this action: \"", intent, "\". ",
            "Their security policy is: \"", policy, "\". ",
            "Analyze the intent against the policy. Consider: ",
            "1) Does this action violate the policy? ",
            "2) Are there known risks with the target address or contract? ",
            "3) Is the value amount reasonable? ",
            "4) Does the intent description match the action? ",
            "Return exactly one word: ALLOW, WARN, or BLOCK. ",
            "Then on a new line, provide a brief reasoning in natural language."
        ));
    }

    function _systemPrompt() internal pure returns (string memory) {
        return string(abi.encodePacked(
            "You are AEGIS, an autonomous security system for blockchain transactions. ",
            "You analyze user intents against their natural language security policies. ",
            "You are conservative: when in doubt, return WARN. ",
            "You explain your reasoning in simple, human-readable language. ",
            "You consider: DeFi risks, scam patterns, contract reputation, value anomalies, ",
            "and intent-action mismatches."
        ));
    }

    /// @notice Clasifica la respuesta del LLM usando keccak256 exact matching
    /// @dev A diferencia de substring matching, keccak256 es inmune a inyección.
    ///      Ej: "I recommend you BLOCK" y "This is NOT a BLOCK" son distinguibles.
    function _classifyResponse(
        string memory response
    ) internal pure returns (string memory verdict, uint256 riskScore, string memory reasoning) {
        bytes32 h = keccak256(bytes(response));

        // Intentar exact match primero (respuesta ideal del LLM)
        if (h == keccak256(bytes("ALLOW"))) return ("ALLOW", 20, response);
        if (h == keccak256(bytes("WARN"))) return ("WARN", 60, response);
        if (h == keccak256(bytes("BLOCK"))) return ("BLOCK", 90, response);

        // Fallback: buscar la primera línea (por si el LLM devuelve "ALLOW\nreasoning...")
        // Extraer primera palabra y comparar con keccak256
        bytes memory r = bytes(response);
        uint256 firstWordEnd = 0;
        for (uint256 i = 0; i < r.length; i++) {
            if (r[i] == "\n" || r[i] == " " || r[i] == "\r") {
                firstWordEnd = i;
                break;
            }
        }
        if (firstWordEnd > 0) {
            bytes memory firstWord = new bytes(firstWordEnd);
            for (uint256 i = 0; i < firstWordEnd; i++) {
                firstWord[i] = r[i];
            }
            bytes32 firstWordHash = keccak256(firstWord);
            if (firstWordHash == keccak256(bytes("ALLOW"))) return ("ALLOW", 20, response);
            if (firstWordHash == keccak256(bytes("WARN"))) return ("WARN", 60, response);
            if (firstWordHash == keccak256(bytes("BLOCK"))) return ("BLOCK", 90, response);
        }

        // Default: WARN (fail-safe)
        return ("WARN", 70, string(abi.encodePacked("Unclear response, defaulting to WARN: ", response)));
    }

    function _saveToMemory(uint256 analysisId, string memory data) internal returns (bytes32) {
        bytes32 key = keccak256(abi.encodePacked("decision", analysisId, block.timestamp));
        memoryStore[key] = bytes(data);
        return key;
    }

    receive() external payable {}
}