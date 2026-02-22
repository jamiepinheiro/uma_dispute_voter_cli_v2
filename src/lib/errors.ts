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
  const seen = new WeakSet();

  const walk = (e: unknown, depth = 0) => {
    if (!e || typeof e !== "object" || depth > 8) return;
    if (seen.has(e as object)) return;
    seen.add(e as object);

    const o = e as Record<string, unknown>;

    // viem BaseError.shortMessage is the most concise one-liner
    if (o.shortMessage) parts.push(String(o.shortMessage));
    else if (typeof o.message === "string" && depth === 0) parts.push(o.message);

    // viem BaseError.details often contains the raw RPC message e.g. "execution reverted: ..."
    if (o.details && !parts.some(p => p === o.details)) parts.push(`Details: ${o.details}`);

    // Decoded string reason (Error(string))
    if (o.reason) parts.push(`Reason: ${o.reason}`);

    // Decoded custom error from ABI
    if (o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>;
      if (d.errorName) parts.push(`Error: ${d.errorName}${d.args !== undefined ? `(${JSON.stringify(d.args)})` : ""}`);
    }

    // Raw revert bytes (unknown custom error or bare revert with data)
    if (typeof o.data === "string" && o.data.length > 2 && o.data !== "0x") {
      parts.push(`Raw revert data: ${o.data}`);
    }

    // viem BaseError.metaMessages for extra context
    if (Array.isArray(o.metaMessages)) {
      for (const m of o.metaMessages) {
        const s = String(m).trim();
        if (s && !parts.includes(s)) parts.push(s);
      }
    }

    // Walk the cause chain
    if (o.cause) walk(o.cause, depth + 1);
  };

  walk(err);

  return parts.length > 0 ? parts.join("\n  ") : String((err as Error).message ?? err);
}

/**
 * Serialise an error object fully (including non-enumerable properties and
 * the entire cause chain) for debug output.
 */
export function dumpError(err: unknown): string {
  const seen = new WeakSet();
  const replacer = (_key: string, value: unknown) => {
    if (value && typeof value === "object") {
      if (seen.has(value as object)) return "[Circular]";
      seen.add(value as object);
      // Collect both enumerable and non-enumerable own props
      return Object.fromEntries(
        Object.getOwnPropertyNames(value).map(k => [k, (value as Record<string, unknown>)[k]])
      );
    }
    return typeof value === "bigint" ? value.toString() : value;
  };
  try {
    return JSON.stringify(err, replacer, 2);
  } catch {
    return String(err);
  }
}
