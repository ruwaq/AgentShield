// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISomniaAgents — Interfaz completa de la plataforma de agentes de Somnia
/// @notice Datos verificados on-chain contra el contrato deployado en testnet (2026-05-29)
/// @dev La plataforma es un proxy UUPS. Implementación: 0xc49e656bd0396f42320854c66bc5f96908a17e87
interface ISomniaAgents {
    // ─── Requests ───────────────────────────────────────────

    /// @notice Crea un request básico (1 agente, callback simple)
    /// @param agentId ID del agente (ej. 12847293847561029384 = LLM Inference)
    /// @param callbackAddress Dirección que recibirá el callback
    /// @param callbackSelector Selector de la función de callback (4 bytes)
    /// @param payload Datos ABI-encoded para el agente
    /// @return requestId ID del request creado
    /// @dev msg.value debe ser >= getRequestDeposit() (0.03 SOMI en testnet)
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    /// @notice Crea un request avanzado con subcomité y consenso personalizados
    /// @param subcommitteeSize Número de validadores (default 3)
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
    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);

    // ─── Tipos ──────────────────────────────────────────────

    enum ResponseStatus { None, Pending, Success, Failed, TimedOut }
    enum ConsensusType { Majority, Threshold }

    struct Response {
        address validator;
        bytes result;
        ResponseStatus status;
        uint256 receipt;
        uint256 timestamp;
        uint256 executionCost;
    }

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