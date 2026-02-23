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
    name: "getVoterFromDelegate",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "caller", type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    // Public mapping getter: voterStakes(address) → VoterStake struct
    // Struct layout (mapping field skipped in ABI):
    //   uint128 stake, uint128 pendingUnstake,
    //   [mapping(uint32=>uint128) pendingStakes — omitted],
    //   uint128 rewardsPaidPerToken, uint128 outstandingRewards,
    //   int128 unappliedSlash, uint64 nextIndexToProcess, uint64 unstakeTime,
    //   address delegate
    name: "voterStakes",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "voter", type: "address" }],
    outputs: [
      { name: "stake", type: "uint128" },
      { name: "pendingUnstake", type: "uint128" },
      { name: "rewardsPaidPerToken", type: "uint128" },
      { name: "outstandingRewards", type: "uint128" },
      { name: "unappliedSlash", type: "int128" },
      { name: "nextIndexToProcess", type: "uint64" },
      { name: "unstakeTime", type: "uint64" },
      { name: "delegate", type: "address" },
    ],
  },
  {
    // OpenZeppelin Multicall: batch-encodes multiple calls into one tx, preserving msg.sender
    name: "multicall",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    name: "commitVote",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "identifier", type: "bytes32" },
      { name: "time", type: "uint256" },
      { name: "ancillaryData", type: "bytes" },
      { name: "hash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "revealVote",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "identifier", type: "bytes32" },
      { name: "time", type: "uint256" },
      { name: "price", type: "int256" },
      { name: "ancillaryData", type: "bytes" },
      { name: "salt", type: "int256" },
    ],
    outputs: [],
  },
] as const;

// Ethereum mainnet VotingV2 contract
export const VOTING_V2_ADDRESS =
  "0x004395edb43EFca9885CEdad51EC9fAf93Bd34ac" as const;
