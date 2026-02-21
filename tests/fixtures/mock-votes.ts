import { toHex, stringToHex } from "viem";
import type { RawPendingVote } from "../../src/types.js";

// Helper: encode a string into a bytes32 hex (right-padded with zeros)
function identifierToBytes32(name: string): `0x${string}` {
  const encoded = stringToHex(name, { size: 32 });
  return encoded;
}

// Helper: encode ancillary data string to hex bytes
function ancillaryToHex(text: string): `0x${string}` {
  return toHex(new TextEncoder().encode(text));
}

// Mock vote 1: A YES_OR_NO_QUERY dispute about an insurance claim
export const mockDisputeVote: RawPendingVote = {
  lastVotingRound: 8542,
  isGovernance: false,
  time: BigInt(Math.floor(new Date("2024-01-14T00:00:00Z").getTime() / 1000)),
  rollCount: 0,
  identifier: identifierToBytes32("YES_OR_NO_QUERY"),
  ancillaryData: ancillaryToHex(
    'q:"Was the Acme DeFi protocol exploited and did it suffer net losses exceeding $500,000 USD between January 10 and January 14, 2024?",p1:0,p2:1,p3:0.5'
  ),
};

// Mock vote 2: A rolled YES_OR_NO_QUERY dispute
export const mockRolledDisputeVote: RawPendingVote = {
  lastVotingRound: 8542,
  isGovernance: false,
  time: BigInt(Math.floor(new Date("2024-01-10T00:00:00Z").getTime() / 1000)),
  rollCount: 2,
  identifier: identifierToBytes32("YES_OR_NO_QUERY"),
  ancillaryData: ancillaryToHex(
    'q:"Did the ETH staking protocol correctly distribute rewards for epoch 245678, specifically for validator 0xabc123?",p1:0,p2:1,p3:0.5'
  ),
};

// Mock vote 3: A governance vote to approve an admin proposal
export const mockGovernanceVote: RawPendingVote = {
  lastVotingRound: 8542,
  isGovernance: true,
  time: BigInt(Math.floor(new Date("2024-01-13T00:00:00Z").getTime() / 1000)),
  rollCount: 0,
  identifier: identifierToBytes32("UMIP-175"),
  ancillaryData: ancillaryToHex(
    "Admin proposal to add NUMERICAL_QUERY as a supported price identifier and update the associated UMIP with implementation guidelines for resolving numerical data requests."
  ),
};

// Mock vote 4: A numerical price query
export const mockNumericalVote: RawPendingVote = {
  lastVotingRound: 8542,
  isGovernance: false,
  time: BigInt(Math.floor(new Date("2024-01-13T12:00:00Z").getTime() / 1000)),
  rollCount: 0,
  identifier: identifierToBytes32("NUMERICAL_QUERY"),
  ancillaryData: ancillaryToHex(
    'Metric: Total ETH burned via EIP-1559 on January 13, 2024, denominated in ETH with 18 decimal places. Source: Ethereum mainnet base fee data.'
  ),
};

// Complete mock round info (raw contract responses)
export const mockRoundId = 8542;
export const mockPhase = 0; // Commit
export const mockRoundEndTime = BigInt(
  Math.floor(new Date("2024-01-16T00:00:00Z").getTime() / 1000)
);

export const allMockVotes: RawPendingVote[] = [
  mockDisputeVote,
  mockRolledDisputeVote,
  mockGovernanceVote,
  mockNumericalVote,
];
