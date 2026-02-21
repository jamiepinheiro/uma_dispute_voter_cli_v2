import { hexToString } from "viem";
import { polygon, optimism, arbitrum, base, mainnet } from "viem/chains";
import type { Chain } from "viem";
import type { RawPendingVote, ParsedVote, VoteOption } from "../types.js";
import { resolveChildChainAncillary } from "./crosschain.js";

// Decode bytes32 identifier to human-readable string
export function decodeIdentifier(hex: `0x${string}`): string {
  try {
    const str = hexToString(hex, { size: 32 });
    return str.replace(/\x00/g, "").trim();
  } catch {
    return hex;
  }
}

// Decode ancillary data bytes to UTF-8 string
export function decodeAncillaryData(hex: `0x${string}`): string {
  if (!hex || hex === "0x") return "";
  try {
    return hexToString(hex);
  } catch {
    return hex;
  }
}

// Parse key:value pairs from UMA ancillary data format
// e.g. "key1:value1,key2:value2" or 'q:"question text",p1:0,p2:1'
export function parseAncillaryKV(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern =
    /([a-zA-Z][a-zA-Z0-9_]*):"([^"]+)"|([a-zA-Z][a-zA-Z0-9_]*):([^,\s]+)/g;
  for (const match of text.matchAll(pattern)) {
    const key = match[1] ?? match[3];
    const value = match[2] ?? match[4];
    if (key && value) result[key] = value.trim();
  }
  return result;
}

// Map chain IDs to viem chain definitions
const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  137: polygon,
  10: optimism,
  42161: arbitrum,
  8453: base,
};

// Synchronously extract a human-readable description from already-decoded text.
// Does NOT do cross-chain resolution — used on text we've already fetched.
export function extractTextDescription(text: string): string {
  if (!text) return "(No description provided)";

  // Quoted formats: q:"...", description:"...", title:"..."
  const qDoubleQuote = text.match(/q:"([^"]+)"/);
  if (qDoubleQuote) return qDoubleQuote[1].trim();

  const qSingleQuote = text.match(/q:'([^']+)'/);
  if (qSingleQuote) return qSingleQuote[1].trim();

  const descMatch = text.match(/description:"([^"]+)"/i);
  if (descMatch) return descMatch[1].trim();

  const titleMatch = text.match(/title:"([^"]+)"/i);
  if (titleMatch) return titleMatch[1].trim();

  // Polymarket / UMA format: "q: title: <question>, description: <desc>, ..."
  // Extract title from unquoted "q: title: <text>," pattern
  const qTitleMatch = text.match(/q:\s*title:\s*(.+?)(?:,\s*description:|,\s*res_data:|,\s*initializer:|$)/is);
  if (qTitleMatch) return qTitleMatch[1].trim();

  // Unquoted q: field: "q: <text>, ..."
  const qUnquoted = text.match(/^q:\s*(.+?)(?:,\s*(?:description|p1|p2|p3|initializer|ooRequester|res_data):|$)/is);
  if (qUnquoted) return qUnquoted[1].trim();

  return text.trim();
}

// Extract a human-readable description from ancillary data.
// For cross-chain disputes, resolves the original question from the child chain.
export async function extractDescription(ancillaryText: string): Promise<string> {
  if (!ancillaryText) return "(No description provided)";

  // Try sync formats first (fast path — no network calls)
  const syncResult = extractTextDescription(ancillaryText);
  // If sync extraction found something meaningful (not the raw input), return it
  if (syncResult !== ancillaryText.trim()) return syncResult;

  // Cross-chain reference: ancillaryDataHash + childChainId present
  const kv = parseAncillaryKV(ancillaryText);
  if (kv["ancillaryDataHash"] && kv["childChainId"]) {
    const chainIdNum = parseInt(kv["childChainId"], 10);
    const chainDef = CHAIN_MAP[chainIdNum];
    const chainName = chainDef?.name ?? `Chain ${kv["childChainId"]}`;

    // Attempt live resolution from child chain
    if (kv["childOracle"] && kv["childBlockNumber"] && kv["childRequester"]) {
      try {
        const resolved = await resolveChildChainAncillary({
          ancillaryDataHash: kv["ancillaryDataHash"],
          childBlockNumber: BigInt(kv["childBlockNumber"]),
          // Addresses in ancillary data lack 0x prefix
          childOracle: `0x${kv["childOracle"]}` as `0x${string}`,
          childRequester: `0x${kv["childRequester"]}` as `0x${string}`,
          childChainId: chainIdNum,
        });

        if (resolved) {
          // The resolved text is the original Polygon ancillary data — extract question from it
          return extractTextDescription(resolved);
        }
      } catch {
        // Fall through to hash fallback
      }
    }

    // Fallback: show hash reference
    const hash = kv["ancillaryDataHash"].slice(0, 16) + "...";
    return `[Cross-chain from ${chainName} — resolution failed] Hash: ${hash}`;
  }

  // No match: return raw text
  return ancillaryText.trim();
}

// Determine vote options based on identifier type and governance flag
export function getVoteOptions(
  identifier: string,
  isGovernance: boolean,
  ancillaryText: string
): VoteOption[] {
  if (isGovernance) {
    return [
      {
        label: "Approve",
        displayValue: "1e18 (1000000000000000000)",
        numericValue: BigInt("1000000000000000000"),
      },
      {
        label: "Reject",
        displayValue: "0",
        numericValue: BigInt(0),
      },
    ];
  }

  const id = identifier.toUpperCase();

  if (id === "YES_OR_NO_QUERY" || id.startsWith("YES_OR_NO")) {
    return [
      {
        label: "Yes",
        displayValue: "1e18 (1000000000000000000)",
        numericValue: BigInt("1000000000000000000"),
      },
      {
        label: "No",
        displayValue: "0",
        numericValue: BigInt(0),
      },
      {
        label: "Ambiguous / Too early to tell",
        displayValue: "0.5e18 (500000000000000000)",
        numericValue: BigInt("500000000000000000"),
      },
    ];
  }

  if (id === "MULTIPLE_CHOICE_QUERY" || id.startsWith("MULTIPLE_CHOICE")) {
    const options: VoteOption[] = [];
    const matches = ancillaryText.matchAll(/p(\d+):\s*(\d+(?:\.\d+)?)/g);
    for (const match of matches) {
      const val = parseFloat(match[2]);
      options.push({
        label: `Option p${match[1]}`,
        displayValue: `${val}e18`,
        numericValue: BigInt(Math.round(val * 1e18)),
      });
    }
    if (options.length > 0) return options;
  }

  // Default for price/numerical queries
  return [
    {
      label: "Yes / Valid",
      displayValue: "1e18 (1000000000000000000)",
      numericValue: BigInt("1000000000000000000"),
    },
    {
      label: "No / Invalid",
      displayValue: "0",
      numericValue: BigInt(0),
    },
    {
      label: "Custom price",
      displayValue: "<value in wei, 18 decimals — check UMIP>",
      numericValue: BigInt(0),
    },
  ];
}

// Parse a raw pending vote into a display-ready format
export async function parseVote(
  raw: RawPendingVote,
  index: number
): Promise<ParsedVote> {
  const identifier = decodeIdentifier(raw.identifier);
  const ancillaryRaw = decodeAncillaryData(raw.ancillaryData);
  const description = await extractDescription(ancillaryRaw);
  const options = getVoteOptions(identifier, raw.isGovernance, ancillaryRaw);

  return {
    index,
    identifier,
    rawIdentifier: raw.identifier,
    time: new Date(Number(raw.time) * 1000),
    isGovernance: raw.isGovernance,
    rollCount: raw.rollCount,
    roundId: raw.lastVotingRound,
    description,
    ancillaryRaw,
    rawAncillaryData: raw.ancillaryData,
    options,
  };
}
