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

export interface ElesiteStationTimetableEntry {
  retsuban: string;
  retsuban_id: number;
  shubetsu: string;
  ikisaki: string;
  train_time: string;
  train_type?: string;
  bansen?: string;
  icon_path_list?: string[];
  sharyo?: string;
  [key: string]: unknown;
}

export interface ElesiteStationTimetable {
  nobori_timetable?: ElesiteStationTimetableEntry[];
  kudari_timetable?: ElesiteStationTimetableEntry[];
  direction_info?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ElesiteUnyouLeg {
  retsuban_id: number;
  retsuban?: string | null;
  shubetsu?: string | null;
  start_st?: string | null;
  ikisaki?: string | null;
  end_st?: string | null;
  start_time?: number | null;
  end_time?: number | null;
  [key: string]: unknown;
}

export interface ElesiteCrossEntry {
  info?: Array<{
    retsuban?: string;
    shubetsu?: string;
    ikisaki?: string;
    is_same_direction?: boolean;
    train?: { sharyo?: string; iconPaths?: string[] };
    [key: string]: unknown;
  }>;
  cross_points?: {
    cross_time1?: string;
    cross_time2?: string;
    station_1?: string;
    station_2?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ElesiteCarEntry {
  shaban?: string;
  motor_type?: string;
  left_panta_type?: string;
  right_panta_type?: string;
  controller?: string;
  bikou?: string;
  [key: string]: unknown;
}

export interface ElesiteHenseiTable {
  hensei_table?: Array<{ sharyo?: string; shaban_list?: ElesiteCarEntry[] }>;
  formation?: string;
  [key: string]: unknown;
}

export interface ElesiteMapTrack {
  track_id?: number;
  name?: string;
  direction?: ElesiteDirection;
  points?: Array<[number, number]>;
}

export interface ElesiteMapGeometry {
  routes?: Record<string, { tracks?: ElesiteMapTrack[] }>;
  [key: string]: unknown;
}

export interface ElesiteMapTrain {
  retsuban?: string;
  shubetsu?: string;
  ikisaki?: string;
  direction?: ElesiteDirection;
  color?: string;
  lat?: number;
  lng?: number;
  at_station?: boolean;
  [key: string]: unknown;
}

export interface ElesiteHenseiName {
  formation?: string;
  sharyo?: string;
  is_formation?: boolean;
  icon_path?: string;
  [key: string]: unknown;
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
  index: number;
  status: number;
  info?: string;
  reason?: string;
  detail?: string | null;
  direction?: string;
  color?: string;
  user_name?: string;
  toukou_time?: string;
  incident_time?: string | null;
  [key: string]: unknown;
}

export interface ElesiteRailwayInfo {
  railway_info_list?: ElesiteRailwayInfoEntry[];
  [key: string]: unknown;
}

export const RAILWAY_STATUS_NORMAL = 0;

export function sortRailwayInfo(info: ElesiteRailwayInfo | null): ElesiteRailwayInfoEntry[] {
  const list = info?.railway_info_list ?? [];
  return [...list].sort((a, b) => Number(b.index ?? 0) - Number(a.index ?? 0));
}

export function latestRailwayInfo(info: ElesiteRailwayInfo | null): ElesiteRailwayInfoEntry | null {
  return sortRailwayInfo(info)[0] ?? null;
}

export interface ElesiteSlimTrain {
  id: number;
  retsuban: string;
  shubetsu: string;
  ikisaki: string;
  direction: ElesiteDirection;
  start: number;
  end: number;
  sharyo: string;
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
      sharyo: String(train.sharyo ?? ""),
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
  return `elesite:v2:diagram:slim:${rosenCode}:${dayId}:${selectDate}`;
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

export async function getStationTimetable(
  rosenCode: string,
  station: string,
  hour: number,
  dayId: number,
  selectDate: string,
): Promise<ElesiteStationTimetable | null> {
  return cached(
    `elesite:v1:sttt:${rosenCode}:${dayId}:${selectDate}:${station}:${hour}`,
    dayScoped(TTL_RETSUBAN),
    () =>
      elesiteGet<ElesiteStationTimetable>("get_st_timetable", {
        rosen_code: rosenCode,
        station,
        select_hour: hour,
        day_id: dayId,
        select_date: selectDate,
      }),
    { negativeTtlSeconds: 60 },
  );
}

export async function getDailyUnyou(
  retsubanId: number,
  selectDate: string,
): Promise<ElesiteUnyouLeg[] | null> {
  return cached(
    `elesite:v1:unyou:${retsubanId}:${selectDate}`,
    dayScoped(TTL_RETSUBAN),
    async () => {
      const body = await elesiteGet<Array<{ unyou_list?: ElesiteUnyouLeg[] }>>(
        "get_daily_unyou_by_retsuban_id",
        { retsuban_id: retsubanId, select_date: selectDate },
      );
      if (body === undefined) return undefined;
      if (!Array.isArray(body)) return null;
      return body.flatMap((group) => group.unyou_list ?? []);
    },
    { negativeTtlSeconds: 60 },
  );
}

export async function getTrainCross(
  rosenCode: string,
  retsubanId: number,
  dayId: number,
  selectDate: string,
): Promise<ElesiteCrossEntry[] | null> {
  return cached(
    `elesite:v1:cross:${rosenCode}:${retsubanId}:${dayId}:${selectDate}`,
    dayScoped(TTL_RETSUBAN),
    async () => {
      const body = await elesiteGet<{ code?: number; data?: ElesiteCrossEntry[] }>(
        "get_train_cross",
        {
          rosen_code: rosenCode,
          retsuban_id: retsubanId,
          day_id: dayId,
          select_date: selectDate,
        },
      );
      if (body === undefined) return undefined;
      return body?.data ?? null;
    },
    { negativeTtlSeconds: 60 },
  );
}

export async function getHenseiTable(
  rosenCode: string,
  formation: string,
): Promise<ElesiteHenseiTable | null> {
  return cached(
    `elesite:v1:hensei:${rosenCode}:${formation}`,
    TTL_DIA_PATTERN,
    () =>
      elesiteGet<ElesiteHenseiTable>("get_hensei_table", {
        rosen_code: rosenCode,
        formation,
        active_only: false,
      }),
    { negativeTtlSeconds: 60 },
  );
}

export async function getFormationList(rosenCode: string): Promise<string[] | null> {
  return cached(
    `elesite:v1:formations:${rosenCode}`,
    TTL_DIA_PATTERN,
    async () => {
      const body = await elesiteGet<{ formation_list?: string[] }>("get_formation_list", {
        rosen_code: rosenCode,
      });
      if (body === undefined) return undefined;
      return body?.formation_list ?? null;
    },
    { negativeTtlSeconds: 60 },
  );
}

export async function getHenseiNameList(
  rosenCode: string,
  selectDate: string,
): Promise<ElesiteHenseiName[] | null> {
  return cached(
    `elesite:v1:henseinames:${rosenCode}:${selectDate}`,
    dayScoped(TTL_DIA_PATTERN),
    async () => {
      const body = await elesiteGet<{ hensei_list?: ElesiteHenseiName[] }>("get_hensei_name_list", {
        rosen_code: rosenCode,
        select_date: selectDate,
      });
      if (body === undefined) return undefined;
      return body?.hensei_list ?? null;
    },
    { negativeTtlSeconds: 60 },
  );
}

const MAX_TRACK_POINTS = 400;

function downsample(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length <= MAX_TRACK_POINTS) return points;
  const step = Math.ceil(points.length / MAX_TRACK_POINTS);
  const out = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

export async function getMapGeometry(
  rosenCode: string,
  selectDate: string,
): Promise<ElesiteMapTrack[] | null> {
  return cached(
    `elesite:v1:geom:${rosenCode}`,
    TTL_DIA_PATTERN,
    async () => {
      const body = await elesiteGet<ElesiteMapGeometry>("get_map_geometry", {
        rosen_code: rosenCode,
        select_date: selectDate,
      });
      if (body === undefined) return undefined;
      const tracks = Object.values(body?.routes ?? {}).flatMap((route) => route.tracks ?? []);
      const usable = tracks
        .filter((track) => Array.isArray(track.points) && track.points.length > 1)
        .map((track) => ({ ...track, points: downsample(track.points ?? []) }));
      return usable.length > 0 ? usable : null;
    },
    { negativeTtlSeconds: 300 },
  );
}

export async function getMapTrainPositions(
  rosenCode: string,
  dayId: number,
  now: Date = new Date(),
): Promise<ElesiteMapTrain[] | null> {
  const day = getOperationalDay(now);
  return cached(
    `elesite:v1:posmap:${rosenCode}:${dayId}:${day.selectDate}:${day.currentTime}`,
    TTL_POSITION,
    async () => {
      const body = await elesiteGet<{ trains?: ElesiteMapTrain[] }>("get_train_position_map", {
        rosen_code: rosenCode,
        minute: day.currentTime,
        day_id: dayId,
        select_date: day.selectDate,
      });
      if (body === undefined) return undefined;
      return body?.trains ?? null;
    },
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
