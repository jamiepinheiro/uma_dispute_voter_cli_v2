#!/usr/bin/env bun
import { Command } from "commander";
import { listCommand } from "./commands/list.js";
import { stageCommand } from "./commands/stage.js";
import { commitCommand } from "./commands/commit.js";
import { revealCommand } from "./commands/reveal.js";

const DEFAULT_RPC_URLS: Record<string, string> = {
  mainnet: "https://eth.llamarpc.com",
  ethereum: "https://eth.llamarpc.com",
  "1": "https://eth.llamarpc.com",
};

const program = new Command();

program
  .name("uma-dv")
  .description("CLI for UMA protocol dispute voting")
  .version("0.1.0");

program
  .command("list")
  .description("List all active votes for the current voting round")
  .option(
    "-r, --rpc-url <url>",
    "Ethereum RPC URL",
    DEFAULT_RPC_URLS.mainnet
  )
  .option(
    "--network <network>",
    "Network shorthand (mainnet)",
    "mainnet"
  )
  .option("-j, --json", "Output machine-readable JSON", false)
  .action(async (opts) => {
    let rpcUrl: string = opts.rpcUrl;

    // Allow --network to resolve to a default RPC
    if (!opts.rpcUrl && opts.network) {
      const resolved = DEFAULT_RPC_URLS[opts.network.toLowerCase()];
      if (resolved) rpcUrl = resolved;
    }

    await listCommand({ rpcUrl, json: opts.json });
  });

program
  .command("stage")
  .description("Show the current voting phase (Commit or Reveal) for the active round")
  .option("-r, --rpc-url <url>", "Ethereum RPC URL", DEFAULT_RPC_URLS.mainnet)
  .option("-j, --json", "Output machine-readable JSON", false)
  .action(async (opts) => {
    await stageCommand({ rpcUrl: opts.rpcUrl, json: opts.json });
  });

program
  .command("commit")
  .description("Commit votes for the current Commit phase")
  .requiredOption("--votes <file>", "JSON file of vote selections: [{index, vote}]")
  .requiredOption("--out <file>", "File to write commit data (needed for reveal)")
  .option("-r, --rpc-url <url>", "Ethereum RPC URL", DEFAULT_RPC_URLS.mainnet)
  .option("--private-key <hex>", "Voter private key (or set UMA_PRIVATE_KEY env var)")
  .option("--dry-run", "Estimate gas without sending the transaction", false)
  .action(async (opts) => {
    const privateKey = (opts.privateKey ?? process.env.UMA_PRIVATE_KEY ?? "") as string;
    if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
      process.stderr.write("Error: private key must be a 0x-prefixed 32-byte hex string.\n");
      process.stderr.write("Pass via --private-key or set the UMA_PRIVATE_KEY environment variable.\n");
      process.exit(1);
    }
    await commitCommand({
      votesFile: opts.votes,
      outFile: opts.out,
      privateKey: privateKey as `0x${string}`,
      rpcUrl: opts.rpcUrl,
      dryRun: opts.dryRun,
    });
  });

program
  .command("reveal")
  .description("Reveal votes for the current Reveal phase using a commit file")
  .requiredOption("--in <file>", "Commit file produced by the commit command")
  .option("-r, --rpc-url <url>", "Ethereum RPC URL", DEFAULT_RPC_URLS.mainnet)
  .option("--private-key <hex>", "Voter private key (or set UMA_PRIVATE_KEY env var)")
  .option("--dry-run", "Estimate gas without sending the transaction", false)
  .action(async (opts) => {
    const privateKey = (opts.privateKey ?? process.env.UMA_PRIVATE_KEY ?? "") as string;
    if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
      process.stderr.write("Error: private key must be a 0x-prefixed 32-byte hex string.\n");
      process.stderr.write("Pass via --private-key or set the UMA_PRIVATE_KEY environment variable.\n");
      process.exit(1);
    }
    await revealCommand({
      inFile: opts.in,
      privateKey: privateKey as `0x${string}`,
      rpcUrl: opts.rpcUrl,
      dryRun: opts.dryRun,
    });
  });

program.parse(process.argv);
