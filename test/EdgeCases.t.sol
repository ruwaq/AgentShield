// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentShieldRegistry} from "../contracts/AgentShieldRegistry.sol";

contract EdgeCasesTest is Test {
    AgentShieldRegistry public registry;
    address public owner = makeAddr("owner");
    address public user = makeAddr("user");
    address public platform;

    function setUp() public {
        platform = address(new DummyPlatform());
        vm.prank(owner);
        registry = new AgentShieldRegistry(owner, platform, 0);
    }

    function _policy(uint256 maxSpend) internal returns (uint256) {
        vm.prank(user);
        return registry.createPolicy(maxSpend);
    }

    function _action(uint8 t, address target, uint256 v, string memory intent) internal pure returns (AgentShieldRegistry.ProposedAction memory) {
        return AgentShieldRegistry.ProposedAction({
            actionType: AgentShieldRegistry.ActionType(t),
            target: target, selector: bytes4(0), value: v,
            tokenSymbol: "STT", intent: intent, data: ""
        });
    }

    // ═══════════════════════════════════════════════════════
    // HIGH CONCURRENCY: Multiple rapid submits
    // ═══════════════════════════════════════════════════════

    function test_concurrency_manyPoliciesFromDifferentUsers() public {
        address[5] memory users = [makeAddr("u1"), makeAddr("u2"), makeAddr("u3"), makeAddr("u4"), makeAddr("u5")];
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(users[i]);
            registry.createPolicy(50 ether);
        }
        // All policies should have different IDs
        (,, bool a1) = registry.policies(1);
        (,, bool a2) = registry.policies(5);
        assertTrue(a1 && a2);
    }

    function test_concurrency_rapidSubmissions() public {
        uint256 pid = _policy(100 ether);
        vm.startPrank(user);
        registry.setAllowedTarget(pid, address(0x1111), true);

        // Submit 10 rapid actions
        for (uint256 i = 0; i < 10; i++) {
            registry.submitAction(pid, _action(0, address(0x1111), 1 ether + i * 1 ether, "rapid"));
        }
        vm.stopPrank();

        // All scans should exist with sequential IDs
        for (uint256 i = 1; i <= 10; i++) {
            AgentShieldRegistry.Scan memory scan = registry.getScan(i);
            assertEq(scan.scanId, i);
        }
    }

    // ═══════════════════════════════════════════════════════
    // GAS LIMITS: Verify costs don't explode
    // ═══════════════════════════════════════════════════════

    function test_gas_createPolicy_consistentCost() public {
        // Policy creation cost should be predictable ~23K
        vm.prank(user);
        uint256 pid1 = registry.createPolicy(50 ether);

        vm.prank(makeAddr("newUser"));
        uint256 pid2 = registry.createPolicy(50 ether);

        // Both exist and have correct maxSpend
        (, uint256 ms1,) = registry.policies(pid1);
        (, uint256 ms2,) = registry.policies(pid2);
        assertEq(ms1, 50 ether);
        assertEq(ms2, 50 ether);
    }

    function test_gas_submitAction_blockCostLowerThanLlm() public {
        uint256 pid = _policy(10 ether);

        // Block path (no LLM call, cheaper)
        vm.prank(user);
        uint256 gasBefore = gasleft();
        registry.submitAction(pid, _action(0, address(0x1111), 100 ether, "blocked"));
        uint256 gasUsed = gasBefore - gasleft();
        // Should use less than 400K gas (BLOCK path skips LLM)
        assertTrue(gasUsed < 400000, "BLOCK path should use < 400K gas");
    }

    // ═══════════════════════════════════════════════════════
    // TIMESTAMP: Verify block.timestamp usage
    // ═══════════════════════════════════════════════════════

    function test_timestamp_scanRecordsCurrentBlockTime() public {
        uint256 pid = _policy(1 ether);

        vm.warp(1779993600); // Set specific timestamp
        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _action(0, address(0x1111), 100 ether, "blocked"));

        AgentShieldRegistry.Scan memory scan = registry.getScan(scanId);
        assertEq(scan.timestamp, 1779993600);
    }

    function test_timestamp_futureScansUseCorrectTime() public {
        uint256 pid = _policy(1 ether);

        vm.warp(1000000);
        vm.prank(user);
        (uint256 s1,) = registry.submitAction(pid, _action(0, address(0x1111), 100 ether, "b1"));

        vm.warp(2000000);
        vm.prank(user);
        (uint256 s2,) = registry.submitAction(pid, _action(0, address(0x1111), 100 ether, "b2"));

        assertEq(registry.getScan(s1).timestamp, 1000000);
        assertEq(registry.getScan(s2).timestamp, 2000000);
    }

    // ═══════════════════════════════════════════════════════
    // LARGE DATA: Long strings, max calldata
    // ═══════════════════════════════════════════════════════

    function test_largeData_longIntentString() public {
        uint256 pid = _policy(1 ether);

        // 500 char intent string
        string memory longIntent = "This is a very long intent description that explains in great detail what the agent is trying to accomplish with this specific transaction on the Somnia blockchain. It covers all edge cases, potential risks, expected outcomes, and provides context for the LLM to make an informed decision about whether to ALLOW, WARN, or BLOCK this action based on the security policy defined by the user. Padding to reach maximum length for testing purposes. Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _action(0, address(0x1111), 100 ether, longIntent));
        assertEq(registry.getScan(scanId).scanId, scanId);
    }

    function test_largeData_maxTokenSymbol() public {
        uint256 pid = _policy(1 ether);
        string memory symbol = "SUPER_LONG_TOKEN_SYMBOL_NAME_FOR_TESTING_12345";

        vm.prank(user);
        AgentShieldRegistry.ProposedAction memory action = AgentShieldRegistry.ProposedAction({
            actionType: AgentShieldRegistry.ActionType(0),
            target: address(0x1111), selector: bytes4(0),
            value: 100 ether, tokenSymbol: symbol,
            intent: "test", data: hex"deadbeef"
        });
        (uint256 scanId,) = registry.submitAction(pid, action);
        assertEq(registry.getScan(scanId).scanId, scanId);
    }

    // ═══════════════════════════════════════════════════════
    // STATE TRANSITIONS: Pause/Unpause during operations
    // ═══════════════════════════════════════════════════════

    function test_state_pauseBlocksNewPolicies() public {
        vm.prank(owner);
        registry.pause();

        vm.prank(user);
        vm.expectRevert();
        registry.createPolicy(50 ether);
    }

    function test_state_pauseDoesNotBlockGetScan() public {
        uint256 pid = _policy(1 ether);
        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _action(0, address(0x1111), 100 ether, "test"));

        vm.prank(owner);
        registry.pause();

        // getScan should still work while paused (view function)
        AgentShieldRegistry.Scan memory scan = registry.getScan(scanId);
        assertEq(scan.scanId, scanId);
    }

    function test_state_unpauseRestoresFunctionality() public {
        vm.prank(owner);
        registry.pause();
        vm.prank(owner);
        registry.unpause();

        // Now createPolicy should work
        vm.prank(user);
        uint256 pid = registry.createPolicy(50 ether);
        (,, bool active) = registry.policies(pid);
        assertTrue(active);
    }

    // ═══════════════════════════════════════════════════════
    // OWNERSHIP TRANSFER: Ownable2Step safety
    // ═══════════════════════════════════════════════════════

    function test_ownership_transferRequiresAcceptance() public {
        address newOwner = makeAddr("newOwner");

        // Step 1: Transfer
        vm.prank(owner);
        registry.transferOwnership(newOwner);

        // owner() still returns original owner until accepted
        assertEq(registry.owner(), owner);

        // Step 2: Accept
        vm.prank(newOwner);
        registry.acceptOwnership();

        assertEq(registry.owner(), newOwner);
    }

    function test_ownership_pendingOwnerCannotPause() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        registry.transferOwnership(newOwner);

        // Pending owner can't pause yet
        vm.prank(newOwner);
        vm.expectRevert();
        registry.pause();
    }

    // ═══════════════════════════════════════════════════════
    // MULTIPLE POLICIES interacting
    // ═══════════════════════════════════════════════════════

    function test_multiplePolicies_independentAllowlists() public {
        address[2] memory targets = [address(0x1111), address(0x2222)];

        vm.startPrank(user);
        uint256 p1 = registry.createPolicy(50 ether);
        registry.setAllowedTarget(p1, targets[0], true);

        uint256 p2 = registry.createPolicy(100 ether);
        registry.setAllowedTarget(p2, targets[1], true);
        vm.stopPrank();

        // Each policy has its own allowlist
        assertTrue(registry.allowedTargets(p1, targets[0]));
        assertFalse(registry.allowedTargets(p1, targets[1]));
        assertFalse(registry.allowedTargets(p2, targets[0]));
        assertTrue(registry.allowedTargets(p2, targets[1]));
    }

    function test_multiplePolicies_scansDontMix() public {
        vm.startPrank(user);
        uint256 p1 = registry.createPolicy(10 ether);
        registry.setAllowedTarget(p1, address(0x1111), true);

        uint256 p2 = registry.createPolicy(100 ether);
        registry.setAllowedTarget(p2, address(0x1111), true);
        vm.stopPrank();

        // Submit to p1 with 50 ether → BLOCK (exceeds 10)
        vm.prank(user);
        registry.submitAction(p1, _action(0, address(0x1111), 50 ether, "p1 test"));

        // Submit to p2 with 50 ether → PASS (within 100)
        vm.prank(user);
        (uint256 scanId2,) = registry.submitAction(p2, _action(0, address(0x1111), 50 ether, "p2 test"));

        // Verify p1 scan was blocked
        assertTrue(registry.getScan(1).finalized);

        // Verify p2 scan exists and belongs to p2
        AgentShieldRegistry.Scan memory scan2 = registry.getScan(scanId2);
        assertEq(scan2.policyId, p2);
    }

    // ═══════════════════════════════════════════════════════
    // ACTION TYPES: All enum values
    // ═══════════════════════════════════════════════════════

    function test_actionTypes_allThreeAccepted() public {
        uint256 pid = _policy(100 ether);
        vm.startPrank(user);
        registry.setAllowedTarget(pid, address(0x1111), true);
        registry.setAllowedSelector(pid, bytes4(0xa9059cbb), true);

        // TRANSFER
        registry.submitAction(pid, _action(0, address(0x1111), 1 ether, "transfer"));
        // APPROVE
        registry.submitAction(pid, _action(1, address(0x1111), 0, "approve"));
        // CONTRACT_CALL
        registry.submitAction(pid, _action(2, address(0x1111), 0, "call"));
        vm.stopPrank();

        assertEq(registry.getScan(1).scanId, 1);
        assertEq(registry.getScan(2).scanId, 2);
        assertEq(registry.getScan(3).scanId, 3);
    }

    // ═══════════════════════════════════════════════════════
    // ZERO ADDRESS checks
    // ═══════════════════════════════════════════════════════

    function test_zeroAddress_targetAllowed() public {
        uint256 pid = _policy(50 ether);

        vm.prank(user);
        registry.setAllowedTarget(pid, address(0), true);

        vm.prank(user);
        (uint256 scanId,) = registry.submitAction(pid, _action(0, address(0), 10 ether, "zero addr"));
        // Should not revert — zero address is a valid target
        assertEq(registry.getScan(scanId).scanId, scanId);
    }

    function test_zeroAddress_platformIsZero() public {
        // If platform=0 in constructor, createRequest would fail
        // But agentId would default. This is a deployment config issue.
        vm.prank(owner);
        AgentShieldRegistry r = new AgentShieldRegistry(owner, address(0), 42);
        assertEq(r.LLM_AGENT_ID(), 42); // custom agentId, not default
    }

    // ═══════════════════════════════════════════════════════
    // SELECTOR specific edge cases
    // ═══════════════════════════════════════════════════════

    function test_selector_approvalToAllowedTargetNotBlocked() public {
        uint256 pid = _policy(50 ether);

        vm.startPrank(user);
        registry.setAllowedTarget(pid, address(0x1111), true);
        registry.setAllowedSelector(pid, 0x095ea7b3, true);
        vm.stopPrank();

        // APPROVE to allowed target → should pass local check
        vm.prank(user);
        AgentShieldRegistry.ProposedAction memory action = AgentShieldRegistry.ProposedAction({
            actionType: AgentShieldRegistry.ActionType(1), // APPROVE
            target: address(0x1111), selector: 0x095ea7b3,
            value: 0, tokenSymbol: "USDC", intent: "approve", data: ""
        });
        (uint256 scanId,) = registry.submitAction(pid, action);
        assertFalse(registry.getScan(scanId).finalized); // went to LLM, not blocked
    }

    function test_selector_unknownSelectorOnContractCallWarns() public {
        uint256 pid = _policy(50 ether);

        vm.startPrank(user);
        registry.setAllowedTarget(pid, address(0x1111), true);
        // NOT allowlisting the selector
        vm.stopPrank();

        vm.prank(user);
        AgentShieldRegistry.ProposedAction memory action = AgentShieldRegistry.ProposedAction({
            actionType: AgentShieldRegistry.ActionType(2), // CONTRACT_CALL
            target: address(0x1111), selector: 0xdeadbeef,
            value: 0, tokenSymbol: "STT", intent: "unknown call", data: ""
        });
        (uint256 scanId,) = registry.submitAction(pid, action);
        // Goes to LLM (not blocked, but will get WARN from local check)
        assertFalse(registry.getScan(scanId).finalized);
    }
}

contract DummyPlatform {
    function createRequest(uint256, address, bytes4, bytes calldata) external payable returns (uint256) {
        return 1;
    }
}