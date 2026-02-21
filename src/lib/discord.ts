import type { ParsedVote, DiscordSummaryData } from "../types.js";

const FETCH_API = "https://vote.uma.xyz/api/fetch-summary";
const UPDATE_API = "https://vote.uma.xyz/api/update-summary";

// Fetch the Discord community summary for a vote from UMA's API.
// If no cached summary exists, triggers generation via update-summary then retries.
// Returns null if no summary can be generated or on any error.
export async function fetchDiscordSummary(
  vote: ParsedVote
): Promise<DiscordSummaryData | null> {
  // Only attempt if we have a real description (not a hash fallback)
  if (!vote.description || vote.description.startsWith("[Cross-chain")) {
    return null;
  }

  const params = new URLSearchParams({
    time: String(Math.round(vote.time.getTime() / 1000)),
    identifier: vote.identifier,
    title: vote.description,
  });

  try {
    const res = await fetch(`${FETCH_API}?${params}`);

    if (res.status === 404) {
      // No cached summary — trigger generation and retry once
      try {
        await fetch(`${UPDATE_API}?${params}`);
      } catch {
        // Ignore update errors (timeouts, etc.) and fall through to retry
      }
      const retryRes = await fetch(`${FETCH_API}?${params}`);
      if (!retryRes.ok) return null;
      return parseSummaryResponse(await retryRes.json());
    }

    if (!res.ok) return null;
    return parseSummaryResponse(await res.json());
  } catch {
    return null;
  }
}

function parseSummaryResponse(data: {
  summary?: Record<string, { summary?: string; sources?: [string, number][] }>;
  generatedAt?: string;
  totalComments?: number;
}): DiscordSummaryData | null {
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
}
