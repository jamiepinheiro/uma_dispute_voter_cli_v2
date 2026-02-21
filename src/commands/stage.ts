import { createClient } from "../lib/voting.js";
import { VOTING_V2_ABI, VOTING_V2_ADDRESS } from "../lib/abi.js";
import chalk from "chalk";

export interface StageOptions {
  rpcUrl: string;
  json: boolean;
}

export async function stageCommand(options: StageOptions): Promise<void> {
  const { rpcUrl, json } = options;

  const client = createClient(rpcUrl);

  try {
    const [phaseRaw, roundId] = await Promise.all([
      client.readContract({
        address: VOTING_V2_ADDRESS,
        abi: VOTING_V2_ABI,
        functionName: "getVotePhase",
      }),
      client.readContract({
        address: VOTING_V2_ADDRESS,
        abi: VOTING_V2_ABI,
        functionName: "getCurrentRoundId",
      }),
    ]);

    const phase = phaseRaw === 0 ? "Commit" : "Reveal";
    const round = Number(roundId);

    if (json) {
      process.stdout.write(JSON.stringify({ round, phase }) + "\n");
    } else {
      const phaseColor = phase === "Commit" ? chalk.yellow.bold : chalk.green.bold;
      process.stdout.write(
        `Round ${chalk.bold(String(round))}: ${phaseColor(phase)} phase\n`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) {
      process.stdout.write(JSON.stringify({ error: msg }) + "\n");
    } else {
      process.stderr.write(chalk.red(`Error: ${msg}\n`));
    }
    process.exit(1);
  }
}
