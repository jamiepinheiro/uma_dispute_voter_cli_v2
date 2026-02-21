export interface RawPendingVote {
  lastVotingRound: number;
  isGovernance: boolean;
  time: bigint;
  rollCount: number;
  identifier: `0x${string}`;
  ancillaryData: `0x${string}`;
}

export interface VoteOption {
  label: string;
  displayValue: string;
  numericValue: bigint;
}

export interface DiscordOutcome {
  summary: string;
  sources: [string, number][];
}

export interface DiscordSummaryData {
  generatedAt: string;
  totalComments?: number;
  outcomes: Partial<Record<"P1" | "P2" | "P3" | "P4" | "Uncategorized", DiscordOutcome>>;
}

export interface ParsedVote {
  index: number;
  identifier: string;
  rawIdentifier: `0x${string}`;
  time: Date;
  isGovernance: boolean;
  rollCount: number;
  roundId: number;
  description: string;
  ancillaryRaw: string;
  rawAncillaryData: `0x${string}`;
  options: VoteOption[];
  discordSummary?: DiscordSummaryData | null;
}

// Input file format for the commit command
export interface VoteInput {
  index: number;
  vote: string; // must match a VoteOption label exactly
}

// Per-vote record stored in the commit output file; everything as strings for JSON safety
export interface CommitRecord {
  description: string;
  identifier: string;     // bytes32 hex (0x…)
  time: string;           // unix timestamp as decimal string
  ancillaryData: string;  // raw hex bytes (0x…)
  price: string;          // bigint decimal string
  salt: string;           // bigint decimal string (may be negative)
  optionLabel: string;    // human label e.g. "Yes"
}

export interface CommitFile {
  roundId: number;
  voterAddress: string;
  committedAt: string;  // ISO timestamp
  txHash?: string;
  commits: CommitRecord[];
}

export interface RoundInfo {
  roundId: number;
  phase: "Commit" | "Reveal";
  endTime: Date;
  voteCount: number;
}

export interface VotingData {
  round: RoundInfo;
  votes: ParsedVote[];
}
