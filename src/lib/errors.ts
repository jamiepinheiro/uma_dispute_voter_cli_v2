/**
 * Extracts a human-readable revert reason from a viem simulation/call error.
 *
 * viem wraps revert data in a structured error chain. This function walks that
 * chain and collects everything useful: the short message, decoded reason or
 * custom error name, and the raw hex revert data for cases where the contract
 * reverts without a reason string (bare `revert()` or unknown custom error).
 */
export function extractRevertReason(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);

  const parts: string[] = [];

  const walk = (e: unknown, depth = 0) => {
    if (!e || typeof e !== "object" || depth > 6) return;

    // viem's BaseError.shortMessage is the most concise description
    if ("shortMessage" in e && e.shortMessage) {
      parts.push(String(e.shortMessage));
    } else if ("message" in e && typeof e.message === "string" && depth === 0) {
      parts.push(e.message);
    }

    // Decoded string reason (from Error(string) ABI)
    if ("reason" in e && e.reason) {
      parts.push(`Reason: ${e.reason}`);
    }

    // Decoded custom error (viem decodes these when the error is in the ABI)
    if ("data" in e && e.data && typeof e.data === "object") {
      const d = e.data as Record<string, unknown>;
      if (d.errorName) parts.push(`Error: ${d.errorName}${d.args ? `(${JSON.stringify(d.args)})` : ""}`);
    }

    // Raw revert bytes — always show these so unknown custom errors are visible
    if ("data" in e && typeof e.data === "string" && e.data !== "0x" && e.data !== "") {
      parts.push(`Raw revert data: ${e.data}`);
    }

    // Walk into cause chain
    if ("cause" in e) walk((e as Record<string, unknown>).cause, depth + 1);
  };

  walk(err);

  return parts.length > 0 ? parts.join("\n  ") : String((err as Error).message ?? err);
}
