import chalk from "chalk";
import type { VotingData, ParsedVote, RoundInfo } from "../types.js";

const DIVIDER = chalk.dim("─".repeat(70));
const HEADER_DIVIDER = chalk.dim("═".repeat(70));

function formatDate(date: Date): string {
  return date.toUTCString().replace(" GMT", " UTC");
}

function formatVoteType(vote: ParsedVote): string {
  if (vote.isGovernance) return chalk.magenta("Governance");
  return chalk.cyan("Dispute");
}

function formatRoundHeader(round: RoundInfo): string {
  const phaseColor = round.phase === "Commit" ? chalk.yellow : chalk.green;
  const lines: string[] = [
    "",
    chalk.bold.blue("  UMA Dispute Voter CLI"),
    HEADER_DIVIDER,
    `  ${chalk.dim("Round:")}  ${chalk.bold(String(round.roundId))}   ` +
      `${chalk.dim("Phase:")} ${phaseColor.bold(round.phase)}   ` +
      `${chalk.dim("Ends:")} ${chalk.white(formatDate(round.endTime))}`,
    "",
    round.voteCount === 0
      ? chalk.dim("  No active votes in this round.")
      : `  ${chalk.bold(String(round.voteCount))} active vote${round.voteCount === 1 ? "" : "s"} in Round #${round.roundId}:`,
    "",
  ];
  return lines.join("\n");
}

function formatVote(vote: ParsedVote): string {
  const indexLabel = chalk.bold.white(`[${vote.index}]`);
  const identifierLabel = chalk.bold.yellow(vote.identifier);
  const typeLabel = formatVoteType(vote);

  const lines: string[] = [
    DIVIDER,
    `  ${indexLabel} ${identifierLabel}  ${typeLabel}`,
    DIVIDER,
    `  ${chalk.dim("Time:")}     ${formatDate(vote.time)}`,
  ];

  if (vote.rollCount > 0) {
    lines.push(
      `  ${chalk.dim("Rolled:")}   ${chalk.red(String(vote.rollCount))} time${vote.rollCount === 1 ? "" : "s"} (failed to resolve in prior round${vote.rollCount === 1 ? "" : "s"})`
    );
  }

  lines.push("");
  lines.push(`  ${chalk.dim("Question / Description:")}`);

  // Word-wrap description at ~65 chars
  const words = vote.description.split(" ");
  let line = "  ";
  for (const word of words) {
    if ((line + word).length > 67) {
      lines.push(chalk.white(line));
      line = "    " + word + " ";
    } else {
      line += word + " ";
    }
  }
  if (line.trim()) lines.push(chalk.white(line));

  lines.push("");
  lines.push(`  ${chalk.dim("Vote Options:")}`);
  for (const opt of vote.options) {
    const bullet = chalk.green("  ●");
    const label = chalk.bold(opt.label.padEnd(30));
    const value = chalk.cyan(opt.displayValue);
    lines.push(`${bullet} ${label} ${value}`);
  }

  if (
    vote.ancillaryRaw &&
    vote.ancillaryRaw !== vote.description &&
    vote.ancillaryRaw.length < 300
  ) {
    lines.push("");
    lines.push(`  ${chalk.dim("Ancillary data:")} ${chalk.dim(vote.ancillaryRaw)}`);
  }

  // Discord community summary
  const ds = vote.discordSummary;
  if (ds) {
    const entries = Object.entries(ds.outcomes) as [string, { summary: string; sources: [string, number][] }][];
    if (entries.length > 0) {
      const date = new Date(ds.generatedAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
      const commentStr = ds.totalComments != null ? ` · ${ds.totalComments} comments` : "";
      lines.push("");
      lines.push(`  ${chalk.bold.blue("Discord Summary")} ${chalk.dim(`(${date}${commentStr})`)}`);
      for (const [label, outcome] of entries) {
        lines.push(`  ${chalk.bold.dim(label + ":")} ${outcome.summary}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function formatVotingData(data: VotingData): string {
  const sections: string[] = [formatRoundHeader(data.round)];

  for (const vote of data.votes) {
    sections.push(formatVote(vote));
  }

  if (data.votes.length > 0) {
    sections.push(DIVIDER);
    sections.push("");
  }

  return sections.join("\n");
}
