import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import chalk from "chalk";
import { VOTING_V2_ABI, VOTING_V2_ADDRESS } from "../lib/abi.js";
import { createClient } from "../lib/voting.js";
import { readCommitFile } from "../lib/commit.js";

export interface RevealOptions {
  inFile: string;
  privateKey: `0x${string}`;
  rpcUrl: string;
  dryRun: boolean;
}

export async function revealCommand(options: RevealOptions): Promise<void> {
  const { inFile, privateKey, rpcUrl, dryRun } = options;

  // Read commit file
  let commitFile;
  try {
    commitFile = readCommitFile(inFile);
  } catch (err) {
    process.stderr.write(chalk.red(`  Error reading commit file: ${err instanceof Error ? err.message : err}\n`));
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const voterAddress = account.address;

  if (voterAddress.toLowerCase() !== commitFile.voterAddress.toLowerCase()) {
    process.stderr.write(
      chalk.red(`  Error: Private key address (${voterAddress}) does not match commit file voter (${commitFile.voterAddress})\n`)
    );
    process.exit(1);
  }

  process.stdout.write(chalk.dim(`  Voter:   ${voterAddress}\n`));
  process.stdout.write(chalk.dim(`  Network: ${rpcUrl}\n\n`));

  const publicClient = createClient(rpcUrl);

  // Validate phase and round
  const [phaseRaw, roundIdRaw] = await Promise.all([
    publicClient.readContract({ address: VOTING_V2_ADDRESS, abi: VOTING_V2_ABI, functionName: "getVotePhase" }),
    publicClient.readContract({ address: VOTING_V2_ADDRESS, abi: VOTING_V2_ABI, functionName: "getCurrentRoundId" }),
  ]);

  if (phaseRaw !== 1) {
    process.stderr.write(chalk.red(`  Error: Current phase is Commit, not Reveal. Cannot reveal votes yet.\n`));
    process.exit(1);
  }

  const currentRoundId = Number(roundIdRaw);
  if (currentRoundId !== commitFile.roundId) {
    process.stderr.write(
      chalk.red(`  Error: Commit file is for round ${commitFile.roundId} but current round is ${currentRoundId}.\n`)
    );
    process.exit(1);
  }

  process.stdout.write(`  Round ${chalk.bold(String(currentRoundId))} — ${chalk.green.bold("Reveal")} phase\n\n`);

  // Build reveal structs
  const reveals = commitFile.commits.map((c) => ({
    identifier: c.identifier as `0x${string}`,
    time: BigInt(c.time),
    price: BigInt(c.price),
    ancillaryData: c.ancillaryData as `0x${string}`,
    salt: BigInt(c.salt),
  }));

  for (const c of commitFile.commits) {
    process.stdout.write(
      `  ${chalk.bold(c.description.slice(0, 55))}${c.description.length > 55 ? "…" : ""}\n` +
      `       Vote: ${chalk.green.bold(c.optionLabel)}\n\n`
    );
  }

  if (dryRun) {
    process.stdout.write(chalk.dim("  Estimating gas (dry run — no transaction sent)…\n"));
    try {
      const [gasEstimate, gasPrice] = await Promise.all([
        publicClient.estimateContractGas({
          address: VOTING_V2_ADDRESS,
          abi: VOTING_V2_ABI,
          functionName: "batchReveal",
          args: [reveals],
          account: voterAddress,
        }),
        publicClient.getGasPrice(),
      ]);
      const costWei = gasEstimate * gasPrice;
      const costEth = Number(costWei) / 1e18;
      const gasPriceGwei = Number(gasPrice) / 1e9;
      process.stdout.write(
        `\n  ${chalk.bold("Gas estimate (batchReveal)")}\n` +
        `  Gas units:  ${chalk.bold(gasEstimate.toLocaleString())}\n` +
        `  Gas price:  ${chalk.bold(gasPriceGwei.toFixed(2))} gwei\n` +
        `  Est. cost:  ${chalk.bold(costEth.toFixed(6))} ETH\n\n`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(chalk.red(`  Gas estimation failed: ${msg}\n`));
      process.exit(1);
    }
    return;
  }

  // Send batchReveal transaction
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(rpcUrl),
  });

  process.stdout.write(chalk.dim("  Sending batchReveal transaction…\n"));

  let txHash: `0x${string}`;
  try {
    txHash = await walletClient.writeContract({
      address: VOTING_V2_ADDRESS,
      abi: VOTING_V2_ABI,
      functionName: "batchReveal",
      args: [reveals],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`  Transaction failed: ${msg}\n`));
    process.exit(1);
  }

  process.stdout.write(
    `\n  ${chalk.green.bold("✓ Revealed")} ${reveals.length} vote${reveals.length === 1 ? "" : "s"}\n` +
    `  Tx: ${chalk.cyan(txHash)}\n\n`
  );
}
