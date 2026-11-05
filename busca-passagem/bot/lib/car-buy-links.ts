import type { CarBuyLinks, CarCategory } from "./types.js";

function padTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "10:00";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function timeHour(t: string): string {
  return padTime(t).slice(0, 2);
}

function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function yymmdd(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${y?.slice(2) ?? ""}${m ?? ""}${d ?? ""}`;
}

/** Kayak city slug for common BR airport pickups. */
function kayakCitySlug(iata: string): string {
  switch (iata.toUpperCase()) {
    case "REC":
      return "Recife,Brasil-c15630";
    case "MCZ":
      return "Maceio,Brasil-c31221";
    case "AJU":
      return "Aracaju,Brasil-c42895";
    case "GRU":
    case "CGH":
    case "SAO":
      return "Sao-Paulo,Brasil-c29856";
    default:
      return `${iata.toUpperCase()}`;
  }
}

type AirportMeta = {
  placeName: string;
  expediaLocn: string;
  rentcarsPath: string | null;
  discoverPath: string;
  skyscannerSlug: string;
  /** Localiza agency code (e.g. AAREC) for reservation deep links. */
  localizaAgencyCode: string | null;
  focoPath: string;
};

function airportMeta(iata: string): AirportMeta {
  switch (iata.toUpperCase()) {
    case "REC":
      return {
        placeName: "Aeroporto de Recife",
        expediaLocn: "Recife, Brazil (REC-Guararapes Intl.)",
        rentcarsPath:
          "aeroportos/brasil/rec-guararapes-gilberto-freyre-recife-pernambuco",
        discoverPath: "brazil/recife",
        skyscannerSlug: "recife/recife",
        localizaAgencyCode: "AAREC",
        focoPath: "rede-de-lojas",
      };
    case "AJU":
      return {
        placeName: "Aeroporto de Aracaju",
        expediaLocn: "Aracaju, Brazil (AJU-Santa Maria)",
        rentcarsPath: "aeroportos/brasil/aju-santa-maria-aracaju-sergipe",
        discoverPath: "brazil/aracaju",
        skyscannerSlug: "aracaju/aracaju",
        localizaAgencyCode: "AAAJU",
        focoPath: "",
      };
    case "MCZ":
      return {
        placeName: "Aeroporto de Maceió",
        expediaLocn: "Maceio, Brazil (MCZ-Zumbi dos Palmares)",
        rentcarsPath: "aeroportos/brasil/mcz-zumbi-dos-palmares-maceio-alagoas",
        discoverPath: "brazil/maceio",
        skyscannerSlug: "maceio/maceio",
        localizaAgencyCode: "AAMCZ",
        focoPath: "rede-de-lojas/aluguel-carro-aeroporto-maceio-mcz",
      };
    default:
      return {
        placeName: iata.toUpperCase(),
        expediaLocn: iata.toUpperCase(),
        rentcarsPath: null,
        discoverPath: "brazil",
        skyscannerSlug: "",
        localizaAgencyCode: null,
        focoPath: "",
      };
  }
}

/** Localiza SPA expects DD-MM-YYYY HH:mm:ss in query params. */
function localizaDateTime(isoDate: string, hhmm: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y} ${padTime(hhmm)}:00`;
}

/**
 * Deep link into Localiza booking form with airport + dates prefilled.
 * Agency codes from Localiza API (AAREC, AAAJU, AAMCZ…).
 */
export function buildLocalizaSearchUrl(input: {
  agencyCode: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime: string;
  dropoffTime: string;
}): string {
  const params = new URLSearchParams({
    pickUpLocation: input.agencyCode,
    pickUpDateTime: localizaDateTime(input.pickupDate, input.pickupTime),
    dropOffLocation: input.agencyCode,
    dropOffDateTime: localizaDateTime(input.dropoffDate, input.dropoffTime),
  });
  return `https://www.localiza.com/brasil/pt-br?${params.toString()}`;
}

function categoryHint(category: CarCategory): string {
  switch (category) {
    case "economy":
      return "econômico";
    case "compact":
      return "compacto";
    case "intermediate":
      return "intermediário";
    case "suv":
      return "SUV";
    default:
      return "qualquer categoria";
  }
}

/**
 * Deep links for Recife (and other BR airport) car rentals on fixed dates.
 * Comparators first, then major BR fleets.
 */
export function buildCarBuyLinks(input: {
  pickupIata: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime?: string;
  dropoffTime?: string;
  category?: CarCategory;
  driverAge?: number;
}): CarBuyLinks {
  const iata = input.pickupIata.toUpperCase();
  const meta = airportMeta(iata);
  const pickupTime = padTime(input.pickupTime ?? "14:00");
  const dropoffTime = padTime(input.dropoffTime ?? "12:00");
  const pickupHour = timeHour(pickupTime);
  const dropoffHour = timeHour(dropoffTime);
  const age = Math.max(18, Math.min(99, input.driverAge ?? 25));
  const category = input.category ?? "economy";
  const city = kayakCitySlug(iata);

  const kayak = `https://www.kayak.com.br/cars/${city}/${input.pickupDate}-${pickupHour}h/${input.dropoffDate}-${dropoffHour}h?sort=price_a`;

  const rentcarsParams = new URLSearchParams({
    pickupLocation: meta.placeName,
    pickupDate: input.pickupDate,
    returnDate: input.dropoffDate,
    pickupTime,
    returnTime: dropoffTime,
  });
  const rentcars = meta.rentcarsPath
    ? `https://www.rentcars.com/pt-br/${meta.rentcarsPath}?${rentcarsParams.toString()}`
    : `https://www.rentcars.com/pt-br/?${rentcarsParams.toString()}`;

  const booking = `https://www.booking.com/cars/airport/br/${iata.toLowerCase()}.pt-br.html`;

  const expedia = `https://www.expedia.com.br/Cars-Search?${new URLSearchParams(
    {
      date1: input.pickupDate,
      date2: input.dropoffDate,
      locn: meta.expediaLocn,
      time1: `${pickupHour}00AM`,
      time2: `${dropoffHour}00AM`,
    },
  ).toString()}`;

  const discoverCars = `https://www.discovercars.com/br/${meta.discoverPath}?date_from=${input.pickupDate}&date_to=${input.dropoffDate}`;

  const skyPick = yymmdd(input.pickupDate);
  const skyDrop = yymmdd(input.dropoffDate);
  const skyscanner = meta.skyscannerSlug
    ? `https://www.skyscanner.com.br/aluguel-de-carros/${meta.skyscannerSlug}/${skyPick}/${skyDrop}/?pickuptime=${pickupTime}&dropofftime=${dropoffTime}&driversage=${age}`
    : `https://www.skyscanner.com.br/aluguel-de-carros/?pickupplace=${iata}&pickupdate=${skyPick}&dropoffdate=${skyDrop}`;

  const localiza = meta.localizaAgencyCode
    ? buildLocalizaSearchUrl({
        agencyCode: meta.localizaAgencyCode,
        pickupDate: input.pickupDate,
        dropoffDate: input.dropoffDate,
        pickupTime,
        dropoffTime,
      })
    : "https://www.localiza.com/brasil/pt-br";

  const movidaStore =
    iata === "REC"
      ? "https://www.movida.com.br/loja/recife-aeroporto"
      : iata === "MCZ"
        ? "https://www.movida.com.br/loja/maceio-aeroporto"
        : "https://www.movida.com.br/";
  const movidaQ = new URLSearchParams({
    localRetirada: meta.placeName,
    dataRetirada: ddmmyyyy(input.pickupDate),
    dataDevolucao: ddmmyyyy(input.dropoffDate),
    horaRetirada: pickupTime,
    horaDevolucao: dropoffTime,
  });
  // Store page + query hints (SPA); query helps when homepage form picks them up.
  const movida = `${movidaStore}?${movidaQ.toString()}`;

  const unidas = "https://www.unidas.com.br/";
  const foco = meta.focoPath
    ? meta.focoPath.startsWith("rede-de-lojas")
      ? `https://www.aluguefoco.com.br/${meta.focoPath}`
      : `https://www.focoalugueldecarros.com.br/${meta.focoPath}`
    : "https://www.aluguefoco.com.br/rede-de-lojas";

  // Prefer economy/compact sorts on Kayak when asked; SUV for T-Cross class.
  const kayakWithClass =
    category === "economy" || category === "compact"
      ? `${kayak}&fs=carclass=small`
      : category === "suv"
        ? `${kayak}&fs=carclass=suv`
        : kayak;

  return {
    kayak: kayakWithClass,
    rentcars,
    booking,
    expedia,
    discoverCars,
    skyscanner,
    localiza,
    movida,
    unidas,
    foco,
  };
}

export function formatCarLinksMessage(
  links: CarBuyLinks,
  category?: CarCategory,
): string {
  const hint = category ? ` (${categoryHint(category)})` : "";
  return [
    `Reservar nas locadoras${hint} (melhor caminho pro T-Cross/SUV):`,
    `Localiza (datas preenchidas): ${links.localiza}`,
    `Movida (loja aeroporto): ${links.movida}`,
    `Foco: ${links.foco}`,
    `Unidas: ${links.unidas}`,
    "",
    `Comparar preço${hint}:`,
    `Kayak SUV: ${links.kayak}`,
    `Rentcars: ${links.rentcars}`,
    `Skyscanner: ${links.skyscanner}`,
    `Booking Cars: ${links.booking}`,
  ].join("\n");
}

export function rentalDayCount(pickupDate: string, dropoffDate: string): number {
  const a = Date.parse(`${pickupDate.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${dropoffDate.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}
