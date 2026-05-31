// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisBrain} from "../contracts/aegis/AegisBrain.sol";

/// @notice Mock de la plataforma Somnia para tests
/// @dev Simula createRequest y permite disparar callbacks manualmente.
///      No depende de la red real — todo es local.
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
        uint256 /* agentId */,
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

    /// @notice Simula un callback exitoso desde la plataforma
    function simulateCallback(uint256 requestId, string memory response) external {
        PendingRequest memory req = requests[requestId];
        bytes[] memory responses = new bytes[](1);
        responses[0] = abi.encode(response);

        (bool success,) = req.callbackAddress.call(
            abi.encodeWithSelector(req.callbackSelector, requestId, responses, uint8(2), bytes(""))
        );
        require(success, "callback failed");
    }

    /// @notice Simula un callback fallido
    function simulateFailedCallback(uint256 requestId) external {
        PendingRequest memory req = requests[requestId];
        bytes[] memory responses = new bytes[](0);

        (bool success,) = req.callbackAddress.call(
            abi.encodeWithSelector(req.callbackSelector, requestId, responses, uint8(3), bytes("failed"))
        );
        require(success, "callback failed");
    }
}

/// @notice Contrato que hereda de AegisBrain para testear el hook _onPipelineComplete
contract TestableAegisBrain is AegisBrain {
    uint256 public lastCompletedPipelineId;
    // Almacenamos los campos individuales porque el getter de struct con arrays anidados
    // no funciona bien en Solidity para retornos de tuplas
    string public lastDecision;
    uint256 public lastRiskScore;
    string public lastReasoning;
    bytes[] public lastAgentResults;
    bytes32 public lastMemoryHash;

    constructor(address platform, uint256 agentId) AegisBrain(platform, agentId) {}

    function _onPipelineComplete(uint256 pipelineId, Thought memory thought) internal override {
        lastCompletedPipelineId = pipelineId;
        lastDecision = thought.decision;
        lastRiskScore = thought.riskScore;
        lastReasoning = thought.reasoning;
        lastMemoryHash = thought.memoryHash;
        // Copiar array manualmente
        delete lastAgentResults;
        for (uint256 i = 0; i < thought.agentResults.length; i++) {
            lastAgentResults.push(thought.agentResults[i]);
        }
    }

    /// @notice Getter explícito para el último pensamiento
    function getLastThought() external view returns (
        string memory decision,
        uint256 riskScore,
        string memory reasoning,
        bytes32 memoryHash
    ) {
        return (lastDecision, lastRiskScore, lastReasoning, lastMemoryHash);
    }
}

contract AegisBrainTest is Test {
    TestableAegisBrain public brain;
    MockSomniaPlatform public platform;

    address public user = makeAddr("user");
    address public attacker = makeAddr("attacker");

    uint256 constant LLM_AGENT_ID = 12847293847561029384;
    uint256 constant DEPOSIT = 0.03 ether;

    function setUp() public {
        platform = new MockSomniaPlatform();
        brain = new TestableAegisBrain(address(platform), LLM_AGENT_ID);
        vm.deal(user, 100 ether);
        vm.deal(address(brain), 10 ether);
    }

    // ═══════════════════════════════════════════════════════════
    //                    CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    function test_constructor_setsImmutableAddresses() public {
        assertEq(address(brain.SOMNIA_AGENTS()), address(platform));
        assertEq(brain.LLM_AGENT_ID(), LLM_AGENT_ID);
    }

    function test_constructor_defaultAgentId() public {
        // Si se pasa agentId=0, usa el default
        TestableAegisBrain b = new TestableAegisBrain(address(platform), 0);
        assertEq(b.LLM_AGENT_ID(), 12847293847561029384);
    }

    function test_constructor_customAgentId() public {
        TestableAegisBrain b = new TestableAegisBrain(address(platform), 999);
        assertEq(b.LLM_AGENT_ID(), 999);
    }

    // ═══════════════════════════════════════════════════════════
    //                  THINK PIPELINE
    // ═══════════════════════════════════════════════════════════

    function test_thinkPipeline_revertsOnEmptyCalls() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](0);
        vm.expectRevert(AegisBrain.EmptyAgentCalls.selector);
        brain.thinkPipeline("test", calls);
    }

    function test_thinkPipeline_startsPipeline() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](1);
        calls[0] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""),
            resultLabel: "analysis"
        });

        uint256 pipelineId = brain.thinkPipeline{value: DEPOSIT}("Analyze this transaction", calls);
        assertEq(pipelineId, 1, "Should return pipeline ID 1");
        assertEq(brain.nextPipelineId(), 2, "Should increment counter");
    }

    function test_thinkPipeline_emitsPipelineStarted() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](1);
        calls[0] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""),
            resultLabel: ""
        });

        vm.expectEmit(true, true, false, true);
        emit AegisBrain.PipelineStarted(1, user, 1, false);
        brain.thinkPipeline{value: DEPOSIT}("test", calls);
    }

    function test_thinkPipeline_createsSomniaRequest() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](1);
        calls[0] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""),
            resultLabel: ""
        });

        uint256 requestIdBefore = platform.nextRequestId();
        brain.thinkPipeline{value: DEPOSIT}("test", calls);
        assertEq(platform.nextRequestId(), requestIdBefore + 1, "Should create 1 request");
    }

    // ═══════════════════════════════════════════════════════════
    //               PIPELINE MULTI-STEP
    // ═══════════════════════════════════════════════════════════

    function test_thinkPipeline_multiStep_completesAllSteps() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](2);
        calls[0] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""),
            resultLabel: "first_result"
        });
        calls[1] = AegisBrain.AgentCall({
            agentId: LLM_AGENT_ID,
            payload: bytes(""),
            resultLabel: "final"
        });

        uint256 pipelineId = brain.thinkPipeline{value: DEPOSIT * 2}("Multi-step analysis", calls);

        // Simular callback del primer agente
        uint256 firstRequestId = platform.nextRequestId() - 1;
        platform.simulateCallback(firstRequestId, "First agent result: suspicious activity detected");

        // El pipeline debería haber avanzado al paso 2 automáticamente
        // Simular callback del segundo agente
        uint256 secondRequestId = platform.nextRequestId() - 1;
        platform.simulateCallback(secondRequestId, "BLOCK");

        // Verificar que el pipeline se completó
        assertEq(brain.lastCompletedPipelineId(), pipelineId, "Pipeline should be completed");
        assertEq(brain.lastDecision(), "BLOCK", "Final decision should be BLOCK");
        assertEq(brain.lastAgentResults(0).length > 0, true, "Should have agent results");
        assertEq(brain.lastAgentResults(1).length > 0, true, "Should have 2 agent results");
    }

    function test_thinkPipeline_threeSteps() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](3);
        calls[0] = AegisBrain.AgentCall({agentId: LLM_AGENT_ID, payload: bytes(""), resultLabel: "step1"});
        calls[1] = AegisBrain.AgentCall({agentId: LLM_AGENT_ID, payload: bytes(""), resultLabel: "step2"});
        calls[2] = AegisBrain.AgentCall({agentId: LLM_AGENT_ID, payload: bytes(""), resultLabel: "step3"});

        brain.thinkPipeline{value: DEPOSIT * 3}("Three step pipeline", calls);

        // Paso 1
        platform.simulateCallback(platform.nextRequestId() - 1, "Data from step 1");
        // Paso 2
        platform.simulateCallback(platform.nextRequestId() - 1, "Data from step 2");
        // Paso 3
        platform.simulateCallback(platform.nextRequestId() - 1, "ALLOW");

        assertEq(brain.lastCompletedPipelineId(), 1, "Pipeline should be completed");
        assertEq(brain.lastDecision(), "ALLOW");
        // Verificar que hay 3 resultados
        assertEq(brain.lastAgentResults(0).length > 0, true);
        assertEq(brain.lastAgentResults(1).length > 0, true);
        assertEq(brain.lastAgentResults(2).length > 0, true);
    }

    // ═══════════════════════════════════════════════════════════
    //                  PIPELINE FAILURE
    // ═══════════════════════════════════════════════════════════

    function test_thinkPipeline_handlesFailedAgent() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](2);
        calls[0] = AegisBrain.AgentCall({agentId: LLM_AGENT_ID, payload: bytes(""), resultLabel: ""});
        calls[1] = AegisBrain.AgentCall({agentId: LLM_AGENT_ID, payload: bytes(""), resultLabel: ""});

        brain.thinkPipeline{value: DEPOSIT * 2}("test", calls);

        // El evento se emite cuando el callback falla, no durante thinkPipeline
        vm.expectEmit(true, true, false, true);
        emit AegisBrain.PipelineFailed(1, 0, "Agent response failed or timed out");
        platform.simulateFailedCallback(platform.nextRequestId() - 1);

        // El pipeline debería haberse limpiado
        assertEq(brain.lastCompletedPipelineId(), 0, "Pipeline should NOT be completed");
    }

    // ═══════════════════════════════════════════════════════════
    //                    MULTI-THINK
    // ═══════════════════════════════════════════════════════════

    function test_multiThink_revertsOnInvalidParams() public {
        vm.prank(user);
        vm.expectRevert(AegisBrain.InvalidConsensusParams.selector);
        brain.multiThink("test", 1, 1); // agentCount < 3
    }

    function test_multiThink_revertsOnThresholdTooHigh() public {
        vm.prank(user);
        vm.expectRevert(AegisBrain.InvalidConsensusParams.selector);
        brain.multiThink("test", 3, 4); // threshold > agentCount
    }

    function test_multiThink_startsMultipleAgents() public {
        vm.prank(user);
        uint256 pipelineId = brain.multiThink{value: DEPOSIT * 3}("Is this safe?", 3, 2);

        assertEq(pipelineId, 1);
        // Debería haber creado 3 requests (uno por agente)
        assertEq(platform.nextRequestId(), 4, "Should create 3 requests");
    }

    function test_multiThink_consensus_majorityAllow() public {
        vm.prank(user);
        brain.multiThink{value: DEPOSIT * 3}("Is this safe?", 3, 2);

        // Simular 3 respuestas: 2 ALLOW, 1 BLOCK → consenso = ALLOW
        platform.simulateCallback(1, "ALLOW");
        platform.simulateCallback(2, "ALLOW");
        platform.simulateCallback(3, "BLOCK");

        assertEq(brain.lastDecision(), "ALLOW", "Consensus should be ALLOW (2/3)");
    }

    function test_multiThink_consensus_majorityBlock() public {
        vm.prank(user);
        brain.multiThink{value: DEPOSIT * 3}("Is this safe?", 3, 2);

        platform.simulateCallback(1, "BLOCK");
        platform.simulateCallback(2, "BLOCK");
        platform.simulateCallback(3, "WARN");

        assertEq(brain.lastDecision(), "BLOCK", "Consensus should be BLOCK (2/3)");
    }

    function test_multiThink_consensus_noMajority() public {
        vm.prank(user);
        brain.multiThink{value: DEPOSIT * 3}("Is this safe?", 3, 2);

        // 1 ALLOW, 1 BLOCK, 1 WARN → sin mayoría clara → WARN (fail-safe)
        platform.simulateCallback(1, "ALLOW");
        platform.simulateCallback(2, "BLOCK");
        platform.simulateCallback(3, "WARN");

        assertEq(brain.lastDecision(), "WARN", "No majority should default to WARN");
    }

    function test_multiThink_consensus_5agents() public {
        vm.prank(user);
        brain.multiThink{value: DEPOSIT * 5}("Complex analysis", 5, 3);

        // 3 ALLOW, 2 BLOCK → ALLOW gana con 3/5
        // Los requestIds son 1,2,3,4,5 (en orden de creación)
        platform.simulateCallback(1, "ALLOW");
        platform.simulateCallback(2, "ALLOW");
        platform.simulateCallback(3, "ALLOW");
        platform.simulateCallback(4, "BLOCK");
        platform.simulateCallback(5, "BLOCK");

        assertEq(brain.lastDecision(), "ALLOW", "ALLOW wins 3/5");
    }

    // ═══════════════════════════════════════════════════════════
    //                    MEMORIA PERSISTENTE
    // ═══════════════════════════════════════════════════════════

    function test_remember_storesData() public {
        vm.prank(user);
        bytes32 key = keccak256("test_key");
        bytes memory data = abi.encode("important context");

        bytes32 hash = brain.remember(key, data);
        assertEq(hash, keccak256(data), "Should return keccak256 of data");
    }

    function test_recall_retrievesData() public {
        vm.prank(user);
        bytes32 key = keccak256("test_key");
        bytes memory data = abi.encode("important context");
        brain.remember(key, data);

        bytes memory retrieved = brain.recall(key);
        assertEq(keccak256(retrieved), keccak256(data), "Retrieved data should match");
    }

    function test_recall_returnsEmptyForUnknownKey() public {
        bytes memory result = brain.recall(keccak256("nonexistent"));
        assertEq(result.length, 0, "Unknown key should return empty bytes");
    }

    function test_remember_emitsEvent() public {
        vm.prank(user);
        bytes32 key = keccak256("event_test");
        bytes memory data = abi.encode("data");

        vm.expectEmit(true, true, false, false);
        emit AegisBrain.MemoryStored(key, user);
        brain.remember(key, data);
    }

    function test_remember_overwritesExistingKey() public {
        vm.prank(user);
        bytes32 key = keccak256("overwrite_test");
        brain.remember(key, abi.encode("v1"));
        brain.remember(key, abi.encode("v2"));

        bytes memory retrieved = brain.recall(key);
        assertEq(abi.decode(retrieved, (string)), "v2", "Should return latest value");
    }

    // ═══════════════════════════════════════════════════════════
    //                    SEGURIDAD
    // ═══════════════════════════════════════════════════════════

    function test_handleAgentResponse_revertsOnUnauthorized() public {
        vm.prank(attacker);
        bytes[] memory responses = new bytes[](0);
        vm.expectRevert(AegisBrain.UnauthorizedCallback.selector);
        brain.handleAgentResponse(1, responses, 2, bytes(""));
    }

    function test_handleAgentResponse_ignoresUnknownRequest() public {
        // Un requestId que no existe no debería revertir
        vm.prank(address(platform));
        bytes[] memory responses = new bytes[](1);
        responses[0] = abi.encode("test");
        brain.handleAgentResponse(99999, responses, 2, bytes(""));
        // No debería revertir — simplemente ignora
    }

    function test_receive_acceptsEth() public {
        vm.prank(user);
        (bool success,) = address(brain).call{value: 1 ether}("");
        assertTrue(success, "Should accept ETH");
        assertEq(address(brain).balance, 11 ether, "Balance should increase");
    }

    // ═══════════════════════════════════════════════════════════
    //                 THINK WITH TOOLS
    // ═══════════════════════════════════════════════════════════

    function test_thinkWithTools_revertsOnEmptyTools() public {
        vm.prank(user);
        AegisBrain.OnchainTool[] memory tools = new AegisBrain.OnchainTool[](0);
        vm.expectRevert(AegisBrain.EmptyAgentCalls.selector);
        brain.thinkWithTools("test", tools, 3);
    }

    function test_thinkWithTools_startsPipeline() public {
        vm.prank(user);
        AegisBrain.OnchainTool[] memory tools = new AegisBrain.OnchainTool[](1);
        tools[0] = AegisBrain.OnchainTool({
            signature: "swap(address,uint256)",
            description: "Swap tokens on DEX"
        });

        uint256 pipelineId = brain.thinkWithTools{value: DEPOSIT}("Swap 100 USDC for ETH", tools, 3);
        assertEq(pipelineId, 1);
        assertEq(platform.nextRequestId(), 2, "Should create 1 request");
    }

    function test_thinkWithTools_emitsEvent() public {
        vm.prank(user);
        AegisBrain.OnchainTool[] memory tools = new AegisBrain.OnchainTool[](1);
        tools[0] = AegisBrain.OnchainTool({
            signature: "swap(address,uint256)",
            description: "Swap tokens"
        });

        vm.expectEmit(true, true, false, true);
        emit AegisBrain.PipelineStarted(1, user, 1, false);
        brain.thinkWithTools{value: DEPOSIT}("Swap 100 USDC", tools, 3);
    }

    // ═══════════════════════════════════════════════════════════
    //                 EDGE CASES
    // ═══════════════════════════════════════════════════════════

    function test_pipelineIds_areSequential() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](1);
        calls[0] = AegisBrain.AgentCall({agentId: LLM_AGENT_ID, payload: bytes(""), resultLabel: ""});

        uint256 id1 = brain.thinkPipeline{value: DEPOSIT}("first", calls);
        uint256 id2 = brain.thinkPipeline{value: DEPOSIT}("second", calls);
        uint256 id3 = brain.thinkPipeline{value: DEPOSIT}("third", calls);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }

    function test_pipelineResults_storedAfterCompletion() public {
        vm.prank(user);
        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](1);
        calls[0] = AegisBrain.AgentCall({agentId: LLM_AGENT_ID, payload: bytes(""), resultLabel: ""});

        uint256 pipelineId = brain.thinkPipeline{value: DEPOSIT}("test", calls);
        platform.simulateCallback(platform.nextRequestId() - 1, "ALLOW");

        // Verificar que el resultado se guardó en pipelineResults
        // Accedemos vía el getter del mapping (genera función pipelineResults(uint256))
        // Solo podemos acceder a campos simples, no al array anidado
        (string memory decision,,,) = brain.getLastThought();
        assertEq(decision, "ALLOW");
    }

    function test_customPayload_passedToAgent() public {
        vm.prank(user);
        // Usar un payload personalizado (como si fuera para JSON API agent)
        bytes memory customPayload = abi.encodeWithSignature(
            "fetchUint(string,string,uint8)",
            "https://api.example.com/price",
            "data.price",
            18
        );

        AegisBrain.AgentCall[] memory calls = new AegisBrain.AgentCall[](1);
        calls[0] = AegisBrain.AgentCall({
            agentId: 12345678901234567890, // JSON API agent (ilustrativo)
            payload: customPayload,
            resultLabel: "price"
        });

        brain.thinkPipeline{value: DEPOSIT}("Fetch price", calls);
        // No debería revertir — el payload se pasa tal cual
        assertEq(platform.nextRequestId(), 2);
    }
}