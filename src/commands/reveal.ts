import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import chalk from "chalk";
import { VOTING_V2_ABI, VOTING_V2_ADDRESS } from "../lib/abi.js";
import { createClient } from "../lib/voting.js";
import { readCommitFile } from "../lib/commit.js";
import { extractRevertReason, dumpError } from "../lib/errors.js";

export interface RevealOptions {
  inFile: string;
  privateKey: `0x${string}`;
  rpcUrl: string;
  dryRun: boolean;
  debug: boolean;
}

export async function revealCommand(options: RevealOptions): Promise<void> {
  const { inFile, privateKey, rpcUrl, dryRun, debug } = options;

  // Read commit file
  let commitFile;
  try {
    commitFile = readCommitFile(inFile);
  } catch (err) {
    process.stderr.write(chalk.red(`  Error reading commit file: ${err instanceof Error ? err.message : err}\n`));
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const signerAddress = account.address;

  process.stdout.write(chalk.dim(`  Signer:  ${signerAddress}\n`));
  process.stdout.write(chalk.dim(`  Network: ${rpcUrl}\n\n`));

  const publicClient = createClient(rpcUrl);

  // Validate phase, round, and resolve delegate → staker
  const [phaseRaw, roundIdRaw, resolvedVoter] = await Promise.all([
    publicClient.readContract({ address: VOTING_V2_ADDRESS, abi: VOTING_V2_ABI, functionName: "getVotePhase" }),
    publicClient.readContract({ address: VOTING_V2_ADDRESS, abi: VOTING_V2_ABI, functionName: "getCurrentRoundId" }),
    publicClient.readContract({ address: VOTING_V2_ADDRESS, abi: VOTING_V2_ABI, functionName: "getVoterFromDelegate", args: [signerAddress] }),
  ]);

  // The effective voter (staker) must match what was used in the commit hash
  const effectiveVoter = (resolvedVoter as string).toLowerCase();
  if (effectiveVoter !== commitFile.voterAddress.toLowerCase()) {
    process.stderr.write(
      chalk.red(
        `  Error: This key's effective voter address (${resolvedVoter}) does not match the commit file voter (${commitFile.voterAddress})\n` +
        `  Make sure you are using the same key (or delegate) that was used to commit.\n`
      )
    );
    process.exit(1);
  }

  const isDelegate = effectiveVoter !== signerAddress.toLowerCase();
  if (isDelegate) {
    process.stdout.write(chalk.dim(`  Revealing as delegate for: ${resolvedVoter}\n\n`));
  }

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

  const contractCall = {
    address: VOTING_V2_ADDRESS,
    abi: VOTING_V2_ABI,
    functionName: "batchReveal",
    args: [reveals],
    account: signerAddress, // msg.sender is the signer (delegate or staker)
  } as const;

  if (debug) {
    process.stderr.write(chalk.dim(
      `\n  === DEBUG: batchReveal params ===\n` +
      `  Contract:   ${VOTING_V2_ADDRESS}\n` +
      `  msg.sender: ${signerAddress}\n` +
      `  voterAddr:  ${resolvedVoter}${isDelegate ? " (staker, resolved from delegate)" : ""}\n` +
      `  roundId:    ${currentRoundId}\n` +
      `  reveals:\n` +
      reveals.map((r, i) =>
        `    [${i}] identifier:    ${r.identifier}\n` +
        `         time:          ${r.time}\n` +
        `         price:         ${r.price}\n` +
        `         ancillaryData: ${r.ancillaryData}\n` +
        `         salt:          ${r.salt}\n`
      ).join("") +
      `  =================================\n\n`
    ));
  }

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
        `\n  ${chalk.bold("Gas estimate (batchReveal)")}\n` +
        `  Gas units:  ${chalk.bold(gasEstimate.toLocaleString())}\n` +
        `  Gas price:  ${chalk.bold(gasPriceGwei.toFixed(2))} gwei\n` +
        `  Est. cost:  ${chalk.bold(costEth.toFixed(6))} ETH\n\n`
      );
    } catch (err) {
      process.stderr.write(chalk.red(`  Gas estimation failed: ${extractRevertReason(err)}\n`));
      process.exit(1);
    }
    return;
  }

  // Simulate first to surface revert reasons before broadcasting
  process.stdout.write(chalk.dim("  Simulating batchReveal…\n"));
  let simulatedRequest: Awaited<ReturnType<typeof publicClient.simulateContract>>["request"];
  try {
    const { request } = await publicClient.simulateContract(contractCall);
    simulatedRequest = request;
  } catch (err) {
    const reason = extractRevertReason(err);
    process.stderr.write(chalk.red(`  Simulation failed (transaction would revert):\n  ${reason}\n`));
    if (debug) {
      process.stderr.write(chalk.dim(`\n  === DEBUG: full error ===\n${dumpError(err)}\n  =========================\n`));
    }
    process.exit(1);
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
    txHash = await walletClient.writeContract(simulatedRequest);
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
