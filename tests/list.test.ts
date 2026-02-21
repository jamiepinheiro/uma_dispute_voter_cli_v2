import { describe, test, expect } from "bun:test";
import {
  decodeIdentifier,
  decodeAncillaryData,
  extractDescription,
  parseAncillaryKV,
  getVoteOptions,
  parseVote,
} from "../src/lib/parse.js";
import { formatVotingData } from "../src/lib/format.js";
import {
  mockDisputeVote,
  mockRolledDisputeVote,
  mockGovernanceVote,
  mockNumericalVote,
  allMockVotes,
  mockRoundId,
  mockPhase,
  mockRoundEndTime,
} from "./fixtures/mock-votes.js";
import type { VotingData } from "../src/types.js";

// ─── Parsing: Identifier decoding ────────────────────────────────────────────

describe("decodeIdentifier", () => {
  test("decodes YES_OR_NO_QUERY identifier from bytes32", () => {
    const result = decodeIdentifier(mockDisputeVote.identifier);
    expect(result).toBe("YES_OR_NO_QUERY");
  });

  test("decodes UMIP-175 identifier from bytes32", () => {
    const result = decodeIdentifier(mockGovernanceVote.identifier);
    expect(result).toBe("UMIP-175");
  });

  test("decodes NUMERICAL_QUERY identifier from bytes32", () => {
    const result = decodeIdentifier(mockNumericalVote.identifier);
    expect(result).toBe("NUMERICAL_QUERY");
  });
});

// ─── Parsing: Ancillary data decoding ────────────────────────────────────────

describe("decodeAncillaryData", () => {
  test("decodes ancillary data bytes to UTF-8 string", () => {
    const result = decodeAncillaryData(mockDisputeVote.ancillaryData);
    expect(result).toContain("Acme DeFi protocol");
    expect(result).toContain("p1:0");
    expect(result).toContain("p2:1");
  });

  test("handles empty ancillary data", () => {
    const result = decodeAncillaryData("0x");
    expect(result).toBe("");
  });
});

// ─── Parsing: Description extraction ─────────────────────────────────────────

describe("extractDescription", () => {
  test('extracts question from q:"..." format', async () => {
    const ancillary =
      'q:"Was the bridge exploited on January 5, 2024?",p1:0,p2:1,p3:0.5';
    const result = await extractDescription(ancillary);
    expect(result).toBe("Was the bridge exploited on January 5, 2024?");
  });

  test("returns plain text when no structured format found", async () => {
    const ancillary = "Admin proposal to update parameters.";
    const result = await extractDescription(ancillary);
    expect(result).toBe("Admin proposal to update parameters.");
  });

  test("handles empty string", async () => {
    const result = await extractDescription("");
    expect(result).toBe("(No description provided)");
  });

  test("extracts description from description:... format", async () => {
    const ancillary = 'description:"Proposal to add new identifier",proposer:0xabc';
    const result = await extractDescription(ancillary);
    expect(result).toBe("Proposal to add new identifier");
  });

  // Chain 99999 is not in CHAIN_CONFIGS → resolver returns null immediately (no network).
  test("falls back gracefully for unknown child chain", async () => {
    const ancillary =
      "ancillaryDataHash:000000000000000000000000000000000000000000000000000000000000dead,childBlockNumber:99999999,childOracle:ac60353a54873c446101216829a6a98cdbbc3f3d,childRequester:2c0367a9db231ddebd88a94b4f6461a6e47c58b1,childChainId:99999";
    const result = await extractDescription(ancillary);
    // Falls back to hash reference with chain ID
    expect(result).toContain("99999");
    expect(result).toContain("0000000000000000");
  });

  // Missing childBlockNumber + childRequester → skips resolver, hits fallback immediately.
  test("detects cross-chain dispute from Arbitrum — fallback without required fields", async () => {
    const ancillary =
      "ancillaryDataHash:abcdef1234567890,childChainId:42161,childOracle:0xabc";
    const result = await extractDescription(ancillary);
    expect(result).toContain("Arbitrum");
  });
});

// ─── Parsing: KV parser ───────────────────────────────────────────────────────

describe("parseAncillaryKV", () => {
  test("parses quoted values", () => {
    const kv = parseAncillaryKV('q:"Was X true?",p1:0,p2:1');
    expect(kv["q"]).toBe("Was X true?");
    expect(kv["p1"]).toBe("0");
    expect(kv["p2"]).toBe("1");
  });

  test("parses cross-chain fields", () => {
    const kv = parseAncillaryKV(
      "ancillaryDataHash:abc123,childChainId:137,childOracle:0xdef456"
    );
    expect(kv["ancillaryDataHash"]).toBe("abc123");
    expect(kv["childChainId"]).toBe("137");
  });

  test("returns empty object for unrecognized format", () => {
    const kv = parseAncillaryKV("plain text with no structure");
    expect(Object.keys(kv).length).toBe(0);
  });
});

// ─── Parsing: Vote options ────────────────────────────────────────────────────

describe("getVoteOptions", () => {
  test("returns Yes/No/Ambiguous options for YES_OR_NO_QUERY", () => {
    const opts = getVoteOptions("YES_OR_NO_QUERY", false, "");
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("Yes");
    expect(labels).toContain("No");
    expect(labels).toContain("Ambiguous / Too early to tell");
  });

  test("Yes option has value 1e18", () => {
    const opts = getVoteOptions("YES_OR_NO_QUERY", false, "");
    const yes = opts.find((o) => o.label === "Yes");
    expect(yes?.numericValue).toBe(BigInt("1000000000000000000"));
  });

  test("No option has value 0", () => {
    const opts = getVoteOptions("YES_OR_NO_QUERY", false, "");
    const no = opts.find((o) => o.label === "No");
    expect(no?.numericValue).toBe(BigInt(0));
  });

  test("Ambiguous option has value 0.5e18", () => {
    const opts = getVoteOptions("YES_OR_NO_QUERY", false, "");
    const amb = opts.find((o) => o.label.startsWith("Ambiguous"));
    expect(amb?.numericValue).toBe(BigInt("500000000000000000"));
  });

  test("returns Approve/Reject for governance votes", () => {
    const opts = getVoteOptions("UMIP-175", true, "");
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("Approve");
    expect(labels).toContain("Reject");
    expect(labels).not.toContain("Yes");
  });

  test("Approve option has value 1e18 for governance", () => {
    const opts = getVoteOptions("UMIP-175", true, "");
    const approve = opts.find((o) => o.label === "Approve");
    expect(approve?.numericValue).toBe(BigInt("1000000000000000000"));
  });

  test("returns default options for unknown identifiers", () => {
    const opts = getVoteOptions("BTC/USD", false, "");
    expect(opts.length).toBeGreaterThan(0);
    // Should have custom price option
    expect(opts.some((o) => o.label.toLowerCase().includes("custom"))).toBe(true);
  });
});

// ─── Parsing: Full vote parsing ───────────────────────────────────────────────

describe("parseVote", () => {
  test("parses a dispute vote correctly", async () => {
    const parsed = await parseVote(mockDisputeVote, 1);
    expect(parsed.index).toBe(1);
    expect(parsed.identifier).toBe("YES_OR_NO_QUERY");
    expect(parsed.isGovernance).toBe(false);
    expect(parsed.rollCount).toBe(0);
    expect(parsed.description).toContain("Acme DeFi");
    expect(parsed.options.length).toBe(3); // Yes, No, Ambiguous
  });

  test("parses a governance vote correctly", async () => {
    const parsed = await parseVote(mockGovernanceVote, 2);
    expect(parsed.identifier).toBe("UMIP-175");
    expect(parsed.isGovernance).toBe(true);
    expect(parsed.options.map((o) => o.label)).toContain("Approve");
  });

  test("preserves rollCount on rolled votes", async () => {
    const parsed = await parseVote(mockRolledDisputeVote, 3);
    expect(parsed.rollCount).toBe(2);
  });

  test("converts time to Date correctly", async () => {
    const parsed = await parseVote(mockDisputeVote, 1);
    expect(parsed.time).toBeInstanceOf(Date);
    expect(parsed.time.getUTCFullYear()).toBe(2024);
  });
});

// ─── Formatting: Full output ──────────────────────────────────────────────────

describe("formatVotingData (mock simulation)", () => {
  async function buildMockVotingData(): Promise<VotingData> {
    const phase = mockPhase === 0 ? "Commit" : "Reveal";
    const votes = await Promise.all(
      allMockVotes.map((v, i) => parseVote(v, i + 1))
    );
    return {
      round: {
        roundId: mockRoundId,
        phase,
        endTime: new Date(Number(mockRoundEndTime) * 1000),
        voteCount: allMockVotes.length,
      },
      votes,
    };
  }

  test("output contains round ID", async () => {
    const data = await buildMockVotingData();
    const output = formatVotingData(data);
    expect(output).toContain("8542");
  });

  test("output contains vote phase", async () => {
    const data = await buildMockVotingData();
    const output = formatVotingData(data);
    expect(output).toContain("Commit");
  });

  test("output lists all mock votes", async () => {
    const data = await buildMockVotingData();
    const output = formatVotingData(data);
    expect(output).toContain("YES_OR_NO_QUERY");
    expect(output).toContain("UMIP-175");
    expect(output).toContain("NUMERICAL_QUERY");
  });

  test("output contains vote options for dispute vote", async () => {
    const data = await buildMockVotingData();
    const output = formatVotingData(data);
    expect(output).toContain("Yes");
    expect(output).toContain("No");
    expect(output).toContain("Ambiguous");
  });

  test("output contains Approve/Reject for governance vote", async () => {
    const data = await buildMockVotingData();
    const output = formatVotingData(data);
    expect(output).toContain("Approve");
    expect(output).toContain("Reject");
  });

  test("output contains description from ancillary data", async () => {
    const data = await buildMockVotingData();
    const output = formatVotingData(data);
    expect(output).toContain("Acme DeFi");
  });

  test("output shows rollCount warning for rolled votes", async () => {
    const data = await buildMockVotingData();
    const output = formatVotingData(data);
    // The rolled vote has rollCount=2
    expect(output).toContain("2");
    expect(output).toContain("time");
  });

  test("simulates empty round with no votes", () => {
    const data: VotingData = {
      round: {
        roundId: 9999,
        phase: "Commit",
        endTime: new Date("2024-02-01T00:00:00Z"),
        voteCount: 0,
      },
      votes: [],
    };
    const output = formatVotingData(data);
    expect(output).toContain("9999");
    expect(output).toContain("No active votes");
  });

  test("simulates a pure governance round", async () => {
    const data: VotingData = {
      round: {
        roundId: 8542,
        phase: "Reveal",
        endTime: new Date("2024-01-16T00:00:00Z"),
        voteCount: 1,
      },
      votes: [await parseVote(mockGovernanceVote, 1)],
    };
    const output = formatVotingData(data);
    expect(output).toContain("Governance");
    expect(output).toContain("Reveal");
    expect(output).toContain("Approve");
    expect(output).not.toContain("Ambiguous");
  });
});
