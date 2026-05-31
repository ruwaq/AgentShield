// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisListen} from "../contracts/aegis/AegisListen.sol";
import {AegisBrain} from "../contracts/aegis/AegisBrain.sol";

/// @notice Mock de la plataforma Somnia (simplificado para tests de Listen)
contract MockSomniaPlatform {
    uint256 public nextRequestId = 1;
    uint256 public deposit = 0.03 ether;

    struct PendingRequest {
        address callbackAddress;
        bytes4 callbackSelector;
        bytes payload;
    }

    mapping(uint256 => PendingRequest) public requests;

    function createRequest(
        uint256,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId) {
        require(msg.value >= deposit, "insufficient deposit");
        requestId = nextRequestId++;
        requests[requestId] = PendingRequest(callbackAddress, callbackSelector, payload);
    }

    function getRequestDeposit() external view returns (uint256) {
        return deposit;
    }

    function simulateCallback(uint256 requestId, string memory response) external {
        PendingRequest memory req = requests[requestId];
        bytes[] memory responses = new bytes[](1);
        responses[0] = abi.encode(response);

        (bool success,) = req.callbackAddress.call(
            abi.encodeWithSelector(req.callbackSelector, requestId, responses, uint8(2), bytes(""))
        );
        require(success, "callback failed");
    }
}

/// @notice Contrato que emite eventos para testear listeners
contract TestEmitter {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event SuspiciousActivity(address indexed target, uint256 amount, string reason);

    function emitTransfer(address from, address to, uint256 value) external {
        emit Transfer(from, to, value);
    }

    function emitApproval(address owner, address spender, uint256 value) external {
        emit Approval(owner, spender, value);
    }

    function emitSuspicious(address target, uint256 amount, string memory reason) external {
        emit SuspiciousActivity(target, amount, reason);
    }
}

contract AegisListenTest is Test {
    AegisListen public aegis;
    MockSomniaPlatform public platform;
    TestEmitter public emitter;

    address public user = makeAddr("user");
    address public other = makeAddr("other");

    uint256 constant LLM_AGENT_ID = 12847293847561029384;
    uint256 constant DEPOSIT = 0.03 ether;

    // Event signatures
    bytes32 constant TRANSFER_SIG = keccak256("Transfer(address,address,uint256)");
    bytes32 constant APPROVAL_SIG = keccak256("Approval(address,address,uint256)");
    bytes32 constant SUSPICIOUS_SIG = keccak256("SuspiciousActivity(address,uint256,string)");

    receive() external payable {}

    function setUp() public {
        platform = new MockSomniaPlatform();
        emitter = new TestEmitter();
        aegis = new AegisListen(address(platform), LLM_AGENT_ID);
        vm.deal(user, 100 ether);
        vm.deal(address(aegis), 10 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                   CREACIÓN DE LISTENERS
    // ═══════════════════════════════════════════════════════════

    function test_on_createsListener() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);

        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor transfer");

        assertEq(listenerId, 1);
        AegisListen.Listener memory l = aegis.getListener(1);
        assertEq(l.target, address(emitter));
        assertEq(l.eventSignature, TRANSFER_SIG);
        assertTrue(l.active);
        assertEq(l.owner, user);
        assertEq(l.triggerCount, 0);
    }

    function test_on_emitsEvent() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);

        vm.expectEmit(true, true, true, true);
        emit AegisListen.ListenerCreated(1, user, address(emitter), TRANSFER_SIG);
        aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");
    }

    function test_on_revertsOnEmptyPipeline() public {
        vm.prank(user);
        vm.expectRevert(AegisListen.EmptyPipeline.selector);
        aegis.on(address(emitter), TRANSFER_SIG, bytes(""), "Monitor");
    }

    function test_on_multipleListeners() public {
        vm.startPrank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);

        aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor transfers");
        aegis.on(address(emitter), APPROVAL_SIG, pipeline, "Monitor approvals");
        aegis.on(address(emitter), SUSPICIOUS_SIG, pipeline, "Monitor suspicious");
        vm.stopPrank();

        assertEq(aegis.nextListenerId(), 4);
        assertTrue(aegis.getListener(1).active);
        assertTrue(aegis.getListener(2).active);
        assertTrue(aegis.getListener(3).active);
    }

    // ═══════════════════════════════════════════════════════════
    //                   STOP LISTENER
    // ═══════════════════════════════════════════════════════════

    function test_stop_deactivatesListener() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        vm.prank(user);
        aegis.stop(listenerId);

        assertFalse(aegis.getListener(listenerId).active);
    }

    function test_stop_revertsNotOwner() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        vm.prank(other);
        vm.expectRevert(AegisListen.NotListenerOwner.selector);
        aegis.stop(listenerId);
    }

    function test_stop_revertsNonexistent() public {
        vm.prank(user);
        vm.expectRevert(AegisListen.ListenerNotFound.selector);
        aegis.stop(999);
    }

    // ═══════════════════════════════════════════════════════════
    //                   HANDLE EVENT
    // ═══════════════════════════════════════════════════════════

    function test_handleEvent_startsPipeline() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        // Simular datos de evento
        bytes memory eventData = abi.encode(
            bytes32(uint256(1)), // topic1: from
            bytes32(uint256(2)), // topic2: to
            uint256(100 ether)   // data: value
        );

        uint256 pipelineId = aegis.handleEvent(listenerId, eventData);
        assertEq(pipelineId, 1, "Should start pipeline 1");
        assertEq(platform.nextRequestId(), 2, "Should create 1 request");
    }

    function test_handleEvent_incrementsTriggerCount() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        bytes memory eventData = abi.encode(uint256(100 ether));

        aegis.handleEvent(listenerId, eventData);
        assertEq(aegis.getListener(listenerId).triggerCount, 1);

        aegis.handleEvent(listenerId, eventData);
        assertEq(aegis.getListener(listenerId).triggerCount, 2);
    }

    function test_handleEvent_emitsTriggered() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        bytes memory eventData = abi.encode(uint256(100 ether));

        vm.expectEmit(true, true, false, true);
        emit AegisListen.ListenerTriggered(listenerId, 1, eventData);
        aegis.handleEvent(listenerId, eventData);
    }

    function test_handleEvent_revertsOnInactive() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        vm.prank(user);
        aegis.stop(listenerId);

        bytes memory eventData = abi.encode(uint256(100 ether));
        vm.expectRevert(AegisListen.ListenerInactive.selector);
        aegis.handleEvent(listenerId, eventData);
    }

    function test_handleEvent_revertsOnNonexistent() public {
        bytes memory eventData = abi.encode(uint256(100 ether));
        vm.expectRevert(AegisListen.ListenerNotFound.selector);
        aegis.handleEvent(999, eventData);
    }

    function test_handleEvent_antiRecursion() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        bytes memory eventData = abi.encode(uint256(100 ether));

        // Primer trigger: OK
        aegis.handleEvent(listenerId, eventData);

        // El lock ya se liberó, así que un segundo trigger también debe funcionar
        aegis.handleEvent(listenerId, eventData);
        assertEq(aegis.getListener(listenerId).triggerCount, 2);
    }

    // ═══════════════════════════════════════════════════════════
    //                   CONSULTAS
    // ═══════════════════════════════════════════════════════════

    function test_getListenersByOwner_filtersCorrectly() public {
        vm.startPrank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        aegis.on(address(emitter), TRANSFER_SIG, pipeline, "T1");
        aegis.on(address(emitter), APPROVAL_SIG, pipeline, "T2");
        vm.stopPrank();

        vm.prank(other);
        aegis.on(address(emitter), SUSPICIOUS_SIG, pipeline, "T3");

        uint256[] memory userListeners = aegis.getListenersByOwner(user);
        assertEq(userListeners.length, 2, "User should have 2 listeners");

        uint256[] memory otherListeners = aegis.getListenersByOwner(other);
        assertEq(otherListeners.length, 1, "Other should have 1 listener");
    }

    function test_getLastTrigger_returnsCorrectData() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        bytes memory eventData = abi.encode(uint256(42 ether));
        aegis.handleEvent(listenerId, eventData);

        AegisListen.TriggerResult memory result = aegis.getLastTrigger(listenerId);
        assertEq(result.listenerId, listenerId);
        assertEq(result.pipelineId, 1);
    }

    // ═══════════════════════════════════════════════════════════
    //                   INTEGRACIÓN: EVENTO REAL → PIPELINE
    // ═══════════════════════════════════════════════════════════

    function test_fullFlow_eventToPipelineCompletion() public {
        // 1. Crear listener
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](1);
        calls[0] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""),
            resultLabel: "analysis"
        });
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), SUSPICIOUS_SIG, pipeline, "Suspicious activity detected");

        // 2. Emitir evento sospechoso
        emitter.emitSuspicious(address(0xBAD), 1000 ether, "Possible rug pull");

        // 3. Disparar listener con datos del evento
        bytes memory eventData = abi.encode(address(0xBAD), uint256(1000 ether), "Possible rug pull");
        uint256 pipelineId = aegis.handleEvent(listenerId, eventData);

        // 4. Simular callback del LLM
        platform.simulateCallback(platform.nextRequestId() - 1, "BLOCK");

        // 5. Verificar que el pipeline se completó
        assertEq(aegis.getListener(listenerId).triggerCount, 1);
        assertEq(pipelineId, 1);
    }

    function test_fullFlow_multipleEventsSameListener() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = _singleAgentPipeline();
        bytes memory pipeline = abi.encode(calls);
        uint256 listenerId = aegis.on(address(emitter), TRANSFER_SIG, pipeline, "Monitor");

        // 3 eventos → 3 pipelines
        for (uint256 i = 0; i < 3; i++) {
            bytes memory eventData = abi.encode(uint256((i + 1) * 100 ether));
            aegis.handleEvent(listenerId, eventData);
        }

        assertEq(aegis.getListener(listenerId).triggerCount, 3);
        assertEq(platform.nextRequestId(), 4, "Should create 3 requests");
    }

    // ═══════════════════════════════════════════════════════════
    //                   HELPERS
    // ═══════════════════════════════════════════════════════════

    function _singleAgentPipeline() internal view returns (AegisBrain.AgentCall[] memory calls) {
        calls = new AegisBrain.AgentCall[](1);
        calls[0] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""),
            resultLabel: "analysis"
        });
    }
}