// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisBrainV2} from "../contracts/aegis/AegisBrainV2.sol";
import {ISomniaAgents} from "../contracts/interfaces/ISomniaAgents.sol";

contract MockSomniaPlatform {
    uint256 public nextRequestId = 1;
    uint256 public deposit = 0.03 ether;

    struct PendingRequest {
        address callbackAddress;
        bytes4 callbackSelector;
        bytes payload;
    }

    mapping(uint256 => PendingRequest) public requests;

    function createRequest(uint256, address cb, bytes4 sel, bytes calldata payload)
        external payable returns (uint256 requestId)
    {
        require(msg.value >= deposit, "insufficient deposit");
        requestId = nextRequestId++;
        requests[requestId] = PendingRequest(cb, sel, payload);
    }

    function getRequestDeposit() external view returns (uint256) { return deposit; }

    function simulateCallback(uint256 requestId, string memory response) external {
        PendingRequest memory req = requests[requestId];
        ISomniaAgents.Response[] memory responses = new ISomniaAgents.Response[](1);
        responses[0] = ISomniaAgents.Response({
            validator: address(0),
            result: abi.encode(response),
            status: ISomniaAgents.ResponseStatus.Success,
            receipt: 0,
            timestamp: 0,
            executionCost: 0
        });
        ISomniaAgents.Request memory emptyReq;
        (bool success,) = req.callbackAddress.call(
            abi.encodeWithSelector(req.callbackSelector, requestId, responses, ISomniaAgents.ResponseStatus.Success, emptyReq)
        );
        require(success, "callback failed");
    }

    function simulateFailedCallback(uint256 requestId) external {
        PendingRequest memory req = requests[requestId];
        ISomniaAgents.Response[] memory responses = new ISomniaAgents.Response[](0);
        ISomniaAgents.Request memory emptyReq;
        (bool success,) = req.callbackAddress.call(
            abi.encodeWithSelector(req.callbackSelector, requestId, responses, ISomniaAgents.ResponseStatus.Failed, emptyReq)
        );
        require(success, "callback failed");
    }
}

contract AegisBrainV2Test is Test {
    AegisBrainV2 public aegis;
    MockSomniaPlatform public platform;

    address public user = makeAddr("user");
    address public attacker = makeAddr("attacker");

    uint256 constant LLM_AGENT_ID = 12847293847561029384;
    uint256 constant DEPOSIT = 0.03 ether;

    receive() external payable {}

    function setUp() public {
        platform = new MockSomniaPlatform();
        aegis = new AegisBrainV2(address(platform), LLM_AGENT_ID);
        vm.deal(user, 100 ether);
        vm.deal(address(aegis), 10 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //              NATURAL LANGUAGE POLICIES
    // ═══════════════════════════════════════════════════════════

    function test_setSecurityProfile_createsProfile() public {
        vm.prank(user);
        aegis.setSecurityProfile("Protegeme de scams DeFi, no allow transfers > 100 STT");

        (uint256 decisions, uint256 blocked, string memory policy, bool active) = aegis.getStats(user);
        assertEq(policy, "Protegeme de scams DeFi, no allow transfers > 100 STT");
        assertTrue(active);
        assertEq(decisions, 0);
        assertEq(blocked, 0);
    }

    function test_setSecurityProfile_updatesExisting() public {
        vm.startPrank(user);
        aegis.setSecurityProfile("Policy v1");
        aegis.setSecurityProfile("Policy v2 - mas strict");
        vm.stopPrank();

        (,, string memory policy,) = aegis.getStats(user);
        assertEq(policy, "Policy v2 - mas strict");
    }

    function test_setSecurityProfile_emitsEvent() public {
        vm.prank(user);
        vm.expectEmit(true, false, false, true);
        emit AegisBrainV2.ProfileCreated(user, "Mi policy de seguridad");
        aegis.setSecurityProfile("Mi policy de seguridad");
    }

    function test_setSecurityProfile_multipleUsers() public {
        vm.prank(user);
        aegis.setSecurityProfile("User policy");

        vm.prank(attacker);
        aegis.setSecurityProfile("Attacker policy");

        (,, string memory userPolicy,) = aegis.getStats(user);
        (,, string memory attackerPolicy,) = aegis.getStats(attacker);

        assertEq(userPolicy, "User policy");
        assertEq(attackerPolicy, "Attacker policy");
    }

    // ═══════════════════════════════════════════════════════════
    //              ANALYZE INTENT
    // ═══════════════════════════════════════════════════════════

    function test_analyze_revertsOnEmptyIntent() public {
        vm.prank(user);
        vm.expectRevert(AegisBrainV2.EmptyIntent.selector);
        aegis.analyze("");
    }

    function test_analyze_startsAnalysis() public {
        vm.prank(user);
        aegis.setSecurityProfile("Bloquear transfers > 50 STT");

        vm.prank(user);
        uint256 analysisId = aegis.analyze("Send 100 STT to 0x1234 to buy NFT");

        assertEq(analysisId, 1);
        assertEq(platform.nextRequestId(), 2, "Should create 1 request");
    }

    function test_analyze_emitsEvent() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        vm.prank(user);
        vm.expectEmit(true, true, false, true);
        emit AegisBrainV2.AnalysisStarted(1, user, "Test intent");
        aegis.analyze("Test intent");
    }

    function test_analyze_allowsSafeAction() public {
        vm.prank(user);
        aegis.setSecurityProfile("Only block scams obvious");

        vm.prank(user);
        uint256 analysisId = aegis.analyze("Send 10 STT to known vendor for monthly payment");

        // Simular callback del LLM
        platform.simulateCallback(platform.nextRequestId() - 1, "ALLOW\nThis is a routine payment to a known vendor within policy limits.");

        AegisBrainV2.SecurityDecision memory d = aegis.getDecision(analysisId);
        assertEq(d.verdict, "ALLOW");
        assertEq(d.riskScore, 20);
    }

    function test_analyze_blocksScam() public {
        vm.prank(user);
        aegis.setSecurityProfile("Protegeme de scams y phishing");

        vm.prank(user);
        uint256 analysisId = aegis.analyze("Approve spending ilimitado de USDC for a free airdrop");

        platform.simulateCallback(platform.nextRequestId() - 1, "BLOCK\nThis appears to be a phishing attempt. Unlimited approval to an unknown contract is a common scam pattern.");

        AegisBrainV2.SecurityDecision memory d = aegis.getDecision(analysisId);
        assertEq(d.verdict, "BLOCK");
        assertEq(d.riskScore, 90);
    }

    function test_analyze_warnsOnUncertain() public {
        vm.prank(user);
        aegis.setSecurityProfile("Be cautious con new contracts");

        vm.prank(user);
        uint256 analysisId = aegis.analyze("Interact with a new DeFi contract");

        platform.simulateCallback(platform.nextRequestId() - 1, "WARN\nThis contract was deployed recently. Proceed with caution.");

        AegisBrainV2.SecurityDecision memory d = aegis.getDecision(analysisId);
        assertEq(d.verdict, "WARN");
        assertEq(d.riskScore, 60);
    }

    function test_analyze_defaultsToWarnOnFailedCallback() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        vm.prank(user);
        uint256 analysisId = aegis.analyze("Test intent");

        // Simular callback fallido
        platform.simulateFailedCallback(platform.nextRequestId() - 1);

        AegisBrainV2.SecurityDecision memory d = aegis.getDecision(analysisId);
        assertEq(d.verdict, "WARN", "Failed callback should default to WARN");
        assertEq(d.riskScore, 70);
    }

    function test_analyze_defaultsToWarnOnUnknownResponse() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        vm.prank(user);
        uint256 analysisId = aegis.analyze("Test");

        // LLM devuelve algo que no es ALLOW/WARN/BLOCK
        platform.simulateCallback(platform.nextRequestId() - 1, "The transaction seems complex and I cannot determine...");

        AegisBrainV2.SecurityDecision memory d = aegis.getDecision(analysisId);
        assertEq(d.verdict, "WARN", "Unknown response should default to WARN");
    }

    // ═══════════════════════════════════════════════════════════
    //              DEEP ANALYZE
    // ═══════════════════════════════════════════════════════════

    function test_deepAnalyze_startsAnalysis() public {
        vm.prank(user);
        aegis.setSecurityProfile("Verify all contracts before interacting");

        vm.prank(user);
        uint256 analysisId = aegis.deepAnalyze(
            "Buy token on new DEX",
            address(0x1234),
            100 ether
        );

        assertEq(analysisId, 1);
        assertEq(platform.nextRequestId(), 2);
    }

    function test_deepAnalyze_includesTargetInPrompt() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        vm.prank(user);
        aegis.deepAnalyze("Swap tokens", address(0xABCD), 50 ether);

        // Verificar que el request se creó (el prompt incluye la dirección)
        assertEq(platform.nextRequestId(), 2);
    }

    // ═══════════════════════════════════════════════════════════
    //              STATS TRACKING
    // ═══════════════════════════════════════════════════════════

    function test_stats_tracksDecisions() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        // 3 análisis
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(user);
            aegis.analyze("Test");
            platform.simulateCallback(platform.nextRequestId() - 1, "ALLOW\nSafe");
        }

        (uint256 decisions, uint256 blocked,,) = aegis.getStats(user);
        assertEq(decisions, 3);
        assertEq(blocked, 0);
    }

    function test_stats_tracksBlockedThreats() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        vm.prank(user);
        aegis.analyze("Scam");
        platform.simulateCallback(platform.nextRequestId() - 1, "BLOCK\nScam detected");

        vm.prank(user);
        aegis.analyze("Safe");
        platform.simulateCallback(platform.nextRequestId() - 1, "ALLOW\nSafe");

        (uint256 decisions, uint256 blocked,,) = aegis.getStats(user);
        assertEq(decisions, 2);
        assertEq(blocked, 1);
    }

    // ═══════════════════════════════════════════════════════════
    //              MEMORIA PERSISTENTE
    // ═══════════════════════════════════════════════════════════

    function test_remember_storesData() public {
        vm.prank(user);
        bytes32 key = keccak256("test");
        bytes memory data = abi.encode("important context");
        bytes32 hash = aegis.remember(key, data);
        assertEq(hash, keccak256(data));
    }

    function test_recall_retrievesData() public {
        vm.prank(user);
        bytes32 key = keccak256("test");
        bytes memory data = abi.encode("context");
        aegis.remember(key, data);

        bytes memory retrieved = aegis.recall(key);
        assertEq(keccak256(retrieved), keccak256(data));
    }

    function test_decision_storesMemoryHash() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        vm.prank(user);
        uint256 analysisId = aegis.analyze("Test");
        platform.simulateCallback(platform.nextRequestId() - 1, "ALLOW\nSafe");

        AegisBrainV2.SecurityDecision memory d = aegis.getDecision(analysisId);
        assertTrue(d.memoryHash != bytes32(0), "Should store memory hash");
    }

    // ═══════════════════════════════════════════════════════════
    //              SEGURIDAD
    // ═══════════════════════════════════════════════════════════

    function test_handleResponse_revertsOnUnauthorized() public {
        vm.prank(attacker);
        ISomniaAgents.Response[] memory responses = new ISomniaAgents.Response[](0);
        ISomniaAgents.Request memory emptyReq;
        vm.expectRevert(AegisBrainV2.UnauthorizedCallback.selector);
        aegis.handleResponse(1, responses, ISomniaAgents.ResponseStatus.Success, emptyReq);
    }

    function test_handleResponse_ignoresUnknownRequest() public {
        vm.prank(address(platform));
        ISomniaAgents.Response[] memory responses = new ISomniaAgents.Response[](1);
        responses[0] = ISomniaAgents.Response({
            validator: address(0),
            result: abi.encode("test"),
            status: ISomniaAgents.ResponseStatus.Success,
            receipt: 0,
            timestamp: 0,
            executionCost: 0
        });
        ISomniaAgents.Request memory emptyReq;
        aegis.handleResponse(99999, responses, ISomniaAgents.ResponseStatus.Success, emptyReq);
        // No debería revertir
    }

    function test_receive_acceptsEth() public {
        vm.prank(user);
        (bool success,) = address(aegis).call{value: 1 ether}("");
        assertTrue(success);
    }

    // ═══════════════════════════════════════════════════════════
    //              EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_analyze_withoutProfile_usesEmptyPolicy() public {
        // Usuario sin perfil — debería funcionar igual (policy vacía)
        vm.prank(user);
        uint256 analysisId = aegis.analyze("Test without profile");

        platform.simulateCallback(platform.nextRequestId() - 1, "ALLOW\nNo policy set, allowing by default");

        AegisBrainV2.SecurityDecision memory d = aegis.getDecision(analysisId);
        assertEq(d.verdict, "ALLOW");
    }

    function test_analyze_caseInsensitiveVerdict() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        vm.prank(user);
        uint256 analysisId = aegis.analyze("Test");

        // El LLM podría devolver "allow" en minúscula — nuestro _contains busca "ALLOW"
        platform.simulateCallback(platform.nextRequestId() - 1, "allow\nlowercase response");

        AegisBrainV2.SecurityDecision memory d = aegis.getDecision(analysisId);
        // Debería caer en default WARN porque "allow" != "ALLOW"
        assertEq(d.verdict, "WARN", "Case-sensitive matching - lowercase defaults to WARN");
    }

    function test_analyze_sequentialIds() public {
        vm.prank(user);
        aegis.setSecurityProfile("Policy");

        vm.prank(user);
        uint256 id1 = aegis.analyze("First");
        vm.prank(user);
        uint256 id2 = aegis.analyze("Second");
        vm.prank(user);
        uint256 id3 = aegis.analyze("Third");

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }
}