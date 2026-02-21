import type { ParsedVote, DiscordSummaryData } from "../types.js";

const SUMMARY_API = "https://vote.uma.xyz/api/fetch-summary";

// Fetch the Discord community summary for a vote from UMA's API.
// Returns null if no summary exists (404) or on any error.
export async function fetchDiscordSummary(
  vote: ParsedVote
): Promise<DiscordSummaryData | null> {
  // Only attempt if we have a real description (not a hash fallback)
  if (!vote.description || vote.description.startsWith("[Cross-chain")) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      time: String(Math.round(vote.time.getTime() / 1000)),
      identifier: vote.identifier,
      title: vote.description,
    });

    const res = await fetch(`${SUMMARY_API}?${params}`);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      summary?: Record<string, { summary?: string; sources?: [string, number][] }>;
      generatedAt?: string;
      totalComments?: number;
    };

    const outcomes: DiscordSummaryData["outcomes"] = {};
    for (const key of ["P1", "P2", "P3", "P4", "Uncategorized"] as const) {
      const o = data.summary?.[key];
      if (o?.summary) {
        outcomes[key] = { summary: o.summary, sources: o.sources ?? [] };
      }
    }

    return {
      generatedAt: data.generatedAt ?? "",
      totalComments: data.totalComments,
      outcomes,
    };
  } catch {
    return null;
  }
}
