import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getHold, putHold } from "../lib/watches.js";

export default defineTool({
  description:
    "Confirm (finalize) or cancel a pending flight hold after WhatsApp reply SIM/NÃO.",
  effect: "write",
  inputSchema: z.object({
    holdId: z.string(),
    action: z.enum(["confirm", "cancel"]),
  }),
  dryRunResult: ({ holdId, action }) => ({
    dryRun: true,
    holdId,
    action,
    status: action === "confirm" ? "confirmed" : "cancelled",
  }),
  async execute({ holdId, action }, ctx) {
    const hold = await getHold(ctx.host.kv, holdId);
    if (!hold) return { ok: false as const, error: "hold_not_found" };

    if (hold.status === "expired" || Date.parse(hold.expiresAt) < Date.now()) {
      hold.status = "expired";
      await putHold(ctx.host.kv, hold);
      return { ok: false as const, error: "hold_expired", hold };
    }
    if (hold.status !== "pending_confirm") {
      return { ok: false as const, error: "hold_not_pending", hold };
    }

    hold.status = action === "confirm" ? "confirmed" : "cancelled";
    await putHold(ctx.host.kv, hold);

    // Live Amadeus cancel/ticket finalization is a follow-up; mock records the decision.
    return {
      ok: true as const,
      hold,
      note:
        action === "confirm"
          ? hold.mock
            ? "Mock hold marked confirmed. Wire Amadeus ticketing/payment next."
            : "Hold marked confirmed. Complete ticketing/payment in Amadeus console or next iteration."
          : "Hold cancelled; no further purchase action.",
    };
  },
});
