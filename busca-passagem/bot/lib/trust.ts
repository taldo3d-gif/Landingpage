/**
 * Where we send the user to buy (cash / BRL only).
 * Travelpayouts is price discovery only — never checkout.
 * Sem milhas / MaxMilhas / 123milhas.
 */

export const TRUSTED_BUY_SITES = [
  {
    id: "kayak",
    name: "Kayak",
    trust: "alta",
    note: "Metabusca (Booking Holdings).",
  },
  {
    id: "skyscanner",
    name: "Skyscanner",
    trust: "alta",
    note: "Metabusca. Prefira finalizar na cia.",
  },
  {
    id: "google_flights",
    name: "Google Flights",
    trust: "alta",
    note: "Metabusca Google; você escolhe cia/OTA.",
  },
  {
    id: "momondo",
    name: "Momondo",
    trust: "alta",
    note: "Metabusca (mesmo ecossistema Booking).",
  },
  {
    id: "expedia",
    name: "Expedia",
    trust: "alta",
    note: "OTA grande; confira taxa/bagagem no checkout.",
  },
  {
    id: "voopter",
    name: "Voopter",
    trust: "media-alta",
    note: "Comparador BR; redireciona para cia/OTA.",
  },
  {
    id: "booking",
    name: "Booking Flights",
    trust: "alta",
    note: "Metabusca Booking.com (voos).",
  },
  {
    id: "viajanet",
    name: "Viajanet",
    trust: "alta",
    note: "OTA BR (grupo Despegar).",
  },
  {
    id: "cvc",
    name: "CVC",
    trust: "alta",
    note: "Agência BR grande; parcelamento comum.",
  },
  {
    id: "edestinos",
    name: "eDestinos",
    trust: "media-alta",
    note: "OTA BR; confira taxa no checkout.",
  },
  {
    id: "decolar",
    name: "Decolar",
    trust: "alta",
    note: "OTA BR conhecida; deep link às vezes quebra.",
  },
  {
    id: "latam",
    name: "LATAM",
    trust: "alta",
    note: "Companhia — melhor pra pagar.",
  },
  {
    id: "azul",
    name: "Azul",
    trust: "alta",
    note: "Companhia — melhor pra pagar.",
  },
  {
    id: "gol",
    name: "GOL",
    trust: "alta",
    note: "Companhia — melhor pra pagar.",
  },
] as const;

/** Hosts / brands we never recommend as payment destination. */
export const BLOCKED_BUY_HOST_FRAGMENTS = [
  "kiwi.com",
  "kiwifl",
  "kiwifi",
  "anon.travel",
  "tickets.ua",
  "aviasales.",
  "emrldtp.com",
  "123milhas", // histórico de crise / risco ao consumidor
  "maxmilhas", // foco milhas — fora do escopo (só reais)
] as const;

export function isBlockedBuyUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.toLowerCase();
  return BLOCKED_BUY_HOST_FRAGMENTS.some((frag) => u.includes(frag));
}

export function trustSummaryPt(): string {
  return [
    "Comparar: Kayak, Skyscanner, Google Flights, Momondo, Expedia, Voopter, Booking.",
    "OTAs BR: Viajanet, CVC, eDestinos, Decolar.",
    "Pagar de preferência na LATAM, Azul ou GOL.",
    "Só reais — sem milhas. Evite Kiwi, 123milhas e MaxMilhas.",
  ].join(" ");
}
