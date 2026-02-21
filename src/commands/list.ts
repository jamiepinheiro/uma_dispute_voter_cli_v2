import { createClient, fetchVotingData } from "../lib/voting.js";
import { formatVotingData } from "../lib/format.js";
import chalk from "chalk";

export interface ListOptions {
  rpcUrl: string;
  json: boolean;
}

export async function listCommand(options: ListOptions): Promise<void> {
  const { rpcUrl, json } = options;

  if (!json) {
    process.stdout.write(chalk.dim(`  Connecting to ${rpcUrl}...\n`));
  }

  const client = createClient(rpcUrl);

  try {
    const data = await fetchVotingData(client);

    if (json) {
      process.stdout.write(
        JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n"
      );
    } else {
      const output = formatVotingData(data);
      process.stdout.write(output);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) {
      process.stdout.write(JSON.stringify({ error: msg }) + "\n");
    } else {
      process.stderr.write(
        chalk.red(`\n  Error fetching voting data:\n  ${msg}\n\n`)
      );
    }
    process.exit(1);
  }
}
