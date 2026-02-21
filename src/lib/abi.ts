export const VOTING_V2_ABI = [
  {
    name: "getPendingRequests",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "lastVotingRound", type: "uint32" },
          { name: "isGovernance", type: "bool" },
          { name: "time", type: "uint64" },
          { name: "rollCount", type: "uint32" },
          { name: "identifier", type: "bytes32" },
          { name: "ancillaryData", type: "bytes" },
        ],
      },
    ],
  },
  {
    name: "getVotePhase",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "getCurrentRoundId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    name: "getRoundEndTime",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "batchCommit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "commits",
        type: "tuple[]",
        components: [
          { name: "identifier", type: "bytes32" },
          { name: "time", type: "uint256" },
          { name: "ancillaryData", type: "bytes" },
          { name: "hash", type: "bytes32" },
          { name: "encryptedVote", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "batchReveal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "reveals",
        type: "tuple[]",
        components: [
          { name: "identifier", type: "bytes32" },
          { name: "time", type: "uint256" },
          { name: "price", type: "int256" },
          { name: "ancillaryData", type: "bytes" },
          { name: "salt", type: "int256" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

// Ethereum mainnet VotingV2 contract
export const VOTING_V2_ADDRESS =
  "0x004395edb43EFca9885CEdad51EC9fAf93Bd34ac" as const;
