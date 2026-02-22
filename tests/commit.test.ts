/**
 * Unit tests for the commit/reveal workflow.
 * No live RPC calls or real transactions — pure logic testing.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import { generateSalt, computeCommitHash, writeCommitFile, readCommitFile } from "../src/lib/commit.js";
import type { CommitFile } from "../src/types.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const VOTER     = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as `0x${string}`;
const DELEGATE  = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const IDENTIFIER = "0x5945535f4f525f4e4f5f51554552590000000000000000000000000000000000" as `0x${string}`;
const ANCILLARY = "0x713a2077696c6c20696e766f6963650000000000" as `0x${string}`;
const TIME = 1771449360n;
const ROUND_ID = 10252n;
const PRICE_YES = 1000000000000000000n; // 1e18
const PRICE_NO = 0n;
const PRICE_AMB = 500000000000000000n;  // 0.5e18

// ─── generateSalt ─────────────────────────────────────────────────────────────

describe("generateSalt", () => {
  const MIN_INT256 = -(2n ** 255n);
  const MAX_INT256 = 2n ** 255n - 1n;

  test("returns a bigint", () => {
    expect(typeof generateSalt()).toBe("bigint");
  });

  test("is within signed int256 range", () => {
    for (let i = 0; i < 20; i++) {
      const s = generateSalt();
      expect(s >= MIN_INT256).toBe(true);
      expect(s <= MAX_INT256).toBe(true);
    }
  });

  test("produces unique values across calls", () => {
    const salts = new Set(Array.from({ length: 50 }, () => generateSalt().toString()));
    expect(salts.size).toBe(50);
  });

  test("survives JSON serialization round-trip", () => {
    const salt = generateSalt();
    const serialized = salt.toString();
    const recovered = BigInt(serialized);
    expect(recovered).toBe(salt);
  });
});

// ─── computeCommitHash ────────────────────────────────────────────────────────

describe("computeCommitHash", () => {
  const SALT = 12345678901234567890n;

  function hash(overrides: Partial<{
    price: bigint; salt: bigint; voter: `0x${string}`;
    time: bigint; ancillaryData: `0x${string}`; roundId: bigint; identifier: `0x${string}`;
  }> = {}) {
    return computeCommitHash(
      overrides.price ?? PRICE_YES,
      overrides.salt ?? SALT,
      overrides.voter ?? VOTER,
      overrides.time ?? TIME,
      overrides.ancillaryData ?? ANCILLARY,
      overrides.roundId ?? ROUND_ID,
      overrides.identifier ?? IDENTIFIER,
    );
  }

  test("returns a 0x-prefixed 32-byte hex string", () => {
    const h = hash();
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("is deterministic — same inputs produce same hash", () => {
    expect(hash()).toBe(hash());
  });

  test("changes when price changes", () => {
    expect(hash({ price: PRICE_YES })).not.toBe(hash({ price: PRICE_NO }));
  });

  test("changes when salt changes", () => {
    expect(hash({ salt: 1n })).not.toBe(hash({ salt: 2n }));
  });

  test("changes when voter changes", () => {
    const other = "0x0000000000000000000000000000000000000001" as `0x${string}`;
    expect(hash({ voter: VOTER })).not.toBe(hash({ voter: other }));
  });

  test("changes when time changes", () => {
    expect(hash({ time: TIME })).not.toBe(hash({ time: TIME + 1n }));
  });

  test("changes when ancillaryData changes", () => {
    const other = "0xdeadbeef" as `0x${string}`;
    expect(hash({ ancillaryData: ANCILLARY })).not.toBe(hash({ ancillaryData: other }));
  });

  test("changes when roundId changes", () => {
    expect(hash({ roundId: ROUND_ID })).not.toBe(hash({ roundId: ROUND_ID + 1n }));
  });

  test("changes when identifier changes", () => {
    // UMIP-175 padded to bytes32 (64 hex chars after 0x)
    const other = "0x554d49502d313735000000000000000000000000000000000000000000000000" as `0x${string}`;
    expect(hash({ identifier: IDENTIFIER })).not.toBe(hash({ identifier: other }));
  });

  test("all three YES_OR_NO prices produce distinct hashes", () => {
    const hYes = hash({ price: PRICE_YES });
    const hNo  = hash({ price: PRICE_NO });
    const hAmb = hash({ price: PRICE_AMB });
    expect(new Set([hYes, hNo, hAmb]).size).toBe(3);
  });

  test("negative salt produces a valid hash", () => {
    const negativeSalt = -(2n ** 255n); // minimum int256
    const h = hash({ salt: negativeSalt });
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("simulates reveal verification — recomputed hash matches committed hash", () => {
    const salt = generateSalt();
    const price = PRICE_YES;
    // Hash at commit time
    const committed = computeCommitHash(price, salt, VOTER, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    // Hash recomputed at reveal time with same inputs
    const revealed  = computeCommitHash(price, salt, VOTER, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    expect(revealed).toBe(committed);
  });

  test("wrong price at reveal would produce a different hash", () => {
    const salt = generateSalt();
    const committed = computeCommitHash(PRICE_YES, salt, VOTER, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    const wrongReveal = computeCommitHash(PRICE_NO, salt, VOTER, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    expect(wrongReveal).not.toBe(committed);
  });

  test("wrong salt at reveal would produce a different hash", () => {
    const salt = generateSalt();
    const committed  = computeCommitHash(PRICE_YES, salt,      VOTER, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    const wrongReveal = computeCommitHash(PRICE_YES, salt + 1n, VOTER, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    expect(wrongReveal).not.toBe(committed);
  });
});

// ─── Delegate voting ──────────────────────────────────────────────────────────

describe("delegate voting", () => {
  const SALT = 99999999999999999n;

  test("hash computed with staker address differs from hash with delegate address", () => {
    const hashAsStaker   = computeCommitHash(PRICE_YES, SALT, VOTER,    TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    const hashAsDelegate = computeCommitHash(PRICE_YES, SALT, DELEGATE, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    expect(hashAsStaker).not.toBe(hashAsDelegate);
  });

  test("delegate must use staker address in hash to match contract verification", () => {
    // Simulate: delegate commits using staker (VOTER) address in hash
    const salt = generateSalt();
    const committedHash = computeCommitHash(PRICE_YES, salt, VOTER, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);

    // At reveal time, contract calls getVoterFromDelegate(delegate) → staker (VOTER)
    // and verifies hash with staker address — must match
    const verifyHash = computeCommitHash(PRICE_YES, salt, VOTER, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    expect(verifyHash).toBe(committedHash);
  });

  test("delegate committing with own address produces a hash that fails reveal verification", () => {
    // This shows WHY the fix matters: if a delegate mistakenly uses their own address,
    // the reveal (which uses staker address) will not match
    const salt = generateSalt();
    const incorrectHash = computeCommitHash(PRICE_YES, salt, DELEGATE, TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    const correctVerify = computeCommitHash(PRICE_YES, salt, VOTER,    TIME, ANCILLARY, ROUND_ID, IDENTIFIER);
    expect(correctVerify).not.toBe(incorrectHash);
  });
});

// ─── CommitFile round-trip ────────────────────────────────────────────────────

describe("writeCommitFile / readCommitFile", () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = join(tmpdir(), `uma-commit-test-${Date.now()}.json`);
  });

  afterEach(() => {
    if (existsSync(tmpFile)) rmSync(tmpFile);
  });

  function makeCommitFile(overrides: Partial<CommitFile> = {}): CommitFile {
    return {
      roundId: 10252,
      voterAddress: VOTER,
      signerAddress: VOTER,
      committedAt: "2026-02-21T00:00:00.000Z",
      txHash: "0xabc123def456",
      commits: [
        {
          description: "Will Kevin Warsh be nominated?",
          identifier: IDENTIFIER,
          time: TIME.toString(),
          ancillaryData: ANCILLARY,
          price: PRICE_YES.toString(),
          salt: (-12345678901234567890n).toString(),
          optionLabel: "Yes",
        },
        {
          description: "Will SpaceX launch fewer than 5 times?",
          identifier: IDENTIFIER,
          time: (TIME + 1000n).toString(),
          ancillaryData: "0xdeadbeef" as `0x${string}`,
          price: PRICE_NO.toString(),
          salt: generateSalt().toString(),
          optionLabel: "No",
        },
      ],
      ...overrides,
    };
  }

  test("round-trips a CommitFile without data loss", () => {
    const original = makeCommitFile();
    writeCommitFile(tmpFile, original);
    const loaded = readCommitFile(tmpFile);
    expect(loaded).toEqual(original);
  });

  test("negative salt survives JSON serialization", () => {
    const negativeSalt = (-99999999999999999999999999999n).toString();
    const original = makeCommitFile({
      commits: [{ ...makeCommitFile().commits[0]!, salt: negativeSalt }],
    });
    writeCommitFile(tmpFile, original);
    const loaded = readCommitFile(tmpFile);
    // Recover bigint from string and verify it's negative
    const recoveredSalt = BigInt(loaded.commits[0]!.salt);
    expect(recoveredSalt).toBe(BigInt(negativeSalt));
    expect(recoveredSalt < 0n).toBe(true);
  });

  test("all bigint fields survive round-trip with full precision", () => {
    const largeSalt = (2n ** 254n - 1n).toString();
    const largePrice = (1000000000000000000n).toString();
    const original = makeCommitFile({
      commits: [{
        ...makeCommitFile().commits[0]!,
        price: largePrice,
        salt: largeSalt,
      }],
    });
    writeCommitFile(tmpFile, original);
    const loaded = readCommitFile(tmpFile);
    expect(BigInt(loaded.commits[0]!.price)).toBe(BigInt(largePrice));
    expect(BigInt(loaded.commits[0]!.salt)).toBe(BigInt(largeSalt));
  });

  test("writes valid JSON that can be parsed independently", () => {
    const original = makeCommitFile();
    writeCommitFile(tmpFile, original);
    const raw = require("fs").readFileSync(tmpFile, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test("commit file without txHash is still valid", () => {
    const original = makeCommitFile({ txHash: undefined });
    writeCommitFile(tmpFile, original);
    const loaded = readCommitFile(tmpFile);
    expect(loaded.txHash).toBeUndefined();
    expect(loaded.commits.length).toBe(original.commits.length);
  });

  test("delegate commit file stores distinct voterAddress (staker) and signerAddress (delegate)", () => {
    const original = makeCommitFile({ voterAddress: VOTER, signerAddress: DELEGATE });
    writeCommitFile(tmpFile, original);
    const loaded = readCommitFile(tmpFile);
    expect(loaded.voterAddress).toBe(VOTER);
    expect(loaded.signerAddress).toBe(DELEGATE);
    expect(loaded.voterAddress).not.toBe(loaded.signerAddress);
  });

  test("all CommitRecord fields are preserved exactly", () => {
    const original = makeCommitFile();
    writeCommitFile(tmpFile, original);
    const loaded = readCommitFile(tmpFile);
    const orig = original.commits[0]!;
    const load = loaded.commits[0]!;
    expect(load.description).toBe(orig.description);
    expect(load.identifier).toBe(orig.identifier);
    expect(load.time).toBe(orig.time);
    expect(load.ancillaryData).toBe(orig.ancillaryData);
    expect(load.price).toBe(orig.price);
    expect(load.salt).toBe(orig.salt);
    expect(load.optionLabel).toBe(orig.optionLabel);
  });
});
