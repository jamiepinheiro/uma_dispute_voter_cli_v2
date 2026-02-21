import {
  createPublicClient,
  http,
  keccak256,
  hexToString,
  decodeAbiParameters,
  fromHex,
  toHex,
} from "viem";
import { polygon, optimism, arbitrum, base } from "viem/chains";
import type { Chain } from "viem";

const CHAIN_CONFIGS: Record<number, { chain: Chain; rpcs: string[] }> = {
  137: {
    chain: polygon,
    rpcs: ["https://polygon.drpc.org", "https://1rpc.io/matic"],
  },
  10: {
    chain: optimism,
    rpcs: ["https://mainnet.optimism.io", "https://optimism.drpc.org"],
  },
  42161: {
    chain: arbitrum,
    rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum.drpc.org"],
  },
  8453: {
    chain: base,
    rpcs: ["https://mainnet.base.org", "https://base.drpc.org"],
  },
};

export interface CrossChainParams {
  ancillaryDataHash: string;
  childBlockNumber: bigint;
  childOracle: `0x${string}`;
  childRequester: `0x${string}`;
  childChainId: number;
}

// OracleChildTunnel PriceRequestAdded: non-indexed data is (bytes32 identifier, uint256 time, bytes ancillaryData)
function tryDecodeIdentifierTimedBytes(
  data: `0x${string}`,
  targetHash: string
): `0x${string}` | null {
  try {
    const [, , bytesHex] = decodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "bytes" }],
      data
    );
    if (keccak256(bytesHex).slice(2).toLowerCase() === targetHash.toLowerCase()) {
      return bytesHex;
    }
  } catch {}
  return null;
}

// Generic (uint256, bytes) layout — kept as fallback
function tryDecodeTimedBytes(
  data: `0x${string}`,
  targetHash: string
): `0x${string}` | null {
  try {
    const [, bytesHex] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "bytes" }],
      data
    );
    if (keccak256(bytesHex).slice(2).toLowerCase() === targetHash.toLowerCase()) {
      return bytesHex;
    }
  } catch {}
  return null;
}

// OptimisticOracleV2 RequestPrice: non-indexed (bytes32, uint256, bytes, address, uint256, uint256)
function tryDecodeRequestPrice(
  data: `0x${string}`,
  targetHash: string
): `0x${string}` | null {
  try {
    const [, , bytesHex] = decodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      data
    );
    if (keccak256(bytesHex).slice(2).toLowerCase() === targetHash.toLowerCase()) {
      return bytesHex;
    }
  } catch {}
  return null;
}

// OptimisticOracleV2 DisputePrice: non-indexed (bytes32, uint256, bytes, int256)
function tryDecodeDisputePrice(
  data: `0x${string}`,
  targetHash: string
): `0x${string}` | null {
  try {
    const [, , bytesHex] = decodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "bytes" }, { type: "int256" }],
      data
    );
    if (keccak256(bytesHex).slice(2).toLowerCase() === targetHash.toLowerCase()) {
      return bytesHex;
    }
  } catch {}
  return null;
}

// Fallback: scan all 32-byte-aligned positions in log data looking for ABI-encoded
// bytes whose keccak256 matches the target hash.
function bruteForceFind(
  data: `0x${string}`,
  targetHash: string
): `0x${string}` | null {
  if (!data || data.length <= 2) return null;
  const bytes = new Uint8Array(fromHex(data, "bytes"));
  if (bytes.length < 64) return null;

  const read4 = (pos: number) =>
    (((bytes[pos] ?? 0) << 24) |
      ((bytes[pos + 1] ?? 0) << 16) |
      ((bytes[pos + 2] ?? 0) << 8) |
      (bytes[pos + 3] ?? 0)) >>>
    0;

  for (let i = 0; i + 32 <= bytes.length; i += 32) {
    // Read last 4 bytes of 32-byte word as the potential offset
    const offset = read4(i + 28);
    if (offset === 0 || offset % 32 !== 0 || offset + 32 > bytes.length || offset > 8192)
      continue;

    const length = read4(offset + 28);
    if (length === 0 || length > 4096 || offset + 32 + length > bytes.length) continue;

    const candidate = bytes.slice(offset + 32, offset + 32 + length);
    const hex = toHex(candidate);
    if (keccak256(hex).slice(2).toLowerCase() === targetHash.toLowerCase()) {
      return hex;
    }
  }
  return null;
}

// Attempt to resolve the original ancillary data text from a child chain by scanning
// logs from the childOracle (OracleChildTunnel) and childRequester (OptimisticOracleV2)
// around the block where the request was made.
export async function resolveChildChainAncillary(
  params: CrossChainParams
): Promise<string | null> {
  const config = CHAIN_CONFIGS[params.childChainId];
  if (!config) return null;

  const fromBlock =
    params.childBlockNumber > 100n ? params.childBlockNumber - 100n : 0n;
  const toBlock = params.childBlockNumber + 10n;

  // Try each RPC endpoint in order until one succeeds
  for (const rpcUrl of config.rpcs) {
    const client = createPublicClient({
      chain: config.chain,
      transport: http(rpcUrl),
    });

    // Try childOracle (OracleChildTunnel) first, then childRequester (OptimisticOracleV2)
    for (const address of [params.childOracle, params.childRequester]) {
      let logs;
      try {
        logs = await client.getLogs({ address, fromBlock, toBlock });
      } catch {
        continue;
      }

      for (const log of logs) {
        if (!log.data || log.data === "0x") continue;
        const data = log.data as `0x${string}`;

        const matched =
          tryDecodeIdentifierTimedBytes(data, params.ancillaryDataHash) ??
          tryDecodeTimedBytes(data, params.ancillaryDataHash) ??
          tryDecodeRequestPrice(data, params.ancillaryDataHash) ??
          tryDecodeDisputePrice(data, params.ancillaryDataHash) ??
          bruteForceFind(data, params.ancillaryDataHash);

        if (matched) {
          try {
            return hexToString(matched);
          } catch {
            return null;
          }
        }
      }
    }
  }

  return null;
}
