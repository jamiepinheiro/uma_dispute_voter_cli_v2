# uma-dv

A CLI for UMA protocol dispute voting. Fetches active votes from the VotingV2 contract, resolves human-readable question text (including cross-chain Polygon disputes), and surfaces Discord community summaries so you can make informed voting decisions.

## Install

```sh
bun install
```

Requires [Bun](https://bun.sh) v1.2+.

## Commands

### `stage`

Show the current voting phase for the active round.

```
$ bun src/index.ts stage
Round 10252: Reveal phase

$ bun src/index.ts stage --json
{"round":10252,"phase":"Reveal"}
```

### `list`

List all active votes for the current round with descriptions, vote options, and Discord community summaries.

```
$ bun src/index.ts list

  UMA Dispute Voter CLI
══════════════════════════════════════════════════════════════════════
  Round:  10252   Phase: Reveal   Ends: Sun, 22 Feb 2026 00:00:00 UTC

  9 active votes in Round #10252:

──────────────────────────────────────────────────────────────────────
  [1] YES_OR_NO_QUERY  Dispute
──────────────────────────────────────────────────────────────────────
  Time:     Wed, 18 Feb 2026 21:16:00 UTC

  Question / Description:
  Will Trump say "Smart" or "High IQ" during the Black History
    Month reception?

  Vote Options:
  ● Yes                            1e18 (1000000000000000000)
  ● No                             0
  ● Ambiguous / Too early to tell  0.5e18 (500000000000000000)

  Discord Summary (Feb 20, 2026 · 5 comments)
  P2: • Supporters contend that the market should resolve to P2 because
      it has been clarified
  Uncategorized: • A contributor provides rule clarifications and
      references official sources
```

Pass `--json` / `-j` for structured output (useful for piping to other tools or LLMs):

```
$ bun src/index.ts list --json | jq '.votes[] | {index, description, options: [.options[].label]}'
```

### `commit`

Commit votes during the Commit phase. Takes a JSON file of vote selections and writes a commit data file that must be kept for the reveal step.

**Step 1 — create your votes file** (use `list` to see indices and valid option labels):

```json
[
  { "index": 1, "vote": "Yes" },
  { "index": 3, "vote": "No" },
  { "index": 5, "vote": "Ambiguous / Too early to tell" }
]
```

**Step 2 — commit:**

```sh
# Private key via flag
bun src/index.ts commit --votes my-votes.json --out commit-data.json --private-key 0x…

# Or via environment variable (recommended)
export UMA_PRIVATE_KEY=0x…
bun src/index.ts commit --votes my-votes.json --out commit-data.json
```

Output (`commit-data.json`) contains the round ID, voter address, transaction hash, and per-vote salts — **keep this file safe**, you need it to reveal.

### `reveal`

Reveal votes during the Reveal phase using the file produced by `commit`.

```sh
bun src/index.ts reveal --in commit-data.json --private-key 0x…
```

The command validates that:
- The current phase is Reveal (not Commit)
- The round ID in the file matches the current round
- The private key matches the voter address in the file

### Gas costs

Both `commit` and `reveal` send a single batch transaction to the VotingV2 contract. Gas used scales with the number of votes in the batch — roughly 80–120k gas per transaction for a typical batch of votes. At normal network conditions this costs well under $1. Gas is estimated automatically by the RPC node; no manual gas limit is required.

### Options

| Flag | Default | Commands |
|------|---------|----------|
| `-r, --rpc-url <url>` | `https://eth.llamarpc.com` | all |
| `-j, --json` | `false` | `stage`, `list` |
| `--private-key <hex>` | `$UMA_PRIVATE_KEY` | `commit`, `reveal` |
| `--votes <file>` | — | `commit` |
| `--out <file>` | — | `commit` |
| `--in <file>` | — | `reveal` |

## How it works

**Vote resolution:**
Most active UMA votes originate on Polygon via Polymarket's OptimisticOracleV2. The mainnet ancillary data only contains a `keccak256` hash of the original question. The CLI resolves the human-readable question by:

1. Extracting `childOracle`, `childBlockNumber`, and `ancillaryDataHash` from the mainnet ancillary data
2. Scanning logs from the `OracleChildTunnel` contract on Polygon around the originating block
3. Decoding `PriceRequestAdded` events and verifying the `keccak256` hash matches

Multiple ABI decode strategies are tried in order (specific event layouts → brute-force scan), with fallback to multiple public RPC endpoints.

**Discord summaries:**
The CLI fetches LLM-generated summaries of Discord community comments from `vote.uma.xyz`. Each summary is organized by outcome (P1/P2/P3/P4/Uncategorized) showing what arguments the community is making for each resolution. If no cached summary exists for a vote, the CLI triggers on-demand generation and retries automatically (this may add a few seconds per vote).

## How commit/reveal works

UMA uses a commit-reveal scheme to prevent voters from copying each other's answers:

1. **Commit phase** — submit `keccak256(price || salt || voter || time || ancillaryData || roundId || identifier)`. The hash hides your vote.
2. **Reveal phase** — submit the original `price` and `salt`. The contract verifies the hash matches and tallies the vote.

The CLI generates a cryptographically random salt per vote and stores everything needed for reveal in the commit file. Never reuse a salt and keep the commit file confidential until the reveal phase ends.

## Development

```sh
# Unit tests — commit/reveal logic (no network)
bun test tests/commit.test.ts

# Unit tests — parsing and formatting (no network)
bun test tests/list.test.ts

# Integration tests — live Polygon RPC calls
bun test tests/crosschain.test.ts

# Run all tests
bun test
```

## Contract addresses

| Contract | Network | Address |
|----------|---------|---------|
| VotingV2 | Ethereum mainnet | `0x004395edb43EFca9885CEdad51EC9fAf93Bd34ac` |
| OracleChildTunnel | Polygon | `0xac60353a54873c446101216829a6A98cDbbC3f3D` |
| OptimisticOracleV2 | Polygon | `0xee3afe347d5c74317041e2618c49534daf887c24` |
