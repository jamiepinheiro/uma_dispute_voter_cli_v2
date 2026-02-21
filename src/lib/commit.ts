import { keccak256, encodePacked } from "viem";
import { readFileSync, writeFileSync } from "fs";
import type { CommitFile } from "../types.js";

// Generate a random salt as a signed int256 (subtract 2^255 from a random uint256).
export function generateSalt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  return value - 2n ** 255n;
}

// Compute the VotingV2 commit hash.
// Formula: keccak256(abi.encodePacked(price, salt, voter, time, ancillaryData, roundId, identifier))
// Types:                               int256  int256  address uint256 bytes         uint256   bytes32
export function computeCommitHash(
  price: bigint,
  salt: bigint,
  voter: `0x${string}`,
  time: bigint,
  ancillaryData: `0x${string}`,
  roundId: bigint,
  identifier: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["int256", "int256", "address", "uint256", "bytes", "uint256", "bytes32"],
      [price, salt, voter, time, ancillaryData, roundId, identifier]
    )
  );
}

export function writeCommitFile(filePath: string, data: CommitFile): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function readCommitFile(filePath: string): CommitFile {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as CommitFile;
}
