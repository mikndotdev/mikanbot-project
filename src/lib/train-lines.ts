import trainIcons from "@/train_icons.json";

const IMG_BASE = "https://img.elesite-next.com";
export const PLACEHOLDER_ICON = `${IMG_BASE}/hatena.png`;

interface RawLineSystem {
  line_names: string[];
  operators: string[];
  regions: string[];
  day_id: number;
  vehicles: number;
  icon_count: number;
  icons: string[];
}

interface RawTrainIcons {
  line_systems: Record<string, RawLineSystem>;
  company_index: Record<string, string[]>;
}

const data = trainIcons as unknown as RawTrainIcons;

export interface LineSystem {
  rosenCode: string;
  lineNames: string[];
  operators: string[];
  regions: string[];
  label: string;
  haystack: string;
  iconsByName: Map<string, string>;
}

const FEATURED: string[] = [
  "jr_tokaido_shin",
  "jr_tohoku_shin",
  "jr_sanyo_shin",
  "jr_yamanote_keihin",
  "jr_chuo_tokyo",
  "jr_tokaido_kanto",
  "jr_saikyo",
  "jr_joban_tokyo",
  "jr_sobu_yokosuka",
  "jr_keyo",
  "osaka_loop",
  "jr_west_tokaido",
  "tokyu_toyoko",
  "odakyu_odawara",
  "keio_hon",
  "seibu_ikebukuro",
  "tobu_tojo",
  "tokyo_metro_ginza",
  "tokyo_metro_tozai",
  "hankyu_kb",
  "hanshin_hon",
  "kintetsu_nara",
  "keihan_hon",
  "nankai_hon",
  "meitetsu",
];

const MAX_LABEL_NAMES = 3;
const MAX_LABEL_OPERATORS = 2;

function buildLabel(names: string[], operators: string[]): string {
  const head = names.slice(0, MAX_LABEL_NAMES).join("・");
  const rest = names.length > MAX_LABEL_NAMES ? ` ほか${names.length - MAX_LABEL_NAMES}路線` : "";
  if (operators.length === 0) return `${head}${rest}`;
  const shown = operators.slice(0, MAX_LABEL_OPERATORS).join("/");
  const more = operators.length > MAX_LABEL_OPERATORS ? "ほか" : "";
  return `${head}${rest}（${shown}${more}）`;
}

function iconKey(fileName: string): string {
  const withoutExt = fileName.replace(/\.(png|webp)$/i, "");
  return withoutExt.replace(/_\d{14}$/, "");
}

function buildIconIndex(system: RawLineSystem): Map<string, string> {
  const map = new Map<string, string>();
  for (const url of system.icons) {
    const fileName = url.slice(url.lastIndexOf("/") + 1);
    const key = iconKey(decodeURIComponent(fileName));
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || (existing.endsWith(".png") && url.endsWith(".webp"))) {
      map.set(key, url);
    }
  }
  return map;
}

export const lineSystems: Map<string, LineSystem> = new Map(
  Object.entries(data.line_systems).map(([rosenCode, system]) => [
    rosenCode,
    {
      rosenCode,
      lineNames: system.line_names,
      operators: system.operators,
      regions: system.regions,
      label: buildLabel(system.line_names, system.operators),
      haystack: [rosenCode, ...system.line_names, ...system.operators, ...system.regions]
        .join(" ")
        .toLowerCase(),
      iconsByName: buildIconIndex(system),
    },
  ]),
);

export function isKnownLine(rosenCode: string | undefined | null): rosenCode is string {
  return typeof rosenCode === "string" && lineSystems.has(rosenCode);
}

export function getLine(rosenCode: string): LineSystem | undefined {
  return lineSystems.get(rosenCode);
}

export function lineLabel(rosenCode: string): string {
  return lineSystems.get(rosenCode)?.label ?? rosenCode;
}

export interface LineChoice {
  name: string;
  value: string;
}

export function searchLines(query: string, limit = 25): LineChoice[] {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    const featured: LineChoice[] = [];
    for (const code of FEATURED) {
      const system = lineSystems.get(code);
      if (system) featured.push({ name: system.label, value: system.rosenCode });
      if (featured.length >= limit) break;
    }
    return featured;
  }

  const starts: LineChoice[] = [];
  const contains: LineChoice[] = [];
  for (const system of lineSystems.values()) {
    if (system.haystack.indexOf(trimmed) < 0) continue;

    const matched = system.lineNames.filter((n) => n.toLowerCase().includes(trimmed));
    const ordered = matched.length
      ? [...matched, ...system.lineNames.filter((n) => !matched.includes(n))]
      : system.lineNames;
    const choice = {
      name: buildLabel(ordered, system.operators),
      value: system.rosenCode,
    };

    const leads =
      system.rosenCode.startsWith(trimmed) ||
      matched.some((n) => n.toLowerCase().startsWith(trimmed)) ||
      system.operators.some((o) => o.toLowerCase().startsWith(trimmed));
    if (leads) starts.push(choice);
    else contains.push(choice);
  }
  return [...starts, ...contains].slice(0, limit);
}

export function iconUrlFromPath(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;
  const path = iconPath.startsWith("/") ? iconPath : `/${iconPath}`;
  return encodeURI(`${IMG_BASE}${path}`);
}

export function lookupIconByFormation(
  rosenCode: string,
  formation: string | null | undefined,
  hensei: string | null | undefined,
): string | null {
  if (!formation && !hensei) return null;
  const system = lineSystems.get(rosenCode);
  if (!system) return null;
  const key = `${formation ?? ""}${hensei ?? ""}`;
  const direct = system.iconsByName.get(key);
  if (direct) return direct;
  for (const [name, url] of system.iconsByName) {
    if (name === key) return url;
  }
  return null;
}

export function stripRouteTag(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/#[^#\s]*$/, "").trim() || value;
}
