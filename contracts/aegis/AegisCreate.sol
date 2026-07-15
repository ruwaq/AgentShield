// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AegisBrain} from "./AegisBrain.sol";
import {StringUtils} from "../libraries/StringUtils.sol";

/// @title AegisCreate — NFTs con alma de IA que evolucionan
/// @notice Cada guardián es un NFT ERC-721 con personalidad única generada por LLM.
///         Evoluciona con cada interacción: gana niveles, traits y "cicatrices de batalla".
///         La metadata (tokenURI) es 100% on-chain, generada dinámicamente.
/// @dev Hereda de AegisBrain para usar el pipeline de IA en la generación de personalidad.
///      El mint es asincrónico: minteas → LLM genera alma → NFT queda revelado.
contract AegisCreate is ERC721, AegisBrain {
    // ═══════════════════════════════════════════════════════════
    //                          TIPOS
    // ═══════════════════════════════════════════════════════════

    /// @notice El alma de un guardián — su personalidad, historia y estado
    struct Soul {
        string name;                // Nombre del guardián
        string archetype;           // "dragon", "knight", "phoenix", "fox"...
        string personality;         // Personalidad generada por LLM
        string visualTraits;        // Rasgos visuales (para renderizado)
        uint256 level;              // Nivel actual (empieza en 1)
        uint256 experience;         // Experiencia acumulada
        uint256 battlesWon;         // Interacciones donde protegió exitosamente
        uint256 battlesTotal;       // Total de interacciones
        uint256 createdAt;          // Timestamp de creación
        uint256 lastEvolvedAt;      // Última evolución
        string[] battleScars;       // Cicatrices de batalla (memorias)
        bool revealed;              // true cuando el LLM generó la personalidad
    }

    // ═══════════════════════════════════════════════════════════
    //                        ALMACENAMIENTO
    // ═══════════════════════════════════════════════════════════

    /// @notice Almas de los guardianes (tokenId → Soul)
    mapping(uint256 => Soul) public souls;

    /// @notice Contador de tokens
    uint256 public nextTokenId = 1;

    /// @notice Pipeline ID → tokenId (para revelar después del callback del LLM)
    mapping(uint256 => uint256) public revelationPipelines;

    /// @notice Precio base del mint (cubre el costo del LLM)
    uint256 public mintPrice = 0.05 ether;

    /// @notice Owner del contrato (para withdraw y ajustes)
    address public contractOwner;

    /// @notice Contratos autorizados para llamar recordBattle (ej. AegisListen)
    mapping(address => bool) public authorizedCallers;

    // ═══════════════════════════════════════════════════════════
    //                         EVENTOS
    // ═══════════════════════════════════════════════════════════

    event GuardianMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string name,
        string archetype
    );

    event GuardianRevealed(
        uint256 indexed tokenId,
        string personality,
        string visualTraits
    );

    event GuardianEvolved(
        uint256 indexed tokenId,
        uint256 newLevel,
        string scar
    );

    event BattleRecorded(
        uint256 indexed tokenId,
        bool victory,
        string memoryText
    );

    event AuthorizedCallerUpdated(
        address indexed caller,
        bool authorized
    );

    // ═══════════════════════════════════════════════════════════
    //                         ERRORES
    // ═══════════════════════════════════════════════════════════

    error InsufficientPayment();
    error TokenNotFound();
    error NotTokenOwner();
    error AlreadyRevealed();
    error NotContractOwner();
    error UnauthorizedCaller();

    // ═══════════════════════════════════════════════════════════
    //                       CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    constructor(
        address somniaAgentsPlatform,
        uint256 agentId
    )
        ERC721("Aegis Guardian", "AEGIS")
        AegisBrain(somniaAgentsPlatform, agentId)
    {
        contractOwner = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════
    //                     MINT DE GUARDIÁN
    // ═══════════════════════════════════════════════════════════

    /// @notice Mintea un nuevo guardián. El LLM generará su personalidad.
    /// @dev El mint es en 2 pasos:
    ///      1. Esta función mintea el NFT (sin revelar) e inicia el pipeline de IA
    ///      2. Cuando el LLM responde, _onPipelineComplete revela la personalidad
    /// @param name Nombre del guardián (ej. "Magnus")
    /// @param archetype Arquetipo (ej. "ancient-dragon", "void-knight", "phoenix")
    /// @return tokenId ID del NFT minteado
    function mintGuardian(
        string memory name,
        string memory archetype
    ) external payable returns (uint256 tokenId) {
        if (msg.value < mintPrice) revert InsufficientPayment();

        tokenId = nextTokenId++;

        // Mintear el NFT al comprador (aún no revelado)
        _safeMint(msg.sender, tokenId);

        // Crear el alma inicial (sin revelar)
        Soul storage soul = souls[tokenId];
        soul.name = name;
        soul.archetype = archetype;
        soul.level = 1;
        soul.experience = 0;
        soul.createdAt = block.timestamp;
        soul.lastEvolvedAt = block.timestamp;
        soul.revealed = false;

        emit GuardianMinted(tokenId, msg.sender, name, archetype);

        // Iniciar pipeline de IA para generar la personalidad
        // Paso 1: LLM genera la personalidad base
        // Paso 2: LLM genera los traits visuales
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](2);
        calls[0] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""), // Usar inferString por defecto
            resultLabel: "personality"
        });
        calls[1] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""),
            resultLabel: "visualTraits"
        });

        // El prompt inicial describe la tarea de generación de personalidad
        string memory context = _buildCreationPrompt(name, archetype);

        // El ETH ya está en el contrato (vía mintPrice). thinkPipeline lo usará.
        uint256 pipelineId = thinkPipeline(context, calls);
        revelationPipelines[pipelineId] = tokenId;
    }

    // ═══════════════════════════════════════════════════════════
    //                   EVOLUCIÓN DEL GUARDIÁN
    // ═══════════════════════════════════════════════════════════

    /// @notice Registra una batalla/protección y hace evolucionar al guardián
    /// @dev RESTRINGIDO: solo el contractOwner o contratos autorizados (ej. AegisListen)
    ///      pueden llamar esta función. Esto evita que cualquier persona suba de nivel
    ///      guardianes NFT de manera ilimitada.
    /// @param tokenId ID del guardián
    /// @param victory true si el guardián protegió exitosamente
    /// @param memoryText Descripción de lo ocurrido (se guarda como cicatriz)
    function recordBattle(
        uint256 tokenId,
        bool victory,
        string memory memoryText
    ) external returns (uint256 newLevel) {
        if (msg.sender != contractOwner && !authorizedCallers[msg.sender]) {
            revert UnauthorizedCaller();
        }
        Soul storage soul = souls[tokenId];
        if (soul.createdAt == 0) revert TokenNotFound();

        soul.battlesTotal++;
        if (victory) {
            soul.battlesWon++;
        }
        soul.experience += victory ? 10 : 2;

        // Guardar memoria como cicatriz de batalla
        soul.battleScars.push(memoryText);

        emit BattleRecorded(tokenId, victory, memoryText);

        // ¿Evoluciona? Cada 5 batallas totales = 1 nivel
        newLevel = soul.level;
        if (soul.battlesTotal % 5 == 0 && soul.battlesTotal > 0) {
            soul.level++;
            soul.lastEvolvedAt = block.timestamp;
            newLevel = soul.level;

            emit GuardianEvolved(tokenId, newLevel, memoryText);
        }
    }

    /// @notice Evolución manual (para eventos especiales, no solo batallas)
    /// @param tokenId ID del guardián
    /// @param eventDescription Descripción del evento que dispara la evolución
    /// @return newLevel Nuevo nivel después de evolucionar
    function evolve(
        uint256 tokenId,
        string memory eventDescription
    ) external returns (uint256 newLevel) {
        Soul storage soul = souls[tokenId];
        if (soul.createdAt == 0) revert TokenNotFound();
        // Solo el owner del NFT o el contrato mismo puede evolucionar
        if (msg.sender != ownerOf(tokenId) && msg.sender != address(this)) {
            revert NotTokenOwner();
        }

        soul.level++;
        soul.lastEvolvedAt = block.timestamp;
        soul.battleScars.push(eventDescription);
        newLevel = soul.level;

        emit GuardianEvolved(tokenId, newLevel, eventDescription);
    }

    // ═══════════════════════════════════════════════════════════
    //                   METADATA ON-CHAIN
    // ═══════════════════════════════════════════════════════════

    /// @notice Genera el tokenURI 100% on-chain con metadata dinámica
    /// @dev Formato: data:application/json;base64,...
    ///      La metadata refleja el estado actual del guardián (nivel, traits, cicatrices)
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        Soul storage soul = souls[tokenId];
        if (soul.createdAt == 0) revert TokenNotFound();

        // Construir atributos dinámicos
        string memory attributes = _buildAttributes(soul);

        // Construir JSON de metadata
        string memory json = string(abi.encodePacked(
            '{"name":"', soul.name, '","description":"',
            soul.revealed ? soul.personality : 'A guardian spirit yet to be awakened...',
            '","image":"', _generateImageUrl(soul),
            '","attributes":[',
            attributes,
            ']}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            _base64Encode(bytes(json))
        ));
    }

    // ═══════════════════════════════════════════════════════════
    //                   HOOK DE PIPELINE (INTERNO)
    // ═══════════════════════════════════════════════════════════

    /// @notice Hook llamado cuando el pipeline de creación termina
    /// @dev Revela la personalidad del guardián con el resultado del LLM
    function _onPipelineComplete(
        uint256 pipelineId,
        Thought memory thought
    ) internal override {
        // Primero llamar al hook padre (AegisBrain)
        super._onPipelineComplete(pipelineId, thought);

        // Verificar si este pipeline es una revelación de guardián
        uint256 tokenId = revelationPipelines[pipelineId];
        if (tokenId == 0) return; // No es un pipeline de creación

        Soul storage soul = souls[tokenId];
        if (soul.revealed) revert AlreadyRevealed();

        // El primer resultado del agente es la personalidad
        if (thought.agentResults.length >= 1) {
            soul.personality = _safeDecodeString(thought.agentResults[0]);
        }
        // El segundo resultado son los traits visuales
        if (thought.agentResults.length >= 2) {
            soul.visualTraits = _safeDecodeString(thought.agentResults[1]);
        }

        soul.revealed = true;

        emit GuardianRevealed(tokenId, soul.personality, soul.visualTraits);

        // Limpiar el mapping
        delete revelationPipelines[pipelineId];
    }

    // ═══════════════════════════════════════════════════════════
    //                   HELPERS INTERNOS
    // ═══════════════════════════════════════════════════════════

    /// @notice Construye el prompt para que el LLM genere la personalidad
    function _buildCreationPrompt(
        string memory name,
        string memory archetype
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            "You are a guardian spirit creator. Create a unique personality for a guardian named '",
            name,
            "' of archetype '",
            archetype,
            "'. Describe their personality, voice, and backstory in 2-3 sentences. ",
            "Be creative and varied. No two guardians should sound alike. ",
            "Use epic, mythical language."
        ));
    }

    /// @notice Construye los atributos JSON para la metadata
    function _buildAttributes(Soul storage soul) internal view returns (string memory) {
        return string(abi.encodePacked(
            '{"trait_type":"Archetype","value":"', soul.archetype, '"},',
            '{"trait_type":"Level","value":', StringUtils.uintToString(soul.level), '},',
            '{"trait_type":"Experience","value":', StringUtils.uintToString(soul.experience), '},',
            '{"trait_type":"Battles Won","value":', StringUtils.uintToString(soul.battlesWon), '},',
            '{"trait_type":"Battles Total","value":', StringUtils.uintToString(soul.battlesTotal), '},',
            '{"trait_type":"Battle Scars","value":', StringUtils.uintToString(soul.battleScars.length), '},',
            '{"trait_type":"Revealed","value":"', soul.revealed ? "true" : "false", '"}'
        ));
    }

    /// @notice Genera una URL de imagen basada en los traits del guardián
    /// @dev En MVP usamos un placeholder con query params. En producción,
    ///      esto apuntaría a un servicio de generación de imágenes por IA.
    function _generateImageUrl(Soul storage soul) internal view returns (string memory) {
        return string(abi.encodePacked(
            "https://aegis-guardians.vercel.app/api/image?",
            "name=", soul.name,
            "&archetype=", soul.archetype,
            "&level=", StringUtils.uintToString(soul.level),
            "&scars=", StringUtils.uintToString(soul.battleScars.length),
            "&revealed=", soul.revealed ? "true" : "false"
        ));
    }

    /// @notice Codifica bytes a base64 (para tokenURI on-chain)
    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory table = bytes("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
        uint256 resultLen = 4 * ((data.length + 2) / 3);
        bytes memory result = new bytes(resultLen);

        for (uint256 i = 0; i < data.length; i += 3) {
            uint256 val = uint256(uint8(data[i])) << 16;
            if (i + 1 < data.length) val |= uint256(uint8(data[i + 1])) << 8;
            if (i + 2 < data.length) val |= uint256(uint8(data[i + 2]));

            // i is always multiple of 3 (loop step is 3), so i*4/3 == (i/3)*4
            uint256 index = (i * 4) / 3;
            result[index] = table[(val >> 18) & 0x3F];
            result[index + 1] = table[(val >> 12) & 0x3F];
            if (i + 1 < data.length) {
                result[index + 2] = table[(val >> 6) & 0x3F];
            } else {
                result[index + 2] = "=";
            }
            if (i + 2 < data.length) {
                result[index + 3] = table[val & 0x3F];
            } else {
                result[index + 3] = "=";
            }
        }
        return string(result);
    }

    // ═══════════════════════════════════════════════════════════
    //                       ADMIN
    // ═══════════════════════════════════════════════════════════

    /// @notice Ajusta el precio del mint
    function setMintPrice(uint256 newPrice) external {
        if (msg.sender != contractOwner) revert NotContractOwner();
        mintPrice = newPrice;
    }

    /// @notice Autoriza o desautoriza un contrato para llamar recordBattle
    /// @dev Solo el contractOwner puede gestionar esta lista.
    ///      Usar para autorizar AegisListen u otros contratos de integración.
    function setAuthorizedCaller(address caller, bool authorized) external {
        if (msg.sender != contractOwner) revert NotContractOwner();
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    /// @notice Retira ETH acumulado del contrato
    /// @dev Usa .call{value:} en lugar de .transfer() porque transfer tiene un gas stipend
    ///      fijo de 2300 que puede fallar si el recipient es un smart contract con lógica en receive().
    function withdraw() external {
        if (msg.sender != contractOwner) revert NotContractOwner();
        (bool ok, ) = payable(contractOwner).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    /// @notice Consulta todas las cicatrices de batalla de un guardián
    function getBattleScars(uint256 tokenId) external view returns (string[] memory) {
        return souls[tokenId].battleScars;
    }

    /// @notice Consulta el historial completo de un guardián
    function getGuardianStats(uint256 tokenId) external view returns (
        string memory name,
        string memory archetype,
        string memory personality,
        uint256 level,
        uint256 experience,
        uint256 battlesWon,
        uint256 battlesTotal,
        uint256 scarsCount,
        bool revealed
    ) {
        Soul storage soul = souls[tokenId];
        if (soul.createdAt == 0) revert TokenNotFound();
        return (
            soul.name,
            soul.archetype,
            soul.personality,
            soul.level,
            soul.experience,
            soul.battlesWon,
            soul.battlesTotal,
            soul.battleScars.length,
            soul.revealed
        );
    }
}