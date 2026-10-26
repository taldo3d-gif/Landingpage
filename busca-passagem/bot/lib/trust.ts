/**
 * Where we send the user to buy. Travelpayouts/Aviasales is used only for
 * price discovery — affiliate deep links often land on unknown OTAs (incl. Kiwi).
 */

export const TRUSTED_BUY_SITES = [
  {
    id: "google_flights",
    name: "Google Flights",
    trust: "alta",
    note: "Metabusca do Google; você escolhe a companhia/OTA na hora. Bom pra comparar.",
  },
  {
    id: "decolar",
    name: "Decolar",
    trust: "alta",
    note: "OTA grande no Brasil (Despegar). Reclamações existem como em qualquer OTA; é conhecida e regulada no BR.",
  },
  {
    id: "kayak",
    name: "Kayak",
    trust: "alta",
    note: "Metabusca (Booking Holdings). Redireciona para companhia ou OTA parceira.",
  },
  {
    id: "skyscanner",
    name: "Skyscanner",
    trust: "alta",
    note: "Metabusca. Prefira finalizar no site da companhia quando o Skyscanner oferecer.",
  },
] as const;

/** Hosts / brands we never recommend as payment destination. */
export const BLOCKED_BUY_HOST_FRAGMENTS = [
  "kiwi.com",
  "kiwifl",
  "kiwifi",
  "anon.travel",
  "tickets.ua",
  "aviasales.", // price source only — not checkout
  "emrldtp.com",
] as const;

export function isBlockedBuyUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.toLowerCase();
  return BLOCKED_BUY_HOST_FRAGMENTS.some((frag) => u.includes(frag));
}

export function trustSummaryPt(): string {
  return [
    "Links de compra permitidos: Google Flights, Decolar, Kayak, Skyscanner.",
    "Não use Kiwi/Kiwifi nem checkout de agência desconhecida via Aviasales.",
    "Preço pode vir do cache Travelpayouts; a compra deve ser só nos sites confiáveis acima.",
  ].join(" ");
}
