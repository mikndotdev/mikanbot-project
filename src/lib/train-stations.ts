import trainStations from "@/train_stations.json";
import { getLine } from "@/lib/train-lines";

interface StationFile {
  source: string;
  generated: string;
  line_count: number;
  station_count: number;
  stations: Record<string, string[]>;
}

const data = trainStations as unknown as StationFile;

export const stationToLines = new Map<string, string[]>(
  Object.entries(data.stations).map(([station, codes]) => [station.normalize("NFC"), codes]),
);

const searchable = [...stationToLines.keys()].map((station) => ({
  station,
  lower: station.toLowerCase(),
}));

export interface StationChoice {
  name: string;
  value: string;
}

export function linesForStation(station: string): string[] {
  return stationToLines.get(station.normalize("NFC")) ?? [];
}

export function isKnownStation(station: string | null | undefined): station is string {
  return typeof station === "string" && stationToLines.has(station.normalize("NFC"));
}

export function searchStations(query: string, limit = 25): StationChoice[] {
  const trimmed = query.trim().toLowerCase();
  const starts: StationChoice[] = [];
  const contains: StationChoice[] = [];

  for (const { station, lower } of searchable) {
    if (trimmed && !lower.includes(trimmed)) continue;
    const lines = stationToLines.get(station) ?? [];
    const choice = {
      name: `${station}（${lines.length === 1 ? (getLine(lines[0]!)?.lineNames[0] ?? lines[0]) : `${lines.length}路線`}）`,
      value: station,
    };
    if (!trimmed || lower.startsWith(trimmed)) starts.push(choice);
    else contains.push(choice);
    if (starts.length >= limit && contains.length >= limit) break;
  }

  return [...starts, ...contains].slice(0, limit);
}

export function searchStationsOnLine(
  rosenCode: string,
  query: string,
  limit = 25,
): StationChoice[] {
  const trimmed = query.trim().toLowerCase();
  const out: StationChoice[] = [];
  for (const [station, codes] of stationToLines) {
    if (!codes.includes(rosenCode)) continue;
    if (trimmed && !station.toLowerCase().includes(trimmed)) continue;
    out.push({ name: station, value: station });
    if (out.length >= limit) break;
  }
  return out;
}
