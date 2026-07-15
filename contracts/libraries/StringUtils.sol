// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StringUtils — Utilidades de conversión a string gas-efficient
/// @notice Funciones puras para convertir tipos nativos de Solidity a su
///         representación en string. Extraídas de AgentShieldRegistry, AegisBrain,
///         AegisBrainV2 y AegisCreate para eliminar duplicación.
/// @dev Todas las funciones son internal pure. Se usan principalmente para
///      construir prompts de LLM y mensajes de log on-chain.
library StringUtils {
    /// @notice Convierte un uint256 a su representación decimal en string
    /// @dev Implementación gas-efficient sin usar Strings.toString() de OZ
    function uintToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 j = v;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory b = new bytes(len);
        while (v != 0) {
            len--;
            b[len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }

    /// @notice Convierte un address a string hexadecimal (0x...)
    /// @dev Produce 42 caracteres (0x + 40 hex chars para 20 bytes).
    ///      Antes producía 66 caracteres (bytes32 rellenado con ceros), lo que
    ///      contaminaba el contexto del LLM y desperdiciaba gas de almacenamiento.
    function addrToString(address a) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        uint160 addr = uint160(a);
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(addr >> (8 * (19 - i)));
            str[2 + i * 2] = alphabet[b >> 4];
            str[3 + i * 2] = alphabet[b & 0x0f];
        }
        return string(str);
    }

    /// @notice Convierte un bytes4 a string hexadecimal (0x...)
    /// @dev Produce 10 caracteres (0x + 8 hex chars para 4 bytes).
    ///      Antes producía 66 caracteres (bytes32 rellenado con ceros), lo que
    ///      contaminaba el contexto del LLM y desperdiciaba gas de almacenamiento.
    function bytes4ToString(bytes4 b) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(10);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 4; i++) {
            str[2 + i * 2] = alphabet[uint256(uint8(b[i] >> 4))];
            str[3 + i * 2] = alphabet[uint256(uint8(b[i] & 0x0f))];
        }
        return string(str);
    }

    /// @notice Convierte un bytes32 a string hexadecimal (0x...)
    function bytes32ToString(bytes32 data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(66);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            str[2 + i * 2] = alphabet[uint256(uint8(data[i] >> 4))];
            str[3 + i * 2] = alphabet[uint256(uint8(data[i] & 0x0f))];
        }
        return string(str);
    }

    /// @notice Convierte un Decision enum a string
    /// @dev Asume los valores: NONE=0, ALLOW=1, WARN=2, BLOCK=3
    function decisionToString(uint8 d) internal pure returns (string memory) {
        if (d == 1) return "ALLOW";
        if (d == 2) return "WARN";
        if (d == 3) return "BLOCK";
        return "NONE";
    }
}