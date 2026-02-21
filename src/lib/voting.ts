import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { VOTING_V2_ABI, VOTING_V2_ADDRESS } from "./abi.js";
import { parseVote } from "./parse.js";
import { fetchDiscordSummary } from "./discord.js";
import type { VotingData, RoundInfo } from "../types.js";

export type PublicClient = ReturnType<typeof createPublicClient>;

export function createClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
}

export async function fetchVotingData(client: PublicClient): Promise<VotingData> {
  const [rawVotes, phaseRaw, roundId] = await Promise.all([
    client.readContract({
      address: VOTING_V2_ADDRESS,
      abi: VOTING_V2_ABI,
      functionName: "getPendingRequests",
    }),
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

  const endTimeRaw = await client.readContract({
    address: VOTING_V2_ADDRESS,
    abi: VOTING_V2_ABI,
    functionName: "getRoundEndTime",
    args: [BigInt(roundId)],
  });

  const phase = phaseRaw === 0 ? "Commit" : "Reveal";

  const round: RoundInfo = {
    roundId: Number(roundId),
    phase,
    endTime: new Date(Number(endTimeRaw) * 1000),
    voteCount: rawVotes.length,
  };

  const votes = await Promise.all(
    rawVotes.map((v, i) =>
      parseVote(
        {
          lastVotingRound: v.lastVotingRound,
          isGovernance: v.isGovernance,
          time: v.time,
          rollCount: v.rollCount,
          identifier: v.identifier,
          ancillaryData: v.ancillaryData as `0x${string}`,
        },
        i + 1
      )
    )
  );

  // Fetch Discord summaries in parallel (best-effort — failures return null)
  const summaries = await Promise.all(votes.map(fetchDiscordSummary));
  const votesWithSummaries = votes.map((v, i) => ({
    ...v,
    discordSummary: summaries[i],
  }));

  return { round, votes: votesWithSummaries };
}
