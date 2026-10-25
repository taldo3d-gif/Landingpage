import {
  defineChannel,
  localDevStrict,
  POST,
  sharedSecretAuth,
} from "@grok/agent-sdk/channels";
import * as z from "zod/v4";
import { extractInboundWhatsApp, sendWhatsAppText } from "../lib/evolution.js";

type WhatsAppState = {
  from: string;
  lastHoldId: string | null;
};

export default defineChannel<WhatsAppState>({
  state: { from: "", lastHoldId: null },
  auth: [
    localDevStrict(),
    sharedSecretAuth({
      header: "x-webhook-secret",
      secret: "WHATSAPP_WEBHOOK_SECRET",
    }),
  ],
  routes: [
    POST("/inbound", {
      description: "Evolution API inbound WhatsApp message webhook",
      bodySchema: z.record(z.string(), z.unknown()),
      handler: async (_request, { send, waitUntil, body, callTool }) => {
        const inbound = extractInboundWhatsApp(body as Record<string, unknown>);
        if (inbound.fromMe || !inbound.text || !inbound.from) {
          return new Response(null, { status: 202 });
        }

        const text = inbound.text.trim();
        const upper = text.toUpperCase();

        // Fast path: SIM/NÃO with an explicit hold id in the message
        const holdMatch = text.match(/\b(h-[a-z0-9]+)\b/i);
        if ((upper === "SIM" || upper === "NÃO" || upper === "NAO" || upper.startsWith("SIM ") || upper.startsWith("NÃO ") || upper.startsWith("NAO ")) && holdMatch) {
          const action = upper.startsWith("SIM") ? "confirm" : "cancel";
          waitUntil(
            (async () => {
              await callTool("confirm-or-cancel", {
                holdId: holdMatch[1],
                action,
              });
              await sendWhatsAppText({
                to: inbound.from!,
                text:
                  action === "confirm"
                    ? `✅ Hold ${holdMatch[1]} confirmado.`
                    : `❌ Hold ${holdMatch[1]} cancelado.`,
              });
            })(),
          );
          return new Response(null, { status: 202 });
        }

        waitUntil(
          send(
            [
              `WhatsApp de ${inbound.from}:`,
              text,
              "",
              "Se for confirmação de hold, use confirm-or-cancel.",
              "Se for nova rota/teto de preço, use upsert-watch.",
              "Responda em português, curto, e use notify-whatsapp para a resposta ao usuário.",
            ].join("\n"),
            {
              continuationToken: `wa:${inbound.from}`,
              state: { from: inbound.from, lastHoldId: null },
              title: `WhatsApp ${inbound.from}`,
              admission: "coalesce",
            },
          ),
        );
        return new Response(null, { status: 202 });
      },
    }),
    POST("/alert", {
      description: "Internal/dev: push a price-watch cycle into this channel",
      bodySchema: z.object({
        message: z.string().optional(),
      }),
      handler: async (_request, { send, waitUntil, body }) => {
        waitUntil(
          send(
            body.message ??
              "Execute run-price-watch agora e resuma o resultado em português.",
            {
              continuationToken: "wa:price-watch",
              title: "Price watch",
              admission: "coalesce",
            },
          ),
        );
        return new Response(null, { status: 202 });
      },
    }),
  ],
  events: {
    async "message.completed"(event, channel) {
      if (event.data.finishReason === "tool_call" || event.data.text === "") {
        return;
      }
      const from = channel.state.from;
      if (!from) return;
      // Avoid double-send when the model already called notify-whatsapp.
      if (/notify-whatsapp/i.test(event.data.text)) return;
      await sendWhatsAppText({ to: from, text: event.data.text });
    },
  },
});
