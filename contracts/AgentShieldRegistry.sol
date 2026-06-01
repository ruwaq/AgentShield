// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISomniaAgents, IAgentRequesterHandler} from "./interfaces/ISomniaAgents.sol";
import {StringUtils} from "./libraries/StringUtils.sol";

contract AgentShieldRegistry is Ownable2Step, Pausable, ReentrancyGuard, IAgentRequesterHandler {
    enum Decision { NONE, ALLOW, WARN, BLOCK }
    enum RiskLevel { UNKNOWN, LOW, MEDIUM, HIGH, CRITICAL }
    enum ActionType { TRANSFER, APPROVE, CONTRACT_CALL }
    struct Policy { address owner; uint256 maxSpend; bool active; }
    struct ProposedAction { ActionType actionType; address target; bytes4 selector; uint256 value; string tokenSymbol; string intent; bytes data; }
    struct Scan { uint256 scanId; uint256 policyId; address requester; bytes32 actionHash; Decision decision; uint256 riskScore; RiskLevel riskLevel; bytes32 reasonHash; uint256 requestId; uint256 timestamp; bool finalized; }

    uint256 public constant DEFAULT_LLM_AGENT_ID = 12847293847561029384;
    ISomniaAgents public immutable SOMNIA_AGENTS;
    uint256 public immutable LLM_AGENT_ID;
    uint256 public nextPolicyId = 1;
    uint256 public nextScanId = 1;

    mapping(uint256 => Policy) public policies;
    mapping(uint256 => mapping(address => bool)) public allowedTargets;
    mapping(uint256 => mapping(bytes4 => bool)) public allowedSelectors;
    mapping(uint256 => Scan) public scans;
    mapping(uint256 => uint256) public requestToScan;

    event PolicyCreated(uint256 indexed policyId, address indexed owner, uint256 maxSpend);
    event TargetUpdated(uint256 indexed policyId, address indexed target, bool allowed);
    event SelectorUpdated(uint256 indexed policyId, bytes4 indexed selector, bool allowed);
    event ScanSubmitted(uint256 indexed scanId, uint256 indexed policyId, bytes32 actionHash);
    event RiskRequested(uint256 indexed scanId, uint256 indexed requestId);
    event ScanFinalized(uint256 indexed scanId, Decision decision, uint256 riskScore, RiskLevel riskLevel, bytes32 reasonHash);

    error NotPolicyOwner(); error InvalidPolicy(); error PolicyInactive(); error UnauthorizedCallback(); error AlreadyFinalized(); error InvalidRiskScore();

    constructor(address initialOwner, address somniaAgentsPlatform, uint256 agentId) Ownable(initialOwner) {
        SOMNIA_AGENTS = ISomniaAgents(somniaAgentsPlatform);
        LLM_AGENT_ID = agentId == 0 ? DEFAULT_LLM_AGENT_ID : agentId;
    }

    receive() external payable {}
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function createPolicy(uint256 maxSpend) external whenNotPaused returns (uint256 policyId) {
        policyId = nextPolicyId++;
        policies[policyId] = Policy(msg.sender, maxSpend, true);
        emit PolicyCreated(policyId, msg.sender, maxSpend);
    }

    function setAllowedTarget(uint256 policyId, address target, bool allowed) external onlyPolicyOwner(policyId) {
        allowedTargets[policyId][target] = allowed;
        emit TargetUpdated(policyId, target, allowed);
    }

    function setAllowedSelector(uint256 policyId, bytes4 selector, bool allowed) external onlyPolicyOwner(policyId) {
        allowedSelectors[policyId][selector] = allowed;
        emit SelectorUpdated(policyId, selector, allowed);
    }

    function submitAction(uint256 policyId, ProposedAction calldata action) external payable nonReentrant whenNotPaused returns (uint256 scanId, uint256 requestId) {
        Policy memory policy = policies[policyId];
        if (policy.owner == address(0)) revert InvalidPolicy();
        if (!policy.active) revert PolicyInactive();
        bytes32 actionHash = keccak256(abi.encode(action.actionType, action.target, action.selector, action.value, action.tokenSymbol, action.intent, action.data));
        scanId = nextScanId++;
        scans[scanId] = Scan(scanId, policyId, msg.sender, actionHash, Decision.NONE, 0, RiskLevel.UNKNOWN, bytes32(0), 0, block.timestamp, false);
        emit ScanSubmitted(scanId, policyId, actionHash);

        (Decision localDecision, uint256 localRisk, string memory localReason) = _localCheck(policyId, policy, action);
        if (localDecision == Decision.BLOCK) { _finalize(scanId, Decision.BLOCK, localRisk, localReason); return (scanId, 0); }

        string memory prompt = _buildPrompt(policyId, policy, action, localDecision, localRisk, localReason);
        string[] memory allowed = new string[](3); allowed[0] = "ALLOW"; allowed[1] = "WARN"; allowed[2] = "BLOCK";
        bytes memory payload = abi.encodeWithSignature("inferString(string,string,bool,string[])", prompt, _systemPrompt(), false, allowed);
        requestId = SOMNIA_AGENTS.createRequest{value: msg.value}(LLM_AGENT_ID, address(this), this.handleResponse.selector, payload);
        scans[scanId].requestId = requestId;
        requestToScan[requestId] = scanId;
        emit RiskRequested(scanId, requestId);
    }

    /// @notice Callback invocado por Somnia Agents cuando el LLM termina la inferencia.
    /// @dev Esta es la firma EXACTA que los validadores llaman. Si no coincide, el callback nunca llega.
    ///      Usa Response[] memory (struct), no bytes[] — esa era la causa del bug anterior.
    function handleResponse(
        uint256 requestId,
        ISomniaAgents.Response[] memory responses,
        ISomniaAgents.ResponseStatus status,
        ISomniaAgents.Request memory /* details */
    ) external {
        if (msg.sender != address(SOMNIA_AGENTS)) revert UnauthorizedCallback();
        uint256 scanId = requestToScan[requestId];
        if (scanId == 0) revert InvalidPolicy();
        if (scans[scanId].finalized) revert AlreadyFinalized();
        (Decision decision, uint256 riskScore, string memory reason) = _parseAgentResponse(responses, status);
        _finalize(scanId, decision, riskScore, reason);
    }

    function getScan(uint256 scanId) external view returns (Scan memory) { return scans[scanId]; }

    function _localCheck(uint256 policyId, Policy memory policy, ProposedAction calldata action) internal view returns (Decision, uint256, string memory) {
        if (action.value > policy.maxSpend) return (Decision.BLOCK, 90, "Action exceeds max spend policy.");
        if (action.actionType == ActionType.APPROVE && !allowedTargets[policyId][action.target]) return (Decision.BLOCK, 95, "Approval to unknown spender is blocked.");
        if (!allowedTargets[policyId][action.target]) return (Decision.WARN, 65, "Target is not allowlisted.");
        if (action.actionType == ActionType.CONTRACT_CALL && action.selector != bytes4(0) && !allowedSelectors[policyId][action.selector]) return (Decision.WARN, 60, "Function selector is not allowlisted.");
        return (Decision.ALLOW, 15, "Action is within deterministic policy checks.");
    }

    /// @notice Parsea la respuesta del LLM desde el array de Response structs.
    /// @dev Toma la primera respuesta del subcomité (todas son determinísticas si hay consenso).
    ///      Status Success=2. Si no hay consenso o falló, defaultea a WARN (fail-safe).
    function _parseAgentResponse(
        ISomniaAgents.Response[] memory responses,
        ISomniaAgents.ResponseStatus status
    ) internal pure returns (Decision, uint256, string memory) {
        if (status != ISomniaAgents.ResponseStatus.Success || responses.length == 0) {
            return (Decision.WARN, 60, "Somnia LLM response unavailable or failed.");
        }
        string memory raw = abi.decode(responses[0].result, (string));
        bytes32 h = keccak256(bytes(raw));
        if (h == keccak256(bytes("ALLOW"))) return (Decision.ALLOW, 20, "Somnia LLM returned ALLOW.");
        if (h == keccak256(bytes("WARN"))) return (Decision.WARN, 60, "Somnia LLM returned WARN.");
        if (h == keccak256(bytes("BLOCK"))) return (Decision.BLOCK, 95, "Somnia LLM returned BLOCK.");
        return (Decision.WARN, 70, "Unexpected LLM output; defaulted to WARN.");
    }

    function _finalize(uint256 scanId, Decision decision, uint256 riskScore, string memory reason) internal {
        if (riskScore > 100) revert InvalidRiskScore();
        scans[scanId].decision = decision; scans[scanId].riskScore = riskScore; scans[scanId].riskLevel = _riskLevel(riskScore); scans[scanId].reasonHash = keccak256(bytes(reason)); scans[scanId].finalized = true;
        emit ScanFinalized(scanId, decision, riskScore, _riskLevel(riskScore), keccak256(bytes(reason)));
    }

    function _buildPrompt(uint256 policyId, Policy memory policy, ProposedAction calldata action, Decision localDecision, uint256 localRisk, string memory localReason) internal view returns (string memory) {
        return string(abi.encodePacked(
            "PolicyId: ", StringUtils.uintToString(policyId),
            "\nMaxSpendWei: ", StringUtils.uintToString(policy.maxSpend),
            "\nTargetAllowed: ", allowedTargets[policyId][action.target] ? "true" : "false",
            "\nSelectorAllowed: ", allowedSelectors[policyId][action.selector] ? "true" : "false",
            "\nActionType: ", StringUtils.uintToString(uint256(action.actionType)),
            "\nTarget: ", StringUtils.addrToString(action.target),
            "\nSelector: ", StringUtils.bytes4ToString(action.selector),
            "\nValueWei: ", StringUtils.uintToString(action.value),
            "\nTokenSymbol: ", action.tokenSymbol,
            "\nIntent: ", action.intent,
            "\nLocalDecision: ", StringUtils.decisionToString(uint8(localDecision)),
            "\nLocalRisk: ", StringUtils.uintToString(localRisk),
            "\nLocalReason: ", localReason,
            "\nReturn only one value: ALLOW, WARN, or BLOCK."
        ));
    }
    function _systemPrompt() internal pure returns (string memory) { return "You are AgentShield, a pre-execution risk classifier for autonomous blockchain agents. Return exactly one token: ALLOW, WARN, or BLOCK. Block actions exceeding policy, approvals to unknown spenders, and intent/effect mismatches. Warn on unknown targets or selectors. Allow only low-impact actions within policy."; }
    function _riskLevel(uint256 score) internal pure returns (RiskLevel) { if (score >= 90) return RiskLevel.CRITICAL; if (score >= 70) return RiskLevel.HIGH; if (score >= 40) return RiskLevel.MEDIUM; return RiskLevel.LOW; }
    modifier onlyPolicyOwner(uint256 policyId) { if (policies[policyId].owner != msg.sender) revert NotPolicyOwner(); _; }
}
