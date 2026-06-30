import Papa from "papaparse";
import airlinesCsv from "@/airlines.csv" with { type: "text" };

interface AirlineRow {
  IATA?: string;
  ICAO?: string;
  Active?: string;
}

const PLACEHOLDERS = new Set(["", "-", "N/A", "\\N"]);

const isValidIata = (value: string) => /^[A-Z0-9]{2}$/.test(value) && !PLACEHOLDERS.has(value);
const isValidIcao = (value: string) => /^[A-Z]{3}$/.test(value) && !PLACEHOLDERS.has(value);

const iataToIcao = new Map<string, string>();
const icaoSet = new Set<string>();
const activeIata = new Set<string>();

const parsed = Papa.parse<AirlineRow>(airlinesCsv, {
  header: true,
  skipEmptyLines: true,
});

for (const row of parsed.data) {
  const iata = (row.IATA ?? "").trim().toUpperCase();
  const icao = (row.ICAO ?? "").trim().toUpperCase();

  if (isValidIcao(icao)) icaoSet.add(icao);

  if (isValidIata(iata) && isValidIcao(icao)) {
    const active = (row.Active ?? "").trim().toUpperCase() === "Y";
    if (!iataToIcao.has(iata) || (active && !activeIata.has(iata))) {
      iataToIcao.set(iata, icao);
      if (active) activeIata.add(iata);
    }
  }
}

export type CallsignResult = { callsign: string } | { error: string };

export function resolveCallsign(input: string): CallsignResult {
  const normalized = input.toUpperCase().replace(/[\s-]/g, "");
  if (!normalized) {
    return { error: "Please provide a flight number, e.g. `AF188` or `AFR188`." };
  }

  const threeLetter = normalized.slice(0, 3);
  if (icaoSet.has(threeLetter)) {
    const number = normalized.slice(3);
    if (!number) return { error: "Missing the flight number after the airline code." };
    return { callsign: threeLetter + number };
  }

  const twoLetter = normalized.slice(0, 2);
  const mappedIcao = iataToIcao.get(twoLetter);
  if (mappedIcao) {
    const number = normalized.slice(2);
    if (!number) return { error: "Missing the flight number after the airline code." };
    return { callsign: mappedIcao + number };
  }

  return {
    error: `Unknown airline code in \`${input}\`. Use an IATA (2-letter) or ICAO (3-letter) code, e.g. \`AF188\` or \`AFR188\`.`,
  };
}
