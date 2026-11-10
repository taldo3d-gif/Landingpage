/**
 * One-shot WhatsApp car digest (no agent host required).
 * Usage: node scripts/send-car-digest-now.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i);
  let v = t.slice(i + 1);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const { buildCarBuyLinks } = await import("../bot/lib/car-buy-links.ts");
const { sendWhatsAppText, defaultWhatsAppTo } = await import(
  "../bot/lib/evolution.ts"
);

const trip = {
  pickupDate: "2026-12-23",
  dropoffDate: "2027-01-01",
  pickupTime: "14:00",
  dropoffTime: "12:00",
};

const watches = [
  { iata: "REC", category: "suv", model: "T-Cross", perDay: 170 },
  { iata: "MCZ", category: "suv", model: "T-Cross", perDay: 170 },
  { iata: "REC", category: "compact", model: "Polo / HB20 Hatch", perDay: 120 },
  { iata: "MCZ", category: "compact", model: "Polo / HB20 Hatch", perDay: 120 },
];

const lines = [
  "🚗 Atualização aluguel (manual agora — daqui pra frente a cada 2h)",
  `Datas: ${trip.pickupDate} 14:00 → ${trip.dropoffDate} 12:00 · REC + MCZ`,
  "Teto: T-Cross ≤R$170/dia · Polo/HB20 ≤R$120/dia",
  "Se surgir oferta abaixo do teto, aviso na hora.",
  "",
];

for (const w of watches) {
  const links = buildCarBuyLinks({
    pickupIata: w.iata,
    pickupDate: trip.pickupDate,
    dropoffDate: trip.dropoffDate,
    pickupTime: trip.pickupTime,
    dropoffTime: trip.dropoffTime,
    category: w.category,
  });
  lines.push(`• ${w.iata} ${w.model} · teto R$${w.perDay}/dia`);
  lines.push(`  Kayak: ${links.kayak}`);
}

lines.push(
  "",
  "Abra Kayak/Momondo primeiro. Mande o valor que você viu pra eu gravar o alerta.",
);

const to = defaultWhatsAppTo();
if (!to) {
  console.error("WHATSAPP_TO missing");
  process.exit(1);
}
const text = lines.join("\n");
const res = await sendWhatsAppText({ to, text });
console.log(JSON.stringify({ to, ...res, chars: text.length }, null, 2));
if (!res.ok) process.exit(1);
