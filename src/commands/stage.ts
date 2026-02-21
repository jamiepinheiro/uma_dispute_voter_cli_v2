import { createClient } from "../lib/voting.js";
import { VOTING_V2_ABI, VOTING_V2_ADDRESS } from "../lib/abi.js";
import chalk from "chalk";

export interface StageOptions {
  rpcUrl: string;
  json: boolean;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "ending now";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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

    // Fetch current and previous round end times to determine phase boundaries
    const [roundEndRaw, prevRoundEndRaw] = await Promise.all([
      client.readContract({
        address: VOTING_V2_ADDRESS,
        abi: VOTING_V2_ABI,
        functionName: "getRoundEndTime",
        args: [BigInt(round)],
      }),
      client.readContract({
        address: VOTING_V2_ADDRESS,
        abi: VOTING_V2_ABI,
        functionName: "getRoundEndTime",
        args: [BigInt(round - 1)],
      }),
    ]);

    const roundEnd = Number(roundEndRaw) * 1000;       // ms
    const roundStart = Number(prevRoundEndRaw) * 1000; // ms
    const commitEnd = roundStart + (roundEnd - roundStart) / 2;
    const phaseEnd = phase === "Commit" ? commitEnd : roundEnd;
    const now = Date.now();
    const msRemaining = phaseEnd - now;
    const phaseEndsAt = new Date(phaseEnd).toUTCString();

    if (json) {
      process.stdout.write(
        JSON.stringify({ round, phase, phaseEndsAt, msRemaining: Math.max(0, msRemaining) }) + "\n"
      );
    } else {
      const phaseColor = phase === "Commit" ? chalk.yellow.bold : chalk.green.bold;
      process.stdout.write(
        `Round ${chalk.bold(String(round))}: ${phaseColor(phase)} phase\n` +
        `Ends in ${chalk.bold(formatTimeRemaining(msRemaining))} (${phaseEndsAt})\n`
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
