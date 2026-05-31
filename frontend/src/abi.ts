export const agentShieldAbi = [
  {
    type: "function", name: "createPolicy", stateMutability: "nonpayable",
    inputs: [{ name: "maxSpend", type: "uint256" }],
    outputs: [{ name: "policyId", type: "uint256" }]
  },
  {
    type: "function", name: "setAllowedTarget", stateMutability: "nonpayable",
    inputs: [{ name: "policyId", type: "uint256" }, { name: "target", type: "address" }, { name: "allowed", type: "bool" }],
    outputs: []
  },
  {
    type: "function", name: "setAllowedSelector", stateMutability: "nonpayable",
    inputs: [{ name: "policyId", type: "uint256" }, { name: "selector", type: "bytes4" }, { name: "allowed", type: "bool" }],
    outputs: []
  },
  {
    type: "function", name: "submitAction", stateMutability: "payable",
    inputs: [
      { name: "policyId", type: "uint256" },
      {
        name: "action", type: "tuple", components: [
          { name: "actionType", type: "uint8" },
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "value", type: "uint256" },
          { name: "tokenSymbol", type: "string" },
          { name: "intent", type: "string" },
          { name: "data", type: "bytes" }
        ]
      }
    ],
    outputs: [{ name: "scanId", type: "uint256" }, { name: "requestId", type: "uint256" }]
  },
  {
    type: "function", name: "getScan", stateMutability: "view",
    inputs: [{ name: "scanId", type: "uint256" }],
    outputs: [{
      name: "", type: "tuple", components: [
        { name: "scanId", type: "uint256" },
        { name: "policyId", type: "uint256" },
        { name: "requester", type: "address" },
        { name: "actionHash", type: "bytes32" },
        { name: "decision", type: "uint8" },
        { name: "riskScore", type: "uint256" },
        { name: "riskLevel", type: "uint8" },
        { name: "reasonHash", type: "bytes32" },
        { name: "requestId", type: "uint256" },
        { name: "timestamp", type: "uint256" },
        { name: "finalized", type: "bool" }
      ]
    }]
  },
  {
    type: "function", name: "policies", stateMutability: "view",
    inputs: [{ name: "policyId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [{ name: "owner", type: "address" }, { name: "maxSpend", type: "uint256" }, { name: "active", type: "bool" }] }]
  },
  {
    type: "function", name: "nextScanId", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function", name: "nextPolicyId", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "event", name: "ScanSubmitted", anonymous: false,
    inputs: [{ indexed: true, name: "scanId", type: "uint256" }, { indexed: true, name: "policyId", type: "uint256" }, { indexed: false, name: "actionHash", type: "bytes32" }]
  },
  {
    type: "event", name: "RiskRequested", anonymous: false,
    inputs: [{ indexed: true, name: "scanId", type: "uint256" }, { indexed: true, name: "requestId", type: "uint256" }]
  },
  {
    type: "event", name: "ScanFinalized", anonymous: false,
    inputs: [{ indexed: true, name: "scanId", type: "uint256" }, { indexed: false, name: "decision", type: "uint8" }, { indexed: false, name: "riskScore", type: "uint256" }, { indexed: false, name: "riskLevel", type: "uint8" }, { indexed: false, name: "reasonHash", type: "bytes32" }]
  },
  {
    type: "event", name: "PolicyCreated", anonymous: false,
    inputs: [{ indexed: true, name: "policyId", type: "uint256" }, { indexed: true, name: "owner", type: "address" }, { indexed: false, name: "maxSpend", type: "uint256" }]
  }
] as const;