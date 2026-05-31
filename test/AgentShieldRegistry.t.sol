// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentShieldRegistry} from "../contracts/AgentShieldRegistry.sol";

contract AgentShieldRegistryTest is Test {
    AgentShieldRegistry public registry;
    address public owner = makeAddr("owner");
    address public user = makeAddr("user");
    address public other = makeAddr("other");
    address public platform;

    // Enums mirroring the contract
    uint8 constant ACTION_TRANSFER = 0;
    uint8 constant ACTION_APPROVE = 1;
    uint8 constant ACTION_CONTRACT_CALL = 2;
    uint8 constant DECISION_NONE = 0;
    uint8 constant DECISION_ALLOW = 1;
    uint8 constant DECISION_WARN = 2;
    uint8 constant DECISION_BLOCK = 3;
    uint8 constant RISK_LOW = 1;
    uint8 constant RISK_MEDIUM = 2;
    uint8 constant RISK_HIGH = 3;
    uint8 constant RISK_CRITICAL = 4;

    uint256 constant MAX_SPEND = 50 ether;
    address constant TARGET = address(0x1111);
    bytes4 constant SELECTOR = 0xa9059cbb;

    function setUp() public {
        // Deploy a dummy platform contract so createRequest doesn't revert
        platform = address(new DummyPlatform());
        vm.prank(owner);
        registry = new AgentShieldRegistry(owner, platform, 0);
    }

    function _createPolicy(address _user) internal returns (uint256) {
        vm.prank(_user);
        return registry.createPolicy(MAX_SPEND);
    }

    function _createPolicyWithTarget(address _user) internal returns (uint256) {
        uint256 pid = _createPolicy(_user);
        vm.startPrank(_user);
        registry.setAllowedTarget(pid, TARGET, true);
        registry.setAllowedSelector(pid, SELECTOR, true);
        vm.stopPrank();
        return pid;
    }

    function _action(
        uint8 actionType,
        uint256 value,
        string memory intent
    ) internal pure returns (AgentShieldRegistry.ProposedAction memory) {
        return AgentShieldRegistry.ProposedAction({
            actionType: AgentShieldRegistry.ActionType(actionType),
            target: TARGET,
            selector: SELECTOR,
            value: value,
            tokenSymbol: actionType == ACTION_APPROVE ? "USDC" : "STT",
            intent: intent,
            data: ""
        });
    }

    function _safeTransfer() internal pure returns (AgentShieldRegistry.ProposedAction memory) {
        return _action(ACTION_TRANSFER, 10 ether, "send safe payment");
    }

    // ============ Policy Creation ============

    function test_createPolicy() public {
        uint256 pid = _createPolicy(user);
        (address _owner, uint256 maxSpend, bool active) = registry.policies(pid);
        assertEq(_owner, user);
        assertEq(maxSpend, MAX_SPEND);
        assertTrue(active);
    }

    function test_createPolicy_sequentialIds() public {
        _createPolicy(user);
        uint256 pid2 = _createPolicy(other);
        assertEq(pid2, 2);
    }

    function test_createPolicy_revertsWhenPaused() public {
        vm.prank(owner);
        registry.pause();
        vm.prank(user);
        vm.expectRevert();
        registry.createPolicy(MAX_SPEND);
    }

    // ============ Allowlist ============

    function test_setAllowedTarget() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        registry.setAllowedTarget(pid, TARGET, true);
        assertTrue(registry.allowedTargets(pid, TARGET));
    }

    function test_setAllowedTarget_remove() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        registry.setAllowedTarget(pid, TARGET, true);
        vm.prank(user);
        registry.setAllowedTarget(pid, TARGET, false);
        assertFalse(registry.allowedTargets(pid, TARGET));
    }

    function test_setAllowedTarget_revertsNotOwner() public {
        uint256 pid = _createPolicy(user);
        vm.prank(other);
        vm.expectRevert(AgentShieldRegistry.NotPolicyOwner.selector);
        registry.setAllowedTarget(pid, TARGET, true);
    }

    function test_setAllowedSelector() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        registry.setAllowedSelector(pid, SELECTOR, true);
        assertTrue(registry.allowedSelectors(pid, SELECTOR));
    }

    function test_setAllowedSelector_revertsNotOwner() public {
        uint256 pid = _createPolicy(user);
        vm.prank(other);
        vm.expectRevert(AgentShieldRegistry.NotPolicyOwner.selector);
        registry.setAllowedSelector(pid, SELECTOR, true);
    }

    // ============ Deterministic BLOCK ============

    function test_submitAction_blocksExceedsMaxSpend() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _action(ACTION_TRANSFER, 100 ether, "send too much"));
        scanId;
        AgentShieldRegistry.Scan memory scan = registry.getScan(1);
        assertEq(uint8(scan.decision), DECISION_BLOCK);
        assertEq(scan.riskScore, 90);
        assertTrue(scan.finalized);
    }

    function test_submitAction_blocksApprovalToUnknown() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        (uint256 sid,) = registry.submitAction(pid, _action(ACTION_APPROVE, 0, "approve unlimited"));
        AgentShieldRegistry.Scan memory scan = registry.getScan(1);
        assertEq(uint8(scan.decision), DECISION_BLOCK);
        assertEq(scan.riskScore, 95);
        assertTrue(scan.finalized);
    }

    // ============ Pass-through to LLM ============

    function test_submitAction_passesToLLM_whenWithinPolicy() public {
        uint256 pid = _createPolicyWithTarget(user);
        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _safeTransfer());
        AgentShieldRegistry.Scan memory scan = registry.getScan(scanId);
        // Not finalized because dummy platform doesn't call back
        assertFalse(scan.finalized);
        assertEq(uint8(scan.decision), DECISION_NONE);
    }

    function test_submitAction_warnsOnUnknownTarget() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _safeTransfer());
        // Passes through to LLM (dummy platform won't call back)
        AgentShieldRegistry.Scan memory scan = registry.getScan(scanId);
        assertFalse(scan.finalized);
    }

    // ============ Scan storage ============

    function test_submitAction_storesCorrectScanMetadata() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _action(ACTION_TRANSFER, 100 ether, "exceeded"));
        AgentShieldRegistry.Scan memory scan = registry.getScan(scanId);
        assertEq(scan.scanId, scanId);
        assertEq(scan.policyId, pid);
        assertEq(scan.requester, user);
        assertEq(scan.timestamp, block.timestamp);
    }

    function test_submitAction_emitsScanSubmitted() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        AgentShieldRegistry.ProposedAction memory act = _safeTransfer();
        vm.expectEmit(true, true, false, false);
        emit AgentShieldRegistry.ScanSubmitted(1, pid, keccak256(abi.encode(
            act.actionType, act.target, act.selector,
            act.value, act.tokenSymbol, act.intent, act.data
        )));
        (uint256 sid,) = registry.submitAction(pid, act); sid;
    }

    function test_getScan_decisionAndRiskLevel_BLOCK() public {
        uint256 pid = _createPolicy(user);
        vm.prank(user);
        (uint256 sid,) = registry.submitAction(pid, _action(ACTION_TRANSFER, 100 ether, "over max")); sid;
        AgentShieldRegistry.Scan memory scan = registry.getScan(1);
        assertEq(uint8(scan.decision), DECISION_BLOCK);
        assertEq(uint8(scan.riskLevel), RISK_CRITICAL); // score 90
    }

    // ============ Edge cases ============

    function test_submitAction_revertsNonexistentPolicy() public {
        vm.prank(user);
        vm.expectRevert(AgentShieldRegistry.InvalidPolicy.selector);
        (uint256 sid,) = registry.submitAction(999, _safeTransfer()); sid;
    }

    function test_submitAction_revertsWhenPaused() public {
        uint256 pid = _createPolicyWithTarget(user);
        vm.prank(owner);
        registry.pause();
        vm.prank(user);
        vm.expectRevert();
        (uint256 sid,) = registry.submitAction(pid, _safeTransfer()); sid;
    }

    function test_pause_unpause_onlyOwner() public {
        vm.prank(owner);
        registry.pause();
        assertTrue(registry.paused());

        vm.prank(user);
        vm.expectRevert();
        registry.unpause();

        vm.prank(owner);
        registry.unpause();
        assertFalse(registry.paused());
    }

    function test_receive_acceptsETH() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        (bool ok,) = address(registry).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(registry).balance, 1 ether);
    }

    function test_constructor_defaultAgentId() public {
        assertEq(registry.LLM_AGENT_ID(), 12847293847561029384);
    }

    function test_constructor_customAgentId() public {
        vm.prank(owner);
        AgentShieldRegistry r2 = new AgentShieldRegistry(owner, platform, 42);
        assertEq(r2.LLM_AGENT_ID(), 42);
    }

    function test_onlyPolicyOwner_allTargets() public {
        uint256 pid = _createPolicy(user);
        vm.prank(other);
        vm.expectRevert(AgentShieldRegistry.NotPolicyOwner.selector);
        registry.setAllowedTarget(pid, TARGET, true);
    }

    function test_onlyPolicyOwner_allSelectors() public {
        uint256 pid = _createPolicy(user);
        vm.prank(other);
        vm.expectRevert(AgentShieldRegistry.NotPolicyOwner.selector);
        registry.setAllowedSelector(pid, SELECTOR, true);
    }

    function test_handleAgentResponse_revertsUnauthorized() public {
        uint256 pid = _createPolicyWithTarget(user);
        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _safeTransfer());
        // Dummy platform didn't call back, so scan is not finalized.
        // Try calling handleAgentResponse from a non-platform address
        bytes[] memory responses = new bytes[](1);
        responses[0] = abi.encode("ALLOW");
        vm.prank(user);
        vm.expectRevert(AgentShieldRegistry.UnauthorizedCallback.selector);
        registry.handleAgentResponse(1, responses, 2, "");
    }
}

/// @dev Minimal contract that accepts createRequest without reverting.
/// Does NOT call back, so scans pass through to LLM but stay unfinalized.
contract DummyPlatform {
    function createRequest(uint256, address, bytes4, bytes calldata) external payable returns (uint256) {
        return 1;
    }
}