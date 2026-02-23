import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { readFileSync } from "fs";
import chalk from "chalk";
import { VOTING_V2_ABI, VOTING_V2_ADDRESS } from "../lib/abi.js";
import { fetchVotingData } from "../lib/voting.js";
import { createClient } from "../lib/voting.js";
import { generateSalt, computeCommitHash, writeCommitFile } from "../lib/commit.js";
import { extractRevertReason, dumpError } from "../lib/errors.js";
import type { VoteInput, CommitRecord, CommitFile } from "../types.js";

export interface CommitOptions {
  votesFile: string;
  outFile: string;
  privateKey: `0x${string}`;
  rpcUrl: string;
  dryRun: boolean;
  debug: boolean;
}

export async function commitCommand(options: CommitOptions): Promise<void> {
  const { votesFile, outFile, privateKey, rpcUrl, dryRun, debug } = options;

  // Parse votes input file
  let voteInputs: VoteInput[];
  try {
    voteInputs = JSON.parse(readFileSync(votesFile, "utf-8")) as VoteInput[];
    if (!Array.isArray(voteInputs) || voteInputs.length === 0) {
      throw new Error("Votes file must be a non-empty JSON array");
    }
  } catch (err) {
    process.stderr.write(chalk.red(`  Error reading votes file: ${err instanceof Error ? err.message : err}\n`));
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const signerAddress = account.address;

  process.stdout.write(chalk.dim(`  Signer:  ${signerAddress}\n`));
  process.stdout.write(chalk.dim(`  Network: ${rpcUrl}\n\n`));

  const publicClient = createClient(rpcUrl);

  // Fetch current round, phase, and resolve delegate → staker
  const [phaseRaw, roundIdRaw, resolvedVoter] = await Promise.all([
    publicClient.readContract({ address: VOTING_V2_ADDRESS, abi: VOTING_V2_ABI, functionName: "getVotePhase" }),
    publicClient.readContract({ address: VOTING_V2_ADDRESS, abi: VOTING_V2_ABI, functionName: "getCurrentRoundId" }),
    publicClient.readContract({ address: VOTING_V2_ADDRESS, abi: VOTING_V2_ABI, functionName: "getVoterFromDelegate", args: [signerAddress] }),
  ]);

  // The effective voter address is used in the commit hash. If the signer is a delegate,
  // getVoterFromDelegate returns the staker's address; otherwise it returns the signer's address.
  const voterAddress = resolvedVoter as `0x${string}`;
  const isDelegate = voterAddress.toLowerCase() !== signerAddress.toLowerCase();
  if (isDelegate) {
    process.stdout.write(chalk.dim(`  Voting as delegate for: ${voterAddress}\n\n`));
  }

  // Pre-flight: read voterStakes to catch silent reverts before simulating
  try {
    const stakeInfo = await publicClient.readContract({
      address: VOTING_V2_ADDRESS,
      abi: VOTING_V2_ABI,
      functionName: "voterStakes",
      args: [voterAddress],
    });
    // voterStakes returns a positional tuple: [stake, pendingUnstake, rewardsPaidPerToken,
    //   outstandingRewards, unappliedSlash, nextIndexToProcess, unstakeTime, delegate]
    const [stake, pendingUnstake, , , , , , delegate] = stakeInfo;
    process.stdout.write(chalk.dim(
      `  Stake:   ${stake} (${stake === 0n ? chalk.red("NO STAKE") : "active"})\n` +
      (pendingUnstake > 0n ? chalk.yellow(`  Warning: ${pendingUnstake} pending unstake\n`) : "") +
      (isDelegate && (delegate as string).toLowerCase() !== signerAddress.toLowerCase()
        ? chalk.red(`  Warning: staker's registered delegate (${delegate}) ≠ signer (${signerAddress})\n`)
        : "")
    ));
    if (stake === 0n) {
      process.stderr.write(chalk.red(
        `\n  Error: ${voterAddress} has no active stake in VotingV2.\n` +
        `  The staker must call stake() on the VotingV2 contract before votes can be committed.\n`
      ));
      process.exit(1);
    }
  } catch (err) {
    if (debug) process.stderr.write(chalk.dim(`  (voterStakes preflight failed: ${err instanceof Error ? err.message : err})\n`));
  }

  if (phaseRaw !== 0) {
    process.stderr.write(chalk.red(`  Error: Current phase is Reveal, not Commit. Cannot commit votes now.\n`));
    process.exit(1);
  }

  const roundId = Number(roundIdRaw);
  process.stdout.write(`  Round ${chalk.bold(String(roundId))} — ${chalk.yellow.bold("Commit")} phase\n\n`);

  // Fetch active votes
  const data = await fetchVotingData(publicClient);

  // Match each input to a vote and option, compute salts and hashes
  type VoteCall = {
    identifier: `0x${string}`;
    time: bigint;
    ancillaryData: `0x${string}`;
    hash: `0x${string}`;
    record: CommitRecord;
  };

  const voteCalls: VoteCall[] = [];

  for (const input of voteInputs) {
    const vote = data.votes.find((v) => v.index === input.index);
    if (!vote) {
      process.stderr.write(chalk.red(`  Error: No active vote at index ${input.index}\n`));
      process.exit(1);
    }

    const option = vote.options.find(
      (o) => o.label.toLowerCase() === input.vote.toLowerCase()
    );
    if (!option) {
      const labels = vote.options.map((o) => `"${o.label}"`).join(", ");
      process.stderr.write(
        chalk.red(`  Error: Invalid vote "${input.vote}" for vote ${input.index}. Valid options: ${labels}\n`)
      );
      process.exit(1);
    }

    const salt = generateSalt();
    const time = BigInt(Math.round(vote.time.getTime() / 1000));
    const hash = computeCommitHash(
      option.numericValue,
      salt,
      voterAddress,
      time,
      vote.rawAncillaryData,
      BigInt(roundId),
      vote.rawIdentifier
    );

    process.stdout.write(
      `  [${vote.index}] ${chalk.bold(vote.description.slice(0, 55))}${vote.description.length > 55 ? "…" : ""}\n` +
      `       Vote: ${chalk.green.bold(option.label)} (${option.displayValue})\n` +
      `       Hash: ${chalk.dim(hash)}\n\n`
    );

    voteCalls.push({
      identifier: vote.rawIdentifier,
      time,
      ancillaryData: vote.rawAncillaryData,
      hash,
      record: {
        description: vote.description,
        identifier: vote.rawIdentifier,
        time: time.toString(),
        ancillaryData: vote.rawAncillaryData,
        price: option.numericValue.toString(),
        salt: salt.toString(),
        optionLabel: option.label,
      },
    });
  }

  // Encode each commitVote call for multicall batching
  const encodedCalls = voteCalls.map((vc) =>
    encodeFunctionData({
      abi: VOTING_V2_ABI,
      functionName: "commitVote",
      args: [vc.identifier, vc.time, vc.ancillaryData, vc.hash],
    })
  );

  if (debug) {
    process.stderr.write(chalk.dim(
      `\n  === DEBUG: multicall(commitVote × ${voteCalls.length}) ===\n` +
      `  Contract:    ${VOTING_V2_ADDRESS}\n` +
      `  msg.sender:  ${signerAddress}\n` +
      `  voterAddr:   ${voterAddress}${isDelegate ? " (staker, resolved from delegate)" : ""}\n` +
      `  roundId:     ${roundId}\n` +
      voteCalls.map((c, i) =>
        `  [${i}] identifier:    ${c.identifier}\n` +
        `        time:          ${c.time}\n` +
        `        ancillaryData: ${c.ancillaryData}\n` +
        `        hash:          ${c.hash}\n`
      ).join("") +
      `  ================================\n\n`
    ));
  }

  const contractCall = {
    address: VOTING_V2_ADDRESS,
    abi: VOTING_V2_ABI,
    functionName: "multicall" as const,
    args: [encodedCalls] as const,
    account: signerAddress,
  };

  if (dryRun) {
    process.stdout.write(chalk.dim("  Estimating gas (dry run — no transaction sent)…\n"));
    try {
      const [gasEstimate, gasPrice] = await Promise.all([
        publicClient.estimateContractGas(contractCall),
        publicClient.getGasPrice(),
      ]);
      const costWei = gasEstimate * gasPrice;
      const costEth = Number(costWei) / 1e18;
      const gasPriceGwei = Number(gasPrice) / 1e9;
      process.stdout.write(
        `\n  ${chalk.bold(`Gas estimate (multicall × ${voteCalls.length} commitVote)`)}\n` +
        `  Gas units:  ${chalk.bold(gasEstimate.toLocaleString())}\n` +
        `  Gas price:  ${chalk.bold(gasPriceGwei.toFixed(2))} gwei\n` +
        `  Est. cost:  ${chalk.bold(costEth.toFixed(6))} ETH\n\n`
      );
    } catch (err) {
      process.stderr.write(chalk.red(`  Gas estimation failed: ${extractRevertReason(err)}\n`));
      if (debug) process.stderr.write(chalk.dim(`\n  === DEBUG: full error ===\n${dumpError(err)}\n  =========================\n`));
      process.exit(1);
    }
    return;
  }

  // Simulate first to surface revert reasons before broadcasting
  process.stdout.write(chalk.dim("  Simulating multicall(commitVote…)…\n"));
  try {
    await publicClient.simulateContract(contractCall);
  } catch (err) {
    const reason = extractRevertReason(err);
    process.stderr.write(chalk.red(`  Simulation failed (transaction would revert):\n  ${reason}\n`));
    if (debug) process.stderr.write(chalk.dim(`\n  === DEBUG: full error ===\n${dumpError(err)}\n  =========================\n`));
    process.exit(1);
  }

  // Send single multicall transaction
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(rpcUrl),
  });

  process.stdout.write(chalk.dim("  Sending multicall transaction…\n"));

  let txHash: `0x${string}`;
  try {
    txHash = await walletClient.writeContract({
      address: VOTING_V2_ADDRESS,
      abi: VOTING_V2_ABI,
      functionName: "multicall",
      args: [encodedCalls],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`  Transaction failed: ${msg}\n`));
    process.exit(1);
  }

  // Write commit file
  const commitFile: CommitFile = {
    roundId,
    voterAddress,
    signerAddress,
    committedAt: new Date().toISOString(),
    txHashes: [txHash],
    commits: voteCalls.map((vc) => vc.record),
  };
  writeCommitFile(outFile, commitFile);

  process.stdout.write(
    `\n  ${chalk.green.bold("✓ Committed")} ${voteCalls.length} vote${voteCalls.length === 1 ? "" : "s"}\n` +
    `  Tx:   ${chalk.cyan(txHash)}\n` +
    `  File: ${chalk.cyan(outFile)}\n\n` +
    chalk.dim("  Keep this file safe — you'll need it to reveal your votes.\n\n")
  );
}
