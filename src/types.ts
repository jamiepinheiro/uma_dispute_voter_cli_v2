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
  time: Date;
  isGovernance: boolean;
  rollCount: number;
  roundId: number;
  description: string;
  ancillaryRaw: string;
  options: VoteOption[];
  discordSummary?: DiscordSummaryData | null;
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
