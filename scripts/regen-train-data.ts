const UA = "MikanBot/1.0 (+https://github.com/maamokun/mikanbot-project)";
const API = "https://www.elesite-next.com/fastapi";
const IMG = "https://img.elesite-next.com";
const GAP_MS = 250;
const COOLDOWN_MS = 30_000;
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 90_000];

const ICONS_OUT = "src/train_icons.json";
const STATIONS_OUT = "src/train_stations.json";

interface CatalogueEntry {
  rosen_name: string;
  rosen_code: string;
}
interface HenseiEntry {
  formation?: string;
  sharyo?: string;
  icon_path?: string;
  is_display?: boolean;
}
interface LineSystem {
  line_names: string[];
  operators: string[];
  regions: string[];
  icons: Record<string, string>;
}

function byCodePoint(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i++) {
    const diff = left[i]!.codePointAt(0)! - right[i]!.codePointAt(0)!;
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

const UNRESERVED = /[A-Za-z0-9\-_.~:/?&=%]/;

function encodePath(value: string): string {
  let out = "";
  for (const char of value) {
    if (UNRESERVED.test(char) && char.length === 1) {
      out += char;
      continue;
    }
    for (const byte of new TextEncoder().encode(char)) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API}/${path}?${query}` : `${API}/${path}`;
  let last: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (error) {
      last = error;
      const wait = BACKOFF_MS[attempt];
      if (wait === undefined) break;
      console.log(`  retrying ${path} ${JSON.stringify(params)} in ${wait / 1000}s (${error})`);
      await Bun.sleep(wait);
    }
  }
  throw new Error(`${path} ${JSON.stringify(params)}: ${last}`);
}

async function fetchCatalogue(): Promise<{ lines: Map<string, LineSystem>; order: string[] }> {
  const raw = await get<Record<string, Record<string, Record<string, CatalogueEntry[]>>>>(
    "get_rosenselect_list",
    {},
  );
  const lines = new Map<string, LineSystem>();
  const order: string[] = [];

  for (const [region, groups] of Object.entries(raw)) {
    for (const operators of Object.values(groups)) {
      for (const [operator, entries] of Object.entries(operators)) {
        for (const entry of entries) {
          const code = entry.rosen_code;
          let system = lines.get(code);
          if (!system) {
            system = { line_names: [], operators: [], regions: [], icons: {} };
            lines.set(code, system);
            order.push(code);
          }
          if (!system.line_names.includes(entry.rosen_name))
            system.line_names.push(entry.rosen_name);
          if (!system.operators.includes(operator)) system.operators.push(operator);
          if (!system.regions.includes(region)) system.regions.push(region);
        }
      }
    }
  }
  return { lines, order };
}

async function buildIcons(lines: Map<string, LineSystem>, order: string[], selectDate: string) {
  let done = 0;
  for (const code of order) {
    const body = await get<{ hensei_list?: HenseiEntry[] }>("get_hensei_name_list", {
      rosen_code: code,
      select_date: selectDate,
    });
    const icons: Record<string, string> = {};
    for (const entry of body.hensei_list ?? []) {
      if (entry.is_display === false) continue;
      const key = `${entry.formation ?? ""}${entry.sharyo ?? ""}`.trim();
      if (!key || !entry.icon_path || key in icons) continue;
      const path = entry.icon_path.startsWith("/") ? entry.icon_path : `/${entry.icon_path}`;
      icons[key] = encodePath(`${IMG}${path}`);
    }
    lines.get(code)!.icons = icons;
    if (++done % 40 === 0) console.log(`  …icons ${done}/${order.length}`);
    await Bun.sleep(GAP_MS);
  }
}

async function buildStations(codes: string[], selectDate: string) {
  const stations = new Map<string, string[]>();
  const failed: string[] = [];
  let done = 0;

  for (const code of codes) {
    let body: { station_list?: string[] };
    try {
      body = await get<{ station_list?: string[] }>("get_station_list", {
        rosen_code: code,
        select_date: selectDate,
      });
    } catch (error) {
      failed.push(code);
      console.log(`  !! ${code}: ${error}`);
      continue;
    }
    for (const raw of body.station_list ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const bucket = stations.get(name) ?? [];
      if (!bucket.includes(code)) bucket.push(code);
      stations.set(name, bucket);
    }
    if (++done % 40 === 0) console.log(`  …stations ${done}/${codes.length}`);
    await Bun.sleep(GAP_MS);
  }
  return { stations, failed };
}

function write(path: string, value: unknown) {
  return Bun.write(path, JSON.stringify(value, null, 2));
}

const only = process.argv[2];
if (only && only !== "icons" && only !== "stations") {
  console.error("usage: bun run scripts/regen-train-data.ts [icons|stations]");
  process.exit(1);
}

const selectDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

console.log(`select_date=${selectDate}`);
const { lines, order } = await fetchCatalogue();
console.log(`catalogue: ${order.length} lines`);
const sortedCodes = [...order].sort(byCodePoint);

if (only !== "stations") {
  await buildIcons(lines, order, selectDate);
  const line_systems: Record<string, LineSystem> = {};
  for (const code of sortedCodes) line_systems[code] = lines.get(code)!;
  const unique = new Set(Object.values(line_systems).flatMap((s) => Object.values(s.icons)));
  await write(ICONS_OUT, {
    source: "https://www.elesite-next.com/ (えれサイト４)",
    roster_date: selectDate,
    base_url: IMG,
    url_pattern: "/rosen_icon/<rosen_code>/<file>",
    icon_count: unique.size,
    line_systems,
  });
  const entries = Object.values(line_systems).reduce((n, s) => n + Object.keys(s.icons).length, 0);
  console.log(
    `${ICONS_OUT}: ${sortedCodes.length} lines, ${entries} icon keys, ${unique.size} unique urls`,
  );
}

if (only !== "icons") {
  if (!only) {
    console.log(`cooling down ${COOLDOWN_MS / 1000}s before the station pass`);
    await Bun.sleep(COOLDOWN_MS);
  }
  const { stations, failed } = await buildStations(sortedCodes, selectDate);
  const sortedStations: Record<string, string[]> = {};
  for (const name of [...stations.keys()].sort(byCodePoint))
    sortedStations[name] = stations.get(name)!;
  await write(STATIONS_OUT, {
    source: "elesite get_station_list per rosen_code",
    generated: selectDate,
    line_count: sortedCodes.length,
    station_count: stations.size,
    failed,
    stations: sortedStations,
  });
  console.log(`${STATIONS_OUT}: ${stations.size} stations, failed=${JSON.stringify(failed)}`);
}
