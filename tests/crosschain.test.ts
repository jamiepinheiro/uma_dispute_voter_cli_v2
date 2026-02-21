/**
 * Integration tests for cross-chain ancillary data resolution.
 * These make live RPC calls to Polygon and are intentionally kept separate
 * from the fast unit tests in list.test.ts.
 *
 * Run with:  bun test tests/crosschain.test.ts
 */
import { describe, test, expect } from "bun:test";
import { resolveChildChainAncillary } from "../src/lib/crosschain.js";
import { extractDescription, extractTextDescription } from "../src/lib/parse.js";

// Real cross-chain dispute data from active Round #10252
const REAL_VOTES = [
  {
    ancillaryDataHash:
      "51187e39a983ac68f923b591fac138853ed779501559ed36b2e15592985073eb",
    childBlockNumber: BigInt(83182151),
    childOracle: "0xac60353a54873c446101216829a6a98cdbbc3f3d" as `0x${string}`,
    childRequester: "0x2c0367a9db231ddebd88a94b4f6461a6e47c58b1" as `0x${string}`,
    childChainId: 137,
  },
  {
    ancillaryDataHash:
      "481ac9661fd607c9bb80954066d1b2975ff5988f847c646129a917b7ab79bc2a",
    childBlockNumber: BigInt(83182026),
    childOracle: "0xac60353a54873c446101216829a6a98cdbbc3f3d" as `0x${string}`,
    childRequester: "0x2c0367a9db231ddebd88a94b4f6461a6e47c58b1" as `0x${string}`,
    childChainId: 137,
  },
];

describe("resolveChildChainAncillary (live Polygon RPC)", () => {
  test("resolves real ancillary data hash to human-readable text", async () => {
    const result = await resolveChildChainAncillary(REAL_VOTES[0]!);

    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
    // Should be UTF-8 readable text, not a raw hex string
    expect(result).not.toMatch(/^0x/);
    console.log("Resolved ancillary data:", result);
  }, 30_000);

  test("resolved text contains a parseable question via extractTextDescription", async () => {
    const raw = await resolveChildChainAncillary(REAL_VOTES[0]!);
    expect(raw).not.toBeNull();

    const description = extractTextDescription(raw!);
    expect(description.length).toBeGreaterThan(10);
    console.log("Extracted question:", description);
  }, 30_000);

  test("extractDescription end-to-end returns question text (not hash fallback)", async () => {
    const ancillary = `ancillaryDataHash:${REAL_VOTES[0]!.ancillaryDataHash},childBlockNumber:${REAL_VOTES[0]!.childBlockNumber},childOracle:${REAL_VOTES[0]!.childOracle.slice(2)},childRequester:${REAL_VOTES[0]!.childRequester.slice(2)},childChainId:137`;
    const result = await extractDescription(ancillary);

    expect(result).not.toContain("resolution failed");
    expect(result.length).toBeGreaterThan(10);
    console.log("Full description:", result);
  }, 30_000);

  test("second vote resolves independently", async () => {
    const result = await resolveChildChainAncillary(REAL_VOTES[1]!);
    expect(result).not.toBeNull();
    console.log("Vote 2 resolved:", result);
  }, 30_000);
});
