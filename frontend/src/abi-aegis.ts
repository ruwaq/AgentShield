export const aegisBrainV2Abi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "platform",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "analyze",
    "inputs": [
      {
        "name": "intent",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "analysisId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "decisions",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "verdict",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "riskScore",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reasoning",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "memoryHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deepAnalyze",
    "inputs": [
      {
        "name": "intent",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "targetAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "valueWei",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "analysisId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "fulfillManual",
    "inputs": [
      {
        "name": "analysisId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "llmResponse",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getDecision",
    "inputs": [
      {
        "name": "analysisId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AegisBrainV2.SecurityDecision",
        "components": [
          {
            "name": "verdict",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "riskScore",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reasoning",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "evidence",
            "type": "string[]",
            "internalType": "string[]"
          },
          {
            "name": "timestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "memoryHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProfile",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AegisBrainV2.SecurityProfile",
        "components": [
          {
            "name": "naturalLanguagePolicy",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastUpdated",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "decisionsMade",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "threatsBlocked",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "active",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getStats",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "decisionsMade",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "threatsBlocked",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "policy",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "handleAgentResponse",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "responses",
        "type": "bytes[]",
        "internalType": "bytes[]"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "llmAgentId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "memoryStore",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextAnalysisId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "profiles",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "naturalLanguagePolicy",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "createdAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lastUpdated",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "decisionsMade",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "threatsBlocked",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "recall",
    "inputs": [
      {
        "name": "key",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "remember",
    "inputs": [
      {
        "name": "key",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSecurityProfile",
    "inputs": [
      {
        "name": "naturalLanguagePolicy",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "profileId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "somniaAgents",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ISomniaAgents"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AnalysisStarted",
    "inputs": [
      {
        "name": "analysisId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "intent",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DecisionMade",
    "inputs": [
      {
        "name": "analysisId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "verdict",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "riskScore",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EvidenceCollected",
    "inputs": [
      {
        "name": "analysisId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "source",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "data",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MemoryStored",
    "inputs": [
      {
        "name": "key",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "author",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProfileCreated",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "policy",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AnalysisNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EmptyIntent",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientDeposit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedCallback",
    "inputs": []
  }
] as const;
