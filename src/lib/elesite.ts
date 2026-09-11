import * as Sentry from "@sentry/bun";
import { cached } from "@/lib/redis";
import { getOperationalDay, secondsUntilOperationalDayEnd } from "@/lib/jst";

const API = "https://www.elesite-next.com/fastapi";
const TIMEOUT_MS = 6000;

const TTL_DIA_PATTERN = 12 * 60 * 60;
const TTL_DIAGRAM = 60 * 60;
const TTL_RETSUBAN = 600;
const TTL_POSITION = 10;
const TTL_RAILWAY_INFO = 10;

type ElesiteResult<T> = T | null | undefined;
type QueryParams = Record<string, string | number | boolean | undefined>;

function dayScoped(ttl: number): number {
  return Math.min(ttl, secondsUntilOperationalDayEnd());
}

async function elesiteGet<T>(path: string, params: QueryParams): Promise<ElesiteResult<T>> {
  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const res = await fetch(`${API}/${path}?${query.toString()}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      Sentry.logger.warn("elesite request failed", { path, status: res.status });
      return undefined;
    }
    const body = await res.text();
    if (!body) return null;
    return JSON.parse(body) as T | null;
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "elesite" }, extra: { path } });
    return undefined;
  }
}

export type ElesiteDirection = "nobori" | "kudari";

export interface ElesiteDayPattern {
  day_id: number;
  name: string;
}

export interface ElesiteTrain {
  retsuban_id: number;
  retsuban: string;
  shubetsu: string;
  ikisaki: string;
  direction: ElesiteDirection;
  start_time: number;
  end_time: number;
  icon_path?: string | null;
  [key: string]: unknown;
}

export interface ElesiteDiagram {
  stations?: unknown[];
  trains?: ElesiteTrain[];
  rosen_meta?: { c_left?: string; c_right?: string; is_kiten_left?: boolean };
  [key: string]: unknown;
}

export interface ElesiteTimetableEntry {
  station: string;
  arr_time?: string | null;
  dep_time?: string | null;
  train_type?: string;
  bansen?: string | null;
  [key: string]: unknown;
}

export interface ElesiteTimetableGroup {
  retsuban?: string;
  shubetsu?: string;
  timetable?: ElesiteTimetableEntry[];
  [key: string]: unknown;
}

export interface ElesiteRetsubanTime {
  code?: number;
  retsuban_id: number;
  retsuban: string;
  shubetsu: string;
  ikisaki: string;
  direction: ElesiteDirection;
  is_running_today?: boolean;
  operating_days?: number[];
  timetable_list?: ElesiteTimetableGroup[];
  icon_path_list?: string[];
  hensei_list?: string[];
  formation_list?: string[];
  text_color?: string;
  background_color?: string;
  [key: string]: unknown;
}

export interface ElesiteTrainPosition {
  retsuban_id: number;
  retsuban: string;
  shubetsu: string;
  ikisaki: string;
  direction: ElesiteDirection;
  sharyo_icon_path_list?: string[];
  sharyo_list?: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

export interface ElesitePositions {
  station_list?: string[];
  train_position?: ElesiteTrainPosition[];
  rosen_color?: string;
  is_kiten_left?: boolean;
  [key: string]: unknown;
}

export interface ElesiteRailwayInfoEntry {
  [key: string]: unknown;
}

export interface ElesiteRailwayInfo {
  railway_info_list?: ElesiteRailwayInfoEntry[];
  [key: string]: unknown;
}

export interface ElesiteSlimTrain {
  id: number;
  retsuban: string;
  shubetsu: string;
  ikisaki: string;
  direction: ElesiteDirection;
  start: number;
  end: number;
}

export interface ElesiteSlimDiagram {
  rosenCode: string;
  dayId: number;
  selectDate: string;
  trains: ElesiteSlimTrain[];
}

function slimDiagram(
  full: ElesiteDiagram,
  rosenCode: string,
  dayId: number,
  selectDate: string,
): ElesiteSlimDiagram {
  const trains = Array.isArray(full.trains) ? full.trains : [];
  return {
    rosenCode,
    dayId,
    selectDate,
    trains: trains.map((train) => ({
      id: Number(train.retsuban_id),
      retsuban: String(train.retsuban ?? ""),
      shubetsu: String(train.shubetsu ?? ""),
      ikisaki: String(train.ikisaki ?? ""),
      direction: train.direction,
      start: Number(train.start_time ?? 0),
      end: Number(train.end_time ?? 0),
    })),
  };
}

export async function getDayPattern(
  rosenCode: string,
  selectDate: string,
): Promise<ElesiteDayPattern | null> {
  return cached(
    `elesite:v1:dia:${rosenCode}:${selectDate}`,
    dayScoped(TTL_DIA_PATTERN),
    () =>
      elesiteGet<ElesiteDayPattern>("get_today_dia_pattern", {
        rosen_code: rosenCode,
        select_date: selectDate,
      }),
    { negativeTtlSeconds: 60 },
  );
}

export function slimDiagramKey(rosenCode: string, dayId: number, selectDate: string): string {
  return `elesite:v1:diagram:slim:${rosenCode}:${dayId}:${selectDate}`;
}

export async function getSlimDiagram(
  rosenCode: string,
  dayId: number,
  selectDate: string,
): Promise<ElesiteSlimDiagram | null> {
  return cached(
    slimDiagramKey(rosenCode, dayId, selectDate),
    dayScoped(TTL_DIAGRAM),
    async () => {
      const full = await elesiteGet<ElesiteDiagram>("get_diagram_data", {
        rosen_code: rosenCode,
        day_id: dayId,
        select_date: selectDate,
        hour_from: 4,
        hour_to: 28,
      });
      if (full === undefined) return undefined;
      if (full === null || !Array.isArray(full.trains)) return null;
      return slimDiagram(full, rosenCode, dayId, selectDate);
    },
    { negativeTtlSeconds: 30 },
  );
}

export async function getRetsubanTimeById(
  retsubanId: number,
  selectDate: string,
): Promise<ElesiteRetsubanTime | null> {
  return cached(
    `elesite:v1:retsuban:${retsubanId}:${selectDate}`,
    dayScoped(TTL_RETSUBAN),
    () =>
      elesiteGet<ElesiteRetsubanTime>("get_retsuban_time_by_id", {
        retsuban_id: retsubanId,
        select_date: selectDate,
      }),
    { negativeTtlSeconds: 60 },
  );
}

export async function getTrainPositions(
  rosenCode: string,
  dayId: number,
  now: Date = new Date(),
): Promise<ElesitePositions | null> {
  const day = getOperationalDay(now);
  return cached(
    `elesite:v1:pos:${rosenCode}:${dayId}:${day.selectDate}:${day.currentTime}`,
    TTL_POSITION,
    () =>
      elesiteGet<ElesitePositions>("get_train_position", {
        rosen_code: rosenCode,
        current_time: day.currentTime,
        day_id: dayId,
        select_date: day.selectDate,
        second: 0,
        show_signal_stations: false,
      }),
  );
}

export async function getRailwayInfo(
  rosenCode: string,
  selectDate: string,
): Promise<ElesiteRailwayInfo | null> {
  return cached(`elesite:v1:rwinfo:${rosenCode}:${selectDate}`, TTL_RAILWAY_INFO, () =>
    elesiteGet<ElesiteRailwayInfo>("get_railwayInfo", {
      rosen_code: rosenCode,
      select_date: selectDate,
    }),
  );
}

export async function resolveOperationalContext(
  rosenCode: string,
  now: Date = new Date(),
): Promise<{ dayId: number; selectDate: string; currentTime: string } | null> {
  const day = getOperationalDay(now);
  const pattern = await getDayPattern(rosenCode, day.selectDate);
  if (!pattern || typeof pattern.day_id !== "number") return null;
  return { dayId: pattern.day_id, selectDate: day.selectDate, currentTime: day.currentTime };
}
