import Papa from "papaparse";
import aircraftCsv from "@/aircraft.csv" with { type: "text" };

interface AircraftRow {
  "Aircraft TypeDesignator"?: string;
  "MANUFACTURER, Model"?: string;
}

const typeToName = new Map<string, string>();

const parsed = Papa.parse<AircraftRow>(aircraftCsv, {
  header: true,
  skipEmptyLines: true,
});

for (const row of parsed.data) {
  const code = (row["Aircraft TypeDesignator"] ?? "").trim().toUpperCase();
  const raw = (row["MANUFACTURER, Model"] ?? "").trim();
  if (code && raw && !typeToName.has(code)) {
    typeToName.set(code, raw);
  }
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAircraftName(raw: string): string {
  const comma = raw.indexOf(",");
  const manufacturer = comma >= 0 ? raw.slice(0, comma).trim() : "";
  const model = (comma >= 0 ? raw.slice(comma + 1) : raw)
    .trim()
    .replace(/^([A-Za-z])-(\d)/, "$1$2");
  return `${manufacturer ? titleCase(manufacturer) : ""} ${model}`.trim();
}

export function resolveAircraftName(code: string | null | undefined): string | null {
  if (!code) return null;
  const raw = typeToName.get(code.trim().toUpperCase());
  return raw ? formatAircraftName(raw) : null;
}
