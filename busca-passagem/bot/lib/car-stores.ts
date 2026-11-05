/**
 * Airport car-rental store directory for the watches we care about.
 * Prefer airport counters / 24h when available. Verified via Localiza API +
 * public fleet pages (Movida / Foco / Aena / Unidas).
 */

export type CarStore = {
  brand: "Localiza" | "Movida" | "Unidas" | "Foco";
  name: string;
  address: string;
  hours: string;
  note: string | null;
  /** Landing / store page when known. */
  url: string;
};

export type AirportStores = {
  iata: string;
  city: string;
  airportName: string;
  stores: CarStore[];
  tips: string[];
};

export function airportStores(iata: string): AirportStores | null {
  switch (iata.toUpperCase()) {
    case "REC":
      return {
        iata: "REC",
        city: "Recife",
        airportName: "Aeroporto Internacional do Recife (Guararapes)",
        stores: [
          {
            brand: "Localiza",
            name: "Aeroporto de Recife (AAREC)",
            address:
              "Av. Marechal Mascarenhas de Morais, 5653 — Imbiribeira (fora do terminal)",
            hours: "24h",
            note: "Retirada em unidade externa ao terminal — prever transfer/deslocamento.",
            url: "https://www.localiza.com/brasil/pt-br/rede-de-agencias/aeroporto-de-recife",
          },
          {
            brand: "Movida",
            name: "Recife Aeroporto",
            address:
              "Av. Marechal Mascarenhas de Morais, 5875 — Imbiribeira; box no desembarque sul",
            hours: "24h",
            note: null,
            url: "https://www.movida.com.br/loja/recife-aeroporto",
          },
          {
            brand: "Unidas",
            name: "Aeroporto de Recife",
            address:
              "Praça Ministro Salgado Filho, s/n — Imbiribeira; box desembarque sul (doméstico)",
            hours: "24h",
            note: null,
            url: "https://www.unidas.com.br/",
          },
          {
            brand: "Foco",
            name: "Recife Aeroporto",
            address:
              "Av. Marechal Mascarenhas de Morais, 6133 — Imbiribeira; transfer grátis aeroporto↔loja",
            hours: "24h",
            note: "Costuma ser competitiva no preço; confirme grupo SUV/T-Cross.",
            url: "https://www.aluguefoco.com.br/rede-de-lojas",
          },
        ],
        tips: [
          "Em REC várias lojas ficam na Av. Mascarenhas (fora do saguão) — confira o ponto na reserva.",
          "Para T-Cross / SUV compacto: na Localiza procure grupos SUV (ex.: GX); reserva é por grupo, não modelo fixo.",
        ],
      };
    case "MCZ":
      return {
        iata: "MCZ",
        city: "Maceió",
        airportName: "Aeroporto Zumbi dos Palmares (MCZ)",
        stores: [
          {
            brand: "Localiza",
            name: "Aeroporto de Maceió (AAMCZ)",
            address: "Hall do aeroporto Zumbi dos Palmares, s/n — térreo",
            hours: "24h (confirmar na reserva)",
            note: "Localiza cita grupo GX com T-Cross / Creta conforme disponibilidade.",
            url: "https://www.localiza.com/brasil/pt-br/rede-de-agencias/aeroporto-de-maceio",
          },
          {
            brand: "Movida",
            name: "Maceió Aeroporto",
            address: "Rodovia BR-104, Km 91 — Tabuleiro do Pinto (aeroporto)",
            hours: "24h",
            note: null,
            url: "https://www.movida.com.br/loja/maceio-aeroporto",
          },
          {
            brand: "Unidas",
            name: "Aeroporto de Maceió",
            address: "Térreo do terminal (Aena)",
            hours: "conforme voos / loja",
            note: "Telefone Aena lista (82) 3036-5344.",
            url: "https://www.unidas.com.br/",
          },
          {
            brand: "Foco",
            name: "Maceió Aeroporto (MCZ)",
            address:
              "Chácara São Bento, lote 04, Quadra B — transfer após portão A3 (área externa à direita)",
            hours: "24h",
            note: "Transfer sinalizado da Foco do desembarque até a loja.",
            url: "https://www.aluguefoco.com.br/rede-de-lojas/aluguel-carro-aeroporto-maceio-mcz",
          },
        ],
        tips: [
          "Em MCZ, Localiza/Movida/Unidas ficam no térreo do terminal; Foco usa transfer externo.",
          "Roteiro litoral (Maragogi / norte): SUV ajuda com bagagem e estrada — bate com o alvo T-Cross.",
        ],
      };
    default:
      return null;
  }
}

export function formatAirportStoresMarkdown(iata: string): string {
  const info = airportStores(iata);
  if (!info) return `Lojas: sem diretório local para ${iata}.`;
  const lines = [
    `Lojas no ${info.airportName}:`,
    ...info.stores.map(
      (s) =>
        `• ${s.brand} — ${s.name}\n  ${s.address}\n  ${s.hours}` +
        (s.note ? `\n  ${s.note}` : "") +
        `\n  ${s.url}`,
    ),
    ...info.tips.map((t) => `• ${t}`),
  ];
  return lines.join("\n");
}
