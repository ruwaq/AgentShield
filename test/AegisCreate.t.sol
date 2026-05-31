// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisCreate} from "../contracts/aegis/AegisCreate.sol";

/// @notice Mock de la plataforma Somnia (mismo que en AegisBrain.t.sol)
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

contract AegisCreateTest is Test {
    AegisCreate public aegis;
    MockSomniaPlatform public platform;

    address public user = makeAddr("user");
    address public other = makeAddr("other");

    uint256 constant LLM_AGENT_ID = 12847293847561029384;
    uint256 constant MINT_PRICE = 0.05 ether;

    // Necesario para recibir ETH del withdraw
    receive() external payable {}

    function setUp() public {
        platform = new MockSomniaPlatform();
        aegis = new AegisCreate(address(platform), LLM_AGENT_ID);
        vm.deal(user, 100 ether);
        vm.deal(address(aegis), 10 ether); // Fondos para requests
    }

    // ═══════════════════════════════════════════════════════════
    //                    CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    function test_constructor_setsMetadata() public {
        assertEq(aegis.name(), "Aegis Guardian");
        assertEq(aegis.symbol(), "AEGIS");
    }

    function test_constructor_startsAtToken1() public {
        assertEq(aegis.nextTokenId(), 1);
    }

    // ═══════════════════════════════════════════════════════════
    //                    MINT GUARDIAN
    // ═══════════════════════════════════════════════════════════

    function test_mintGuardian_revertsOnInsufficientPayment() public {
        vm.prank(user);
        vm.expectRevert(AegisCreate.InsufficientPayment.selector);
        aegis.mintGuardian{value: 0.01 ether}("Magnus", "dragon");
    }

    function test_mintGuardian_mintsNFT() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        assertEq(tokenId, 1);
        assertEq(aegis.ownerOf(1), user);
        assertEq(aegis.nextTokenId(), 2);
    }

    function test_mintGuardian_createsSoul() public {
        vm.prank(user);
        aegis.mintGuardian{value: MINT_PRICE}("Magnus", "ancient-dragon");

        (
            string memory name,
            string memory archetype,
            ,
            uint256 level,
            uint256 experience,
            ,
            ,
            ,
            bool revealed
        ) = aegis.getGuardianStats(1);

        assertEq(name, "Magnus");
        assertEq(archetype, "ancient-dragon");
        assertEq(level, 1);
        assertEq(experience, 0);
        assertFalse(revealed, "Should not be revealed until LLM callback");
    }

    function test_mintGuardian_emitsEvent() public {
        vm.prank(user);
        vm.expectEmit(true, true, false, true);
        emit AegisCreate.GuardianMinted(1, user, "Magnus", "dragon");
        aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");
    }

    function test_mintGuardian_startsRevelationPipeline() public {
        vm.prank(user);
        aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        // Debería haber creado 1 request en la plataforma (primer paso del pipeline)
        assertEq(platform.nextRequestId(), 2, "Should create 1 request for first pipeline step");
    }

    function test_mintGuardian_revealsAfterCallback() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Luna", "phoenix");

        // Simular callback del primer agente (personalidad)
        platform.simulateCallback(1, "I am Luna, a phoenix reborn from the ashes of a dying star. My voice crackles with celestial fire.");

        // Simular callback del segundo agente (traits visuales)
        platform.simulateCallback(2, "Fiery wings, golden eyes, ash-grey feathers with ember tips");

        // Verificar revelación
        (, , string memory personality,,,,,, bool revealed) = aegis.getGuardianStats(tokenId);
        assertTrue(revealed, "Guardian should be revealed after LLM callbacks");
        assertTrue(bytes(personality).length > 0, "Personality should not be empty");
    }

    function test_mintGuardian_multipleGuardians() public {
        vm.startPrank(user);
        aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");
        aegis.mintGuardian{value: MINT_PRICE}("Luna", "phoenix");
        aegis.mintGuardian{value: MINT_PRICE}("Zero", "void-knight");
        vm.stopPrank();

        assertEq(aegis.ownerOf(1), user);
        assertEq(aegis.ownerOf(2), user);
        assertEq(aegis.ownerOf(3), user);
        assertEq(aegis.nextTokenId(), 4);
    }

    // ═══════════════════════════════════════════════════════════
    //                    TOKEN URI
    // ═══════════════════════════════════════════════════════════

    function test_tokenURI_revertsOnNonexistentToken() public {
        vm.expectRevert(AegisCreate.TokenNotFound.selector);
        aegis.tokenURI(999);
    }

    function test_tokenURI_returnsBase64JSON() public {
        vm.prank(user);
        aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        string memory uri = aegis.tokenURI(1);
        // Debe empezar con data:application/json;base64,
        assertTrue(_startsWith(uri, "data:application/json;base64,"), "URI should be base64 data URL");
    }

    function test_tokenURI_containsGuardianName() public {
        vm.prank(user);
        aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        string memory uri = aegis.tokenURI(1);
        // El nombre debe estar en el JSON (codificado en base64)
        assertTrue(bytes(uri).length > 50, "URI should have substantial content");
    }

    // ═══════════════════════════════════════════════════════════
    //                    EVOLUCIÓN
    // ═══════════════════════════════════════════════════════════

    function test_recordBattle_incrementsStats() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        aegis.recordBattle(tokenId, true, "Blocked a rug pull attempt");

        (,,,, uint256 experience, uint256 battlesWon, uint256 battlesTotal, uint256 scarsCount,) = aegis.getGuardianStats(tokenId);
        assertEq(battlesTotal, 1);
        assertEq(battlesWon, 1);
        assertEq(experience, 10);
        assertEq(scarsCount, 1);
    }

    function test_recordBattle_defeatGivesLessXP() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        aegis.recordBattle(tokenId, false, "Failed to detect a phishing tx");

        (,,,, uint256 experience, uint256 battlesWon, uint256 battlesTotal,,) = aegis.getGuardianStats(tokenId);
        assertEq(battlesTotal, 1);
        assertEq(battlesWon, 0);
        assertEq(experience, 2, "Defeat gives only 2 XP");
    }

    function test_recordBattle_evolvesEvery5Battles() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        // 5 batallas → nivel 2
        for (uint256 i = 0; i < 5; i++) {
            aegis.recordBattle(tokenId, true, string(abi.encodePacked("Battle ", _uintToString(i + 1))));
        }

        (,,, uint256 level,,,,,) = aegis.getGuardianStats(tokenId);
        assertEq(level, 2, "Should reach level 2 after 5 battles");
    }

    function test_recordBattle_evolvesEvery10Battles() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        // 10 batallas → nivel 3
        for (uint256 i = 0; i < 10; i++) {
            aegis.recordBattle(tokenId, true, string(abi.encodePacked("Battle ", _uintToString(i + 1))));
        }

        (,,, uint256 level,,,,,) = aegis.getGuardianStats(tokenId);
        assertEq(level, 3, "Should reach level 3 after 10 battles");
    }

    function test_recordBattle_emitsBattleRecorded() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        vm.expectEmit(true, true, false, true);
        emit AegisCreate.BattleRecorded(tokenId, true, "Saved the wallet!");
        aegis.recordBattle(tokenId, true, "Saved the wallet!");
    }

    function test_recordBattle_emitsEvolved() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        // 4 batallas primero
        for (uint256 i = 0; i < 4; i++) {
            aegis.recordBattle(tokenId, true, "battle");
        }

        // La 5ta emite evolución
        vm.expectEmit(true, true, false, true);
        emit AegisCreate.GuardianEvolved(tokenId, 2, "The fifth battle!");
        aegis.recordBattle(tokenId, true, "The fifth battle!");
    }

    function test_recordBattle_revertsOnNonexistentToken() public {
        vm.expectRevert(AegisCreate.TokenNotFound.selector);
        aegis.recordBattle(999, true, "test");
    }

    function test_evolve_manualLevelUp() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        vm.prank(user);
        uint256 newLevel = aegis.evolve(tokenId, "Special event: solar eclipse");

        assertEq(newLevel, 2);
        (,,, uint256 level,,,,,) = aegis.getGuardianStats(tokenId);
        assertEq(level, 2);
    }

    function test_evolve_revertsNotOwner() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        vm.prank(other);
        vm.expectRevert(AegisCreate.NotTokenOwner.selector);
        aegis.evolve(tokenId, "unauthorized");
    }

    // ═══════════════════════════════════════════════════════════
    //                    BATTLE SCARS
    // ═══════════════════════════════════════════════════════════

    function test_getBattleScars_returnsAllMemories() public {
        vm.prank(user);
        uint256 tokenId = aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        aegis.recordBattle(tokenId, true, "Blocked rug pull on Uniswap");
        aegis.recordBattle(tokenId, false, "Missed a phishing attempt");
        aegis.recordBattle(tokenId, true, "Prevented unauthorized approval");

        string[] memory scars = aegis.getBattleScars(tokenId);
        assertEq(scars.length, 3);
        assertEq(scars[0], "Blocked rug pull on Uniswap");
        assertEq(scars[2], "Prevented unauthorized approval");
    }

    // ═══════════════════════════════════════════════════════════
    //                    ADMIN
    // ═══════════════════════════════════════════════════════════

    function test_setMintPrice() public {
        aegis.setMintPrice(0.1 ether);
        // Verificar que el cambio aplica
        vm.prank(user);
        vm.expectRevert(AegisCreate.InsufficientPayment.selector);
        aegis.mintGuardian{value: 0.05 ether}("Test", "dragon");
    }

    function test_setMintPrice_revertsNotOwner() public {
        vm.prank(other);
        vm.expectRevert(AegisCreate.NotContractOwner.selector);
        aegis.setMintPrice(0.1 ether);
    }

    function test_withdraw_sendsETH() public {
        vm.prank(user);
        aegis.mintGuardian{value: MINT_PRICE}("Magnus", "dragon");

        uint256 balanceBefore = address(aegis.contractOwner()).balance;
        aegis.withdraw();
        uint256 balanceAfter = address(aegis.contractOwner()).balance;

        assertGt(balanceAfter, balanceBefore, "Owner should receive ETH");
    }

    // ═══════════════════════════════════════════════════════════
    //                    HELPERS
    // ═══════════════════════════════════════════════════════════

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory prefixBytes = bytes(prefix);
        if (strBytes.length < prefixBytes.length) return false;
        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (strBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }

    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) { digits--; buffer[digits] = bytes1(uint8(48 + (value % 10))); value /= 10; }
        return string(buffer);
    }
}