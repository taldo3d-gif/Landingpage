import type { BuyLinks } from "./types.js";

function yymmdd(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${y?.slice(2) ?? ""}${m ?? ""}${d ?? ""}`;
}

function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Google Flights — query + #flt= hash.
 */
function googleFlightsResultsUrl(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
}): string {
  const o = input.origin.toUpperCase();
  const d = input.destination.toUpperCase();
  const adults = Math.max(1, Math.min(9, input.adults));
  const flt = input.returnDate
    ? `${o}.${d}.${input.departDate}*${d}.${o}.${input.returnDate};c:BRL;e:1;sd:1;t:f`
    : `${o}.${d}.${input.departDate};c:BRL;e:1;sd:1;t:f`;
  const q = input.returnDate
    ? `Voos de ${o} para ${d} em ${input.departDate} voltando ${input.returnDate} ${adults} adultos`
    : `Voos de ${o} para ${d} em ${input.departDate} só ida ${adults} adultos`;
  return `https://www.google.com/travel/flights?hl=pt-BR&gl=br&curr=BRL&q=${encodeURIComponent(q)}#flt=${flt}`;
}

/**
 * Cash-only BR comparison + airline sites for the same route/dates.
 * Metasearch first, OTAs BR next, then cias for checkout.
 */
export function buildBuyLinks(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  directOnly?: boolean;
  maxLayoverMinutes?: number;
}): BuyLinks {
  const o = input.origin.toUpperCase();
  const d = input.destination.toUpperCase();
  const adults = Math.max(1, Math.min(9, input.adults));
  const ret = input.returnDate ?? null;
  const directOnly = input.directOnly ?? false;
  const maxLayover = Math.max(0, input.maxLayoverMinutes ?? 180);

  const googleFlights = googleFlightsResultsUrl({
    origin: o,
    destination: d,
    departDate: input.departDate,
    returnDate: ret,
    adults,
  });

  const kayakAdults = adults === 1 ? "" : `/${adults}adults`;
  const kayakPath = ret
    ? `${o}-${d}/${input.departDate}/${ret}${kayakAdults}`
    : `${o}-${d}/${input.departDate}${kayakAdults}`;
  const kayakFs = directOnly
    ? "stops=0"
    : `stops=-2;layoverdur=0,${maxLayover}`;
  const kayak = `https://www.kayak.com.br/flights/${kayakPath}?sort=price_a&fs=${encodeURIComponent(kayakFs)}`;

  const momondoPath = ret
    ? `${o}-${d}/${input.departDate}/${ret}`
    : `${o}-${d}/${input.departDate}`;
  const momondo = `https://www.momondo.com.br/flight-search/${momondoPath}?sort=price_a&fs=${encodeURIComponent(kayakFs)}&adults=${adults}`;

  const skyOut = yymmdd(input.departDate);
  const skyRet = ret ? yymmdd(ret) : "";
  const preferDirects = directOnly ? "true" : "false";
  const skyscanner = ret
    ? `https://www.skyscanner.com.br/transporte/voos/${o.toLowerCase()}/${d.toLowerCase()}/${skyOut}/${skyRet}/?adults=${adults}&adultsv2=${adults}&cabinclass=economy&rtn=1&preferdirects=${preferDirects}&outboundaltsenabled=false&inboundaltsenabled=false`
    : `https://www.skyscanner.com.br/transporte/voos/${o.toLowerCase()}/${d.toLowerCase()}/${skyOut}/?adults=${adults}&adultsv2=${adults}&cabinclass=economy&rtn=0&preferdirects=${preferDirects}&outboundaltsenabled=false&inboundaltsenabled=false`;

  const expedia = ret
    ? `https://www.expedia.com.br/Flights-Search?trip=roundtrip&leg1=from:${o},to:${d},departure:${input.departDate}TANYT&leg2=from:${d},to:${o},departure:${ret}TANYT&passengers=adults:${adults},children:0,infantinlap:N&mode=search&options=cabinclass:economy`
    : `https://www.expedia.com.br/Flights-Search?trip=oneway&leg1=from:${o},to:${d},departure:${input.departDate}TANYT&passengers=adults:${adults},children:0,infantinlap:N&mode=search&options=cabinclass:economy`;

  const voopterParams = new URLSearchParams({
    origem: o,
    destino: d,
    ida: input.departDate,
    adultos: String(adults),
  });
  if (ret) voopterParams.set("volta", ret);
  const voopter = `https://voopter.com.br/?${voopterParams.toString()}`;

  // Viajanet — mesmo padrão Despegar / Decolar (OTA BR)
  const viajanet = ret
    ? `https://www.viajanet.com.br/shop/flights/results/roundtrip/${o}/${d}/${input.departDate}/${ret}/${adults}/0/0/NA/NA/NA/NA/NA?from=SB&di=${adults}-0&reSearch=true`
    : `https://www.viajanet.com.br/shop/flights/results/oneway/${o}/${d}/${input.departDate}/${adults}/0/0/NA/NA/NA/NA?from=SB&di=${adults}-0&reSearch=true`;

  // CVC — landing de passagens com query (motor SPA; params ajudam o formulário)
  const cvcParams = new URLSearchParams({
    origem: o,
    destino: d,
    dataIda: ddmmyyyy(input.departDate),
    adultos: String(adults),
    criancas: "0",
    bebes: "0",
  });
  if (ret) cvcParams.set("dataVolta", ddmmyyyy(ret));
  const cvc = `https://www.cvc.com.br/passagens-aereas?${cvcParams.toString()}`;

  // eDestinos — OTA BR (Traveltech / eDreams group)
  const edestinos = ret
    ? `https://www.edestinos.com.br/voos/${o}/${d}/${input.departDate}/${ret}/${adults}adults?currency=BRL`
    : `https://www.edestinos.com.br/voos/${o}/${d}/${input.departDate}/${adults}adults?currency=BRL`;

  // Booking.com Flights (pt-BR / BRL)
  const bookingBase = "https://www.booking.com/flights/index.html";
  const bookingParams = new URLSearchParams({
    type: ret ? "ROUNDTRIP" : "ONEWAY",
    adults: String(adults),
    cabinClass: "ECONOMY",
    from: o,
    to: d,
    depart: input.departDate,
    locale: "pt-br",
    "selected_currency": "BRL",
  });
  if (ret) bookingParams.set("return", ret);
  const booking = `${bookingBase}?${bookingParams.toString()}`;

  const latam = ret
    ? `https://www.latamairlines.com/br/pt/oferta-voos?origin=${o}&destination=${d}&outbound=${input.departDate}&inbound=${ret}&adt=${adults}&chd=0&inf=0&trip=RT&cabin=Y&redemption=false&sort=PRICE,asc`
    : `https://www.latamairlines.com/br/pt/oferta-voos?origin=${o}&destination=${d}&outbound=${input.departDate}&adt=${adults}&chd=0&inf=0&trip=OW&cabin=Y&redemption=false&sort=PRICE,asc`;

  const azul = ret
    ? `https://www.voeazul.com.br/br/pt/home/passagens-aereas?origin=${o}&destination=${d}&departure=${ddmmyyyy(input.departDate)}&return=${ddmmyyyy(ret)}&adults=${adults}&children=0&infants=0`
    : `https://www.voeazul.com.br/br/pt/home/passagens-aereas?origin=${o}&destination=${d}&departure=${ddmmyyyy(input.departDate)}&adults=${adults}&children=0&infants=0`;

  const gol = ret
    ? `https://b2c.voegol.com.br/compra?origem1=${o}&destino1=${d}&dt_partida1=${input.departDate}&origem2=${d}&destino2=${o}&dt_partida2=${ret}&numADT=${adults}&numCHD=0&numINF=0&tipo_voo=I`
    : `https://b2c.voegol.com.br/compra?origem1=${o}&destino1=${d}&dt_partida1=${input.departDate}&numADT=${adults}&numCHD=0&numINF=0&tipo_voo=S`;

  const decolar = ret
    ? `https://www.decolar.com/shop/flights/results/roundtrip/${o}/${d}/${input.departDate}/${ret}/${adults}/0/0/NA/NA/NA/NA/NA?from=SB&di=${adults}-0&reSearch=true`
    : `https://www.decolar.com/shop/flights/results/oneway/${o}/${d}/${input.departDate}/${adults}/0/0/NA/NA/NA/NA?from=SB&di=${adults}-0&reSearch=true`;

  return {
    kayak,
    skyscanner,
    googleFlights,
    momondo,
    expedia,
    voopter,
    viajanet,
    cvc,
    edestinos,
    booking,
    azul,
    latam,
    gol,
    decolar,
  };
}

/** WhatsApp / chat — comparadores + OTAs BR + cias. Só reais. */
export function formatLinksMessage(links: BuyLinks): string {
  return [
    "Comparar (reais):",
    `Kayak: ${links.kayak}`,
    `Skyscanner: ${links.skyscanner}`,
    `Google Flights: ${links.googleFlights}`,
    `Momondo: ${links.momondo}`,
    `Expedia: ${links.expedia}`,
    `Voopter: ${links.voopter}`,
    `Booking: ${links.booking}`,
    "",
    "OTAs Brasil:",
    `Viajanet: ${links.viajanet}`,
    `CVC: ${links.cvc}`,
    `eDestinos: ${links.edestinos}`,
    `Decolar: ${links.decolar}`,
    "",
    "Comprar na cia (recomendado):",
    `LATAM: ${links.latam}`,
    `Azul: ${links.azul}`,
    `GOL: ${links.gol}`,
  ].join("\n");
}

/** Linha curta por cotação no chat (Kayak + 1 OTA + cia). */
export function formatQuoteLinkLine(links: BuyLinks): string {
  return (
    `   Kayak: ${links.kayak}\n` +
    `   Viajanet: ${links.viajanet}\n` +
    `   LATAM: ${links.latam}`
  );
}
