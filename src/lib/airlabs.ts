import { env } from "@/lib/env";

const API = "https://airlabs.co/api/v9";
const LOGO_BASE = "https://qkyxmtrnsndaujcyxzfg.supabase.co/functions/v1/airline-logo";

export interface AirlabsFlight {
  flight_iata?: string;
  flight_icao?: string;
  flight_number?: string;
  airline_iata?: string;
  airline_icao?: string;
  dep_iata?: string;
  dep_icao?: string;
  dep_name?: string;
  dep_city?: string;
  dep_gate?: string;
  dep_terminal?: string;
  dep_time?: string;
  dep_time_utc?: string;
  dep_estimated?: string;
  arr_iata?: string;
  arr_icao?: string;
  arr_name?: string;
  arr_city?: string;
  arr_gate?: string;
  arr_terminal?: string;
  arr_time?: string;
  arr_time_utc?: string;
  arr_estimated?: string;
  status?: string;
  duration?: number;
  lat?: number;
  lng?: number;
  alt?: number;
  dir?: number;
  speed?: number;
  reg_number?: string;
  hex?: string;
  aircraft_icao?: string;
  model?: string;
  manufacturer?: string;
  built?: number;
  age?: number;
  [key: string]: unknown;
}

export interface AirlabsFleet {
  hex?: string;
  reg_number?: string;
  msn?: string;
  airline_iata?: string;
  airline_icao?: string;
  icao?: string;
  iata?: string;
  model?: string;
  manufacturer?: string;
  type?: string;
  engine?: string;
  engine_count?: string | number;
  built?: number;
  age?: number;
  lat?: number;
  lng?: number;
  alt?: number;
  dir?: number;
  speed?: number;
  [key: string]: unknown;
}

export interface AirlabsLive {
  hex?: string;
  reg_number?: string;
  flight_iata?: string;
  flight_icao?: string;
  flight_number?: string;
  airline_iata?: string;
  airline_icao?: string;
  dep_iata?: string;
  arr_iata?: string;
  status?: string;
  lat?: number;
  lng?: number;
  alt?: number;
  dir?: number;
  speed?: number;
  aircraft_icao?: string;
  [key: string]: unknown;
}

async function airlabsGet<T>(path: string, params: Record<string, string>): Promise<T | null> {
  try {
    const query = new URLSearchParams({ ...params, api_key: env.AIRLABS_API_KEY });
    const res = await fetch(`${API}/${path}?${query.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: T; error?: unknown };
    if (data.error || data.response === undefined) return null;
    return data.response;
  } catch {
    return null;
  }
}

export async function fetchAirlabsFlight(flightIcao: string): Promise<AirlabsFlight | null> {
  return airlabsGet<AirlabsFlight>("flight", { flight_icao: flightIcao });
}

export async function fetchFleet(reg: string): Promise<AirlabsFleet | null> {
  const list = await airlabsGet<AirlabsFleet[]>("fleets", { reg_number: reg });
  return list?.[0] ?? null;
}

export async function fetchLiveByReg(reg: string): Promise<AirlabsLive | null> {
  const list = await airlabsGet<AirlabsLive[]>("flights", { reg_number: reg });
  return list?.[0] ?? null;
}

export function airlineLogoUrl(icao: string): string {
  return `${LOGO_BASE}?icao=${encodeURIComponent(icao)}&format=png`;
}

const logoCache = new Map<string, Buffer | null>();

export async function fetchAirlineLogo(icao: string | null | undefined): Promise<Buffer | null> {
  if (!icao) return null;
  const key = icao.toUpperCase();
  const cached = logoCache.get(key);
  if (cached !== undefined) return cached;

  let result: Buffer | null = null;
  try {
    const res = await fetch(airlineLogoUrl(key));
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.startsWith("image/") && !type.includes("svg")) {
      result = Buffer.from(await res.arrayBuffer());
    }
  } catch {
    result = null;
  }

  logoCache.set(key, result);
  return result;
}
