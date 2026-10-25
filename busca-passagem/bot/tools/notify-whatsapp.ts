import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { defaultWhatsAppTo, sendWhatsAppText } from "../lib/evolution.js";

export default defineTool({
  description:
    "Send a WhatsApp text via Evolution API (mock-logs when Evolution env is missing).",
  effect: "write",
  inputSchema: z.object({
    text: z.string().min(1).max(3500),
    to: z
      .string()
      .optional()
      .describe("Digits-only or +E.164; defaults to WHATSAPP_TO"),
  }),
  dryRunResult: ({ text, to }) => ({
    dryRun: true,
    to: to ?? "WHATSAPP_TO",
    preview: text.slice(0, 80),
  }),
  async execute({ text, to }) {
    const dest = to ?? defaultWhatsAppTo();
    if (!dest) {
      return {
        ok: false as const,
        error: "missing_to",
        hint: "Pass to= or set WHATSAPP_TO",
      };
    }
    const result = await sendWhatsAppText({ to: dest, text });
    return result;
  },
});
