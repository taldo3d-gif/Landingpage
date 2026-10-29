export function evolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_BASE_URL &&
      process.env.EVOLUTION_API_KEY &&
      process.env.EVOLUTION_INSTANCE,
  );
}

function normalizeNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function sendWhatsAppText(input: {
  to: string;
  text: string;
}): Promise<{ ok: true; mode: "live" | "mock"; to: string } | { ok: false; error: string }> {
  const to = normalizeNumber(input.to);
  if (!to) return { ok: false, error: "empty WhatsApp number" };

  if (!evolutionConfigured()) {
    console.info("[evolution:mock] would send WhatsApp", { to, text: input.text.slice(0, 120) });
    return { ok: true, mode: "mock", to };
  }

  const base = process.env.EVOLUTION_BASE_URL!.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_INSTANCE!;
  const res = await fetch(`${base}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: process.env.EVOLUTION_API_KEY!,
    },
    body: JSON.stringify({ number: to, text: input.text }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Evolution send failed (${res.status}): ${text.slice(0, 200)}` };
  }
  return { ok: true, mode: "live", to };
}

export function defaultWhatsAppTo(): string | null {
  const n = process.env.WHATSAPP_TO;
  return n ? normalizeNumber(n) : null;
}

/** Best-effort parse of Evolution messages.upsert-style payloads. */
export function extractInboundWhatsApp(body: Record<string, unknown>): {
  from: string | null;
  text: string | null;
  fromMe: boolean;
} {
  const data = (body.data ?? body) as Record<string, unknown>;
  const key = (data.key ?? {}) as { remoteJid?: string; fromMe?: boolean };
  const message = (data.message ?? {}) as Record<string, unknown>;
  const text =
    (typeof message.conversation === "string" && message.conversation) ||
    (typeof (message.extendedTextMessage as { text?: string } | undefined)?.text ===
      "string" &&
      (message.extendedTextMessage as { text: string }).text) ||
    (typeof body.text === "string" && body.text) ||
    (typeof body.message === "string" && body.message) ||
    null;
  const remoteJid = key.remoteJid ?? (typeof body.from === "string" ? body.from : null);
  const from = remoteJid ? normalizeNumber(remoteJid.split("@")[0] ?? "") : null;
  return {
    from: from || null,
    text,
    fromMe: Boolean(key.fromMe ?? body.fromMe),
  };
}
