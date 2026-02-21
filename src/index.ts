#!/usr/bin/env bun
import { Command } from "commander";
import { listCommand } from "./commands/list.js";

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

program.parse(process.argv);
