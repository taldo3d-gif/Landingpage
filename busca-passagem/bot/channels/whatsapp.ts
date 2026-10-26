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
};

export default defineChannel<WhatsAppState>({
  state: { from: "" },
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
      handler: async (_request, { send, waitUntil, body }) => {
        const inbound = extractInboundWhatsApp(body as Record<string, unknown>);
        if (inbound.fromMe || !inbound.text || !inbound.from) {
          return new Response(null, { status: 202 });
        }

        waitUntil(
          send(
            [
              `WhatsApp de ${inbound.from}:`,
              inbound.text.trim(),
              "",
              "Uso pessoal: ajudar a achar preço baixo de passagem para o casal.",
              "Se for nova rota/teto, use upsert-watch.",
              "Se pedir busca agora, use search-prices ou run-price-watch.",
              "Sempre inclua links de compra (build-buy-links / buyLinks).",
              "Responda em português, curto; use notify-whatsapp para a resposta.",
            ].join("\n"),
            {
              continuationToken: `wa:${inbound.from}`,
              state: { from: inbound.from },
              title: `WhatsApp ${inbound.from}`,
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
      if (/notify-whatsapp/i.test(event.data.text)) return;
      await sendWhatsAppText({ to: from, text: event.data.text });
    },
  },
});
